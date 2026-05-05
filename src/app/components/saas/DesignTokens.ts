// ─── Sistema de tokens de diseño compartido para Vertial ───────────────────
// Úsalo en todos los módulos para garantizar coherencia visual

// ── Venta / Fase ─────────────────────────────────────────────────────────────

export type SaleStage = 'interested' | 'reserved' | 'documentation' | 'sold' | 'delivered';

export const SALE_STAGE_TOKEN: Record<SaleStage, {
  label: string;
  dot: string;
  badgeBg: string; badgeText: string;
  accentBorder: string;
  activeBg: string;
  progressBar: string;
  headerBg: string; headerText: string;
  countBg: string; countText: string;
}> = {
  interested:    { label: 'Interesado',     dot: 'bg-slate-400',   badgeBg: 'bg-slate-100',   badgeText: 'text-slate-600',  accentBorder: 'border-l-slate-400',   activeBg: 'bg-slate-500',   progressBar: 'bg-slate-400',   headerBg: 'bg-slate-50',   headerText: 'text-slate-700',  countBg: 'bg-slate-200',  countText: 'text-slate-700' },
  reserved:      { label: 'Reserva',        dot: 'bg-blue-500',    badgeBg: 'bg-blue-50',     badgeText: 'text-blue-700',   accentBorder: 'border-l-blue-500',    activeBg: 'bg-blue-500',    progressBar: 'bg-blue-500',    headerBg: 'bg-blue-50',    headerText: 'text-blue-700',   countBg: 'bg-blue-100',   countText: 'text-blue-700' },
  documentation: { label: 'Documentación',  dot: 'bg-amber-500',   badgeBg: 'bg-amber-50',    badgeText: 'text-amber-700',  accentBorder: 'border-l-amber-500',   activeBg: 'bg-amber-500',   progressBar: 'bg-amber-500',   headerBg: 'bg-amber-50',   headerText: 'text-amber-700',  countBg: 'bg-amber-100',  countText: 'text-amber-700' },
  sold:          { label: 'Vendido',         dot: 'bg-violet-500',  badgeBg: 'bg-violet-50',   badgeText: 'text-violet-700', accentBorder: 'border-l-violet-500',  activeBg: 'bg-violet-500',  progressBar: 'bg-violet-500',  headerBg: 'bg-violet-50',  headerText: 'text-violet-700', countBg: 'bg-violet-100', countText: 'text-violet-700' },
  delivered:     { label: 'Entregado',       dot: 'bg-emerald-500', badgeBg: 'bg-emerald-50',  badgeText: 'text-emerald-700',accentBorder: 'border-l-emerald-500', activeBg: 'bg-emerald-500', progressBar: 'bg-emerald-500', headerBg: 'bg-emerald-50', headerText: 'text-emerald-700',countBg: 'bg-emerald-100',countText: 'text-emerald-700' },
};

// ── Vehículo / Estado ─────────────────────────────────────────────────────────

export type VehicleStatus = 'entrada' | 'preparacion' | 'listo' | 'reservado' | 'vendido';

export const VEHICLE_STATUS_TOKEN: Record<VehicleStatus, {
  label: string;
  dot: string;
  badgeBg: string; badgeText: string;
  accentBorder: string;
}> = {
  entrada:     { label: 'Entrada',           dot: 'bg-blue-500',    badgeBg: 'bg-blue-50',     badgeText: 'text-blue-700',    accentBorder: 'border-l-blue-500' },
  preparacion: { label: 'En preparación',    dot: 'bg-amber-500',   badgeBg: 'bg-amber-50',    badgeText: 'text-amber-700',   accentBorder: 'border-l-amber-500' },
  listo:       { label: 'Listo para vender', dot: 'bg-emerald-500', badgeBg: 'bg-emerald-50',  badgeText: 'text-emerald-700', accentBorder: 'border-l-emerald-500' },
  reservado:   { label: 'Reservado',         dot: 'bg-violet-500',  badgeBg: 'bg-violet-50',   badgeText: 'text-violet-700',  accentBorder: 'border-l-violet-500' },
  vendido:     { label: 'Vendido',           dot: 'bg-slate-400',   badgeBg: 'bg-slate-100',   badgeText: 'text-slate-600',   accentBorder: 'border-l-slate-400' },
};

export const VEHICLE_IN_STOCK_STATUSES: VehicleStatus[] = ['entrada', 'preparacion', 'listo'];

// ── Vehículo / Estado Comercial ──────────────────────────────────────────────

export type CommercialStatusKey = 'preparation' | 'ready' | 'published' | 'reserved' | 'sold';

export const COMMERCIAL_STATUS_TOKEN: Record<CommercialStatusKey, {
  label: string;
  dot: string;
  badgeBg: string; badgeText: string;
  accentBorder: string;
}> = {
  preparation: { label: 'En preparación',    dot: 'bg-amber-500',   badgeBg: 'bg-amber-50',    badgeText: 'text-amber-700',    accentBorder: 'border-l-amber-500' },
  ready:       { label: 'Listo para vender', dot: 'bg-blue-500',    badgeBg: 'bg-blue-50',     badgeText: 'text-blue-700',     accentBorder: 'border-l-blue-500' },
  published:   { label: 'Publicado',         dot: 'bg-emerald-500', badgeBg: 'bg-emerald-50',  badgeText: 'text-emerald-700',  accentBorder: 'border-l-emerald-500' },
  reserved:    { label: 'Reservado',         dot: 'bg-violet-500',  badgeBg: 'bg-violet-50',   badgeText: 'text-violet-700',   accentBorder: 'border-l-violet-500' },
  sold:        { label: 'Vendido',           dot: 'bg-slate-400',   badgeBg: 'bg-slate-100',   badgeText: 'text-slate-600',    accentBorder: 'border-l-slate-400' },
};

export const COMMERCIAL_IN_STOCK_STATUSES: CommercialStatusKey[] = ['preparation', 'ready', 'published'];

// ── Lead / Estado ─────────────────────────────────────────────────────────────

export type LeadStatus = 'new' | 'contacted' | 'appointment' | 'negotiation' | 'won' | 'lost';

export const LEAD_STATUS_TOKEN: Record<LeadStatus, {
  label: string;
  dot: string;
  badgeBg: string; badgeText: string;
  accentBorder: string;
}> = {
  new:         { label: 'Nuevo',        dot: 'bg-sky-500',     badgeBg: 'bg-sky-50',      badgeText: 'text-sky-700',     accentBorder: 'border-l-sky-400' },
  contacted:   { label: 'Contactado',   dot: 'bg-blue-500',    badgeBg: 'bg-blue-50',     badgeText: 'text-blue-700',    accentBorder: 'border-l-blue-500' },
  appointment: { label: 'Cita',         dot: 'bg-amber-500',   badgeBg: 'bg-amber-50',    badgeText: 'text-amber-700',   accentBorder: 'border-l-amber-500' },
  negotiation: { label: 'Negociación',  dot: 'bg-orange-500',  badgeBg: 'bg-orange-50',   badgeText: 'text-orange-700',  accentBorder: 'border-l-orange-500' },
  won:         { label: 'Ganado',       dot: 'bg-emerald-500', badgeBg: 'bg-emerald-50',  badgeText: 'text-emerald-700', accentBorder: 'border-l-emerald-500' },
  lost:        { label: 'Perdido',      dot: 'bg-slate-400',   badgeBg: 'bg-slate-100',   badgeText: 'text-slate-600',   accentBorder: 'border-l-slate-400' },
};

// ── Documento / Estado ────────────────────────────────────────────────────────

export type DocStatus = 'pending' | 'signed' | 'sent';

export const DOC_STATUS_TOKEN: Record<DocStatus, {
  label: string;
  dot: string;
  badgeBg: string; badgeText: string;
}> = {
  pending: { label: 'Pendiente', dot: 'bg-amber-500',   badgeBg: 'bg-amber-50',   badgeText: 'text-amber-700' },
  signed:  { label: 'Firmado',   dot: 'bg-emerald-500', badgeBg: 'bg-emerald-50', badgeText: 'text-emerald-700' },
  sent:    { label: 'Enviado',   dot: 'bg-blue-500',    badgeBg: 'bg-blue-50',    badgeText: 'text-blue-700' },
};

// ── Días en stock (color semáforo) ────────────────────────────────────────────

export function daysColor(days: number) {
  if (days <= 30) return 'text-emerald-600';
  if (days <= 60) return 'text-amber-600';
  if (days <= 90) return 'text-orange-500';
  return 'text-red-600';
}

export function daysBg(days: number) {
  if (days <= 30) return 'bg-emerald-50 text-emerald-700';
  if (days <= 60) return 'bg-amber-50 text-amber-700';
  if (days <= 90) return 'bg-orange-50 text-orange-700';
  return 'bg-red-50 text-red-700';
}
