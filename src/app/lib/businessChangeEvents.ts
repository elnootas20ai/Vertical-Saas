/** Disparado cuando la lista de empresas del tenant cambia (crear, borrar, invitación, etc.). */
export const VERTIAL_BUSINESSES_CHANGED = 'vertial:businesses-changed';

export function notifyBusinessesChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(VERTIAL_BUSINESSES_CHANGED));
}
