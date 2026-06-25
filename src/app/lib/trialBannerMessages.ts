function formatTrialEndDate(date: Date): string {
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

export interface TrialBannerContent {
  title: string;
  detail: string;
  ctaLabel: string;
}

export function getTrialActiveBannerContent(options: {
  daysLeft: number;
  trialEndsAt?: Date;
  hasSavedCard: boolean;
  cardLastFour?: string;
  hasMoneiSubscription: boolean;
}): TrialBannerContent {
  const { daysLeft, trialEndsAt, hasSavedCard, cardLastFour, hasMoneiSubscription } = options;
  const dayWord = daysLeft === 1 ? 'día' : 'días';
  const title = `Prueba gratuita · ${daysLeft} ${dayWord} restantes`;
  const endHint = trialEndsAt ? ` (hasta el ${formatTrialEndDate(trialEndsAt)})` : '';

  if (hasMoneiSubscription) {
    return {
      title,
      detail: `Suscripción en periodo de prueba${endHint}. El primer cobro será automático al finalizar la prueba.`,
      ctaLabel: 'Ver facturación',
    };
  }

  if (hasSavedCard) {
    const cardHint = cardLastFour ? `Tarjeta ····${cardLastFour} guardada. ` : 'Tarjeta guardada. ';
    return {
      title,
      detail: `${cardHint}Sin cargo hasta que termine la prueba${endHint}.`,
      ctaLabel: 'Ver facturación',
    };
  }

  return {
    title,
    detail: `Acceso completo durante la prueba${endHint}. Añade un método de pago antes de que termine.`,
    ctaLabel: 'Configurar pago',
  };
}

export function getTrialExpiringBannerContent(options: {
  daysLeft: number;
  hasSavedCard: boolean;
  cardLastFour?: string;
  hasMoneiSubscription: boolean;
}): TrialBannerContent {
  const { daysLeft, hasSavedCard, cardLastFour, hasMoneiSubscription } = options;
  const dayWord = daysLeft === 1 ? 'día' : 'días';
  const title = `Tu prueba termina en ${daysLeft} ${dayWord}`;

  if (hasMoneiSubscription) {
    return {
      title,
      detail: 'El cobro del plan se realizará automáticamente al finalizar la prueba.',
      ctaLabel: 'Ver facturación',
    };
  }

  if (hasSavedCard) {
    const cardHint = cardLastFour ? `Tarjeta ····${cardLastFour} registrada. ` : 'Tarjeta registrada. ';
    return {
      title,
      detail: `${cardHint}Revisa facturación si quieres cambiar plan o método de pago.`,
      ctaLabel: 'Ver facturación',
    };
  }

  return {
    title,
    detail: 'Añade un método de pago para no perder el acceso al terminar la prueba.',
    ctaLabel: 'Configurar pago',
  };
}
