/**
 * Entrada pública solo por QR de mesa (`/m/:token`).
 * Sin token válido no hay mesa. Si la web de pedir está activa → carta de esa tienda.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, QrCode, AlertCircle } from 'lucide-react';
import {
  getPublicMesaByTokenRequest,
  writeMesaQrLock,
  type PublicMesaPayload,
} from '../../lib/mesaQr';

export function MesaQrPublicPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mesa, setMesa] = useState<PublicMesaPayload | null>(null);

  useEffect(() => {
    const t = String(token || '').trim();
    if (!t) {
      setError('QR no válido');
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const payload = await getPublicMesaByTokenRequest(t);
        if (cancelled) return;
        setMesa(payload);
        writeMesaQrLock(payload);
        if (payload.webEnabled && payload.webSlug) {
          navigate(`/web/${encodeURIComponent(payload.webSlug)}`, { replace: true });
          return;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'QR no válido');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-stone-50 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
        <p className="text-sm text-stone-500">Abriendo mesa…</p>
      </div>
    );
  }

  if (error || !mesa) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-stone-50 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-rose-500" />
        <h1 className="text-lg font-semibold text-stone-900">No se pudo abrir la mesa</h1>
        <p className="max-w-sm text-sm text-stone-500">{error || 'QR no válido'}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-stone-50 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
        <QrCode className="h-7 w-7" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          {mesa.storeName || 'Vertial'}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-stone-900">{mesa.tableName}</h1>
        {mesa.zone ? <p className="mt-1 text-sm text-stone-500">{mesa.zone}</p> : null}
      </div>
      <p className="max-w-sm text-sm text-stone-600">
        La mesa está lista. Activa la <strong>Web de pedir</strong> en Vertial para que el cliente
        vea la carta al escanear.
      </p>
    </div>
  );
}
