import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { uploadFileWithDiagnostics } from './gcs-enhanced-upload';
import type { InspectionOrder } from '../../shared/schema';

import { db } from '../db';
import { inspectionOrders, materialIdentification, testProcedures, calibrationInstruments } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { listFilesInDirectory } from './list-gcs-files';
import { initializeGCS } from './gcs-operations';

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

    // Helper function to download PDF file from GCS
    const downloadPDFFromGCS = async (filePath: string): Promise<Buffer | null> => {
      try {
        console.log(`📥 Downloading PDF from: ${filePath}`);
        
        // Get properly initialized GCS bucket
        const { bucket } = await initializeGCS();
        if (!bucket) {
          console.error('❌ Failed to initialize GCS bucket for PDF download');
          return null;
        }
        
        const [fileBuffer] = await bucket.file(filePath).download();
        console.log(`✅ Successfully downloaded PDF: ${filePath.split('/').pop()}`);
        return fileBuffer;
      } catch (error) {
        console.error(`❌ Error downloading PDF ${filePath}:`, error);
        return null;
      }
    };

    // Helper function to fetch uploaded documents for each tab
    const fetchTabDocuments = async (tabName: string): Promise<string[]> => {
      try {
        // Handle special cases for PMA and Procedures which have different storage locations
        if (tabName === 'PMA') {
          return await fetchPMADocuments();
        }
        if (tabName === 'Procedures') {
          return await fetchProceduresDocuments();
        }
        
        const basePath = `QMS/Inspections_Records/${inspectionOrder.projectCode || 'UNKNOWN'}/${inspectionOrder.inspectionOrderNumber}/${tabName}/`;
        console.log(`🔍 Fetching documents for tab: ${tabName} at path: ${basePath}`);
        
        const files = await listFilesInDirectory(basePath);
        const pdfFiles = files.filter(file => file && file.trim().length > 0 && file.toLowerCase().endsWith('.pdf'));
        console.log(`📁 Found ${pdfFiles.length} PDF documents for ${tabName}:`, pdfFiles);
        
        return pdfFiles;
      } catch (error) {
        console.error(`❌ Error fetching documents for ${tabName}:`, error);
        return [];
      }
    };

    // Helper function to fetch PMA documents from their actual storage location
    const fetchPMADocuments = async (): Promise<string[]> => {
      try {
        const pmaRecords = JSON.parse(inspectionOrder.pmaData || '[]');
        const pmaDocs: string[] = [];
        
        console.log(`🔍 Fetching PMA documents for ${pmaRecords.length} PMA records`);
        
        for (const pma of pmaRecords) {
          if (pma.pmaNumber) {
            // PMA documents are stored at QMS/PMA_Records/{pmaNumber}.pdf
            const pmaPath = `QMS/PMA_Records/${pma.pmaNumber}.pdf`;
            try {
              const { bucket } = await initializeGCS();
              if (bucket) {
                const [exists] = await bucket.file(pmaPath).exists();
                if (exists) {
                  pmaDocs.push(pmaPath);
                  console.log(`✅ Found PMA document: ${pmaPath}`);
                } else {
                  console.log(`❌ PMA document not found: ${pmaPath}`);
                }
              }
            } catch (e) {
              console.log(`❌ Error checking PMA document: ${pmaPath}`, e);
            }
          }
        }
        
        console.log(`📁 Found ${pmaDocs.length} PMA PDF documents total`);
        return pmaDocs;
      } catch (error) {
        console.error(`❌ Error fetching PMA documents:`, error);
        return [];
      }
    };

    // Helper function to fetch Test Procedures documents from their actual storage location
    const fetchProceduresDocuments = async (): Promise<string[]> => {
      try {
        const procedureRecords = JSON.parse(inspectionOrder.procedureData || '[]');
        const procedureDocs: string[] = [];
        
        console.log(`🔍 Fetching Procedures documents for ${procedureRecords.length} procedure records`);
        
        for (const procedure of procedureRecords) {
          if (procedure.procedureNumber) {
            // Try to fetch from test procedures table to get NDT method and standard
            const testProcedure = await db.query.testProcedures.findFirst({
              where: eq(testProcedures.procedureNumber, procedure.procedureNumber)
            });
            
            if (testProcedure?.ndtMethod && testProcedure?.applicableStandard) {
              // Determine standard type from applicableStandard field
              const getStandardType = (standard: string | undefined): string => {
                if (!standard) return 'Other';
                
                // ASME Standards
                if (standard.includes('ASME') || standard.includes('ASTM') || 
                    standard.includes('API') || standard.includes('AWS')) {
                  return 'ASME';
                }
                
                // EN Standards  
                if (standard.includes('EN')) {
                  return 'EN';
                }
                
                return 'Other';
              };
              
              const standardType = getStandardType(testProcedure.applicableStandard);
              const procedurePath = `QMS/Test_Procedures/${testProcedure.ndtMethod}/${standardType}/${procedure.procedureNumber}.pdf`;
              
              try {
                const { bucket } = await initializeGCS();
                if (bucket) {
                  const [exists] = await bucket.file(procedurePath).exists();
                  if (exists) {
                    procedureDocs.push(procedurePath);
                    console.log(`✅ Found Procedure document: ${procedurePath}`);
                  } else {
                    console.log(`❌ Procedure document not found: ${procedurePath}`);
                  }
                }
              } catch (e) {
                console.log(`❌ Error checking Procedure document: ${procedurePath}`, e);
              }
            } else {
              console.log(`❌ Missing NDT method or standard for procedure: ${procedure.procedureNumber}`);
            }
          }
        }
        
        console.log(`📁 Found ${procedureDocs.length} Procedure PDF documents total`);
        return procedureDocs;
      } catch (error) {
        console.error(`❌ Error fetching Procedures documents:`, error);
        return [];
      }
    };

    // Helper function to fetch additional documents from other GCS paths
    const fetchAdditionalDocuments = async (inspectionOrder: InspectionOrder): Promise<string[]> => {
      const additionalDocs: string[] = [];
      
      try {
        // Note: Material documents are now handled separately in fetchMaterialDocuments()
        // to ensure they appear in the correct Material Traceability section

        // Fetch Test Procedures documents
        console.log('🔍 Checking for Procedures data...');
        console.log('procedureData field:', inspectionOrder.procedureData);
        
        const procedureRecords = JSON.parse(inspectionOrder.procedureData || '[]');
        console.log(`📋 Found ${procedureRecords.length} Test Procedure records:`, procedureRecords);
        for (const procedure of procedureRecords) {
          if (procedure.procedureNumber) {
            // Try to fetch from test procedures table
            const testProcedure = await db.query.testProcedures.findFirst({
              where: eq(testProcedures.procedureNumber, procedure.procedureNumber)
            });
            if (testProcedure?.ndtMethod && testProcedure?.applicableStandard) {
              // Determine standard type from applicableStandard field
              const getStandardType = (standard: string | undefined): string => {
                if (!standard) return 'Other';
                
                // ASME Standards
                if (standard.includes('ASME') || standard.includes('ASTM') || 
                    standard.includes('API') || standard.includes('AWS')) {
                  return 'ASME';
                }
                
                // EN Standards  
                if (standard.includes('EN')) {
                  return 'EN';
                }
                
                return 'Other';
              };
              
              const standardType = getStandardType(testProcedure.applicableStandard);
              const procedurePath = `QMS/Test_Procedures/${testProcedure.ndtMethod}/${standardType}/${procedure.procedureNumber}.pdf`;
              try {
                const { bucket } = await initializeGCS();
                if (bucket) {
                  const [exists] = await bucket.file(procedurePath).exists();
                  if (exists) {
                    additionalDocs.push(procedurePath);
                  }
                }
              } catch (e) {
                console.log(`Procedure file not found: ${procedurePath}`);
              }
            }
          }
        }

        // Fetch Calibration documents
        const hydrotestRecords = JSON.parse(inspectionOrder.hydrotestData || '[]');
        for (const hydrotest of hydrotestRecords) {
          if (hydrotest.pressureGauge) {
            const calibrationPath = `QMS/Instrument/${hydrotest.pressureGauge}.pdf`;
            try {
              const { bucket } = await initializeGCS();
              if (bucket) {
                const [exists] = await bucket.file(calibrationPath).exists();
                if (exists) {
                  additionalDocs.push(calibrationPath);
                }
              }
            } catch (e) {
              console.log(`Calibration file not found: ${calibrationPath}`);
            }
          }
        }

        console.log(`📋 Found ${additionalDocs.length} additional documents from various sources`);
        return additionalDocs;
        
      } catch (error) {
        console.error('❌ Error fetching additional documents:', error);
        return [];
      }
    };

    // Helper function to embed actual PDF documents into the final dossier
    const embedPDFDocuments = async (documents: string[], sectionTitle: string): Promise<void> => {
      if (documents.length === 0) {
        console.log(`No documents to embed for ${sectionTitle}`);
        return;
      }

      console.log(`🔗 Embedding ${documents.length} PDF documents for ${sectionTitle}`);
      
      for (const docPath of documents) {
        try {
          const pdfBuffer = await downloadPDFFromGCS(docPath);
          if (pdfBuffer) {
            const sourcePdf = await PDFDocument.load(pdfBuffer);
            const pageIndices = sourcePdf.getPageIndices();
            
            // Copy all pages from source PDF to target PDF
            const copiedPages = await pdfDoc.copyPages(sourcePdf, pageIndices);
            copiedPages.forEach((page) => {
              pdfDoc.addPage(page);
            });
            
            console.log(`✅ Embedded ${pageIndices.length} pages from ${docPath.split('/').pop()}`);
          }
        } catch (error) {
          console.error(`❌ Failed to embed PDF ${docPath}:`, error);
          // Add an error page for failed documents
          const errorPage = pdfDoc.addPage();
          errorPage.drawText(`Failed to load document: ${docPath.split('/').pop()}`, {
            x: pageMargin,
            y: 700,
            size: 12,
            font: helveticaBold,
            color: rgb(1, 0, 0),
          });
          errorPage.drawText(`Error: ${error.message || 'Unknown error'}`, {
            x: pageMargin,
            y: 670,
            size: 10,
            font: helvetica,
            color: rgb(0.5, 0, 0),
          });
        }
      }
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

    // Helper function to fetch Material Identification documents
    const fetchMaterialDocuments = async (): Promise<string[]> => {
      const materialDocs: string[] = [];
      try {
        const materialRecords = JSON.parse(inspectionOrder.materialTraceabilityData || '[]');
        console.log(`🔍 Fetching actual Material documents for ${materialRecords.length} records`);
        
        // Get properly initialized GCS bucket
        const { bucket } = await initializeGCS();
        if (!bucket) {
          console.error('❌ Failed to initialize GCS bucket for Material document check');
          return materialDocs;
        }
        
        for (const material of materialRecords) {
          // Use materialIdentificationId (e.g., "MI-2025-29") instead of materialId (database ID)
          if (material.materialIdentificationId) {
            // Extract project number from inspection order (could be projectCode or separate projectNumber field)
            const projectNumber = inspectionOrder.projectCode || inspectionOrder.projectNumber || inspectionOrder.project;
            
            // Try the new standardized path format first: Inspection_Report.{extension}
            const standardizedPath = `QMS/Material_Identification/${projectNumber}/${material.materialIdentificationId}/Inspection_Report.pdf`;
            console.log(`📁 Checking standardized Material path: ${standardizedPath} for Material ID: ${material.materialIdentificationId}`);
            
            try {
              // Check if the standardized file exists
              const file = bucket.file(standardizedPath);
              const [exists] = await file.exists();
              if (exists) {
                console.log(`✅ Found standardized Material document: ${standardizedPath}`);
                materialDocs.push(standardizedPath);
              } else {
                console.log(`❌ Standardized Material document not found: ${standardizedPath}`);
                // Fallback: try scanning the directory for any PDF files (for backward compatibility)
                const materialPath = `QMS/Material_Identification/${projectNumber}/${material.materialIdentificationId}/`;
                console.log(`📁 Fallback: Checking Material directory: ${materialPath}`);
                const materialFiles = await listFilesInDirectory(materialPath);
                const pdfFiles = materialFiles.filter(f => f && f.toLowerCase().endsWith('.pdf'));
                console.log(`📋 Found ${pdfFiles.length} PDF files for material ${material.materialIdentificationId}:`, pdfFiles);
                materialDocs.push(...pdfFiles);
              }
            } catch (error) {
              console.error(`❌ Error checking Material document for ${material.materialIdentificationId}:`, error);
            }
          }
        }
        
        console.log(`📋 Total Material documents collected: ${materialDocs.length}`);
        return materialDocs;
      } catch (error) {
        console.error('❌ Error fetching material documents:', error);
        return [];
      }
    };

    // Fetch documents from all sources
    console.log('🚀 Starting comprehensive document compilation for Final Dossier...');
    console.log('📋 About to fetch PMA documents using specialized function...');
    console.log('📋 About to fetch Procedures documents using specialized function...');
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
      calibrationDocs,
      additionalDocs
    ] = await Promise.all([
      fetchTabDocuments('ApprovedDrawing'),
      fetchTabDocuments('DVR'),
      fetchTabDocuments('ITP'),
      fetchMaterialDocuments(), // Get actual material documents from Material Identification
      fetchTabDocuments('PMA'),
      fetchTabDocuments('Procedures'),
      fetchTabDocuments('ShopInspection'),
      fetchTabDocuments('Welding'),
      fetchTabDocuments('NDT'),
      fetchTabDocuments('Visual'),
      fetchTabDocuments('Hydrotest'),
      fetchTabDocuments('NCR'),
      fetchTabDocuments('Calibration'),
      fetchAdditionalDocuments(inspectionOrder)
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
      Calibration: calibrationDocs.length,
      Additional: additionalDocs.length
    });

    // PROCESS DATABASE RECORD SECTIONS FIRST
    // Section 5: Particular Material Appraisal (PMA) - Database Records
    console.log('🚀 STARTING PMA SECTION 5 PROCESSING...');
    const pmaRecords = JSON.parse(inspectionOrder.pmaData || '[]');
    const hasPmaRecords = pmaRecords.length > 0;
    const hasPmaDocs = pmaDocs.length > 0;
    
    console.log(`🔍 PMA Section Debug:`, {
      pmaDataField: inspectionOrder.pmaData,
      parsedPmaRecords: pmaRecords,
      hasPmaRecords,
      pmaDocs: pmaDocs.length,
      hasPmaDocs,
      willShowPmaSection: hasPmaRecords || hasPmaDocs
    });
    
    console.log(`📄 CREATING PMA SECTION 5 with ${pmaRecords.length} database records and ${pmaDocs.length} PDF documents`);
    
    if (hasPmaRecords || hasPmaDocs) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 5: PARTICULAR MATERIAL APPRAISAL (PMA)', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      let currentY = 700;
      
      // Display PMA records if they exist
      if (hasPmaRecords) {
        sectionPage.drawText('PMA Records:', {
          x: pageMargin,
          y: currentY,
          size: 14,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        currentY -= 30;
        
        for (let i = 0; i < pmaRecords.length; i++) {
          const pma = pmaRecords[i];
          const recordText = `${i + 1}. PMA Number: ${pma.pmaNumber || 'N/A'}, ` +
                           `Material Specification: ${pma.materialSpecification || 'N/A'}, ` +
                           `Material Grade: ${pma.materialGrade || 'N/A'}, ` +
                           `Status: ${pma.status || 'N/A'}`;
          
          sectionPage.drawText(recordText, {
            x: pageMargin + 20,
            y: currentY,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
          currentY -= 20;
          
          // Add additional details if available
          if (pma.certifiedBy || pma.issueDate || pma.expiryDate) {
            const detailText = `   Certified By: ${pma.certifiedBy || 'N/A'}, ` +
                             `Issue Date: ${pma.issueDate || 'N/A'}, ` +
                             `Expiry Date: ${pma.expiryDate || 'N/A'}`;
            
            sectionPage.drawText(detailText, {
              x: pageMargin + 20,
              y: currentY,
              size: 9,
              font: helvetica,
              color: rgb(0.3, 0.3, 0.3),
            });
            currentY -= 15;
          }
          
          // Ensure we don't go off the page
          if (currentY < 100) {
            break;
          }
        }
        
        currentY -= 20; // Add some space between records and documents
      }
      
      addFooterToPage(sectionPage);
      
      // Embed PDF documents if they exist
      if (hasPmaDocs) {
        await embedPDFDocuments(pmaDocs, 'Particular Material Appraisal');
      }
    }

    // Section 6: Test Procedures - PDF Documents Only (no database records)
    console.log('🚀 STARTING PROCEDURES SECTION 6 PROCESSING (PDF documents only)...');
    const hasProcedureDocs = procedureDocs.length > 0;
    
    console.log(`🔍 Procedures Section Debug:`, {
      procedureDocs: procedureDocs.length,
      hasProcedureDocs,
      willShowProceduresSection: hasProcedureDocs
    });
    
    console.log(`📄 CREATING PROCEDURES SECTION 6 with ${procedureDocs.length} PDF documents (database records excluded)`);
    
    // Only create section if there are PDF documents
    if (hasProcedureDocs) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 6: TEST PROCEDURES', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      addFooterToPage(sectionPage);
      
      // Embed PDF documents
      await embedPDFDocuments(procedureDocs, 'Test Procedures');
    }

    // COMPREHENSIVE PDF DOCUMENT EMBEDDING APPROACH
    // Now embed PDF documents from other sections
    
    console.log('🔗 Starting systematic PDF document embedding...');

    // Section 1: Approved Drawing Documents
    if (approvedDrawingDocs.length > 0) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 1: APPROVED DRAWINGS', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(sectionPage);
      await embedPDFDocuments(approvedDrawingDocs, 'Approved Drawings');
    }

    // Section 2: Design Verification Reports (DVR)
    if (dvrDocs.length > 0) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 2: DESIGN VERIFICATION REPORTS (DVR)', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(sectionPage);
      await embedPDFDocuments(dvrDocs, 'Design Verification Reports');
    }

    // Section 3: Inspection Test Plan (ITP)
    if (itpDocs.length > 0) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 3: INSPECTION TEST PLAN (ITP)', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(sectionPage);
      await embedPDFDocuments(itpDocs, 'Inspection Test Plan');
    }

    // Section 4: Material Traceability
    const materialTraceabilityRecords = JSON.parse(inspectionOrder.materialTraceabilityData || '[]');
    const hasMaterialRecords = materialTraceabilityRecords.length > 0;
    const hasMaterialDocs = materialTraceabilityDocs.length > 0;
    
    if (hasMaterialRecords || hasMaterialDocs) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 4: MATERIAL TRACEABILITY', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      
      let currentY = 700;
      
      // Display material records if they exist
      if (hasMaterialRecords) {
        sectionPage.drawText('Material Records:', {
          x: pageMargin,
          y: currentY,
          size: 14,
          font: helveticaBold,
          color: rgb(0, 0, 0),
        });
        currentY -= 30;
        
        for (let i = 0; i < materialTraceabilityRecords.length; i++) {
          const material = materialTraceabilityRecords[i];
          const recordText = `${i + 1}. Certificate: ${material.materialCertificateNumber || 'N/A'}, ` +
                           `Heat: ${material.heatNumber || 'N/A'}, ` +
                           `Grade: ${material.materialGrade || 'N/A'}, ` +
                           `Specification: ${material.materialSpecification || 'N/A'}`;
          
          sectionPage.drawText(recordText, {
            x: pageMargin + 20,
            y: currentY,
            size: 10,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
          currentY -= 20;
          
          // Ensure we don't go off the page
          if (currentY < 100) {
            break;
          }
        }
        
        currentY -= 20; // Add some space between records and documents
      }
      
      addFooterToPage(sectionPage);
      
      // Embed PDF documents if they exist
      if (hasMaterialDocs) {
        await embedPDFDocuments(materialTraceabilityDocs, 'Material Traceability');
      }
    }

    // Section 7: Shop Inspection Records
    if (shopInspectionDocs.length > 0) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 7: SHOP INSPECTION RECORDS', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(sectionPage);
      await embedPDFDocuments(shopInspectionDocs, 'Shop Inspection Records');
    }

    // Section 8: Welding & Weld Maps
    if (weldingDocs.length > 0) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 8: WELDING & WELD MAPS', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(sectionPage);
      await embedPDFDocuments(weldingDocs, 'Welding & Weld Maps');
    }

    // Section 9: NDT Reports
    if (ndtDocs.length > 0) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 9: NDT REPORTS', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(sectionPage);
      await embedPDFDocuments(ndtDocs, 'NDT Reports');
    }

    // Section 10: Visual Inspection Records
    if (visualDocs.length > 0) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 10: VISUAL INSPECTION RECORDS', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(sectionPage);
      await embedPDFDocuments(visualDocs, 'Visual Inspection Records');
    }

    // Section 11: Hydrotest Reports
    if (hydrotestDocs.length > 0) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 11: HYDROTEST REPORTS', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(sectionPage);
      await embedPDFDocuments(hydrotestDocs, 'Hydrotest Reports');
    }

    // Section 12: Non-Conformance Reports
    if (ncrDocs.length > 0) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 12: NON-CONFORMANCE REPORTS', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(sectionPage);
      await embedPDFDocuments(ncrDocs, 'Non-Conformance Reports');
    }

    // Section 13: Calibration Certificates
    if (calibrationDocs.length > 0) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 13: CALIBRATION CERTIFICATES', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(sectionPage);
      await embedPDFDocuments(calibrationDocs, 'Calibration Certificates');
    }

    // Section 14: Additional Supporting Documents
    if (additionalDocs.length > 0) {
      const sectionPage = pdfDoc.addPage();
      sectionPage.drawText('SECTION 14: ADDITIONAL SUPPORTING DOCUMENTS', {
        x: pageMargin,
        y: 750,
        size: 16,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      addFooterToPage(sectionPage);
      await embedPDFDocuments(additionalDocs, 'Additional Supporting Documents');
    }

    console.log('✅ Completed comprehensive PDF document embedding for Final Dossier');

    // Generate PDF buffer
    const pdfBytes = await pdfDoc.save();

    // Upload to GCS with standardized path structure
    const fileName = `FD_${inspectionOrder.inspectionOrderNumber}.pdf`;
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
          const { bucket } = await initializeGCS();
          if (bucket) {
            const [signedUrl] = await bucket.file(filePath).getSignedUrl({
              action: 'read',
              expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
            });
            
            return { path: filePath, url: signedUrl };
          } else {
            console.error('Failed to initialize GCS bucket for signed URL generation');
            return { path: filePath, url: null };
          }
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
    console.log(`🔍 CRITICAL DEBUG - Raw DB fields:`, {
      hasPmaData: !!inspectionOrder.pmaData,
      pmaDataLength: (inspectionOrder.pmaData || '').length,
      hasProcedureData: !!inspectionOrder.procedureData,
      procedureDataLength: (inspectionOrder.procedureData || '').length,
      pmaDataPreview: (inspectionOrder.pmaData || '').substring(0, 100),
      procedureDataPreview: (inspectionOrder.procedureData || '').substring(0, 100)
    });

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
      return { exists: false };
    }

    console.log(`Found inspection order: ${inspectionOrder.inspectionOrderNumber} with project code: ${inspectionOrder.projectCode}`);

    // Initialize GCS bucket
    const { bucket } = await initializeGCS();
    if (!bucket) {
      console.error('❌ Failed to initialize GCS bucket for Final Dossier check');
      return { exists: false };
    }

    // Check for existing final dossier in GCS using standardized path
    const basePath = `QMS/Inspections_Records/${inspectionOrder.projectCode || 'UNKNOWN'}/${inspectionOrder.inspectionOrderNumber}/Final_Dossier/`;
    const expectedFileName = `FD_${inspectionOrder.inspectionOrderNumber}.pdf`;
    const expectedFilePath = `${basePath}${expectedFileName}`;
    
    // Check if the exact expected file exists
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
          
          return {
            exists: true,
            path: expectedFilePath,
            url: signedUrl
          };
        } catch (signedUrlError) {
          console.error('Error generating signed URL for existing file:', signedUrlError);
          return {
            exists: true,
            path: expectedFilePath
          };
        }
      }
    } catch (fileCheckError) {
      console.error('Error checking file existence:', fileCheckError);
    }
    
    // If exact file doesn't exist in new location, try listing files in the new directory
    try {
      console.log(`Listing files in new directory: ${basePath}`);
      const files = await listFilesInDirectory(basePath);
      console.log(`Found ${files.length} files in new Final_Dossier directory:`, files);
      
      // Look for any PDF files that match the pattern
      const pdfFiles = files.filter(file => file.endsWith('.pdf'));
      
      if (pdfFiles.length > 0) {
        const existingFile = pdfFiles[0]; // Take the first PDF found
        console.log(`Found existing Final Dossier PDF in new location: ${existingFile}`);
        
        // Generate signed URL for the existing file
        try {
          const [signedUrl] = await bucket.file(existingFile).getSignedUrl({
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
          });
          
          return {
            exists: true,
            path: existingFile,
            url: signedUrl
          };
        } catch (signedUrlError) {
          console.error('Error generating signed URL for existing file:', signedUrlError);
          return {
            exists: true,
            path: existingFile
          };
        }
      } else {
        console.log('No PDF files found in new Final_Dossier directory');
      }
    } catch (listError) {
      console.error('Error listing files in new Final_Dossier directory:', listError);
    }

    // No Final Dossier found in new location
    console.log('❌ No Final Dossier PDF found in standardized location');
    return { exists: false };
    
  } catch (error) {
    console.error('Error checking existing Final Dossier:', error);
    return { exists: false };
  }
}
