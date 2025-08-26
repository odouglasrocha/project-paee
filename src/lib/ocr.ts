export type CropRect = { x: number; y: number; w: number; h: number };

const MAX_DIM = 1600;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const loadImageFromUrl = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
};

export const preprocessImageFromUrl = async (
  url: string,
  rect?: CropRect
): Promise<Blob> => {
  const img = await loadImageFromUrl(url);

  // Determine crop region in natural pixels
  const sx = rect ? clamp(rect.x, 0, img.naturalWidth - 1) : 0;
  const sy = rect ? clamp(rect.y, 0, img.naturalHeight - 1) : 0;
  const sw = rect ? clamp(rect.w, 1, img.naturalWidth - sx) : img.naturalWidth;
  const sh = rect ? clamp(rect.h, 1, img.naturalHeight - sy) : img.naturalHeight;

  // Scale down if too large to improve OCR speed
  let dw = sw;
  let dh = sh;
  if (dw > MAX_DIM || dh > MAX_DIM) {
    if (dw > dh) {
      dh = Math.round((dh * MAX_DIM) / dw);
      dw = MAX_DIM;
    } else {
      dw = Math.round((dw * MAX_DIM) / dh);
      dh = MAX_DIM;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

  // Advanced image preprocessing for mobile camera images
  const imageData = ctx.getImageData(0, 0, dw, dh);
  const data = imageData.data as Uint8ClampedArray;

  // Step 1: Noise reduction using simple blur
  const blurredData = new Uint8ClampedArray(data);
  for (let y = 1; y < dh - 1; y++) {
    for (let x = 1; x < dw - 1; x++) {
      for (let c = 0; c < 3; c++) {
        const idx = (y * dw + x) * 4 + c;
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += data[((y + dy) * dw + (x + dx)) * 4 + c];
          }
        }
        blurredData[idx] = sum / 9;
      }
    }
  }

  // Step 2: Build histogram and compute Otsu threshold on grayscale
  const hist = new Array(256).fill(0) as number[];
  let total = 0;
  let sumAll = 0;
  for (let i = 0; i < blurredData.length; i += 4) {
    const r = blurredData[i], g = blurredData[i + 1], b = blurredData[i + 2];
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    hist[gray] += 1;
    sumAll += gray;
    total += 1;
  }
  
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  // Step 3: Apply adaptive contrast and sharpening
  const contrast = 2.2; // Higher contrast for mobile images
  const sharpening = 0.3; // Add sharpening factor
  const offset = 128 * (1 - contrast);
  const thrC = threshold * contrast + offset;

  for (let i = 0; i < data.length; i += 4) {
    const r = blurredData[i], g = blurredData[i + 1], b = blurredData[i + 2];
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // Apply sharpening (unsharp mask)
    const originalGray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray = gray + sharpening * (originalGray - gray);
    
    // Apply contrast
    gray = gray * contrast + offset;
    
    // Apply threshold with slight smoothing near threshold
    const distance = Math.abs(gray - thrC);
    const v = distance < 10 ? (gray > thrC ? 255 - distance * 2 : distance * 2) : (gray > thrC ? 255 : 0);
    
    data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, v));
    // keep alpha
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Blob creation failed'))),
      'image/png',
      1.0
    );
  });
};
