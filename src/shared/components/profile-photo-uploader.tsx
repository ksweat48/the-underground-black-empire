import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Plus, RotateCcw } from 'lucide-react';
import { cn } from '@/shared/cn';

interface ProfilePhotoUploaderProps {
  onPhotoReady: (dataUrl: string) => void;
  className?: string;
}

const CROP_SIZE = 200;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export function ProfilePhotoUploader({ onPhotoReady, className }: ProfilePhotoUploaderProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setPosition({ x: 0.5, y: 0.5 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!imageSrc) return;
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (e.clientX - dragStart.current.x) / rect.width;
    const dy = (e.clientY - dragStart.current.y) / rect.height;
    setPosition({
      x: Math.max(0, Math.min(1, dragStart.current.posX - dx)),
      y: Math.max(0, Math.min(1, dragStart.current.posY - dy)),
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const cropAndExport = useCallback(() => {
    if (!imageSrc || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = CROP_SIZE;
      canvas.height = CROP_SIZE;
      ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);

      const minDim = Math.min(img.width, img.height);
      const scale = (CROP_SIZE * zoom) / minDim;
      const srcW = img.width / scale;
      const srcH = img.height / scale;
      const srcX = (img.width - srcW) * position.x;
      const srcY = (img.height - srcH) * position.y;

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, CROP_SIZE, CROP_SIZE);
      onPhotoReady(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = imageSrc;
  }, [imageSrc, position, zoom, onPhotoReady]);

  useEffect(() => {
    if (imageSrc) cropAndExport();
  }, [imageSrc, position, zoom, cropAndExport]);

  const reset = () => {
    setImageSrc(null);
    setPosition({ x: 0.5, y: 0.5 });
    setZoom(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Circular preview */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn(
          'relative w-32 h-32 rounded-full overflow-hidden border-2 transition-all select-none',
          imageSrc
            ? 'border-gold-500/50 cursor-grab active:cursor-grabbing'
            : 'border-ink-700 cursor-pointer hover:border-gold-500/40',
        )}
        onClick={() => !imageSrc && fileInputRef.current?.click()}
        style={{ touchAction: 'none' }}
      >
        {imageSrc ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${imageSrc})`,
              backgroundSize: `${zoom * 100}%`,
              backgroundPosition: `${position.x * 100}% ${position.y * 100}%`,
              backgroundRepeat: 'no-repeat',
            }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-ink-900">
            <div className="w-10 h-10 rounded-full bg-gold-950/40 border border-gold-800/30 flex items-center justify-center">
              <Camera className="w-5 h-5 text-gold-400" />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
              Add Photo
            </span>
          </div>
        )}

        {/* Circle guide overlay */}
        {imageSrc && (
          <div className="absolute inset-0 rounded-full pointer-events-none ring-1 ring-inset ring-white/10" />
        )}
      </div>

      {/* Controls */}
      {imageSrc ? (
        <div className="flex flex-col items-center gap-2 w-full max-w-xs">
          {/* Zoom slider */}
          <div className="flex items-center gap-2 w-full">
            <span className="text-[10px] font-medium uppercase tracking-wider text-ink-500 shrink-0">Zoom</span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 h-1.5 rounded-full bg-ink-800 accent-gold-500 cursor-pointer"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-200 transition-colors px-3 py-1.5 rounded-lg bg-ink-900 border border-ink-700"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 transition-colors px-3 py-1.5 rounded-lg bg-ink-900 border border-gold-600/30"
            >
              <Plus className="w-3 h-3" />
              Change
            </button>
          </div>
        </div>
      ) : null}

      {/* Hidden canvas for cropping */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
