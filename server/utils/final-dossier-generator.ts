import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { db } from '../db';
import { inspectionOrders, materialInspectionLinks } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { Storage } from '@google-cloud/storage';
import { Readable } from 'stream';
import { gcsCredentials, gcsBucketName } from './gcs-config';

// Initialize Google Cloud Storage
const storage = new Storage({
  credentials: gcsCredentials,
});
const bucket = storage.bucket(gcsBucketName);

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
    
    // Cover page content
    coverPage.drawText('FINAL QUALITY DOSSIER', {
      x: 150,
      y: 700,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    coverPage.drawText(`Inspection Order: ${inspectionOrder.inspectionOrderNumber}`, {
      x: 150,
      y: 650,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    coverPage.drawText(`Project: ${inspectionOrder.projectCode}`, {
      x: 150,
      y: 620,
      size: 14,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    
    coverPage.drawText(`Date: ${new Date().toLocaleDateString()}`, {
      x: 150,
      y: 590,
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
    
    yPosition = 650;
    if (materials.length > 0) {
      for (const material of materials) {
        materialPage.drawText(`Material ID: ${material.materialIdentificationId || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        materialPage.drawText(`Certificate: ${material.materialCertificateNumber || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        materialPage.drawText(`Heat Number: ${material.heatNumber || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        materialPage.drawText(`Grade: ${material.materialGrade || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        materialPage.drawText(`Specification: ${material.materialSpecification || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 25;
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
    
    yPosition = 650;
    if (weldRecords.length > 0) {
      for (const weld of weldRecords) {
        weldingPage.drawText(`Weld ID: ${weld.id || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        weldingPage.drawText(`Type: ${weld.weldType || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        weldingPage.drawText(`Process: ${weld.weldProcess || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        weldingPage.drawText(`WPQR Document: ${weld.wpqrDocument || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        weldingPage.drawText(`Welder ID: ${weld.welderId || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        weldingPage.drawText(`Status: ${weld.weldStatus || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 25;
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
    
    yPosition = 650;
    if (ndtRecords.length > 0) {
      for (const ndt of ndtRecords) {
        ndtPage.drawText(`NDT ID: ${ndt.id || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        ndtPage.drawText(`Method: ${ndt.ndtMethod || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        ndtPage.drawText(`Standard: ${ndt.ndtStandard || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        ndtPage.drawText(`Extent: ${ndt.ndtExtent || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        ndtPage.drawText(`Technician: ${ndt.ndtTechnician || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        ndtPage.drawText(`Date: ${ndt.ndtDate || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        ndtPage.drawText(`Results: ${ndt.ndtResults || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 25;
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
    
    yPosition = 650;
    if (visualRecords.length > 0) {
      for (const visual of visualRecords) {
        visualPage.drawText(`Visual Inspection ID: ${visual.id || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        visualPage.drawText(`Standard: ${visual.standard || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        visualPage.drawText(`Inspector: ${visual.inspector || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        visualPage.drawText(`Dimensional Checks: ${visual.dimensionalChecks || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        visualPage.drawText(`Surface Condition: ${visual.surfaceCondition || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        visualPage.drawText(`Inspection Date: ${visual.inspectionDate || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        visualPage.drawText(`Observations: ${visual.observations || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 25;
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
    
    yPosition = 650;
    if (ncrRecords.length > 0) {
      for (const ncr of ncrRecords) {
        ncrPage.drawText(`NCR ID: ${ncr.id || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        ncrPage.drawText(`Date: ${ncr.ncrDate || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        ncrPage.drawText(`Status: ${ncr.ncrStatus || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        ncrPage.drawText(`Description: ${ncr.ncrDescription || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        ncrPage.drawText(`Disposition: ${ncr.ncrDisposition || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 15;
        
        ncrPage.drawText(`Corrective Action: ${ncr.ncrCorrectiveAction || 'N/A'}`, {
          x: 70,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPosition -= 25;
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
    
    // Save the dossier
    const pdfBytes = await pdfDoc.save();
    
    // Define the path for the final dossier in GCS
    const gcsPath = `QMS/Inspections_Records/${inspectionOrder.inspectionOrderNumber}/Final_Dossier/${inspectionOrder.inspectionOrderNumber}_Final_Dossier.pdf`;
    
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