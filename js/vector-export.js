/**
 * True Vector Export Engine for PDF_Edit
 * Translates Fabric.js objects into native pdf-lib draw calls for lossless PDF exports.
 */
class VectorExportEngine {
  constructor(pdfLib) {
    this.PDFDocument = pdfLib.PDFDocument;
    this.rgb = pdfLib.rgb;
    this.degrees = pdfLib.degrees;
    this.StandardFonts = pdfLib.StandardFonts;
  }

  /**
   * Generates a fully vectorized PDF
   * @param {Array} pagesData - The app's internal pages state
   * @param {Uint8Array} originalPdfBytes - The original source PDF to copy pages from
   * @returns {Promise<Uint8Array>}
   */
  async export(pagesData, originalPdfBytes) {
    const newPdf = await this.PDFDocument.create();
    let originalPdf = null;
    
    if (originalPdfBytes) {
      originalPdf = await this.PDFDocument.load(originalPdfBytes);
    }

    const helveticaFont = await newPdf.embedFont(this.StandardFonts.Helvetica);

    for (let i = 0; i < pagesData.length; i++) {
      const pData = pagesData[i];
      let page;

      // 1. Setup the Page Background (Original PDF Page, Blank, or Custom Image)
      if (originalPdf && !pData.isCustom && pData.originalPdfPageNum && pData.originalPdfPageNum <= originalPdf.getPageCount()) {
        const [copiedPage] = await newPdf.copyPages(originalPdf, [pData.originalPdfPageNum - 1]);
        page = copiedPage;
        newPdf.addPage(page);

        if (pData.rotation) {
          // pdf-lib rotation is relative. For simplicity, we set it absolute based on original + new rotation
          const currentRot = page.getRotation().angle;
          page.setRotation(this.degrees(currentRot + pData.rotation));
        }
      } else {
        const width = pData.renderWidth || pData.originalWidth || 794;
        const height = pData.renderHeight || pData.originalHeight || 1123;
        page = newPdf.addPage([width, height]);

        if (pData.bgDataUrl) {
          const imgBytes = await fetch(pData.bgDataUrl).then(r => r.arrayBuffer());
          const isJpg = pData.bgDataUrl.includes('image/jpeg');
          const img = isJpg ? await newPdf.embedJpg(imgBytes) : await newPdf.embedPng(imgBytes);
          page.drawImage(img, { x: 0, y: 0, width, height });
        }
      }

      // 2. Draw Fabric Annotations Vector-style
      if (pData.fabricJSON && pData.fabricJSON.objects) {
        await this.drawFabricObjects(page, pData.fabricJSON.objects, newPdf, helveticaFont);
      }
    }

    return await newPdf.save();
  }

  async drawFabricObjects(page, objects, newPdf, font) {
    const { width: pageW, height: pageH } = page.getSize();
    
    // The canvas coordinates are mapped to the current page size.
    // However, pdf-lib uses a bottom-left origin (Y goes up).
    // Fabric.js uses a top-left origin (Y goes down).

    for (const obj of objects) {
      if (!obj.visible) continue;

      const scaleX = obj.scaleX || 1;
      const scaleY = obj.scaleY || 1;
      const angle = obj.angle || 0;
      
      // Basic bounding box coordinates (Top-Left in Fabric space)
      const fabricX = obj.left || 0;
      const fabricY = obj.top || 0;

      if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
        const text = obj.text || '';
        const fontSize = (obj.fontSize || 24) * scaleY;
        const color = this.parseColor(obj.fill);
        
        // pdf-lib drawText places the text based on its baseline, not top-left.
        // We approximate the baseline shift by subtracting font size from page height.
        const pdfX = fabricX;
        const pdfY = pageH - fabricY - (fontSize * 0.8); 

        page.drawText(text, {
          x: pdfX,
          y: pdfY,
          size: fontSize,
          font: font, // MVP: using Helvetica for all to avoid massive file sizes and embedding logic
          color: this.rgb(color.r, color.g, color.b),
          opacity: obj.opacity !== undefined ? obj.opacity : 1,
          rotate: this.degrees(-angle) // pdf-lib rotates CCW, fabric is CW
        });
      } 
      else if (obj.type === 'rect') {
        const w = (obj.width || 0) * scaleX;
        const h = (obj.height || 0) * scaleY;
        const fillColor = this.parseColor(obj.fill);
        const strokeColor = this.parseColor(obj.stroke);
        
        // For rect, pdf-lib origin is bottom-left of the rect
        const pdfY = pageH - fabricY - h;

        page.drawRectangle({
          x: fabricX,
          y: pdfY,
          width: w,
          height: h,
          color: fillColor ? this.rgb(fillColor.r, fillColor.g, fillColor.b) : undefined,
          borderColor: strokeColor ? this.rgb(strokeColor.r, strokeColor.g, strokeColor.b) : undefined,
          borderWidth: obj.strokeWidth || 0,
          opacity: obj.opacity !== undefined ? obj.opacity : 1,
          rotate: this.degrees(-angle)
        });
      }
      else if (obj.type === 'path') {
        // Freehand drawings (Brush tool)
        // pdf-lib drawSvgPath is tricky because the path coordinates are absolute to the page.
        // Fabric stores path segments. We can reconstruct the SVG string.
        let pathString = '';
        if (Array.isArray(obj.path)) {
          pathString = obj.path.map(cmd => cmd.join(' ')).join(' ');
        }
        
        if (pathString) {
          const strokeColor = this.parseColor(obj.stroke);
          // Fabric path data is usually relative to the object's center or top-left.
          // pdf-lib drawSvgPath uses the page origin (bottom-left) unless transformed.
          // This requires complex matrix transformation. 
          // For MVP, we'll embed the path as an image if it's too complex, but let's try direct draw.
          page.drawSvgPath(pathString, {
            x: fabricX,
            y: pageH - fabricY, // flip Y
            scale: scaleX, // Assuming uniform scale
            borderColor: strokeColor ? this.rgb(strokeColor.r, strokeColor.g, strokeColor.b) : this.rgb(0,0,0),
            borderWidth: obj.strokeWidth || 1,
            opacity: obj.opacity !== undefined ? obj.opacity : 1
          });
        }
      }
      else if (obj.type === 'image') {
        // Signatures, uploaded stamps
        if (obj.src) {
          try {
            const imgBytes = await fetch(obj.src).then(r => r.arrayBuffer());
            const isJpg = obj.src.includes('image/jpeg');
            const pdfImg = isJpg ? await newPdf.embedJpg(imgBytes) : await newPdf.embedPng(imgBytes);
            
            const w = (obj.width || pdfImg.width) * scaleX;
            const h = (obj.height || pdfImg.height) * scaleY;
            const pdfY = pageH - fabricY - h;

            page.drawImage(pdfImg, {
              x: fabricX,
              y: pdfY,
              width: w,
              height: h,
              opacity: obj.opacity !== undefined ? obj.opacity : 1,
              rotate: this.degrees(-angle)
            });
          } catch (e) {
            console.error("Failed to embed image in vector export:", e);
          }
        }
      }
    }
  }

  parseColor(colorStr) {
    if (!colorStr || colorStr === 'transparent') return null;
    
    // Hex
    if (colorStr.startsWith('#')) {
      const hex = colorStr.replace('#', '');
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0]+hex[0], 16) / 255,
          g: parseInt(hex[1]+hex[1], 16) / 255,
          b: parseInt(hex[2]+hex[2], 16) / 255
        };
      }
      return {
        r: parseInt(hex.substring(0, 2), 16) / 255,
        g: parseInt(hex.substring(2, 4), 16) / 255,
        b: parseInt(hex.substring(4, 6), 16) / 255
      };
    }
    
    // RGB
    if (colorStr.startsWith('rgb')) {
      const parts = colorStr.match(/\d+/g);
      if (parts && parts.length >= 3) {
        return {
          r: parseInt(parts[0]) / 255,
          g: parseInt(parts[1]) / 255,
          b: parseInt(parts[2]) / 255
        };
      }
    }
    
    return { r: 0, g: 0, b: 0 }; // fallback black
  }
}
