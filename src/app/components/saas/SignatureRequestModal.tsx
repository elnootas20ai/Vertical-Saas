import { useState, useCallback, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../ui/dialog';
import {
  PenLine, Plus, X, GripVertical, Clock, Users, Mail,
  FileText, ChevronDown, Send, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import {
  createSignatureRequest,
  sendSignatureRequest,
  type CreateSignatureRequestData,
  type SignerRole,
  type EntityType,
} from '../../lib/signatureApi';

interface SignerInput {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: SignerRole;
  entityType: EntityType;
  entityId: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    name: string;
    fileUrl?: string;
    mimeType?: string;
    fileSize?: number;
    clientId?: string;
    clientName?: string;
  };
  prefilledSigners?: Array<{ name: string; email: string; entityType: EntityType; entityId: string }>;
  onSuccess?: () => void;
}

const ROLE_OPTIONS: { value: SignerRole; label: string }[] = [
  { value: 'signer', label: 'Firma' },
  { value: 'reviewer', label: 'Revisión' },
  { value: 'cc', label: 'Copia' },
];

function newSigner(prefill?: Partial<SignerInput>): SignerInput {
  return {
    id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: prefill?.name || '',
    email: prefill?.email || '',
    phone: '',
    role: 'signer',
    entityType: prefill?.entityType || 'external',
    entityId: prefill?.entityId || '',
  };
}

function getDefaultExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().split('T')[0];
}

export function SignatureRequestModal({ open, onOpenChange, document, prefilledSigners, onSuccess }: Props) {
  const { user } = useAuth();
  const userId = user?.user_id || '';

  const [signers, setSigners] = useState<SignerInput[]>(() => {
    if (prefilledSigners?.length) return prefilledSigners.map((s) => newSigner(s));
    if (document.clientName && document.clientId) {
      return [newSigner({ name: document.clientName, entityType: 'client', entityId: document.clientId })];
    }
    return [newSigner()];
  });
  const [signingOrder, setSigningOrder] = useState<'parallel' | 'sequential'>('parallel');
  const [expiresAt, setExpiresAt] = useState(getDefaultExpiry);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDays, setReminderDays] = useState(3);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const addSigner = useCallback(() => {
    setSigners((prev) => [...prev, newSigner()]);
  }, []);

  const removeSigner = useCallback((id: string) => {
    setSigners((prev) => prev.length > 1 ? prev.filter((s) => s.id !== id) : prev);
  }, []);

  const updateSigner = useCallback((id: string, field: keyof SignerInput, value: string) => {
    setSigners((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s));
  }, []);

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (signers.length === 0) errors.push('Añade al menos un firmante');
    const signersWithRole = signers.filter((s) => s.role === 'signer');
    if (signersWithRole.length === 0) errors.push('Necesitas al menos un firmante con rol "Firma"');
    const noEmail = signers.filter((s) => s.role !== 'cc' && !s.email.trim());
    if (noEmail.length > 0) errors.push('Todos los firmantes necesitan email');
    if (!expiresAt) errors.push('Establece una fecha límite');
    if (expiresAt && new Date(expiresAt) <= new Date()) errors.push('La fecha límite debe ser futura');
    return errors;
  }, [signers, expiresAt]);

  const handleSend = async () => {
    if (validation.length > 0 || !userId) return;
    setSending(true);
    try {
      const data: CreateSignatureRequestData = {
        documentId: document.id,
        documentName: document.name,
        signers: signers.map((s, i) => ({
          name: s.name.trim(),
          email: s.email.trim().toLowerCase(),
          phone: s.phone.trim(),
          role: s.role,
          order: signingOrder === 'sequential' ? i : 0,
          entityType: s.entityType,
          entityId: s.entityId,
        })),
        signingOrder,
        message: message.trim(),
        expiresAt: new Date(expiresAt + 'T23:59:59').toISOString(),
        reminderEnabled,
        reminderIntervalDays: reminderDays,
        sourceFileUrl: document.fileUrl,
        sourceFileName: document.name,
        sourceMimeType: document.mimeType,
        sourceFileSize: document.fileSize,
        linkedEntityType: document.clientId ? 'client' : undefined,
        linkedEntityId: document.clientId,
        linkedEntityName: document.clientName,
      };

      const created = await createSignatureRequest(userId, data);
      await sendSignatureRequest(userId, created.id);

      toast.success(`Solicitud de firma enviada a ${signers.length} firmante(s)`);
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Error al enviar solicitud de firma');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-blue-600" />
            Enviar a firma
          </DialogTitle>
          <DialogDescription>
            Configura los firmantes y envía el documento para su firma digital.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Document info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{document.name}</p>
              {document.clientName && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Vinculado a: {document.clientName}</p>
              )}
            </div>
          </div>

          {/* Signers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Firmantes</p>
              </div>
              <button
                type="button"
                onClick={addSigner}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Añadir
              </button>
            </div>

            <div className="space-y-2">
              {signers.map((signer, idx) => (
                <div
                  key={signer.id}
                  className="flex items-start gap-2 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
                >
                  {signingOrder === 'sequential' && (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-bold text-gray-500 mt-1.5 shrink-0">
                      {idx + 1}
                    </div>
                  )}

                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      value={signer.name}
                      onChange={(e) => updateSigner(signer.id, 'name', e.target.value)}
                      placeholder="Nombre del firmante"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-transparent focus:border-blue-500 focus:outline-none"
                    />
                    <input
                      value={signer.email}
                      onChange={(e) => updateSigner(signer.id, 'email', e.target.value)}
                      placeholder="email@ejemplo.com"
                      type="email"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-transparent focus:border-blue-500 focus:outline-none"
                    />
                    <select
                      value={signer.role}
                      onChange={(e) => updateSigner(signer.id, 'role', e.target.value)}
                      className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-transparent focus:border-blue-500 focus:outline-none"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSigner(signer.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors mt-1 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Signing order */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Orden de firma</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSigningOrder('parallel')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      signingOrder === 'parallel'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    Todos a la vez
                  </button>
                  <button
                    type="button"
                    onClick={() => setSigningOrder('sequential')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      signingOrder === 'sequential'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    Secuencial
                  </button>
                </div>
              </div>

              {/* Expiry date */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Fecha límite
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-transparent focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Advanced toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Opciones avanzadas
            </button>

            {showAdvanced && (
              <div className="space-y-3 pl-1">
                {/* Reminders */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(e) => setReminderEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Enviar recordatorios cada
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={reminderDays}
                    onChange={(e) => setReminderDays(Number(e.target.value) || 3)}
                    disabled={!reminderEnabled}
                    className="w-14 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-center bg-transparent focus:border-blue-500 focus:outline-none disabled:opacity-50"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">días</span>
                </label>

                {/* Message */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    Mensaje para los firmantes (opcional)
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Por favor, revisen y firmen el documento adjunto."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-transparent focus:border-blue-500 focus:outline-none resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Validation errors */}
          {validation.length > 0 && (
            <div className="text-xs text-red-600 dark:text-red-400 space-y-0.5">
              {validation.map((err) => (
                <p key={err}>• {err}</p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={validation.length > 0 || sending}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Enviar a firma
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
