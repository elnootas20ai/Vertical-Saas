import { useEffect, useRef, useState } from 'react';
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

function looksLikeImageBlob(blob: Blob, contentTypeHeader: string | null): boolean {
  const header = String(contentTypeHeader || blob.type || '').toLowerCase();
  if (header.startsWith('image/')) return true;
  // Algunos proxies omiten content-type; un JSON/HTML de error no es imagen.
  if (header.includes('application/json') || header.includes('text/html') || header.includes('text/plain')) {
    return false;
  }
  // Sin cabecera útil: aceptar si el cuerpo tiene tamaño razonable de imagen.
  return blob.size > 32;
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
  const genRef = useRef(0);
  const objectUrlRef = useRef('');

  useEffect(() => {
    const gen = ++genRef.current;
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

    setDisplay('');
    let cancelled = false;

    void authFetch(absolute, { headers: { ...getAuthHeaders() } })
      .then(async (res) => {
        if (cancelled || gen !== genRef.current) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled || gen !== genRef.current) return;
        if (!blob || blob.size === 0) throw new Error('vacío');
        if (!looksLikeImageBlob(blob, res.headers.get('content-type'))) {
          throw new Error(`no-imagen (${res.headers.get('content-type') || blob.type || 'sin-tipo'})`);
        }
        const objectUrl = URL.createObjectURL(blob);
        if (cancelled || gen !== genRef.current) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }
        objectUrlRef.current = objectUrl;
        setDisplay(objectUrl);
        setFailed(false);
      })
      .catch((err) => {
        console.error('[AuthImage] no se pudo cargar', absolute, err);
        if (!cancelled && gen === genRef.current) {
          setDisplay('');
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      // No marcar failed aquí: el onError del <img> tras revoke era la causa de “Sin foto” en grid.
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = '';
      }
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
        // Ignorar errores de blobs ya revocados (Strict Mode / remount).
        if (!objectUrlRef.current || display !== objectUrlRef.current) return;
        setDisplay('');
        setFailed(true);
      }}
    />
  );
}
