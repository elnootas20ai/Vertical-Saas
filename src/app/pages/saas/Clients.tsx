import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/saas/Layout';
import { AddLeadModal } from '../../components/saas/AddLeadModal';
import { useApp } from '../../context/AppContext';
import { LEAD_STATUS_TOKEN, type LeadStatus } from '../../components/saas/DesignTokens';
import {
  Plus, Search, X, Phone, Mail, ChevronRight,
} from 'lucide-react';

// ─── Pill de estado de lead ───────────────────────────────────────────────────

function LeadPill({ status, size = 'sm' }: { status: string; size?: 'xs' | 'sm' }) {
  const token = LEAD_STATUS_TOKEN[status as LeadStatus];
  if (!token) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap
      ${token.badgeBg} ${token.badgeText}
      ${size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs'}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${token.dot}`} />
      {token.label}
    </span>
  );
}

// ─── Fuente del lead ──────────────────────────────────────────────────────────

const SOURCE_KEYS: Record<string, string> = {
  web: 'crm.sources.web',
  phone: 'crm.sources.phone',
  inPerson: 'crm.sources.inPerson',
  whatsapp: 'crm.sources.whatsapp',
  referral: 'crm.sources.referral',
};

// ─── Tarjeta de lead ──────────────────────────────────────────────────────────

function LeadCard({ lead, vehicle, navigate }: { lead: any; vehicle: string; navigate: (p: string) => void }) {
  const { t } = useTranslation();
  const token = LEAD_STATUS_TOKEN[lead.status as LeadStatus] ?? LEAD_STATUS_TOKEN.new;
  return (
    <div
      onClick={() => navigate(`/saas/clients/${lead.id}`)}
      className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 ${token.accentBorder}
        hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 active:scale-[0.99] cursor-pointer transition-all overflow-hidden`}
    >
      <div className="p-4">
        {/* Fila 1: avatar + nombre + estado */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-white">{lead.name.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">{lead.name}</p>
              <LeadPill status={lead.status} size="xs" />
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{SOURCE_KEYS[lead.source] ? t(SOURCE_KEYS[lead.source]) : lead.source} · {lead.createdAt.toLocaleDateString('es-ES')}</p>
          </div>
        </div>

        {/* Fila 2: vehículo de interés */}
        {vehicle && (
          <div className="flex items-center gap-1.5 mb-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
            <span className="text-xs">🚗</span>
            <p className="text-xs text-gray-600 dark:text-gray-400 truncate font-medium">{vehicle}</p>
          </div>
        )}

        {/* Fila 3: contacto */}
        <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 transition-colors">
            <Phone className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            <span className="truncate">{lead.phone}</span>
          </a>
          {lead.email && (
            <a href={`mailto:${lead.email}`} onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600 transition-colors ml-auto flex-shrink-0">
              <Mail className="w-3.5 h-3.5" />
            </a>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Clients() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { leads, vehicles, updateLead } = useApp();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [activeStatus, setActiveStatus] = useState('all');

  const getVehicle = (vehicleId?: string) => {
    if (!vehicleId) return '';
    const v = vehicles.find((v: any) => v.id === vehicleId);
    return v ? `${v.brand} ${v.model} (${v.year})` : '';
  };

  const statusCounts = useMemo(() => ({
    all:         leads.length,
    new:         leads.filter(l => l.status === 'new').length,
    contacted:   leads.filter(l => l.status === 'contacted').length,
    appointment: leads.filter(l => l.status === 'appointment').length,
    negotiation: leads.filter(l => l.status === 'negotiation').length,
    won:         leads.filter(l => l.status === 'won').length,
    lost:        leads.filter(l => l.status === 'lost').length,
  }), [leads]);

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const matchStatus = activeStatus === 'all' || lead.status === activeStatus;
      if (!matchStatus) return false;
      if (!searchValue.trim()) return true;
      const q = searchValue.toLowerCase();
      return lead.name.toLowerCase().includes(q) || lead.phone.toLowerCase().includes(q) || (lead.email?.toLowerCase().includes(q) ?? false);
    });
  }, [leads, activeStatus, searchValue]);

  // Stats — número grande, sin iconos (patrón 2x2)
  const statsItems = [
    { value: statusCounts.all,                                                            label: t('crm.stats.totalLeads'),  color: 'text-gray-900 dark:text-gray-100' },
    { value: statusCounts.new,                                                            label: t('crm.stats.new'),         color: 'text-sky-600' },
    { value: statusCounts.contacted + statusCounts.appointment + statusCounts.negotiation, label: t('crm.stats.inProgress'),  color: 'text-amber-600' },
    { value: statusCounts.lost,                                                           label: t('crm.stats.lost'),        color: statusCounts.lost > 0 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500' },
  ];

  const FILTER_PILLS = [
    { id: 'all',         label: t('common.all'),              count: statusCounts.all },
    { id: 'new',         label: t('crm.status.new'),          count: statusCounts.new },
    { id: 'contacted',   label: t('crm.status.contacted'),    count: statusCounts.contacted },
    { id: 'appointment', label: t('crm.status.appointment'),  count: statusCounts.appointment },
    { id: 'negotiation', label: t('crm.status.negotiation'),  count: statusCounts.negotiation },
    { id: 'lost',        label: t('crm.status.lost'),         count: statusCounts.lost },
  ];

  const hasFilters = activeStatus !== 'all' || searchValue;

  return (
    <Layout title={t('crm.title')} subtitle={t('crm.subtitle')}>
      <div className="space-y-4">

        {/* ── Toolbar: búsqueda + botón ─────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
            <input
              value={searchValue} onChange={e => setSearchValue(e.target.value)}
              placeholder={t('crm.searchPlaceholder')}
              className="w-full pl-10 pr-9 py-2.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-all"
            />
            {searchValue && (
              <button onClick={() => setSearchValue('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors flex-shrink-0">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('common.new')}</span>
          </button>
        </div>

        {/* ── Chips de estado con contadores ────────────────────────────── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {FILTER_PILLS.filter(p => p.count > 0 || p.id === 'all').map(pill => {
            const isActive = activeStatus === pill.id;
            const pillToken = pill.id !== 'all' ? LEAD_STATUS_TOKEN[pill.id as LeadStatus] : null;
            return (
              <button key={pill.id} onClick={() => setActiveStatus(pill.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all whitespace-nowrap ${
                  isActive
                    ? pillToken ? `${pillToken.badgeBg} ${pillToken.badgeText} border-current` : 'bg-gray-900 border-gray-900 text-white'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}>
                {pillToken && isActive && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pillToken.dot}`} />}
                {pill.label}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/30' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {pill.count}
                </span>
              </button>
            );
          })}
          {hasFilters && (
            <>
              <div className="flex-shrink-0 w-px h-4 bg-gray-200 mx-1" />
              <button onClick={() => { setActiveStatus('all'); setSearchValue(''); }}
                className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold text-red-500 hover:bg-red-50 border-2 border-transparent hover:border-red-100 transition-all">
                <X className="w-3 h-3" /> {t('common.clear')}
              </button>
            </>
          )}
        </div>

        {/* ── Stats 2×2 — número grande sin iconos ─────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {statsItems.map(s => (
            <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
              <p className={`text-2xl font-bold leading-none mb-1 ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Lista de leads ────────────────────────────────────────────── */}
        {leads.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl p-16 text-center">
            <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">👤</div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('crm.empty.noLeads')}</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">{t('crm.empty.noLeadsDesc')}</p>
            <button onClick={() => setShowAddModal(true)}
              className="px-6 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors">
              {t('crm.empty.createFirst')}
            </button>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl py-14 text-center">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">{t('crm.empty.noResults')}</p>
            <button onClick={() => { setSearchValue(''); setActiveStatus('all'); }}
              className="text-xs text-blue-600 font-medium hover:text-blue-800">
              {t('common.clearFilters')}
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              <span className="font-semibold text-gray-700 dark:text-gray-300">{filteredLeads.length}</span> {filteredLeads.length !== 1 ? t('crm.leadsPlural') : t('crm.leadSingular')}
              {(searchValue || activeStatus !== 'all') ? ` ${t('crm.found')}` : ` ${t('crm.inTotal')}`}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredLeads.map(lead => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  vehicle={getVehicle(lead.interestedVehicle)}
                  navigate={navigate}
                />
              ))}
            </div>
          </>
        )}

      </div>

      {showAddModal && <AddLeadModal onClose={() => setShowAddModal(false)} />}
    </Layout>
  );
}
