/**
 * DocuCraft PRO - Main Application Controller
 * Connects UI, PDF Engine, Canvas, Signature, Crop/Filter, Background Remover, and Export Hub.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Core Modules
  const pdfEngine = new PDFEngine();
  const canvasManager = new CanvasManager('pdf-fabric-canvas');
  canvasManager.pdfEngine = pdfEngine;

  // Initialize Signature Modal
  const signatureModal = new SignatureModal((signatureDataUrl) => {
    canvasManager.insertSignature(signatureDataUrl);
  });

  // Initialize Crop & Filter Manager
  const cropFilterManager = new CropFilterManager(canvasManager);

  // Initialize PDF Text Editor (Acrobat-style Smart PDF text detection & live replacement)
  const pdfTextEditor = new PDFTextEditor(canvasManager, pdfEngine);

  // UI Manager to bind all buttons & inspector
  const app = {
    pdfEngine,
    canvasManager,
    signatureModal,
    cropFilterManager,
    pdfTextEditor,

    // Background remover state
    bgOriginalDataUrl: null,
    bgProcessedDataUrl: null,

    // Export Hub state
    selectedExportFormat: 'pdf', // 'pdf' | 'png' | 'jpeg'

    async init() {
      canvasManager.uiManager = this;
      this.bindHeaderActions();
      this.bindToolActions();
      this.bindInspectorActions();
      this.bindContextBarActions();
      this.bindStampModalActions();
      this.bindBackgroundRemoverModal();
      this.bindExportHubModal();
      this.bindShortcutsModal();
      this.bindGlobalKeyboardShortcuts();
      this.bindDragAndDrop();

      // Load Sample Document by default so user can test immediately!
      await this.loadSampleDocument();
    },

    // ==================== DOCUMENT LOADING ====================

    async loadSampleDocument() {
      this.showLoader("Generating Sample Document...");
      try {
        const sampleBytes = await SampleData.createSamplePDFBytes();
        await pdfEngine.loadPDF(sampleBytes, 'AK-Edit-Sample-Agreement.pdf');
        document.getElementById('doc-filename').value = 'AK-Edit-Sample-Agreement.pdf';
        await this.renderCurrentPage();
        this.renderThumbnails();
        canvasManager.showToast('Sample PDF loaded! Try live editing.', 'success');
      } catch (err) {
        console.error("Error generating sample document:", err);
        pdfEngine.createBlankDocument();
        await this.renderCurrentPage();
        this.renderThumbnails();
      } finally {
        this.hideLoader();
      }
    },

    async handleFileUpload(file) {
      if (!file) return;
      this.showLoader(`Loading ${file.name}...`);
      try {
        const filename = file.name;
        document.getElementById('doc-filename').value = filename;

        if (file.type === 'application/pdf') {
          const arrayBuffer = await file.arrayBuffer();
          await pdfEngine.loadPDF(arrayBuffer, filename);
        } else if (file.type.startsWith('image/')) {
          await pdfEngine.loadImage(file, filename);
        } else {
          alert("Unsupported file format. Please upload PDF, PNG, JPG, or SVG.");
          return;
        }

        await this.renderCurrentPage();
        this.renderThumbnails();
        canvasManager.showToast(`${filename} loaded successfully!`, 'success');
      } catch (err) {
        console.error("Error loading file:", err);
        alert("Failed to load file: " + err.message);
      } finally {
        this.hideLoader();
      }
    },

    // ==================== PAGE RENDERING & THUMBNAILS ====================

    async renderCurrentPage() {
      const pageIndex = pdfEngine.currentPageIndex;
      const totalPages = pdfEngine.pagesData.length;
      const pageData = pdfEngine.pagesData[pageIndex];

      if (!pageData) return;

      this.showLoader(`Rendering Page ${pageIndex + 1}...`);

      try {
        const bgDataUrl = await pdfEngine.renderPageBackground(pageIndex);
        
        const renderW = pageData.renderWidth || pageData.originalWidth || 794;
        const renderH = pageData.renderHeight || pageData.originalHeight || 1123;

        await canvasManager.setPageBackground(bgDataUrl, renderW, renderH);
        await canvasManager.loadPageAnnotations(pageData.fabricJSON);
        canvasManager.resetHistory();

        // Update Header Page Nav
        document.getElementById('current-page-num').value = pageIndex + 1;
        document.getElementById('current-page-num').max = totalPages;
        document.getElementById('total-pages-count').textContent = totalPages;
        document.getElementById('sidebar-page-count').textContent = totalPages;

        document.getElementById('btn-prev-page').disabled = (pageIndex === 0);
        document.getElementById('btn-next-page').disabled = (pageIndex === totalPages - 1);

        this.updateThumbnailsActiveState();
        setTimeout(() => canvasManager.zoomFit(), 100);

        // Extract text bounding boxes for click-to-edit detection
        setTimeout(() => pdfTextEditor.extractTextFromCurrentPage(), 150);
      } finally {
        this.hideLoader();
      }
    },

    async switchToPage(targetIndex) {
      if (targetIndex === pdfEngine.currentPageIndex || targetIndex < 0 || targetIndex >= pdfEngine.pagesData.length) {
        return;
      }

      const currentPageData = pdfEngine.getCurrentPage();
      if (currentPageData) {
        currentPageData.fabricJSON = canvasManager.savePageAnnotations();
      }

      pdfEngine.setCurrentPageIndex(targetIndex);
      await this.renderCurrentPage();
    },

    async renderThumbnails() {
      const container = document.getElementById('thumbnails-container');
      if (!container) return;
      container.innerHTML = '';

      for (let i = 0; i < pdfEngine.pagesData.length; i++) {
        const pageData = pdfEngine.pagesData[i];
        const thumbItem = document.createElement('div');
        thumbItem.className = `thumb-item ${i === pdfEngine.currentPageIndex ? 'active' : ''}`;
        thumbItem.setAttribute('data-page-index', i);

        thumbItem.innerHTML = `
          <div class="thumb-preview-wrap" id="thumb-preview-${i}">
            <div class="spinner" style="width:20px; height:20px;"></div>
          </div>
          <span class="thumb-label">Page ${i + 1}</span>
          <div class="thumb-actions">
            <button class="thumb-btn text-danger btn-del-thumb" title="Delete Page"><i class="fa-solid fa-trash"></i></button>
          </div>
        `;

        thumbItem.addEventListener('click', (e) => {
          if (e.target.closest('.thumb-actions')) return;
          this.switchToPage(i);
        });

        const btnDel = thumbItem.querySelector('.btn-del-thumb');
        if (btnDel) {
          btnDel.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`Delete Page ${i + 1}?`)) {
              this.deletePage(i);
            }
          });
        }

        container.appendChild(thumbItem);

        pdfEngine.renderPageBackground(i).then(bgUrl => {
          const previewWrap = document.getElementById(`thumb-preview-${i}`);
          if (previewWrap) {
            previewWrap.innerHTML = `<img src="${bgUrl}" alt="Page ${i + 1}">`;
          }
        });
      }
    },

    updateThumbnailsActiveState() {
      const thumbs = document.querySelectorAll('.thumb-item');
      thumbs.forEach((t, idx) => {
        t.classList.toggle('active', idx === pdfEngine.currentPageIndex);
      });
    },

    async deletePage(index) {
      try {
        const newIndex = pdfEngine.deletePage(index);
        this.renderThumbnails();
        await this.renderCurrentPage();
        canvasManager.showToast('Page deleted', 'info');
      } catch (err) {
        alert(err.message);
      }
    },

    async addNewPage() {
      const curr = pdfEngine.getCurrentPage();
      if (curr) curr.fabricJSON = canvasManager.savePageAnnotations();

      const newIdx = pdfEngine.addNewPage();
      this.renderThumbnails();
      this.switchToPage(newIdx);
      canvasManager.showToast('New blank page added', 'success');
    },

    async rotateCurrentPage(deg) {
      const idx = pdfEngine.currentPageIndex;
      pdfEngine.rotatePage(idx, deg);
      await this.renderCurrentPage();
      this.renderThumbnails();
      canvasManager.showToast(`Page rotated ${deg > 0 ? 'CW' : 'CCW'} 90°`, 'info');
    },

    // ==================== BINDINGS & ACTIONS ====================

    bindHeaderActions() {
      // Open File
      const fileInput = document.getElementById('file-input');
      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            this.handleFileUpload(e.target.files[0]);
          }
        });
      }

      // Load Sample Demo
      document.getElementById('btn-load-sample')?.addEventListener('click', () => this.loadSampleDocument());
      document.getElementById('btn-new-blank')?.addEventListener('click', () => this.addNewPage());
      document.getElementById('btn-add-page-sidebar')?.addEventListener('click', () => this.addNewPage());

      // Exit Text Edit Mode Banner button
      document.getElementById('btn-exit-text-edit-mode')?.addEventListener('click', () => {
        pdfTextEditor.toggleTextEditMode(false);
      });

      // Toggle Thumbnails Sidebar
      const btnToggleSidebar = document.getElementById('btn-toggle-thumbnails');
      const sidebar = document.getElementById('pages-sidebar');
      if (btnToggleSidebar && sidebar) {
        btnToggleSidebar.addEventListener('click', () => {
          sidebar.classList.toggle('collapsed');
        });
      }

      // Mobile Drawer Toggles (Pages & Properties)
      const btnTogglePagesMobile = document.getElementById('btn-toggle-pages-mobile');
      const btnToggleInspectorMobile = document.getElementById('btn-toggle-inspector-mobile');
      const backdrop = document.getElementById('sidebar-backdrop');
      const pagesSidebar = document.getElementById('pages-sidebar');
      const propsSidebar = document.getElementById('properties-sidebar');

      const closeDrawers = () => {
        pagesSidebar?.classList.remove('open-mobile');
        propsSidebar?.classList.remove('open-mobile');
        backdrop?.classList.remove('active');
      };

      btnTogglePagesMobile?.addEventListener('click', () => {
        const isOpen = pagesSidebar?.classList.toggle('open-mobile');
        propsSidebar?.classList.remove('open-mobile');
        backdrop?.classList.toggle('active', isOpen);
      });

      btnToggleInspectorMobile?.addEventListener('click', () => {
        const isOpen = propsSidebar?.classList.toggle('open-mobile');
        pagesSidebar?.classList.remove('open-mobile');
        backdrop?.classList.toggle('active', isOpen);
      });

      backdrop?.addEventListener('click', closeDrawers);

      // Sidebar Rotate & Delete
      document.getElementById('btn-rotate-page-left')?.addEventListener('click', () => this.rotateCurrentPage(-90));
      document.getElementById('btn-rotate-page-right')?.addEventListener('click', () => this.rotateCurrentPage(90));
      document.getElementById('btn-delete-page')?.addEventListener('click', () => {
        if (confirm(`Delete current page ${pdfEngine.currentPageIndex + 1}?`)) {
          this.deletePage(pdfEngine.currentPageIndex);
        }
      });

      // Pagination Controls
      document.getElementById('btn-prev-page')?.addEventListener('click', () => {
        this.switchToPage(pdfEngine.currentPageIndex - 1);
      });
      document.getElementById('btn-next-page')?.addEventListener('click', () => {
        this.switchToPage(pdfEngine.currentPageIndex + 1);
      });
      document.getElementById('current-page-num')?.addEventListener('change', (e) => {
        const val = parseInt(e.target.value) - 1;
        this.switchToPage(val);
      });

      // Undo / Redo
      document.getElementById('btn-undo')?.addEventListener('click', () => canvasManager.undo());
      document.getElementById('btn-redo')?.addEventListener('click', () => canvasManager.redo());

      // Zoom Controls
      document.getElementById('btn-zoom-in')?.addEventListener('click', () => canvasManager.zoomIn());
      document.getElementById('btn-zoom-out')?.addEventListener('click', () => canvasManager.zoomOut());
      document.getElementById('btn-zoom-fit')?.addEventListener('click', () => canvasManager.zoomFit());

      // Quick Export Dropdown
      const btnExportOpt = document.getElementById('btn-export-options');
      const exportDropdown = document.getElementById('export-dropdown');
      if (btnExportOpt && exportDropdown) {
        btnExportOpt.addEventListener('click', (e) => {
          e.stopPropagation();
          exportDropdown.classList.toggle('show');
        });

        window.addEventListener('click', () => {
          exportDropdown.classList.remove('show');
        });
      }

      document.getElementById('export-pdf-all')?.addEventListener('click', () => this.exportMultiPagePDF());
      document.getElementById('export-png-current')?.addEventListener('click', () => this.exportImage('png', 1.0, false));
      document.getElementById('export-jpg-current')?.addEventListener('click', () => this.exportImage('jpeg', 0.95, false));
      document.getElementById('btn-print-doc')?.addEventListener('click', () => window.print());
    },

    bindToolActions() {
      const toolButtons = document.querySelectorAll('.floating-toolbar .tool-btn');
      toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const tool = btn.getAttribute('data-tool');
          if (!tool) return;

          if (tool === 'shapes') {
            const flyout = document.getElementById('shapes-flyout-menu');
            if (flyout) flyout.classList.toggle('show');
            return;
          }

          if (tool === 'image-modal') {
            this.openBackgroundRemoverModal();
            return;
          }

          document.getElementById('shapes-flyout-menu')?.classList.remove('show');
          this.activateTool(tool);
        });
      });

      // Shapes Flyout Sub-options
      const shapeOpts = document.querySelectorAll('.shape-opt');
      shapeOpts.forEach(opt => {
        opt.addEventListener('click', () => {
          const shapeType = opt.getAttribute('data-shape');
          document.getElementById('shapes-flyout-menu')?.classList.remove('show');
          this.activateTool('shapes', { shapeType });
          canvasManager.showToast(`Click canvas to place ${shapeType}`, 'info');
        });
      });
    },

    activateTool(toolName, options = {}) {
      const toolButtons = document.querySelectorAll('.floating-toolbar .tool-btn');
      toolButtons.forEach(b => {
        if (b.getAttribute('data-tool') === toolName) {
          b.classList.add('active');
        } else if (!['shapes', 'image-modal'].includes(b.getAttribute('data-tool'))) {
          b.classList.remove('active');
        }
      });

      const brushColor = document.getElementById('brush-color-picker')?.value || '#ef4444';
      const brushWidth = document.getElementById('brush-width-slider')?.value || 4;

      canvasManager.setTool(toolName, {
        color: brushColor,
        width: brushWidth,
        ...options
      });
    },

    // ==================== AUTO BACKGROUND REMOVAL MODAL ====================

    bindBackgroundRemoverModal() {
      const modal = document.getElementById('bg-remove-modal');
      const btnClose = document.getElementById('btn-close-bg-modal');
      const btnCancel = document.getElementById('btn-cancel-bg-modal');
      const fileInput = document.getElementById('bg-upload-input');
      const tolSlider = document.getElementById('bg-tolerance-slider');
      const featherSlider = document.getElementById('bg-feather-slider');
      const modeSelect = document.getElementById('bg-remove-mode');
      const chkAuto = document.getElementById('chk-auto-remove-bg');
      const btnInsert = document.getElementById('btn-insert-bg-image');
      const targetColorInput = document.getElementById('bg-target-color');

      if (btnClose) btnClose.addEventListener('click', () => modal.classList.remove('show'));
      if (btnCancel) btnCancel.addEventListener('click', () => modal.classList.remove('show'));

      // File Input Change
      if (fileInput) {
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              this.loadAndProcessBgImage(ev.target.result);
            };
            reader.readAsDataURL(e.target.files[0]);
          }
        });
      }

      // Slider & Mode Changes -> Trigger re-processing
      const triggerReprocess = () => {
        if (this.bgOriginalDataUrl) {
          this.processImageBackground();
        }
      };

      if (tolSlider) {
        tolSlider.addEventListener('input', (e) => {
          document.getElementById('val-bg-tolerance').textContent = e.target.value;
          triggerReprocess();
        });
      }

      if (featherSlider) {
        featherSlider.addEventListener('input', (e) => {
          document.getElementById('val-bg-feather').textContent = e.target.value;
          triggerReprocess();
        });
      }

      if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
          document.getElementById('grp-custom-color').style.display = (e.target.value === 'custom') ? 'block' : 'none';
          triggerReprocess();
        });
      }

      if (chkAuto) chkAuto.addEventListener('change', triggerReprocess);

      if (targetColorInput) {
        targetColorInput.addEventListener('input', (e) => {
          document.getElementById('bg-target-color-hex').textContent = e.target.value.toUpperCase();
          triggerReprocess();
        });
      }

      // Sample image buttons (Badge & Signature)
      document.querySelectorAll('.sample-img-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.getAttribute('data-type');
          const sampleDataUrl = this.generateSampleBadgeImage(type);
          this.loadAndProcessBgImage(sampleDataUrl);
        });
      });

      // Insert button
      if (btnInsert) {
        btnInsert.addEventListener('click', () => {
          const finalDataUrl = this.bgProcessedDataUrl || this.bgOriginalDataUrl;
          if (finalDataUrl) {
            fabric.Image.fromURL(finalDataUrl, (img) => {
              const maxW = 280;
              if (img.width > maxW) img.scale(maxW / img.width);
              img.set({
                left: canvasManager.canvas.getWidth() / 2 - (img.getScaledWidth() / 2),
                top: canvasManager.canvas.getHeight() / 2 - (img.getScaledHeight() / 2)
              });
              canvasManager.canvas.add(img);
              canvasManager.canvas.setActiveObject(img);
              canvasManager.canvas.renderAll();
              canvasManager.saveState();
              modal.classList.remove('show');
              canvasManager.showToast('Transparent image added to page!', 'success');
            });
          }
        });
      }
    },

    openBackgroundRemoverModal() {
      const modal = document.getElementById('bg-remove-modal');
      if (modal) modal.classList.add('show');
    },

    async loadAndProcessBgImage(dataUrl) {
      this.bgOriginalDataUrl = dataUrl;
      const origImg = document.getElementById('bg-original-img');
      origImg.src = dataUrl;
      document.getElementById('bg-orig-placeholder').style.display = 'none';

      await this.processImageBackground();
      document.getElementById('btn-insert-bg-image').disabled = false;
    },

    async processImageBackground() {
      if (!this.bgOriginalDataUrl) return;

      const isEnabled = document.getElementById('chk-auto-remove-bg').checked;
      const procImg = document.getElementById('bg-processed-img');
      const placeholder = document.getElementById('bg-proc-placeholder');

      if (!isEnabled) {
        this.bgProcessedDataUrl = this.bgOriginalDataUrl;
        procImg.src = this.bgOriginalDataUrl;
        placeholder.style.display = 'none';
        return;
      }

      const mode = document.getElementById('bg-remove-mode').value;
      const tolerance = parseInt(document.getElementById('bg-tolerance-slider').value) || 30;
      const feather = parseInt(document.getElementById('bg-feather-slider').value) || 2;
      const customHex = document.getElementById('bg-target-color').value;

      let targetColor = null;
      if (mode === 'custom') {
        const rgb = this.hexToRgb(customHex);
        targetColor = rgb;
      }

      try {
        const transparentDataUrl = await BackgroundRemover.removeBackground(this.bgOriginalDataUrl, {
          mode,
          tolerance,
          feather,
          targetColor,
          floodFill: (mode !== 'luminance')
        });

        this.bgProcessedDataUrl = transparentDataUrl;
        procImg.src = transparentDataUrl;
        placeholder.style.display = 'none';
      } catch (err) {
        console.error("Error in background remover:", err);
      }
    },

    generateSampleBadgeImage(type) {
      const c = document.createElement('canvas');
      c.width = 300;
      c.height = 300;
      const ctx = c.getContext('2d');

      // White solid background to test removal
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 300, 300);

      if (type === 'signature') {
        ctx.font = '54px "Caveat", cursive';
        ctx.fillStyle = '#1d4ed8';
        ctx.textAlign = 'center';
        ctx.fillText('Alex Morgan', 150, 160);
      } else {
        // Red Official Seal
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(150, 150, 110, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 22px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('OFFICIAL SEAL', 150, 135);
        ctx.fillText('★ 2026 ★', 150, 175);
      }

      return c.toDataURL('image/png');
    },

    hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 255, g: 255, b: 255 };
    },

    // ==================== EXPORT HUB MODAL ====================

    bindExportHubModal() {
      const modal = document.getElementById('export-hub-modal');
      const btnOpen = document.getElementById('btn-open-export-modal');
      const btnClose = document.getElementById('btn-close-export-hub');
      const btnCancel = document.getElementById('btn-cancel-export-hub');
      const btnExecute = document.getElementById('btn-execute-hub-export');

      if (btnOpen && modal) {
        btnOpen.addEventListener('click', () => modal.classList.add('show'));
      }
      if (btnClose && modal) btnClose.addEventListener('click', () => modal.classList.remove('show'));
      if (btnCancel && modal) btnCancel.addEventListener('click', () => modal.classList.remove('show'));

      // Format Cards Selection
      const formatCards = document.querySelectorAll('.export-format-card');
      formatCards.forEach(card => {
        card.addEventListener('click', () => {
          formatCards.forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          this.selectedExportFormat = card.getAttribute('data-export-format');

          // Show/hide sub-options
          document.getElementById('grp-jpeg-quality').style.display = (this.selectedExportFormat === 'jpeg') ? 'block' : 'none';
          document.getElementById('grp-png-bg').style.display = (this.selectedExportFormat === 'png') ? 'block' : 'none';
        });
      });

      // JPEG Quality Slider
      const jpgQualitySlider = document.getElementById('export-jpeg-quality');
      if (jpgQualitySlider) {
        jpgQualitySlider.addEventListener('input', (e) => {
          document.getElementById('val-jpeg-quality').textContent = e.target.value;
        });
      }

      // Execute Export
      if (btnExecute) {
        btnExecute.addEventListener('click', async () => {
          const pageRange = document.getElementById('export-page-range').value;
          modal.classList.remove('show');

          if (this.selectedExportFormat === 'pdf') {
            if (pageRange === 'all') {
              await this.exportMultiPagePDF();
            } else {
              await this.exportSinglePagePDF();
            }
          } else if (this.selectedExportFormat === 'png') {
            const bgType = document.getElementById('export-png-bg-type').value;
            const isTransparent = (bgType === 'transparent');
            this.exportImage('png', 1.0, isTransparent);
          } else if (this.selectedExportFormat === 'jpeg') {
            const quality = (parseInt(document.getElementById('export-jpeg-quality').value) || 95) / 100;
            this.exportImage('jpeg', quality, false);
          }
        });
      }
    },

    bindInspectorActions() {
      // Toggle Inspector Sidebar
      const btnToggle = document.getElementById('btn-toggle-inspector');
      const inspector = document.getElementById('inspector-sidebar');
      if (btnToggle && inspector) {
        btnToggle.addEventListener('click', () => {
          inspector.classList.toggle('collapsed');
        });
      }

      // Auto Background Remover from Inspector
      const btnInspectRemoveBg = document.getElementById('btn-inspector-remove-bg');
      if (btnInspectRemoveBg) {
        btnInspectRemoveBg.addEventListener('click', () => {
          const tol = parseInt(document.getElementById('inspector-bg-tol').value) || 35;
          canvasManager.removeSelectedImageBackground(tol);
        });
      }

      const inspectBgTolSlider = document.getElementById('inspector-bg-tol');
      if (inspectBgTolSlider) {
        inspectBgTolSlider.addEventListener('input', (e) => {
          document.getElementById('val-inspector-bg-tol').textContent = e.target.value;
        });
      }

      // Text Props: Font Family & Size
      const fontSelect = document.getElementById('text-font-family');
      if (fontSelect) {
        fontSelect.addEventListener('change', (e) => {
          const obj = canvasManager.canvas.getActiveObject();
          if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
            obj.set('fontFamily', e.target.value);
            canvasManager.canvas.renderAll();
            canvasManager.saveState();
          }
        });
      }

      const fontSizeInput = document.getElementById('text-font-size');
      if (fontSizeInput) {
        fontSizeInput.addEventListener('input', (e) => {
          const obj = canvasManager.canvas.getActiveObject();
          if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
            obj.set('fontSize', parseInt(e.target.value) || 20);
            canvasManager.canvas.renderAll();
            canvasManager.saveState();
          }
        });
      }

      // Text Styles: Bold, Italic, Underline, Strike
      const bindTextStyleToggle = (btnId, propName, onVal, offVal) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', () => {
          const obj = canvasManager.canvas.getActiveObject();
          if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
            const isCurrently = (obj[propName] === onVal || !!obj[propName]);
            obj.set(propName, isCurrently ? offVal : onVal);
            btn.classList.toggle('active', !isCurrently);
            canvasManager.canvas.renderAll();
            canvasManager.saveState();
          }
        });
      };

      bindTextStyleToggle('btn-text-bold', 'fontWeight', 'bold', 'normal');
      bindTextStyleToggle('btn-text-italic', 'fontStyle', 'italic', 'normal');
      bindTextStyleToggle('btn-text-underline', 'underline', true, false);
      bindTextStyleToggle('btn-text-strike', 'linethrough', true, false);

      // Text Alignments
      ['left', 'center', 'right'].forEach(align => {
        const btn = document.getElementById(`btn-align-${align}`);
        if (btn) {
          btn.addEventListener('click', () => {
            const obj = canvasManager.canvas.getActiveObject();
            if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
              obj.set('textAlign', align);
              document.querySelectorAll('.btn-toggle-group .btn-toggle').forEach(b => {
                if (b.id.startsWith('btn-align-')) b.classList.remove('active');
              });
              btn.classList.add('active');
              canvasManager.canvas.renderAll();
              canvasManager.saveState();
            }
          });
        }
      });

      // Text Color Picker
      const textColorPicker = document.getElementById('text-color-picker');
      if (textColorPicker) {
        textColorPicker.addEventListener('input', (e) => {
          document.getElementById('text-color-hex').textContent = e.target.value.toUpperCase();
          const obj = canvasManager.canvas.getActiveObject();
          if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
            obj.set('fill', e.target.value);
            canvasManager.canvas.renderAll();
            canvasManager.saveState();
          }
        });
      }

      // Text Background Highlight Fill
      const textBgPicker = document.getElementById('text-bg-picker');
      if (textBgPicker) {
        textBgPicker.addEventListener('input', (e) => {
          const obj = canvasManager.canvas.getActiveObject();
          if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
            obj.set('textBackgroundColor', e.target.value);
            canvasManager.canvas.renderAll();
            canvasManager.saveState();
          }
        });
      }
      document.getElementById('btn-text-bg-transparent')?.addEventListener('click', () => {
        const obj = canvasManager.canvas.getActiveObject();
        if (obj && (obj.type === 'i-text' || obj.type === 'text')) {
          obj.set('textBackgroundColor', 'transparent');
          canvasManager.canvas.renderAll();
          canvasManager.saveState();
        }
      });

      // Brush / Stroke Color & Width
      const brushColorPicker = document.getElementById('brush-color-picker');
      if (brushColorPicker) {
        brushColorPicker.addEventListener('input', (e) => {
          document.getElementById('brush-color-hex').textContent = e.target.value.toUpperCase();
          if (canvasManager.canvas.freeDrawingBrush) {
            canvasManager.canvas.freeDrawingBrush.color = e.target.value;
          }
          const obj = canvasManager.canvas.getActiveObject();
          if (obj && obj.set) {
            obj.set('stroke', e.target.value);
            canvasManager.canvas.renderAll();
            canvasManager.saveState();
          }
        });
      }

      const brushWidthSlider = document.getElementById('brush-width-slider');
      if (brushWidthSlider) {
        brushWidthSlider.addEventListener('input', (e) => {
          document.getElementById('val-brush-width').textContent = e.target.value;
          if (canvasManager.canvas.freeDrawingBrush) {
            canvasManager.canvas.freeDrawingBrush.width = parseInt(e.target.value);
          }
          const obj = canvasManager.canvas.getActiveObject();
          if (obj && obj.set) {
            obj.set('strokeWidth', parseInt(e.target.value));
            canvasManager.canvas.renderAll();
            canvasManager.saveState();
          }
        });
      }

      // Color Swatches Strip
      const swatches = document.querySelectorAll('.color-swatch');
      swatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
          const color = swatch.getAttribute('data-color');
          brushColorPicker.value = color;
          document.getElementById('brush-color-hex').textContent = color.toUpperCase();
          if (canvasManager.canvas.freeDrawingBrush) {
            canvasManager.canvas.freeDrawingBrush.color = color;
          }
          const obj = canvasManager.canvas.getActiveObject();
          if (obj && obj.set) {
            obj.set('stroke', color);
            canvasManager.canvas.renderAll();
            canvasManager.saveState();
          }
        });
      });

      // Shape Fill & Opacity
      const shapeFillPicker = document.getElementById('shape-fill-picker');
      if (shapeFillPicker) {
        shapeFillPicker.addEventListener('input', (e) => {
          const obj = canvasManager.canvas.getActiveObject();
          if (obj && obj.set) {
            obj.set('fill', e.target.value);
            canvasManager.canvas.renderAll();
            canvasManager.saveState();
          }
        });
      }
      document.getElementById('btn-shape-fill-transparent')?.addEventListener('click', (e) => {
        e.target.closest('button').classList.toggle('active');
        const obj = canvasManager.canvas.getActiveObject();
        if (obj && obj.set) {
          obj.set('fill', 'transparent');
          canvasManager.canvas.renderAll();
          canvasManager.saveState();
        }
      });

      // Object Opacity Slider
      const opacitySlider = document.getElementById('object-opacity-slider');
      if (opacitySlider) {
        opacitySlider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value);
          document.getElementById('val-object-opacity').textContent = val;
          const obj = canvasManager.canvas.getActiveObject();
          if (obj && obj.set) {
            obj.set('opacity', val / 100);
            canvasManager.canvas.renderAll();
            canvasManager.saveState();
          }
        });
      }

      // Layer Ordering in Inspector
      document.getElementById('prop-btn-bring-forward')?.addEventListener('click', () => {
        const obj = canvasManager.canvas.getActiveObject();
        if (obj) {
          canvasManager.canvas.bringForward(obj);
          canvasManager.canvas.renderAll();
          canvasManager.saveState();
        }
      });
      document.getElementById('prop-btn-send-backward')?.addEventListener('click', () => {
        const obj = canvasManager.canvas.getActiveObject();
        if (obj) {
          canvasManager.canvas.sendBackwards(obj);
          canvasManager.canvas.renderAll();
          canvasManager.saveState();
        }
      });
      document.getElementById('prop-btn-center-h')?.addEventListener('click', () => {
        const obj = canvasManager.canvas.getActiveObject();
        if (obj) {
          canvasManager.canvas.centerObjectH(obj);
          canvasManager.canvas.renderAll();
          canvasManager.saveState();
        }
      });
      document.getElementById('prop-btn-center-v')?.addEventListener('click', () => {
        const obj = canvasManager.canvas.getActiveObject();
        if (obj) {
          canvasManager.canvas.centerObjectV(obj);
          canvasManager.canvas.renderAll();
          canvasManager.saveState();
        }
      });
    },

    bindContextBarActions() {
      // 1-Click Remove BG from Context Bar
      document.getElementById('ctx-remove-bg')?.addEventListener('click', () => {
        canvasManager.removeSelectedImageBackground(35);
      });

      // Duplicate Object
      document.getElementById('ctx-duplicate')?.addEventListener('click', () => {
        const obj = canvasManager.canvas.getActiveObject();
        if (obj) {
          obj.clone((cloned) => {
            cloned.set({
              left: obj.left + 20,
              top: obj.top + 20,
              evented: true
            });
            canvasManager.canvas.add(cloned);
            canvasManager.canvas.setActiveObject(cloned);
            canvasManager.canvas.renderAll();
            canvasManager.saveState();
          });
        }
      });

      // Bring Front & Send Back
      document.getElementById('ctx-bring-front')?.addEventListener('click', () => {
        const obj = canvasManager.canvas.getActiveObject();
        if (obj) {
          canvasManager.canvas.bringToFront(obj);
          canvasManager.canvas.renderAll();
          canvasManager.saveState();
        }
      });
      document.getElementById('ctx-send-back')?.addEventListener('click', () => {
        const obj = canvasManager.canvas.getActiveObject();
        if (obj) {
          canvasManager.canvas.sendToBack(obj);
          canvasManager.canvas.renderAll();
          canvasManager.saveState();
        }
      });

      // Lock / Unlock
      document.getElementById('ctx-lock')?.addEventListener('click', () => {
        const obj = canvasManager.canvas.getActiveObject();
        if (obj) {
          const isLocked = !obj.lockMovementX;
          obj.set({
            lockMovementX: isLocked,
            lockMovementY: isLocked,
            lockRotation: isLocked,
            lockScalingX: isLocked,
            lockScalingY: isLocked
          });
          canvasManager.showToast(isLocked ? 'Object locked' : 'Object unlocked', 'info');
        }
      });

      // Delete Object
      document.getElementById('ctx-delete')?.addEventListener('click', () => {
        const obj = canvasManager.canvas.getActiveObject();
        if (obj) {
          canvasManager.canvas.remove(obj);
          canvasManager.canvas.discardActiveObject();
          canvasManager.canvas.renderAll();
          canvasManager.saveState();
          document.getElementById('floating-context-bar')?.classList.remove('show');
        }
      });
    },

    bindStampModalActions() {
      const stampModal = document.getElementById('stamp-modal');
      const btnOpenStamps = document.getElementById('btn-open-stamps');
      const btnCloseStamp = document.getElementById('btn-close-stamp-modal');

      if (btnOpenStamps && stampModal) {
        btnOpenStamps.addEventListener('click', () => stampModal.classList.add('show'));
      }
      if (btnCloseStamp && stampModal) {
        btnCloseStamp.addEventListener('click', () => stampModal.classList.remove('show'));
      }

      const stampItems = document.querySelectorAll('.stamp-item');
      stampItems.forEach(item => {
        item.addEventListener('click', () => {
          const stampName = item.getAttribute('data-stamp');
          const stampColor = item.getAttribute('data-color') || '#16a34a';

          if (stampName === 'CUSTOM') {
            const customText = prompt("Enter your custom stamp text:", "CONFIDENTIAL COPY");
            if (customText) {
              canvasManager.insertStamp(customText.toUpperCase(), '#8b5cf6');
            }
          } else {
            canvasManager.insertStamp(stampName, stampColor);
          }
          stampModal.classList.remove('show');
        });
      });
    },

    bindShortcutsModal() {
      const shortcutsModal = document.getElementById('shortcuts-modal');
      const btnOpen = document.getElementById('btn-keyboard-shortcuts');
      const btnClose = document.getElementById('btn-close-shortcuts');

      if (btnOpen && shortcutsModal) {
        btnOpen.addEventListener('click', () => shortcutsModal.classList.add('show'));
      }
      if (btnClose && shortcutsModal) {
        btnClose.addEventListener('click', () => shortcutsModal.classList.remove('show'));
      }
    },

    bindGlobalKeyboardShortcuts() {
      window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || canvasManager.isEditingText()) {
          return;
        }

        const isCtrl = e.ctrlKey || e.metaKey;

        // Undo: Ctrl+Z
        if (isCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
          e.preventDefault();
          canvasManager.undo();
          return;
        }

        // Redo: Ctrl+Y or Ctrl+Shift+Z
        if ((isCtrl && e.key.toLowerCase() === 'y') || (isCtrl && e.shiftKey && e.key.toLowerCase() === 'z')) {
          e.preventDefault();
          canvasManager.redo();
          return;
        }

        // Duplicate: Ctrl+D
        if (isCtrl && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          document.getElementById('ctx-duplicate')?.click();
          return;
        }

        // Delete: Delete or Backspace
        if (e.key === 'Delete' || e.key === 'Backspace') {
          const obj = canvasManager.canvas.getActiveObject();
          if (obj) {
            e.preventDefault();
            canvasManager.canvas.remove(obj);
            canvasManager.canvas.discardActiveObject();
            canvasManager.canvas.renderAll();
            canvasManager.saveState();
          }
          return;
        }

        // Quick Tool Keys
        if (!isCtrl) {
          switch (e.key.toLowerCase()) {
            case 'v': this.activateTool('select'); break;
            case 'h': this.activateTool('hand'); break;
            case 't': this.activateTool('text'); break;
            case 'p': this.activateTool('draw'); break;
            case 'b': this.activateTool('highlighter'); break;
            case 'e': this.activateTool('eraser'); break;
            case 'arrowleft': this.switchToPage(pdfEngine.currentPageIndex - 1); break;
            case 'arrowright': this.switchToPage(pdfEngine.currentPageIndex + 1); break;
          }
        }
      });
    },

    bindDragAndDrop() {
      const dropArea = document.getElementById('canvas-workspace');
      if (!dropArea) return;

      ['dragenter', 'dragover'].forEach(name => {
        dropArea.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
      });

      dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleFileUpload(e.dataTransfer.files[0]);
        }
      });
    },

    // ==================== EXPORT FUNCTIONS ====================

    async exportMultiPagePDF() {
      this.showLoader("Synthesizing Full Multi-Page PDF...");
      try {
        const curr = pdfEngine.getCurrentPage();
        if (curr) curr.fabricJSON = canvasManager.savePageAnnotations();

        const getPageComposite = async (pageIdx) => {
          const pData = pdfEngine.pagesData[pageIdx];
          const bgUrl = await pdfEngine.renderPageBackground(pageIdx);
          
          const tempCanvasEl = document.createElement('canvas');
          tempCanvasEl.width = pData.renderWidth || pData.originalWidth || 794;
          tempCanvasEl.height = pData.renderHeight || pData.originalHeight || 1123;

          const tempFabric = new fabric.Canvas(tempCanvasEl);
          
          await new Promise(res => {
            fabric.Image.fromURL(bgUrl, (img) => {
              img.set({
                originX: 'left', originY: 'top',
                scaleX: tempCanvasEl.width / img.width,
                scaleY: tempCanvasEl.height / img.height,
                selectable: false
              });
              tempFabric.setBackgroundImage(img, res);
            }, { crossOrigin: 'anonymous' });
          });

          if (pData.fabricJSON) {
            await new Promise(res => tempFabric.loadFromJSON(pData.fabricJSON, res));
          }

          const compositeUrl = tempFabric.toDataURL({ format: 'png', quality: 1.0, multiplier: 1.5 });
          tempFabric.dispose();
          return compositeUrl;
        };

        const pdfBlob = await pdfEngine.exportAsPDF(getPageComposite);
        const downloadUrl = URL.createObjectURL(pdfBlob);
        
        let filename = document.getElementById('doc-filename').value.trim() || 'Document-Edited.pdf';
        if (!filename.endsWith('.pdf')) filename += '.pdf';

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(downloadUrl);

        canvasManager.showToast('Multi-Page PDF saved & downloaded!', 'success');
      } catch (err) {
        console.error("PDF Export error:", err);
        alert("Failed to export PDF: " + err.message);
      } finally {
        this.hideLoader();
      }
    },

    async exportSinglePagePDF() {
      this.showLoader("Generating Single-Page PDF...");
      try {
        const { PDFDocument } = PDFLib;
        const pdfDoc = await PDFDocument.create();

        const pData = pdfEngine.getCurrentPage();
        const dataUrl = canvasManager.getCompositeDataURL('png', 1.0, false);
        const imgBytes = await fetch(dataUrl).then(res => res.arrayBuffer());
        const embeddedImage = await pdfDoc.embedPng(imgBytes);

        const width = pData.originalWidth || 595;
        const height = pData.originalHeight || 842;

        const page = pdfDoc.addPage([width, height]);
        page.drawImage(embeddedImage, { x: 0, y: 0, width, height });

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const downloadUrl = URL.createObjectURL(blob);

        let baseName = document.getElementById('doc-filename').value.replace(/\.[^/.]+$/, '') || 'Document';
        const filename = `${baseName}-Page-${pdfEngine.currentPageIndex + 1}.pdf`;

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(downloadUrl);

        canvasManager.showToast('Single-Page PDF downloaded!', 'success');
      } catch (err) {
        console.error("Single page PDF export error:", err);
        alert("Failed to export: " + err.message);
      } finally {
        this.hideLoader();
      }
    },

    exportImage(format = 'png', quality = 1.0, isTransparent = false) {
      try {
        const dataUrl = canvasManager.getCompositeDataURL(format, quality, isTransparent);
        let baseName = document.getElementById('doc-filename').value.replace(/\.[^/.]+$/, '') || 'Document';
        const pageNum = pdfEngine.currentPageIndex + 1;
        const ext = (format === 'jpeg' || format === 'jpg') ? 'jpg' : 'png';
        const filename = `${baseName}-Page-${pageNum}${isTransparent ? '-transparent' : ''}.${ext}`;

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();

        canvasManager.showToast(`Page ${pageNum} downloaded as ${ext.toUpperCase()}`, 'success');
      } catch (err) {
        console.error("Image Export error:", err);
        alert("Failed to export image: " + err.message);
      }
    },

    // ==================== LOADER ====================

    showLoader(msg = 'Processing...') {
      const loader = document.getElementById('canvas-loader');
      const status = document.getElementById('loader-status');
      if (status) status.textContent = msg;
      if (loader) loader.classList.add('active');
    },

    hideLoader() {
      const loader = document.getElementById('canvas-loader');
      if (loader) loader.classList.remove('active');
    }
  };

  // Launch App
  window.AKEditApp = app;
  window.DocuCraftApp = app;
  await app.init();
});
