/** Estilos compartidos formularios en Ajustes (Marca, Tienda, etc.). */
export const settingsInputClass =
  'w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-gray-400';

export const settingsLabelClass = 'mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-400';

export const settingsChoiceCardClass = (selected: boolean) =>
  `rounded-xl border-2 p-3 text-left transition-all ${
    selected
      ? 'border-gray-900 bg-gray-50 shadow-sm dark:border-gray-100 dark:bg-gray-900/50'
      : 'border-gray-200 hover:border-gray-400 dark:border-gray-700'
  }`;
