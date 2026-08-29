/**
 * AK Edit PRO - Digital Signature Modal Module
 * Handles Draw (with bezier curve smoothing), Type (cursive fonts), and Upload signature modes.
 */

class SignatureModal {
  constructor(onInsertCallback) {
    this.onInsertCallback = onInsertCallback;
    this.modalEl = document.getElementById('signature-modal');
    this.drawCanvas = document.getElementById('sig-draw-canvas');
    this.drawCtx = this.drawCanvas ? this.drawCanvas.getContext('2d') : null;
    
    this.activeTab = 'draw-sig'; // 'draw-sig' | 'type-sig' | 'upload-sig'
    this.currentColor = '#0f172a';
    this.isDrawing = false;
    this.points = [];
    this.hasDrawn = false;

    // Type signature state
    this.typedName = 'John Doe';
    this.selectedFont = 'Caveat';

    // Upload signature state
    this.uploadedDataUrl = null;

    this.init();
  }

  init() {
    if (!this.modalEl || !this.drawCanvas) return;

    this.setupDrawCanvas();
    this.bindEvents();
  }

  setupDrawCanvas() {
    // Set internal canvas resolution for high-DPI crisp signatures
    const rect = this.drawCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 2;
    this.drawCanvas.width = (rect.width || 640) * dpr;
    this.drawCanvas.height = (rect.height || 220) * dpr;
    this.drawCtx.scale(dpr, dpr);
    this.drawCtx.lineCap = 'round';
    this.drawCtx.lineJoin = 'round';
  }

  bindEvents() {
    // Open & Close
    const btnOpen = document.getElementById('btn-open-signature');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => this.open());
    }

    const btnClose = document.getElementById('btn-close-sig-modal');
    if (btnClose) btnClose.addEventListener('click', () => this.close());

    const btnCancel = document.getElementById('btn-cancel-signature');
    if (btnCancel) btnCancel.addEventListener('click', () => this.close());

    // Insert Signature Button
    const btnInsert = document.getElementById('btn-insert-signature');
    if (btnInsert) {
      btnInsert.addEventListener('click', () => this.handleInsert());
    }

    // Modal Tabs Switching
    const tabs = this.modalEl.querySelectorAll('.modal-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const tabTarget = tab.getAttribute('data-tab');
        this.activeTab = tabTarget;

        this.modalEl.querySelectorAll('.tab-pane').forEach(pane => {
          pane.classList.remove('active');
        });
        const targetPane = document.getElementById(tabTarget);
        if (targetPane) targetPane.classList.add('active');

        if (tabTarget === 'draw-sig') {
          setTimeout(() => this.setupDrawCanvas(), 50);
        }
      });
    });

    // Drawing Canvas Events (Mouse & Touch)
    const getPos = (e) => {
      const rect = this.drawCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    const startDraw = (e) => {
      e.preventDefault();
      this.isDrawing = true;
      this.hasDrawn = true;
      const pos = getPos(e);
      this.points = [pos];
    };

    const moveDraw = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      this.points.push(pos);
      this.renderSmoothStroke();
    };

    const endDraw = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      this.isDrawing = false;
      this.points = [];
    };

    this.drawCanvas.addEventListener('mousedown', startDraw);
    this.drawCanvas.addEventListener('mousemove', moveDraw);
    window.addEventListener('mouseup', endDraw);

    this.drawCanvas.addEventListener('touchstart', startDraw, { passive: false });
    this.drawCanvas.addEventListener('touchmove', moveDraw, { passive: false });
    this.drawCanvas.addEventListener('touchend', endDraw, { passive: false });

    // Clear Button
    const btnClear = document.getElementById('btn-clear-sig-pad');
    if (btnClear) {
      btnClear.addEventListener('click', () => this.clearPad());
    }

    // Signature Color Dots
    const colorDots = this.modalEl.querySelectorAll('.sig-color-dot');
    colorDots.forEach(dot => {
      dot.addEventListener('click', () => {
        colorDots.forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        this.currentColor = dot.getAttribute('data-color');
      });
    });

    // Type Signature Input
    const typeInput = document.getElementById('sig-type-input');
    if (typeInput) {
      typeInput.addEventListener('input', (e) => {
        this.typedName = e.target.value || 'Signature';
        this.modalEl.querySelectorAll('.sig-preview-text').forEach(el => {
          el.textContent = this.typedName;
        });
      });
    }

    // Font Cards Selection
    const fontCards = this.modalEl.querySelectorAll('.sig-font-card');
    fontCards.forEach(card => {
      card.addEventListener('click', () => {
        fontCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        this.selectedFont = card.getAttribute('data-font');
      });
    });

    // Upload Signature Dropzone & File Input
    const dropZone = document.getElementById('sig-drop-zone');
    const fileInput = document.getElementById('sig-file-input');
    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());
      
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleSignatureFileUpload(e.target.files[0]);
        }
      });

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#3b82f6';
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = '';
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.handleSignatureFileUpload(e.dataTransfer.files[0]);
        }
      });
    }

    const btnRemoveUploaded = document.getElementById('btn-remove-uploaded-sig');
    if (btnRemoveUploaded) {
      btnRemoveUploaded.addEventListener('click', () => {
        this.uploadedDataUrl = null;
        document.getElementById('sig-upload-preview-wrapper').style.display = 'none';
        document.getElementById('sig-drop-zone').style.display = 'block';
      });
    }
  }

  renderSmoothStroke() {
    if (this.points.length < 2) return;

    this.drawCtx.strokeStyle = this.currentColor;
    this.drawCtx.lineWidth = 3.2;

    const p1 = this.points[this.points.length - 2];
    const p2 = this.points[this.points.length - 1];

    this.drawCtx.beginPath();
    this.drawCtx.moveTo(p1.x, p1.y);
    // Smooth quadratic curve midpoint
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    this.drawCtx.quadraticCurveTo(p1.x, p1.y, midX, midY);
    this.drawCtx.stroke();
  }

  clearPad() {
    const dpr = window.devicePixelRatio || 2;
    this.drawCtx.clearRect(0, 0, this.drawCanvas.width / dpr, this.drawCanvas.height / dpr);
    this.hasDrawn = false;
  }

  handleSignatureFileUpload(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const rawDataUrl = e.target.result;
      
      // Auto remove white paper background using luminance ink mask
      try {
        if (window.BackgroundRemover) {
          this.uploadedDataUrl = await BackgroundRemover.removeBackground(rawDataUrl, {
            mode: 'luminance',
            tolerance: 35
          });
        } else {
          this.uploadedDataUrl = rawDataUrl;
        }
      } catch (err) {
        console.warn("Signature background remover fallback:", err);
        this.uploadedDataUrl = rawDataUrl;
      }

      const previewImg = document.getElementById('sig-upload-preview');
      if (previewImg) previewImg.src = this.uploadedDataUrl;
      document.getElementById('sig-upload-preview-wrapper').style.display = 'block';
      document.getElementById('sig-drop-zone').style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  open() {
    this.modalEl.classList.add('show');
    setTimeout(() => this.setupDrawCanvas(), 100);
  }

  close() {
    this.modalEl.classList.remove('show');
  }

  /**
   * Generates transparent PNG data URL from chosen signature tab and invokes callback
   */
  handleInsert() {
    let resultDataUrl = null;

    if (this.activeTab === 'draw-sig') {
      if (!this.hasDrawn) {
        alert("Please draw your signature first or choose Type/Upload.");
        return;
      }
      resultDataUrl = this.drawCanvas.toDataURL('image/png');
    } else if (this.activeTab === 'type-sig') {
      // Render typed text to temporary canvas
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');

      ctx.font = `64px "${this.selectedFont}", cursive`;
      ctx.fillStyle = this.currentColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.typedName, canvas.width / 2, canvas.height / 2);

      resultDataUrl = canvas.toDataURL('image/png');
    } else if (this.activeTab === 'upload-sig') {
      if (!this.uploadedDataUrl) {
        alert("Please upload a signature image first.");
        return;
      }
      resultDataUrl = this.uploadedDataUrl;
    }

    if (resultDataUrl && this.onInsertCallback) {
      this.onInsertCallback(resultDataUrl);
      this.close();
      this.clearPad();
    }
  }
}
