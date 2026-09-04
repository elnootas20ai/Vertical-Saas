import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApiBase } from '../../lib/apiBase';

type ViewState = 'loading' | 'preview' | 'confirming' | 'success' | 'error' | 'already';

interface PublicPromo {
  nombre: string;
  descripcion: string;
  tipo: string;
  descuento: number | null;
  estado: string;
  acceptedAt: string | null;
  expiresAt: string | null;
}

export function PromoAcceptPublic() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [promo, setPromo] = useState<PublicPromo | null>(null);
  const apiBase = getApiBase();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/public/client-promotions?token=${encodeURIComponent(token)}`);
      const data = await res.json().catch(() => ({} as { ok?: boolean; error?: string; promotion?: PublicPromo }));
      if (!res.ok || !data.ok || !data.promotion) {
        setErrorMsg(data.error || 'No se pudo cargar la promoción');
        setViewState('error');
        return;
      }
      setPromo(data.promotion);
      if (String(data.promotion.estado || '').toLowerCase() === 'aceptada') {
        setViewState('already');
      } else {
        setViewState('preview');
      }
    } catch {
      setErrorMsg('Error de conexión. Inténtalo de nuevo más tarde.');
      setViewState('error');
    }
  }, [apiBase, token]);

  useEffect(() => {
    if (!token) {
      setErrorMsg('Enlace inválido: falta el token.');
      setViewState('error');
      return;
    }
    void load();
  }, [token, load]);

  async function handleAccept() {
    setViewState('confirming');
    try {
      const res = await fetch(
        `${apiBase}/api/public/client-promotions/accept?token=${encodeURIComponent(token)}`,
        { method: 'POST' },
      );
      const data = await res.json().catch(() => ({} as { ok?: boolean; error?: string; alreadyProcessed?: boolean; promotion?: PublicPromo }));
      if (!res.ok && !data.alreadyProcessed) {
        setErrorMsg(data.error || 'No se pudo aceptar la promoción');
        setViewState('error');
        return;
      }
      if (data.promotion) setPromo((prev) => ({ ...(prev || {} as PublicPromo), ...data.promotion, estado: 'aceptada' }));
      setViewState(data.alreadyProcessed ? 'already' : 'success');
    } catch {
      setErrorMsg('Error de conexión. Inténtalo de nuevo más tarde.');
      setViewState('error');
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-zinc-950 px-6 py-5">
          <p className="text-white text-lg font-bold tracking-tight">Vertial</p>
          <p className="text-zinc-400 text-sm mt-0.5">Confirmación de promoción</p>
        </div>
        <div className="p-6">
          {viewState === 'loading' || viewState === 'confirming' ? (
            <p className="text-sm text-zinc-500 text-center py-8">
              {viewState === 'confirming' ? 'Confirmando…' : 'Cargando…'}
            </p>
          ) : null}

          {viewState === 'error' ? (
            <div className="space-y-3 text-center py-4">
              <p className="text-base font-semibold text-zinc-900">No se pudo continuar</p>
              <p className="text-sm text-zinc-500">{errorMsg}</p>
            </div>
          ) : null}

          {(viewState === 'preview' || viewState === 'success' || viewState === 'already') && promo ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-1">Promoción</p>
                <h1 className="text-xl font-bold text-zinc-900">{promo.nombre}</h1>
                {promo.descripcion ? (
                  <p className="text-sm text-zinc-500 mt-2">{promo.descripcion}</p>
                ) : null}
                {(promo.tipo || promo.descuento != null) ? (
                  <p className="text-sm text-zinc-600 mt-2 capitalize">
                    {promo.tipo}
                    {promo.descuento != null ? ` · ${promo.descuento}% dto.` : ''}
                  </p>
                ) : null}
              </div>

              {viewState === 'preview' ? (
                <>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    Al aceptar, confirmas que eres la persona a la que va dirigida esta promoción.
                    Sin tu aceptación no se puede usar en caja.
                  </p>
                  <button
                    type="button"
                    onClick={() => { void handleAccept(); }}
                    className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                  >
                    Aceptar promoción
                  </button>
                </>
              ) : null}

              {viewState === 'success' || viewState === 'already' ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                  <p className="text-sm font-semibold text-emerald-800">
                    {viewState === 'already' ? 'Ya habías aceptado esta promoción' : 'Promoción aceptada'}
                  </p>
                  <p className="text-xs text-emerald-700 mt-1">
                    Ya pueden aplicártela en el establecimiento.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default PromoAcceptPublic;
