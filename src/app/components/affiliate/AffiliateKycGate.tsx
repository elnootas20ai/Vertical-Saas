import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  FileUp,
  IdCard,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import {
  AFFILIATE_KYC_ACCEPT,
  AFFILIATE_KYC_DOC_KINDS,
  AFFILIATE_KYC_MAX_BYTES,
  formatKycFileSize,
  labelForKycDocKind,
  prepareAffiliateKycUploadFile,
  readFileAsDataUrl,
  type AffiliateKycDocKind,
  type AffiliateKycDocument,
} from '../../lib/affiliateKyc';
import { getDniOrNieError, validateDniOrNie } from '../../lib/dniCifValidator';

type DocUpload = {
  kind: AffiliateKycDocKind;
  file: File | null;
  previewName?: string;
  compressing?: boolean;
};

interface AffiliateKycGateProps {
  affiliateName: string;
  rejectionReason?: string;
  loading: boolean;
  error?: string;
  onSubmit: (payload: {
    dni: string;
    legalName: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
    iban: string;
    billingTaxId: string;
    documents: AffiliateKycDocument[];
  }) => void;
}

function normalizeIban(value: string) {
  return value.replace(/\s+/g, '').toUpperCase();
}

function isSpanishIban(value: string) {
  return /^ES\d{22}$/.test(normalizeIban(value));
}

export function AffiliateKycGate({
  affiliateName,
  rejectionReason,
  loading,
  error,
  onSubmit,
}: AffiliateKycGateProps) {
  const [form, setForm] = useState({
    dni: '',
    legalName: affiliateName || '',
    address: '',
    city: '',
    postalCode: '',
    country: 'España',
    iban: '',
    billingTaxId: '',
  });
  const [docs, setDocs] = useState<DocUpload[]>(
    AFFILIATE_KYC_DOC_KINDS.map((k) => ({ kind: k.value, file: null })),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState('');

  const setField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleFile = async (kind: AffiliateKycDocKind, file: File | null) => {
    setUploadError('');
    if (!file) {
      setDocs((prev) => prev.map((d) => (d.kind === kind ? { kind, file: null } : d)));
      return;
    }
    setDocs((prev) =>
      prev.map((d) => (d.kind === kind ? { kind, file: null, previewName: 'Comprimiendo foto…', compressing: true } : d)),
    );
    try {
      const prepared = await prepareAffiliateKycUploadFile(file);
      const label =
        prepared.size < file.size
          ? `${prepared.name} (${formatKycFileSize(prepared.size)}, comprimida)`
          : `${prepared.name} (${formatKycFileSize(prepared.size)})`;
      setDocs((prev) =>
        prev.map((d) => (d.kind === kind ? { kind, file: prepared, previewName: label } : d)),
      );
    } catch (err) {
      setDocs((prev) => prev.map((d) => (d.kind === kind ? { kind, file: null } : d)));
      setUploadError(err instanceof Error ? err.message : 'No se pudo procesar la foto');
    }
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!form.legalName.trim()) errors.legalName = 'Obligatorio';
    if (!form.dni.trim()) errors.dni = 'Obligatorio';
    else if (!validateDniOrNie(form.dni)) errors.dni = getDniOrNieError(form.dni) || 'DNI/NIE no válido';
    if (!form.address.trim()) errors.address = 'Obligatorio';
    if (!form.city.trim()) errors.city = 'Obligatorio';
    if (!form.postalCode.trim()) errors.postalCode = 'Obligatorio';
    if (!form.iban.trim()) errors.iban = 'Obligatorio';
    else if (!isSpanishIban(form.iban)) errors.iban = 'IBAN español no válido (ES + 22 dígitos)';

    for (const spec of AFFILIATE_KYC_DOC_KINDS) {
      const uploaded = docs.find((d) => d.kind === spec.value);
      if (!uploaded?.file) errors[`doc_${spec.value}`] = 'Sube este documento';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const docsReady = useMemo(
    () => AFFILIATE_KYC_DOC_KINDS.every((k) => docs.some((d) => d.kind === k.value && d.file)),
    [docs],
  );

  const handleSubmit = async () => {
    if (!validate()) return;
    setUploadError('');

    try {
      const documents: AffiliateKycDocument[] = [];
      for (const entry of docs) {
        if (!entry.file) continue;
        const dataUrl = await readFileAsDataUrl(entry.file);
        documents.push({
          id: `kyc-${entry.kind}-${Date.now()}`,
          kind: entry.kind,
          fileName: entry.file.name,
          mimeType: entry.file.type || 'application/octet-stream',
          size: entry.file.size,
          uploadedAt: new Date().toISOString(),
          dataUrl,
        });
      }

      onSubmit({
        dni: form.dni.trim().toUpperCase(),
        legalName: form.legalName.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        postalCode: form.postalCode.trim(),
        country: form.country.trim() || 'España',
        iban: normalizeIban(form.iban),
        billingTaxId: form.billingTaxId.trim().toUpperCase(),
        documents,
      });
    } catch {
      setUploadError('No se pudieron leer los archivos. Inténtalo de nuevo.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-blue-950 text-white">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <IdCard className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-200/80">Paso 1 · Verificación</p>
              <h1 className="text-xl font-black mt-1">Verifica tu identidad</h1>
              <p className="text-sm text-blue-100/80 mt-1">
                Hola, {affiliateName}. Antes de usar el panel necesitamos confirmar tu identidad y datos de cobro.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {rejectionReason && (
            <div className="flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Verificación rechazada</p>
                <p className="mt-1 text-amber-900/90">{rejectionReason}</p>
                <p className="mt-1 text-xs">Corrige los datos y vuelve a enviar la documentación.</p>
              </div>
            </div>
          )}

          <p className="text-sm text-slate-600 leading-relaxed">
            Sube tu DNI o NIE (anverso y reverso) y completa tus datos fiscales. Revisamos la documentación en un plazo habitual de 24–48 h.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { key: 'legalName' as const, label: 'Nombre legal completo *', placeholder: 'Como figura en el DNI' },
              { key: 'dni' as const, label: 'DNI / NIE *', placeholder: '12345678Z' },
              { key: 'address' as const, label: 'Dirección *', placeholder: 'Calle, número, piso' },
              { key: 'city' as const, label: 'Ciudad *', placeholder: 'Zaragoza' },
              { key: 'postalCode' as const, label: 'Código postal *', placeholder: '50001' },
              { key: 'country' as const, label: 'País', placeholder: 'España' },
              { key: 'iban' as const, label: 'IBAN para cobros *', placeholder: 'ES00 0000 0000 0000 0000 0000' },
              { key: 'billingTaxId' as const, label: 'CIF (si facturas como empresa)', placeholder: 'Opcional' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className={key === 'address' ? 'sm:col-span-2' : ''}>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
                <input
                  value={form[key]}
                  onChange={(e) => setField(key, e.target.value)}
                  placeholder={placeholder}
                  className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    fieldErrors[key] ? 'border-red-400 bg-red-50' : 'border-slate-200'
                  }`}
                />
                {fieldErrors[key] && <p className="text-xs text-red-600 mt-1">{fieldErrors[key]}</p>}
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Documentos</p>
            {AFFILIATE_KYC_DOC_KINDS.map((spec) => {
              const entry = docs.find((d) => d.kind === spec.value);
              const err = fieldErrors[`doc_${spec.value}`];
              return (
                <div
                  key={spec.value}
                  className={`rounded-xl border p-4 ${err ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-slate-50/50'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{spec.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {spec.hint} · Las fotos grandes se comprimen solas (límite {formatKycFileSize(AFFILIATE_KYC_MAX_BYTES)})
                      </p>
                    </div>
                    {entry?.file ? (
                      <button
                        type="button"
                        onClick={() => void handleFile(spec.value, null)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg"
                        title="Quitar archivo"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                  <label className="mt-3 flex items-center justify-center gap-2 w-full py-3 border border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-white transition-colors">
                    <input
                      type="file"
                      accept={AFFILIATE_KYC_ACCEPT}
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        void handleFile(spec.value, file);
                        e.target.value = '';
                      }}
                    />
                    {entry?.compressing ? (
                      <>
                        <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        <span className="text-sm font-medium text-blue-700">Comprimiendo foto…</span>
                      </>
                    ) : entry?.file ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm font-medium text-emerald-700">{entry.previewName}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-600">Seleccionar archivo</span>
                      </>
                    )}
                  </label>
                  {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
                </div>
              );
            })}
          </div>

          {(uploadError || error) && (
            <p className="text-sm text-red-600 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {uploadError || error}
            </p>
          )}
        </div>

        <div className="px-6 py-5 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            disabled={loading || !docsReady}
            onClick={() => void handleSubmit()}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            {loading ? 'Enviando verificación…' : 'Enviar documentación'}
          </button>
          <p className="text-[11px] text-slate-500 text-center mt-3 leading-relaxed">
            Tus datos se tratan de forma confidencial conforme al RGPD y solo para gestionar el programa de afiliados y los pagos.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AffiliateKycPendingGate({
  affiliateName,
  submittedAt,
  rejectionReason,
}: {
  affiliateName: string;
  submittedAt?: string;
  rejectionReason?: string;
}) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-5">
          <FileUp className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-xl font-black text-slate-900 mb-2">Verificación en revisión</h1>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          Gracias, {affiliateName}. Hemos recibido tu DNI y datos fiscales. Nuestro equipo los está revisando.
        </p>
        {submittedAt && (
          <p className="text-xs text-slate-400 mb-6">
            Enviado el {new Date(submittedAt).toLocaleString('es-ES')}
          </p>
        )}
        <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-900">
          Te avisaremos por email cuando esté aprobada. Después podrás firmar el contrato y acceder al panel completo.
        </div>
        {rejectionReason ? (
          <p className="text-xs text-amber-700 mt-4">{rejectionReason}</p>
        ) : null}
      </div>
    </div>
  );
}
