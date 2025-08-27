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

// Função para aplicar equalização de histograma adaptativa (CLAHE)
const applyCLAHE = (imageData: ImageData, clipLimit: number = 3.0, tileSize: number = 8): ImageData => {
  const { data, width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  // Converte para escala de cinza primeiro
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    result.data[i] = result.data[i + 1] = result.data[i + 2] = gray;
    result.data[i + 3] = data[i + 3];
  }
  
  const tilesX = Math.ceil(width / tileSize);
  const tilesY = Math.ceil(height / tileSize);
  
  // Processa cada tile
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const startX = tx * tileSize;
      const startY = ty * tileSize;
      const endX = Math.min(startX + tileSize, width);
      const endY = Math.min(startY + tileSize, height);
      
      // Calcula histograma do tile
      const hist = new Array(256).fill(0);
      let pixelCount = 0;
      
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 4;
          const gray = result.data[idx];
          hist[gray]++;
          pixelCount++;
        }
      }
      
      // Aplica clip limit
      const clipValue = Math.floor(clipLimit * pixelCount / 256);
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipValue) {
          excess += hist[i] - clipValue;
          hist[i] = clipValue;
        }
      }
      
      // Redistribui excess uniformemente
      const redistribution = Math.floor(excess / 256);
      for (let i = 0; i < 256; i++) {
        hist[i] += redistribution;
      }
      
      // Calcula CDF
      const cdf = new Array(256);
      cdf[0] = hist[0];
      for (let i = 1; i < 256; i++) {
        cdf[i] = cdf[i - 1] + hist[i];
      }
      
      // Normaliza CDF
      const cdfMin = cdf.find(val => val > 0) || 0;
      const cdfMax = cdf[255];
      
      // Aplica equalização no tile
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 4;
          const gray = result.data[idx];
          const newGray = Math.round(((cdf[gray] - cdfMin) / (cdfMax - cdfMin)) * 255);
          result.data[idx] = result.data[idx + 1] = result.data[idx + 2] = Math.max(0, Math.min(255, newGray));
        }
      }
    }
  }
  
  return result;
};

// Função para detectar e corrigir inclinação (deskew)
const detectSkewAngle = (imageData: ImageData): number => {
  const { data, width, height } = imageData;
  const angles = [-15, -10, -5, -2, -1, 0, 1, 2, 5, 10, 15]; // Ângulos para testar
  let bestAngle = 0;
  let maxScore = 0;
  
  for (const angle of angles) {
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    
    let score = 0;
    const step = 5; // Amostragem para performance
    
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width - 1; x += step) {
        const x1 = Math.round(x * cos - y * sin);
        const y1 = Math.round(x * sin + y * cos);
        const x2 = Math.round((x + 1) * cos - y * sin);
        const y2 = Math.round((x + 1) * sin + y * cos);
        
        if (x1 >= 0 && x1 < width && y1 >= 0 && y1 < height &&
            x2 >= 0 && x2 < width && y2 >= 0 && y2 < height) {
          const idx1 = (y1 * width + x1) * 4;
          const idx2 = (y2 * width + x2) * 4;
          const diff = Math.abs(data[idx1] - data[idx2]);
          if (diff > 50) score++; // Detecta bordas horizontais
        }
      }
    }
    
    if (score > maxScore) {
      maxScore = score;
      bestAngle = angle;
    }
  }
  
  return bestAngle;
};

// Função para aplicar correção de inclinação
const applyDeskew = (canvas: HTMLCanvasElement, angle: number): void => {
  if (Math.abs(angle) < 0.5) return; // Não corrige ângulos muito pequenos
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const radians = (angle * Math.PI) / 180;
  
  // Limpa o canvas
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Aplica rotação
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-radians);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);
  ctx.putImageData(imageData, 0, 0);
  ctx.restore();
};

// Função para redução de ruído específica para macro
const reduceMacroNoise = (imageData: ImageData): ImageData => {
  const { data, width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  // Filtro bilateral para preservar bordas enquanto remove ruído
  const kernelSize = 5;
  const sigmaColor = 50;
  const sigmaSpace = 50;
  const halfKernel = Math.floor(kernelSize / 2);
  
  for (let y = halfKernel; y < height - halfKernel; y++) {
    for (let x = halfKernel; x < width - halfKernel; x++) {
      const centerIdx = (y * width + x) * 4;
      const centerGray = data[centerIdx];
      
      let weightSum = 0;
      let valueSum = 0;
      
      for (let ky = -halfKernel; ky <= halfKernel; ky++) {
        for (let kx = -halfKernel; kx <= halfKernel; kx++) {
          const neighborIdx = ((y + ky) * width + (x + kx)) * 4;
          const neighborGray = data[neighborIdx];
          
          // Peso espacial
          const spatialDist = Math.sqrt(kx * kx + ky * ky);
          const spatialWeight = Math.exp(-(spatialDist * spatialDist) / (2 * sigmaSpace * sigmaSpace));
          
          // Peso de cor
          const colorDist = Math.abs(centerGray - neighborGray);
          const colorWeight = Math.exp(-(colorDist * colorDist) / (2 * sigmaColor * sigmaColor));
          
          const weight = spatialWeight * colorWeight;
          weightSum += weight;
          valueSum += neighborGray * weight;
        }
      }
      
      const filteredValue = Math.round(valueSum / weightSum);
      result.data[centerIdx] = result.data[centerIdx + 1] = result.data[centerIdx + 2] = filteredValue;
      result.data[centerIdx + 3] = data[centerIdx + 3];
    }
  }
  
  return result;
};

// Função para aplicar filtro de nitidez (sharpen)
const applySharpen = (imageData: ImageData, strength: number = 0.5): ImageData => {
  const { data, width, height } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  // Kernel de nitidez
  const kernel = [
    [0, -strength, 0],
    [-strength, 1 + 4 * strength, -strength],
    [0, -strength, 0]
  ];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          sum += data[idx] * kernel[ky + 1][kx + 1];
        }
      }
      
      const resultIdx = (y * width + x) * 4;
      const sharpened = Math.max(0, Math.min(255, Math.round(sum)));
      result.data[resultIdx] = result.data[resultIdx + 1] = result.data[resultIdx + 2] = sharpened;
      result.data[resultIdx + 3] = data[resultIdx + 3];
    }
  }
  
  return result;
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

  // Usa filtro de alta qualidade para redimensionamento
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

  // Pipeline otimizado para imagens de celular, baixa luminosidade e modo macro
  let imageData = ctx.getImageData(0, 0, dw, dh);
  
  // Etapa 1: Detectar e corrigir inclinação (deskew)
  const skewAngle = detectSkewAngle(imageData);
  if (Math.abs(skewAngle) > 0.5) {
    console.log(`🔧 Corrigindo inclinação: ${skewAngle}°`);
    applyDeskew(canvas, skewAngle);
    imageData = ctx.getImageData(0, 0, dw, dh);
  }
  
  // Etapa 2: Redução de ruído específica para macro
  console.log('🔧 Aplicando redução de ruído para macro...');
  imageData = reduceMacroNoise(imageData);
  
  // Etapa 3: Equalização de histograma adaptativa (CLAHE) para baixa luminosidade
  console.log('🔧 Aplicando CLAHE para melhorar contraste...');
  imageData = applyCLAHE(imageData, 3.0, 8);
  
  // Etapa 4: Aplicar filtro de nitidez para destacar contornos
  console.log('🔧 Aplicando filtro de nitidez...');
  imageData = applySharpen(imageData, 0.4);
  
  // Etapa 5: Binarização adaptativa otimizada
  console.log('🔧 Aplicando binarização adaptativa...');
  const data = imageData.data;
  const tileSize = 16; // Tamanho do tile para binarização adaptativa
  const tilesX = Math.ceil(dw / tileSize);
  const tilesY = Math.ceil(dh / tileSize);
  
  // Processa cada tile para binarização adaptativa
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const startX = tx * tileSize;
      const startY = ty * tileSize;
      const endX = Math.min(startX + tileSize, dw);
      const endY = Math.min(startY + tileSize, dh);
      
      // Calcula média local para threshold adaptativo
      let sum = 0;
      let count = 0;
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * dw + x) * 4;
          sum += data[idx]; // Usa canal R (já em grayscale)
          count++;
        }
      }
      
      const localMean = sum / count;
      const adaptiveThreshold = localMean * 0.85; // Threshold ligeiramente abaixo da média
      
      // Aplica binarização no tile
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * dw + x) * 4;
          const gray = data[idx];
          
          // Binarização com suavização nas bordas
          let binaryValue;
          if (gray > adaptiveThreshold + 10) {
            binaryValue = 255;
          } else if (gray < adaptiveThreshold - 10) {
            binaryValue = 0;
          } else {
            // Suavização na zona de transição
            const factor = (gray - (adaptiveThreshold - 10)) / 20;
            binaryValue = Math.round(factor * 255);
          }
          
          data[idx] = data[idx + 1] = data[idx + 2] = binaryValue;
        }
      }
    }
  }
  
  // Etapa 6: Pós-processamento para limpeza final
  console.log('🔧 Aplicando limpeza final...');
  
  // Remove pequenos artefatos (morfologia)
  const cleanedData = new Uint8ClampedArray(data);
  for (let y = 1; y < dh - 1; y++) {
    for (let x = 1; x < dw - 1; x++) {
      const idx = (y * dw + x) * 4;
      
      // Conta pixels brancos na vizinhança 3x3
      let whiteCount = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const neighborIdx = ((y + dy) * dw + (x + dx)) * 4;
          if (data[neighborIdx] > 127) whiteCount++;
        }
      }
      
      // Remove ruído isolado
      if (whiteCount < 3) {
        cleanedData[idx] = cleanedData[idx + 1] = cleanedData[idx + 2] = 0;
      } else if (whiteCount > 6) {
        cleanedData[idx] = cleanedData[idx + 1] = cleanedData[idx + 2] = 255;
      }
    }
  }
  
  // Aplica dados limpos
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = cleanedData[i];
  }
  
  ctx.putImageData(imageData, 0, 0);
  console.log('✅ Pipeline de pré-processamento concluído');

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Blob creation failed'))),
      'image/png',
      1.0
    );
  });
};
