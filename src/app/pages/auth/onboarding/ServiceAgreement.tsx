import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Download, Eraser, FileSignature, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../../components/design-system/ACCESO__Input';
import {
  OnboardingContentCard,
  OnboardingStepHeading,
  OnboardingStepShell,
} from '../../../components/auth/onboarding/OnboardingStepShell';
import { useOnboarding } from '../../../context/OnboardingContext';
import { useOnboardingStepGate } from '../../../hooks/useOnboardingStepGate';
import { useAuth } from '../../../context/AuthContext';
import {
  VERTIAL_SERVICE_AGREEMENT_VERSION,
  buildServiceAgreementClauses,
  buildServiceAgreementParty,
  formatAgreementDateEs,
  type SignedServiceAgreement,
} from '../../../lib/vertialServiceAgreement';
import {
  downloadSignedServiceAgreementPdf,
  downloadVertialServiceAgreementPdf,
} from '../../../lib/vertialServiceAgreementPdf';

const STEP_INDEX = 6;

export function ServiceAgreement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, updateData, advanceStep } = useOnboarding();
  useOnboardingStepGate(STEP_INDEX);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStroke, setHasStroke] = useState(Boolean(data.serviceAgreement?.signatureDataUrl));
  const [signerName, setSignerName] = useState(
    () =>
      data.serviceAgreement?.signerName
      || data.paymentDetails.cardHolderName
      || user?.fullName
      || '',
  );
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  const party = useMemo(
    () =>
      buildServiceAgreementParty({
        companyProfile: data.companyProfile,
        businessType: data.businessType,
        planId: data.subscriptionSelection.recommendedPlanId,
        billingMode: data.subscriptionSelection.billingMode,
        signerName,
        signerEmail: user?.email || data.companyProfile.companyEmail,
      }),
    [data.companyProfile, data.businessType, data.subscriptionSelection, signerName, user?.email],
  );

  const clauses = useMemo(() => buildServiceAgreementClauses(party), [party]);

  const paintBlankCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = Math.min(640, parent?.clientWidth || 480);
    const h = 160;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const loadSignatureImage = useCallback((dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas || !dataUrl) return;
    paintBlankCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      const w = canvas.clientWidth || 480;
      const h = canvas.clientHeight || 160;
      ctx.drawImage(img, 0, 0, w, h);
      setHasStroke(true);
    };
    img.src = dataUrl;
  }, [paintBlankCanvas]);

  useEffect(() => {
    paintBlankCanvas();
    const existing = data.serviceAgreement?.signatureDataUrl;
    if (existing) loadSignatureImage(existing);
    // Solo al montar / cambiar de firma guardada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const moveDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  };

  const endDraw = () => {
    drawing.current = false;
  };

  const clearSignature = () => {
    setHasStroke(false);
    paintBlankCanvas();
  };

  const buildSignedPayload = (): SignedServiceAgreement | null => {
    const name = signerName.trim();
    if (!name || !hasStroke || !canvasRef.current) return null;
    return {
      version: VERTIAL_SERVICE_AGREEMENT_VERSION,
      signedAt: data.serviceAgreement?.signedAt || new Date().toISOString(),
      party: { ...party, signerName: name },
      clauses,
      signatureDataUrl: canvasRef.current.toDataURL('image/png'),
      signerName: name,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };
  };

  const handleDownloadPdf = () => {
    setPdfBusy(true);
    try {
      const signed = hasStroke && signerName.trim() ? buildSignedPayload() : null;
      if (signed) {
        downloadSignedServiceAgreementPdf(signed);
      } else {
        downloadVertialServiceAgreementPdf({
          party: { ...party, signerName: signerName.trim() },
          clauses,
          version: VERTIAL_SERVICE_AGREEMENT_VERSION,
          signerName: signerName.trim() || undefined,
        });
      }
      toast.success('PDF descargado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar el PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  const handleBack = () => {
    navigate('/auth/onboarding/payment-info');
  };

  const handleContinue = () => {
    setError('');
    const name = signerName.trim();
    if (!name) {
      setError('Indica el nombre de quien firma');
      return;
    }
    if (!hasStroke || !canvasRef.current) {
      setError('Firma en el recuadro para continuar');
      return;
    }
    const signed = buildSignedPayload();
    if (!signed) {
      setError('No se pudo capturar la firma');
      return;
    }
    updateData('serviceAgreement', signed);
    try {
      downloadSignedServiceAgreementPdf(signed);
    } catch {
      /* no bloquear el alta si falla la descarga */
    }
    advanceStep(STEP_INDEX);
    navigate('/auth/onboarding/confirmation');
  };

  return (
    <OnboardingStepShell
      stepIndex={STEP_INDEX}
      maxWidth="max-w-3xl"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
          <ACCESO__Button type="button" onClick={handleBack} variant="outline">
            ← Atrás
          </ACCESO__Button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <ACCESO__Button
              type="button"
              onClick={handleDownloadPdf}
              variant="outline"
              disabled={pdfBusy}
            >
              <Download className="h-4 w-4" />
              Descargar PDF
            </ACCESO__Button>
            <ACCESO__Button type="button" onClick={handleContinue} variant="primary">
              Firmar y continuar →
            </ACCESO__Button>
          </div>
        </div>
      }
    >
      <OnboardingStepHeading
        title="Contrato de servicio Vertial"
        subtitle="Revisa el contrato con los datos de tu empresa y fírmalo para activar la cuenta."
        stepLabel={`Paso ${STEP_INDEX + 1}`}
      />

      <OnboardingContentCard>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 dark:border-blue-900/40 dark:bg-blue-950/30">
            <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-[var(--v-blue,#2563eb)]" />
            <div className="min-w-0 text-xs leading-relaxed text-stone-700 dark:text-stone-300">
              <p className="font-semibold text-stone-900 dark:text-stone-100">
                Versión {VERTIAL_SERVICE_AGREEMENT_VERSION}
              </p>
              <p className="mt-0.5">
                Fecha: {formatAgreementDateEs()} · Puedes descargar el PDF ahora (borrador) o al
                firmar (con firma).
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-700 dark:bg-stone-950/40">
            <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400 mb-2">
              Datos del cliente (automáticos)
            </p>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] text-stone-400">Razón social</dt>
                <dd className="font-semibold text-stone-900 dark:text-stone-100">
                  {party.legalName || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-stone-400">Nombre comercial</dt>
                <dd className="font-semibold text-stone-900 dark:text-stone-100">
                  {party.tradeName || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-stone-400">NIF/CIF</dt>
                <dd className="font-mono font-semibold text-stone-900 dark:text-stone-100">
                  {party.taxId || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-stone-400">Email</dt>
                <dd className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                  {party.email || '—'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] text-stone-400">Domicilio</dt>
                <dd className="font-semibold text-stone-900 dark:text-stone-100">
                  {[party.address, party.city, party.province].filter(Boolean).join(', ') || '—'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="max-h-[38vh] overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-700 p-3 sm:p-4 space-y-3 scrollbar-visible">
            {clauses.map((c) => (
              <article key={c.id}>
                <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">{c.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                  {c.body}
                </p>
              </article>
            ))}
          </div>

          <div className="space-y-2">
            <ACCESO__Input
              label="Nombre completo del firmante *"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Nombre y apellidos"
            />
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300">
                  <PenLine className="h-3.5 w-3.5" />
                  Firma *
                </label>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Borrar
                </button>
              </div>
              <div className="rounded-xl border-2 border-dashed border-stone-300 bg-white dark:border-stone-600 dark:bg-stone-950 touch-none">
                <canvas
                  ref={canvasRef}
                  className="block w-full cursor-crosshair rounded-xl"
                  onMouseDown={startDraw}
                  onMouseMove={moveDraw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={moveDraw}
                  onTouchEnd={endDraw}
                />
              </div>
              <p className="mt-1 text-[11px] text-stone-500">
                Firma con el dedo o el ratón. Al continuar se descarga el PDF firmado.
              </p>
            </div>
          </div>

          {error ? (
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
          ) : null}
        </div>
      </OnboardingContentCard>
    </OnboardingStepShell>
  );
}
