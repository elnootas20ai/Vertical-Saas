import { useState, useCallback } from 'react';
import { Camera, ImagePlus, Loader2 } from 'lucide-react';
import { useCamera, type CameraPhoto, type UseCameraOptions } from '../../hooks/useCamera';

interface CameraButtonProps {
  onPhoto: (photo: CameraPhoto) => void;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  source?: UseCameraOptions['source'];
  className?: string;
  showIcon?: 'camera' | 'gallery' | 'auto';
}

const SIZE_CLASSES = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
};

const ICON_SIZE = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-4 h-4',
};

const VARIANT_CLASSES = {
  primary:   'bg-blue-600 hover:bg-blue-700 text-white border-transparent',
  secondary: 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  ghost:     'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 border-transparent',
};

/**
 * CameraButton – button that triggers the native camera (Capacitor) or
 * a file-picker (browser) and returns a base64 photo via the onPhoto callback.
 */
export function CameraButton({
  onPhoto,
  label = 'Tomar foto',
  variant = 'secondary',
  size = 'md',
  source = 'prompt',
  className = '',
  showIcon = 'auto',
}: CameraButtonProps) {
  const { takePhoto, isNative } = useCamera();
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      const photo = await takePhoto({ source });
      if (photo) onPhoto(photo);
    } finally {
      setLoading(false);
    }
  }, [takePhoto, source, onPhoto]);

  const iconClass = ICON_SIZE[size];
  const useGalleryIcon = showIcon === 'gallery' || (showIcon === 'auto' && !isNative);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={`
        inline-flex items-center justify-center font-medium rounded-lg border
        transition-colors disabled:opacity-60 disabled:cursor-not-allowed
        ${SIZE_CLASSES[size]}
        ${VARIANT_CLASSES[variant]}
        ${className}
      `}
    >
      {loading ? (
        <Loader2 className={`${iconClass} animate-spin`} />
      ) : useGalleryIcon ? (
        <ImagePlus className={iconClass} />
      ) : (
        <Camera className={iconClass} />
      )}
      {label}
    </button>
  );
}
