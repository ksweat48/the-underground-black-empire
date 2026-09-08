import { useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { cn } from '@/shared/cn';

interface ListingImageUploaderProps {
  onImageReady: (dataUrl: string | null) => void;
  className?: string;
}

const MAX_FILE_SIZE = 4 * 1024 * 1024;

export function ListingImageUploader({ onImageReady, className }: ListingImageUploaderProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, WebP, etc.).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('Image must be under 4 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setError(null);
    setLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageSrc(result);
      onImageReady(result);
      setLoading(false);
    };
    reader.onerror = () => {
      setError('Could not read this image. Please try a different file.');
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = () => {
    setImageSrc(null);
    setError(null);
    onImageReady(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="sr-only"
        aria-label="Upload business photo"
      />

      {loading ? (
        <div className="w-full max-w-[200px] aspect-video rounded-lg border-2 border-dashed border-gold-500/40 bg-ink-900/50 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-gold-400 animate-spin" />
        </div>
      ) : imageSrc ? (
        <div className="relative w-full max-w-[200px] aspect-video rounded-lg overflow-hidden border border-gold-500/30">
          <img
            src={imageSrc}
            alt="Listing preview"
            className="w-full h-full object-cover"
            onError={() => {
              setError('This image format is not supported. Please try a JPG or PNG.');
              setImageSrc(null);
              onImageReady(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-ink-900/80 border border-ink-700 flex items-center justify-center text-ink-300 hover:text-crimson-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full max-w-[200px] aspect-video rounded-lg border-2 border-dashed border-ink-700 hover:border-gold-500/40 bg-ink-900/50 flex flex-col items-center justify-center gap-2 transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-gold-950/40 border border-gold-800/30 flex items-center justify-center">
            <ImagePlus className="w-4 h-4 text-gold-400" />
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
            Upload Photo
          </span>
        </button>
      )}

      {error && <p className="text-xs text-crimson-300">{error}</p>}
    </div>
  );
}

export default ListingImageUploader;
