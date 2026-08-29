# 📄 AK Edit PRO — Live PDF & Image Editor Studio

A next-generation, high-performance browser-based **PDF & Image Editor Studio**. Built with **Vanilla JavaScript**, **Fabric.js v5**, **PDF.js**, and **PDF-Lib** for 100% realistic vector PDF editing, annotation, digital signatures, background removal, and multi-format exports.

---

## ✨ Features & Capabilities

### 🔤 1. Direct In-Place PDF Text Editing
- **Pixel-Perfect Vector Glyphs**: Direct inline PDF text replacement matching exact original font families (`Helvetica`, `Times`, `Courier`, `Inter`, `Outfit`).
- **Mode Histogram Background Erasing**: Eliminates background text cleanly without seams or white boxes on colored/dark backgrounds.
- **Subpixel 0.0px Baseline Lock**: Zero vertical jump or downward drop on text selection.
- **Drag-to-Move & Double-Click to Edit**: Freely drag and reposition text anywhere on the canvas or double-click to type.

### 🖋️ 2. Digital Signature Studio
- **Draw Signature**: Smooth quadratic Bezier curve smoothing with custom stroke widths and ink colors.
- **Type Signature**: 4 handwriting cursive font styles (`Caveat`, `Dancing Script`, `Great Vibes`, `Pacifico`).
- **Upload Signature**: Automatic white background keying to convert physical signature photos into transparent digital signatures.

### 🎨 3. Drawing, Shapes & Redaction
- **Freehand Pen & Translucent Highlighter**: Multi-opacity highlighting and vector sketching.
- **Geometric Shapes**: Rectangles, Circles, Ellipses, Triangles, Arrows, and Lines with fill and stroke customizations.
- **Redaction Masks**: White-out and Black-out security redaction boxes.

### 🖼️ 4. Image Editing & AI Background Remover
- **Image Insertion**: Place images directly onto any PDF page.
- **Cropper.js Integration**: Crop images with multiple aspect ratio presets.
- **Automatic Background Removal**: Direct flood-fill color keying engine for transparent PNG conversions.
- **Image Filters**: Grayscale, Invert, Sepia, Brightness, and Contrast.

### 📑 5. Multi-Page PDF Management
- **Page Reordering**: Drag-and-drop thumbnail reorganization.
- **Page Operations**: Rotate ($90^\circ, 180^\circ, 270^\circ$), Duplicate, Delete, and Add Blank Pages.
- **Per-Page State Persistence**: Full annotation serialization and restoration across page switches.

### 🚀 6. Multi-Format Export Hub
- **Vector PDF Export**: Lossless multi-page vector PDF generation powered by PDF-Lib.
- **High-Res Raster Exports**: 2x Retina PNG and JPEG downloads.
- **Flattened Print-Ready PDF**: Flattened composite output for universal PDF reader compatibility.

---

## 🛠️ Tech Stack
- **Frontend**: HTML5, Vanilla JavaScript (ES6+), Vanilla CSS3 (Dark Theme)
- **Canvas Engine**: [Fabric.js v5.3.0](https://fabricjs.com/)
- **PDF Rendering**: [PDF.js](https://mozilla.github.io/pdf.js/)
- **PDF Generation**: [PDF-Lib](https://pdf-lib.js.org/)
- **Image Cropping**: [Cropper.js](https://fengyuanchen.github.io/cropperjs/)
- **Icons**: [FontAwesome 6.5](https://fontawesome.com/)
- **Typography**: Google Fonts (`Arimo`, `Tinos`, `Cousine`, `Inter`, `Outfit`, `Caveat`, `Dancing Script`, `Great Vibes`, `Pacifico`, `Roboto`)

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/ashishkumar-india/PDFNot.git
```

### 2. Run Locally
Simply serve the directory via any local web server (e.g. Apache/XAMPP, Live Server, or Python HTTP server):
```bash
# Using Python
python -m http.server 8000

# Or open index.html in XAMPP (http://localhost/PDF_Edit/index.html)
```

---

## 📄 License
MIT License. Free for personal and commercial use.
