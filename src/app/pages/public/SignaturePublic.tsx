import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  PenLine, FileText, CheckCircle2, XCircle, AlertTriangle,
  Clock, Download, Loader2, Eraser, RotateCcw,
} from 'lucide-react';
import {
  viewSignaturePublic,
  acceptSignaturePublic,
  rejectSignaturePublic,
  type PublicSignatureView,
} from '../../lib/signatureApi';

type Step = 'loading' | 'view' | 'sign' | 'reject' | 'success' | 'rejected' | 'error' | 'already';

export function SignaturePublic() {
  const { token } = useParams<{ token: string }>();

  const [step, setStep] = useState<Step>('loading');
  const [data, setData] = useState<PublicSignatureView | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  useEffect(() => {
    if (!token) { setError('Token inválido'); setStep('error'); return; }
    viewSignaturePublic(token)
      .then((res) => {
        setData(res);
        if (res.signer.status === 'signed') setStep('already');
        else if (res.signer.status === 'rejected') setStep('already');
        else if (['completed', 'cancelled', 'expired'].includes(res.request.status)) setStep('already');
        else setStep('view');
      })
      .catch((err: Error) => { setError(err.message); setStep('error'); });
  }, [token]);

  // Canvas drawing
  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawingRef.current = true;
    hasDrawnRef.current = true;
    const pos = getPos(e);
    if (!pos) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    if (!pos) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [getPos]);

  const endDraw = useCallback(() => { isDrawingRef.current = false; }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
  }, []);

  const handleAccept = async () => {
    if (!token || !hasDrawnRef.current) return;
    setSubmitting(true);
    try {
      const signatureImageData = canvasRef.current?.toDataURL('image/png');
      await acceptSignaturePublic(token, signatureImageData);
      setStep('success');
    } catch (err: unknown) {
      setError((err as Error).message);
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!token || !rejectReason.trim()) return;
    setSubmitting(true);
    try {
      await rejectSignaturePublic(token, rejectReason.trim());
      setStep('rejected');
    } catch (err: unknown) {
      setError((err as Error).message);
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-slate-200">
            <PenLine className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-slate-700">Firma Digital</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">

          {/* Loading */}
          {step === 'loading' && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
              <p className="text-sm text-slate-500">Cargando documento...</p>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <AlertTriangle className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">Error</h2>
              <p className="text-sm text-slate-500 max-w-xs">{error || 'No se pudo cargar el documento de firma.'}</p>
            </div>
          )}

          {/* Already processed */}
          {step === 'already' && data && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-7 h-7 text-slate-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 mb-2">
                {data.signer.status === 'signed' ? 'Documento ya firmado' : 'Solicitud ya procesada'}
              </h2>
              <p className="text-sm text-slate-500 max-w-xs">
                {data.signer.status === 'signed'
                  ? `Ya has firmado "${data.request.documentName}".`
                  : `Esta solicitud está en estado: ${data.request.status}.`}
              </p>
            </div>
          )}

          {/* View document */}
          {step === 'view' && data && (
            <div>
              <div className="px-6 pt-6 pb-4">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{data.request.documentName}</h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Enviado por <span className="font-medium text-slate-700">{data.request.createdByName}</span>
                    </p>
                  </div>
                </div>

                {data.request.message && (
                  <div className="bg-slate-50 rounded-xl p-3 mb-4 text-sm text-slate-600 italic">
                    "{data.request.message}"
                  </div>
                )}

                <div className="flex items-center gap-3 text-xs text-slate-400 mb-4">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Caduca: {new Date(data.request.expiresAt).toLocaleDateString('es-ES')}</span>
                </div>

                {data.request.sourceFileUrl && (
                  <a
                    href={data.request.sourceFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-sm font-medium text-slate-700 transition-colors mb-4"
                  >
                    <Download className="w-4 h-4 text-slate-400" />
                    Ver / descargar documento
                  </a>
                )}

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-400 mb-3">
                    Hola <span className="font-semibold text-slate-600">{data.signer.name || data.signer.email}</span>,
                    se te solicita que firmes este documento.
                  </p>
                </div>
              </div>

              <div className="px-6 pb-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('sign')}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  <PenLine className="w-4 h-4" />
                  Firmar documento
                </button>
                <button
                  type="button"
                  onClick={() => setStep('reject')}
                  className="px-4 py-3 border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 rounded-xl text-sm font-medium transition-colors"
                >
                  Rechazar
                </button>
              </div>
            </div>
          )}

          {/* Sign step */}
          {step === 'sign' && data && (
            <div className="px-6 py-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Dibuja tu firma</h2>
              <p className="text-xs text-slate-400 mb-4">
                Usa el dedo o el ratón para firmar dentro del recuadro.
              </p>

              <div className="relative rounded-xl border-2 border-dashed border-slate-200 bg-white mb-3 overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={420}
                  height={200}
                  className="w-full cursor-crosshair touch-none"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                />
                <div className="absolute bottom-2 left-0 right-0 flex justify-center pointer-events-none">
                  <div className="w-48 h-px bg-slate-200" />
                </div>
              </div>

              <div className="flex justify-end mb-4">
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  Limpiar
                </button>
              </div>

              <p className="text-[10px] text-slate-400 mb-4 leading-relaxed">
                Al hacer clic en "Confirmar firma", acepto que esta firma electrónica tiene la misma validez
                que una firma manuscrita y que he revisado el documento "{data.request.documentName}".
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('view')}
                  className="px-4 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={submitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-semibold transition-colors disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Firmando...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Confirmar firma</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Reject step */}
          {step === 'reject' && data && (
            <div className="px-6 py-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1">Rechazar firma</h2>
              <p className="text-xs text-slate-400 mb-4">
                Indica el motivo por el que rechazas firmar este documento.
              </p>

              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motivo del rechazo..."
                rows={3}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:border-red-400 focus:outline-none resize-none mb-4"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('view')}
                  className="px-4 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={!rejectReason.trim() || submitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-semibold transition-colors disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Rechazando...</>
                  ) : (
                    <><XCircle className="w-4 h-4" /> Confirmar rechazo</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Success */}
          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4 ring-4 ring-emerald-100">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">¡Documento firmado!</h2>
              <p className="text-sm text-slate-500 max-w-xs mb-1">
                Tu firma ha sido registrada correctamente.
              </p>
              <p className="text-xs text-slate-400">
                Puedes cerrar esta ventana de forma segura.
              </p>
            </div>
          )}

          {/* Rejected */}
          {step === 'rejected' && (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4 ring-4 ring-red-100">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Firma rechazada</h2>
              <p className="text-sm text-slate-500 max-w-xs mb-1">
                Has rechazado la firma del documento.
              </p>
              <p className="text-xs text-slate-400">
                Puedes cerrar esta ventana de forma segura.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-slate-400 mt-6">
          Firma digital verificada y segura
        </p>
      </div>
    </div>
  );
}
