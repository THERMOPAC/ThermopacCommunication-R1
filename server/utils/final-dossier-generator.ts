import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { db } from '../db';
import { inspectionOrders, materialInspectionLinks } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { Storage } from '@google-cloud/storage';
import { Readable } from 'stream';
import { gcsCredentials, gcsBucketName } from './gcs-config';
import { listFiles } from './list-gcs-files';

// Initialize Google Cloud Storage
const storage = new Storage({
  credentials: gcsCredentials,
});
const bucket = storage.bucket(gcsBucketName);

/**
 * Check if a final dossier already exists for an inspection order
 */
export async function checkExistingFinalDossier(inspectionOrderNumber: string): Promise<{ exists: boolean, url: string, path: string }> {
  try {
    // Define the expected path for the final dossier in GCS
    const expectedPath = `QMS/Inspections_Records/${inspectionOrderNumber}/Final Dossier/FD_${inspectionOrderNumber}.pdf`;
    
    // Check if the file exists in GCS
    const file = bucket.file(expectedPath);
    const [exists] = await file.exists();
    
    if (exists) {
      // Generate signed URL for download if file exists
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // URL expires in 7 days
      });
      
      return {
        exists: true,
        url,
        path: expectedPath
      };
    }
    
    return {
      exists: false,
      url: '',
      path: expectedPath
    };
  } catch (error) {
    console.error('Error checking for existing final dossier:', error);
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
    const materials = await db.query.materialInspectionLinks.findMany({
      where: eq(materialInspectionLinks.inspectionOrderId, inspectionOrderId),
    });

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
    
    // Try to add company logo to the top-right corner
    try {
      // Use a direct path approach instead of __dirname
      const logoPath = './client/public/images/thermopac-logo.jpg';
      console.log('Logo path:', logoPath);
      
      const logoImageBytes = fs.readFileSync(logoPath);
      
      // Embed the image in the PDF
      const logoImage = await pdfDoc.embedJpg(logoImageBytes);
      
      // Get the dimensions of the image
      const logoDims = logoImage.scale(0.4); // Scale down the logo to 40% of its original size
      
      // Draw the logo in the top-right corner
      coverPage.drawImage(logoImage, {
        x: 612 - logoDims.width - 50, // Position from right edge with 50pt margin
        y: 792 - logoDims.height - 50, // Position from top edge with 50pt margin
        width: logoDims.width,
        height: logoDims.height,
      });
      
      console.log('Successfully added company logo to the cover page');
    } catch (error) {
      console.error('Error adding company logo to cover page:', error);
    }
    
    // Cover page content
    coverPage.drawText('FINAL QUALITY DOSSIER', {
      x: 150,
      y: 700,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Define dossier number (FD prefix followed by inspection order number)
    const dossierNumber = `FD_${inspectionOrder.inspectionOrderNumber}`;
    
    coverPage.drawText(`Final Dossier No: ${dossierNumber}`, {
      x: 150,
      y: 650,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    coverPage.drawText(`Inspection Order: ${inspectionOrder.inspectionOrderNumber}`, {
      x: 150,
      y: 620,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    coverPage.drawText(`Project: ${inspectionOrder.projectCode}`, {
      x: 150,
      y: 590,
      size: 14,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    coverPage.drawText(`Date: ${new Date().toLocaleDateString()}`, {
      x: 150,
      y: 560,
      size: 14,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    // Add table of contents
    const tocPage = pdfDoc.addPage([612, 792]);
    tocPage.drawText('TABLE OF CONTENTS', {
      x: 50,
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
        x: 70,
        y: yPosition,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      yPosition -= 25;
    }
    
    // Add material traceability section
    const materialPage = pdfDoc.addPage([612, 792]);
    materialPage.drawText('1. MATERIAL TRACEABILITY', {
      x: 50,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw table headers
    yPosition = 650;
    
    // Draw table header
    materialPage.drawText('Material ID', {
      x: 70,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    materialPage.drawText('Certificate', {
      x: 170,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    materialPage.drawText('Heat Number', {
      x: 270,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    materialPage.drawText('Grade', {
      x: 370,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    materialPage.drawText('Specification', {
      x: 470,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw a line under headers
    materialPage.drawLine({
      start: { x: 70, y: yPosition - 5 },
      end: { x: 540, y: yPosition - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 20;
    
    if (materials.length > 0) {
      for (const material of materials) {
        // Draw material data in single-line tabular format
        materialPage.drawText(material.materialIdentificationId || 'N/A', {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        materialPage.drawText(material.materialCertificateNumber || 'N/A', {
          x: 170,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        materialPage.drawText(material.heatNumber || 'N/A', {
          x: 270,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        materialPage.drawText(material.materialGrade || 'N/A', {
          x: 370,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        materialPage.drawText(material.materialSpecification || 'N/A', {
          x: 470,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        // Draw a light line between rows
        if (materials.length > 1) {
          materialPage.drawLine({
            start: { x: 70, y: yPosition - 5 },
            end: { x: 540, y: yPosition - 5 },
            thickness: 0.5,
            color: rgb(0.8, 0.8, 0.8),
          });
        }
        
        yPosition -= 20;
      }
    } else {
      materialPage.drawText('No material traceability records found.', {
        x: 70,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
    
    // Add welding section
    const weldingPage = pdfDoc.addPage([612, 792]);
    weldingPage.drawText('2. WELDING & WELD MAPS', {
      x: 50,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw table headers
    yPosition = 650;
    
    // Draw table header
    weldingPage.drawText('Weld ID', {
      x: 70,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    weldingPage.drawText('Type', {
      x: 140,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    weldingPage.drawText('Process', {
      x: 210,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    weldingPage.drawText('WPQR Doc', {
      x: 280,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    weldingPage.drawText('Welder ID', {
      x: 370,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    weldingPage.drawText('Status', {
      x: 470,
      y: yPosition,
      size: 10,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    // Draw a line under headers
    weldingPage.drawLine({
      start: { x: 70, y: yPosition - 5 },
      end: { x: 540, y: yPosition - 5 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    
    yPosition -= 20;
    
    if (weldRecords.length > 0) {
      for (const weld of weldRecords) {
        // Draw weld data in single-line tabular format
        weldingPage.drawText(weld.id || 'N/A', {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        weldingPage.drawText(weld.weldType || 'N/A', {
          x: 140,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        weldingPage.drawText(weld.weldProcess || 'N/A', {
          x: 210,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        weldingPage.drawText(weld.wpqrDocument || 'N/A', {
          x: 280,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        weldingPage.drawText(weld.welderId || 'N/A', {
          x: 370,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        weldingPage.drawText(weld.weldStatus || 'N/A', {
          x: 470,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        
        // Draw a light line between rows
        if (weldRecords.length > 1) {
          weldingPage.drawLine({
            start: { x: 70, y: yPosition - 5 },
            end: { x: 540, y: yPosition - 5 },
            thickness: 0.5,
            color: rgb(0.8, 0.8, 0.8),
          });
        }
        
        yPosition -= 20;
      }
    } else {
      weldingPage.drawText('No welding records found.', {
        x: 70,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
    
    // Add NDT section
    const ndtPage = pdfDoc.addPage([612, 792]);
    ndtPage.drawText('3. NDT REPORTS', {
      x: 50,
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
      x: 50,
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
      x: 50,
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
      x: 50,
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
        
        for (const material of materials) {
          const materialId = material.materialIdentificationId;
          if (materialId) {
            const materialDocsPath = `QMS/Material_Identification/${materialId}`;
            const materialDocs = await listFiles(materialDocsPath);
            
            if (materialDocs.length > 0) {
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
                    x: 50,
                    y: 700,
                    size: 16,
                    font: helveticaBold,
                    color: rgb(0, 0, 0),
                  });
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
                x: 50,
                y: 700,
                size: 16,
                font: helveticaBold,
                color: rgb(0, 0, 0),
              });
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
    
    // Attempt to merge actual document PDFs as appendices
    try {
      // List of PDFs to merge
      const pdfPaths: string[] = [];
      
      // Collect material certificate PDFs
      for (const material of materials) {
        const materialId = material.materialIdentificationId;
        if (materialId) {
          const materialDocsPath = `QMS/Material_Identification/${materialId}`;
          const materialDocs = await listFiles(materialDocsPath);
          for (const docPath of materialDocs) {
            if (docPath.toLowerCase().endsWith('.pdf')) {
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
      
      // Merge PDFs
      if (pdfPaths.length > 0) {
        console.log(`Attempting to merge ${pdfPaths.length} PDFs into the final dossier`);
        
        for (const pdfPath of pdfPaths) {
          try {
            // Download the PDF from GCS
            const file = bucket.file(pdfPath);
            const [exists] = await file.exists();
            
            if (exists) {
              const [fileBuffer] = await file.download();
              
              // Merge the PDF
              const externalPdfDoc = await PDFDocument.load(fileBuffer);
              const copiedPages = await pdfDoc.copyPages(externalPdfDoc, externalPdfDoc.getPageIndices());
              
              // Add each page to the main document
              for (const copiedPage of copiedPages) {
                pdfDoc.addPage(copiedPage);
              }
              
              console.log(`Successfully merged PDF: ${pdfPath}`);
            }
          } catch (error) {
            console.error(`Error merging PDF ${pdfPath}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error merging PDFs:', error);
    }
    
    // Save the dossier
    const pdfBytes = await pdfDoc.save();
    
    // Define the path for the final dossier in GCS with the required naming convention
    // We're using the standardized format: /QMS/Inspections_Records/{Inspection Order No}/Final Dossier/FD_{Inspection Order No}.pdf
    const gcsPath = `QMS/Inspections_Records/${inspectionOrder.inspectionOrderNumber}/Final Dossier/FD_${inspectionOrder.inspectionOrderNumber}.pdf`;
    
    // Upload to GCS
    const file = bucket.file(gcsPath);
    const stream = file.createWriteStream({
      metadata: {
        contentType: 'application/pdf',
      },
      resumable: false,
    });
    
    // Upload the PDF buffer
    await new Promise<void>((resolve, reject) => {
      const readable = new Readable();
      readable._read = () => {}; // _read is required but you can noop it
      readable.push(Buffer.from(pdfBytes));
      readable.push(null);
      
      readable
        .pipe(stream)
        .on('error', reject)
        .on('finish', resolve);
    });

    // Generate signed URL for download
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // URL expires in 7 days
    });
    
    return { 
      url, 
      path: gcsPath 
    };
  } catch (error) {
    console.error('Error generating final dossier:', error);
    throw error;
  }
}