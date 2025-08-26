import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
interface CameraCaptureProps {
  onCapture: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, disabled = false, className = "" }) => {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const start = async () => {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
          },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = streamRef.current;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        console.error(e);
      }
    };

    if (open) {
      setReady(false);
      start();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setReady(false);
    };
  }, [open]);

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `captura-${Date.now()}.png`, { type: "image/png" });
      onCapture(file);
      setOpen(false);
    }, "image/png", 1.0);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      onCapture(f);
    }
    e.target.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className={`flex items-center gap-2 ${className}`}>
        <DialogTrigger asChild>
          <Button type="button" variant="secondary" size="sm" disabled={disabled}>Abrir câmera</Button>
        </DialogTrigger>
        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
        <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => fileInputRef.current?.click()}>Escolher arquivo</Button>
      </div>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Capturar foto</DialogTitle>
          <DialogDescription>Posicione a validade e o código no enquadramento. A captura será habilitada quando a câmera estiver pronta.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="aspect-video w-full overflow-hidden rounded-md bg-muted">
            <video ref={videoRef} className="h-full w-full object-contain" playsInline muted onLoadedMetadata={() => setReady(true)} onCanPlay={() => setReady(true)} />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={handleCapture} disabled={!ready}>Capturar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CameraCapture;
