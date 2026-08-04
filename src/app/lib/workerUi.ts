/**
 * Piel móvil del backoffice trabajador — misma Vertial (stone + azul avance).
 * Usar en páginas /saas/worker/* (no TPV a pantalla completa).
 */

/** Contenedor de página: estrecho en móvil, cómodo en desktop. */
export const WORKER_PAGE =
  'mx-auto w-full max-w-lg space-y-4 pb-2 sm:max-w-2xl sm:space-y-5 lg:max-w-4xl';

/** Página ancha (calendario / fichaje con 2 cols en lg). */
export const WORKER_PAGE_WIDE =
  'mx-auto w-full max-w-lg space-y-4 pb-2 sm:max-w-3xl sm:space-y-5 lg:max-w-6xl';

/** Card / panel */
export const WORKER_CARD =
  'rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900';

export const WORKER_CARD_PAD = `${WORKER_CARD} p-4`;

/** Título de sección dentro de página */
export const WORKER_SECTION_TITLE =
  'text-sm font-semibold text-stone-900 dark:text-stone-100';

/** Texto de apoyo */
export const WORKER_MUTED = 'text-xs text-stone-500 dark:text-stone-400';

/** Input táctil */
export const WORKER_INPUT =
  'w-full min-h-11 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500';

/** Pills de filtro horizontales (scroll en móvil) */
export const WORKER_FILTER_ROW =
  'flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const WORKER_FILTER_PILL =
  'shrink-0 inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors';

export const WORKER_FILTER_PILL_ON =
  'border-blue-500 bg-blue-50 text-[var(--v-blue,#2563eb)] dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-300';

export const WORKER_FILTER_PILL_OFF =
  'border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300';
