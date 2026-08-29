/**
 * DocuCraft PRO - Automatic Background Removal & Color Keying Engine
 * Pure client-side canvas image processing for removing backgrounds from photos, logos, signatures & stamps.
 */

class BackgroundRemover {
  /**
   * Automatically detects and removes background from an image source
   * @param {HTMLImageElement|HTMLCanvasElement|string} imageSource 
   * @param {object} options
   * @returns {Promise<string>} dataUrl of transparent PNG
   */
  static async removeBackground(imageSource, options = {}) {
    const {
      mode = 'auto',        // 'auto' | 'white' | 'custom' | 'luminance'
      tolerance = 30,       // 0 to 100
      feather = 2,          // 0 to 10 (edge smoothing)
      targetColor = null,   // {r, g, b} for custom color removal
      floodFill = true      // only remove background connected to edges
    } = options;

    const img = await this.loadImage(imageSource);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const w = canvas.width;
    const h = canvas.height;

    // 1. Determine Background Target Color
    let bgR, bgG, bgB;

    if (mode === 'white') {
      bgR = 255; bgG = 255; bgB = 255;
    } else if (mode === 'custom' && targetColor) {
      bgR = targetColor.r; bgG = targetColor.g; bgB = targetColor.b;
    } else if (mode === 'luminance') {
      // For black text / signatures on white paper
      return this.removeLuminanceBackground(img, tolerance);
    } else {
      // AUTO MODE: Sample 4 corners and borders to find the dominant background color
      const sampleColors = [
        this.getPixelColor(data, 0, 0, w),
        this.getPixelColor(data, w - 1, 0, w),
        this.getPixelColor(data, 0, h - 1, w),
        this.getPixelColor(data, w - 1, h - 1, w),
        this.getPixelColor(data, Math.floor(w / 2), 0, w),
        this.getPixelColor(data, Math.floor(w / 2), h - 1, w),
        this.getPixelColor(data, 0, Math.floor(h / 2), w),
        this.getPixelColor(data, w - 1, Math.floor(h / 2), w)
      ];

      const dominant = this.getDominantColor(sampleColors);
      bgR = dominant.r;
      bgG = dominant.g;
      bgB = dominant.b;
    }

    const tolSq = (tolerance * 4.41) ** 2; // Euclidean distance squared in 3D color space

    if (floodFill) {
      // FLOOD-FILL ALGORITHM from edges: preserves interior areas that have the same color (e.g. eyes or white clothes)
      const visited = new Uint8Array(w * h);
      const queue = [];

      // Add all boundary pixels (top row, bottom row, left col, right col)
      for (let x = 0; x < w; x++) {
        queue.push(x);                  // top row: y=0
        queue.push((h - 1) * w + x);   // bottom row: y=h-1
      }
      for (let y = 0; y < h; y++) {
        queue.push(y * w);              // left col: x=0
        queue.push(y * w + (w - 1));    // right col: x=w-1
      }

      while (queue.length > 0) {
        const idx = queue.pop();
        if (visited[idx]) continue;
        visited[idx] = 1;

        const pixelIdx = idx * 4;
        const r = data[pixelIdx];
        const g = data[pixelIdx + 1];
        const b = data[pixelIdx + 2];
        const a = data[pixelIdx + 3];

        if (a === 0) continue;

        const distSq = (r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2;

        if (distSq <= tolSq) {
          // Calculate smooth edge alpha
          if (feather > 0 && distSq > tolSq * 0.75) {
            const ratio = (distSq - tolSq * 0.75) / (tolSq * 0.25);
            data[pixelIdx + 3] = Math.floor(ratio * 255);
          } else {
            data[pixelIdx + 3] = 0; // Completely transparent
          }

          const px = idx % w;
          const py = Math.floor(idx / w);

          if (px > 0 && !visited[idx - 1]) queue.push(idx - 1);
          if (px < w - 1 && !visited[idx + 1]) queue.push(idx + 1);
          if (py > 0 && !visited[idx - w]) queue.push(idx - w);
          if (py < h - 1 && !visited[idx + w]) queue.push(idx + w);
        }
      }
    } else {
      // GLOBAL COLOR THRESHOLDING
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const distSq = (r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2;

        if (distSq <= tolSq) {
          if (feather > 0 && distSq > tolSq * 0.75) {
            const ratio = (distSq - tolSq * 0.75) / (tolSq * 0.25);
            data[i + 3] = Math.floor(ratio * 255);
          } else {
            data[i + 3] = 0;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  /**
   * Luminance based background removal (ideal for handwritten signatures / line drawings on paper)
   */
  static async removeLuminanceBackground(img, tolerance = 30) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    const threshold = 255 - (tolerance * 2.5);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Perceived luminance
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (lum >= threshold) {
        data[i + 3] = 0; // Transparent
      } else {
        // Boost contrast on dark strokes
        const alpha = Math.min(255, (threshold - lum) * 2);
        data[i + 3] = alpha;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  static getPixelColor(data, x, y, width) {
    const idx = (y * width + x) * 4;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
  }

  static getDominantColor(colors) {
    // Average corner colors
    let sumR = 0, sumG = 0, sumB = 0, count = 0;
    for (const c of colors) {
      if (c.a > 50) {
        sumR += c.r;
        sumG += c.g;
        sumB += c.b;
        count++;
      }
    }
    if (count === 0) return { r: 255, g: 255, b: 255 };
    return {
      r: Math.round(sumR / count),
      g: Math.round(sumG / count),
      b: Math.round(sumB / count)
    };
  }

  static loadImage(src) {
    return new Promise((resolve, reject) => {
      if (src instanceof HTMLImageElement || src instanceof HTMLCanvasElement) {
        resolve(src);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
}

window.BackgroundRemover = BackgroundRemover;
