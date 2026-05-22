/** Estilos compartidos formularios en Ajustes (Marca, Tienda, etc.). */
export const settingsInputClass =
  'w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-gray-400';

export const settingsLabelClass = 'mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-400';

export const settingsSearchInputClass =
  'w-full rounded-xl border-2 border-gray-200 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 outline-none transition-colors focus:border-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-gray-400 sm:w-52';

export const settingsFilterBtnClass = (active: boolean) =>
  `rounded-xl border-2 px-3 py-2 text-xs font-semibold transition-colors ${
    active
      ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
  }`;

export const settingsPrimaryBtnClass =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-gray-900 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white';

export const settingsDashedCtaClass =
  'w-full rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-3.5 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500';

export const settingsEmptyStateClass =
  'flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white py-16 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400';

export const settingsListCardClass = (opts?: { highlight?: boolean; inactive?: boolean; alert?: boolean }) => {
  const base = 'rounded-xl border-2 bg-white p-5 transition-all hover:shadow-md dark:bg-gray-800';
  if (opts?.alert) {
    return `${base} border-red-300 ring-1 ring-red-100 dark:border-red-800 dark:ring-red-900/40`;
  }
  if (opts?.highlight) {
    return `${base} border-indigo-300 ring-1 ring-indigo-100 dark:border-indigo-700 dark:ring-indigo-900/40`;
  }
  if (opts?.inactive) {
    return `${base} border-dashed border-gray-200 opacity-70 dark:border-gray-700`;
  }
  return `${base} border-gray-200 dark:border-gray-700`;
};

export const settingsChoiceCardClass = (selected: boolean) =>
  `rounded-xl border-2 p-3 text-left transition-all ${
    selected
      ? 'border-gray-900 bg-gray-50 shadow-sm dark:border-gray-100 dark:bg-gray-900/50'
      : 'border-gray-200 hover:border-gray-400 dark:border-gray-700'
  }`;

/** Tarjeta de elección con más aire (wizards amplios, p. ej. marca). */
export const settingsChoiceCardSpaciousClass = (selected: boolean) =>
  `rounded-2xl border-2 p-4 sm:p-5 text-left transition-all ${
    selected
      ? 'border-gray-900 bg-gray-50 shadow-md dark:border-gray-100 dark:bg-gray-900/50'
      : 'border-gray-200 hover:border-gray-400 hover:shadow-sm dark:border-gray-700'
  }`;

export const settingsWizardLeadClass =
  'text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed';

export const settingsWizardSectionClass = 'space-y-5 sm:space-y-6';

/** Paso compacto (p. ej. grid de presets) sin scroll interno. */
export const settingsWizardSectionCompactClass = 'space-y-3';

/** Zona donde se muestra el logo subido (capturas anchas o altas). */
export const settingsLogoPreviewBoxClass =
  'flex min-h-[10rem] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-white p-4 dark:border-gray-600 dark:bg-gray-800';

export const settingsLogoPreviewImgClass = 'max-h-36 max-w-full object-contain sm:max-h-44';

/** Grid de opciones (misma densidad que Tipo de centro en Tienda). */
export const settingsChoiceGridClass = 'grid grid-cols-2 gap-2 sm:grid-cols-3';

/** Fila seleccionable — misma línea que `SalesPointsTab` (tipo de centro). */
export function settingsChoiceRowClass(selected: boolean): string {
  return `flex w-full items-center gap-2.5 rounded-xl border-2 p-3 text-left text-sm transition-all ${
    selected
      ? 'border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-gray-700'
      : 'border-gray-200 hover:border-gray-400 dark:border-gray-700'
  }`;
}

/** Icono en caja suave (pastel), coherente con Ajustes → Tienda. */
export function settingsChoiceIconBoxClass(toneClass: string): string {
  return `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneClass}`;
}

/** Chip / pill seleccionable (tiendas, categorías, etc.). */
export const settingsChipChoiceClass = (selected: boolean) =>
  `inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-xs font-semibold transition-all ${
    selected
      ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }`;

export const settingsStatusPillClass = (active: boolean, disabled = false) =>
  `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
    disabled
      ? 'cursor-not-allowed bg-green-100 text-green-700 opacity-70 dark:bg-green-900/30 dark:text-green-400'
      : active
        ? 'cursor-pointer bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
        : 'cursor-pointer bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400'
  }`;

export const settingsKpiCardClass = (tone: 'indigo' | 'green' | 'amber' | 'violet') => {
  const tones = {
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-200',
    green: 'bg-green-50 border-green-200 text-green-900 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
    amber: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200',
    violet: 'bg-violet-50 border-violet-200 text-violet-900 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-200',
  };
  return `rounded-xl border-2 p-4 ${tones[tone]}`;
};

export type SettingsOwnershipKind = 'propiedad' | 'alquiler';

/** Tarjeta Propiedad / Alquiler: al elegir una, la otra queda apagada. */
export function settingsOwnershipChoiceClass(
  kind: SettingsOwnershipKind,
  selected: boolean,
  compact = false,
): string {
  const base = `relative flex w-full items-center rounded-xl border-2 text-left transition-all duration-200 active:scale-[0.98] focus-visible:outline-none ${
    compact ? 'gap-2 py-2.5 px-3' : 'gap-3 p-3.5'
  }`;
  if (!selected) {
    return `${base} border-gray-200 bg-gray-50 text-gray-500 opacity-55 hover:opacity-75 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-500`;
  }
  if (kind === 'propiedad') {
    return `${base} border-emerald-600 bg-emerald-100 text-emerald-950 shadow-lg ring-[3px] ring-emerald-500/50 focus-visible:ring-emerald-500 dark:border-emerald-400 dark:bg-emerald-950/70 dark:text-emerald-50`;
  }
  return `${base} border-orange-600 bg-orange-100 text-orange-950 shadow-lg ring-[3px] ring-orange-500/50 focus-visible:ring-orange-500 dark:border-orange-400 dark:bg-orange-950/70 dark:text-orange-50`;
}

/** Círculo tipo radio: vacío si no está elegido, relleno al hacer clic. */
export function settingsOwnershipRadioClass(kind: SettingsOwnershipKind, selected: boolean): string {
  const base = 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200';
  if (!selected) {
    return `${base} border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800`;
  }
  if (kind === 'propiedad') {
    return `${base} border-emerald-600 bg-emerald-600 dark:border-emerald-400 dark:bg-emerald-500`;
  }
  return `${base} border-orange-600 bg-orange-600 dark:border-orange-400 dark:bg-orange-500`;
}

export function settingsOwnershipIconClass(kind: SettingsOwnershipKind, selected: boolean): string {
  const base = 'flex shrink-0 items-center justify-center rounded-lg transition-colors';
  const size = 'h-9 w-9';
  if (!selected) {
    return `${base} ${size} bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400`;
  }
  if (kind === 'propiedad') {
    return `${base} ${size} bg-emerald-600 text-white shadow-sm dark:bg-emerald-500`;
  }
  return `${base} ${size} bg-orange-600 text-white shadow-sm dark:bg-orange-500`;
}
