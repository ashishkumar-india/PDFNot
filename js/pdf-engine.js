/**
 * DocuCraft PRO - PDF & Document Engine
 * Handles PDF rendering (PDF.js), multi-page structure, rotations, additions, and PDF-Lib export.
 */

class PDFEngine {
  constructor() {
    this.currentDoc = null; // { type: 'pdf' | 'image' | 'blank', name, rawBytes, totalPages }
    this.pagesData = []; // [{ id, pageNum, originalWidth, originalHeight, rotation, bgDataUrl, fabricJSON }]
    this.currentPageIndex = 0;
    this.renderScale = 2.0; // 2x scale for crisp Retina quality
  }

  /**
   * Loads a PDF file from ArrayBuffer
   * @param {ArrayBuffer} arrayBuffer 
   * @param {string} filename 
   */
  async loadPDF(data, filename = 'Document.pdf') {
    try {
      const pdfData = (data instanceof Uint8Array) ? data : new Uint8Array(data);
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      const pdfDoc = await loadingTask.promise;

      this.currentDoc = {
        type: 'pdf',
        name: filename,
        rawBytes: pdfData,
        pdfDocProxy: pdfDoc,
        totalPages: pdfDoc.numPages
      };

      this.pagesData = [];

      // Initialize metadata for all pages
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });

        this.pagesData.push({
          id: 'page_' + i + '_' + Date.now(),
          pageNum: i,
          originalWidth: viewport.width,
          originalHeight: viewport.height,
          rotation: 0,
          bgDataUrl: null, // Will be rendered lazily or upfront
          fabricJSON: null
        });
      }

      this.currentPageIndex = 0;
      return true;
    } catch (err) {
      console.error('Error loading PDF:', err);
      throw err;
    }
  }

  /**
   * Loads an image file (PNG, JPG, WEBP, SVG)
   * @param {File|Blob|string} imageSource 
   * @param {string} filename 
   */
  async loadImage(imageSource, filename = 'Image.png') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.currentDoc = {
          type: 'image',
          name: filename,
          rawBytes: null,
          totalPages: 1
        };

        this.pagesData = [{
          id: 'page_img_' + Date.now(),
          pageNum: 1,
          originalWidth: img.naturalWidth || 800,
          originalHeight: img.naturalHeight || 1100,
          rotation: 0,
          bgDataUrl: img.src,
          fabricJSON: null
        }];

        this.currentPageIndex = 0;
        resolve(true);
      };
      img.onerror = reject;

      if (typeof imageSource === 'string') {
        img.src = imageSource;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.onerror = reject;
        reader.readAsDataURL(imageSource);
      }
    });
  }

  /**
   * Creates a new blank page document
   * @param {number} width 
   * @param {number} height 
   */
  createBlankDocument(width = 794, height = 1123) { // Standard A4 at 96 DPI
    this.currentDoc = {
      type: 'blank',
      name: 'Untitled-Document.pdf',
      rawBytes: null,
      totalPages: 1
    };

    // Create a plain white canvas data URL
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    this.pagesData = [{
      id: 'page_blank_' + Date.now(),
      pageNum: 1,
      originalWidth: width,
      originalHeight: height,
      rotation: 0,
      bgDataUrl: canvas.toDataURL('image/png'),
      fabricJSON: null
    }];

    this.currentPageIndex = 0;
  }

  /**
   * Adds a new blank page to current document
   */
  addNewPage() {
    const defaultW = this.pagesData.length > 0 ? this.pagesData[0].originalWidth : 794;
    const defaultH = this.pagesData.length > 0 ? this.pagesData[0].originalHeight : 1123;

    const canvas = document.createElement('canvas');
    canvas.width = defaultW;
    canvas.height = defaultH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, defaultW, defaultH);

    const newPage = {
      id: 'page_custom_' + Date.now(),
      pageNum: this.pagesData.length + 1,
      originalWidth: defaultW,
      originalHeight: defaultH,
      rotation: 0,
      bgDataUrl: canvas.toDataURL('image/png'),
      fabricJSON: null
    };

    this.pagesData.push(newPage);
    if (this.currentDoc) {
      this.currentDoc.totalPages = this.pagesData.length;
    }
    return this.pagesData.length - 1;
  }

  /**
   * Deletes a page by index
   * @param {number} index 
   */
  deletePage(index) {
    if (this.pagesData.length <= 1) {
      throw new Error("Cannot delete the only remaining page.");
    }

    this.pagesData.splice(index, 1);
    // Re-index page numbers
    this.pagesData.forEach((p, idx) => {
      p.pageNum = idx + 1;
    });

    if (this.currentDoc) {
      this.currentDoc.totalPages = this.pagesData.length;
    }

    if (this.currentPageIndex >= this.pagesData.length) {
      this.currentPageIndex = this.pagesData.length - 1;
    }
    return this.currentPageIndex;
  }

  /**
   * Rotates a page by degrees (+90 or -90)
   * @param {number} index 
   * @param {number} degrees 
   */
  rotatePage(index, degrees = 90) {
    const page = this.pagesData[index];
    if (!page) return;

    page.rotation = (page.rotation + degrees) % 360;
    if (page.rotation < 0) page.rotation += 360;

    // Reset bgDataUrl so it gets re-rendered with new rotation
    page.bgDataUrl = null;
    // Clear cached text/image extraction so they recompute for new rotation
    page.extractedTextLines = null;
    page.extractedImages = null;
  }

  /**
   * Renders a specific page to an image data URL
   * @param {number} pageIndex 
   * @returns {Promise<string>} dataUrl
   */
  async renderPageBackground(pageIndex) {
    const pageData = this.pagesData[pageIndex];
    if (!pageData) throw new Error("Page index out of bounds");

    // Return cached render if valid and not rotated
    if (pageData.bgDataUrl) {
      return pageData.bgDataUrl;
    }

    if (this.currentDoc && this.currentDoc.type === 'pdf' && this.currentDoc.pdfDocProxy) {
      const pdfPage = await this.currentDoc.pdfDocProxy.getPage(pageData.pageNum);
      
      // Calculate rotation
      const totalRotation = (pdfPage.rotate + pageData.rotation) % 360;
      const viewport = pdfPage.getViewport({ scale: this.renderScale, rotation: totalRotation });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      // Fill white background first
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      await pdfPage.render(renderContext).promise;
      pageData.bgDataUrl = canvas.toDataURL('image/png', 1.0);
      pageData.renderWidth = viewport.width / this.renderScale;
      pageData.renderHeight = viewport.height / this.renderScale;
      return pageData.bgDataUrl;
    } else {
      // Fallback for image / blank
      return pageData.bgDataUrl;
    }
  }

  /**
   * Extracts and groups all text lines from PDF page for direct in-place editing with exact color and background matching
   */
  async extractPageTextLines(pageIndex, renderedCanvasCtx = null) {
    const pageData = this.pagesData[pageIndex];
    if (!pageData) return [];

    if (pageData.extractedTextLines && pageData.extractedTextLines.length > 0) {
      return pageData.extractedTextLines;
    }

    if (this.currentDoc && this.currentDoc.type === 'pdf' && this.currentDoc.pdfDocProxy) {
      try {
        const pdfPage = await this.currentDoc.pdfDocProxy.getPage(pageData.pageNum);
        const totalRotation = (pdfPage.rotate + pageData.rotation) % 360;
        
        const displayW = pageData.renderWidth || pageData.originalWidth || 794;
        const originalW = pageData.originalWidth || 595;
        const scale = displayW / originalW;

        const viewport = pdfPage.getViewport({ scale: scale, rotation: totalRotation });
        const textContent = await pdfPage.getTextContent();

        if (!textContent.items || textContent.items.length === 0) {
          pageData.extractedTextLines = [];
          return [];
        }

        const parsedItems = [];
        textContent.items.forEach((item, idx) => {
          const str = item.str;
          if (!str || str.trim().length === 0) return;

          const tx = item.transform[4];
          const ty = item.transform[5];
          const rawFontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]);

          const [vx, vy] = viewport.convertToViewportPoint(tx, ty);
          const fontSize = Math.round(rawFontSize * scale);
          const itemWidth = item.width * scale;
          const posX = Math.round(vx);
          const posY = Math.round(vy - fontSize * 0.9);
          const itemH = Math.round(fontSize * 1.25);
          const itemW = Math.round(itemWidth || str.length * (fontSize * 0.55));

          // Sample exact text color and background color
          const { bgColor, textColor } = this.sampleColors(renderedCanvasCtx, posX, posY, itemW, itemH);

          parsedItems.push({
            id: 'txt_' + idx,
            text: str,
            x: posX,
            y: posY,
            width: itemW,
            height: itemH,
            fontSize: Math.max(fontSize, 11),
            fontFamily: this.mapFontFamily(item.fontName),
            color: textColor,
            bgColor: bgColor
          });
        });

        parsedItems.sort((a, b) => (Math.abs(a.y - b.y) > 6 ? a.y - b.y : a.x - b.x));

        const lines = [];
        let currentLine = null;

        parsedItems.forEach(item => {
          if (!currentLine) {
            currentLine = { ...item };
            return;
          }

          const isSameY = Math.abs(item.y - currentLine.y) < 7;
          const isCloseX = (item.x - (currentLine.x + currentLine.width)) < (item.fontSize * 1.5);

          if (isSameY && isCloseX) {
            currentLine.text += ' ' + item.text;
            currentLine.width = (item.x + item.width) - currentLine.x;
            currentLine.height = Math.max(currentLine.height, item.height);
          } else {
            lines.push(currentLine);
            currentLine = { ...item };
          }
        });

        if (currentLine) lines.push(currentLine);
        pageData.extractedTextLines = lines;
        return lines;
      } catch (err) {
        console.error("Error extracting text lines from PDF:", err);
        return [];
      }
    }
    return [];
  }

  /**
   * Samples exact text foreground and background color from rendered canvas
   */
  sampleColors(ctx, x, y, width, height) {
    let bgColor = '#ffffff';
    let textColor = '#0f172a';

    if (!ctx) return { bgColor, textColor };

    try {
      const cW = ctx.canvas.width;
      const cH = ctx.canvas.height;

      // 1. Sample Background Color from 2px above the text top-left
      const bgX = Math.max(0, Math.min(x + 2, cW - 1));
      const bgY = Math.max(0, Math.min(y - 2, cH - 1));
      const bgData = ctx.getImageData(bgX, bgY, 1, 1).data;
      if (bgData[3] > 50) {
        bgColor = `rgb(${bgData[0]}, ${bgData[1]}, ${bgData[2]})`;
      }

      // 2. Sample Text Color: Find highest contrast non-background pixel inside text
      const tX = Math.max(0, Math.min(x, cW - 1));
      const tY = Math.max(0, Math.min(y, cH - 1));
      const tW = Math.min(Math.max(width, 8), cW - tX);
      const tH = Math.min(Math.max(height, 8), cH - tY);

      if (tW > 0 && tH > 0) {
        const imgData = ctx.getImageData(tX, tY, tW, tH).data;
        let maxContrast = 0;
        let bestR = 15, bestG = 23, bestB = 42;

        for (let i = 0; i < imgData.length; i += 16) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a > 120) {
            const dist = Math.abs(r - bgData[0]) + Math.abs(g - bgData[1]) + Math.abs(b - bgData[2]);
            if (dist > maxContrast) {
              maxContrast = dist;
              bestR = r;
              bestG = g;
              bestB = b;
            }
          }
        }

        if (maxContrast > 30) {
          textColor = `rgb(${bestR}, ${bestG}, ${bestB})`;
        }
      }
    } catch (e) {
      // Fallback to defaults
    }

    return { bgColor, textColor };
  }

  /**
   * Extracts embedded raster images from PDF pages as movable objects
   */
  async extractPageImages(pageIndex) {
    const pageData = this.pagesData[pageIndex];
    if (!pageData || !this.currentDoc || this.currentDoc.type !== 'pdf' || !this.currentDoc.pdfDocProxy) return [];

    if (pageData.extractedImages) {
      return pageData.extractedImages;
    }

    try {
      const pdfPage = await this.currentDoc.pdfDocProxy.getPage(pageData.pageNum);
      const opList = await pdfPage.getOperatorList();
      const displayW = pageData.renderWidth || pageData.originalWidth || 794;
      const originalW = pageData.originalWidth || 595;
      const scale = displayW / originalW;
      const viewport = pdfPage.getViewport({ scale: scale });

      const images = [];
      const ctmStack = [];
      let ctm = [1, 0, 0, 1, 0, 0];

      for (let i = 0; i < opList.fnArray.length; i++) {
        const fn = opList.fnArray[i];
        const args = opList.argsArray[i];

        if (fn === pdfjsLib.OPS.save) {
          ctmStack.push([...ctm]);
        } else if (fn === pdfjsLib.OPS.restore) {
          if (ctmStack.length > 0) ctm = ctmStack.pop();
        } else if (fn === pdfjsLib.OPS.transform) {
          const [a1, b1, c1, d1, e1, f1] = ctm;
          const [a2, b2, c2, d2, e2, f2] = args;
          ctm = [
            a1 * a2 + c1 * b2,
            b1 * a2 + d1 * b2,
            a1 * c2 + c1 * d2,
            b1 * c2 + d1 * d2,
            a1 * e2 + c1 * f2 + e1,
            b1 * e2 + d1 * f2 + f1
          ];
        } else if (fn === pdfjsLib.OPS.paintImageXObject) {
          const imgName = args ? args[0] : null;
          const [x0, y0] = viewport.convertToViewportPoint(ctm[4], ctm[5]);
          const w = Math.abs(ctm[0]) * scale;
          const h = Math.abs(ctm[3]) * scale;
          const imgY = Math.min(y0, y0 - h);

          if (imgName && pdfPage.objs && typeof pdfPage.objs.get === 'function') {
            try {
              const imgObj = await new Promise((res) => {
                pdfPage.objs.get(imgName, res);
              });
              if (imgObj && imgObj.data) {
                const imgCanvas = document.createElement('canvas');
                imgCanvas.width = imgObj.width;
                imgCanvas.height = imgObj.height;
                const imgCtx = imgCanvas.getContext('2d');
                const imgData = imgCtx.createImageData(imgObj.width, imgObj.height);

                if (imgObj.data.length === imgObj.width * imgObj.height * 4) {
                  imgData.data.set(imgObj.data);
                } else if (imgObj.data.length === imgObj.width * imgObj.height * 3) {
                  let srcIdx = 0;
                  for (let d = 0; d < imgData.data.length; d += 4) {
                    imgData.data[d] = imgObj.data[srcIdx++];
                    imgData.data[d + 1] = imgObj.data[srcIdx++];
                    imgData.data[d + 2] = imgObj.data[srcIdx++];
                    imgData.data[d + 3] = 255;
                  }
                }
                imgCtx.putImageData(imgData, 0, 0);

                images.push({
                  id: 'img_' + imgName,
                  dataUrl: imgCanvas.toDataURL('image/png'),
                  left: Math.round(x0),
                  top: Math.round(imgY),
                  width: Math.round(w),
                  height: Math.round(h)
                });
              }
            } catch (err) {
              console.warn("Could not retrieve image data:", err);
            }
          }
        }
      }

      pageData.extractedImages = images;
      return images;
    } catch (err) {
      console.warn("Image extraction error:", err);
      return [];
    }
  }

  mapFontFamily(fontName) {
    if (!fontName) return 'Inter';
    const f = fontName.toLowerCase();
    if (f.includes('times') || f.includes('serif')) return 'Times New Roman';
    if (f.includes('courier') || f.includes('mono')) return 'Courier New';
    if (f.includes('outfit')) return 'Outfit';
    return 'Inter';
  }

  /**
   * Gets current active page metadata
   */
  getCurrentPage() {
    return this.pagesData[this.currentPageIndex];
  }

  /**
   * Sets current page index
   * @param {number} index 
   */
  setCurrentPageIndex(index) {
    if (index >= 0 && index < this.pagesData.length) {
      this.currentPageIndex = index;
    }
  }

  /**
   * Exports the entire multi-page document as a real PDF file
   * Merges all canvas layers and background pages at high resolution
   * @param {Function} getPageCompositeCanvas - callback to get rasterized canvas for each page
   * @returns {Promise<Blob>}
   */
  async exportAsPDF(getPageCompositeCanvas) {
    const { PDFDocument } = PDFLib;
    const pdfDoc = await PDFDocument.create();

    for (let i = 0; i < this.pagesData.length; i++) {
      const pageData = this.pagesData[i];
      
      // Get composite canvas data url for page (background + fabric annotations)
      const dataUrl = await getPageCompositeCanvas(i);
      const imgBytes = await fetch(dataUrl).then(res => res.arrayBuffer());
      const embeddedImage = await pdfDoc.embedPng(imgBytes);

      // Use renderWidth/renderHeight (actual rendered pixel size) for accurate export dimensions
      const width = pageData.renderWidth || pageData.originalWidth || 595;
      const height = pageData.renderHeight || pageData.originalHeight || 842;

      // Handle orientation if rotated 90 or 270 deg
      const isSwapped = (pageData.rotation === 90 || pageData.rotation === 270);
      const finalW = isSwapped ? height : width;
      const finalH = isSwapped ? width : height;

      const page = pdfDoc.addPage([finalW, finalH]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: finalW,
        height: finalH
      });
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  }
}
