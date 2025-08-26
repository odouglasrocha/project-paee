import React, { useEffect, useRef, useState } from "react";

export type CropRect = { x: number; y: number; w: number; h: number };

interface OcrCropperProps {
  imageUrl: string;
  zoomPercent?: number; // display size control (affects only rendering)
  onSelectionChange?: (rect: CropRect | null) => void;
}

const OcrCropper: React.FC<OcrCropperProps> = ({ imageUrl, zoomPercent = 100, onSelectionChange }) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<CropRect | null>(null);

  useEffect(() => {
    // Reset when image changes
    setRect(null);
    onSelectionChange?.(null);
  }, [imageUrl]);

  const getRelativeCoords = (clientX: number, clientY: number) => {
    const wrapper = wrapperRef.current;
    const img = imgRef.current;
    if (!wrapper || !img) return { x: 0, y: 0, scaleX: 1, scaleY: 1 };

    const bounds = img.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;

    // scale to natural image pixels
    const scaleX = img.naturalWidth / bounds.width;
    const scaleY = img.naturalHeight / bounds.height;

    return { x: Math.max(0, x), y: Math.max(0, y), scaleX, scaleY };
  };

  const onPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const point = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    const { x, y } = getRelativeCoords(point.clientX, point.clientY);
    setIsDragging(true);
    setStart({ x, y });
  };

  const onPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !start) return;
    const point = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    const { x, y } = getRelativeCoords(point.clientX, point.clientY);
    const img = imgRef.current;
    if (!img) return;

    const bounds = img.getBoundingClientRect();

    // visible rect in display pixels
    const vx = Math.min(start.x, x);
    const vy = Math.min(start.y, y);
    const vw = Math.abs(x - start.x);
    const vh = Math.abs(y - start.y);

    // convert to natural pixels for output state
    const scaleX = img.naturalWidth / bounds.width;
    const scaleY = img.naturalHeight / bounds.height;
    const nRect: CropRect = {
      x: Math.round(vx * scaleX),
      y: Math.round(vy * scaleY),
      w: Math.round(vw * scaleX),
      h: Math.round(vh * scaleY),
    };
    setRect(nRect);
    onSelectionChange?.(nRect);
  };

  const onPointerUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="relative" ref={wrapperRef}
      onMouseDown={onPointerDown as any}
      onMouseMove={onPointerMove as any}
      onMouseUp={onPointerUp}
      onTouchStart={onPointerDown as any}
      onTouchMove={onPointerMove as any}
      onTouchEnd={onPointerUp}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Imagem para seleção de área de OCR"
        loading="lazy"
        style={{ width: `${zoomPercent}%` }}
        className="mx-auto block select-none"
        draggable={false}
      />

      {/* Selection overlay (displayed proportionally on top of image) */}
      {rect && imgRef.current && (
        (() => {
          const imgBounds = imgRef.current!.getBoundingClientRect();
          const scaleX = imgBounds.width / imgRef.current!.naturalWidth;
          const scaleY = imgBounds.height / imgRef.current!.naturalHeight;
          const dx = rect.x * scaleX;
          const dy = rect.y * scaleY;
          const dw = rect.w * scaleX;
          const dh = rect.h * scaleY;
          return (
            <div
              className="absolute border-2 border-primary/70 bg-primary/10 pointer-events-none"
              style={{
                left: imgBounds.left - wrapperRef.current!.getBoundingClientRect().left + dx,
                top: imgBounds.top - wrapperRef.current!.getBoundingClientRect().top + dy,
                width: dw,
                height: dh,
              }}
            />
          );
        })()
      )}

      {!rect && (
        <div className="text-center text-xs text-muted-foreground mt-2">
          Dica: arraste sobre a imagem para selecionar a área da data/código e melhorar a leitura.
        </div>
      )}
    </div>
  );
};

export default OcrCropper;
