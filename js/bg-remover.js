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
   * Luminance based background removal with smooth Hermite anti-aliased edge falloff
   * (Produces natural, ultra-smooth handwritten signatures with zero pixelated/sharp/jagged edges)
   */
  static async removeLuminanceBackground(img, tolerance = 25) {
    const canvas = document.createElement('canvas');
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // 1. Sample perimeter pixels to find the true background paper luminance
    let borderLumSum = 0;
    let borderCount = 0;
    for (let x = 0; x < w; x += 4) {
      const topIdx = x * 4;
      const btmIdx = ((h - 1) * w + x) * 4;
      borderLumSum += (0.299 * data[topIdx] + 0.587 * data[topIdx + 1] + 0.114 * data[topIdx + 2]);
      borderLumSum += (0.299 * data[btmIdx] + 0.587 * data[btmIdx + 1] + 0.114 * data[btmIdx + 2]);
      borderCount += 2;
    }
    for (let y = 0; y < h; y += 4) {
      const leftIdx = (y * w) * 4;
      const rightIdx = (y * w + (w - 1)) * 4;
      borderLumSum += (0.299 * data[leftIdx] + 0.587 * data[leftIdx + 1] + 0.114 * data[leftIdx + 2]);
      borderLumSum += (0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2]);
      borderCount += 2;
    }

    const paperLum = borderCount > 0 ? (borderLumSum / borderCount) : 240;
    
    // Dynamic soft thresholds based on paper brightness & tolerance
    const upperCutoff = Math.min(255, paperLum - (tolerance * 0.35));
    const lowerCutoff = Math.max(20, paperLum - (tolerance * 2.0) - 50);
    const range = Math.max(upperCutoff - lowerCutoff, 10);

    // 2. Soft-alpha extraction with smooth Hermite curve and edge de-haloing
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (lum >= upperCutoff) {
        data[i + 3] = 0; // Clean transparent paper
      } else if (lum <= lowerCutoff) {
        data[i + 3] = 255; // Solid core ink
      } else {
        // Smoothstep interpolation (Hermite curve: 3t^2 - 2t^3) for butter-smooth edges
        const t = (upperCutoff - lum) / range;
        const smoothAlpha = t * t * (3 - 2 * t);
        data[i + 3] = Math.round(smoothAlpha * 255);

        // De-halo: neutralize white paper light fringe so ink stroke is smooth without harsh pixels
        const inkFactor = Math.min(1.0, smoothAlpha * 1.4);
        data[i] = Math.round(r * inkFactor);
        data[i + 1] = Math.round(g * inkFactor);
        data[i + 2] = Math.round(b * inkFactor);
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
