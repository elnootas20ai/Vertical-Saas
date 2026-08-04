/**
 * Tokens visuales Vertial — una línea (logo + azul avance / rojo urgente).
 * Ver .cursor/rules/vertial-ui-leyes.mdc y vertial-saas-design.mdc.
 */

/** Avanzar: crear, guardar, continuar, confirmar OK */
export const VERTIAL_BTN_PRIMARY =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--v-blue,#2563eb)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1d4ed8] disabled:opacity-50 shadow-sm shadow-blue-600/20';

/** Retroceder: cancelar, volver, cerrar, secundario */
export const VERTIAL_BTN_SECONDARY =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-blue-50/60 hover:border-blue-200 hover:text-[var(--v-blue,#2563eb)] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-blue-950/40';

/** Peligro / urgente: borrar, anular, limpiar fuerte */
export const VERTIAL_BTN_DANGER =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--v-rose,#e11d48)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#be123c] disabled:opacity-50';

/** Acento marca (focus, chip activo, link) — azul avance del logo */
export const VERTIAL_ACCENT_TEXT = 'text-[var(--v-blue,#2563eb)] dark:text-blue-400';
export const VERTIAL_ACCENT_BG = 'bg-blue-50 dark:bg-blue-950/40';
export const VERTIAL_ACCENT_BORDER = 'border-blue-200 dark:border-blue-800';
export const VERTIAL_FOCUS_RING =
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

/** Superficie de panel / modal */
export const VERTIAL_SURFACE =
  'rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950';

/** Superficie stone (trabajador / ops móviles) */
export const VERTIAL_SURFACE_STONE =
  'rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900';

/** Cobros: mismo color siempre (efectivo / tarjeta) en todo el SaaS */
export const VERTIAL_CASH_TEXT =
  'text-emerald-700 dark:text-emerald-300';
export const VERTIAL_CASH_BG =
  'bg-emerald-50 dark:bg-emerald-950/30';
export const VERTIAL_CASH_BORDER =
  'border-emerald-200 dark:border-emerald-800';
export const VERTIAL_CARD_TEXT =
  'text-sky-700 dark:text-sky-300';
export const VERTIAL_CARD_BG =
  'bg-sky-50 dark:bg-sky-950/30';
export const VERTIAL_CARD_BORDER =
  'border-sky-200 dark:border-sky-800';
