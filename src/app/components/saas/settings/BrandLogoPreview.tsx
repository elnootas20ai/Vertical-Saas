import { useMemo, useState } from 'react';

type LogoLayout = 'wide' | 'tall' | 'balanced';

function layoutFromSize(naturalWidth: number, naturalHeight: number): LogoLayout {
  if (naturalWidth < 1 || naturalHeight < 1) return 'balanced';
  const ratio = naturalWidth / naturalHeight;
  if (ratio >= 1.35) return 'wide';
  if (ratio <= 0.75) return 'tall';
  return 'balanced';
}

export type BrandLogoPreviewProps = {
  src: string;
  boxClassName?: string;
  size?: 'md' | 'lg' | 'xl';
};

const SIZE_STYLES: Record<LogoLayout, Record<NonNullable<BrandLogoPreviewProps['size']>, string>> = {
  wide: {
    md: 'h-28 w-full min-w-0 object-contain object-center sm:h-32',
    lg: 'h-36 w-full min-w-0 object-contain object-center sm:h-40',
    xl: 'h-44 w-full min-w-0 object-contain object-center sm:h-52',
  },
  tall: {
    md: 'max-h-40 w-auto max-w-full object-contain sm:max-h-44',
    lg: 'max-h-48 w-auto max-w-full object-contain sm:max-h-56',
    xl: 'max-h-56 w-auto max-w-full object-contain sm:max-h-64',
  },
  balanced: {
    md: 'max-h-40 max-w-full object-contain sm:max-h-44',
    lg: 'max-h-48 max-w-full object-contain sm:max-h-56',
    xl: 'max-h-56 max-w-full object-contain sm:max-h-64',
  },
};

export function BrandLogoPreview({ src, boxClassName = '', size = 'md' }: BrandLogoPreviewProps) {
  const [layout, setLayout] = useState<LogoLayout>('balanced');
  const [loaded, setLoaded] = useState(false);

  const imgClass = useMemo(() => SIZE_STYLES[layout][size], [layout, size]);

  return (
    <div className={`flex w-full items-center justify-center ${boxClassName}`}>
      <img
        src={src}
        alt=""
        className={`${imgClass} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity`}
        onLoad={(e) => {
          const img = e.currentTarget;
          setLayout(layoutFromSize(img.naturalWidth, img.naturalHeight));
          setLoaded(true);
        }}
      />
    </div>
  );
}

export function isExtremeWideLogo(naturalWidth: number, naturalHeight: number): boolean {
  return naturalHeight > 0 && naturalWidth / naturalHeight >= 1.35;
}
