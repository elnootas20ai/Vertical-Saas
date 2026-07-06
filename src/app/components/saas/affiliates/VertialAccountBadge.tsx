import { Clock, Link2, UserCheck } from 'lucide-react';
import type { Affiliate } from '../../../lib/affiliatesApi';

export function VertialAccountBadge({ affiliate }: { affiliate: Affiliate }) {
  if (affiliate.status !== 'accepted') return null;

  if (affiliate.accountLinked) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100"
        title={affiliate.vertialAccountName ? `Cuenta: ${affiliate.vertialAccountName}` : 'Enlazado con cuenta Vertial'}
      >
        <UserCheck className="w-3 h-3" />
        Cliente Vertial
      </span>
    );
  }

  if (affiliate.vertialAccountExists) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-100"
        title="Hay cuenta Vertial con este email pero aún no está enlazada al afiliado"
      >
        <Link2 className="w-3 h-3" />
        Cuenta sin enlazar
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200"
      title="El afiliado aún no tiene cuenta Vertial con este email"
    >
      <Clock className="w-3 h-3" />
      Sin cuenta Vertial
    </span>
  );
}
