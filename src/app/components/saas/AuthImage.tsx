import { useEffect, useState } from 'react';
import { authFetch, getAuthHeaders } from '../../lib/authApi';
import { getApiBase } from '../../lib/apiBase';

/** Data URLs enormes (legado) pueden tumbar la pestaña → pantalla en blanco. */
const MAX_INLINE_DATA_URL_CHARS = 1_200_000;

function resolveSrc(src: string): string {
  const s = String(src || '').trim();
  if (!s) return '';
  if (
    s.startsWith('data:')
    || s.startsWith('blob:')
    || s.startsWith('http://')
    || s.startsWith('https://')
  ) {
    return s;
  }
  if (s.startsWith('/')) return `${getApiBase()}${s}`;
  return s;
}

function isInlineSrc(src: string): boolean {
  return src.startsWith('data:') || src.startsWith('blob:');
}

function isOversizedDataUrl(src: string): boolean {
  return src.startsWith('data:') && src.length > MAX_INLINE_DATA_URL_CHARS;
}

type AuthImageProps = {
  src: string;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
};

/**
 * data:/blob: → <img> directo (sin fetch).
 * /api/.../foto/... → authFetch + blob (Bearer no va en src=).
 * Nunca devolver un hueco vacío sin feedback visual.
 */
export function AuthImage({ src, alt = '', className, loading = 'lazy' }: AuthImageProps) {
  const [display, setDisplay] = useState('');
  const [failed, setFailed] = useState(false);
  const [failLabel, setFailLabel] = useState('Sin foto');

  useEffect(() => {
    setFailed(false);
    setFailLabel('Sin foto');
    const absolute = resolveSrc(src);
    if (!absolute) {
      setDisplay('');
      setFailed(true);
      return;
    }
    if (isOversizedDataUrl(absolute)) {
      console.warn('[AuthImage] data URL demasiado grande; no se renderiza (evita crash)');
      setDisplay('');
      setFailLabel('Foto pesada');
      setFailed(true);
      return;
    }
    if (isInlineSrc(absolute)) {
      setDisplay(absolute);
      return;
    }

    let cancelled = false;
    let objectUrl = '';
    setDisplay('');
    void authFetch(absolute, { headers: { ...getAuthHeaders() } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (!blob || blob.size === 0) throw new Error('vacío');
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setDisplay(objectUrl);
          setFailed(false);
        }
      })
      .catch((err) => {
        console.error('[AuthImage] no se pudo cargar', absolute, err);
        if (!cancelled) {
          setDisplay('');
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed || !display) {
    if (failed) {
      return (
        <div
          className={`flex items-center justify-center bg-stone-200 dark:bg-stone-700 text-[10px] font-semibold text-stone-500 ${className || ''}`}
          title="No se pudo cargar la foto"
        >
          {failLabel}
        </div>
      );
    }
    return (
      <div
        className={`animate-pulse bg-stone-200 dark:bg-stone-700 ${className || ''}`}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={display}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        setDisplay('');
        setFailed(true);
      }}
    />
  );
}
