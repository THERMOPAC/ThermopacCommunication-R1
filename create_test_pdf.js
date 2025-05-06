const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');

async function createPdf() {
  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  
  const page = pdfDoc.addPage();
  const { width, height } = page.getSize();
  
  page.drawText('WPQR-9 Test Document', {
    x: 50,
    y: height - 100,
    size: 30,
    font: timesRomanFont,
    color: rgb(0, 0, 0),
  });
  
  page.drawText('This is a test document for WPQR download testing.', {
    x: 50,
    y: height - 150,
    size: 20,
    font: timesRomanFont,
    color: rgb(0, 0, 0),
  });
  
  page.drawText('Local file system approach should work correctly.', {
    x: 50,
    y: height - 180,
    size: 15,
    font: timesRomanFont,
    color: rgb(0, 0, 0),
  });
  
  const pdfBytes = await pdfDoc.save();
  
  fs.writeFileSync('wpqr_documents/WPQR-9.pdf', pdfBytes);
  console.log('PDF created successfully!');
}

createPdf().catch(err => console.error('Error creating PDF:', err));
