import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNotificationOpen } from '../../hooks/useNotificationOpen';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { Layout } from '../../components/saas/Layout';
import { useFinanceUserId } from '../../hooks/useFinanceUserId';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listClientInvoicesRequest, createClientInvoiceRequest, updateClientInvoiceRequest,
  deleteClientInvoiceRequest, getNextInvoiceNumber, sendInvoiceByEmail, registerInvoicePayment,
  calcInvoiceTotals, type ClientInvoiceRecord, type ClientInvoiceStatus, type InvoiceLine, type InvoicePayment,
} from '../../lib/clientInvoicesApi';
import { linkClientInvoiceToFinance } from '../../lib/clientInvoiceFinanceSync';
import { listClientsRequest } from '../../lib/crmApi';
import { generateInvoicePdf, type InvoiceData } from '../../lib/invoicePdfGenerator';
import {
  Plus, Search, X, Trash2, Edit3, Receipt, CheckCircle2, Clock,
  AlertTriangle, Download, Filter, Calendar, FileText, Send,
  ChevronDown, ChevronUp, ArrowUpDown, Loader2, CircleDollarSign, Wallet,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface SimpleClient { id: string; name: string; dni: string; email: string; phone: string; address?: string; city?: string; postalCode?: string }
type ModalMode = 'create' | 'edit' | null;
type SortKey = 'number' | 'clientName' | 'date' | 'dueDate' | 'total' | 'status';
type SortDir = 'asc' | 'desc';

const STATUS_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  draft: { label: 'Borrador', bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-400' },
  pending: { label: 'Pendiente', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  partial: { label: 'Parcial', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
  overdue: { label: 'Vencida', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  paid: { label: 'Cobrada', bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
};
const PAY_METHODS = ['Transferencia', 'Tarjeta', 'Efectivo', 'Domiciliacion', 'Bizum', 'Otro'];
const TAX_RATES = [0, 4, 10, 21];

function fmtC(n: number) { return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'; }
function fmtD(d: string) { return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function emptyLine(): InvoiceLine { return { id: uuidv4(), description: '', quantity: 1, unitPrice: 0, discountPercent: 0, taxRate: 21, lineTotal: 0 }; }
function recalcLine(l: InvoiceLine): InvoiceLine { return { ...l, lineTotal: Number((l.quantity * l.unitPrice * (1 - l.discountPercent / 100)).toFixed(2)) }; }

function buildPdfData(inv: ClientInvoiceRecord): InvoiceData {
  return {
    number: inv.number, date: inv.date, dueDate: inv.dueDate || undefined,
    issuer: { companyName: inv.issuerName || 'Empresa', nif: inv.issuerNif, address: inv.issuerAddress, city: inv.issuerCity, cp: inv.issuerPostalCode, email: inv.issuerEmail, phone: inv.issuerPhone },
    recipient: { name: inv.clientName || 'Cliente', nif: inv.clientNif, address: inv.clientAddress, city: inv.clientCity },
    lines: inv.lines.length > 0 ? inv.lines.map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate })) : [{ description: 'Servicio', quantity: 1, unitPrice: inv.total, taxRate: 21 }],
    notes: inv.notes || undefined, payMethod: inv.paymentMethod || undefined,
  };
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] || STATUS_CFG.draft;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${c.bg} ${c.text}`}><span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{c.label}</span>;
}

function SmField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div><label className="block text-[11px] text-gray-400 dark:text-gray-500 mb-0.5">{label}</label><input value={value} onChange={e => onChange(e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500" /></div>;
}

const KPI_COLORS: Record<string, string> = { blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800 text-blue-600', amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800 text-amber-600', red: 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800 text-red-600', emerald: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800 text-emerald-600' };

function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (<div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5"><div className="flex items-center gap-3"><div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${KPI_COLORS[color]}`}><Icon className="w-5 h-5" /></div><div><p className="text-xs text-gray-400 font-medium">{label}</p><p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">{value}</p></div></div></div>);
}

function SortTh({ label, sortKey, current, onSort, right }: { label: string; sortKey: SortKey; current: { key: SortKey; dir: SortDir }; onSort: (k: SortKey) => void; right?: boolean }) {
  const active = current.key === sortKey;
  return (<th className={`px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 ${right ? 'text-right' : 'text-left'}`} onClick={() => onSort(sortKey)}><span className="inline-flex items-center gap-1">{label}{active ? (current.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}</span></th>);
}

function ActBtn({ icon: Icon, title, onClick, disabled, cls }: { icon: any; title: string; onClick: () => void; disabled?: boolean; cls?: string }) {
  return <button onClick={onClick} disabled={disabled} title={title} className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${cls || 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'}`}><Icon className="w-3.5 h-3.5" /></button>;
}

function FiscalSection(p: any) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full px-5 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
        <span>Datos fiscales (emisor / receptor)</span>{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Receptor (cliente)</p>
            <SmField label="NIF / CIF" value={p.clientNif} onChange={p.setClientNif} />
            <SmField label="Direccion" value={p.clientAddress} onChange={p.setClientAddress} />
            <SmField label="Ciudad" value={p.clientCity} onChange={p.setClientCity} />
            <SmField label="C.P." value={p.clientPostalCode} onChange={p.setClientPostalCode} />
            <SmField label="Email" value={p.clientEmail} onChange={p.setClientEmail} />
          </div>
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Emisor (tu empresa)</p>
            <SmField label="Nombre" value={p.issuerName} onChange={p.setIssuerName} />
            <SmField label="NIF / CIF" value={p.issuerNif} onChange={p.setIssuerNif} />
            <SmField label="Direccion" value={p.issuerAddress} onChange={p.setIssuerAddress} />
            <SmField label="Ciudad" value={p.issuerCity} onChange={p.setIssuerCity} />
            <SmField label="C.P." value={p.issuerPostalCode} onChange={p.setIssuerPostalCode} />
            <SmField label="Email" value={p.issuerEmail} onChange={p.setIssuerEmail} />
            <SmField label="Telefono" value={p.issuerPhone} onChange={p.setIssuerPhone} />
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceModal({ mode, invoice, clients, onSave, onClose, userId }: {
  mode: ModalMode; invoice: ClientInvoiceRecord | null; clients: SimpleClient[];
  onSave: (d: Partial<ClientInvoiceRecord>) => void; onClose: () => void; userId: string;
}) {
  const isEdit = mode === 'edit' && invoice;
  const [clientId, setClientId] = useState(invoice?.clientId || '');
  const [clientSearch, setClientSearch] = useState(invoice?.clientName || '');
  const [showDrop, setShowDrop] = useState(false);
  const [number, setNumber] = useState(invoice?.number || '');
  const [series, setSeries] = useState(invoice?.series || 'FAC');
  const [date, setDate] = useState((invoice?.date || new Date().toISOString()).slice(0, 10));
  const [dueDate, setDueDate] = useState(() => { if (invoice?.dueDate) return invoice.dueDate.slice(0, 10); const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); });
  const [payMethod, setPayMethod] = useState(invoice?.paymentMethod || '');
  const [notes, setNotes] = useState(invoice?.notes || '');
  const [lines, setLines] = useState<InvoiceLine[]>(() => invoice?.lines?.length ? invoice.lines : [emptyLine()]);
  const [status, setStatus] = useState<ClientInvoiceStatus>(invoice?.status || 'pending');
  const [cNif, setCNif] = useState(invoice?.clientNif || '');
  const [cAddr, setCAddr] = useState(invoice?.clientAddress || '');
  const [cCity, setCCity] = useState(invoice?.clientCity || '');
  const [cCp, setCCp] = useState(invoice?.clientPostalCode || '');
  const [cEmail, setCEmail] = useState(invoice?.clientEmail || '');
  const [iName, setIName] = useState(invoice?.issuerName || '');
  const [iNif, setINif] = useState(invoice?.issuerNif || '');
  const [iAddr, setIAddr] = useState(invoice?.issuerAddress || '');
  const [iCity, setICity] = useState(invoice?.issuerCity || '');
  const [iCp, setICp] = useState(invoice?.issuerPostalCode || '');
  const [iEmail, setIEmail] = useState(invoice?.issuerEmail || '');
  const [iPhone, setIPhone] = useState(invoice?.issuerPhone || '');
  const [saving, setSaving] = useState(false);
  useModalClose(mode !== null, onClose);

  useEffect(() => { if (mode === 'create' && !number) { getNextInvoiceNumber(userId, series).then(r => setNumber(r.number)).catch(() => {}); } }, [mode, userId, series]);
  const fClients = useMemo(() => { const q = clientSearch.toLowerCase(); return (q ? clients.filter(c => c.name.toLowerCase().includes(q) || c.dni.toLowerCase().includes(q)) : clients).slice(0, 20); }, [clients, clientSearch]);
  const selClient = (c: SimpleClient) => { setClientId(c.id); setClientSearch(c.name); setCNif(c.dni || ''); setCEmail(c.email || ''); setCAddr(c.address || ''); setCCity(c.city || ''); setCCp(c.postalCode || ''); setShowDrop(false); };
  const updLine = (i: number, f: keyof InvoiceLine, v: string | number) => { setLines(p => p.map((l, j) => j !== i ? l : recalcLine({ ...l, [f]: v }))); };
  const totals = useMemo(() => calcInvoiceTotals(lines), [lines]);

  const doSave = async () => {
    if (!clientId && !clientSearch.trim()) { toast.error('Selecciona un cliente'); return; }
    if (!number.trim()) { toast.error('Numero de factura obligatorio'); return; }
    if (lines.every(l => !l.description.trim())) { toast.error('Anade al menos una linea'); return; }
    setSaving(true);
    try {
      onSave({
        ...(isEdit ? { id: invoice!.id, _rev: invoice!._rev } : {}),
        clientId: clientId || ('manual-' + uuidv4()), clientName: clientSearch.trim() || '',
        clientNif: cNif, clientAddress: cAddr, clientCity: cCity, clientPostalCode: cCp, clientEmail: cEmail,
        issuerName: iName, issuerNif: iNif, issuerAddress: iAddr, issuerCity: iCity, issuerPostalCode: iCp, issuerEmail: iEmail, issuerPhone: iPhone,
        number, series, date, dueDate, lines: lines.filter(l => l.description.trim()), ...totals,
        paid: isEdit ? invoice!.paid : 0, status, paymentMethod: payMethod, notes,
        sourceType: invoice?.sourceType || 'manual', sourceQuoteId: invoice?.sourceQuoteId || null,
        sourceSaleId: invoice?.sourceSaleId || null, financeMovementId: invoice?.financeMovementId || null,
        sentAt: invoice?.sentAt || null, sentTo: invoice?.sentTo || null, payments: invoice?.payments || [],
      });
    } finally { setSaving(false); }
  };

  if (!mode) return null;
  const ic = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500';
  const lc = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';
  const nc = 'rounded-lg border-0 bg-transparent px-1 py-1.5 text-sm text-right text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 pt-8 pb-8">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-200 dark:border-gray-700">
          <div><h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{isEdit ? 'Editar factura' : 'Nueva factura'}</h2><p className="text-sm text-gray-400 mt-0.5">{isEdit ? 'Editando ' + invoice!.number : 'Completa los datos para emitir la factura'}</p></div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-8 py-6 space-y-8 max-h-[calc(100vh-200px)] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative"><label className={lc}>Cliente *</label>
              <input value={clientSearch} onChange={e => { setClientSearch(e.target.value); setShowDrop(true); }} onFocus={() => setShowDrop(true)} placeholder="Buscar cliente..." className={ic} />
              {showDrop && fClients.length > 0 && <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">{fClients.map(c => <button key={c.id} onClick={() => selClient(c)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between"><span className="font-medium text-gray-900 dark:text-gray-100">{c.name}</span><span className="text-xs text-gray-400">{c.dni || c.email}</span></button>)}</div>}
            </div>
            <div><label className={lc}>N. Factura *</label><div className="flex gap-2"><select value={series} onChange={e => setSeries(e.target.value)} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm w-24"><option value="FAC">FAC</option><option value="SRV">SRV</option><option value="PRO">PRO</option></select><input value={number} onChange={e => setNumber(e.target.value)} placeholder="FAC-2026-0001" className={'flex-1 ' + ic} /></div></div>
            <div><label className={lc}>Fecha emision</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className={ic} /></div>
            <div><label className={lc}>Vencimiento</label><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={ic} /></div>
            <div><label className={lc}>Metodo pago</label><select value={payMethod} onChange={e => setPayMethod(e.target.value)} className={ic}><option value="">Sin especificar</option>{PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
            <div><label className={lc}>Estado</label><select value={status} onChange={e => setStatus(e.target.value as ClientInvoiceStatus)} className={ic}><option value="draft">Borrador</option><option value="pending">Pendiente</option><option value="overdue">Vencida</option><option value="partial">Pago parcial</option><option value="paid">Cobrada</option></select></div>
          </div>
          <FiscalSection clientNif={cNif} setClientNif={setCNif} clientAddress={cAddr} setClientAddress={setCAddr} clientCity={cCity} setClientCity={setCCity} clientPostalCode={cCp} setClientPostalCode={setCCp} clientEmail={cEmail} setClientEmail={setCEmail} issuerName={iName} setIssuerName={setIName} issuerNif={iNif} setIssuerNif={setINif} issuerAddress={iAddr} setIssuerAddress={setIAddr} issuerCity={iCity} setIssuerCity={setICity} issuerPostalCode={iCp} setIssuerPostalCode={setICp} issuerEmail={iEmail} setIssuerEmail={setIEmail} issuerPhone={iPhone} setIssuerPhone={setIPhone} />
          <div>
            <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Lineas de factura</h3><button onClick={() => setLines(p => [...p, emptyLine()])} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"><Plus className="w-3.5 h-3.5" /> Anadir linea</button></div>
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="grid grid-cols-[1fr_70px_90px_60px_60px_80px_28px] gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-[11px] font-semibold text-gray-500 uppercase tracking-wider"><span>Descripcion</span><span className="text-right">Cant.</span><span className="text-right">Precio</span><span className="text-right">Dto%</span><span className="text-right">IVA</span><span className="text-right">Importe</span><span /></div>
              {lines.map((line, idx) => (<div key={line.id} className="grid grid-cols-[1fr_70px_90px_60px_60px_80px_28px] gap-2 px-4 py-2 border-t border-gray-100 dark:border-gray-700/50 items-center">
                <input value={line.description} onChange={e => updLine(idx, 'description', e.target.value)} placeholder="Concepto" className="rounded-lg border-0 bg-transparent px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-300 focus:ring-1 focus:ring-blue-500" />
                <input type="number" min="0" step="1" value={line.quantity || ''} onChange={e => updLine(idx, 'quantity', Number(e.target.value))} className={nc} />
                <input type="number" min="0" step="0.01" value={line.unitPrice || ''} onChange={e => updLine(idx, 'unitPrice', Number(e.target.value))} className={nc} />
                <input type="number" min="0" max="100" value={line.discountPercent || ''} onChange={e => updLine(idx, 'discountPercent', Number(e.target.value))} className={nc} />
                <select value={line.taxRate} onChange={e => updLine(idx, 'taxRate', Number(e.target.value))} className="rounded-lg border-0 bg-transparent px-0 py-1.5 text-sm text-right text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500">{TAX_RATES.map(r => <option key={r} value={r}>{r}%</option>)}</select>
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-right pr-1">{fmtC(line.lineTotal)}</span>
                <button onClick={() => { if (lines.length > 1) setLines(p => p.filter((_, i) => i !== idx)); }} disabled={lines.length <= 1} className="p-1 rounded-lg text-gray-300 hover:text-red-500 disabled:opacity-30"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>))}
              <div className="border-t-2 border-gray-200 dark:border-gray-700 px-4 py-4"><div className="flex justify-end"><div className="w-64 space-y-2">
                <div className="flex justify-between text-sm text-gray-500"><span>Base imponible</span><span className="font-medium text-gray-700 dark:text-gray-300">{fmtC(totals.amountBase)}</span></div>
                {totals.discountAmount > 0 && <div className="flex justify-between text-sm text-gray-500"><span>Descuento</span><span className="font-medium text-red-500">-{fmtC(totals.discountAmount)}</span></div>}
                <div className="flex justify-between text-sm text-gray-500"><span>IVA</span><span className="font-medium text-gray-700 dark:text-gray-300">{fmtC(totals.taxAmount)}</span></div>
                <div className="flex justify-between text-base font-bold text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-gray-700"><span>TOTAL</span><span className="text-emerald-600">{fmtC(totals.total)}</span></div>
              </div></div></div>
            </div>
          </div>
          <div><label className={lc}>Notas</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={ic + ' resize-none'} placeholder="Condiciones de pago, referencias..." /></div>
        </div>
        <div className="flex items-center justify-end gap-3 px-8 py-5 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl">Cancelar</button>
          <button onClick={doSave} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{isEdit ? 'Guardar cambios' : 'Crear factura'}</button>
        </div>
      </div>
    </div>
  );
}

function PaymentModal({ invoice, onClose, onSave }: { invoice: ClientInvoiceRecord; onClose: () => void; onSave: (id: string, p: Omit<InvoicePayment, 'id'>) => void }) {
  const remaining = Number((invoice.total - invoice.paid).toFixed(2));
  const [amount, setAmount] = useState(String(remaining > 0 ? remaining : 0));
  const [method, setMethod] = useState(invoice.paymentMethod || '');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState('');
  const [saving, setSaving] = useState(false);
  useModalClose(true, onClose);
  const ic = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div><h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Registrar cobro</h3><p className="text-xs text-gray-400 mt-0.5">{invoice.number} - Pendiente: {fmtC(remaining)}</p></div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Importe *</label><input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={ic + ' focus:ring-2 focus:ring-blue-500 [appearance:textfield]'} /></div>
          <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Fecha</label><input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={ic} /></div>
          <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Metodo</label><select value={method} onChange={e => setMethod(e.target.value)} className={ic}><option value="">Sin especificar</option>{PAY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
          <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Notas</label><input value={payNotes} onChange={e => setPayNotes(e.target.value)} className={ic} placeholder="Referencia del pago..." /></div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl">Cancelar</button>
          <button onClick={() => { const a = Number(amount); if (!a || a <= 0) { toast.error('Importe debe ser mayor que 0'); return; } setSaving(true); onSave(invoice.id, { amount: a, date: payDate, method, notes: payNotes }); }} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Registrar cobro</button>
        </div>
      </div>
    </div>
  );
}

export function ClientBillingPage() {
  const financeUserId = useFinanceUserId();
  const [invoices, setInvoices] = useState<ClientInvoiceRecord[]>([]);
  const [clients, setClients] = useState<SimpleClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editInv, setEditInv] = useState<ClientInvoiceRecord | null>(null);
  const [payInv, setPayInv] = useState<ClientInvoiceRecord | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'date', dir: 'desc' });
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useNotificationOpen(
    useCallback((entityId: string) => {
      const inv = invoices.find((i) => i.id === entityId);
      if (inv) { setEditInv(inv); setModalMode('edit'); }
    }, [invoices]),
    !loading,
  );
    const loadData = useCallback(async () => {
    if (!financeUserId) return; setLoading(true);
    try {
      const [invs, cls] = await Promise.all([
        listClientInvoicesRequest(financeUserId),
        listClientsRequest(financeUserId, { all: true }).catch(() => []),
      ]);
      setInvoices(invs);
      setClients(cls.map((c: any) => ({ id: c.id, name: c.name || '', dni: c.dni || '', email: c.email || '', phone: c.phone || '', address: c.address, city: c.city, postalCode: c.postalCode })));
    } catch (err: any) { toast.error(err.message || 'Error cargando datos'); } finally { setLoading(false); }
  }, [financeUserId]);
  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let list = [...invoices];
    if (search) { const q = search.toLowerCase(); list = list.filter(i => i.number.toLowerCase().includes(q) || i.clientName.toLowerCase().includes(q)); }
    if (statusFilter !== 'all') list = list.filter(i => i.status === statusFilter);
    if (dateFrom) list = list.filter(i => i.date >= dateFrom);
    if (dateTo) list = list.filter(i => i.date <= dateTo);
    list.sort((a, b) => { const d = sort.dir === 'asc' ? 1 : -1; const va = a[sort.key]; const vb = b[sort.key]; if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * d; return String(va || '').localeCompare(String(vb || '')) * d; });
    return list;
  }, [invoices, search, statusFilter, dateFrom, dateTo, sort]);

  const kpis = useMemo(() => {
    const ms = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const tm = invoices.filter(i => i.date >= ms);
    return { totalInvoiced: tm.reduce((s, i) => s + i.total, 0), pendingAmount: invoices.filter(i => ['pending', 'partial', 'overdue'].includes(i.status)).reduce((s, i) => s + (i.total - i.paid), 0), overdueCount: invoices.filter(i => i.status === 'overdue').length, collectedMonth: tm.reduce((s, i) => s + i.paid, 0) };
  }, [invoices]);

  const handleSave = async (data: Partial<ClientInvoiceRecord>) => {
    try {
      if (modalMode === 'edit' && editInv) { const u = await updateClientInvoiceRequest(financeUserId, { ...editInv, ...data } as ClientInvoiceRecord); if (u) { setInvoices(p => p.map(i => i.id === u.id ? u : i)); toast.success('Factura actualizada'); } }
      else { const c = await createClientInvoiceRequest(financeUserId, data as any); if (c) { setInvoices(p => [c, ...p]); toast.success('Factura creada'); } }
      setModalMode(null); setEditInv(null);
    } catch (err: any) { toast.error(err.message || 'Error guardando factura'); }
  };
  const handleDel = async (inv: ClientInvoiceRecord) => { if (!confirm('Eliminar factura ' + inv.number + '?')) return; try { await deleteClientInvoiceRequest(financeUserId, inv.id); setInvoices(p => p.filter(i => i.id !== inv.id)); toast.success('Eliminada'); } catch (e: any) { toast.error(e.message); } };
  const handleSend = async (inv: ClientInvoiceRecord) => { if (!inv.clientEmail) { toast.error('Cliente sin email'); return; } if (!confirm('Enviar ' + inv.number + ' a ' + inv.clientEmail + '?')) return; try { const r = await sendInvoiceByEmail(financeUserId, inv.id); setInvoices(p => p.map(i => i.id === inv.id ? { ...i, sentAt: r.sentAt, sentTo: r.sentTo } : i)); toast.success('Enviada a ' + r.sentTo); } catch (e: any) { toast.error(e.message); } };
  const handlePdf = (inv: ClientInvoiceRecord) => { try { generateInvoicePdf(buildPdfData(inv)); toast.success('PDF descargado'); } catch { toast.error('Error PDF'); } };
  const handlePay = async (id: string, pay: Omit<InvoicePayment, 'id'>) => { try { const u = await registerInvoicePayment(financeUserId, id, pay); if (u) { setInvoices(p => p.map(i => i.id === u.id ? u : i)); toast.success('Cobro registrado'); } setPayInv(null); } catch (e: any) { toast.error(e.message); } };
  const handleLinkFinance = async (inv: ClientInvoiceRecord) => {
    try {
      const u = await linkClientInvoiceToFinance(financeUserId, inv.id);
      if (u) {
        setInvoices((p) => p.map((i) => (i.id === u.id ? u : i)));
        toast.success('Cobro registrado en finanzas');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo vincular con finanzas');
    }
  };
  const toggleSort = (k: SortKey) => setSort(p => p.key === k ? { key: k, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: 'desc' });

  return (
    <Layout title="Facturacion Clientes" subtitle="Emitir y controlar facturas a clientes">
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={Receipt} label="Facturado (mes)" value={fmtC(kpis.totalInvoiced)} color="blue" />
          <KpiCard icon={Clock} label="Pendiente de cobro" value={fmtC(kpis.pendingAmount)} color="amber" />
          <KpiCard icon={AlertTriangle} label="Facturas vencidas" value={String(kpis.overdueCount)} color="red" />
          <KpiCard icon={CheckCircle2} label="Cobrado (mes)" value={fmtC(kpis.collectedMonth)} color="emerald" />
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por n. factura, cliente..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500" /></div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300"><option value="all">Todos</option>{Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
              <button onClick={() => setShowFilters(!showFilters)} className={'p-2.5 rounded-xl border transition-colors ' + (showFilters ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-400')}><Filter className="w-4 h-4" /></button>
              <AddButtonDropdown
                label="Nueva factura"
                onQuickAdd={() => { setModalMode('create'); setEditInv(null); }}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de factura"
              />
            </div>
          </div>
          {showFilters && <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700"><Calendar className="w-4 h-4 text-gray-400" /><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm" /><span className="text-xs text-gray-400">hasta</span><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm" />{(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-xs text-red-500 font-medium">Limpiar</button>}</div>}
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          : filtered.length === 0 ? <div className="text-center py-20"><Receipt className="w-12 h-12 mx-auto mb-4 text-gray-300" /><h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Sin facturas</h3><p className="text-sm text-gray-400 mb-4">{invoices.length === 0 ? 'Crea tu primera factura de cliente' : 'No hay facturas con esos filtros'}</p>{invoices.length === 0 && <button onClick={() => { setModalMode('create'); setEditInv(null); }} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl"><Plus className="w-4 h-4" /> Crear factura</button>}</div>
          : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 dark:bg-gray-800/50">
            <SortTh label="N. Factura" sortKey="number" current={sort} onSort={toggleSort} />
            <SortTh label="Cliente" sortKey="clientName" current={sort} onSort={toggleSort} />
            <SortTh label="Fecha" sortKey="date" current={sort} onSort={toggleSort} />
            <SortTh label="Vencimiento" sortKey="dueDate" current={sort} onSort={toggleSort} />
            <SortTh label="Base" sortKey="total" current={sort} onSort={toggleSort} right />
            <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">IVA</th>
            <SortTh label="Total" sortKey="total" current={sort} onSort={toggleSort} right />
            <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Pagado</th>
            <SortTh label="Estado" sortKey="status" current={sort} onSort={toggleSort} />
            <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Acciones</th>
          </tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">{filtered.map(inv => (
            <tr key={inv.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
              <td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 flex items-center justify-center"><FileText className="w-3.5 h-3.5 text-blue-600" /></div><div><span className="font-semibold text-gray-900 dark:text-gray-100">{inv.number}</span>{inv.sourceType && inv.sourceType !== 'manual' && <span className="block text-[10px] text-blue-500">Desde {inv.sourceType === 'quote' ? 'presupuesto' : inv.sourceType}</span>}</div></div></td>
              <td className="px-4 py-3.5 text-gray-700 dark:text-gray-300 font-medium">{inv.clientName}</td>
              <td className="px-4 py-3.5 text-gray-500">{fmtD(inv.date)}</td>
              <td className="px-4 py-3.5 text-gray-500">{fmtD(inv.dueDate)}</td>
              <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{fmtC(inv.amountBase)}</td>
              <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums">{fmtC(inv.taxAmount)}</td>
              <td className="px-4 py-3.5 text-right font-bold text-gray-900 dark:text-gray-100 tabular-nums">{fmtC(inv.total)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums"><span className={inv.paid >= inv.total ? 'text-emerald-600 font-semibold' : 'text-gray-400'}>{fmtC(inv.paid)}</span></td>
              <td className="px-4 py-3.5"><StatusBadge status={inv.status} />{inv.sentAt && <span className="block text-[10px] text-gray-400 mt-0.5">Enviada {fmtD(inv.sentAt)}</span>}</td>
              <td className="px-4 py-3.5"><div className="flex items-center justify-end gap-1">
                <ActBtn icon={Edit3} title="Editar" onClick={() => { setEditInv(inv); setModalMode('edit'); }} />
                <ActBtn icon={Download} title="PDF" onClick={() => handlePdf(inv)} />
                <ActBtn icon={Send} title="Enviar" onClick={() => handleSend(inv)} disabled={!inv.clientEmail} />
                {!inv.financeMovementId && inv.status !== 'draft' && (
                  <ActBtn icon={Wallet} title="Registrar en finanzas" onClick={() => handleLinkFinance(inv)} cls="text-violet-500 hover:text-violet-600 hover:bg-violet-50" />
                )}
                {inv.financeMovementId && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-50 text-violet-600" title="Vinculada a finanzas">Finanzas</span>
                )}
                {inv.status !== 'paid' && <ActBtn icon={CircleDollarSign} title="Cobrar" onClick={() => setPayInv(inv)} cls="text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50" />}
                <ActBtn icon={Trash2} title="Eliminar" onClick={() => handleDel(inv)} cls="text-red-400 hover:text-red-600 hover:bg-red-50" />
              </div></td>
            </tr>
          ))}</tbody></table></div>}
        </div>
        <div className="text-xs text-gray-400 text-center pb-2">{filtered.length} de {invoices.length} facturas</div>
      </div>
      {modalMode && <InvoiceModal mode={modalMode} invoice={editInv} clients={clients} onSave={handleSave} onClose={() => { setModalMode(null); setEditInv(null); }} userId={financeUserId} />}
      {payInv && <PaymentModal invoice={payInv} onClose={() => setPayInv(null)} onSave={handlePay} />}
    </Layout>
  );
}
