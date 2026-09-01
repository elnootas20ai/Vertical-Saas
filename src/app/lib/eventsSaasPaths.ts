/** Segmentos fijos bajo `/saas/vertical/eventos/…` (nunca son un eventId). */
export const EVENTS_SAAS_STATIC_SEGMENTS = [
  'nueva-contratacion',
  'tpv',
  'operar',
  'presupuestos',
  'ruta',
  'contrataciones',
] as const;

export type EventsSaasStaticSegment = (typeof EVENTS_SAAS_STATIC_SEGMENTS)[number];

export function isEventsSaasStaticSegment(value: string | null | undefined): boolean {
  const seg = String(value || '').trim();
  return (EVENTS_SAAS_STATIC_SEGMENTS as readonly string[]).includes(seg);
}

/** Path canónico de un segmento estático de eventos. */
export function eventsSaasStaticPath(segment: EventsSaasStaticSegment): string {
  return `/saas/vertical/eventos/${segment}`;
}
