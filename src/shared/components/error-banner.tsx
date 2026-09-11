import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorBannerProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorBanner({ message = 'Something went wrong loading this content.', onRetry, className }: ErrorBannerProps) {
  return (
    <div className={`flex flex-col items-center gap-3 p-6 text-center ${className ?? ''}`}>
      <AlertCircle className="w-6 h-6 text-empire-danger/70" />
      <p className="text-sm text-empire-text-secondary max-w-xs">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium frame-utility text-empire-text-muted hover:text-empire-ivory transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      )}
    </div>
  );
}
