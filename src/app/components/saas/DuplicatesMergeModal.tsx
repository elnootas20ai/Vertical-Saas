import { useMemo, useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { X, AlertTriangle, Merge, User, Phone, Mail, CreditCard, CheckCircle } from 'lucide-react';
import type { Lead, Client } from '../../context/AppContext';

interface DuplicateGroup {
  key: string;
  reason: string;
  items: Array<{ type: 'lead' | 'client'; record: Lead | Client }>;
}

interface Props {
  leads: Lead[];
  clients: Client[];
  onMergeLead: (keepId: string, deleteId: string) => Promise<void>;
  onMergeClient: (keepId: string, deleteId: string) => Promise<void>;
  onClose: () => void;
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '').slice(-9);
}

function normalize(str: string) {
  return str.trim().toLowerCase();
}

function findDuplicateGroups(leads: Lead[], clients: Client[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const seenPairs = new Set<string>();

  function addGroup(
    a: { type: 'lead' | 'client'; record: Lead | Client },
    b: { type: 'lead' | 'client'; record: Lead | Client },
    reason: string,
  ) {
    const pairKey = [a.record.id, b.record.id].sort().join('::');
    if (seenPairs.has(pairKey)) return;
    seenPairs.add(pairKey);
    groups.push({ key: pairKey, reason, items: [a, b] });
  }

  const all: Array<{ type: 'lead' | 'client'; record: Lead | Client }> = [
    ...leads.map((r) => ({ type: 'lead' as const, record: r })),
    ...clients.map((r) => ({ type: 'client' as const, record: r })),
  ];

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];

      const emailA = normalize(a.record.email || '');
      const emailB = normalize(b.record.email || '');
      if (emailA && emailB && emailA === emailB) {
        addGroup(a, b, `Email idéntico: ${emailA}`);
        continue;
      }

      const phoneA = normalizePhone(a.record.phone || '');
      const phoneB = normalizePhone(b.record.phone || '');
      if (phoneA.length >= 9 && phoneA === phoneB) {
        addGroup(a, b, `Teléfono idéntico: ${a.record.phone}`);
        continue;
      }

      const dniA = normalize((a.record as Client).dni || '');
      const dniB = normalize((b.record as Client).dni || '');
      if (dniA && dniB && dniA === dniB) {
        addGroup(a, b, `DNI/NIE idéntico: ${dniA.toUpperCase()}`);
      }
    }
  }

  return groups;
}

export function DuplicatesMergeModal({ leads, clients, onMergeLead, onMergeClient, onClose }: Props) {
  useModalClose(true, onClose);

  const duplicates = useMemo(() => findDuplicateGroups(leads, clients), [leads, clients]);
  const [merging, setMerging] = useState<string | null>(null);
  const [merged, setMerged] = useState<Set<string>>(new Set());
  const [selectedKeep, setSelectedKeep] = useState<Record<string, string>>({});

  async function handleMerge(group: DuplicateGroup) {
    const keepId = selectedKeep[group.key] || group.items[0].record.id;
    const deleteItem = group.items.find((i) => i.record.id !== keepId);
    if (!deleteItem) return;

    setMerging(group.key);
    try {
      if (deleteItem.type === 'lead') {
        await onMergeLead(keepId, deleteItem.record.id);
      } else {
        await onMergeClient(keepId, deleteItem.record.id);
      }
      setMerged((prev) => new Set([...prev, group.key]));
    } finally {
      setMerging(null);
    }
  }

  const pending = duplicates.filter((g) => !merged.has(g.key));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Detectar duplicados</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {pending.length === 0
                  ? 'No se han encontrado duplicados'
                  : `${pending.length} posible${pending.length > 1 ? 's' : ''} duplicado${pending.length > 1 ? 's' : ''} detectado${pending.length > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {pending.length === 0 && merged.size === 0 && (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No se detectaron registros duplicados</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Los registros se compararon por email, teléfono y DNI
              </p>
            </div>
          )}

          {merged.size > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4" />
              {merged.size} duplicado{merged.size > 1 ? 's' : ''} fusionado{merged.size > 1 ? 's' : ''} correctamente
            </div>
          )}

          {pending.map((group) => (
            <div key={group.key} className="border-2 border-amber-200 bg-amber-50/30 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-700">{group.reason}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {group.items.map((item) => {
                  const r = item.record;
                  const isKeep = (selectedKeep[group.key] || group.items[0].record.id) === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedKeep((prev) => ({ ...prev, [group.key]: r.id }))}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${
                        isKeep
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          item.type === 'lead' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {item.type === 'lead' ? 'Lead' : 'Cliente'}
                        </span>
                        {isKeep && (
                          <span className="text-xs font-bold text-blue-600 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Conservar
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1.5 mb-1">
                        <User className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                        {r.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mb-0.5">
                        <Phone className="w-3 h-3" />
                        {r.phone}
                      </p>
                      {r.email && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mb-0.5">
                          <Mail className="w-3 h-3" />
                          {r.email}
                        </p>
                      )}
                      {(r as Client).dni && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                          <CreditCard className="w-3 h-3" />
                          {(r as Client).dni}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                        Creado: {new Date(r.createdAt).toLocaleDateString('es-ES')}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Selecciona el registro a conservar. El otro será eliminado.
                </p>
                <button
                  onClick={() => void handleMerge(group)}
                  disabled={merging === group.key}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {merging === group.key ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Merge className="w-4 h-4" />
                  )}
                  Fusionar
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
