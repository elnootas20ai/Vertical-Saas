/**
 * Nombres basura que el teclado/autofill de tablet (ES) mete a veces en «Pedido rápido».
 * Chrome asocia `type="search"` / rol search con la etiqueta «Buscar» y la rellena como nombre.
 */
const JUNK_TPV_CUSTOMER_NAME =
  /^(buscar|search|cliente|test|prueba|nombre|sin\s*nombre|n\/a|na|xxx+)$/i;

export function isJunkTpvCustomerName(name: string | null | undefined): boolean {
  const n = String(name || '').trim();
  if (!n) return true;
  return JUNK_TPV_CUSTOMER_NAME.test(n);
}

/** Etiqueta segura para tablero / historial / tickets. */
export function resolveTpvCustomerDisplayName(
  name: string | null | undefined,
  fallback = 'Sin nombre',
): string {
  const n = String(name || '').trim();
  if (!n || isJunkTpvCustomerName(n)) return fallback;
  return n;
}

/** null = OK; string = mensaje de error para toast. */
export function validateTpvQuickAttentionName(name: string): string | null {
  const n = String(name || '').trim();
  if (n.length < 2) {
    return 'Escribe un nombre (mín. 2 letras) para el pedido rápido';
  }
  if (isJunkTpvCustomerName(n)) {
    return 'Pon el nombre del cliente (no vale «Buscar» ni nombres genéricos)';
  }
  return null;
}

/**
 * Si en el buscador ya escribieron un nombre (no solo dígitos), reutilizarlo en pedido rápido.
 */
export function quickAttentionNameFromClientSearch(searchText: string): string {
  const raw = String(searchText || '').trim();
  if (!raw) return '';
  if (/^\d[\d\s]*$/.test(raw)) return '';
  if (!/[a-záéíóúñü]/i.test(raw)) return '';
  if (isJunkTpvCustomerName(raw)) return '';
  return raw.slice(0, 80);
}
