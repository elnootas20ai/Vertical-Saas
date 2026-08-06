export function minutesBetweenIso(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null;

export function estimateAssemblyMinutes(order: {
  assemblyStartedAt?: string;
  assemblyCompletedAt?: string;
  createdAt?: string;
} | null | undefined): number | null;

export function estimateOneWayDeliveryMinutes(order: {
  deliveryType?: string;
  departedAt?: string;
  assemblyCompletedAt?: string;
  deliveredAt?: string;
} | null | undefined): number | null;
