import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { uploadFileWithDiagnostics } from './gcs-enhanced-upload';
import type { InspectionOrder } from '../../shared/schema';

import { db } from '../db';
import { inspectionOrders } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { listFilesInDirectory } from './list-gcs-files';
import { Storage } from '@google-cloud/storage';

// Initialize GCS
const storage = new Storage();
const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET || 'thermopac_storage');

export async function generateFinalDossierPDF(
  inspectionOrder: InspectionOrder,
  documents: { [key: string]: any[] }
): Promise<string | null> {
  try {
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    const pageMargin = 50;
    let sectionNumber = 1;

    // Helper function to add a section page with consistent formatting
    const addSectionPage = (
      pdfDoc: PDFDocument,
      sectionNum: number,
      sectionTitle: string,
      hasData: boolean,
      helveticaBold: any,
      helvetica: any,
      margin: number,
      footerFunction: (page: any) => void
    ) => {
      const page = pdfDoc.addPage([612, 792]);
      
      // Add section title
      page.drawText(`${sectionNum}. ${sectionTitle}`, {
        x: margin,
        y: 700,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });

      // Add appropriate content based on data availability
      if (!hasData) {
        page.drawText('No records available for this section.', {
          x: margin,
          y: 650,
          size: 12,
          font: helvetica,
          color: rgb(0.5, 0.5, 0.5),
        });
      }

      footerFunction(page);
      return page;
    };

    // Helper function to add footer to pages
    const addFooterToPage = (page: any) => {
      page.drawText(`Final Dossier - ${inspectionOrder.inspectionOrderNumber}`, {
        x: 50,
        y: 30,
        size: 8,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
      
      const currentDate = new Date().toLocaleDateString();
      page.drawText(`Generated: ${currentDate}`, {
        x: 450,
        y: 30,
        size: 8,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    };

    // Cover Page
    const coverPage = pdfDoc.addPage([612, 792]);
    coverPage.drawText('FINAL DOSSIER', {
      x: 200,
      y: 600,
      size: 24,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    coverPage.drawText(`Inspection Order: ${inspectionOrder.inspectionOrderNumber}`, {
      x: 150,
      y: 550,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });
    
    if (inspectionOrder.project) {
      coverPage.drawText(`Project: ${inspectionOrder.project}`, {
        x: 150,
        y: 500,
        size: 14,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }

    addFooterToPage(coverPage);

    // Table of Contents with exact UI tab sequence
    const tocPage = pdfDoc.addPage([612, 792]);
    tocPage.drawText('TABLE OF CONTENTS', {
      x: pageMargin,
      y: 700,
      size: 16,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    });

    const tocSections = [
      '1. Approved Drawing',
      '2. Design Verification Report (DVR)',
      '3. Inspection Test Plan (ITP)',
      '4. Material Traceability',
      '5. Particular Material Appraisal (PMA)',
      '6. Procedures',
      '7. Shop Inspection',
      '8. Welding & Weld Maps',
      '9. NDT Reports',
      '10. Visual Inspection Records',
      '11. Hydrotest Reports',
      '12. Non-Conformance Reports',
      '13. Calibration Certificates'
    ];

    let tocYPosition = 650;
    for (const section of tocSections) {
      tocPage.drawText(section, {
        x: pageMargin,
        y: tocYPosition,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
      tocYPosition -= 20;
    }

    addFooterToPage(tocPage);

    // Parse inspection order data
    const approvedDrawingRecords = inspectionOrder.parsedApprovedDrawingRecords ? 
      JSON.parse(inspectionOrder.parsedApprovedDrawingRecords) : [];
    const dvrRecords = inspectionOrder.parsedDvrRecords ? 
      JSON.parse(inspectionOrder.parsedDvrRecords) : [];
    const itpRecords = inspectionOrder.parsedItpRecords ? 
      JSON.parse(inspectionOrder.parsedItpRecords) : [];
    const materialRecords = JSON.parse(inspectionOrder.materialTraceability || '[]');
    const pmaRecords = inspectionOrder.parsedPmaRecords ? 
      JSON.parse(inspectionOrder.parsedPmaRecords) : [];
    const procedureRecords = inspectionOrder.parsedProcedureRecords ? 
      JSON.parse(inspectionOrder.parsedProcedureRecords) : [];
    const shopInspectionRecords = inspectionOrder.parsedShopInspectionRecords ? 
      JSON.parse(inspectionOrder.parsedShopInspectionRecords) : [];
    const weldingRecords = JSON.parse(inspectionOrder.welding || '[]');
    const ndtRecords = JSON.parse(inspectionOrder.ndt || '[]');
    const visualRecords = JSON.parse(inspectionOrder.visual || '[]');
    const hydrotestRecords = JSON.parse(inspectionOrder.hydrotest || '[]');
    const ncrRecords = JSON.parse(inspectionOrder.ncr || '[]');

    // Section 1: Approved Drawing
    const approvedDrawingPage = addSectionPage(pdfDoc, sectionNumber++, 'APPROVED DRAWING', approvedDrawingRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage);
    if (approvedDrawingRecords.length > 0) {
      let yPos = 620;
      approvedDrawingPage.drawText('Approved Drawing Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      for (const drawing of approvedDrawingRecords) {
        approvedDrawingPage.drawText(`- Drawing Number: ${drawing.drawingNumber || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        approvedDrawingPage.drawText(`- Revision: ${drawing.revision || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
    }

    // Section 2: Design Verification Report (DVR)
    const dvrPage = addSectionPage(pdfDoc, sectionNumber++, 'DESIGN VERIFICATION REPORT (DVR)', dvrRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage);
    if (dvrRecords.length > 0) {
      let yPos = 620;
      dvrPage.drawText('DVR Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      for (const dvr of dvrRecords) {
        dvrPage.drawText(`- Verification Type: ${dvr.verificationType || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        dvrPage.drawText(`- Status: ${dvr.status || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
    }

    // Section 3: Inspection Test Plan (ITP)
    const itpPage = addSectionPage(pdfDoc, sectionNumber++, 'INSPECTION TEST PLAN (ITP)', itpRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage);
    if (itpRecords.length > 0) {
      let yPos = 620;
      itpPage.drawText('ITP Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      for (const itp of itpRecords) {
        itpPage.drawText(`- Test Description: ${itp.testDescription || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        itpPage.drawText(`- Acceptance Criteria: ${itp.acceptanceCriteria || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
    }

    // Section 4: Material Traceability
    const materialPage = addSectionPage(pdfDoc, sectionNumber++, 'MATERIAL TRACEABILITY', materialRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage);
    if (materialRecords.length > 0) {
      let yPos = 620;
      materialPage.drawText('Material Traceability Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      for (const material of materialRecords) {
        materialPage.drawText(`- Material ID: ${material.materialId || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        materialPage.drawText(`- Description: ${material.description || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
    }

    // Section 5: Particular Material Appraisal (PMA)
    const pmaPage = addSectionPage(pdfDoc, sectionNumber++, 'PARTICULAR MATERIAL APPRAISAL (PMA)', pmaRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage);
    if (pmaRecords.length > 0) {
      let yPos = 620;
      pmaPage.drawText('PMA Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      for (const pma of pmaRecords) {
        pmaPage.drawText(`- PMA Number: ${pma.pmaNumber || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        pmaPage.drawText(`- Material Grade: ${pma.materialGrade || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
    }

    // Section 6: Procedures
    const procedurePage = addSectionPage(pdfDoc, sectionNumber++, 'PROCEDURES', procedureRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage);
    if (procedureRecords.length > 0) {
      let yPos = 620;
      procedurePage.drawText('Procedure Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      for (const procedure of procedureRecords) {
        procedurePage.drawText(`- Procedure Number: ${procedure.procedureNumber || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        procedurePage.drawText(`- NDT Method: ${procedure.ndtMethod || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
    }

    // Section 7: Shop Inspection
    const shopPage = addSectionPage(pdfDoc, sectionNumber++, 'SHOP INSPECTION', shopInspectionRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage);
    if (shopInspectionRecords.length > 0) {
      let yPos = 620;
      shopPage.drawText('Shop Inspection Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      for (const shop of shopInspectionRecords) {
        shopPage.drawText(`- Inspection Type: ${shop.inspectionType || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        shopPage.drawText(`- Inspector: ${shop.inspector || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
    }

    // Section 8: Welding & Weld Maps
    const weldPage = addSectionPage(pdfDoc, sectionNumber++, 'WELDING & WELD MAPS', weldingRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage);
    if (weldingRecords.length > 0) {
      let yPos = 620;
      weldPage.drawText('Welding Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      for (const weld of weldingRecords) {
        weldPage.drawText(`- Weld Type: ${weld.weldType || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        weldPage.drawText(`- Welder ID: ${weld.welderId || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
    }

    // Section 9: NDT Reports
    const ndtPage = addSectionPage(pdfDoc, sectionNumber++, 'NDT REPORTS', ndtRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage);
    if (ndtRecords.length > 0) {
      let yPos = 620;
      ndtPage.drawText('NDT Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      for (const ndt of ndtRecords) {
        ndtPage.drawText(`- NDT Method: ${ndt.ndtMethod || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        ndtPage.drawText(`- Results: ${ndt.ndtResults || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
    }

    // Section 10: Visual Inspection Records
    const visualPage = addSectionPage(pdfDoc, sectionNumber++, 'VISUAL INSPECTION RECORDS', visualRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage);
    if (visualRecords.length > 0) {
      let yPos = 620;
      visualPage.drawText('Visual Inspection Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      for (const visual of visualRecords) {
        visualPage.drawText(`- Standard: ${visual.standard || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        visualPage.drawText(`- Inspector: ${visual.inspector || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
    }

    // Section 11: Hydrotest Reports
    const hydrotestPage = addSectionPage(pdfDoc, sectionNumber++, 'HYDROTEST REPORTS', hydrotestRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage);
    if (hydrotestRecords.length > 0) {
      let yPos = 620;
      hydrotestPage.drawText('Hydrotest Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      for (const hydrotest of hydrotestRecords) {
        hydrotestPage.drawText(`- Pressure: ${hydrotest.pressure || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        hydrotestPage.drawText(`- Result: ${hydrotest.result || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
    }

    // Section 12: Non-Conformance Reports
    const ncrPage = addSectionPage(pdfDoc, sectionNumber++, 'NON-CONFORMANCE REPORTS', ncrRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage);
    if (ncrRecords.length > 0) {
      let yPos = 620;
      ncrPage.drawText('NCR Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      for (const ncr of ncrRecords) {
        ncrPage.drawText(`- Description: ${ncr.description || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        ncrPage.drawText(`- Status: ${ncr.status || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
    }

    // Section 13: Calibration Certificates
    const calibrationPage = addSectionPage(pdfDoc, sectionNumber++, 'CALIBRATION CERTIFICATES', false, helveticaBold, helvetica, pageMargin, addFooterToPage);

    // Generate PDF buffer
    const pdfBytes = await pdfDoc.save();

    // Upload to GCS with proper hierarchical path structure
    const fileName = `Final_Dossier_${inspectionOrder.inspectionOrderNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
    const filePath = `QMS/Inspections_Records/${inspectionOrder.projectCode || 'UNKNOWN'}/${inspectionOrder.inspectionOrderNumber}/Final_Dossier/${fileName}`;

    try {
      const uploadResult = await uploadFileWithDiagnostics(
        filePath,
        Buffer.from(pdfBytes),
        'application/pdf'
      );

      if (uploadResult.successful) {
        console.log('Final Dossier PDF uploaded successfully to:', filePath);
        
        // Generate signed URL for immediate viewing
        try {
          const [signedUrl] = await bucket.file(filePath).getSignedUrl({
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
          });
          
          return { path: filePath, url: signedUrl };
        } catch (signedUrlError) {
          console.error('Error generating signed URL:', signedUrlError);
          return { path: filePath, url: null };
        }
      } else {
        console.error('Failed to upload Final Dossier PDF:', uploadResult.error);
        return null;
      }
    } catch (uploadError) {
      console.error('Upload error for Final Dossier PDF:', uploadError);
      return null;
    }

  } catch (error) {
    console.error('Error generating Final Dossier PDF:', error);
    return null;
  }
}

// Main function to generate final dossier (compatible with routes)
export async function generateFinalDossier(inspectionOrderId: number): Promise<{ url?: string; path?: string }> {
  try {
    console.log(`Starting Final Dossier generation for inspection order ID: ${inspectionOrderId}`);
    
    // Get inspection order from database
    const inspectionOrder = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.id, inspectionOrderId)
    });
    
    if (!inspectionOrder) {
      throw new Error(`Inspection order with ID ${inspectionOrderId} not found`);
    }

    console.log(`Found inspection order: ${inspectionOrder.inspectionOrderNumber}`);

    // Get associated documents (this can be empty for now)
    const documents: { [key: string]: any[] } = {};

    // Generate the PDF
    const uploadResult = await generateFinalDossierPDF(inspectionOrder, documents);
    
    if (uploadResult && uploadResult.path) {
      console.log(`Final Dossier generated successfully at: ${uploadResult.path}`);
      return {
        path: uploadResult.path,
        url: uploadResult.url || uploadResult.path
      };
    } else {
      throw new Error('Failed to generate Final Dossier PDF');
    }
  } catch (error) {
    console.error('Error in generateFinalDossier:', error);
    throw error;
  }
}

// Function to check if final dossier already exists
export async function checkExistingFinalDossier(inspectionOrderId: number): Promise<{ exists: boolean; path?: string; url?: string }> {
  try {
    const inspectionOrder = await db.query.inspectionOrders.findFirst({
      where: eq(inspectionOrders.id, inspectionOrderId)
    });
    
    if (!inspectionOrder) {
      return { exists: false };
    }

    // Check for existing final dossier in GCS
    const basePath = `QMS/Inspections_Records/${inspectionOrder.projectCode || 'UNKNOWN'}/${inspectionOrder.inspectionOrderNumber}/Final_Dossier/`;
    
    try {
      const existingFiles = await listFilesInDirectory(basePath);
      
      // Filter out .keep files and get only PDF files
      const pdfFiles = existingFiles.filter(file => 
        file.name && 
        file.name.endsWith('.pdf') && 
        !file.name.endsWith('/.keep')
      );
      
      console.log('Found PDF files:', pdfFiles.map(f => f.name));
      
      if (pdfFiles.length > 0) {
        // Get the latest file (assuming files are sorted by date in filename)
        const latestFile = pdfFiles[pdfFiles.length - 1]; 
        const filePath = latestFile.name;
        
        console.log('Using file path for signed URL:', filePath);
        
        // Validate file path
        if (!filePath || typeof filePath !== 'string') {
          console.error('Invalid file path:', filePath);
          return { exists: false };
        }
        
        // Generate signed URL for the existing file
        try {
          const [signedUrl] = await bucket.file(filePath).getSignedUrl({
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
          });
          
          return {
            exists: true,
            path: filePath,
            url: signedUrl
          };
        } catch (signedUrlError) {
          console.error('Error generating signed URL for existing file:', signedUrlError);
          return {
            exists: true,
            path: filePath,
            url: filePath // Fallback to path if signed URL fails
          };
        }
      }
    } catch (error) {
      console.log('No existing final dossier found or error checking:', error);
    }

    return { exists: false };
  } catch (error) {
    console.error('Error checking existing final dossier:', error);
    return { exists: false };
  }
}