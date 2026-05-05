// import logoImage from 'figma:asset/841a58f721c551c9787f7d758f8005cf7dfb6bc5.png';

interface VertialLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showText?: boolean;
}

const sizeMap = {
  sm: 'h-6',
  md: 'h-7',
  lg: 'h-8',
  xl: 'h-10',
};

export function VertialLogo({ size = 'md', className = '', showText = false }: VertialLogoProps) {
  const logoSrc = new URL('../../assets/logo.svg', import.meta.url).href;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={logoSrc}
        alt="Vertial"
        className={`${sizeMap[size]} w-auto object-contain`}
      />
      {showText && (
        <span className="text-xl font-semibold">Vertial</span>
      )}
    </div>
  );
}
