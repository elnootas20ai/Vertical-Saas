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
  const title = `Periodo de activación · ${daysLeft} ${dayWord} restantes`;
  const endHint = trialEndsAt ? ` (hasta el ${formatTrialEndDate(trialEndsAt)})` : '';

  if (hasMoneiSubscription) {
    return {
      title,
      detail: `Suscripción en periodo de activación${endHint}. El primer cobro será automático al finalizar.`,
      ctaLabel: 'Ver Mi plan',
    };
  }

  if (hasSavedCard) {
    const cardHint = cardLastFour ? `Tarjeta ····${cardLastFour} guardada. ` : 'Tarjeta guardada. ';
    return {
      title,
      detail: `${cardHint}Sin cargo hasta que termine el periodo${endHint}.`,
      ctaLabel: 'Ver Mi plan',
    };
  }

  return {
    title,
    detail: `Acceso completo durante la activación${endHint}. Añade un método de pago antes de que termine.`,
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
  const title = `Tu periodo de activación termina en ${daysLeft} ${dayWord}`;

  if (hasMoneiSubscription) {
    return {
      title,
      detail: 'El cobro del plan se realizará automáticamente al finalizar.',
      ctaLabel: 'Ver Mi plan',
    };
  }

  if (hasSavedCard) {
    const cardHint = cardLastFour ? `Tarjeta ····${cardLastFour} registrada. ` : 'Tarjeta registrada. ';
    return {
      title,
      detail: `${cardHint}Revisa Mi plan si quieres cambiar plan o método de pago.`,
      ctaLabel: 'Ver Mi plan',
    };
  }

  return {
    title,
    detail: 'Añade un método de pago para no perder el acceso al terminar el periodo.',
    ctaLabel: 'Configurar pago',
  };
}
