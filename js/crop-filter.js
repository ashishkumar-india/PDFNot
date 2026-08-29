/**
 * DocuCraft PRO - Crop & Image Filter Module
 * Integrates Cropper.js and Fabric.js Image Filter Pipeline for real-time visual enhancements.
 */

class CropFilterManager {
  constructor(canvasManager) {
    this.canvasManager = canvasManager;
    this.cropperInstance = null;
    this.cropModalEl = document.getElementById('crop-modal');
    this.cropImageEl = document.getElementById('crop-target-image');
    
    this.init();
  }

  init() {
    this.bindCropEvents();
    this.bindFilterEvents();
  }

  bindCropEvents() {
    const btnCrop = document.getElementById('btn-crop-tool');
    if (btnCrop) {
      btnCrop.addEventListener('click', () => this.openCropModal());
    }

    const btnClose = document.getElementById('btn-close-crop-modal');
    if (btnClose) btnClose.addEventListener('click', () => this.closeCropModal());

    const btnCancel = document.getElementById('btn-cancel-crop');
    if (btnCancel) btnCancel.addEventListener('click', () => this.closeCropModal());

    const btnApply = document.getElementById('btn-apply-crop');
    if (btnApply) btnApply.addEventListener('click', () => this.applyCrop());

    // Aspect Ratio Buttons
    const ratioBtns = document.querySelectorAll('.crop-ratio-btn');
    ratioBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        ratioBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const ratio = parseFloat(btn.getAttribute('data-ratio'));
        if (this.cropperInstance) {
          this.cropperInstance.setAspectRatio(isNaN(ratio) ? NaN : ratio);
        }
      });
    });
  }

  openCropModal() {
    // Get target image data (either selected Fabric image or entire page background)
    const activeObj = this.canvasManager.canvas.getActiveObject();
    let srcToCrop = null;

    if (activeObj && activeObj.type === 'image') {
      srcToCrop = activeObj.getSrc ? activeObj.getSrc() : activeObj._element.src;
    } else {
      // Export current canvas snapshot to crop
      srcToCrop = this.canvasManager.canvas.toDataURL({ format: 'png', quality: 1 });
    }

    if (!srcToCrop) {
      alert("No image or page available to crop.");
      return;
    }

    this.cropImageEl.src = srcToCrop;
    this.cropModalEl.classList.add('show');

    // Initialize Cropper after modal displays
    setTimeout(() => {
      if (this.cropperInstance) {
        this.cropperInstance.destroy();
      }
      this.cropperInstance = new Cropper(this.cropImageEl, {
        viewMode: 1,
        autoCropArea: 0.9,
        responsive: true,
        background: false
      });
    }, 150);
  }

  closeCropModal() {
    if (this.cropperInstance) {
      this.cropperInstance.destroy();
      this.cropperInstance = null;
    }
    this.cropModalEl.classList.remove('show');
  }

  applyCrop() {
    if (!this.cropperInstance) return;

    const croppedCanvas = this.cropperInstance.getCroppedCanvas();
    if (!croppedCanvas) return;

    const croppedDataUrl = croppedCanvas.toDataURL('image/png');
    const activeObj = this.canvasManager.canvas.getActiveObject();

    if (activeObj && activeObj.type === 'image') {
      // Update selected image source
      activeObj.setSrc(croppedDataUrl, () => {
        this.canvasManager.canvas.renderAll();
        this.canvasManager.saveState();
      });
    } else {
      // Replace active page background with cropped version
      this.canvasManager.updatePageBackground(croppedDataUrl, croppedCanvas.width, croppedCanvas.height);
    }

    this.closeCropModal();
    this.canvasManager.showToast('Crop applied successfully!', 'success');
  }

  bindFilterEvents() {
    // Sliders
    const brightSlider = document.getElementById('filter-brightness');
    const contrastSlider = document.getElementById('filter-contrast');
    const satSlider = document.getElementById('filter-saturation');
    const blurSlider = document.getElementById('filter-blur');

    const updateFilterValues = () => {
      if (brightSlider) document.getElementById('val-filter-bright').textContent = brightSlider.value;
      if (contrastSlider) document.getElementById('val-filter-contrast').textContent = contrastSlider.value;
      if (satSlider) document.getElementById('val-filter-sat').textContent = satSlider.value;
      if (blurSlider) document.getElementById('val-filter-blur').textContent = blurSlider.value;
    };

    [brightSlider, contrastSlider, satSlider, blurSlider].forEach(slider => {
      if (slider) {
        slider.addEventListener('input', () => {
          updateFilterValues();
          this.applyFilters();
        });
      }
    });

    // Preset Buttons
    const btnGray = document.getElementById('btn-filter-grayscale');
    if (btnGray) {
      btnGray.addEventListener('click', () => {
        satSlider.value = -100;
        updateFilterValues();
        this.applyFilters();
      });
    }

    const btnSepia = document.getElementById('btn-filter-sepia');
    if (btnSepia) {
      btnSepia.addEventListener('click', () => {
        satSlider.value = 30;
        brightSlider.value = 10;
        contrastSlider.value = 15;
        updateFilterValues();
        this.applyFilters();
      });
    }

    const btnInvert = document.getElementById('btn-filter-invert');
    if (btnInvert) {
      btnInvert.addEventListener('click', () => {
        this.toggleInvert();
      });
    }

    const btnReset = document.getElementById('btn-filter-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (brightSlider) brightSlider.value = 0;
        if (contrastSlider) contrastSlider.value = 0;
        if (satSlider) satSlider.value = 0;
        if (blurSlider) blurSlider.value = 0;
        updateFilterValues();
        this.applyFilters();
      });
    }

    // Flip Buttons
    const btnFlipH = document.getElementById('btn-flip-h');
    if (btnFlipH) {
      btnFlipH.addEventListener('click', () => {
        const obj = this.canvasManager.canvas.getActiveObject();
        if (obj) {
          obj.set('flipX', !obj.flipX);
          this.canvasManager.canvas.renderAll();
          this.canvasManager.saveState();
        }
      });
    }

    const btnFlipV = document.getElementById('btn-flip-v');
    if (btnFlipV) {
      btnFlipV.addEventListener('click', () => {
        const obj = this.canvasManager.canvas.getActiveObject();
        if (obj) {
          obj.set('flipY', !obj.flipY);
          this.canvasManager.canvas.renderAll();
          this.canvasManager.saveState();
        }
      });
    }
  }

  applyFilters() {
    const activeObj = this.canvasManager.canvas.getActiveObject();
    const target = (activeObj && activeObj.type === 'image') ? activeObj : this.canvasManager.canvas.backgroundImage;
    if (!target) return;

    const bVal = parseFloat(document.getElementById('filter-brightness').value) / 100;
    const cVal = parseFloat(document.getElementById('filter-contrast').value) / 100;
    const sVal = parseFloat(document.getElementById('filter-saturation').value) / 100;
    const blurVal = parseFloat(document.getElementById('filter-blur').value) / 20;

    target.filters = [];

    if (bVal !== 0) {
      target.filters.push(new fabric.Image.filters.Brightness({ brightness: bVal }));
    }
    if (cVal !== 0) {
      target.filters.push(new fabric.Image.filters.Contrast({ contrast: cVal }));
    }
    if (sVal !== 0) {
      target.filters.push(new fabric.Image.filters.Saturation({ saturation: sVal }));
    }
    if (blurVal > 0) {
      target.filters.push(new fabric.Image.filters.Blur({ blur: blurVal }));
    }

    target.applyFilters();
    this.canvasManager.canvas.renderAll();
  }

  toggleInvert() {
    const activeObj = this.canvasManager.canvas.getActiveObject();
    const target = (activeObj && activeObj.type === 'image') ? activeObj : this.canvasManager.canvas.backgroundImage;
    if (!target) return;

    if (!target.filters) target.filters = [];
    const invertIdx = target.filters.findIndex(f => f instanceof fabric.Image.filters.Invert);

    if (invertIdx >= 0) {
      target.filters.splice(invertIdx, 1);
    } else {
      target.filters.push(new fabric.Image.filters.Invert());
    }

    target.applyFilters();
    this.canvasManager.canvas.renderAll();
  }
}
