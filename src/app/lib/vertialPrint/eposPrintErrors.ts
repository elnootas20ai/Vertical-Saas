export function eposWebConfigUrl(printerHost: string): string {
  const host = String(printerHost || '').trim();
  if (!host) return '';
  return `http://${host}`;
}

function isAppleMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function normalizeEposPrintError(raw: string | undefined, printerHost?: string): string {
  const host = String(printerHost || '').trim();
  const text = String(raw || '').trim();
  const lower = text.toLowerCase();
  const certUrl = host ? eposTrustUrl(host) : 'https://IP-IMPRESORA:8043';
  const configUrl = host ? eposWebConfigUrl(host) : 'http://IP-IMPRESORA';

  if (
    lower.includes('error de red')
    || lower.includes('sin conexión')
    || lower.includes('sin conexion')
    || lower.includes('sin respuesta')
    || lower.includes('network_error')
    || lower.includes('connection_error')
    || lower.includes('failed to fetch')
    || lower.includes('websocket')
    || lower.includes('socket')
  ) {
    if (isAppleMobileBrowser()) {
      return [
        'La Epson está bien configurada, pero Safari no deja que Vertial (internet) hable con la red local.',
        'Solución en el local: un PC encendido con Vertial Print, misma WiFi; en el TPV pon la IP de ese PC en «PC del mostrador».',
        `Alternativa: exporta el certificado SSL de la impresora, instálalo en el iPad (Ajustes → Confianza de certificados).`,
      ].join(' ');
    }
    return [
      'No se llega a la impresora. ¿Estás en la misma WiFi que la Epson (192.168.1.x)?',
      'Desde casa no funciona: la IP 192.168.1.200 solo existe dentro del local.',
      'En el PC del local: npm run print-bridge, recarga Vertial (Ctrl+F5) y prueba otra vez.',
    ].join(' ');
  }

  if (lower.includes('timeout') || lower.includes('tard')) {
    return 'La impresora no respondió a tiempo. Comprueba que está encendida y en la misma WiFi.';
  }

  if (lower.includes('cover') || lower.includes('tapa')) {
    return 'Cierra la tapa de la impresora e inténtalo de nuevo.';
  }

  if (lower.includes('paper') || lower.includes('papel')) {
    return 'No hay papel en la impresora.';
  }

  return text || 'No se pudo imprimir en la impresora Epson.';
}

export function eposTrustUrl(printerHost: string): string {
  const host = String(printerHost || '').trim();
  if (!host) return '';
  return `https://${host}:8043`;
}
