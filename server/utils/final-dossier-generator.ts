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

    // Helper function to fetch uploaded documents for each tab
    const fetchTabDocuments = async (tabName: string): Promise<string[]> => {
      try {
        const basePath = `QMS/Inspections_Records/${inspectionOrder.projectCode || 'UNKNOWN'}/${inspectionOrder.inspectionOrderNumber}/${tabName}/`;
        console.log(`🔍 Fetching documents for tab: ${tabName} at path: ${basePath}`);
        
        const files = await listFilesInDirectory(basePath);
        console.log(`📁 Found ${files.length} documents for ${tabName}:`, files);
        
        return files.filter(file => file && file.trim().length > 0);
      } catch (error) {
        console.error(`❌ Error fetching documents for ${tabName}:`, error);
        return [];
      }
    };

    // Helper function to add document references to a page
    const addDocumentReferences = (page: any, documents: string[], yPos: number, margin: number, helvetica: any) => {
      if (documents.length > 0) {
        page.drawText('Associated Documents:', {
          x: margin,
          y: yPos,
          size: 12,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 20;
        
        documents.forEach((doc, index) => {
          const fileName = doc.split('/').pop() || doc;
          page.drawText(`${index + 1}. ${fileName}`, {
            x: margin + 20,
            y: yPos,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0.8),
          });
          yPos -= 15;
        });
      }
      return yPos;
    };

    // Helper function to add a section page with consistent formatting
    const addSectionPage = (
      pdfDoc: PDFDocument,
      sectionNum: number,
      sectionTitle: string,
      hasData: boolean,
      helveticaBold: any,
      helvetica: any,
      margin: number,
      footerFunction: (page: any) => void,
      documents: string[] = []
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
      if (!hasData && documents.length === 0) {
        page.drawText('No records or documents available for this section.', {
          x: margin,
          y: 650,
          size: 12,
          font: helvetica,
          color: rgb(0.5, 0.5, 0.5),
        });
      } else if (!hasData && documents.length > 0) {
        page.drawText('No database records available, but the following documents are attached:', {
          x: margin,
          y: 650,
          size: 12,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        addDocumentReferences(page, documents, 620, margin, helvetica);
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

    // Fetch documents for each tab from GCS
    console.log('🚀 Starting document compilation for Final Dossier...');
    const [
      approvedDrawingDocs,
      dvrDocs,
      itpDocs,
      materialTraceabilityDocs,
      pmaDocs,
      procedureDocs,
      shopInspectionDocs,
      weldingDocs,
      ndtDocs,
      visualDocs,
      hydrotestDocs,
      ncrDocs,
      calibrationDocs
    ] = await Promise.all([
      fetchTabDocuments('ApprovedDrawing'),
      fetchTabDocuments('DVR'),
      fetchTabDocuments('ITP'),
      fetchTabDocuments('MaterialTraceability'),
      fetchTabDocuments('PMA'),
      fetchTabDocuments('Procedures'),
      fetchTabDocuments('ShopInspection'),
      fetchTabDocuments('Welding'),
      fetchTabDocuments('NDT'),
      fetchTabDocuments('Visual'),
      fetchTabDocuments('Hydrotest'),
      fetchTabDocuments('NCR'),
      fetchTabDocuments('Calibration')
    ]);

    console.log('📋 Document compilation summary:', {
      ApprovedDrawing: approvedDrawingDocs.length,
      DVR: dvrDocs.length,
      ITP: itpDocs.length,
      MaterialTraceability: materialTraceabilityDocs.length,
      PMA: pmaDocs.length,
      Procedures: procedureDocs.length,
      ShopInspection: shopInspectionDocs.length,
      Welding: weldingDocs.length,
      NDT: ndtDocs.length,
      Visual: visualDocs.length,
      Hydrotest: hydrotestDocs.length,
      NCR: ncrDocs.length,
      Calibration: calibrationDocs.length
    });

    // Parse inspection order data
    const approvedDrawingRecords = inspectionOrder.approvedDrawingData ? 
      JSON.parse(inspectionOrder.approvedDrawingData) : [];
    const dvrRecords = inspectionOrder.dvrData ? 
      JSON.parse(inspectionOrder.dvrData) : [];
    const itpRecords = inspectionOrder.itpData ? 
      JSON.parse(inspectionOrder.itpData) : [];
    const materialRecords = JSON.parse(inspectionOrder.materialTraceability || '[]');
    const pmaRecords = inspectionOrder.parsedPmaRecords ? 
      JSON.parse(inspectionOrder.parsedPmaRecords) : [];
    const procedureRecords = inspectionOrder.parsedProcedureRecords ? 
      JSON.parse(inspectionOrder.parsedProcedureRecords) : [];
    const shopInspectionRecords = inspectionOrder.parsedShopInspectionRecords ? 
      JSON.parse(inspectionOrder.parsedShopInspectionRecords) : [];
    const weldingRecords = JSON.parse(inspectionOrder.weldData || '[]');
    const ndtRecords = JSON.parse(inspectionOrder.ndtData || '[]');
    const visualRecords = JSON.parse(inspectionOrder.visualData || '[]');
    const hydrotestRecords = JSON.parse(inspectionOrder.hydrotestData || '[]');
    const ncrRecords = JSON.parse(inspectionOrder.ncrData || '[]');

    // Section 1: Approved Drawing
    const approvedDrawingPage = addSectionPage(pdfDoc, sectionNumber++, 'APPROVED DRAWING', approvedDrawingRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage, approvedDrawingDocs);
    
    if (approvedDrawingRecords.length > 0) {
      let yPos = 620;
      approvedDrawingPage.drawText('Approved Drawing Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 30;
      
      for (const drawing of approvedDrawingRecords) {
        // Draw drawing title
        if (drawing.drawingTitle) {
          approvedDrawingPage.drawText(`Drawing Title: ${drawing.drawingTitle}`, {
            x: pageMargin + 20,
            y: yPos,
            size: 10,
            font: helveticaBold,
            color: rgb(0, 0, 0),
          });
          yPos -= 15;
        }
        
        // Draw drawing number
        approvedDrawingPage.drawText(`Drawing Number: ${drawing.drawingNumber || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        // Draw revision
        approvedDrawingPage.drawText(`Revision: ${drawing.revision || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        // Draw approved by
        if (drawing.approvedBy) {
          approvedDrawingPage.drawText(`Approved By: ${drawing.approvedBy}`, {
            x: pageMargin + 20,
            y: yPos,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
          yPos -= 15;
        }
        
        // Draw approval date
        if (drawing.approvalDate) {
          approvedDrawingPage.drawText(`Approval Date: ${drawing.approvalDate}`, {
            x: pageMargin + 20,
            y: yPos,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
          yPos -= 15;
        }
        
        // Draw status
        if (drawing.status) {
          approvedDrawingPage.drawText(`Status: ${drawing.status}`, {
            x: pageMargin + 20,
            y: yPos,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
          yPos -= 15;
        }
        
        // Draw remarks
        if (drawing.remarks) {
          approvedDrawingPage.drawText(`Remarks: ${drawing.remarks}`, {
            x: pageMargin + 20,
            y: yPos,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
          yPos -= 15;
        }
        
        yPos -= 20; // Space between records
      }
      
      // Add document references if available
      if (approvedDrawingDocs.length > 0) {
        yPos = addDocumentReferences(approvedDrawingPage, approvedDrawingDocs, yPos - 20, pageMargin, helvetica);
      }
    } else {
      // Show basic drawing information from inspection order if no approved drawing records exist
      let yPos = 620;
      approvedDrawingPage.drawText('Basic Drawing Information:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 30;
      
      if (inspectionOrder.drawingNo) {
        approvedDrawingPage.drawText(`Drawing Number: ${inspectionOrder.drawingNo}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
      }
      
      if (inspectionOrder.itemCode) {
        approvedDrawingPage.drawText(`Item Code: ${inspectionOrder.itemCode}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
      }
      
      if (inspectionOrder.description) {
        const description = inspectionOrder.description.length > 80 
          ? inspectionOrder.description.substring(0, 80) + '...' 
          : inspectionOrder.description;
        approvedDrawingPage.drawText(`Description: ${description}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
      }
      
      yPos -= 20;
      approvedDrawingPage.drawText('Note: No detailed approved drawing records have been added to this inspection order.', {
        x: pageMargin + 20,
        y: yPos,
        size: 9,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
      yPos -= 15;
      approvedDrawingPage.drawText('Add approved drawing records in the inspection order to include detailed drawing information.', {
        x: pageMargin + 20,
        y: yPos,
        size: 9,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
      
      // Add document references even if no database records exist
      if (approvedDrawingDocs.length > 0) {
        yPos = addDocumentReferences(approvedDrawingPage, approvedDrawingDocs, yPos - 20, pageMargin, helvetica);
      }
    }

    // Section 2: Design Verification Report (DVR)
    const dvrPage = addSectionPage(pdfDoc, sectionNumber++, 'DESIGN VERIFICATION REPORT (DVR)', dvrRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage, dvrDocs);
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
    const itpPage = addSectionPage(pdfDoc, sectionNumber++, 'INSPECTION TEST PLAN (ITP)', itpRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage, itpDocs);
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
    const materialPage = addSectionPage(pdfDoc, sectionNumber++, 'MATERIAL TRACEABILITY', materialRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage, materialTraceabilityDocs);
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
      
      // Add document references
      if (materialTraceabilityDocs.length > 0) {
        yPos = addDocumentReferences(materialPage, materialTraceabilityDocs, yPos - 20, pageMargin, helvetica);
      }
    }

    // Section 5: Particular Material Appraisal (PMA)
    const pmaPage = addSectionPage(pdfDoc, sectionNumber++, 'PARTICULAR MATERIAL APPRAISAL (PMA)', pmaRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage, pmaDocs);
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
      
      // Add document references
      if (pmaDocs.length > 0) {
        yPos = addDocumentReferences(pmaPage, pmaDocs, yPos - 20, pageMargin, helvetica);
      }
    }

    // Section 6: Procedures
    const procedurePage = addSectionPage(pdfDoc, sectionNumber++, 'PROCEDURES', procedureRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage, procedureDocs);
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
      
      // Add document references
      if (procedureDocs.length > 0) {
        yPos = addDocumentReferences(procedurePage, procedureDocs, yPos - 20, pageMargin, helvetica);
      }
    }

    // Section 7: Shop Inspection
    const shopPage = addSectionPage(pdfDoc, sectionNumber++, 'SHOP INSPECTION', shopInspectionRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage, shopInspectionDocs);
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
      
      // Add document references
      if (shopInspectionDocs.length > 0) {
        yPos = addDocumentReferences(shopPage, shopInspectionDocs, yPos - 20, pageMargin, helvetica);
      }
    }

    // Section 8: Welding & Weld Maps
    const weldPage = addSectionPage(pdfDoc, sectionNumber++, 'WELDING & WELD MAPS', weldingRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage, weldingDocs);
    if (weldingRecords.length > 0) {
      let yPos = 620;
      weldPage.drawText('Welding Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 30;
      
      for (const weld of weldingRecords) {
        weldPage.drawText(`Weld ID: ${weld.id || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        weldPage.drawText(`Weld Type: ${weld.weldType || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        weldPage.drawText(`Weld Process: ${weld.weldProcess || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        weldPage.drawText(`WPQR Document: ${weld.wpqrDocument || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        weldPage.drawText(`Welder ID: ${weld.welderId || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        weldPage.drawText(`Status: ${weld.weldStatus || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
      
      // Add document references
      if (weldingDocs.length > 0) {
        yPos = addDocumentReferences(weldPage, weldingDocs, yPos - 20, pageMargin, helvetica);
      }
    }

    // Section 9: NDT Reports
    const ndtPage = addSectionPage(pdfDoc, sectionNumber++, 'NDT REPORTS', ndtRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage, ndtDocs);
    if (ndtRecords.length > 0) {
      let yPos = 620;
      ndtPage.drawText('NDT Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 30;
      
      for (const ndt of ndtRecords) {
        ndtPage.drawText(`NDT ID: ${ndt.id || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        ndtPage.drawText(`NDT Method: ${ndt.ndtMethod || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        ndtPage.drawText(`NDT Standard: ${ndt.ndtStandard || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        ndtPage.drawText(`NDT Extent: ${ndt.ndtExtent || 'N/A'}%`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        ndtPage.drawText(`NDT Technician: ${ndt.ndtTechnician || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        ndtPage.drawText(`Test Date: ${ndt.ndtDate || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        ndtPage.drawText(`Results: ${ndt.ndtResults || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
      
      // Add document references
      if (ndtDocs.length > 0) {
        yPos = addDocumentReferences(ndtPage, ndtDocs, yPos - 20, pageMargin, helvetica);
      }
    }

    // Section 10: Visual Inspection Records
    const visualPage = addSectionPage(pdfDoc, sectionNumber++, 'VISUAL INSPECTION RECORDS', visualRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage, visualDocs);
    if (visualRecords.length > 0) {
      let yPos = 620;
      visualPage.drawText('Visual Inspection Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 30;
      
      for (const visual of visualRecords) {
        visualPage.drawText(`Visual ID: ${visual.id || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        visualPage.drawText(`Standard: ${visual.standard || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        visualPage.drawText(`Inspector: ${visual.inspector || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        visualPage.drawText(`Dimensional Checks: ${visual.dimensionalChecks || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        visualPage.drawText(`Surface Condition: ${visual.surfaceCondition || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        visualPage.drawText(`Inspection Date: ${visual.inspectionDate || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        visualPage.drawText(`Observations: ${visual.observations || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 25;
      }
      
      // Add document references
      if (visualDocs.length > 0) {
        yPos = addDocumentReferences(visualPage, visualDocs, yPos - 20, pageMargin, helvetica);
      }
    }

    // Section 11: Hydrotest Reports
    const hydrotestPage = addSectionPage(pdfDoc, sectionNumber++, 'HYDROTEST REPORTS', hydrotestRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage, hydrotestDocs);
    if (hydrotestRecords.length > 0) {
      let yPos = 620;
      hydrotestPage.drawText('Hydrotest Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 30;
      
      for (const hydrotest of hydrotestRecords) {
        hydrotestPage.drawText(`Hydrotest ID: ${hydrotest.id || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        hydrotestPage.drawText(`Pressure: ${hydrotest.pressure || 'N/A'} bar`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        hydrotestPage.drawText(`Duration: ${hydrotest.duration || 'N/A'} minutes`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        hydrotestPage.drawText(`Medium: ${hydrotest.medium || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        hydrotestPage.drawText(`Pressure Gauge: ${hydrotest.pressureGauge || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        hydrotestPage.drawText(`Operator: ${hydrotest.operator || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        hydrotestPage.drawText(`Test Date: ${hydrotest.testDate || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        hydrotestPage.drawText(`Result: ${hydrotest.result || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        if (hydrotest.notes) {
          hydrotestPage.drawText(`Notes: ${hydrotest.notes}`, {
            x: pageMargin + 20,
            y: yPos,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
          yPos -= 15;
        }
        
        yPos -= 15; // Extra space between records
      }
      
      // Add document references
      if (hydrotestDocs.length > 0) {
        yPos = addDocumentReferences(hydrotestPage, hydrotestDocs, yPos - 20, pageMargin, helvetica);
      }
    }

    // Section 12: Non-Conformance Reports
    const ncrPage = addSectionPage(pdfDoc, sectionNumber++, 'NON-CONFORMANCE REPORTS', ncrRecords.length > 0, helveticaBold, helvetica, pageMargin, addFooterToPage, ncrDocs);
    if (ncrRecords.length > 0) {
      let yPos = 620;
      ncrPage.drawText('NCR Records:', {
        x: pageMargin,
        y: yPos,
        size: 12,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      yPos -= 30;
      
      for (const ncr of ncrRecords) {
        ncrPage.drawText(`NCR ID: ${ncr.id || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        ncrPage.drawText(`NCR Date: ${ncr.ncrDate || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        ncrPage.drawText(`Status: ${ncr.ncrStatus || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        if (ncr.ncrDescription) {
          const description = ncr.ncrDescription.length > 80 
            ? ncr.ncrDescription.substring(0, 80) + '...' 
            : ncr.ncrDescription;
          ncrPage.drawText(`Description: ${description}`, {
            x: pageMargin + 20,
            y: yPos,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
          yPos -= 15;
        }
        
        ncrPage.drawText(`Disposition: ${ncr.ncrDisposition || 'N/A'}`, {
          x: pageMargin + 20,
          y: yPos,
          size: 10,
          font: helvetica,
          color: rgb(0, 0, 0),
        });
        yPos -= 15;
        
        if (ncr.ncrCorrectiveAction) {
          const correctiveAction = ncr.ncrCorrectiveAction.length > 80 
            ? ncr.ncrCorrectiveAction.substring(0, 80) + '...' 
            : ncr.ncrCorrectiveAction;
          ncrPage.drawText(`Corrective Action: ${correctiveAction}`, {
            x: pageMargin + 20,
            y: yPos,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
          yPos -= 15;
        }
        
        yPos -= 20; // Extra space between records
      }
      
      // Add document references
      if (ncrDocs.length > 0) {
        yPos = addDocumentReferences(ncrPage, ncrDocs, yPos - 20, pageMargin, helvetica);
      }
    }

    // Section 13: Calibration Certificates
    const calibrationPage = addSectionPage(pdfDoc, sectionNumber++, 'CALIBRATION CERTIFICATES', false, helveticaBold, helvetica, pageMargin, addFooterToPage, calibrationDocs);

    // Generate PDF buffer
    const pdfBytes = await pdfDoc.save();

    // Upload to GCS with standardized path structure
    const fileName = `FD_${inspectionOrder.inspectionOrderNumber}.pdf`;
    const filePath = `QMS/Inspections_Records/${inspectionOrder.projectCode || 'UNKNOWN'}/${inspectionOrder.inspectionOrderNumber}/Final Dossier/${fileName}`;

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

// Function to check if final dossier already exists - overloaded for both ID and number
export async function checkExistingFinalDossier(inspectionOrderId: number): Promise<{ exists: boolean; path?: string; url?: string }>;
export async function checkExistingFinalDossier(inspectionOrderNumber: string): Promise<{ exists: boolean; path?: string; url?: string }>;
export async function checkExistingFinalDossier(inspectionOrderIdOrNumber: number | string): Promise<{ exists: boolean; path?: string; url?: string }> {
  try {
    let inspectionOrder;
    
    if (typeof inspectionOrderIdOrNumber === 'number') {
      console.log(`Checking existing final dossier for inspection order ID: ${inspectionOrderIdOrNumber}`);
      inspectionOrder = await db.query.inspectionOrders.findFirst({
        where: eq(inspectionOrders.id, inspectionOrderIdOrNumber)
      });
    } else {
      console.log(`Checking existing final dossier for inspection order number: ${inspectionOrderIdOrNumber}`);
      inspectionOrder = await db.query.inspectionOrders.findFirst({
        where: eq(inspectionOrders.inspectionOrderNumber, inspectionOrderIdOrNumber)
      });
    }
    
    if (!inspectionOrder) {
      console.log('Inspection order not found in database');
      console.log(`Searched by: ${typeof inspectionOrderIdOrNumber === 'number' ? 'ID' : 'number'} = ${inspectionOrderIdOrNumber}`);
      return { exists: false };
    }

    console.log(`Found inspection order: ${inspectionOrder.inspectionOrderNumber} with project code: ${inspectionOrder.projectCode}`);

    // Check for existing final dossier in GCS using standardized path
    const basePath = `QMS/Inspections_Records/${inspectionOrder.projectCode || 'UNKNOWN'}/${inspectionOrder.inspectionOrderNumber}/Final Dossier/`;
    const expectedFileName = `FD_${inspectionOrder.inspectionOrderNumber}.pdf`;
    const expectedFilePath = `${basePath}${expectedFileName}`;
    console.log(`🔍 GCS PATH DEBUG:`);
    console.log(`  - Project Code: ${inspectionOrder.projectCode || 'UNKNOWN'}`);
    console.log(`  - Inspection Order: ${inspectionOrder.inspectionOrderNumber}`);
    console.log(`  - Base Path: ${basePath}`);
    console.log(`  - Expected File Name: ${expectedFileName}`);
    console.log(`  - Full Expected Path: ${expectedFilePath}`);
    
    // First, try to check if the exact expected file exists
    try {
      console.log(`Checking if exact file exists: ${expectedFilePath}`);
      const fileExists = await bucket.file(expectedFilePath).exists();
      
      if (fileExists[0]) {
        console.log('Found exact expected file, generating signed URL');
        
        // Generate signed URL for the existing file
        try {
          const [signedUrl] = await bucket.file(expectedFilePath).getSignedUrl({
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
          });
          
          console.log('Successfully generated signed URL for existing file');
          return {
            exists: true,
            path: expectedFilePath,
            url: signedUrl
          };
        } catch (signedUrlError) {
          console.error('Error generating signed URL for existing file:', signedUrlError);
          return {
            exists: true,
            path: expectedFilePath,
            url: expectedFilePath // Fallback to path if signed URL fails
          };
        }
      } else {
        console.log('Exact expected file not found, checking directory for any PDF files');
      }
    } catch (exactFileError) {
      console.log('Error checking exact file:', exactFileError);
    }

    // If exact file not found, scan directory for any PDF files (legacy support)
    try {
      console.log(`📂 FALLBACK DIRECTORY SCAN:`);
      console.log(`  - Scanning directory: ${basePath}`);
      const existingFiles = await listFilesInDirectory(basePath);
      console.log(`  - Found ${existingFiles.length} total files in directory`);
      console.log(`  - File list:`, existingFiles);
      
      // Filter out .keep files and get only PDF files
      const pdfFiles = existingFiles.filter(file => 
        file && 
        file.endsWith('.pdf') && 
        !file.endsWith('/.keep')
      );
      
      console.log(`  - Found ${pdfFiles.length} PDF files:`, pdfFiles);
      
      if (pdfFiles.length > 0) {
        // Get the latest file (assuming files are sorted by date in filename)
        const latestFile = pdfFiles[pdfFiles.length - 1]; 
        const filePath = latestFile;
        
        console.log('Using legacy file path for signed URL:', filePath);
        
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
          
          console.log('Successfully generated signed URL for legacy file');
          return {
            exists: true,
            path: filePath,
            url: signedUrl
          };
        } catch (signedUrlError) {
          console.error('Error generating signed URL for legacy file:', signedUrlError);
          return {
            exists: true,
            path: filePath,
            url: filePath // Fallback to path if signed URL fails
          };
        }
      } else {
        console.log('No PDF files found in directory');
      }
    } catch (error) {
      console.log('Error listing files in directory:', error);
    }

    console.log('Returning exists: false');
    return { exists: false };
  } catch (error) {
    console.error('Error checking existing final dossier:', error);
    return { exists: false };
  }
}