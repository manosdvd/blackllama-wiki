import fs from 'fs';
import PDFParser from 'pdf2json';

const pdfParser = new PDFParser(this, 1);

pdfParser.on('pdfParser_dataError', errData => console.error(errData.parserError));
pdfParser.on('pdfParser_dataReady', () => {
    fs.writeFileSync('handbook_text.txt', pdfParser.getRawTextContent());
    console.log('done');
});

pdfParser.loadPDF('MountainStaffHandbook.pdf');
