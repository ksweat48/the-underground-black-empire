import { useState, useEffect } from 'react';
import { cn } from '@/shared/cn';

interface AvatarProps {
  src: string | null;
  initials: string;
  imgClassName?: string;
  initialsClassName?: string;
  initialsStyle?: React.CSSProperties;
}

export function Avatar({
  src,
  initials,
  imgClassName,
  initialsClassName,
  initialsStyle,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const showImage = src && !imgError;

  return (
    <>
      {showImage ? (
        <img
          src={src}
          alt=""
          className={cn('w-full h-full object-cover', imgClassName)}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          className={cn('w-full h-full flex items-center justify-center', initialsClassName)}
          style={initialsStyle}
        >
          <span className="font-display font-bold">{initials}</span>
        </div>
      )}
    </>
  );
}
