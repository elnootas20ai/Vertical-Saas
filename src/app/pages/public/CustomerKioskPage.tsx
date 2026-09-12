import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { getPublicCustomerKiosk } from '../../lib/webApi';
import { writeCustomerKioskLock } from '../../lib/customerKiosk';

export function CustomerKioskPage() {
  const { deviceToken } = useParams<{ deviceToken: string }>();
  const [destination, setDestination] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = String(deviceToken || '').trim();
    if (!token) {
      setError('Tablet no válida');
      return;
    }
    let active = true;
    void getPublicCustomerKiosk(token)
      .then((response) => {
        if (!active) return;
        writeCustomerKioskLock(response.kiosk);
        setDestination(
          `/web/${encodeURIComponent(response.kiosk.webSlug)}?kioskToken=${encodeURIComponent(token)}`,
        );
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Tablet no disponible');
      });
    return () => {
      active = false;
    };
  }, [deviceToken]);

  if (destination) return <Navigate to={destination} replace />;
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 p-6 text-center">
      {error ? (
        <div>
          <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-3 text-lg font-semibold text-stone-900">Tablet no disponible</h1>
          <p className="mt-1 text-sm text-stone-500">{error}</p>
        </div>
      ) : (
        <div>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-3 text-sm text-stone-500">Preparando autoservicio…</p>
        </div>
      )}
    </div>
  );
}
