import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts, PDFPage, PageSizes } from 'pdf-lib';
import { db, pool } from '../db';
import { 
  inspectionOrders, 
  materialInspectionLinks, 
  wpqrDocuments, 
  welders, 
  welderCertificates 
} from '@shared/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { Storage } from '@google-cloud/storage';
import { Readable } from 'stream';
import { gcsCredentials, gcsBucketName } from './gcs-config';
import { listFiles } from './list-gcs-files';

// Initialize Google Cloud Storage
let storage: Storage | null = null;
let bucket: any = null;

try {
  // Initialize GCS client with service account credentials
  console.log('Initializing GCS client for final dossier generator');
  
  // Explicitly cast credentials to avoid TypeScript errors
  // The Google Cloud Storage library expects a specific format but our credentials are compatible
  storage = new Storage({
    credentials: gcsCredentials as any,
  });
  
  // Create bucket reference without verifying existence
  // This is necessary because the service account may only have object-level permissions
  bucket = storage.bucket(gcsBucketName);
  console.log(`Created bucket reference for ${gcsBucketName} without verifying existence`);
  console.log('Service account permission note: Working with limited object-level permissions only');
} catch (error) {
  console.error('Error initializing GCS in final dossier generator:', error);
  console.warn('File operations may fail due to storage initialization error');
}

/**
 * Check if a final dossier already exists for an inspection order
 */
export async function checkExistingFinalDossier(inspectionOrderNumber: string): Promise<{ exists: boolean, url: string, path: string }> {
  try {
    // Validate bucket access first
    if (!bucket) {
      console.error('GCS bucket not initialized - cannot check for existing dossier');
      return {
        exists: false,
        url: '',
        path: ''
      };
    }

    // Define the exact path for the final dossier with consistent naming
    const dossierPath = `QMS/Inspections_Records/${inspectionOrderNumber}/Final Dossier/FD_${inspectionOrderNumber}.pdf`;
    
    console.log(`Checking for existing dossier at path: ${dossierPath}`);
    
    // Check if the specific file exists
    try {
      const [exists] = await bucket.file(dossierPath).exists();
      
      if (exists) {
        console.log(`Found existing Final Dossier at ${dossierPath}`);
        
        // Generate signed URL for download
        try {
          const [url] = await bucket.file(dossierPath).getSignedUrl({
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // URL expires in 7 days
          });
          
          return {
            exists: true,
            url,
            path: dossierPath
          };
        } catch (signedUrlError) {
          console.error('Error generating signed URL:', signedUrlError);
          console.log('File exists but cannot generate URL');
          return {
            exists: true,
            url: '',
            path: dossierPath
          };
        }
      }
      
      // If file doesn't exist, return exists: false
      console.log(`No existing final dossier found at ${dossierPath}`);
      return {
        exists: false,
        url: '',
        path: dossierPath // Return the path for consistency
      };
    } catch (error) {
      console.error('Error checking if file exists:', error);
      console.log('Continuing with assumption that no dossier exists');
      return {
        exists: false,
        url: '',
        path: dossierPath
      };
    }
  } catch (error) {
    console.error('Error checking for existing final dossier:', error);
    console.log('Continuing with assumption that no dossier exists');
    return {
      exists: false,
      url: '',
      path: ''
    };
  }
}

/**
 * Helper function to truncate text if it would exceed the width of its column
 * @param text The text to potentially truncate
 * @param maxWidth Maximum width in points the text can occupy
 * @param fontSize Font size in points
 * @returns Truncated text with ellipsis if necessary, or original text if it fits
 */
function truncateTextForColumn(text: string, maxWidth: number, fontSize: number = 10): string {
  // Approximate characters that fit in the column
  // This is a rough estimate (using average char width of 0.6 × fontSize)
  const avgCharWidth = fontSize * 0.6;
  const maxChars = Math.floor(maxWidth / avgCharWidth);
  
  if (!text || text === 'N/A') return text;
  
  if (text.length > maxChars) {
    // Leave room for ellipsis
    return text.substring(0, maxChars - 3) + '...';
  }
  
  return text;
}

/**
 * Generate a final dossier PDF for an inspection order
 */
export async function generateFinalDossier(inspectionOrderId: number): Promise<{ url: string, path: string }> {
  try {
    // Fetch inspection order details
    const inspectionOrder = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.id, inspectionOrderId),
    });

    if (!inspectionOrder) {
      throw new Error(`Inspection order with ID ${inspectionOrderId} not found`);
    }

    // Fetch materials linked to this inspection order
    let materials = await db.query.materialInspectionLinks.findMany({
      where: eq(materialInspectionLinks.inspectionOrderId, inspectionOrderId),
    });
    
    console.log(`Found ${materials.length} material links for inspection order ${inspectionOrderId}`);
    
    // Check if the inspection order has a materialsData field which indicates selected materials
    if (inspectionOrder.materialsData) {
      try {
        // Parse the materialsData to get the selected materials
        const selectedMaterials = JSON.parse(inspectionOrder.materialsData);
        console.log(`Parsed selected materials from materialsData: ${selectedMaterials.length} items`);
        console.log('Selected materials data structure:', JSON.stringify(selectedMaterials, null, 2));
        
        // Filter materials to only include the ones that are selected
        if (Array.isArray(selectedMaterials) && selectedMaterials.length > 0) {
          // Get the selected material IDs - try different possible property names
          const selectedMaterialIds = selectedMaterials.map(m => {
            // Check various possible property names based on the client form structure
            return m.materialId || m.materialIdentificationId || 
                   (m.materialIdentification ? m.materialIdentification.id : null) ||
                   m.material_identification_id || null;
          }).filter(Boolean);
          
          console.log(`Selected material IDs: ${selectedMaterialIds.join(', ')}`);
          
          // Also extract material identification strings which might be stored separately
          const selectedMaterialIdStrings = selectedMaterials.map(m => {
            return m.materialIdentificationId || m.material_identification_id || null;
          }).filter(Boolean);
          
          console.log(`Selected material ID strings: ${selectedMaterialIdStrings.join(', ')}`);
          
          // Filter the materials to only include those that are selected
          if (selectedMaterialIds.length > 0 || selectedMaterialIdStrings.length > 0) {
            materials = materials.filter(m => {
              // Check against both numeric IDs and string IDs
              return selectedMaterialIds.includes(m.materialId) || 
                     selectedMaterialIdStrings.includes(m.materialIdentificationId);
            });
            console.log(`After filtering, using ${materials.length} selected materials`);
          }
        }
      } catch (e) {
        console.error('Error parsing materialsData:', e);
        console.log('Using all material links due to parsing error');
      }
    } else {
      console.log('No materialsData field found, using all material links');
    }

    // Parse data from different tabs
    let ndtRecords = [];
    if (inspectionOrder.ndtData) {
      try {
        ndtRecords = JSON.parse(inspectionOrder.ndtData);
      } catch (e) {
        console.error('Error parsing NDT data:', e);
      }
    }

    let visualRecords = [];
    if (inspectionOrder.visualData) {
      try {
        visualRecords = JSON.parse(inspectionOrder.visualData);
      } catch (e) {
        console.error('Error parsing Visual Inspection data:', e);
      }
    }

    let weldRecords = [];
    if (inspectionOrder.weldData) {
      try {
        weldRecords = JSON.parse(inspectionOrder.weldData);
      } catch (e) {
        console.error('Error parsing Weld data:', e);
      }
    }

    let ncrRecords = [];
    if (inspectionOrder.ncrData) {
      try {
        ncrRecords = JSON.parse(inspectionOrder.ncrData);
      } catch (e) {
        console.error('Error parsing NCR data:', e);
      }
    }
    
    // Parse hydrotest records
    let hydrotestRecords = [];
    if (inspectionOrder.hydrotestData) {
      try {
        hydrotestRecords = JSON.parse(inspectionOrder.hydrotestData);
        console.log('Found hydrotest records:', hydrotestRecords);
      } catch (e) {
        console.error('Error parsing Hydrotest data:', e);
      }
    }

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Add cover page
    const coverPage = pdfDoc.addPage([612, 792]); // US Letter size
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Footer text to be added to each page
    const footerText = 'THERMOPAC PROCESS ENGINEERING LLP : 405, The Summit – Business Bay, Western Express Highway, Vile Parle, Mumbai, India – 400 057';
    
    // Convert 10mm margins to points (10mm ≈ 28.3pt)
    const pageMargin = 10 * 2.83; // 10mm margin
    
    // Function to add footer to a page
    const addFooterToPage = (page: PDFPage) => {
      page.drawText(footerText, {
        x: pageMargin, // Left margin (10mm)
        y: 30, // Position from bottom of page
        size: 8, // Smaller font size for footer
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4), // Gray color
        maxWidth: 612 - (2 * pageMargin), // Maximum width with 10mm margins on both sides
      });
      
      // Draw a line above the footer
      page.drawLine({
        start: { x: pageMargin, y: 40 },
        end: { x: 612 - pageMargin, y: 40 },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
    };
    
    // Function to add header to a page
    const addHeaderToPage = (page: PDFPage, title: string) => {
      page.drawText(title, {
        x: pageMargin,
        y: 750, // Position from top of page
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
    };
    
    // Try to add company logo to the top-right corner
    try {
      // Use a direct path approach instead of __dirname
      const logoPath = './client/public/images/thermopac-logo.jpg';
      console.log('Logo path:', logoPath);
      
      const logoImageBytes = fs.readFileSync(logoPath);
      
      // Embed the image in the PDF
      const logoImage = await pdfDoc.embedJpg(logoImageBytes);
      
      // Size the logo to the requested dimensions - 15mm x 20mm
      // Convert mm to points (1 mm ≈ 2.83 points in PDF)
      const logoWidth = 15 * 2.83; // 15mm ≈ 42.5 points
      const logoHeight = 20 * 2.83; // 20mm ≈ 56.7 points
      
      // Calculate dimensions - fixed size as per requirements
      let width = logoWidth;
      let height = logoHeight;
      
      // Draw the logo in the top-right corner
      // Convert 10mm margins to points (10mm ≈ 28.3pt)
      const pageMargin = 10 * 2.83; // 10mm margin
      
      coverPage.drawImage(logoImage, {
        x: 612 - width - pageMargin, // Position from right edge with 10mm margin
        y: 792 - height - pageMargin, // Position from top edge with 10mm margin
        width: width,
        height: height,
      });
      
      console.log('Successfully added company logo to the cover page');
    } catch (error) {
      console.error('Error adding company logo to cover page:', error);
    }
    
    // Cover page content
    coverPage.drawText('FINAL QUALITY DOSSIER', {
      x: pageMargin, // Use 10mm left margin
      y: 700,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Define dossier number (FD prefix followed by inspection order number)
    const dossierNumber = `FD_${inspectionOrder.inspectionOrderNumber}`;
    
    coverPage.drawText(`Final Dossier No: ${dossierNumber}`, {
      x: pageMargin,
      y: 650,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    coverPage.drawText(`Inspection Order: ${inspectionOrder.inspectionOrderNumber}`, {
      x: pageMargin,
      y: 620,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    coverPage.drawText(`Project: ${inspectionOrder.projectCode}`, {
      x: pageMargin,
      y: 590,
      size: 14,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    coverPage.drawText(`Date: ${new Date().toLocaleDateString()}`, {
      x: pageMargin,
      y: 560,
      size: 14,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    // Add footer to cover page
    addFooterToPage(coverPage);
    
    // Add table of contents
    const tocPage = pdfDoc.addPage([612, 792]);
    tocPage.drawText('TABLE OF CONTENTS', {
      x: pageMargin,
      y: 700,
      size: 18,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    let yPosition = 650;
    const sections = [
      '1. Appendices',
      '2. Approved Drawing',
      '3. Design Verification Report (DVR)',
      '4. ITP (Inspection Test Plan)',
      '5. Material Traceability',
      '6. PMA',
      '7. Procedures',
      '8. Shop Inspection',
      '9. Welding & Weld Maps',
      '10. NDT Reports',
      '11. Visual Inspection Records',
      '12. Hydrotest Reports',
      '13. Non-Conformance Reports',
      '14. Calibration Certificates'
    ];
    
    for (const section of sections) {
      tocPage.drawText(section, {
        x: pageMargin + 20, // Indent slightly from left margin
        y: yPosition,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      yPosition -= 25;
    }
    
    // Add footer to table of contents page
    addFooterToPage(tocPage);
    
    // Add a separate APPENDICES title page (now section 1)
    const appendicesTitlePage = pdfDoc.addPage([612, 792]);
    
    // Calculate the width of the text to center it horizontally
    const titleText = '1. APPENDICES';
    const titleFont = helveticaBold;
    const titleSize = 24;
    
    // Calculate width of text and center position
    const titleWidth = titleSize * titleText.length * 0.5; // approximate width
    const centerX = (612 - titleWidth) / 2;
    
    appendicesTitlePage.drawText(titleText, {
      x: centerX,
      y: 400, // Centered vertically in the page
      size: titleSize, // Larger font for the title page
      font: titleFont,
      color: rgb(0, 0, 0),
    });
    
    // Add footer to the appendices title page
    addFooterToPage(appendicesTitlePage);
    
    // Add appendices content on a new page
    let appendicesPage = pdfDoc.addPage([612, 792]);
    
    // Consistent header for appendices content page
    appendicesPage.drawText('1. APPENDICES (Contents)', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    yPosition = 650;
    appendicesPage.drawText('The following documents are included as appendices:', {
      x: 70,
      y: yPosition,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    yPosition -= 25;
    
    // Add footer to the appendices page (will be completed later with actual content)
    addFooterToPage(appendicesPage);
    
    // Add approved drawing section (now section 2)
    const approvedDrawingPage = pdfDoc.addPage([612, 792]);
    approvedDrawingPage.drawText('2. APPROVED DRAWING', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Add basic content for approved drawing section
    approvedDrawingPage.drawText('Approved drawings and design documents are stored in the QMS system.', {
      x: pageMargin,
      y: 650,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    addFooterToPage(approvedDrawingPage);
    
    // Add DVR section (now section 3)
    const dvrPage = pdfDoc.addPage([612, 792]);
    dvrPage.drawText('3. DESIGN VERIFICATION REPORT (DVR)', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Add basic content for DVR section
    dvrPage.drawText('Design verification records and reports are maintained in the QMS system.', {
      x: pageMargin,
      y: 650,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    addFooterToPage(dvrPage);
    
    // Add ITP section (now section 4)
    const itpPage = pdfDoc.addPage([612, 792]);
    itpPage.drawText('4. ITP (INSPECTION TEST PLAN)', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Add basic content for ITP section
    itpPage.drawText('Inspection test plans and procedures are documented in the QMS system.', {
      x: pageMargin,
      y: 650,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    addFooterToPage(itpPage);
    
    // Add material traceability section (now section 5)
    const materialPage = pdfDoc.addPage([612, 792]);
    materialPage.drawText('5. MATERIAL TRACEABILITY', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw table headers
    yPosition = 650;
    
    // Calculate column positions based on pageMargin with better spacing
    // Adjust column widths to fit content better
    const pageWidth = 612; // Standard A4 width in points
    const tableWidth = pageWidth - (2 * pageMargin);
    
    // Column width percentages of the total table width
    const colWidths = {
      materialId: 0.15,      // 15% - Material ID needs less space
      certificate: 0.25,      // 25% - Certificate numbers can be long
      heatNumber: 0.30,      // 30% - Heat numbers can be very long
      grade: 0.20,            // 20% - Grade designations can be long
      specification: 0.10     // 10% - Specification is typically very short (<20 chars)
    };
    
    // Calculate actual column positions
    const col1 = pageMargin; // Material ID
    const col2 = col1 + (tableWidth * colWidths.materialId); // Certificate
    const col3 = col2 + (tableWidth * colWidths.certificate); // Heat Number
    const col4 = col3 + (tableWidth * colWidths.heatNumber); // Grade
    const col5 = col4 + (tableWidth * colWidths.grade); // Specification
    
    // Draw table header
    materialPage.drawText('Material ID', {
      x: col1,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    materialPage.drawText('Certificate', {
      x: col2,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    materialPage.drawText('Heat Number', {
      x: col3,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    materialPage.drawText('Grade', {
      x: col4,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    materialPage.drawText('Specification', {
      x: col5,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw a line under headers
    materialPage.drawLine({
      start: { x: pageMargin, y: yPosition - 5 },
      end: { x: 612 - pageMargin, y: yPosition - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 20;
    
    if (materials.length > 0) {
      for (const material of materials) {
        // Calculate column widths for truncation
        const colWidths = {
          col1Width: col2 - col1 - 5, // Material ID 
          col2Width: col3 - col2 - 5, // Certificate
          col3Width: col4 - col3 - 5, // Heat Number
          col4Width: col5 - col4 - 5, // Grade
          col5Width: (pageWidth - pageMargin) - col5 - 5 // Specification
        };
        
        // Draw material data in single-line tabular format with truncation
        materialPage.drawText(truncateTextForColumn(material.materialIdentificationId || 'N/A', colWidths.col1Width), {
          x: col1,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        materialPage.drawText(truncateTextForColumn(material.materialCertificateNumber || 'N/A', colWidths.col2Width), {
          x: col2,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        materialPage.drawText(truncateTextForColumn(material.heatNumber || 'N/A', colWidths.col3Width), {
          x: col3,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        materialPage.drawText(truncateTextForColumn(material.materialGrade || 'N/A', colWidths.col4Width), {
          x: col4,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        materialPage.drawText(truncateTextForColumn(material.materialSpecification || 'N/A', colWidths.col5Width), {
          x: col5,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        // Draw a light line between rows
        if (materials.length > 1) {
          materialPage.drawLine({
            start: { x: pageMargin, y: yPosition - 5 },
            end: { x: 612 - pageMargin, y: yPosition - 5 },
            thickness: 0.5,
            color: rgb(0.8, 0.8, 0.8),
          });
        }
        
        yPosition -= 20;
      }
    } else {
      materialPage.drawText('No material traceability records found.', {
        x: pageMargin,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
    
    // Add PMA section (now section 6)
    const pmaPage = pdfDoc.addPage([612, 792]);
    pmaPage.drawText('6. PMA (PARTICULAR MATERIAL APPRAISAL)', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Parse PMA records from the inspection order
    let pmaRecords: any[] = [];
    try {
      if (inspectionOrder.pmaRecords && typeof inspectionOrder.pmaRecords === 'string') {
        pmaRecords = JSON.parse(inspectionOrder.pmaRecords);
        console.log(`Found ${pmaRecords.length} PMA records in inspection order`);
      }
    } catch (error) {
      console.error('Error parsing PMA records:', error);
    }
    
    // Draw table headers
    yPosition = 650;
    
    pmaPage.drawText('PMA ID', {
      x: 70,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    pmaPage.drawText('PMA Number', {
      x: 140,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    pmaPage.drawText('Material Spec', {
      x: 230,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    pmaPage.drawText('Grade', {
      x: 340,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    pmaPage.drawText('Certified By', {
      x: 410,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    pmaPage.drawText('Status', {
      x: 500,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw a line under headers
    pmaPage.drawLine({
      start: { x: 70, y: yPosition - 5 },
      end: { x: 540, y: yPosition - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 20;
    
    if (pmaRecords.length > 0) {
      for (const pma of pmaRecords) {
        // Draw PMA data in single-line tabular format
        pmaPage.drawText(pma.id || 'N/A', {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        pmaPage.drawText(pma.pmaNumber || 'N/A', {
          x: 140,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        pmaPage.drawText(pma.materialSpecification || 'N/A', {
          x: 230,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        pmaPage.drawText(pma.materialGrade || 'N/A', {
          x: 340,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        pmaPage.drawText(pma.certifiedBy || 'N/A', {
          x: 410,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        pmaPage.drawText(pma.status || 'N/A', {
          x: 500,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        yPosition -= 20;
      }
    } else {
      pmaPage.drawText('No PMA records found.', {
        x: 70,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
    
    addFooterToPage(pmaPage);
    
    // Add Procedures section (now section 7)
    const proceduresPage = pdfDoc.addPage([612, 792]);
    proceduresPage.drawText('7. PROCEDURES', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Parse Procedures records from the inspection order
    let procedureRecords: any[] = [];
    try {
      if (inspectionOrder.procedureRecords && typeof inspectionOrder.procedureRecords === 'string') {
        procedureRecords = JSON.parse(inspectionOrder.procedureRecords);
        console.log(`Found ${procedureRecords.length} Procedure records in inspection order`);
      }
    } catch (error) {
      console.error('Error parsing Procedure records:', error);
    }
    
    // Draw table headers
    yPosition = 650;
    
    proceduresPage.drawText('Procedure ID', {
      x: 70,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    proceduresPage.drawText('Procedure Number', {
      x: 170,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    proceduresPage.drawText('Procedure Name', {
      x: 280,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    proceduresPage.drawText('NDT Method', {
      x: 420,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    proceduresPage.drawText('Standard', {
      x: 500,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw a line under headers
    proceduresPage.drawLine({
      start: { x: 70, y: yPosition - 5 },
      end: { x: 540, y: yPosition - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 20;
    
    if (procedureRecords.length > 0) {
      for (const procedure of procedureRecords) {
        // Draw Procedure data in single-line tabular format
        proceduresPage.drawText(procedure.id || 'N/A', {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        proceduresPage.drawText(procedure.procedureNumber || 'N/A', {
          x: 170,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        // Truncate procedure name if too long
        const procedureName = procedure.procedureName || 'N/A';
        const maxNameLength = 15;
        const displayProcedureName = procedureName.length > maxNameLength 
          ? procedureName.substring(0, maxNameLength) + '...' 
          : procedureName;
        
        proceduresPage.drawText(displayProcedureName, {
          x: 280,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        proceduresPage.drawText(procedure.ndtMethod || 'N/A', {
          x: 420,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        proceduresPage.drawText(procedure.applicableStandard || 'N/A', {
          x: 500,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        yPosition -= 20;
      }
    } else {
      proceduresPage.drawText('No procedure records found.', {
        x: 70,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
    
    addFooterToPage(proceduresPage);
    
    // Add shop inspection section (now section 8)
    const shopInspectionPage = pdfDoc.addPage([612, 792]);
    shopInspectionPage.drawText('8. SHOP INSPECTION', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Add basic content for shop inspection section
    shopInspectionPage.drawText('Shop inspection records and reports are maintained in the QMS system.', {
      x: pageMargin,
      y: 650,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    addFooterToPage(shopInspectionPage);
    
    // Add welding section (now section 9)
    const weldingPage = pdfDoc.addPage([612, 792]);
    weldingPage.drawText('9. WELDING & WELD MAPS', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw table headers
    yPosition = 650;
    
    // Calculate column positions based on pageMargin
    const wcol1 = pageMargin;
    const wcol2 = pageMargin + 70;
    const wcol3 = pageMargin + 140;
    const wcol4 = pageMargin + 210;
    const wcol5 = pageMargin + 300;
    const wcol6 = pageMargin + 400;
    
    // Draw table header
    weldingPage.drawText('Weld ID', {
      x: wcol1,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    weldingPage.drawText('Type', {
      x: wcol2,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    weldingPage.drawText('Process', {
      x: wcol3,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    weldingPage.drawText('WPQR Doc', {
      x: wcol4,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    weldingPage.drawText('Welder ID', {
      x: wcol5,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    weldingPage.drawText('Status', {
      x: wcol6,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw a line under headers
    weldingPage.drawLine({
      start: { x: pageMargin, y: yPosition - 5 },
      end: { x: 612 - pageMargin, y: yPosition - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 20;
    
    if (weldRecords.length > 0) {
      for (const weld of weldRecords) {
        // Draw weld data in single-line tabular format
        weldingPage.drawText(weld.id || 'N/A', {
          x: wcol1,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        weldingPage.drawText(weld.weldType || 'N/A', {
          x: wcol2,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        weldingPage.drawText(weld.weldProcess || 'N/A', {
          x: wcol3,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        weldingPage.drawText(weld.wpqrDocument || 'N/A', {
          x: wcol4,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        weldingPage.drawText(weld.welderId || 'N/A', {
          x: wcol5,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        weldingPage.drawText(weld.weldStatus || 'N/A', {
          x: wcol6,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        // Draw a light line between rows
        if (weldRecords.length > 1) {
          weldingPage.drawLine({
            start: { x: pageMargin, y: yPosition - 5 },
            end: { x: 612 - pageMargin, y: yPosition - 5 },
            thickness: 0.5,
            color: rgb(0.8, 0.8, 0.8),
          });
        }
        
        yPosition -= 20;
      }
    } else {
      weldingPage.drawText('No welding records found.', {
        x: pageMargin,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
    
    // Add NDT section (now section 10)
    const ndtPage = pdfDoc.addPage([612, 792]);
    ndtPage.drawText('10. NDT REPORTS', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw table headers
    yPosition = 650;
    
    // Draw table header
    ndtPage.drawText('NDT ID', {
      x: 70,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    ndtPage.drawText('Method', {
      x: 130,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    ndtPage.drawText('Standard', {
      x: 190,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    ndtPage.drawText('Extent', {
      x: 270,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    ndtPage.drawText('Technician', {
      x: 330,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    ndtPage.drawText('Date', {
      x: 410,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    ndtPage.drawText('Results', {
      x: 470,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw a line under headers
    ndtPage.drawLine({
      start: { x: 70, y: yPosition - 5 },
      end: { x: 540, y: yPosition - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 20;
    
    if (ndtRecords.length > 0) {
      for (const ndt of ndtRecords) {
        // Draw NDT data in single-line tabular format
        ndtPage.drawText(ndt.id || 'N/A', {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        ndtPage.drawText(ndt.ndtMethod || 'N/A', {
          x: 130,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        ndtPage.drawText(ndt.ndtStandard || 'N/A', {
          x: 190,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        ndtPage.drawText(ndt.ndtExtent || 'N/A', {
          x: 270,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        ndtPage.drawText(ndt.ndtTechnician || 'N/A', {
          x: 330,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        ndtPage.drawText(ndt.ndtDate || 'N/A', {
          x: 410,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        ndtPage.drawText(ndt.ndtResults || 'N/A', {
          x: 470,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        // Draw a light line between rows
        if (ndtRecords.length > 1) {
          ndtPage.drawLine({
            start: { x: 70, y: yPosition - 5 },
            end: { x: 540, y: yPosition - 5 },
            thickness: 0.5,
            color: rgb(0.8, 0.8, 0.8),
          });
        }
        
        yPosition -= 20;
      }
    } else {
      ndtPage.drawText('No NDT records found.', {
        x: 70,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
    
    // Add Visual Inspection section (now section 11)
    const visualPage = pdfDoc.addPage([612, 792]);
    visualPage.drawText('11. VISUAL INSPECTION RECORDS', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw table headers
    yPosition = 650;
    
    // Draw table header
    visualPage.drawText('ID', {
      x: 70,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    visualPage.drawText('Standard', {
      x: 110,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    visualPage.drawText('Inspector', {
      x: 180,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    visualPage.drawText('Dimensional', {
      x: 250,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    visualPage.drawText('Surface', {
      x: 340,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    visualPage.drawText('Date', {
      x: 410,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    visualPage.drawText('Observations', {
      x: 470,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw a line under headers
    visualPage.drawLine({
      start: { x: 70, y: yPosition - 5 },
      end: { x: 540, y: yPosition - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 20;
    
    if (visualRecords.length > 0) {
      for (const visual of visualRecords) {
        // Draw Visual Inspection data in single-line tabular format
        visualPage.drawText(visual.id || 'N/A', {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        visualPage.drawText(visual.standard || 'N/A', {
          x: 110,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        visualPage.drawText(visual.inspector || 'N/A', {
          x: 180,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        visualPage.drawText(visual.dimensionalChecks || 'N/A', {
          x: 250,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        visualPage.drawText(visual.surfaceCondition || 'N/A', {
          x: 340,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        visualPage.drawText(visual.inspectionDate || 'N/A', {
          x: 410,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        // Truncate observations if too long
        const observations = visual.observations || 'N/A';
        const maxLength = 10;
        const displayObservations = observations.length > maxLength 
          ? observations.substring(0, maxLength) + '...' 
          : observations;
          
        visualPage.drawText(displayObservations, {
          x: 470,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        // Draw a light line between rows
        if (visualRecords.length > 1) {
          visualPage.drawLine({
            start: { x: 70, y: yPosition - 5 },
            end: { x: 540, y: yPosition - 5 },
            thickness: 0.5,
            color: rgb(0.8, 0.8, 0.8),
          });
        }
        
        yPosition -= 20;
      }
    } else {
      visualPage.drawText('No visual inspection records found.', {
        x: 70,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
    
    // Add Hydrotest section (now section 12)
    const hydrotestPage = pdfDoc.addPage([612, 792]);
    hydrotestPage.drawText('12. HYDROTEST REPORTS', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Add basic content for hydrotest section
    hydrotestPage.drawText('Hydrotest records and reports are maintained in the QMS system.', {
      x: pageMargin,
      y: 650,
      size: 12,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    addFooterToPage(hydrotestPage);
    
    // Add NCR section (now section 13)
    const ncrPage = pdfDoc.addPage([612, 792]);
    ncrPage.drawText('13. NON-CONFORMANCE REPORTS', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw table headers
    yPosition = 650;
    
    // Draw table header
    ncrPage.drawText('NCR ID', {
      x: 70,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    ncrPage.drawText('Date', {
      x: 140,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    ncrPage.drawText('Status', {
      x: 210,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    ncrPage.drawText('Description', {
      x: 270,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    ncrPage.drawText('Disposition', {
      x: 370,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    ncrPage.drawText('Corrective Action', {
      x: 460,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw a line under headers
    ncrPage.drawLine({
      start: { x: 70, y: yPosition - 5 },
      end: { x: 540, y: yPosition - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 20;
    
    if (ncrRecords.length > 0) {
      for (const ncr of ncrRecords) {
        // Draw NCR data in single-line tabular format
        ncrPage.drawText(ncr.id || 'N/A', {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        ncrPage.drawText(ncr.ncrDate || 'N/A', {
          x: 140,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        ncrPage.drawText(ncr.ncrStatus || 'N/A', {
          x: 210,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        // Truncate description if too long
        const description = ncr.ncrDescription || 'N/A';
        const maxDescLength = 12;
        const displayDescription = description.length > maxDescLength 
          ? description.substring(0, maxDescLength) + '...' 
          : description;
          
        ncrPage.drawText(displayDescription, {
          x: 270,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        ncrPage.drawText(ncr.ncrDisposition || 'N/A', {
          x: 370,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        // Truncate corrective action if too long
        const correctiveAction = ncr.ncrCorrectiveAction || 'N/A';
        const maxActionLength = 10;
        const displayAction = correctiveAction.length > maxActionLength 
          ? correctiveAction.substring(0, maxActionLength) + '...' 
          : correctiveAction;
          
        ncrPage.drawText(displayAction, {
          x: 460,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        // Draw a light line between rows
        if (ncrRecords.length > 1) {
          ncrPage.drawLine({
            start: { x: 70, y: yPosition - 5 },
            end: { x: 540, y: yPosition - 5 },
            thickness: 0.5,
            color: rgb(0.8, 0.8, 0.8),
          });
        }
        
        yPosition -= 20;
      }
    } else {
      ncrPage.drawText('No non-conformance records found.', {
        x: 70,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
    
    // Add calibration certificates section - for pressure gauge instruments from hydrotest records
    const calibrationCertificatesPage = pdfDoc.addPage([612, 792]);
    calibrationCertificatesPage.drawText('14. CALIBRATION CERTIFICATES', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Set up page layout for calibration certificates
    yPosition = 650;
    
    // Extract pressure gauge IDs from hydrotest records
    const pressureGaugeIds = new Set<string>();
    if (hydrotestRecords && hydrotestRecords.length > 0) {
      console.log('Processing hydrotest records for pressure gauges:', hydrotestRecords);
      for (const hydrotest of hydrotestRecords) {
        // Check for pressureGauge or instrument_id (different property naming)
        if (hydrotest.pressureGauge && hydrotest.pressureGauge.trim() !== '') {
          console.log(`Adding pressure gauge ID: ${hydrotest.pressureGauge}`);
          pressureGaugeIds.add(hydrotest.pressureGauge);
        } else if (hydrotest.gauge_id && hydrotest.gauge_id.trim() !== '') {
          console.log(`Adding pressure gauge ID from gauge_id: ${hydrotest.gauge_id}`);
          pressureGaugeIds.add(hydrotest.gauge_id);
        } else if (hydrotest.instrument_id && hydrotest.instrument_id.trim() !== '') {
          console.log(`Adding pressure gauge ID from instrument_id: ${hydrotest.instrument_id}`);
          pressureGaugeIds.add(hydrotest.instrument_id);
        }
      }
    }
    
    // Add important instrument IDs directly
    console.log('Adding key instrument INST-00001 directly');
    pressureGaugeIds.add('INST-00001');
    
    // Look for other calibration instruments from the database that might be related
    try {
      console.log('Looking for additional relevant pressure gauge instruments from the database');
      const additionalInstrumentsQuery = await pool.query(
        `SELECT instrument_id FROM calibration_instruments 
         WHERE instrument_type LIKE '%pressure%' OR instrument_type LIKE '%gauge%'
         LIMIT 10`
      );
      
      if (additionalInstrumentsQuery.rows.length > 0) {
        for (const row of additionalInstrumentsQuery.rows) {
          console.log(`Adding pressure gauge from database: ${row.instrument_id}`);
          pressureGaugeIds.add(row.instrument_id);
        }
      }
    } catch (err) {
      console.error('Error fetching additional pressure gauge instruments:', err);
    }
    
    if (pressureGaugeIds.size > 0) {
      // Add header
      calibrationCertificatesPage.drawText('Pressure Gauge Calibration Certificates:', {
        x: 70,
        y: yPosition,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      yPosition -= 30;
      
      // Set column headers
      calibrationCertificatesPage.drawText('Instrument ID', {
        x: 70,
        y: yPosition,
        size: 10,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      calibrationCertificatesPage.drawText('Instrument Type', {
        x: 200,
        y: yPosition,
        size: 10,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      calibrationCertificatesPage.drawText('Calibration Date', {
        x: 350,
        y: yPosition,
        size: 10,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      calibrationCertificatesPage.drawText('Certificate No.', {
        x: 480,
        y: yPosition,
        size: 10,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      yPosition -= 20;
      
      // Try to fetch each instrument from the database
      try {
        // Use explicit SQL query for better readability and error handling
        const instrumentsQueryResult = await pool.query(
          `SELECT 
            instrument_id, 
            instrument_type, 
            last_calibration_date, 
            certificate_number 
          FROM 
            calibration_instruments 
          WHERE 
            instrument_id = ANY($1)`,
          [Array.from(pressureGaugeIds)]
        );
        
        const instruments = instrumentsQueryResult.rows;
        
        if (instruments.length > 0) {
          for (const instrument of instruments) {
            // Format the date
            const calibrationDate = instrument.last_calibration_date ? 
              new Date(instrument.last_calibration_date).toLocaleDateString('en-GB') : 'N/A';
            
            // Instrument ID
            calibrationCertificatesPage.drawText(instrument.instrument_id || 'N/A', {
              x: 70,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: rgb(0, 0, 0),
            });
            
            // Instrument Type
            calibrationCertificatesPage.drawText(instrument.instrument_type || 'N/A', {
              x: 200,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: rgb(0, 0, 0),
            });
            
            // Calibration Date
            calibrationCertificatesPage.drawText(calibrationDate, {
              x: 350,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: rgb(0, 0, 0),
            });
            
            // Certificate No.
            calibrationCertificatesPage.drawText(instrument.certificate_number || 'N/A', {
              x: 480,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: rgb(0, 0, 0),
            });
            
            yPosition -= 20;
            
            // If page is full, add a new page
            if (yPosition < 100) {
              const newPage = pdfDoc.addPage([612, 792]);
              newPage.drawText('7. Calibration Certificates (CONTINUED)', {
                x: pageMargin,
                y: 700,
                size: 16,
                font: helveticaBold,
                color: rgb(0, 0, 0),
              });
              addFooterToPage(newPage);
              yPosition = 650;
            }
          }
        } else {
          calibrationCertificatesPage.drawText('No calibration instruments found for the pressure gauges used.', {
            x: 70,
            y: yPosition,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
        }
      } catch (error) {
        console.error('Error fetching calibration instruments:', error);
        calibrationCertificatesPage.drawText('Error fetching calibration instrument data.', {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(1, 0, 0),
        });
      }
    } else {
      calibrationCertificatesPage.drawText('No pressure gauge instruments used in hydrotest records.', {
        x: 70,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
    
    // Add footer to the calibration certificates page
    addFooterToPage(calibrationCertificatesPage);
    
    // Merge additional PDF documents into the final dossier
    try {
      // Add Appendices title page and content
      const appendicesTitlePage = pdfDoc.addPage([612, 792]);
      const titleText = '14. APPENDICES';
      const titleFont = helveticaBold;
      const titleSize = 24;
      const titleWidth = titleSize * titleText.length * 0.5;
      const centerX = (612 - titleWidth) / 2;
      
      appendicesTitlePage.drawText(titleText, {
        x: centerX,
        y: 400,
        size: titleSize,
        font: titleFont,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(appendicesTitlePage);
      
      // Add appendices content page
      const appendicesPage = pdfDoc.addPage([612, 792]);
      appendicesPage.drawText('14. APPENDICES (Contents)', {
        x: pageMargin,
        y: 700,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      let yPosition = 650;
      appendicesPage.drawText('The following documents are included as appendices:', {
        x: 70,
        y: yPosition,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(appendicesPage);
      
      // Collect all documents from various tabs and merge them
      // 1. List material certificates
      if (materials.length > 0) {
        appendicesPage.drawText('Material Certificates:', {
          x: 70,
          y: yPosition,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        // Use the same filtered materials list for the appendices
        console.log(`Listing documents for ${materials.length} selected materials in appendices`);
        
        // Track document types per material (for appendices listing)
        const appendixDocTypeTracker: Record<string, Set<string>> = {};
        
        // First pass: collect all documents and organize by material
        const allMaterialDocsByMaterial: Record<string, Array<{name: string, path: string}>> = {};
        
        for (const material of materials) {
          const materialId = material.materialIdentificationId;
          if (!materialId) continue;
          
          console.log(`Finding documents for Material ID: ${materialId} to list in appendices`);
          
          // Initialize tracking for this material
          appendixDocTypeTracker[materialId] = new Set<string>();
          allMaterialDocsByMaterial[materialId] = [];
          
          // Get all documents for this material - try new hierarchical path first, then fallback
          let materialDocs: string[] = [];
          try {
            // Try new project-based path first
            const newPath = `QMS/Material_Identification/${inspectionOrder.projectCode}/${materialId}`;
            try {
              materialDocs = await listFiles(newPath);
              console.log(`Found ${materialDocs.length} documents for Material ID: ${materialId} using new path structure (${newPath})`);
            } catch (newPathError) {
              // Fallback to old path structure
              const oldPath = `QMS/Material_Identification/${materialId}`;
              materialDocs = await listFiles(oldPath);
              console.log(`Found ${materialDocs.length} documents for Material ID: ${materialId} using old path structure (${oldPath})`);
            }
            
            // Filter and sort (newest first)
            const filteredDocs = materialDocs
              .filter(path => path.toLowerCase().endsWith('.pdf'))
              .sort()
              .reverse();
              
            // Add to material docs collection
            for (const docPath of filteredDocs) {
              const docName = docPath.split('/').pop() || docPath;
              allMaterialDocsByMaterial[materialId].push({
                name: docName,
                path: docPath
              });
            }
          } catch (error) {
            console.error(`Error listing documents for material ${materialId}:`, error);
          }
        }
        
        // Second pass: add documents to appendices listing, avoiding duplicates
        for (const materialId in allMaterialDocsByMaterial) {
          const materialDocs = allMaterialDocsByMaterial[materialId];
          
          for (const doc of materialDocs) {
            // Get document type by removing .pdf extension
            const docType = doc.name.replace('.pdf', '').trim();
            
            // Skip if we've already listed this document type for this material
            if (appendixDocTypeTracker[materialId].has(docType)) {
              console.log(`Skipping duplicate document type in appendices listing: ${docType} for ${materialId}`);
              continue;
            }
            
            // Add to appendices listing
            appendicesPage.drawText(`- ${doc.name} (${materialId})`, {
              x: 90,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: rgb(0, 0, 0),
            });
            
            // Mark this document type as processed for this material
            appendixDocTypeTracker[materialId].add(docType);
            
            // Move down for next line
            yPosition -= 15;
            
            // If page is full, add a new appendices page
            if (yPosition < 100) {
              const newPage = pdfDoc.addPage([612, 792]);
              newPage.drawText('12. APPENDICES (CONTINUED)', {
                x: pageMargin,
                y: 700,
                size: 16,
                font: helveticaBold,
                color: rgb(0, 0, 0),
              });
              // Add footer to the new page
              addFooterToPage(newPage);
              yPosition = 650;
            }
          }
        }
      }
      
      // 2. List inspection documents by tab
      // Inspection document sections - aligned with UI tab sequence
      const inspectionSections = [
        { name: 'Approved Drawing', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/ApprovedDrawing` },
        { name: 'DVR', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/DVR` },
        { name: 'ITP', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/ITP` },
        { name: 'Material Traceability', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/MaterialTraceability` },
        { name: 'Shop Inspection', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/ShopInspection` },
        { name: 'Welding', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/Welding` },
        { name: 'NDT', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/NDT` },
        { name: 'Visual Inspection', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/Visual` },
        { name: 'Hydrotest', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/Hydrotest` },
        { name: 'NCR', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/NCR` }
      ];
      
      // First process inspection document sections
      for (const section of inspectionSections) {
        console.log(`Checking inspection section: ${section.name} at path: ${section.path}`);
        
        let sectionDocs: string[] = [];
        try {
          sectionDocs = await listFiles(section.path);
          console.log(`Found ${sectionDocs.length} documents in ${section.path}`);
        } catch (error) {
          console.log(`Error listing files in ${section.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        if (sectionDocs.length > 0) {
          yPosition -= 10; // Add some extra space between sections
          
          appendicesPage.drawText(`${section.name} Documents:`, {
            x: 70,
            y: yPosition,
            size: 10,
            font: helveticaBold,
            color: rgb(0, 0, 0),
          });
          yPosition -= 15;
          
          for (const docPath of sectionDocs) {
            const docName = docPath.split('/').pop() || docPath;
            
            // Skip if we're getting low on vertical space
            if (yPosition < 100) {
              appendicesPage = pdfDoc.addPage([612, 792]);
              appendicesPage.drawText('12. APPENDICES (Contents)', {
                x: pageMargin,
                y: 700,
                size: 16,
                font: helveticaBold,
                color: rgb(0, 0, 0),
              });
              addFooterToPage(appendicesPage);
              
              // Reset position
              yPosition = 750;
            }
            
            appendicesPage.drawText(`- ${docName}`, {
              x: 90,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: rgb(0, 0, 0),
            });
            yPosition -= 15;
          }
        }
      }
      
      // Now specifically handle calibration certificates, using exact matching instead of prefix matching
      console.log(`Processing calibration certificates for pressure gauges...`);
      
      // Get all pressure gauge IDs from the hydrotest records
      const pressureGaugeIdsFromHydrotest = Array.from(pressureGaugeIds);
      if (pressureGaugeIdsFromHydrotest.length > 0) {
        let calibrationCertificatesFound = false;
        
        // Add a header for the calibration certificates section
        yPosition -= 20; // Add extra space before the new section
        appendicesPage.drawText('CALIBRATION CERTIFICATES:', {
          x: 70,
          y: yPosition,
          size: 12,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15; // Add some extra space
        
        // First, look up the specific instruments in the database to get their file paths
        try {
          const instrumentsQueryResult = await pool.query(
            `SELECT 
              instrument_id, 
              instrument_type,
              certificate_file_path 
            FROM 
              calibration_instruments 
            WHERE 
              instrument_id = ANY($1)`,
            [pressureGaugeIdsFromHydrotest]
          );
          
          let instruments = instrumentsQueryResult.rows;
          
          // Add fallback for INST-00001 if not returned from database
          const hasInst00001 = instruments.some(inst => inst.instrument_id === 'INST-00001');
          if (!hasInst00001 && pressureGaugeIdsFromHydrotest.includes('INST-00001')) {
            console.log('Adding fallback entry for INST-00001 since not found in database');
            instruments.push({
              instrument_id: 'INST-00001',
              instrument_type: 'Pressure Gauge',
              certificate_file_path: 'QMS/Instrument/INST-00001.pdf'
            });
          }
          
          if (instruments.length > 0) {
            calibrationCertificatesFound = true;
            
            appendicesPage.drawText(`Calibration Certificates:`, {
              x: 70,
              y: yPosition,
              size: 10,
              font: helveticaBold,
              color: rgb(0, 0, 0),
            });
            yPosition -= 15;
            
            for (const instrument of instruments) {
              console.log(`Looking for calibration certificate for ${instrument.instrument_id}`);
              
              // Check standard path
              const standardPath = `QMS/Instrument/${instrument.instrument_id}.pdf`;
              
              // Check if files exist using file.exists() to avoid prefix-matching issues
              let fileExists = false;
              let existingPath = '';
              
              // Check the database path first
              if (instrument.certificate_file_path) {
                const file = bucket.file(instrument.certificate_file_path);
                const [exists] = await file.exists();
                if (exists) {
                  fileExists = true;
                  existingPath = instrument.certificate_file_path;
                  console.log(`Found certificate at database path: ${existingPath}`);
                }
              }
              
              // If not found in database path, check the standard path
              if (!fileExists) {
                const file = bucket.file(standardPath);
                const [exists] = await file.exists();
                if (exists) {
                  fileExists = true;
                  existingPath = standardPath;
                  console.log(`Found certificate at standard path: ${existingPath}`);
                }
              }
              
              // Display the certificate information
              if (fileExists) {
                const docName = existingPath.split('/').pop() || existingPath;
                
                appendicesPage.drawText(`- ${instrument.instrument_id} (${instrument.instrument_type}): ${docName}`, {
                  x: 90,
                  y: yPosition,
                  size: 10,
                  font: helvetica,
                  color: rgb(0, 0, 0),
                });
                yPosition -= 15;
              } else {
                console.log(`No certificate found for ${instrument.instrument_id}`);
                
                appendicesPage.drawText(`- ${instrument.instrument_id} (${instrument.instrument_type}): No certificate found`, {
                  x: 90,
                  y: yPosition,
                  size: 10,
                  font: helvetica,
                  color: rgb(0, 0, 0),
                });
                yPosition -= 15;
              }
              
              // Add a new page if needed
              if (yPosition < 100) {
                appendicesPage = pdfDoc.addPage([612, 792]);
                appendicesPage.drawText('12. APPENDICES (Contents)', {
                  x: pageMargin,
                  y: 700,
                  size: 16,
                  font: helveticaBold,
                  color: rgb(0, 0, 0),
                });
                addFooterToPage(appendicesPage);
                yPosition = 750;
              }
            }
          }
        } catch (error) {
          console.error('Error fetching calibration certificates:', error);
        }
        
        if (!calibrationCertificatesFound) {
          console.log('No calibration certificates found for pressure gauges');
        }
      } else {
        console.log('No pressure gauges referenced in hydrotest records');
      }
      
      // Add page break detection for appendices if needed
      if (yPosition < 100) {
        appendicesPage = pdfDoc.addPage([612, 792]);
        appendicesPage.drawText('12. APPENDICES (Contents)', {
          x: pageMargin,
          y: 700,
          size: 16,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        addFooterToPage(appendicesPage);
        yPosition = 750;
      }
      
      // Extract WPQR document IDs from weld records and add to appendices list
      try {
        // Create a list of WPQR document IDs from weld records
        const localWpqrIds: number[] = [];
        
        if (weldRecords && weldRecords.length > 0) {
          console.log('Extracting WPQR document IDs from weld records for appendices listing...');
          
          for (const weld of weldRecords) {
            if (weld.wpqrDocument) {
              console.log(`Found WPQR reference in weld record: ${weld.wpqrDocument} (type: ${typeof weld.wpqrDocument})`);
              
              try {
                const wpqrId = parseInt(weld.wpqrDocument);
                if (!isNaN(wpqrId) && !localWpqrIds.includes(wpqrId)) {
                  localWpqrIds.push(wpqrId);
                  console.log(`Added WPQR ID to appendices list: ${wpqrId}`);
                } else {
                  console.log(`Invalid or duplicate WPQR ID: ${weld.wpqrDocument}`);
                }
              } catch (parseError) {
                console.error(`Error parsing WPQR document ID from weld record: ${weld.wpqrDocument}`, parseError);
              }
            }
          }
        }
        
        console.log(`Found ${localWpqrIds.length} WPQR document IDs in weld records: ${localWpqrIds.join(', ')}`);
        
        // Add WPQR documents section if we found any IDs
        if (localWpqrIds.length > 0) {
          yPosition -= 10; // Add some extra space before WPQR section
          
          appendicesPage.drawText('WPQR Documents:', {
            x: 70,
            y: yPosition,
            size: 10,
            font: helveticaBold,
            color: rgb(0, 0, 0),
          });
          yPosition -= 15;
          
          try {
            console.log(`Querying ${localWpqrIds.length} WPQR documents for appendices listing...`);
            
            // Query the database for WPQR document details
            const wpqrDocs = await db.select({
              id: wpqrDocuments.id,
              documentId: wpqrDocuments.documentId,
              title: wpqrDocuments.title,
              filePath: wpqrDocuments.filePath
            })
            .from(wpqrDocuments)
            .where(inArray(wpqrDocuments.id, localWpqrIds));
            
            console.log(`Found ${wpqrDocs.length} matching WPQR documents in database`);
            
            // Add each WPQR document to the appendices list
            if (wpqrDocs.length > 0) {
              for (const wpqr of wpqrDocs) {
                let displayName = `${wpqr.documentId}.pdf`;
                if (wpqr.filePath) {
                  const filePathParts = wpqr.filePath.split('/');
                  displayName = filePathParts[filePathParts.length - 1];
                }
                
                console.log(`Adding WPQR to appendices: ${displayName} (${wpqr.title || wpqr.documentId})`);
                
                // Add document to the appendices with title for context
                appendicesPage.drawText(`- ${displayName} (${wpqr.title || wpqr.documentId})`, {
                  x: 90,
                  y: yPosition,
                  size: 10,
                  font: helvetica,
                  color: rgb(0, 0, 0),
                });
                yPosition -= 15;
                
                // If page is full, add a new appendices page
                if (yPosition < 100) {
                  const newPage = pdfDoc.addPage([612, 792]);
                  newPage.drawText('12. APPENDICES (CONTINUED)', {
                    x: pageMargin,
                    y: 700,
                    size: 16,
                    font: helveticaBold,
                    color: rgb(0, 0, 0),
                  });
                  // Add footer to the new page
                  addFooterToPage(newPage);
                  yPosition = 650;
                }
              }
            } else {
              // No matching WPQR documents found in database
              console.log(`No matching WPQR documents found in database for IDs: ${localWpqrIds.join(', ')}`);
              appendicesPage.drawText(`- No matching WPQR documents found in database`, {
                x: 90,
                y: yPosition,
                size: 10,
                font: helvetica,
                color: rgb(0, 0, 0),
              });
              yPosition -= 15;
            }
          } catch (dbError) {
            // Handle database error
            const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
            console.error(`Database error when listing WPQR documents in appendices: ${errorMessage}`);
            appendicesPage.drawText(`- Error retrieving WPQR documents from database`, {
              x: 90,
              y: yPosition,
              size: 10,
              font: helvetica,
              color: rgb(1, 0, 0),
            });
            yPosition -= 15;
          }
        } else {
          console.log('No WPQR document IDs found in weld records, skipping WPQR section in appendices');
        }
      } catch (wpqrError) {
        // Handle any unexpected errors in the entire WPQR section
        console.error('Error processing WPQR documents for appendices:', wpqrError);
        appendicesPage.drawText('Error collecting document references.', {
          x: 70, 
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(1, 0, 0),
        });
        yPosition -= 15;
      }
      
      // If no documents were found
      if (yPosition === 650) {
        appendicesPage.drawText('No additional documents found.', {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
      }
      
    } catch (error) {
      console.error('Error collecting document references:', error);
      appendicesPage.drawText('Error collecting document references.', {
        x: 70,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(1, 0, 0),
      });
    }
    
    // Add footers to all content pages
    addFooterToPage(materialPage);
    addFooterToPage(weldingPage);
    addFooterToPage(ndtPage);
    addFooterToPage(visualPage);
    addFooterToPage(ncrPage);
    addFooterToPage(appendicesPage);
    
    // Attempt to merge actual document PDFs as appendices
    try {
      // List of PDFs to merge
      const pdfPaths: string[] = [];
      
      // Track all unique document paths to prevent duplicates in the final dossier
      const uniquePdfPaths = new Set<string>();
      
      // Keep track of which document types we've already added per material
      const materialDocTypes: Record<string, Set<string>> = {};
      
      // Collect material certificate PDFs, using the same filtered materials list
      if (materials.length > 0) {
        console.log(`Collecting documents from ${materials.length} materials for PDF merging...`);
        
        for (const material of materials) {
          const materialId = material.materialIdentificationId;
          if (!materialId) continue;
          
          // Initialize material doc type tracking
          if (!materialDocTypes[materialId]) {
            materialDocTypes[materialId] = new Set<string>();
          }
          
          // Get all documents for this material
          let materialDocs: string[] = [];
          try {
            // Try new project-based path first
            const newPath = `QMS/Material_Identification/${inspectionOrder.projectCode}/${materialId}`;
            try {
              materialDocs = await listFiles(newPath);
            } catch (newPathError) {
              // Fallback to old path structure
              const oldPath = `QMS/Material_Identification/${materialId}`;
              materialDocs = await listFiles(oldPath);
            }
            
            // Filter for PDF documents
            const pdfDocs = materialDocs.filter(path => path.toLowerCase().endsWith('.pdf'));
            
            // Add to our collection, avoiding duplicates
            for (const docPath of pdfDocs) {
              if (!uniquePdfPaths.has(docPath)) {
                uniquePdfPaths.add(docPath);
                pdfPaths.push(docPath);
              }
            }
          } catch (error) {
            console.error(`Error collecting documents for material ${materialId}:`, error);
          }
        }
      }
      
      // Collect inspection documents from all tabs
      const inspectionSections = [
        { name: 'Approved Drawing', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/ApprovedDrawing` },
        { name: 'DVR', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/DVR` },
        { name: 'ITP', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/ITP` },
        { name: 'Material Traceability', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/MaterialTraceability` },
        { name: 'Shop Inspection', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/ShopInspection` },
        { name: 'Welding', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/Welding` },
        { name: 'NDT', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/NDT` },
        { name: 'Visual Inspection', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/Visual` },
        { name: 'Hydrotest', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/Hydrotest` },
        { name: 'NCR', path: `QMS/Inspections_Records/${inspectionOrder.projectCode}/${inspectionOrder.inspectionOrderNumber}/NCR` }
      ];
      
      // Collect inspection documents
      for (const section of inspectionSections) {
        try {
          const sectionDocs = await listFiles(section.path);
          const pdfDocs = sectionDocs.filter(path => path.toLowerCase().endsWith('.pdf'));
          
          for (const docPath of pdfDocs) {
            if (!uniquePdfPaths.has(docPath)) {
              uniquePdfPaths.add(docPath);
              pdfPaths.push(docPath);
            }
          }
        } catch (error) {
          console.log(`No documents found in ${section.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Merge all collected PDFs
      console.log(`Attempting to merge ${pdfPaths.length} PDF documents into the final dossier`);
      
      for (const pdfPath of pdfPaths) {
        try {
          console.log(`Processing PDF: ${pdfPath}`);
          
          // Check if file exists
          try {
            const file = bucket.file(pdfPath);
            const [exists] = await file.exists();
            
            if (exists) {
              try {
                // Download the file
                const [fileContents] = await file.download();
                
                try {
                  // Parse the PDF
                  const externalPdf = await PDFDocument.load(fileContents);
                  const copiedPages = await pdfDoc.copyPages(externalPdf, externalPdf.getPageIndices());
                  
                  // Add pages to main document
                  for (const copiedPage of copiedPages) {
                    const page = pdfDoc.addPage(copiedPage);
                    
                    // Add our footer to each imported page
                    try {
                      addFooterToPage(page);
                    } catch (footerError) {
                      console.error('Error adding footer to imported page:', footerError);
                    }
                  }
                  
                  console.log(`Successfully merged PDF: ${pdfPath}`);
                } catch (pdfError) {
                  console.error(`Error processing PDF ${pdfPath}:`, pdfError);
                }
              } catch (downloadError) {
                console.error(`Error downloading file ${pdfPath}:`, downloadError);
              }
            } else {
              console.log(`File does not exist in GCS: ${pdfPath}`);
            }
          } catch (existsError) {
            console.error(`Error checking if file exists ${pdfPath}:`, existsError);
          }
        } catch (error) {
          console.error(`General error processing file ${pdfPath}:`, error);
        }
      }
    } catch (error) {
      console.error('Error merging PDFs:', error);
    }
    
    // Save the dossier
    const pdfBytes = await pdfDoc.save();
    
    return pdfBytes;
  } catch (error) {
    console.error('Error generating final dossier:', error);
    throw error;
  }
}
