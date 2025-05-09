import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts, PDFPage } from 'pdf-lib';
import { db } from '../db';
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
  storage = new Storage({
    credentials: gcsCredentials,
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

    // Define the base path for the final dossier directory in GCS
    const dossierDir = `QMS/Inspections_Records/${inspectionOrderNumber}/Final Dossier`;
    const filePrefix = `FD_${inspectionOrderNumber}`;
    
    // List files in the Final Dossier directory
    console.log(`Checking for existing dossiers in: ${dossierDir}`);
    
    // Use try/catch just for the getFiles operation to handle permission issues
    let files = [];
    try {
      [files] = await bucket.getFiles({ prefix: dossierDir });
      console.log(`Successfully listed files in ${dossierDir}`);
    } catch (fileListError) {
      console.error('Error listing files in GCS directory:', fileListError);
      console.log('Will proceed with assumption that no files exist');
      // Return empty array to continue processing
      files = [];
    }
    
    // Look for files that match our prefix pattern
    const dossierFiles = files.filter((file: any) => {
      const fileName = file.name.split('/').pop() || '';
      return fileName.startsWith(filePrefix) && fileName.endsWith('.pdf');
    });
    
    console.log(`Found ${dossierFiles.length} possible dossier files`);
    
    if (dossierFiles.length > 0) {
      // Sort by name descending to get the most recent one (assuming timestamp in name)
      dossierFiles.sort((a: any, b: any) => b.name.localeCompare(a.name));
      
      // Use the most recent file
      const latestFile = dossierFiles[0];
      console.log(`Using most recent dossier file: ${latestFile.name}`);
      
      // Generate signed URL for download - with error handling
      try {
        const [url] = await latestFile.getSignedUrl({
          action: 'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // URL expires in 7 days
        });
        
        return {
          exists: true,
          url,
          path: latestFile.name
        };
      } catch (signedUrlError) {
        console.error('Error generating signed URL:', signedUrlError);
        console.log('File exists but cannot generate URL');
        return {
          exists: true,
          url: '',
          path: latestFile.name
        };
      }
    }
    
    // If no files found, return exists: false
    console.log('No existing final dossier files found');
    return {
      exists: false,
      url: '',
      path: `${dossierDir}/${filePrefix}.pdf` // Return a reference path for consistency
    };
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
      '1. Material Traceability',
      '2. Welding & Weld Maps',
      '3. NDT Reports',
      '4. Visual Inspection Records',
      '5. Hydrotest Reports',
      '6. Non-Conformance Reports',
      '7. Appendices'
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
    
    // Add material traceability section
    const materialPage = pdfDoc.addPage([612, 792]);
    materialPage.drawText('1. MATERIAL TRACEABILITY', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw table headers
    yPosition = 650;
    
    // Calculate column positions based on pageMargin
    const col1 = pageMargin;
    const col2 = pageMargin + 100;
    const col3 = pageMargin + 200;
    const col4 = pageMargin + 300;
    const col5 = pageMargin + 400;
    
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
        // Draw material data in single-line tabular format
        materialPage.drawText(material.materialIdentificationId || 'N/A', {
          x: col1,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        materialPage.drawText(material.materialCertificateNumber || 'N/A', {
          x: col2,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        materialPage.drawText(material.heatNumber || 'N/A', {
          x: col3,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        materialPage.drawText(material.materialGrade || 'N/A', {
          x: col4,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        materialPage.drawText(material.materialSpecification || 'N/A', {
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
    
    // Add welding section
    const weldingPage = pdfDoc.addPage([612, 792]);
    weldingPage.drawText('2. WELDING & WELD MAPS', {
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
    
    // Add NDT section
    const ndtPage = pdfDoc.addPage([612, 792]);
    ndtPage.drawText('3. NDT REPORTS', {
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
    
    // Add Visual Inspection section
    const visualPage = pdfDoc.addPage([612, 792]);
    visualPage.drawText('4. VISUAL INSPECTION RECORDS', {
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
    
    // Add NCR section
    const ncrPage = pdfDoc.addPage([612, 792]);
    ncrPage.drawText('6. NON-CONFORMANCE REPORTS', {
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
    
    // Add appendices section for uploaded documents
    const appendicesPage = pdfDoc.addPage([612, 792]);
    appendicesPage.drawText('7. APPENDICES', {
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
    
    // Collect and list document references
    try {
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
        for (const material of materials) {
          const materialId = material.materialIdentificationId;
          if (materialId) {
            console.log(`Finding documents for Material ID: ${materialId} to list in appendices`);
            const materialDocsPath = `QMS/Material_Identification/${materialId}`;
            const materialDocs = await listFiles(materialDocsPath);
            
            if (materialDocs.length > 0) {
              console.log(`Found ${materialDocs.length} documents for Material ID: ${materialId} to list in appendices`);
              for (const docPath of materialDocs) {
                const docName = docPath.split('/').pop() || docPath;
                appendicesPage.drawText(`- ${docName} (${materialId})`, {
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
                  newPage.drawText('7. APPENDICES (CONTINUED)', {
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
        }
      }
      
      // 2. List inspection documents by tab
      const sections = [
        { name: 'Welding', path: `QMS/Inspections_Records/${inspectionOrder.inspectionOrderNumber}/Welding` },
        { name: 'NDT', path: `QMS/Inspections_Records/${inspectionOrder.inspectionOrderNumber}/NDT` },
        { name: 'Visual Inspection', path: `QMS/Inspections_Records/${inspectionOrder.inspectionOrderNumber}/Visual Inspection` },
        { name: 'NCR', path: `QMS/Inspections_Records/${inspectionOrder.inspectionOrderNumber}/NCR` }
      ];
      
      for (const section of sections) {
        const sectionDocs = await listFiles(section.path);
        
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
            appendicesPage.drawText(`- ${docName}`, {
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
              newPage.drawText('7. APPENDICES (CONTINUED)', {
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
      
      // Collect material certificate PDFs, using the same filtered materials list
      console.log(`Collecting material documents for ${materials.length} selected materials`);
      for (const material of materials) {
        const materialId = material.materialIdentificationId;
        if (materialId) {
          console.log(`Looking for documents for Material ID: ${materialId}`);
          const materialDocsPath = `QMS/Material_Identification/${materialId}`;
          const materialDocs = await listFiles(materialDocsPath);
          console.log(`Found ${materialDocs.length} documents for Material ID: ${materialId}`);
          
          for (const docPath of materialDocs) {
            if (docPath.toLowerCase().endsWith('.pdf')) {
              console.log(`Adding document to dossier: ${docPath}`);
              pdfPaths.push(docPath);
            }
          }
        }
      }
      
      // Collect inspection document PDFs by section
      const sections = [
        `QMS/Inspections_Records/${inspectionOrder.inspectionOrderNumber}/Welding`,
        `QMS/Inspections_Records/${inspectionOrder.inspectionOrderNumber}/NDT`,
        `QMS/Inspections_Records/${inspectionOrder.inspectionOrderNumber}/Visual Inspection`,
        `QMS/Inspections_Records/${inspectionOrder.inspectionOrderNumber}/NCR`
      ];
      
      for (const sectionPath of sections) {
        const sectionDocs = await listFiles(sectionPath);
        for (const docPath of sectionDocs) {
          if (docPath.toLowerCase().endsWith('.pdf')) {
            pdfPaths.push(docPath);
          }
        }
      }
      
      // Extract WPQR document IDs and welder IDs from weld records
      console.log('Checking for WPQR documents and welder certificates in weld records...');
      console.log('Weld Records:', JSON.stringify(weldRecords, null, 2));
      const wpqrDocumentIds: number[] = [];
      const welderIds: string[] = []; // Array to store unique welder IDs
      
      // Extract WPQR document IDs and welder IDs from weld records
      if (weldRecords && weldRecords.length > 0) {
        for (const weld of weldRecords) {
          // Extract WPQR document IDs
          if (weld.wpqrDocument) {
            console.log(`Found WPQR reference: ${weld.wpqrDocument} (type: ${typeof weld.wpqrDocument})`);
            
            try {
              const wpqrId = parseInt(weld.wpqrDocument);
              if (!isNaN(wpqrId)) {
                if (!wpqrDocumentIds.includes(wpqrId)) {
                  wpqrDocumentIds.push(wpqrId);
                  console.log(`Extracted WPQR document ID: ${wpqrId}`);
                }
              } else {
                console.log(`Could not parse WPQR document ID: ${weld.wpqrDocument}`);
              }
            } catch (error) {
              console.error(`Error parsing WPQR document ID: ${weld.wpqrDocument}`, error);
            }
          }
          
          // Extract welder IDs
          if (weld.welderId) {
            console.log(`Found welder reference: ${weld.welderId}`);
            if (!welderIds.includes(weld.welderId)) {
              welderIds.push(weld.welderId);
              console.log(`Extracted welder ID: ${weld.welderId}`);
            }
          }
        }
      }
      
      console.log(`Collected WPQR document IDs: ${wpqrDocumentIds.join(', ')}`);
      console.log(`Collected welder IDs: ${welderIds.join(', ')}`);
      
      // If we have WPQR document IDs, retrieve them from the database and add their file paths
      if (wpqrDocumentIds.length > 0) {
        console.log(`Retrieving ${wpqrDocumentIds.length} WPQR documents from database...`);
        
        try {
          const wpqrDocs = await db.select({
            id: wpqrDocuments.id,
            documentId: wpqrDocuments.documentId,
            filePath: wpqrDocuments.filePath
          })
          .from(wpqrDocuments)
          .where(inArray(wpqrDocuments.id, wpqrDocumentIds));
          
          console.log(`Found ${wpqrDocs.length} WPQR documents in the database:`, JSON.stringify(wpqrDocs, null, 2));
          
          // Try to get directly from the standard WPQR path if no file path is saved
          for (const doc of wpqrDocs) {
            if (doc.filePath) {
              console.log(`Adding WPQR document with saved path: ${doc.filePath}`);
              pdfPaths.push(doc.filePath);
            } else {
              // Try standard path
              const standardPath = `QMS/WPQR/${doc.documentId}.pdf`;
              console.log(`WPQR document ${doc.documentId} (ID: ${doc.id}) has no file path, trying standard path: ${standardPath}`);
              pdfPaths.push(standardPath);
            }
          }
          
          // Add a fallback approach to check standard locations for WPQR documents
          for (const wpqrId of wpqrDocumentIds) {
            // Check if there's a document with format WPQR-{id}.pdf in the standard location
            const wpqrStandardPath = `QMS/WPQR/WPQR-${wpqrId}.pdf`;
            console.log(`Adding fallback WPQR path: ${wpqrStandardPath}`);
            if (!pdfPaths.includes(wpqrStandardPath)) {
              pdfPaths.push(wpqrStandardPath);
            }
          }
        } catch (dbError) {
          console.error('Error retrieving WPQR documents from database:', dbError);
        }
      }
      
      // If we have welder IDs, retrieve their certificates and add them to the PDF
      if (welderIds.length > 0) {
        console.log(`Retrieving certificates for ${welderIds.length} welders...`);
        
        try {
          // First, get the actual welder database IDs from their welder IDs (e.g., W-001)
          const welderRecords = await db.select({
            id: welders.id,
            welderId: welders.welderId,
            name: welders.name
          })
          .from(welders)
          .where(inArray(welders.welderId, welderIds));
          
          console.log(`Found ${welderRecords.length} welders in the database:`, JSON.stringify(welderRecords, null, 2));
          
          if (welderRecords.length > 0) {
            const welderDbIds = welderRecords.map(w => w.id);
            
            // Now get the active certificates for these welders
            const welderCertificateRecords = await db.select({
              id: welderCertificates.id,
              welderId: welderCertificates.welderId,
              certificateNo: welderCertificates.certificateNo,
              filePath: welderCertificates.filePath,
              status: welderCertificates.status
            })
            .from(welderCertificates)
            .where(and(
              inArray(welderCertificates.welderId, welderDbIds),
              eq(welderCertificates.status, 'Active')
            ));
            
            console.log(`Found ${welderCertificateRecords.length} active certificates:`, JSON.stringify(welderCertificateRecords, null, 2));
            
            // Add certificate file paths to the PDF paths
            for (const cert of welderCertificateRecords) {
              if (cert.filePath) {
                // Get the corresponding welder record for logging
                const welder = welderRecords.find(w => w.id === cert.welderId);
                console.log(`Adding certificate for welder ${welder?.name} (${welder?.welderId}): ${cert.filePath}`);
                pdfPaths.push(cert.filePath);
              }
            }
            
            // Add a fallback approach to check standard locations for welder certificates
            for (const welder of welderRecords) {
              const welderCertPath = `QMS/WELDERS/${welder.welderId}/certificates`;
              console.log(`Checking for certificates in standard path: ${welderCertPath}`);
              
              try {
                const files = await listFiles(welderCertPath);
                for (const file of files) {
                  if (file.toLowerCase().endsWith('.pdf')) {
                    console.log(`Found certificate in standard path: ${file}`);
                    pdfPaths.push(file);
                  }
                }
              } catch (error: any) {
                console.log(`No certificates found in standard path ${welderCertPath}: ${error?.message || 'Unknown error'}`);
              }
            }
          }
        } catch (dbError) {
          console.error('Error retrieving welder certificates from database:', dbError);
        }
      }
      
      // Merge PDFs
      if (pdfPaths.length > 0) {
        console.log(`Attempting to merge ${pdfPaths.length} PDFs into the final dossier`);
        
        for (const pdfPath of pdfPaths) {
          try {
            // Download the PDF from GCS
            const file = bucket.file(pdfPath);
            
            // Check if the file exists with detailed logging
            try {
              console.log(`Checking if file exists: ${pdfPath}`);
              const [exists] = await file.exists();
              console.log(`File ${pdfPath} exists: ${exists}`);
              
              if (exists) {
                try {
                  console.log(`Downloading file: ${pdfPath}`);
                  const [fileBuffer] = await file.download();
                  console.log(`Successfully downloaded file: ${pdfPath}, size: ${fileBuffer.length} bytes`);
                  
                  // Merge the PDF
                  try {
                    console.log(`Loading PDF: ${pdfPath}`);
                    const externalPdfDoc = await PDFDocument.load(fileBuffer);
                    console.log(`PDF loaded, copying pages from: ${pdfPath}`);
                    
                    const pageCount = externalPdfDoc.getPageCount();
                    console.log(`PDF has ${pageCount} pages`);
                    
                    const pageIndices = externalPdfDoc.getPageIndices();
                    console.log(`Getting ${pageIndices.length} page indices`);
                    
                    const copiedPages = await pdfDoc.copyPages(externalPdfDoc, pageIndices);
                    console.log(`Copied ${copiedPages.length} pages from: ${pdfPath}`);
                    
                    // Add each page to the main document
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
      }
    } catch (error) {
      console.error('Error merging PDFs:', error);
    }
    
    // Save the dossier
    const pdfBytes = await pdfDoc.save();
    
    // Define the path for the final dossier in GCS with the required naming convention
    // Add a timestamp to the filename to avoid overwriting existing files (which requires delete permission)
    const timestamp = Date.now();
    const gcsPath = `QMS/Inspections_Records/${inspectionOrder.inspectionOrderNumber}/Final Dossier/FD_${inspectionOrder.inspectionOrderNumber}_${timestamp}.pdf`;
    
    // Check if GCS bucket is available
    if (!bucket) {
      console.error('Cannot upload Final Dossier: GCS bucket not initialized');
      throw new Error('Storage not available - cannot upload Final Dossier');
    }
    
    // Log the file path we're using
    console.log(`Creating new Final Dossier at path: ${gcsPath}`);
    
    try {
      // Upload to GCS - set resumable: true to avoid checking if the file exists
      const file = bucket.file(gcsPath);
      
      // Create write stream with error handling
      const stream = file.createWriteStream({
        metadata: {
          contentType: 'application/pdf',
        },
        resumable: true, // Use resumable upload to avoid existence checks
      });
      
      // Upload the PDF buffer with detailed error logging
      await new Promise<void>((resolve, reject) => {
        const readable = new Readable();
        readable._read = () => {}; // _read is required but you can noop it
        readable.push(Buffer.from(pdfBytes));
        readable.push(null);
        
        // More detailed error handling during stream processing
        stream.on('error', (err) => {
          console.error('Error during file upload stream:', err);
          reject(new Error(`Upload stream error: ${err.message}`));
        });
        
        readable.on('error', (err) => {
          console.error('Error in readable stream:', err);
          reject(new Error(`Readable stream error: ${err.message}`));
        });
        
        readable
          .pipe(stream)
          .on('finish', () => {
            console.log(`Successfully uploaded Final Dossier to ${gcsPath}`);
            resolve();
          });
      });
      
      // Generate signed URL for download with error handling
      let url;
      try {
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // URL expires in 7 days
        });
        url = signedUrl;
        console.log('Successfully generated signed URL for Final Dossier');
      } catch (signedUrlError) {
        console.error('Error generating signed URL:', signedUrlError);
        console.log('File was uploaded but signed URL could not be generated');
        // Return file path only without URL
        return {
          url: '',
          path: gcsPath
        };
      }
    } catch (uploadError) {
      console.error('Error uploading Final Dossier file:', uploadError);
      throw new Error(`Failed to upload Final Dossier: ${uploadError.message}`);
    }
    
    return { 
      url, 
      path: gcsPath 
    };
  } catch (error) {
    console.error('Error generating final dossier:', error);
    throw error;
  }
}