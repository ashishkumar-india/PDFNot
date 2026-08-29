/**
 * DocuCraft PRO - Interactive Canvas Manager (Fabric.js)
 * Manages live editable canvas, tools, inline text editing, shapes, brushes, annotations, zoom & undo/redo.
 */

class CanvasManager {
  constructor(canvasId) {
    this.canvasId = canvasId;
    this.canvas = null;
    this.activeTool = 'select'; // 'select' | 'hand' | 'text' | 'draw' | 'highlighter' | 'eraser' | 'shapes' | 'redact-white' | 'redact-black'
    this.activeShapeType = 'rect';
    
    // Zoom & Pan state
    this.zoomLevel = 1.0;
    this.minZoom = 0.2;
    this.maxZoom = 4.0;
    this.isPanning = false;
    this.lastPosX = 0;
    this.lastPosY = 0;
    this.spacePressed = false;

    // History state (Undo / Redo)
    this.historyStack = [];
    this.historyIndex = -1;
    this.isHistoryProcessing = false;
    this.maxHistory = 35;
    this._historyDebounceTimer = null; // Debounce timer for rapid event flooding

    // Reference to parent app / pdf engine
    this.pdfEngine = null;
    this.uiManager = null;

    this.initCanvas();
  }

  initCanvas() {
    this.canvas = new fabric.Canvas(this.canvasId, {
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
      enableRetinaScaling: true
    });

    // Disable offscreen raster objectCaching globally for razor-sharp vector text rendering
    fabric.Object.prototype.objectCaching = false;
    fabric.Object.prototype.noScaleCache = true;

    // Modern styled control handles for selected objects
    fabric.Object.prototype.set({
      transparentCorners: false,
      cornerColor: '#3b82f6',
      cornerStrokeColor: '#ffffff',
      borderColor: '#3b82f6',
      cornerSize: 10,
      cornerStyle: 'circle',
      borderScaleFactor: 1.5,
      padding: 4
    });

    // Prevent browser jumping/scrolling offscreen when Fabric focuses hidden textarea
    fabric.IText.prototype.initHiddenTextarea = (function(orig) {
      return function() {
        orig.call(this);
        if (this.hiddenTextarea) {
          this.hiddenTextarea.style.position = 'fixed';
          this.hiddenTextarea.style.top = '0';
          this.hiddenTextarea.style.left = '0';
          this.hiddenTextarea.style.opacity = '0';
          this.hiddenTextarea.style.pointerEvents = 'none';
        }
      };
    })(fabric.IText.prototype.initHiddenTextarea);

    this.bindCanvasEvents();
  }

  bindCanvasEvents() {
    // Canvas Mouse Events
    this.canvas.on('mouse:down', (opt) => this.handleMouseDown(opt));
    this.canvas.on('mouse:move', (opt) => this.handleMouseMove(opt));
    this.canvas.on('mouse:up', (opt) => this.handleMouseUp(opt));
    this.canvas.on('mouse:wheel', (opt) => this.handleMouseWheel(opt));

    // Selection Events for Inspector & Context Bar
    this.canvas.on('selection:created', (e) => this.handleSelection(e));
    this.canvas.on('selection:updated', (e) => this.handleSelection(e));
    this.canvas.on('selection:cleared', () => this.handleSelectionCleared());

    // Object Modification for Undo/Redo
    this.canvas.on('object:added', () => this.recordHistory());
    this.canvas.on('object:modified', () => this.recordHistory());
    this.canvas.on('object:removed', () => this.recordHistory());

    // Key events for spacebar pan & delete
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.spacePressed && !this.isEditingText()) {
        this.spacePressed = true;
        document.getElementById('canvas-workspace').classList.add('hand-mode');
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spacePressed = false;
        if (this.activeTool !== 'hand') {
          document.getElementById('canvas-workspace').classList.remove('hand-mode');
        }
      }
    });
  }

  isEditingText() {
    const activeObj = this.canvas.getActiveObject();
    return activeObj && activeObj.isEditing;
  }

  /**
   * Sets active tool mode and adjusts canvas behavior
   * @param {string} toolName 
   * @param {object} options 
   */
  setTool(toolName, options = {}) {
    this.activeTool = toolName;
    const workspace = document.getElementById('canvas-workspace');

    // Reset default modes
    this.canvas.isDrawingMode = false;
    this.canvas.selection = true;
    workspace.classList.remove('hand-mode');
    this.canvas.defaultCursor = 'default';

    switch (toolName) {
      case 'select':
        this.canvas.selection = true;
        this.canvas.defaultCursor = 'default';
        break;

      case 'hand':
        this.canvas.selection = false;
        this.canvas.discardActiveObject();
        this.canvas.renderAll();
        workspace.classList.add('hand-mode');
        break;

      case 'text':
        this.canvas.defaultCursor = 'text';
        break;

      case 'draw':
        this.canvas.isDrawingMode = true;
        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
        this.canvas.freeDrawingBrush.color = options.color || '#ef4444';
        this.canvas.freeDrawingBrush.width = parseInt(options.width) || 4;
        break;

      case 'highlighter': {
        this.canvas.isDrawingMode = true;
        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
        // Semi-transparent yellow or custom color
        const baseColor = options.color || '#facc15';
        this.canvas.freeDrawingBrush.color = this.hexToRgba(baseColor, 0.45);
        this.canvas.freeDrawingBrush.width = parseInt(options.width) || 20;
        break;
      }

      case 'eraser':
        this.canvas.defaultCursor = 'crosshair';
        break;

      case 'shapes':
        this.canvas.defaultCursor = 'crosshair';
        if (options.shapeType) this.activeShapeType = options.shapeType;
        break;

      case 'redact-white':
      case 'redact-black':
        this.canvas.defaultCursor = 'crosshair';
        break;
    }
  }

  handleMouseDown(opt) {
    const evt = opt.e;

    // Pan viewport mode
    if (this.activeTool === 'hand' || this.spacePressed) {
      this.isPanning = true;
      this.lastPosX = evt.clientX;
      this.lastPosY = evt.clientY;
      return;
    }

    // Eraser Tool - click object to delete
    if (this.activeTool === 'eraser') {
      if (opt.target) {
        this.canvas.remove(opt.target);
        this.canvas.renderAll();
        this.saveState();
      }
      return;
    }

    // In select mode on existing text objects, Fabric natively handles drag-to-move and double-click to edit
    if (opt.target && opt.target.type === 'i-text' && this.activeTool === 'select') {
      return;
    }

    // Pointer coordinates on canvas
    const pointer = this.canvas.getPointer(evt);

    // Text Tool - Live Editable IText
    if (this.activeTool === 'text') {
      if (!opt.target) {
        this.addTextAtPosition(pointer.x, pointer.y, 'Text');
      } else if (opt.target.type === 'i-text') {
        this.canvas.setActiveObject(opt.target);
        opt.target.enterEditing();
      }
      return;
    }

    // Shapes Tool - Spawn Shape
    if (this.activeTool === 'shapes') {
      if (!opt.target) {
        this.addShapeAtPosition(this.activeShapeType, pointer.x, pointer.y);
      }
      return;
    }

    // Redaction Masks
    if (this.activeTool === 'redact-white') {
      this.addRedactionBox(pointer.x, pointer.y, '#ffffff');
      return;
    }
    if (this.activeTool === 'redact-black') {
      this.addRedactionBox(pointer.x, pointer.y, '#000000');
      return;
    }
  }

  handleMouseMove(opt) {
    if (this.isPanning) {
      const e = opt.e;
      const workspace = document.getElementById('canvas-workspace');
      workspace.scrollLeft -= (e.clientX - this.lastPosX);
      workspace.scrollTop -= (e.clientY - this.lastPosY);
      this.lastPosX = e.clientX;
      this.lastPosY = e.clientY;
    }
  }

  handleMouseUp() {
    this.isPanning = false;
  }

  handleMouseWheel(opt) {
    if (opt.e.ctrlKey || opt.e.metaKey) {
      opt.e.preventDefault();
      opt.e.stopPropagation();

      const delta = opt.e.deltaY;
      let zoom = this.canvas.getZoom();
      zoom *= 0.999 ** delta;
      if (zoom > this.maxZoom) zoom = this.maxZoom;
      if (zoom < this.minZoom) zoom = this.minZoom;

      this.setZoom(zoom);
    }
  }

  setZoom(zoom) {
    this.zoomLevel = zoom;
    const viewport = document.getElementById('canvas-viewport');
    if (viewport) {
      const pageW = this.canvas.getWidth();
      const pageH = this.canvas.getHeight();
      
      if (pageW > 0 && pageH > 0) {
        // Set exact scaled dimensions so the flex container centers it perfectly without huge invisible overflow margins
        viewport.style.position = 'relative';
        viewport.style.width = `${Math.round(pageW * zoom)}px`;
        viewport.style.height = `${Math.round(pageH * zoom)}px`;
        viewport.style.transform = 'none';
        
        const shadowBox = viewport.querySelector('.canvas-shadow-box');
        if (shadowBox) {
          // Lock to top-left to prevent flexbox from shifting the unscaled container offscreen!
          shadowBox.style.position = 'absolute';
          shadowBox.style.left = '0';
          shadowBox.style.top = '0';
          shadowBox.style.width = `${pageW}px`;
          shadowBox.style.height = `${pageH}px`;
          shadowBox.style.transform = `scale(${zoom})`;
          shadowBox.style.transformOrigin = 'top left';
        }
      } else {
        viewport.style.transform = `scale(${zoom})`;
        viewport.style.transformOrigin = 'top center';
      }
    }
    const zoomText = document.getElementById('zoom-level-text');
    if (zoomText) {
      zoomText.textContent = `${Math.round(zoom * 100)}%`;
    }
  }

  zoomIn() {
    this.setZoom(Math.min(this.zoomLevel + 0.15, this.maxZoom));
  }

  zoomOut() {
    this.setZoom(Math.max(this.zoomLevel - 0.15, this.minZoom));
  }

  zoomFit() {
    const workspace = document.getElementById('canvas-workspace');
    const pageW = this.canvas.getWidth();
    const pageH = this.canvas.getHeight();

    if (workspace && pageW > 0 && pageH > 0) {
      const availW = workspace.clientWidth - 60;
      const availH = workspace.clientHeight - 60;
      const scaleW = availW / pageW;
      const scaleH = availH / pageH;
      const fitZoom = Math.min(scaleW, scaleH, 1.0);
      this.setZoom(Math.max(parseFloat(fitZoom.toFixed(2)), 0.35));
    }
  }

  /**
   * Adds live editable IText at coordinates with auto-sampled high contrast font color
   */
  addTextAtPosition(x, y, initialText = 'Your Text Here') {
    const fontFam = document.getElementById('text-font-family')?.value || 'Inter';
    const fontSize = parseInt(document.getElementById('text-font-size')?.value) || 24;
    let fontColor = document.getElementById('text-color-picker')?.value || '#0f172a';

    // Sample background luminance at (x, y) to guarantee high contrast visibility!
    try {
      const lowerCanvas = document.querySelector('.lower-canvas');
      if (lowerCanvas) {
        const ctx = lowerCanvas.getContext('2d');
        const p = ctx.getImageData(Math.max(x - 5, 0), Math.max(y - 5, 0), 1, 1).data;
        if (p[3] > 0) {
          const bgLum = (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]);
          // If background is dark and fontColor is dark, auto-contrast to white/gold!
          if (bgLum < 120 && (fontColor === '#0f172a' || fontColor === '#000000')) {
            fontColor = '#ffffff';
            const colorPicker = document.getElementById('text-color-picker');
            if (colorPicker) colorPicker.value = '#ffffff';
          }
        }
      }
    } catch (e) {}

    const textObj = new fabric.IText(initialText, {
      left: x,
      top: y,
      fontFamily: fontFam,
      fontSize: fontSize,
      fill: fontColor,
      textBackgroundColor: 'transparent',
      cursorColor: '#3b82f6',
      editingBorderColor: '#3b82f6',
      lineHeight: 1.15,
      editable: true,
      padding: 4,
      hasControls: true,
      hasBorders: true,
      lockMovementX: false,
      lockMovementY: false,
      cornerColor: '#3b82f6',
      cornerStrokeColor: '#ffffff',
      borderColor: '#3b82f6',
      cornerSize: 8,
      transparentCorners: false
    });

    this.canvas.add(textObj);
    this.canvas.setActiveObject(textObj);
    textObj.enterEditing();
    textObj.selectAll();
    this.canvas.renderAll();
    this.saveState();
    this.showToast('Text box added! Type your text now.', 'info');

    if (this.uiManager) this.uiManager.activateTool('select');
  }

  /**
   * Adds Shapes (Rect, Circle, Arrow, Line, Star, Speech Bubble)
   */
  addShapeAtPosition(shapeType, x, y) {
    const strokeColor = document.getElementById('brush-color-picker')?.value || '#3b82f6';
    const strokeWidth = parseInt(document.getElementById('brush-width-slider')?.value) || 3;
    const fillColor = document.getElementById('shape-fill-picker')?.value || '#3b82f6';
    const cornerRadius = parseInt(document.getElementById('shape-corner-radius')?.value) || 0;
    const isFillTrans = document.getElementById('btn-shape-fill-transparent')?.classList.contains('active') || false;

    const fill = isFillTrans ? 'transparent' : this.hexToRgba(fillColor, 0.2);

    let shapeObj = null;

    switch (shapeType) {
      case 'rect':
        shapeObj = new fabric.Rect({
          left: x,
          top: y,
          width: 140,
          height: 90,
          fill: fill,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          rx: cornerRadius,
          ry: cornerRadius
        });
        break;

      case 'circle':
        shapeObj = new fabric.Circle({
          left: x,
          top: y,
          radius: 50,
          fill: fill,
          stroke: strokeColor,
          strokeWidth: strokeWidth
        });
        break;

      case 'line':
        shapeObj = new fabric.Line([x, y, x + 160, y], {
          stroke: strokeColor,
          strokeWidth: strokeWidth
        });
        break;

      case 'arrow': {
        // Custom Arrow Group (Line + Arrowhead)
        const arrowLine = new fabric.Line([0, 0, 140, 0], {
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          originX: 'center',
          originY: 'center'
        });
        const triangle = new fabric.Triangle({
          left: 70,
          top: 0,
          angle: 90,
          width: 14 + strokeWidth * 2,
          height: 14 + strokeWidth * 2,
          fill: strokeColor,
          originX: 'center',
          originY: 'center'
        });
        shapeObj = new fabric.Group([arrowLine, triangle], {
          left: x,
          top: y
        });
        break;
      }

      case 'star': {
        const starPoints = this.calculateStarPoints(5, 50, 25);
        shapeObj = new fabric.Polygon(starPoints, {
          left: x,
          top: y,
          fill: fill,
          stroke: strokeColor,
          strokeWidth: strokeWidth
        });
        break;
      }

      case 'bubble':
        const pathData = 'M 20 0 L 140 0 C 150 0 160 10 160 20 L 160 80 C 160 90 150 100 140 100 L 60 100 L 30 125 L 35 100 L 20 100 C 10 100 0 90 0 80 L 0 20 C 0 10 10 0 20 0 Z';
        shapeObj = new fabric.Path(pathData, {
          left: x,
          top: y,
          fill: fill,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          scaleX: 1,
          scaleY: 1
        });
        break;
    }

    if (shapeObj) {
      this.canvas.add(shapeObj);
      this.canvas.setActiveObject(shapeObj);
      this.canvas.renderAll();
    }

    if (this.uiManager) this.uiManager.activateTool('select');
  }

  calculateStarPoints(spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = outerRadius;
    let y = outerRadius;
    let step = Math.PI / spikes;
    let points = [];

    for (let i = 0; i < spikes; i++) {
      points.push({ x: x + Math.cos(rot) * outerRadius, y: y + Math.sin(rot) * outerRadius });
      rot += step;
      points.push({ x: x + Math.cos(rot) * innerRadius, y: y + Math.sin(rot) * innerRadius });
      rot += step;
    }
    return points;
  }

  /**
   * Adds Redaction / Erase Box (Auto-matches local image background)
   */
  addRedactionBox(x, y, color) {
    let finalColor = color;
    if (color === '#ffffff') {
      try {
        const lowerCanvas = document.querySelector('.lower-canvas');
        if (lowerCanvas) {
          const ctx = lowerCanvas.getContext('2d');
          const p = ctx.getImageData(Math.max(x - 5, 0), Math.max(y - 5, 0), 1, 1).data;
          if (p[3] > 0) {
            finalColor = `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
          }
        }
      } catch (e) {}
    }

    const rect = new fabric.Rect({
      left: x,
      top: y,
      width: 150,
      height: 35,
      fill: finalColor,
      stroke: 'transparent',
      strokeWidth: 0,
      selectable: true,
      hasControls: true,
      hasBorders: true,
      cornerColor: '#3b82f6',
      cornerStrokeColor: '#ffffff',
      borderColor: '#3b82f6',
      cornerSize: 8,
      transparentCorners: false
    });

    this.canvas.add(rect);
    this.canvas.setActiveObject(rect);
    this.canvas.renderAll();
    this.saveState();
    this.showToast('Erase box placed! Resize it over old text, then use Text tool.', 'info');

    if (this.uiManager) this.uiManager.activateTool('select');
  }

  /**
   * Inserts Digital Signature PNG
   */
  insertSignature(dataUrl) {
    fabric.Image.fromURL(dataUrl, (img) => {
      // Scale down nicely to fit page
      const maxW = 220;
      if (img.width > maxW) {
        img.scale(maxW / img.width);
      }
      img.set({
        left: this.canvas.getWidth() / 2 - (img.getScaledWidth() / 2),
        top: this.canvas.getHeight() / 2 - (img.getScaledHeight() / 2),
        cornerSize: 10
      });
      this.canvas.add(img);
      this.canvas.setActiveObject(img);
      this.canvas.renderAll();
      this.showToast('Signature added to page!', 'success');
    });
  }

  /**
   * Inserts Stamp (APPROVED, CONFIDENTIAL, etc.)
   */
  insertStamp(stampText, color = '#16a34a') {
    const text = new fabric.Text(stampText, {
      fontSize: 26,
      fontFamily: 'Outfit',
      fontWeight: '800',
      fill: color,
      originX: 'center',
      originY: 'center'
    });

    const rect = new fabric.Rect({
      width: text.width + 36,
      height: text.height + 20,
      fill: 'rgba(255, 255, 255, 0.05)',
      stroke: color,
      strokeWidth: 3,
      strokeDashArray: [8, 4],
      rx: 6,
      ry: 6,
      originX: 'center',
      originY: 'center'
    });

    const stampGroup = new fabric.Group([rect, text], {
      left: this.canvas.getWidth() / 2 - 100,
      top: this.canvas.getHeight() / 2 - 40,
      angle: -6
    });

    this.canvas.add(stampGroup);
    this.canvas.setActiveObject(stampGroup);
    this.canvas.renderAll();
    this.showToast(`Stamp '${stampText}' applied!`, 'success');
  }

  /**
   * Inserts an Image overlay (Logo, Photo, Watermark)
   */
  insertImageOverlay(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      fabric.Image.fromURL(e.target.result, (img) => {
        const maxW = 300;
        if (img.width > maxW) {
          img.scale(maxW / img.width);
        }
        img.set({
          left: this.canvas.getWidth() / 2 - (img.getScaledWidth() / 2),
          top: this.canvas.getHeight() / 2 - (img.getScaledHeight() / 2)
        });
        this.canvas.add(img);
        this.canvas.setActiveObject(img);
        this.canvas.renderAll();
        this.showToast('Image inserted!', 'success');
      });
    };
    reader.readAsDataURL(file);
  }

  /**
   * Loads a new page background onto Fabric canvas
   */
  async setPageBackground(bgDataUrl, width, height) {
    return new Promise((resolve) => {
      const finalW = Math.round(width) || 794;
      const finalH = Math.round(height) || 1123;

      this.canvas.setWidth(finalW);
      this.canvas.setHeight(finalH);
      this.canvas.calcOffset();

      // Clear existing page objects (saved annotations will be reloaded next)
      const existingObjs = this.canvas.getObjects().slice();
      existingObjs.forEach(obj => this.canvas.remove(obj));

      if (!bgDataUrl) {
        this.canvas.setBackgroundColor('#ffffff', () => {
          this.canvas.renderAll();
          resolve(true);
        });
        return;
      }

      const imgEl = new Image();
      imgEl.onload = () => {
        const fabricImg = new fabric.Image(imgEl, {
          originX: 'left',
          originY: 'top',
          left: 0,
          top: 0,
          scaleX: finalW / (imgEl.naturalWidth || imgEl.width || finalW),
          scaleY: finalH / (imgEl.naturalHeight || imgEl.height || finalH),
          selectable: false,
          evented: false
        });

        this.canvas.setBackgroundImage(fabricImg, () => {
          this.canvas.renderAll();
          resolve(true);
        });
      };

      imgEl.onerror = (err) => {
        console.error("Error loading background image element:", err);
        resolve(false);
      };

      imgEl.src = bgDataUrl;
    });
  }

  /**
   * Updates page background after a crop
   */
  updatePageBackground(croppedDataUrl, newW, newH) {
    this.setPageBackground(croppedDataUrl, newW, newH);
  }

  /**
   * Serializes current canvas objects (excluding background image)
   */
  savePageAnnotations() {
    return this.canvas.toDatalessJSON();
  }

  /**
   * Deserializes annotations onto current canvas while preserving clean page background
   */
  async loadPageAnnotations(jsonObj) {
    if (!jsonObj) {
      const existingObjs = this.canvas.getObjects().slice();
      existingObjs.forEach(o => this.canvas.remove(o));
      this.canvas.renderAll();
      return;
    }

    const currentBg = this.canvas.backgroundImage;
    return new Promise((resolve) => {
      this.canvas.loadFromJSON(jsonObj, () => {
        if (currentBg) {
          // Use setBackgroundImage to properly re-register bg through Fabric's render queue
          this.canvas.setBackgroundImage(currentBg, () => {
            this.canvas.renderAll();
            resolve(true);
          });
        } else {
          this.canvas.renderAll();
          resolve(true);
        }
      });
    });
  }

  /**
   * Automatically removes background from the selected image on canvas
   * @param {number} tolerance 
   */
  async removeSelectedImageBackground(tolerance = 30) {
    const activeObj = this.canvas.getActiveObject();
    if (!activeObj || activeObj.type !== 'image') {
      this.showToast("Please select an image first.", "error");
      return;
    }

    try {
      this.showToast("✨ Processing AI background removal...", "info");
      const src = activeObj.getSrc ? activeObj.getSrc() : activeObj._element.src;
      const transparentDataUrl = await BackgroundRemover.removeBackground(src, {
        mode: 'auto',
        tolerance: tolerance,
        feather: 2,
        floodFill: true
      });

      activeObj.setSrc(transparentDataUrl, () => {
        this.canvas.renderAll();
        this.saveState();
        this.showToast("Background removed successfully!", "success");
      });
    } catch (err) {
      console.error("Error removing image background:", err);
      this.showToast("Failed to remove background: " + err.message, "error");
    }
  }

  /**
   * Returns high-res composite data URL (Background + Annotations or Transparent)
   */
  getCompositeDataURL(format = 'png', quality = 1.0, isTransparent = false) {
    const originalBg = this.canvas.backgroundImage;
    if (isTransparent && format === 'png') {
      this.canvas.backgroundImage = null;
    }

    const dataUrl = this.canvas.toDataURL({
      format: format === 'jpg' ? 'jpeg' : format,
      quality: quality,
      multiplier: 2.0 // Crisp 2x HD export
    });

    if (isTransparent && format === 'png') {
      this.canvas.backgroundImage = originalBg;
      this.canvas.renderAll();
    }

    return dataUrl;
  }

  // ==================== SELECTION & INSPECTOR ====================

  handleSelection(e) {
    const obj = e.selected ? e.selected[0] : this.canvas.getActiveObject();
    if (!obj) return;

    this.positionFloatingContextBar(obj);
    this.syncInspectorWithOptions(obj);
  }

  handleSelectionCleared() {
    const ctxBar = document.getElementById('floating-context-bar');
    if (ctxBar) ctxBar.classList.remove('show');
    const imgBgSec = document.getElementById('sec-image-bg-props');
    if (imgBgSec) imgBgSec.style.display = 'none';
  }

  positionFloatingContextBar(obj) {
    const ctxBar = document.getElementById('floating-context-bar');
    if (!ctxBar) return;

    const bound = obj.getBoundingRect();
    const canvasWrap = document.getElementById('canvas-wrapper');
    const wrapRect = canvasWrap.getBoundingClientRect();
    const workspaceRect = document.getElementById('canvas-workspace').getBoundingClientRect();

    const left = (wrapRect.left - workspaceRect.left) + (bound.left + bound.width / 2);
    const top = (wrapRect.top - workspaceRect.top) + bound.top;

    ctxBar.style.left = `${left}px`;
    ctxBar.style.top = `${top}px`;
    ctxBar.classList.add('show');
  }

  syncInspectorWithOptions(obj) {
    if (!obj) return;

    // Image AI BG & Filters section
    const imgBgSec = document.getElementById('sec-image-bg-props');
    if (imgBgSec) {
      imgBgSec.style.display = (obj.type === 'image') ? 'flex' : 'none';
    }

    // Sync Text Props
    if (obj.type === 'i-text' || obj.type === 'text') {
      const fontFamilyEl = document.getElementById('text-font-family');
      const fontSizeEl = document.getElementById('text-font-size');
      const textColorPicker = document.getElementById('text-color-picker');
      const textColorHex = document.getElementById('text-color-hex');
      const btnBold = document.getElementById('btn-text-bold');
      const btnItalic = document.getElementById('btn-text-italic');
      const btnUnderline = document.getElementById('btn-text-underline');
      const btnStrike = document.getElementById('btn-text-strike');

      if (fontFamilyEl && obj.fontFamily) fontFamilyEl.value = obj.fontFamily;
      if (fontSizeEl && obj.fontSize) fontSizeEl.value = obj.fontSize;
      if (obj.fill && typeof obj.fill === 'string') {
        const hexColor = this.rgbOrHexToHex(obj.fill);
        if (textColorPicker) textColorPicker.value = hexColor;
        if (textColorHex) textColorHex.textContent = hexColor.toUpperCase();
      }
      if (btnBold) btnBold.classList.toggle('active', obj.fontWeight === 'bold');
      if (btnItalic) btnItalic.classList.toggle('active', obj.fontStyle === 'italic');
      if (btnUnderline) btnUnderline.classList.toggle('active', !!obj.underline);
      if (btnStrike) btnStrike.classList.toggle('active', !!obj.linethrough);
    }

    // Sync Shape Props
    if (obj.stroke) {
      if (typeof obj.stroke === 'string' && obj.stroke.startsWith('#')) {
        document.getElementById('brush-color-picker').value = obj.stroke;
      }
      if (obj.strokeWidth) document.getElementById('brush-width-slider').value = obj.strokeWidth;
    }

    // Sync Opacity
    if (obj.opacity !== undefined) {
      document.getElementById('object-opacity-slider').value = Math.round(obj.opacity * 100);
      document.getElementById('val-object-opacity').textContent = Math.round(obj.opacity * 100);
    }
  }

  // ==================== HISTORY (UNDO / REDO) ====================

  resetHistory() {
    this.isHistoryProcessing = true;
    this.historyStack = [JSON.stringify(this.canvas.toDatalessJSON())];
    this.historyIndex = 0;
    this.isHistoryProcessing = false;
    this.updateHistoryButtons();
  }

  recordHistory() {
    if (this.isHistoryProcessing) return;

    // Debounce: wait 300ms after last event before saving state.
    // Prevents tab freeze when many events fire rapidly (e.g. brush strokes, filter sliders).
    clearTimeout(this._historyDebounceTimer);
    this._historyDebounceTimer = setTimeout(() => {
      if (this.isHistoryProcessing) return;

      const json = JSON.stringify(this.canvas.toDatalessJSON());

      // Guard: skip saving if state is identical to current
      if (this.historyStack.length > 0 && this.historyStack[this.historyIndex] === json) {
        return;
      }

      // Guard: skip if JSON is unreasonably large (> 5MB) to prevent memory bloat
      if (json.length > 5 * 1024 * 1024) {
        console.warn('History: state too large to save (' + Math.round(json.length / 1024) + 'KB), skipping.');
        return;
      }

      // Truncate redo states
      this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
      this.historyStack.push(json);

      // Fix: Always increment index first, then trim overflow from front
      this.historyIndex++;
      if (this.historyStack.length > this.maxHistory) {
        this.historyStack.shift();
        this.historyIndex = this.historyStack.length - 1;
      }

      this.updateHistoryButtons();
    }, 300);
  }

  undo() {
    if (this.historyIndex > 0) {
      this.isHistoryProcessing = true;
      this.historyIndex--;
      const state = JSON.parse(this.historyStack[this.historyIndex]);
      
      const currentBg = this.canvas.backgroundImage;
      this.canvas.loadFromJSON(state, () => {
        if (currentBg) {
          this.canvas.backgroundImage = currentBg;
        }
        this.canvas.renderAll();
        this.isHistoryProcessing = false;
        this.updateHistoryButtons();
        this.showToast('Undo', 'info');
      });
    }
  }

  redo() {
    if (this.historyIndex < this.historyStack.length - 1) {
      this.isHistoryProcessing = true;
      this.historyIndex++;
      const state = JSON.parse(this.historyStack[this.historyIndex]);
      
      const currentBg = this.canvas.backgroundImage;
      this.canvas.loadFromJSON(state, () => {
        if (currentBg) {
          this.canvas.backgroundImage = currentBg;
        }
        this.canvas.renderAll();
        this.isHistoryProcessing = false;
        this.updateHistoryButtons();
        this.showToast('Redo', 'info');
      });
    }
  }

  updateHistoryButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    if (btnUndo) btnUndo.disabled = (this.historyIndex <= 0);
    if (btnRedo) btnRedo.disabled = (this.historyIndex >= this.historyStack.length - 1);
  }

  saveState() {
    this.recordHistory();
  }

  // ==================== HELPERS ====================

  rgbOrHexToHex(colorStr) {
    if (!colorStr) return '#0f172a';
    if (colorStr.startsWith('#')) return colorStr;
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    return '#0f172a';
  }

  hexToRgba(hex, alpha = 1) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
      c = hex.substring(1).split('');
      if (c.length === 3) {
        c = [c[0], c[0], c[1], c[1], c[2], c[2]];
      }
      c = '0x' + c.join('');
      return `rgba(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',')},${alpha})`;
    }
    return hex;
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-circle-check text-success';
    if (type === 'error') icon = 'fa-circle-exclamation text-danger';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}
