// Generates the sample PDFs on the fly, so no files are stored.
import PDFDocument from 'pdfkit';

function startPdf(res, filename, color) {
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: filename } });
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);
  doc.rect(0, 0, doc.page.width, 8).fill(color);
  doc.fillColor('#111512');
  return doc;
}

function sampleNotice(doc) {
  doc.moveDown(2).fontSize(9).fillColor('#4A524C')
    .text('Sample document from a client portal demo. All names and figures are made up.');
}

export function sendInvoicePdf(res, { invoice, clientName, projectName, brand }) {
  const doc = startPdf(res, invoice.number, brand.color);
  const money = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const date = (value) => value.toISOString().slice(0, 10);

  doc.fontSize(20).text(brand.name).moveDown(0.5);
  doc.fontSize(14).text(`Invoice ${invoice.number}`).moveDown();
  doc.fontSize(11)
    .text(`Billed to: ${clientName}`)
    .text(`Project: ${projectName}`)
    .text(`Issued: ${date(invoice.issuedAt)}`)
    .text(`Due: ${date(invoice.dueAt)}`)
    .text(`Status: ${invoice.status === 'paid' ? 'Paid' : 'Unpaid'}`)
    .moveDown();
  doc.text(invoice.description).moveDown();
  doc.fontSize(14).text(`Total: ${money(invoice.amountCents)}`);
  sampleNotice(doc);
  doc.end();
}

export function sendDocumentPdf(res, { file, clientName, projectName, brand }) {
  const safeName = file.title.replace(/[^\w -]/g, '').replace(/\s+/g, '-');
  const doc = startPdf(res, safeName, brand.color);

  doc.fontSize(20).text(brand.name).moveDown(0.5);
  doc.fontSize(14).text(file.title).moveDown();
  doc.fontSize(11)
    .text(`Client: ${clientName}`)
    .text(`Project: ${projectName}`)
    .text(`Type: ${file.kind}`);
  sampleNotice(doc);
  doc.end();
}
