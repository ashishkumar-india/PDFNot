/**
 * DocuCraft PRO - Sample Document Generator
 * Provides built-in multi-page demo documents for instant 1-click testing
 */

const SampleData = {
  /**
   * Generates a sample 2-page PDF in memory using PDF-Lib
   * @returns {Promise<Uint8Array>}
   */
  async createSamplePDFBytes() {
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc = await PDFDocument.create();

    // Embed Standard Fonts
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);

    // ================= PAGE 1: Commercial Contract / Agreement =================
    const page1 = pdfDoc.addPage([595, 842]); // A4 Size (points)
    const { width: p1W, height: p1H } = page1.getSize();

    // Header Banner
    page1.drawRectangle({
      x: 0,
      y: p1H - 80,
      width: p1W,
      height: 80,
      color: rgb(0.06, 0.09, 0.16)
    });

    page1.drawText("STANDARD SERVICE AGREEMENT", {
      x: 40,
      y: p1H - 48,
      size: 18,
      font: helveticaBold,
      color: rgb(1, 1, 1)
    });

    page1.drawText("AK Edit Enterprise Solutions • Reference: #CTR-2026-8849", {
      x: 40,
      y: p1H - 68,
      size: 9,
      font: helvetica,
      color: rgb(0.6, 0.7, 0.85)
    });

    // Date & Meta
    page1.drawText("Date: August 29, 2026", { x: 40, y: p1H - 110, size: 10, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
    page1.drawText("Status: Pending Review & Signature", { x: 360, y: p1H - 110, size: 10, font: helveticaBold, color: rgb(0.85, 0.2, 0.2) });

    // Divider
    page1.drawLine({
      start: { x: 40, y: p1H - 120 },
      end: { x: p1W - 40, y: p1H - 120 },
      thickness: 1,
      color: rgb(0.85, 0.85, 0.85)
    });

    // Body Paragraphs
    let yPos = p1H - 150;
    const addSection = (title, text) => {
      page1.drawText(title, { x: 40, y: yPos, size: 12, font: helveticaBold, color: rgb(0.1, 0.2, 0.4) });
      yPos -= 18;
      page1.drawText(text, { x: 40, y: yPos, size: 10, font: timesRoman, color: rgb(0.25, 0.25, 0.25), maxWidth: p1W - 80, lineHeight: 14 });
      yPos -= 45;
    };

    addSection("1. PARTIES & ENGAGEMENT", 
      "This Master Services Agreement is entered into by and between AK Edit Cloud Inc. ('Provider') and the Client as specified in Order Schedule A. Provider agrees to deliver digital document editing, cryptographic stamping, and vector annotation services in accordance with agreed specifications.");

    addSection("2. SCOPE OF SERVICES", 
      "The Client is granted non-exclusive, real-time interactive canvas access for live document editing, high-resolution rendering, freehand annotation, and PDF manipulation directly in the browser.");

    addSection("3. CONFIDENTIALITY & DATA PROTECTION", 
      "Both parties agree that all uploaded files, cryptographic signatures, and annotations shall remain strictly private and processed on the client side with zero unencrypted data transmission.");

    // Table of Deliverables
    page1.drawRectangle({
      x: 40,
      y: yPos - 115,
      width: p1W - 80,
      height: 130,
      borderColor: rgb(0.8, 0.85, 0.9),
      borderWidth: 1,
      color: rgb(0.98, 0.99, 1.0)
    });

    // Table Header
    page1.drawRectangle({
      x: 40,
      y: yPos - 5,
      width: p1W - 80,
      height: 20,
      color: rgb(0.92, 0.95, 0.98)
    });

    page1.drawText("Item / Module", { x: 50, y: yPos, size: 9, font: helveticaBold, color: rgb(0.2, 0.3, 0.5) });
    page1.drawText("Description", { x: 180, y: yPos, size: 9, font: helveticaBold, color: rgb(0.2, 0.3, 0.5) });
    page1.drawText("Fidelity", { x: 440, y: yPos, size: 9, font: helveticaBold, color: rgb(0.2, 0.3, 0.5) });

    const rows = [
      ["01. Live Canvas Engine", "Full Fabric.js interactive PDF document editing", "100% Vector"],
      ["02. Multi-Format Export", "Vector-grade High-Res PDF & Crisp PNG Hub", "2x Retina"],
      ["03. Digital Stamp & E-Sign", "Cryptographic signature & SVG seal generator", "Verified"],
      ["04. Direct In-Place Text", "Real-time in-place PDF text modification", "Direct Vector"]
    ];

    rows.forEach((r, idx) => {
      const rowY = yPos - 25 - (idx * 22);
      page1.drawText(r[0], { x: 50, y: rowY, size: 9, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
      page1.drawText(r[1], { x: 180, y: rowY, size: 9, font: helvetica, color: rgb(0.35, 0.35, 0.35) });
      page1.drawText(r[2], { x: 440, y: rowY, size: 9, font: helveticaBold, color: rgb(0.1, 0.6, 0.3) });
    });

    // Signature Area
    yPos -= 170;
    page1.drawText("Authorized Signatures:", { x: 40, y: yPos + 18, size: 10, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });

    // Signature box 1
    page1.drawLine({ start: { x: 40, y: yPos }, end: { x: 240, y: yPos }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
    page1.drawText("Provider Signature & Date", { x: 40, y: yPos - 14, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });

    // Signature box 2
    page1.drawLine({ start: { x: 300, y: yPos }, end: { x: 500, y: yPos }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
    page1.drawText("Client Sign Here (Use Signature Tool)", { x: 300, y: yPos - 14, size: 8, font: helveticaBold, color: rgb(0.2, 0.5, 0.9) });

    // Page Number Footer
    page1.drawText("Page 1 of 2  •  AK Edit PRO Demo Contract", { x: p1W / 2 - 90, y: 25, size: 8, font: helvetica, color: rgb(0.6, 0.6, 0.6) });


    // ================= PAGE 2: Certificate of Compliance =================
    const page2 = pdfDoc.addPage([595, 842]);
    const { width: p2W, height: p2H } = page2.getSize();

    // Border Frame
    page2.drawRectangle({
      x: 20,
      y: 20,
      width: p2W - 40,
      height: p2H - 40,
      borderColor: rgb(0.2, 0.4, 0.7),
      borderWidth: 2,
      color: rgb(0.99, 0.99, 1.0)
    });

    page2.drawRectangle({
      x: 25,
      y: 25,
      width: p2W - 50,
      height: p2H - 50,
      borderColor: rgb(0.7, 0.8, 0.9),
      borderWidth: 1
    });

    page2.drawText("CERTIFICATE OF VERIFICATION", {
      x: p2W / 2 - 160,
      y: p2H - 100,
      size: 20,
      font: helveticaBold,
      color: rgb(0.1, 0.25, 0.5)
    });

    page2.drawText("This certificate verifies that this document supports real-time editing,", {
      x: p2W / 2 - 180,
      y: p2H - 140,
      size: 11,
      font: timesRoman,
      color: rgb(0.3, 0.3, 0.3)
    });
    page2.drawText("vector freehand drawing, typography customization, and digital stamps.", {
      x: p2W / 2 - 190,
      y: p2H - 160,
      size: 11,
      font: timesRoman,
      color: rgb(0.3, 0.3, 0.3)
    });

    // Visual Badge Graphic in center
    page2.drawCircle({
      x: p2W / 2,
      y: p2H / 2 + 30,
      size: 60,
      color: rgb(0.92, 0.95, 1.0),
      borderColor: rgb(0.2, 0.4, 0.8),
      borderWidth: 3
    });

    page2.drawText("VERIFIED", {
      x: p2W / 2 - 32,
      y: p2H / 2 + 36,
      size: 13,
      font: helveticaBold,
      color: rgb(0.1, 0.3, 0.7)
    });

    page2.drawText("2026", {
      x: p2W / 2 - 14,
      y: p2H / 2 + 18,
      size: 11,
      font: helveticaBold,
      color: rgb(0.3, 0.4, 0.5)
    });

    page2.drawText("Try applying a stamp, highlight, or text annotation on this page!", {
      x: p2W / 2 - 170,
      y: p2H / 2 - 70,
      size: 10,
      font: helveticaBold,
      color: rgb(0.4, 0.5, 0.6)
    });

    // Page 2 Footer
    page2.drawText("Page 2 of 2  •  AK Edit PRO Demo Certificate", { x: p2W / 2 - 90, y: 35, size: 8, font: helvetica, color: rgb(0.6, 0.6, 0.6) });

    return await pdfDoc.save();
  }
};
