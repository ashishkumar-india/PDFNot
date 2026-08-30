/**
 * Smart Align Guides for Fabric.js
 * Creates Canva-style pink snapping lines when dragging objects near each other or page center.
 */
class SmartAlignGuides {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getSelectionContext();
    this.aligningLineOffset = 7; // Snap sensitivity
    this.aligningLineWidth = 1.5;
    this.aligningLineColor = 'rgb(255, 0, 127)'; // Canva Pink
    
    this.verticalLines = [];
    this.horizontalLines = [];
    
    this.bindEvents();
  }
  
  bindEvents() {
    this.canvas.on('mouse:down', () => {
      this.verticalLines = [];
      this.horizontalLines = [];
    });
    
    this.canvas.on('object:moving', (e) => {
      this.verticalLines = [];
      this.horizontalLines = [];
      this.observeObject(e.target);
    });
    
    this.canvas.on('before:render', () => {
      if (this.canvas.contextTop) {
        this.canvas.clearContext(this.canvas.contextTop);
      }
    });
    
    this.canvas.on('after:render', () => {
      this.drawGuides();
    });
    
    this.canvas.on('mouse:up', () => {
      this.verticalLines = [];
      this.horizontalLines = [];
      this.canvas.renderAll();
    });
  }

  drawGuides() {
    if (this.verticalLines.length === 0 && this.horizontalLines.length === 0) return;
    
    const ctx = this.canvas.contextTop;
    if (!ctx) return;

    ctx.save();
    ctx.transform(...this.canvas.viewportTransform);
    ctx.lineWidth = this.aligningLineWidth / this.canvas.getZoom();
    ctx.strokeStyle = this.aligningLineColor;
    // Add a slight dashed effect for professional look
    ctx.setLineDash([4 / this.canvas.getZoom(), 4 / this.canvas.getZoom()]);
    
    this.verticalLines.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line.x, line.y1);
      ctx.lineTo(line.x, line.y2);
      ctx.stroke();
    });
    
    this.horizontalLines.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y);
      ctx.lineTo(line.x2, line.y);
      ctx.stroke();
    });
    
    ctx.restore();
  }

  observeObject(activeObject) {
    // If the object is rotating or scaling, don't snap
    if (activeObject.isRotating || activeObject.isScaling) return;

    const canvasWidth = this.canvas.getWidth() / this.canvas.getZoom();
    const canvasHeight = this.canvas.getHeight() / this.canvas.getZoom();
    
    const activeObjBounds = activeObject.getBoundingRect(true);
    const activeObjCenter = activeObject.getCenterPoint();
    
    const activeLeft = activeObjBounds.left;
    const activeRight = activeObjBounds.left + activeObjBounds.width;
    const activeTop = activeObjBounds.top;
    const activeBottom = activeObjBounds.top + activeObjBounds.height;
    const activeCenterX = activeObjCenter.x;
    const activeCenterY = activeObjCenter.y;

    let snappedX = false;
    let snappedY = false;

    // 1. Check against Canvas Center first (Priority)
    if (this.isInRange(activeCenterX, canvasWidth / 2)) {
      snappedX = true;
      activeObject.setPositionByOrigin(new fabric.Point(canvasWidth / 2, activeObjCenter.y), 'center', 'center');
      this.verticalLines.push({ x: canvasWidth / 2, y1: 0, y2: canvasHeight });
    }
    if (this.isInRange(activeCenterY, canvasHeight / 2)) {
      snappedY = true;
      activeObject.setPositionByOrigin(new fabric.Point(activeObject.getCenterPoint().x, canvasHeight / 2), 'center', 'center');
      this.horizontalLines.push({ y: canvasHeight / 2, x1: 0, x2: canvasWidth });
    }

    // 2. Check against Canvas Edges
    if (!snappedX) {
      if (this.isInRange(activeLeft, 0)) {
        snappedX = true;
        activeObject.set({ left: 0 });
        this.verticalLines.push({ x: 0, y1: 0, y2: canvasHeight });
      } else if (this.isInRange(activeRight, canvasWidth)) {
        snappedX = true;
        activeObject.set({ left: canvasWidth - activeObjBounds.width });
        this.verticalLines.push({ x: canvasWidth, y1: 0, y2: canvasHeight });
      }
    }
    if (!snappedY) {
      if (this.isInRange(activeTop, 0)) {
        snappedY = true;
        activeObject.set({ top: 0 });
        this.horizontalLines.push({ y: 0, x1: 0, x2: canvasWidth });
      } else if (this.isInRange(activeBottom, canvasHeight)) {
        snappedY = true;
        activeObject.set({ top: canvasHeight - activeObjBounds.height });
        this.horizontalLines.push({ y: canvasHeight, x1: 0, x2: canvasWidth });
      }
    }

    // 3. Check against other objects on the canvas
    const objects = this.canvas.getObjects().filter(o => o !== activeObject && o.visible && o.evented && o.type !== 'path');
    
    for (let obj of objects) {
      const bounds = obj.getBoundingRect(true);
      const center = obj.getCenterPoint();
      
      const objLeft = bounds.left;
      const objRight = bounds.left + bounds.width;
      const objTop = bounds.top;
      const objBottom = bounds.top + bounds.height;
      const objCenterX = center.x;
      const objCenterY = center.y;
      
      // Vertical alignments (X-axis snapping)
      if (!snappedX) {
        if (this.isInRange(activeLeft, objLeft)) {
          snappedX = true;
          activeObject.set({ left: objLeft });
          this.verticalLines.push({ x: objLeft, y1: Math.min(activeTop, objTop), y2: Math.max(activeBottom, objBottom) });
        } else if (this.isInRange(activeRight, objRight)) {
          snappedX = true;
          activeObject.set({ left: objRight - activeObjBounds.width });
          this.verticalLines.push({ x: objRight, y1: Math.min(activeTop, objTop), y2: Math.max(activeBottom, objBottom) });
        } else if (this.isInRange(activeCenterX, objCenterX)) {
          snappedX = true;
          activeObject.setPositionByOrigin(new fabric.Point(objCenterX, activeObject.getCenterPoint().y), 'center', 'center');
          this.verticalLines.push({ x: objCenterX, y1: Math.min(activeTop, objTop), y2: Math.max(activeBottom, objBottom) });
        }
      }
      
      // Horizontal alignments (Y-axis snapping)
      if (!snappedY) {
        if (this.isInRange(activeTop, objTop)) {
          snappedY = true;
          activeObject.set({ top: objTop });
          this.horizontalLines.push({ y: objTop, x1: Math.min(activeLeft, objLeft), x2: Math.max(activeRight, objRight) });
        } else if (this.isInRange(activeBottom, objBottom)) {
          snappedY = true;
          activeObject.set({ top: objBottom - activeObjBounds.height });
          this.horizontalLines.push({ y: objBottom, x1: Math.min(activeLeft, objLeft), x2: Math.max(activeRight, objRight) });
        } else if (this.isInRange(activeCenterY, objCenterY)) {
          snappedY = true;
          activeObject.setPositionByOrigin(new fabric.Point(activeObject.getCenterPoint().x, objCenterY), 'center', 'center');
          this.horizontalLines.push({ y: objCenterY, x1: Math.min(activeLeft, objLeft), x2: Math.max(activeRight, objRight) });
        }
      }
    }
  }

  isInRange(v1, v2) {
    return Math.abs(v1 - v2) <= (this.aligningLineOffset / this.canvas.getZoom());
  }
}
