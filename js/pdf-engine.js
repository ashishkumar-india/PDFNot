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
          originalPdfPageNum: i,
          isCustom: false,
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
          originalPdfPageNum: null,
          isCustom: true,
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
      originalPdfPageNum: null,
      isCustom: true,
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
    const dataUrl = canvas.toDataURL('image/png');

    const newPage = {
      id: 'page_custom_' + Date.now(),
      pageNum: this.pagesData.length + 1,
      originalPdfPageNum: null,
      isCustom: true,
      originalWidth: defaultW,
      originalHeight: defaultH,
      rotation: 0,
      bgDataUrl: dataUrl,
      originalDataUrl: dataUrl,
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
    // Re-index display page numbers only (keeping originalPdfPageNum intact)
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

    // For image/blank/custom docs: save original before clearing so rotation can be re-applied
    if (page.bgDataUrl && !page.originalDataUrl) {
      // Only do this for NON-PDF pages! For PDFs, we want to re-render from source.
      if (!this.currentDoc || this.currentDoc.type !== 'pdf' || page.isCustom) {
        page.originalDataUrl = page.bgDataUrl;
      }
    }

    // Clear bgDataUrl for PDF pages so they re-render. For images, restore originalDataUrl.
    if (this.currentDoc && this.currentDoc.type === 'pdf' && !page.isCustom) {
      page.bgDataUrl = null;
    } else {
      page.bgDataUrl = page.originalDataUrl || null;
    }
    page._rotationApplied = null; // Force re-rotation on next render
    page.renderWidth = null;
    page.renderHeight = null;
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

    // Return cached render if valid and no pending rotation for images
    if (pageData.bgDataUrl) {
      if (pageData.rotation !== 0 && pageData._rotationApplied !== pageData.rotation) {
        // We have pending rotation that needs to be applied, don't return early!
      } else {
        return pageData.bgDataUrl;
      }
    }

    if (this.currentDoc && this.currentDoc.type === 'pdf' && this.currentDoc.pdfDocProxy && !pageData.isCustom && pageData.originalPdfPageNum && pageData.originalPdfPageNum <= this.currentDoc.pdfDocProxy.numPages) {
      const pdfPage = await this.currentDoc.pdfDocProxy.getPage(pageData.originalPdfPageNum);
      
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
      // Fallback for image / blank / custom added pages
      if (!pageData.bgDataUrl && pageData.originalDataUrl) {
        pageData.bgDataUrl = pageData.originalDataUrl;
      }
      if (!pageData.bgDataUrl) {
        pageData.renderWidth = pageData.originalWidth || 794;
        pageData.renderHeight = pageData.originalHeight || 1123;
        return null;
      }

      // If rotation is non-zero and we haven't rotated yet, apply rotation via canvas
      if (pageData.rotation !== 0 && pageData._rotationApplied !== pageData.rotation) {
        const sourceUrl = pageData.originalDataUrl || pageData.bgDataUrl;
        const rotated = await this._rotateImageDataUrl(sourceUrl, pageData.rotation);
        if (rotated) {
          pageData.bgDataUrl = rotated;
          pageData._rotationApplied = pageData.rotation;
          // Swap width/height for 90/270 rotations
          const isSwapped = (pageData.rotation === 90 || pageData.rotation === 270);
          const w = pageData.originalWidth || 794;
          const h = pageData.originalHeight || 1123;
          pageData.renderWidth = isSwapped ? h : w;
          pageData.renderHeight = isSwapped ? w : h;
        }
      }

      // Ensure renderWidth/renderHeight are always populated
      if (!pageData.renderWidth) {
        pageData.renderWidth = pageData.originalWidth || 794;
        pageData.renderHeight = pageData.originalHeight || 1123;
      }
      return pageData.bgDataUrl;
    }
  }

  /**
   * Rotates an image dataUrl by degrees using an off-screen canvas
   * @param {string} dataUrl
   * @param {number} degrees - 90, 180, or 270
   * @returns {Promise<string>} rotated dataUrl
   */
  _rotateImageDataUrl(dataUrl, degrees) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const rad = (degrees * Math.PI) / 180;
        const isSwapped = (degrees === 90 || degrees === 270);
        const w = isSwapped ? img.height : img.width;
        const h = isSwapped ? img.width : img.height;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        ctx.translate(w / 2, h / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  /**
   * Extracts embedded raster images from PDF pages as movable objects
   */
  async extractPageImages(pageIndex) {
    const pageData = this.pagesData[pageIndex];
    if (!pageData || !this.currentDoc || this.currentDoc.type !== 'pdf' || !this.currentDoc.pdfDocProxy || pageData.isCustom || !pageData.originalPdfPageNum) return [];

    if (pageData.extractedImages) {
      return pageData.extractedImages;
    }

    try {
      const pdfPage = await this.currentDoc.pdfDocProxy.getPage(pageData.originalPdfPageNum);
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

  deletePage(index) {
    if (this.pagesData.length <= 1) {
      throw new Error("Cannot delete the last page.");
    }
    this.pagesData.splice(index, 1);
    if (this.currentPageIndex >= this.pagesData.length) {
      this.currentPageIndex = this.pagesData.length - 1;
    } else if (this.currentPageIndex > index) {
      this.currentPageIndex--;
    }
    return this.currentPageIndex;
  }

  movePage(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.pagesData.length || toIndex < 0 || toIndex >= this.pagesData.length) return;
    const pageToMove = this.pagesData.splice(fromIndex, 1)[0];
    this.pagesData.splice(toIndex, 0, pageToMove);
    
    // Update active index if it moved
    if (this.currentPageIndex === fromIndex) {
      this.currentPageIndex = toIndex;
    } else if (fromIndex < this.currentPageIndex && toIndex >= this.currentPageIndex) {
      this.currentPageIndex--;
    } else if (fromIndex > this.currentPageIndex && toIndex <= this.currentPageIndex) {
      this.currentPageIndex++;
    }
  }

  /**
   * Exports the entire multi-page document as a True Vector PDF
   * Preserves original PDF structures and draws text/vectors losslessly
   * @returns {Promise<Blob>}
   */
  async exportAsPDF() {
    if (typeof VectorExportEngine === 'undefined') {
      throw new Error("VectorExportEngine module is not loaded.");
    }
    const vectorEngine = new VectorExportEngine(PDFLib);
    const pdfBytes = await vectorEngine.export(this.pagesData, this.currentDoc?.rawBytes);
    return new Blob([pdfBytes], { type: 'application/pdf' });
  }
}
