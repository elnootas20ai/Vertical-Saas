import { useState } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Artwork: Apple Design Resources → Sign in with Apple Logo
 * (Logo-Sign-in-with-Apple.dmg). Do not replace with custom SVGs.
 * @see https://developer.apple.com/design/resources/
 * @see public/apple-signin/README.md
 */
const SIWA_LOGO_WHITE_MEDIUM = '/apple-signin/Logo-SIWA-Left-aligned-White-Medium.svg';

type Props = {
  label?: string;
  disabled?: boolean;
  onPress: () => void | Promise<void>;
  className?: string;
};

/** Botón Sign in with Apple (HIG): logo oficial + fondo negro, altura 44pt. */
export function AppleSignInButton({
  label = 'Continuar con Apple',
  disabled = false,
  onPress,
  className = '',
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      await onPress();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || busy}
      className={`w-full h-11 min-h-[44px] inline-flex items-center justify-center gap-0 rounded-[8px] bg-black text-white text-[17px] font-semibold leading-none px-3 transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden ${className}`}
      aria-label={label}
    >
      {busy ? (
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
      ) : (
        <img
          src={SIWA_LOGO_WHITE_MEDIUM}
          alt=""
          width={31}
          height={44}
          className="h-11 w-auto shrink-0 pointer-events-none select-none"
          draggable={false}
          aria-hidden
        />
      )}
      <span className="pl-1 pr-2">{busy ? 'Conectando…' : label}</span>
    </button>
  );
}
