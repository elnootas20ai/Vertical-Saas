import { isCompraventaBusinessType } from './compraventaSetup';
import { isDeliveryOpsBusinessType, isRestaurantBusinessType } from './deliveryOpsTypes';

export type PdvWizardVariant = 'delivery' | 'compraventa' | 'restaurant';

export type RetailLocationCopy = {
  previewFallback: string;
  createCta: string;
  quickAdd: string;
  quickAddDesc: string;
  firstCta: string;
  modalTitleNew: string;
  modalSaveCta: string;
  typeDesc: string;
  namePlaceholderSimple: string;
  namePlaceholderFull: string;
  missingBusiness: string;
  duplicateName: (name: string) => string;
  partialSaveWarning: string;
  orphanSingular: string;
  orphanPlural: (count: number) => string;
  selectBusinessHint: string;
  emptyWithBusiness: (businessName: string) => string;
  emptyNoBusiness: string;
  missingPdvEdit: string;
  syncWarning: string;
  settingsTabLabel: string;
};

/** Textos RRHH (invitar, fichajes, horarios) según vertical retail. */
export type HrLocationCopy = {
  inviteWorkCenterLabel: string;
  inviteWorkCentersLoading: string;
  inviteNoWorkCenters: string;
  inviteWorkCenterPlaceholder: string;
  workerStoreFallback: string;
  workerNoStoreTitle: string;
  workerNoStoreHint: string;
  scheduleCardSubtitle: string;
  clockinsFilterAllCenters: string;
  sedesEmptyHint: string;
};

export function resolvePdvWizardVariant(params: {
  businessType?: string | null;
  isDeliveryAccount?: boolean;
  hasDeliveryPdvs?: boolean;
}): PdvWizardVariant {
  const isCompraventa = isCompraventaBusinessType(params.businessType);
  const isOps = isDeliveryOpsBusinessType(params.businessType);
  const isDelivery =
    Boolean(params.isDeliveryAccount) || Boolean(params.hasDeliveryPdvs) || isOps;
  if (isCompraventa && !isDelivery) return 'compraventa';
  if (isRestaurantBusinessType(params.businessType)) return 'restaurant';
  return 'delivery';
}

const HR_COPY: Record<PdvWizardVariant, HrLocationCopy> = {
  compraventa: {
    inviteWorkCenterLabel: 'Exposición / PDV',
    inviteWorkCentersLoading: 'Cargando expositores…',
    inviteNoWorkCenters:
      'No hay expositores en esta empresa. Créalos en Ajustes → Tienda y vuelve aquí (se actualizan solos).',
    inviteWorkCenterPlaceholder: 'Selecciona exposición o PDV',
    workerStoreFallback: 'Tu exposición',
    workerNoStoreTitle: 'Sin exposición asignada',
    workerNoStoreHint:
      'Pide a tu gerente que te asigne un expositor en Equipo para ver el horario y fichar en el sitio correcto.',
    scheduleCardSubtitle: 'Horario del expositor',
    clockinsFilterAllCenters: 'Todos los expositores',
    sedesEmptyHint: 'Configura tus expositores en Ajustes → Tienda',
  },
  restaurant: {
    inviteWorkCenterLabel: 'Local / caja',
    inviteWorkCentersLoading: 'Cargando locales…',
    inviteNoWorkCenters:
      'No hay locales en este negocio. Créalos en Ajustes → Bar/restaurante y vuelve aquí (se actualizan solos).',
    inviteWorkCenterPlaceholder: 'Selecciona local o caja',
    workerStoreFallback: 'Tu local',
    workerNoStoreTitle: 'Sin local asignado',
    workerNoStoreHint:
      'Pide a tu gerente que te asigne un local en Equipo para ver el horario y fichar en el sitio correcto.',
    scheduleCardSubtitle: 'Horario del local',
    clockinsFilterAllCenters: 'Todos los locales',
    sedesEmptyHint: 'Configura tus locales en Ajustes → Bar/restaurante',
  },
  delivery: {
    inviteWorkCenterLabel: 'Centro de trabajo / PDV',
    inviteWorkCentersLoading: 'Cargando tiendas y centros…',
    inviteNoWorkCenters:
      'No hay tiendas en este negocio. Créalas en Ajustes → Tienda y vuelve aquí (se actualizan solas).',
    inviteWorkCenterPlaceholder: 'Selecciona centro de trabajo',
    workerStoreFallback: 'Tu tienda',
    workerNoStoreTitle: 'Sin tienda asignada',
    workerNoStoreHint:
      'Pide a tu gerente que te asigne una tienda en Equipo para ver el horario y fichar en el local correcto.',
    scheduleCardSubtitle: 'Horario de la tienda',
    clockinsFilterAllCenters: 'Todos los centros',
    sedesEmptyHint: 'Configura tus centros de trabajo en Ajustes → Tienda',
  },
};

export function getHrLocationCopy(businessType?: string | null): HrLocationCopy {
  const variant = resolvePdvWizardVariant({ businessType });
  return HR_COPY[variant];
}

export function getRetailLocationCopy(variant: PdvWizardVariant): RetailLocationCopy {
  if (variant === 'compraventa') {
    return {
      previewFallback: 'Tu exposición',
      createCta: 'Crear exposición / PDV',
      quickAdd: 'Nueva exposición / PDV',
      quickAddDesc: 'Formulario compacto + TPV de vehículos',
      firstCta: '+ Primera exposición / PDV',
      modalTitleNew: 'Nuevo expositor / PDV',
      modalSaveCta: 'Crear exposición / PDV',
      typeDesc: 'Exposición, concesionario',
      namePlaceholderSimple: 'Ej: Exposición Centro, Concesionario Norte...',
      namePlaceholderFull: 'Ej: Exposición Norte, Concesionario...',
      missingBusiness: 'Selecciona una empresa activa arriba antes de crear la exposición.',
      duplicateName: (name) =>
        `Ya existe un expositor «${name}» en esta empresa. Edítalo en lugar de crear otro.`,
      partialSaveWarning:
        'El expositor se guardó, pero falta el PDV de venta (dirección completa, mín. 5 caracteres). Edítalo y guarda de nuevo.',
      orphanSingular: 'un expositor',
      orphanPlural: (count) => `${count} expositores`,
      selectBusinessHint:
        'Los expositores y PDV se muestran por empresa. Elige tu compraventa en el selector superior.',
      emptyWithBusiness: (businessName) =>
        `No hay expositores en «${businessName}». Crea el primero con el botón de arriba.`,
      emptyNoBusiness: 'Selecciona una empresa arriba y crea tu primera exposición / PDV.',
      missingPdvEdit:
        'Falta el PDV de venta. Edita el expositor y guarda con dirección completa (mín. 5 caracteres).',
      syncWarning:
        'La exposición se ha cargado, pero el PDV no se pudo sincronizar. Revisa dirección y cuota de PDV.',
      settingsTabLabel: 'Tienda',
    };
  }

  if (variant === 'restaurant') {
    return {
      previewFallback: 'Tu bar/restaurante',
      createCta: 'Crear bar/restaurante / PDV',
      quickAdd: 'Nuevo bar/restaurante / PDV',
      quickAddDesc: 'Formulario compacto + TPV de caja',
      firstCta: '+ Primer bar/restaurante / PDV',
      modalTitleNew: 'Nuevo bar/restaurante / PDV',
      modalSaveCta: 'Crear bar/restaurante / PDV',
      typeDesc: 'Bar, restaurante, terraza',
      namePlaceholderSimple: 'Ej: Bar La Plaza, Restaurante Centro...',
      namePlaceholderFull: 'Ej: Bar La Plaza, Restaurante Gran Vía...',
      missingBusiness: 'Selecciona una empresa activa arriba antes de crear el bar/restaurante.',
      duplicateName: (name) =>
        `Ya existe un bar/restaurante «${name}» en esta empresa. Edítalo en lugar de crear otro.`,
      partialSaveWarning:
        'El bar/restaurante se guardó, pero falta el PDV de caja (dirección completa, mín. 5 caracteres). Aparece abajo: edítalo y guarda de nuevo.',
      orphanSingular: 'un bar/restaurante',
      orphanPlural: (count) => `${count} locales`,
      selectBusinessHint:
        'Los locales se muestran por empresa. Elige tu bar/restaurante en el selector superior.',
      emptyWithBusiness: (businessName) =>
        `No hay locales en «${businessName}». Crea el primero con el botón de arriba.`,
      emptyNoBusiness: 'Selecciona una empresa arriba y crea tu primer bar/restaurante / PDV.',
      missingPdvEdit:
        'Falta el PDV de caja. Edita el local y guarda con dirección completa (mín. 5 caracteres).',
      syncWarning:
        'El local se ha cargado, pero la caja (PDV) no se pudo sincronizar. Revisa dirección y cuota de PDV.',
      settingsTabLabel: 'Bar/restaurante',
    };
  }

  return {
    previewFallback: 'Tu tienda',
    createCta: 'Crear tienda / PDV',
    quickAdd: 'Nueva tienda / PDV',
    quickAddDesc: 'Formulario compacto + TPV de caja',
    firstCta: '+ Primera tienda / PDV',
    modalTitleNew: 'Nuevo punto de venta (PDV)',
    modalSaveCta: 'Crear tienda / PDV',
    typeDesc: 'Tiendas, locales',
    namePlaceholderSimple: 'Ej: Local Centro',
    namePlaceholderFull: 'Ej: Oficina Central, Tienda Gran Vía...',
    missingBusiness: 'Selecciona una empresa activa arriba antes de crear la tienda.',
    duplicateName: (name) =>
      `Ya existe una tienda «${name}» en esta empresa. Edítala en lugar de crear otra.`,
    partialSaveWarning:
      'La tienda se guardó, pero falta el PDV de caja (dirección completa, mín. 5 caracteres). Aparece abajo: edítala y guarda de nuevo.',
    orphanSingular: 'una tienda',
    orphanPlural: (count) => `${count} tiendas`,
    selectBusinessHint:
      'Las tiendas se muestran por empresa. Elige modomio, pizzas u otra en el selector superior.',
    emptyWithBusiness: (businessName) =>
      `No hay tiendas en «${businessName}». Si las creaste en otra empresa, cámbiala arriba en la barra.`,
    emptyNoBusiness: 'Selecciona una empresa arriba y crea la primera tienda.',
    missingPdvEdit:
      'Falta el PDV de caja. Edita la tienda y guarda con dirección completa (mín. 5 caracteres).',
    syncWarning:
      'La tienda se ha cargado, pero la caja (PDV) no se pudo sincronizar. Revisa dirección y cuota de PDV.',
    settingsTabLabel: 'Tienda',
  };
}
