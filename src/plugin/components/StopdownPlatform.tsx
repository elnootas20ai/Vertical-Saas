import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Building2, Users, Rocket, Mic2, ShoppingBag, TrendingUp,
  FolderLock, Shield, Plus, Search, Trash2, Check, X,
  ChevronRight, ChevronLeft, Sparkles, Target,
  Coins, FileText, BarChart3, Lock, Loader2,
  Eye, Clock, AlertCircle, CheckCircle2,
  ThumbsUp, ThumbsDown, Send, UserPlus,
  Layers, Zap, ExternalLink, MessageCircle,
  Wand2, ArrowRight, Play, RefreshCw,
  Star, TrendingDown, ShieldAlert, Lightbulb,
  Copy, ChevronDown, Download, Presentation,
  Mail, Phone, MapPin, Globe, Briefcase, DollarSign, Share2, Pencil,
  Upload, File, FolderOpen, GripVertical, Move, Code2, Calendar, CalendarPlus, Video,
} from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';
import { couchApi, agentApi } from '../lib/api';
import { TabLoader } from './TabLoader';

// ── Types ────────────────────────────────────────────────────────────────────

type ProjectStage = 'ideation' | 'validation' | 'mvp' | 'growth' | 'scaling' | 'exit';
type DocCategory = 'contract' | 'nda' | 'agreement' | 'pitch-deck' | 'financial' | 'legal' | 'technical' | 'other';
type PitchFormat = '1min' | '3min' | '5min' | '10min' | 'roundtable';

interface StopdownProject {
  _id?: string; _rev?: string; type: 'project';
  name: string; description: string; stage: ProjectStage; sector: string;
  tags: string[]; team: TeamMember[]; tokens: TokenEntry[];
  status: 'active' | 'paused' | 'archived'; visibility: 'private' | 'team' | 'public';
  vision?: string; problem?: string; solution?: string; targetMarket?: string;
  revenueModel?: string; competitors?: string[]; differentiators?: string[];
  milestones?: { name: string; description: string; timeframe: string }[];
  risks?: string[]; metrics?: string[];
  swot?: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[]; summary?: string };
  createdAt: string; updatedAt: string;
}

interface TeamMember {
  id: string; name: string; role: string; description?: string;
  skills?: string[]; priority?: string; memberType?: string; allocation?: string;
  joinedAt: string;
  bio?: string; email?: string; phone?: string; linkedin?: string; github?: string;
  location?: string; salary?: string; availability?: string;
  portfolio?: string; avatar?: string;
}

interface TokenEntry { memberId: string; amount: number; reason: string; date: string; }

type EventType = 'meeting' | 'call' | 'demo' | 'pitch' | 'review' | 'deadline' | 'social' | 'other';

type AttendanceStatus = 'pending' | 'confirmed' | 'declined' | 'tentative' | 'attended' | 'no-show';

interface EventAttendee {
  name: string; role?: string; email?: string; external?: boolean;
  attendance: AttendanceStatus;
}

interface CalendarEvent {
  _id?: string; _rev?: string; type: 'event'; projectId: string;
  title: string; description?: string; eventType: EventType;
  date: string; time: string; duration: number;
  attendees: EventAttendee[];
  location?: string; videoLink?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string; createdAt: string;
  shareId?: string; recurring?: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';
  color?: string; priority?: 'low' | 'normal' | 'high' | 'urgent';
  agenda?: string[];
}

interface StopdownPitch {
  _id?: string; _rev?: string; type: 'pitch'; projectId: string; projectName: string;
  elevator?: string; oneMinute?: string; threeMinute?: string;
  investorDeck?: { slide: string; content: string }[];
  qa?: { question: string; answer: string }[];
  votes: { up: number; down: number }; feedback: { author: string; type: string; text: string; date: string }[];
  status: 'draft' | 'published'; createdAt: string;
  extraPitches?: Record<string, string>;
}

interface StopdownDocument {
  _id?: string; _rev?: string; type: 'document'; projectId: string;
  name: string; category: DocCategory; content: string;
  accessLevel: 'founders' | 'team' | 'investors' | 'public';
  priority?: string; version: number; createdAt: string; updatedAt: string;
  fileName?: string; fileSize?: number; fileType?: string; fileDataUrl?: string;
  isFile?: boolean;
}

interface InvestorProposal {
  id: string; title: string; content: string; amount: string; equity: string;
  terms: string; createdAt: string;
}

interface StopdownInvestor {
  _id?: string; _rev?: string; type: 'investor'; projectId: string;
  name: string; investorType: string; why?: string; approach?: string;
  sectors: string[]; stages: string[]; ticketRange: { min: number; max: number };
  contactStatus: 'none' | 'contacted' | 'meeting' | 'negotiating' | 'committed' | 'rejected';
  createdAt: string;
  email?: string; phone?: string; website?: string; linkedin?: string;
  location?: string; notes?: string; fund?: string;
  proposals?: InvestorProposal[];
}

type ActionType = 'need-talent' | 'need-funding' | 'need-cofounder' | 'need-partner' | 'need-advice' | 'need-resource' | 'need-market' | 'custom';
type ActionSource = 'post' | 'video' | 'survey' | 'meeting' | 'direct';
type ActionStatus = 'open' | 'in-progress' | 'matched' | 'resolved' | 'closed';

interface ActionResponse { name: string; message: string; date: string; status: 'pending' | 'accepted' | 'rejected' }
interface ActionSynergy { partnerName: string; synergyType: string; status: 'proposed' | 'active' | 'completed'; date: string }

interface StopdownAction {
  _id?: string; _rev?: string; type: 'action'; projectId: string;
  title: string; description: string;
  actionType: ActionType; source: ActionSource; status: ActionStatus;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  tags: string[];
  responses: ActionResponse[];
  synergies: ActionSynergy[];
  metrics: { views: number; interests: number; shares: number };
  createdAt: string; updatedAt: string; resolvedAt?: string;
}

// ── DB ───────────────────────────────────────────────────────────────────────

const DB = 'stopdown';
async function ensureDb() { try { await couchApi.createDb(DB); } catch { /* exists */ } }
async function loadDocs<T>(docType: string): Promise<(T & { _id: string; _rev: string })[]> {
  await ensureDb();
  const { docs } = await couchApi.getPaginatedDocs(DB, 500, 0);
  return docs.filter((d) => d.type === docType) as (T & { _id: string; _rev: string })[];
}
async function saveDoc(doc: Record<string, unknown>) {
  await ensureDb();
  if (doc._id) return couchApi.updateDoc(DB, doc._id as string, doc);
  return couchApi.createDoc(DB, doc);
}
async function delDoc(id: string, rev: string) { await couchApi.hardDeleteDoc(DB, id, rev); }

// ── Constants ────────────────────────────────────────────────────────────────

const STAGES: { key: ProjectStage; label: string; emoji: string }[] = [
  { key: 'ideation', label: 'Ideación', emoji: '💡' },
  { key: 'validation', label: 'Validación', emoji: '🔍' },
  { key: 'mvp', label: 'MVP', emoji: '🚀' },
  { key: 'growth', label: 'Crecimiento', emoji: '📈' },
  { key: 'scaling', label: 'Escalado', emoji: '🌍' },
  { key: 'exit', label: 'Exit', emoji: '🏆' },
];

const STAGE_COLORS: Record<string, { pill: string; pillDark: string }> = {
  ideation:   { pill: 'bg-violet-100 text-violet-700', pillDark: 'bg-violet-900/40 text-violet-300' },
  validation: { pill: 'bg-sky-100 text-sky-700',       pillDark: 'bg-sky-900/40 text-sky-300' },
  mvp:        { pill: 'bg-emerald-100 text-emerald-700', pillDark: 'bg-emerald-900/40 text-emerald-300' },
  growth:     { pill: 'bg-amber-100 text-amber-700',   pillDark: 'bg-amber-900/40 text-amber-300' },
  scaling:    { pill: 'bg-orange-100 text-orange-700',  pillDark: 'bg-orange-900/40 text-orange-300' },
  exit:       { pill: 'bg-rose-100 text-rose-700',      pillDark: 'bg-rose-900/40 text-rose-300' },
};

type Section = 'home' | 'project' | 'team' | 'pitch' | 'dataroom' | 'investors' | 'activity';

// ── Shared UI ────────────────────────────────────────────────────────────────

function Pill({ text, color, isDark }: { text: string; color?: string; isDark: boolean }) {
  const c = STAGE_COLORS[color || ''] || STAGE_COLORS.ideation;
  return <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full', isDark ? c.pillDark : c.pill)}>{text}</span>;
}

function AiButton({ label, loading, onClick, isDark, full }: { label: string; loading: boolean; onClick: () => void; isDark: boolean; full?: boolean }) {
  return (
    <button disabled={loading} onClick={onClick} className={cn(
      'flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold py-2 px-4 transition-all',
      'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-500/25',
      'disabled:opacity-60 disabled:cursor-not-allowed',
      full && 'w-full',
    )}>
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
      {loading ? 'Generando con IA...' : label}
    </button>
  );
}

function AiPromptBox({ value, onChange, onGenerate, loading, isDark, placeholder }: {
  value: string; onChange: (v: string) => void; onGenerate: () => void; loading: boolean; isDark: boolean; placeholder: string;
}) {
  return (
    <div className={cn('rounded-xl border-2 border-dashed p-4 transition-all', loading ? 'border-violet-500/50' : isDark ? 'border-zinc-700 hover:border-violet-600/50' : 'border-gray-300 hover:border-violet-400')}>
      <div className="flex items-center gap-2 mb-3">
        <div className="size-8 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
          <Wand2 className="size-4 text-white" />
        </div>
        <div>
          <p className={cn('text-xs font-bold', isDark ? 'text-zinc-100' : 'text-gray-900')}>Asistente IA</p>
          <p className={cn('text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>Describe tu idea y la IA lo genera todo</p>
        </div>
      </div>
      <textarea
        className={cn(
          'w-full text-xs rounded-lg border px-3 py-2.5 outline-none resize-none transition-colors focus:border-violet-500 mb-3',
          isDark ? 'bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-600' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400',
        )}
        rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onGenerate(); }}
      />
      <AiButton label="Generar con IA" loading={loading} onClick={onGenerate} isDark={isDark} full />
      <p className={cn('text-[9px] text-center mt-2', isDark ? 'text-zinc-600' : 'text-gray-400')}>Ctrl+Enter para generar</p>
    </div>
  );
}

function SectionNav({ label, icon: Icon, isDark, onBack }: { label: string; icon: typeof Rocket; isDark: boolean; onBack: () => void }) {
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2.5 border-b shrink-0', isDark ? 'border-zinc-800 bg-zinc-950' : 'border-gray-200 bg-white')}>
      <button onClick={onBack} className={cn('size-6 rounded-lg flex items-center justify-center transition-colors', isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500')}>
        <ChevronLeft className="size-4" />
      </button>
      <Icon className="size-4 text-violet-400" />
      <span className={cn('text-sm font-bold', isDark ? 'text-zinc-100' : 'text-gray-900')}>{label}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, isDark, onClick }: {
  icon: typeof Rocket; label: string; value: number | string; sub?: string; color: string; isDark: boolean; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className={cn(
      'rounded-xl border p-3 text-left transition-all group',
      isDark ? 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80 hover:border-zinc-700' : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300',
    )}>
      <div className={cn('size-8 rounded-lg flex items-center justify-center mb-2 transition-transform group-hover:scale-110', `bg-${color}-500/15`)}>
        <Icon className={cn('size-4', `text-${color}-400`)} />
      </div>
      <p className={cn('text-lg font-black', isDark ? 'text-zinc-50' : 'text-gray-900')}>{value}</p>
      <p className={cn('text-[10px] font-semibold', isDark ? 'text-zinc-400' : 'text-gray-600')}>{label}</p>
      {sub && <p className={cn('text-[9px] mt-0.5', isDark ? 'text-zinc-600' : 'text-gray-400')}>{sub}</p>}
    </button>
  );
}

function InfoBlock({ icon: Icon, title, items, isDark, color = 'violet' }: {
  icon: typeof Target; title: string; items: string[]; isDark: boolean; color?: string;
}) {
  if (!items?.length) return null;
  return (
    <div className={cn('rounded-xl border p-3', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={cn('size-3.5', `text-${color}-400`)} />
        <h4 className={cn('text-[10px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-400' : 'text-gray-500')}>{title}</h4>
      </div>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <CheckCircle2 className={cn('size-3 shrink-0 mt-0.5', `text-${color}-400/60`)} />
            <span className={cn('text-[10px] leading-relaxed', isDark ? 'text-zinc-300' : 'text-gray-700')}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── HOME ─────────────────────────────────────────────────────────────────────

function HomeView({ isDark, project, pitches, documents, investors, events, actions, onNavigate, onCreateProject, onAiReset, aiResetProgress }: {
  isDark: boolean; project: StopdownProject | null; pitches: StopdownPitch[];
  documents: StopdownDocument[]; investors: StopdownInvestor[]; events: CalendarEvent[]; actions: StopdownAction[];
  onNavigate: (s: Section) => void; onCreateProject: () => void;
  onAiReset: () => void; aiResetProgress: string | null;
}) {
  const [showFullDesc, setShowFullDesc] = useState(false);

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="size-20 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center mb-5 shadow-2xl shadow-violet-500/30">
          <Rocket className="size-10 text-white" />
        </div>
        <h2 className={cn('text-lg font-black text-center mb-2', isDark ? 'text-zinc-50' : 'text-gray-900')}>
          Crea tu Empresa
        </h2>
        <p className={cn('text-xs text-center max-w-[280px] mb-6 leading-relaxed', isDark ? 'text-zinc-400' : 'text-gray-500')}>
          Describe tu idea de negocio y la IA te ayudará a construir todo: proyecto, equipo, pitches, documentos legales e inversores.
        </p>
        <button onClick={onCreateProject} className={cn(
          'flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all',
          'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white',
          'shadow-xl shadow-violet-500/30 hover:shadow-violet-500/50 hover:scale-105',
        )}>
          <Wand2 className="size-4" />
          Empezar con IA
        </button>
        <button onClick={onAiReset} disabled={!!aiResetProgress}
          className={cn('flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold mt-3 transition-all',
            aiResetProgress
              ? 'bg-fuchsia-600/20 text-fuchsia-400 cursor-wait'
              : isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 ring-1 ring-zinc-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 ring-1 ring-gray-200',
          )}>
          {aiResetProgress ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {aiResetProgress || 'Generar TODO desde código'}
        </button>
        <div className="flex items-center gap-6 mt-8">
          {[{ icon: Rocket, l: 'Proyecto' }, { icon: Users, l: 'Equipo' }, { icon: Mic2, l: 'Pitches' }, { icon: FolderLock, l: 'Data Room' }, { icon: TrendingUp, l: 'Inversores' }].map((i) => (
            <div key={i.l} className="flex flex-col items-center gap-1">
              <i.icon className={cn('size-4', isDark ? 'text-zinc-600' : 'text-gray-300')} />
              <span className={cn('text-[8px] font-medium', isDark ? 'text-zinc-600' : 'text-gray-400')}>{i.l}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const p = project;
  const teamCount = p.team.length;
  const stageInfo = STAGES.find((s) => s.key === p.stage);
  const completeness = [
    p.name, p.description, p.vision, p.problem,
    teamCount > 0, pitches.length > 0, documents.length > 0, investors.length > 0,
  ].filter(Boolean).length;
  const pct = Math.round((completeness / 8) * 100);

  return (
    <div>
      {/* Header */}
      <div className={cn('px-4 pt-4 pb-3 border-b', isDark ? 'border-zinc-800' : 'border-gray-200')}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className={cn('text-base font-black', isDark ? 'text-zinc-50' : 'text-gray-900')}>{p.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Pill text={`${stageInfo?.emoji || ''} ${stageInfo?.label || p.stage}`} color={p.stage} isDark={isDark} />
              {p.sector && <span className={cn('text-[9px] font-medium', isDark ? 'text-zinc-500' : 'text-gray-400')}>{p.sector}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onAiReset} disabled={!!aiResetProgress}
              className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold transition-all',
                aiResetProgress
                  ? 'bg-fuchsia-600/20 text-fuchsia-400 cursor-wait'
                  : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-500/20',
              )}>
              {aiResetProgress ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
              {aiResetProgress ? 'Generando...' : 'Reset IA'}
            </button>
          </div>
        </div>
        {p.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {p.tags.map((t) => <span key={t} className={cn('text-[8px] px-1.5 py-0.5 rounded-full font-medium', isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-200 text-gray-600')}>#{t}</span>)}
          </div>
        )}

        {/* AI Reset progress */}
        {aiResetProgress && (
          <div className={cn('mt-2 flex items-center gap-2 p-2.5 rounded-xl border', isDark ? 'border-violet-800/40 bg-violet-950/20' : 'border-violet-200 bg-violet-50')}>
            <div className="relative shrink-0">
              <div className="size-8 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
                <Sparkles className="size-4 text-white animate-pulse" />
              </div>
              <div className="absolute -inset-1 rounded-full border-2 border-fuchsia-400/30 animate-ping" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-[10px] font-bold', isDark ? 'text-violet-300' : 'text-violet-700')}>IA trabajando como CEO</p>
              <p className={cn('text-[9px] font-medium truncate', isDark ? 'text-violet-400/70' : 'text-violet-500')}>{aiResetProgress}</p>
              <div className={cn('h-1 rounded-full mt-1.5 overflow-hidden', isDark ? 'bg-zinc-800' : 'bg-violet-200')}>
                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-500 animate-pulse" style={{ width: '100%' }} />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <div className={cn('flex-1 h-2 rounded-full overflow-hidden', isDark ? 'bg-zinc-800' : 'bg-gray-200')}>
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className={cn('text-[10px] font-bold tabular-nums', isDark ? 'text-zinc-400' : 'text-gray-500')}>{pct}%</span>
        </div>
        <p className={cn('text-[9px] mt-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>{completeness}/8 secciones completadas</p>
      </div>

      <div className="p-3 space-y-3">
        {/* Activity Pulse Banner */}
        {(() => {
          const openActs = actions.filter(a => a.status === 'open').length;
          const resolvedActs = actions.filter(a => a.status === 'resolved').length;
          const totalInterests = actions.reduce((s, a) => s + a.metrics.interests, 0);
          const totalSynergies = actions.reduce((s, a) => s + a.synergies.length, 0);
          const trScore = Math.min(100, Math.round(
            (resolvedActs / Math.max(actions.length, 1)) * 100 * 0.4 +
            Math.min(100, totalInterests * 8 + totalSynergies * 15) * 0.3 +
            Math.min(100, investors.filter(inv => inv.contactStatus !== 'none' && inv.contactStatus !== 'rejected').length * 12) * 0.3
          ));
          return (
            <button onClick={() => onNavigate('activity')} className={cn(
              'w-full relative rounded-xl border overflow-hidden text-left transition-all group hover:shadow-lg',
              isDark ? 'border-zinc-800 hover:border-violet-800/50' : 'border-gray-200 hover:border-violet-300',
            )}>
              <div className={cn('absolute inset-0', isDark ? 'bg-gradient-to-r from-violet-950/60 via-zinc-900/80 to-fuchsia-950/40' : 'bg-gradient-to-r from-violet-50 via-white to-fuchsia-50')} />
              <div className="relative flex items-center gap-3 p-3">
                <div className="relative shrink-0">
                  <div className="size-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20 group-hover:scale-105 transition-transform">
                    <Zap className="size-5 text-white" />
                  </div>
                  {openActs > 0 && (
                    <span className="absolute -top-1 -right-1 size-4 rounded-full bg-red-500 text-white text-[7px] font-black flex items-center justify-center animate-pulse">{openActs}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn('text-[10px] font-black', isDark ? 'text-zinc-100' : 'text-gray-900')}>Actividad & Tracción</p>
                    <span className={cn('text-[7px] font-bold px-1.5 py-0.5 rounded-full',
                      trScore >= 70 ? 'bg-emerald-500/20 text-emerald-400' : trScore >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400',
                    )}>{trScore} pts</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {actions.length > 0 && <span className={cn('text-[8px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>⚡ {actions.length} acciones</span>}
                    {totalSynergies > 0 && <span className={cn('text-[8px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>🤝 {totalSynergies} sinergias</span>}
                    {totalInterests > 0 && <span className={cn('text-[8px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>⭐ {totalInterests} interés</span>}
                    {actions.length === 0 && <span className={cn('text-[8px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>Crea acciones para generar tracción →</span>}
                  </div>
                  <div className={cn('h-1 rounded-full mt-1.5 overflow-hidden', isDark ? 'bg-zinc-800' : 'bg-gray-200')}>
                    <div className={cn('h-full rounded-full transition-all duration-700',
                      trScore >= 70 ? 'bg-gradient-to-r from-emerald-500 to-green-400' : trScore >= 40 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500',
                    )} style={{ width: `${Math.max(5, trScore)}%` }} />
                  </div>
                </div>
                <ChevronRight className={cn('size-4 shrink-0 group-hover:translate-x-0.5 transition-transform', isDark ? 'text-zinc-600' : 'text-gray-400')} />
              </div>
            </button>
          );
        })()}

        {/* Navigation cards */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'team' as Section, icon: Users, label: 'Equipo', value: String(teamCount), color: 'sky' },
            { key: 'pitch' as Section, icon: Mic2, label: 'Pitches', value: String(pitches.length), color: 'amber' },
            { key: 'dataroom' as Section, icon: FolderLock, label: 'Data Room', value: String(documents.length), color: 'orange' },
            { key: 'investors' as Section, icon: TrendingUp, label: 'Inversores', value: String(investors.length), color: 'cyan' },
            { key: 'calendar' as Section, icon: Calendar, label: 'Eventos', value: String(events.length), color: 'emerald' },
          ].map((item, idx) => (
            <button key={idx} onClick={() => onNavigate(item.key)} className={cn(
              'rounded-xl border p-2.5 text-left transition-all group hover:shadow-md',
              isDark ? 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80 hover:border-zinc-700' : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300',
            )}>
              <div className={cn('size-7 rounded-lg flex items-center justify-center mb-1.5 transition-transform group-hover:scale-110', `bg-${item.color}-500/15`)}>
                <item.icon className={cn('size-3.5', `text-${item.color}-400`)} />
              </div>
              <p className={cn('text-sm font-black', isDark ? 'text-zinc-50' : 'text-gray-900')}>{item.value}</p>
              <p className={cn('text-[9px] font-semibold', isDark ? 'text-zinc-500' : 'text-gray-500')}>{item.label}</p>
            </button>
          ))}
        </div>

        {/* Description */}
        {p.description && (
          <div className={cn('rounded-xl border p-4', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
            <div className="flex items-center gap-1.5 mb-2">
              <Building2 className={cn('size-3.5', isDark ? 'text-violet-400' : 'text-violet-500')} />
              <h4 className={cn('text-[10px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-400' : 'text-gray-500')}>Sobre la empresa</h4>
            </div>
            <p className={cn('text-[10px] leading-relaxed', isDark ? 'text-zinc-300' : 'text-gray-700', !showFullDesc && 'line-clamp-4')}>{p.description}</p>
            {p.description.length > 200 && (
              <button onClick={() => setShowFullDesc(!showFullDesc)} className="text-[9px] text-violet-400 hover:text-violet-300 mt-1 font-medium">
                {showFullDesc ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        )}

        {/* Vision */}
        {p.vision && (
          <div className={cn('rounded-xl border p-3', isDark ? 'border-violet-800/30 bg-violet-950/10' : 'border-violet-200/60 bg-violet-50/30')}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Eye className="size-3 text-violet-400" />
              <span className={cn('text-[9px] font-bold uppercase tracking-wider', isDark ? 'text-violet-400' : 'text-violet-600')}>Visión</span>
            </div>
            <p className={cn('text-[10px] leading-relaxed italic', isDark ? 'text-violet-200/70' : 'text-violet-800/70')}>{p.vision}</p>
          </div>
        )}

        {/* Problem / Solution / Market / Revenue */}
        {(p.problem || p.solution || p.targetMarket || p.revenueModel) && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: AlertCircle, title: 'Problema', text: p.problem, color: 'rose' },
              { icon: Lightbulb, title: 'Solución', text: p.solution, color: 'emerald' },
              { icon: Target, title: 'Mercado', text: p.targetMarket, color: 'sky' },
              { icon: Coins, title: 'Revenue', text: p.revenueModel, color: 'amber' },
            ].map((item) => item.text ? (
              <div key={item.title} className={cn('rounded-xl border p-2.5', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
                <div className="flex items-center gap-1 mb-1">
                  <item.icon className={cn('size-3', `text-${item.color}-400`)} />
                  <span className={cn('text-[9px] font-bold uppercase', isDark ? 'text-zinc-400' : 'text-gray-500')}>{item.title}</span>
                </div>
                <p className={cn('text-[9px] leading-relaxed line-clamp-3', isDark ? 'text-zinc-300' : 'text-gray-700')}>{item.text}</p>
              </div>
            ) : null)}
          </div>
        )}

        {/* Differentiators */}
        {p.differentiators && p.differentiators.length > 0 && (
          <InfoBlock icon={Star} title="Diferenciadores" items={p.differentiators} isDark={isDark} color="emerald" />
        )}

        {/* Competitors */}
        {p.competitors && p.competitors.length > 0 && (
          <InfoBlock icon={Eye} title="Competidores" items={p.competitors} isDark={isDark} color="amber" />
        )}

        {/* KPIs */}
        {p.metrics && p.metrics.length > 0 && (
          <InfoBlock icon={BarChart3} title="KPIs / Métricas" items={p.metrics} isDark={isDark} color="sky" />
        )}

        {/* Risks */}
        {p.risks && p.risks.length > 0 && (
          <InfoBlock icon={ShieldAlert} title="Riesgos" items={p.risks} isDark={isDark} color="rose" />
        )}

        {/* SWOT */}
        {p.swot && (
          <div className={cn('rounded-xl border p-3', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
            <h4 className={cn('text-[10px] font-bold uppercase tracking-wider mb-2', isDark ? 'text-zinc-400' : 'text-gray-500')}>Análisis DAFO</h4>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Fortalezas', items: p.swot.strengths, color: 'emerald' },
                { label: 'Debilidades', items: p.swot.weaknesses, color: 'rose' },
                { label: 'Oportunidades', items: p.swot.opportunities, color: 'sky' },
                { label: 'Amenazas', items: p.swot.threats, color: 'amber' },
              ].map((q) => (
                <div key={q.label}>
                  <p className={cn('text-[8px] font-bold uppercase mb-1', `text-${q.color}-400`)}>{q.label}</p>
                  {q.items?.map((item, i) => <p key={i} className={cn('text-[9px] leading-relaxed', isDark ? 'text-zinc-400' : 'text-gray-600')}>• {item}</p>)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Roadmap */}
        {p.milestones && p.milestones.length > 0 && (
          <div className={cn('rounded-xl border p-3', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
            <h4 className={cn('text-[10px] font-bold uppercase tracking-wider mb-2.5', isDark ? 'text-zinc-400' : 'text-gray-500')}>Roadmap</h4>
            <div className="relative">
              <div className={cn('absolute left-[9px] top-3 bottom-3 w-px', isDark ? 'bg-violet-800/30' : 'bg-violet-200')} />
              {p.milestones.map((m, i) => (
                <div key={i} className="flex items-start gap-2.5 py-1.5 relative">
                  <div className={cn(
                    'size-5 rounded-full flex items-center justify-center shrink-0 text-[8px] font-black relative z-10 ring-2',
                    isDark ? 'bg-violet-900/60 text-violet-300 ring-zinc-900' : 'bg-violet-100 text-violet-700 ring-white',
                  )}>{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <span className={cn('text-[10px] font-semibold', isDark ? 'text-zinc-200' : 'text-gray-800')}>{m.name}</span>
                    {m.timeframe && <p className={cn('text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>{m.timeframe}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming events */}
        {events.length > 0 && (() => {
          const upcoming = events
            .filter(e => e.status === 'scheduled' && e.date >= new Date().toISOString().slice(0, 10))
            .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
            .slice(0, 4);
          if (upcoming.length === 0) return null;
          return (
            <div className={cn('rounded-xl border p-3', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-emerald-400" />
                  <h4 className={cn('text-[10px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-400' : 'text-gray-500')}>Próximos eventos</h4>
                </div>
                <button onClick={() => onNavigate('calendar')} className={cn('text-[9px] font-bold', isDark ? 'text-violet-400 hover:text-violet-300' : 'text-violet-600 hover:text-violet-500')}>Ver todos →</button>
              </div>
              <div className="space-y-1.5">
                {upcoming.map(ev => (
                  <div key={ev._id} className={cn('flex items-center gap-2.5 p-2 rounded-lg', isDark ? 'bg-zinc-800/40' : 'bg-white')}>
                    <div className={cn('w-10 text-center shrink-0')}>
                      <p className={cn('text-[8px] font-bold uppercase', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                        {new Date(ev.date + 'T00:00:00').toLocaleDateString('es', { weekday: 'short' })}
                      </p>
                      <p className={cn('text-sm font-black', isDark ? 'text-zinc-100' : 'text-gray-900')}>
                        {new Date(ev.date + 'T00:00:00').getDate()}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-[10px] font-bold truncate', isDark ? 'text-zinc-200' : 'text-gray-800')}>{ev.title}</p>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('text-[8px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>{ev.time}</span>
                        {ev.attendees.length > 0 && (
                          <span className={cn('text-[8px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>· {ev.attendees.map(a => a.name).slice(0, 2).join(', ')}{ev.attendees.length > 2 ? ` +${ev.attendees.length - 2}` : ''}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}

// ── PROJECT ──────────────────────────────────────────────────────────────────

const GENERATABLE_RESOURCES: {
  id: string; icon: string; label: string; desc: string;
  category: DocCategory; prompt: string; accessLevel: StopdownDocument['accessLevel'];
}[] = [
  { id: 'swot', icon: '🎯', label: 'Análisis DAFO / SWOT', desc: 'Fortalezas, debilidades, oportunidades y amenazas', category: 'technical', prompt: 'Genera un análisis DAFO/SWOT completo y detallado para este proyecto, con al menos 5 puntos por cada cuadrante.', accessLevel: 'team' },
  { id: 'business-plan', icon: '📋', label: 'Plan de Negocio', desc: 'Resumen ejecutivo, modelo de negocio y proyecciones', category: 'financial', prompt: 'Genera un plan de negocio completo: resumen ejecutivo, descripción del negocio, análisis de mercado, estrategia de marketing, plan de operaciones, proyecciones financieras a 3 años y necesidades de financiación.', accessLevel: 'founders' },
  { id: 'lean-canvas', icon: '🧩', label: 'Lean Canvas', desc: 'Canvas de modelo de negocio simplificado', category: 'technical', prompt: 'Genera un Lean Canvas completo con: problema, segmentos de clientes, propuesta de valor única, solución, canales, flujos de ingresos, estructura de costes, métricas clave y ventaja injusta.', accessLevel: 'team' },
  { id: 'bmc', icon: '🗺️', label: 'Business Model Canvas', desc: 'Canvas de modelo de negocio de Osterwalder', category: 'technical', prompt: 'Genera un Business Model Canvas completo con: socios clave, actividades clave, recursos clave, propuesta de valor, relaciones con clientes, canales, segmentos de clientes, estructura de costes y fuentes de ingresos.', accessLevel: 'team' },
  { id: 'financial-model', icon: '💰', label: 'Modelo Financiero', desc: 'Proyecciones de ingresos, costes y punto de equilibrio', category: 'financial', prompt: 'Genera un modelo financiero detallado con: proyecciones de ingresos mensuales primer año, costes fijos y variables, margen bruto, punto de equilibrio (break-even), flujo de caja proyectado y necesidades de capital.', accessLevel: 'founders' },
  { id: 'cap-table', icon: '📊', label: 'Cap Table', desc: 'Tabla de capitalización y distribución de equity', category: 'financial', prompt: 'Genera una tabla de capitalización (cap table) con distribución de equity sugerida entre fundadores, pool de empleados, inversores seed y series A, con dilución estimada.', accessLevel: 'founders' },
  { id: 'go-to-market', icon: '🚀', label: 'Go-To-Market Strategy', desc: 'Estrategia de lanzamiento y adquisición de clientes', category: 'technical', prompt: 'Genera una estrategia Go-To-Market completa: posicionamiento, pricing, canales de distribución, plan de lanzamiento, primeros 100 clientes, partnerships estratégicos y métricas de éxito.', accessLevel: 'team' },
  { id: 'market-research', icon: '🔍', label: 'Estudio de Mercado', desc: 'TAM/SAM/SOM, tendencias y análisis competitivo', category: 'technical', prompt: 'Genera un estudio de mercado completo: TAM/SAM/SOM con cifras estimadas, tendencias del sector, análisis de competidores con comparativa detallada, barreras de entrada y oportunidades.', accessLevel: 'team' },
  { id: 'user-personas', icon: '👤', label: 'User Personas', desc: 'Perfiles detallados de usuarios objetivo', category: 'technical', prompt: 'Genera 3-4 user personas detalladas con: nombre, edad, ocupación, objetivos, frustraciones, comportamiento digital, willingness to pay, canal preferido de contacto y cita representativa.', accessLevel: 'team' },
  { id: 'value-proposition', icon: '💎', label: 'Propuesta de Valor', desc: 'Value Proposition Canvas detallado', category: 'technical', prompt: 'Genera un Value Proposition Canvas completo: trabajos del cliente (jobs to be done), dolores, ganancias esperadas, y cómo el producto alivia dolores y crea ganancias.', accessLevel: 'team' },
  { id: 'nda-template', icon: '🔒', label: 'Plantilla NDA', desc: 'Acuerdo de confidencialidad adaptado', category: 'nda', prompt: 'Genera una plantilla de acuerdo de confidencialidad (NDA) bilateral profesional, adaptada al sector del proyecto, con cláusulas de confidencialidad, excepciones, duración, jurisdicción y penalizaciones.', accessLevel: 'founders' },
  { id: 'cofounders-agreement', icon: '🤝', label: 'Acuerdo de Cofundadores', desc: 'Pacto de socios y distribución de roles', category: 'agreement', prompt: 'Genera una plantilla de acuerdo de cofundadores con: distribución de equity, vesting schedule, cliff, roles y responsabilidades, toma de decisiones, IP, cláusula de buen/mal leaver, dedicación y resolución de conflictos.', accessLevel: 'founders' },
  { id: 'term-sheet', icon: '📝', label: 'Term Sheet', desc: 'Plantilla de hoja de términos para inversores', category: 'contract', prompt: 'Genera una plantilla de term sheet para ronda seed/pre-seed con: valoración pre/post-money, tipo de instrumento (SAFE, convertible, equity), liquidation preferences, anti-dilución, board seats, derechos pro-rata y drag/tag along.', accessLevel: 'founders' },
  { id: 'investor-deck-script', icon: '🎤', label: 'Guión de Pitch Deck', desc: 'Script de presentación slide por slide', category: 'pitch-deck', prompt: 'Genera un guión detallado para un pitch deck de 12 slides: cover, problema, solución, mercado, producto, modelo de negocio, tracción, competencia, equipo, financieros, ask y contacto. Incluye lo que decir en cada slide.', accessLevel: 'team' },
  { id: 'one-pager', icon: '📄', label: 'One Pager', desc: 'Resumen ejecutivo de una página para inversores', category: 'pitch-deck', prompt: 'Genera un one-pager para inversores con: headline impactante, problema/solución, mercado, modelo de negocio, tracción/hitos, equipo, ask financiero y contacto. Conciso y potente.', accessLevel: 'investors' },
  { id: 'press-release', icon: '📰', label: 'Nota de Prensa', desc: 'Comunicado de prensa de lanzamiento', category: 'other', prompt: 'Genera una nota de prensa profesional anunciando el lanzamiento del proyecto: headline, subtítulo, lead paragraph, citas del CEO, descripción del producto, datos de mercado, disponibilidad y boilerplate de empresa.', accessLevel: 'public' },
  { id: 'faq', icon: '❓', label: 'FAQ Inversores', desc: 'Preguntas frecuentes de inversores y respuestas', category: 'other', prompt: 'Genera un documento FAQ con las 15-20 preguntas más frecuentes que hacen los inversores y respuestas detalladas y convincentes adaptadas a este proyecto.', accessLevel: 'investors' },
  { id: 'risk-matrix', icon: '⚠️', label: 'Matriz de Riesgos', desc: 'Análisis de riesgos con probabilidad e impacto', category: 'technical', prompt: 'Genera una matriz de riesgos detallada con: al menos 10 riesgos categorizados (mercado, técnico, financiero, regulatorio, equipo), probabilidad, impacto, severidad y plan de mitigación para cada uno.', accessLevel: 'team' },
  { id: 'okrs', icon: '🎯', label: 'OKRs Trimestrales', desc: 'Objetivos y resultados clave para el próximo trimestre', category: 'technical', prompt: 'Genera OKRs (Objectives and Key Results) para los próximos 3 trimestres, con 3-4 objetivos por trimestre y 3-4 key results medibles por objetivo, adaptados a la etapa actual del proyecto.', accessLevel: 'team' },
  { id: 'tech-stack', icon: '⚙️', label: 'Arquitectura Técnica', desc: 'Stack tecnológico y decisiones de arquitectura', category: 'technical', prompt: 'Genera un documento de arquitectura técnica con: stack recomendado (frontend, backend, DB, cloud), arquitectura de sistema, ADRs (Architecture Decision Records), escalabilidad, seguridad y estimación de costes de infraestructura.', accessLevel: 'team' },
  { id: 'hiring-plan', icon: '👥', label: 'Plan de Contratación', desc: 'Roles necesarios, timeline y costes', category: 'financial', prompt: 'Genera un plan de contratación para los próximos 18 meses: roles necesarios por trimestre, descripción de cada puesto, rango salarial, prioridad, perfil ideal y coste total proyectado.', accessLevel: 'founders' },
  { id: 'milestones', icon: '🏁', label: 'Roadmap / Hitos', desc: 'Timeline con hitos clave y entregables', category: 'technical', prompt: 'Genera un roadmap detallado a 18 meses con hitos clave, entregables, dependencias, métricas de éxito por hito y timeline visual trimestral.', accessLevel: 'team' },
  { id: 'pitch-email', icon: '✉️', label: 'Email de Pitch', desc: 'Plantilla de email frío para inversores', category: 'other', prompt: 'Genera 3 variantes de cold email para contactar inversores: versión corta (3 líneas), versión media (1 párrafo) y versión larga (2-3 párrafos). Incluye subject lines y follow-up templates.', accessLevel: 'team' },
  { id: 'legal-checklist', icon: '⚖️', label: 'Checklist Legal', desc: 'Lista de requisitos legales para la constitución', category: 'legal', prompt: 'Genera un checklist legal completo para constituir la empresa: tipo de sociedad, trámites de constitución, protección de propiedad intelectual, RGPD/privacidad, licencias necesarias, seguros y compliance regulatorio.', accessLevel: 'founders' },
];

const CODE_SCAN_PRIORITY = [
  'package.json', 'README.md', 'readme.md', 'README',
  'composer.json', 'Cargo.toml', 'pyproject.toml', 'setup.py', 'go.mod', 'Gemfile', 'pom.xml', 'build.gradle',
  '.env.example', 'docker-compose.yml', 'Dockerfile',
];
const CODE_SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb', '.php', '.vue', '.svelte'];
const CODE_SCAN_SKIP = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'vendor', 'target', '.cache'];

async function scanCodebase(): Promise<string> {
  const chunks: string[] = [];
  let totalLen = 0;
  const maxLen = 12000;

  try {
    const allFiles: string[] = await agentApi.searchFiles('');

    const priorityFiles = CODE_SCAN_PRIORITY
      .map(name => allFiles.find(f => f === name || f.endsWith('/' + name)))
      .filter(Boolean) as string[];

    for (const fp of priorityFiles) {
      if (totalLen > maxLen) break;
      try {
        const { content, truncated } = await agentApi.readFile(fp);
        if (content && !truncated) {
          const snippet = content.slice(0, 2000);
          chunks.push(`── ${fp} ──\n${snippet}`);
          totalLen += snippet.length;
        }
      } catch { /* skip */ }
    }

    const srcFiles = allFiles.filter(f => {
      if (CODE_SCAN_SKIP.some(s => f.includes(s + '/'))) return false;
      if (priorityFiles.includes(f)) return false;
      return CODE_SCAN_EXTENSIONS.some(ext => f.endsWith(ext));
    });

    const entryPatterns = [
      /\/(index|main|app|server|routes?|api)\.(ts|tsx|js|jsx|py|go|rs)$/i,
      /\/src\//i, /\/lib\//i, /\/pages\//i, /\/components\//i,
    ];
    const sorted = [...srcFiles].sort((a, b) => {
      const aScore = entryPatterns.filter(p => p.test(a)).length;
      const bScore = entryPatterns.filter(p => p.test(b)).length;
      return bScore - aScore;
    });

    for (const fp of sorted.slice(0, 20)) {
      if (totalLen > maxLen) break;
      try {
        const { content, truncated } = await agentApi.readFile(fp);
        if (!content || truncated) continue;
        const snippet = content.slice(0, 1500);
        chunks.push(`── ${fp} ──\n${snippet}`);
        totalLen += snippet.length;
      } catch { /* skip */ }
    }

    const tree = srcFiles.slice(0, 80).join('\n');
    chunks.unshift(`── ESTRUCTURA DE ARCHIVOS (${allFiles.length} archivos) ──\n${tree}`);
  } catch { /* */ }

  return chunks.join('\n\n');
}

function ProjectView({ isDark, project, onSave, onSaveDoc, onBack, onRefresh, onNavigateDataRoom, embedded }: {
  isDark: boolean; project: StopdownProject | null;
  onSave: (p: StopdownProject) => Promise<void>; onSaveDoc: (d: StopdownDocument) => Promise<void>;
  onBack: () => void; onRefresh: () => void; onNavigateDataRoom: () => void;
  embedded?: boolean;
}) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatingFromCode, setGeneratingFromCode] = useState(false);
  const [codeProgress, setCodeProgress] = useState('');
  const [showFull, setShowFull] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [generatingRes, setGeneratingRes] = useState<string | null>(null);
  const [generatedRes, setGeneratedRes] = useState<Set<string>>(new Set());
  const [showResources, setShowResources] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [genAllCurrent, setGenAllCurrent] = useState(0);
  const [genAllTotal, setGenAllTotal] = useState(0);
  const genAllAbortRef = useRef(false);

  const generate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    try {
      const { result } = await agentApi.stopdownGenerate('project', prompt);
      const r = result as Record<string, unknown>;
      const now = new Date().toISOString();
      const proj: StopdownProject = {
        ...(project?._id ? { _id: project._id, _rev: project._rev } : {}),
        type: 'project', name: (r.name as string) || 'Mi Proyecto',
        description: (r.description as string) || '', stage: (r.stage as ProjectStage) || 'ideation',
        sector: (r.sector as string) || '', tags: (r.tags as string[]) || [],
        team: project?.team || [], tokens: project?.tokens || [],
        status: 'active', visibility: 'private',
        vision: (r.vision as string) || '', problem: (r.problem as string) || '',
        solution: (r.solution as string) || '', targetMarket: (r.targetMarket as string) || '',
        revenueModel: (r.revenueModel as string) || '',
        competitors: (r.competitors as string[]) || [], differentiators: (r.differentiators as string[]) || [],
        milestones: (r.milestones as StopdownProject['milestones']) || [],
        risks: (r.risks as string[]) || [], metrics: (r.metrics as string[]) || [],
        swot: project?.swot, createdAt: project?.createdAt || now, updatedAt: now,
      };
      await onSave(proj);
      onRefresh();
    } catch { /* error handled silently */ }
    setGenerating(false);
  };

  const generateFromCode = async () => {
    setGeneratingFromCode(true);
    setCodeProgress('Escaneando estructura del proyecto...');
    try {
      const codeContext = await scanCodebase();
      setCodeProgress('Analizando código fuente...');
      const fullPrompt = `ANALIZA EL SIGUIENTE CÓDIGO FUENTE DE UN PROYECTO DE SOFTWARE Y GENERA LA IDEA DE NEGOCIO/PROYECTO BASÁNDOTE EN LO QUE HACE EL CÓDIGO. Explica qué problema resuelve, para quién, cómo funciona el producto, el mercado objetivo, modelo de negocio y diferenciadores técnicos. Usa el código como fuente de verdad.\n\n${codeContext}`;
      setCodeProgress('Generando proyecto con IA...');
      const { result } = await agentApi.stopdownGenerate('project', fullPrompt);
      const r = result as Record<string, unknown>;
      const now = new Date().toISOString();
      const proj: StopdownProject = {
        ...(project?._id ? { _id: project._id, _rev: project._rev } : {}),
        type: 'project', name: (r.name as string) || 'Mi Proyecto',
        description: (r.description as string) || '', stage: (r.stage as ProjectStage) || 'mvp',
        sector: (r.sector as string) || 'technology', tags: (r.tags as string[]) || [],
        team: project?.team || [], tokens: project?.tokens || [],
        status: 'active', visibility: 'private',
        vision: (r.vision as string) || '', problem: (r.problem as string) || '',
        solution: (r.solution as string) || '', targetMarket: (r.targetMarket as string) || '',
        revenueModel: (r.revenueModel as string) || '',
        competitors: (r.competitors as string[]) || [], differentiators: (r.differentiators as string[]) || [],
        milestones: (r.milestones as StopdownProject['milestones']) || [],
        risks: (r.risks as string[]) || [], metrics: (r.metrics as string[]) || [],
        swot: project?.swot, createdAt: project?.createdAt || now, updatedAt: now,
      };
      await onSave(proj);
      onRefresh();
    } catch { /* */ }
    setGeneratingFromCode(false);
    setCodeProgress('');
  };

  const generateResource = async (res: typeof GENERATABLE_RESOURCES[number]) => {
    if (!project || generatingRes) return;
    setGeneratingRes(res.id);
    try {
      const ctx = `Proyecto: ${project.name}\nDescripción: ${project.description}\nSector: ${project.sector}\nEtapa: ${project.stage}\nProblema: ${project.problem}\nSolución: ${project.solution}\nMercado: ${project.targetMarket}\nRevenue: ${project.revenueModel}\nVisión: ${project.vision || ''}\nCompetidores: ${(project.competitors || []).join(', ')}\nDiferenciadores: ${(project.differentiators || []).join(', ')}\nRiesgos: ${(project.risks || []).join(', ')}\n\nINSTRUCCIÓN: ${res.prompt}`;
      const { result } = await agentApi.stopdownGenerate('pitch', ctx);
      const r = result as Record<string, unknown>;
      const content = typeof r === 'string' ? r : (r.threeMinute as string) || (r.oneMinute as string) || (r.elevator as string) || JSON.stringify(r, null, 2);
      const now = new Date().toISOString();
      const doc: StopdownDocument = {
        type: 'document', projectId: project._id || '',
        name: res.label, category: res.category, content,
        accessLevel: res.accessLevel, priority: 'essential',
        version: 1, createdAt: now, updatedAt: now,
      };
      await onSaveDoc(doc);
      setGeneratedRes(prev => new Set(prev).add(res.id));
      onRefresh();
    } catch { /* */ }
    setGeneratingRes(null);
  };

  const generateAllResources = async () => {
    if (!project || generatingAll || generatingRes) return;
    genAllAbortRef.current = false;
    setGeneratingAll(true);
    const pending = GENERATABLE_RESOURCES.filter(r => !generatedRes.has(r.id));
    setGenAllTotal(pending.length);
    setGenAllCurrent(0);

    for (let i = 0; i < pending.length; i++) {
      if (genAllAbortRef.current) break;
      const res = pending[i];
      setGenAllCurrent(i + 1);
      setGeneratingRes(res.id);
      try {
        const ctx = `Proyecto: ${project.name}\nDescripción: ${project.description}\nSector: ${project.sector}\nEtapa: ${project.stage}\nProblema: ${project.problem}\nSolución: ${project.solution}\nMercado: ${project.targetMarket}\nRevenue: ${project.revenueModel}\nVisión: ${project.vision || ''}\nCompetidores: ${(project.competitors || []).join(', ')}\nDiferenciadores: ${(project.differentiators || []).join(', ')}\nRiesgos: ${(project.risks || []).join(', ')}\n\nINSTRUCCIÓN: ${res.prompt}`;
        const { result } = await agentApi.stopdownGenerate('pitch', ctx);
        const r = result as Record<string, unknown>;
        const content = typeof r === 'string' ? r : (r.threeMinute as string) || (r.oneMinute as string) || (r.elevator as string) || JSON.stringify(r, null, 2);
        const now = new Date().toISOString();
        const doc: StopdownDocument = {
          type: 'document', projectId: project._id || '',
          name: res.label, category: res.category, content,
          accessLevel: res.accessLevel, priority: 'essential',
          version: 1, createdAt: now, updatedAt: now,
        };
        await onSaveDoc(doc);
        setGeneratedRes(prev => new Set(prev).add(res.id));
        onRefresh();
      } catch { /* continue with next */ }
    }

    setGeneratingRes(null);
    setGeneratingAll(false);
    setGenAllCurrent(0);
    setGenAllTotal(0);
  };

  const cancelGenerateAll = () => {
    genAllAbortRef.current = true;
  };

  const p = project;

  const content = (
    <div className={embedded ? 'p-3 space-y-3' : 'flex-1 overflow-y-auto p-3 space-y-3'}>
      {embedded && (
        <div className={cn('flex items-center gap-2 pt-1 pb-2 border-t', isDark ? 'border-zinc-800' : 'border-gray-200')}>
          <Rocket className={cn('size-4', isDark ? 'text-violet-400' : 'text-violet-500')} />
          <h3 className={cn('text-xs font-black uppercase tracking-wider', isDark ? 'text-zinc-300' : 'text-gray-700')}>Proyecto</h3>
        </div>
      )}
      <AiPromptBox value={prompt} onChange={setPrompt} onGenerate={generate} loading={generating} isDark={isDark}
        placeholder={p ? `Refinar: "${p.name}" — describe cambios o mejoras...` : 'Describe tu idea de negocio en detalle: qué problema resuelve, para quién, cómo funciona...'} />

        {/* Generate from code button */}
        <button onClick={generateFromCode} disabled={generatingFromCode || generating}
          className={cn(
            'w-full rounded-xl border-2 border-dashed p-3 transition-all group',
            generatingFromCode
              ? isDark ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-cyan-400/50 bg-cyan-50'
              : isDark ? 'border-zinc-700 hover:border-cyan-600/50 hover:bg-cyan-950/10' : 'border-gray-300 hover:border-cyan-400 hover:bg-cyan-50/50',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'size-9 rounded-lg flex items-center justify-center shadow-lg transition-colors',
              generatingFromCode
                ? 'bg-gradient-to-br from-cyan-500 to-blue-600 shadow-cyan-500/30'
                : 'bg-gradient-to-br from-cyan-600 to-blue-700 shadow-cyan-500/20 group-hover:from-cyan-500 group-hover:to-blue-600',
            )}>
              {generatingFromCode ? <Loader2 className="size-4 text-white animate-spin" /> : <Code2 className="size-4 text-white" />}
            </div>
            <div className="flex-1 text-left">
              <p className={cn('text-[11px] font-bold', isDark ? 'text-zinc-100' : 'text-gray-800')}>
                {generatingFromCode ? 'Analizando código...' : 'Generar desde código fuente'}
              </p>
              <p className={cn('text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                {codeProgress || 'La IA analiza tu código y genera el proyecto automáticamente'}
              </p>
            </div>
            {!generatingFromCode && <Code2 className={cn('size-4 transition-colors', isDark ? 'text-zinc-600 group-hover:text-cyan-400' : 'text-gray-300 group-hover:text-cyan-500')} />}
          </div>
          {generatingFromCode && (
            <div className="mt-2.5">
              <div className={cn('h-1 rounded-full overflow-hidden', isDark ? 'bg-zinc-800' : 'bg-gray-200')}>
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 animate-pulse" style={{ width: codeProgress.includes('Generando') ? '80%' : codeProgress.includes('Analizando') ? '50%' : '25%' }} />
              </div>
              <p className={cn('text-[8px] mt-1 text-center font-medium', isDark ? 'text-cyan-400/70' : 'text-cyan-600/70')}>{codeProgress}</p>
            </div>
          )}
        </button>

        {/* Resource Generator - right below code source button */}
        {p && (
          <div className={cn('rounded-xl border overflow-hidden', isDark ? 'border-zinc-800' : 'border-gray-200')}>
            <button onClick={() => setShowResources(!showResources)}
              className={cn('w-full flex items-center justify-between px-3 py-3 transition-colors',
                isDark ? 'bg-gradient-to-r from-violet-950/40 to-cyan-950/40 hover:from-violet-950/60 hover:to-cyan-950/60'
                  : 'bg-gradient-to-r from-violet-50 to-cyan-50 hover:from-violet-100 hover:to-cyan-100')}>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-violet-400" />
                <div className="text-left">
                  <p className={cn('text-[11px] font-bold', isDark ? 'text-zinc-100' : 'text-gray-800')}>Generador de Recursos</p>
                  <p className={cn('text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-500')}>
                    {generatedRes.size}/{GENERATABLE_RESOURCES.length} generados · Se guardan en Data Room
                  </p>
                </div>
              </div>
              <ChevronDown className={cn('size-4 transition-transform', !showResources && '-rotate-90', isDark ? 'text-zinc-500' : 'text-gray-400')} />
            </button>

            {showResources && (
              <div className={cn('border-t', isDark ? 'border-zinc-800' : 'border-gray-200')}>
                {/* Generate All button + progress */}
                <div className={cn('px-3 py-2 border-b flex items-center gap-2', isDark ? 'border-zinc-800/60' : 'border-gray-100')}>
                  {generatingAll ? (
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Loader2 className="size-3.5 animate-spin text-violet-400" />
                          <span className={cn('text-[10px] font-bold', isDark ? 'text-violet-300' : 'text-violet-600')}>
                            Generando {genAllCurrent}/{genAllTotal}
                          </span>
                        </div>
                        <button onClick={cancelGenerateAll}
                          className={cn('text-[8px] font-bold px-2 py-0.5 rounded-lg transition-colors', isDark ? 'text-red-400 hover:bg-red-900/20' : 'text-red-500 hover:bg-red-50')}>
                          Cancelar
                        </button>
                      </div>
                      <div className={cn('h-1.5 rounded-full overflow-hidden', isDark ? 'bg-zinc-800' : 'bg-gray-200')}>
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500 ease-out"
                          style={{ width: `${genAllTotal > 0 ? (genAllCurrent / genAllTotal) * 100 : 0}%` }}
                        />
                      </div>
                      <p className={cn('text-[8px] font-medium', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                        {generatingRes ? `Generando: ${GENERATABLE_RESOURCES.find(r => r.id === generatingRes)?.label || ''}...` : 'Preparando...'}
                      </p>
                    </div>
                  ) : (
                    <>
                      <button onClick={generateAllResources} disabled={!!generatingRes}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold transition-all',
                          'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-md shadow-violet-500/20',
                          'disabled:opacity-40 disabled:cursor-not-allowed',
                        )}>
                        <Wand2 className="size-3.5" />
                        Generar todos los recursos
                        <span className={cn('text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-white/20')}>
                          {GENERATABLE_RESOURCES.length - generatedRes.size} pendientes
                        </span>
                      </button>
                      {generatedRes.size > 0 && (
                        <button onClick={onNavigateDataRoom}
                          className={cn('shrink-0 text-[9px] font-bold px-2 py-1.5 rounded-lg transition-colors', isDark ? 'text-violet-400 hover:bg-violet-900/20' : 'text-violet-600 hover:bg-violet-50')}>
                          Data Room →
                        </button>
                      )}
                    </>
                  )}
                </div>

                {generatedRes.size > 0 && !generatingAll && (
                  <div className={cn('flex items-center justify-between px-3 py-1.5 border-b', isDark ? 'border-zinc-800/60 bg-emerald-950/10' : 'border-gray-100 bg-emerald-50/50')}>
                    <span className={cn('text-[9px] font-semibold', isDark ? 'text-emerald-400' : 'text-emerald-600')}>
                      ✓ {generatedRes.size}/{GENERATABLE_RESOURCES.length} recursos generados
                    </span>
                  </div>
                )}
                <div className="max-h-[400px] overflow-y-auto p-2 space-y-1.5">
                  {GENERATABLE_RESOURCES.map(res => {
                    const isGenerating = generatingRes === res.id;
                    const isGenerated = generatedRes.has(res.id);
                    return (
                      <div key={res.id} className={cn(
                        'flex items-center gap-2.5 p-2 rounded-lg transition-all',
                        isGenerating
                          ? isDark ? 'bg-violet-950/20 border border-violet-800/30' : 'bg-violet-50/60 border border-violet-200/60'
                          : isGenerated
                            ? isDark ? 'bg-emerald-950/15 border border-emerald-800/20' : 'bg-emerald-50/50 border border-emerald-200/60'
                            : isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-gray-50',
                      )}>
                        <span className="text-base shrink-0 leading-none">{res.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-[10px] font-bold truncate', isDark ? 'text-zinc-200' : 'text-gray-800')}>{res.label}</p>
                          <p className={cn('text-[8px] truncate', isDark ? 'text-zinc-600' : 'text-gray-400')}>{res.desc}</p>
                        </div>
                        {isGenerating ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Loader2 className="size-3 animate-spin text-violet-400" />
                            <span className={cn('text-[8px] font-bold', isDark ? 'text-violet-400' : 'text-violet-500')}>
                              {generatingAll ? `${genAllCurrent}/${genAllTotal}` : 'Generando...'}
                            </span>
                          </div>
                        ) : isGenerated ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <Check className="size-3 text-emerald-400" />
                            <button onClick={() => generateResource(res)} disabled={!!generatingRes || generatingAll}
                              className={cn('text-[8px] font-bold px-1.5 py-0.5 rounded disabled:opacity-30', isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')}>
                              Regen
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => generateResource(res)} disabled={!!generatingRes || generatingAll}
                            className={cn(
                              'shrink-0 px-2 py-1 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1',
                              isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-violet-900/30 hover:text-violet-300 disabled:opacity-30' : 'bg-gray-100 text-gray-500 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-30',
                            )}>
                            <Sparkles className="size-3" />
                            Generar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {p && (
          <>
            <div className={cn('rounded-xl border p-4', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
              <div className="flex items-center justify-between mb-2">
                <h3 className={cn('text-sm font-black', isDark ? 'text-zinc-50' : 'text-gray-900')}>{p.name}</h3>
                <Pill text={STAGES.find((s) => s.key === p.stage)?.label || p.stage} color={p.stage} isDark={isDark} />
              </div>
              <p className={cn('text-[10px] leading-relaxed', isDark ? 'text-zinc-300' : 'text-gray-700', !showFull && 'line-clamp-4')}>{p.description}</p>
              {p.description.length > 200 && (
                <button onClick={() => setShowFull(!showFull)} className="text-[9px] text-violet-400 hover:text-violet-300 mt-1">{showFull ? 'Ver menos' : 'Ver más'}</button>
              )}
              {p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.tags.map((t) => <span key={t} className={cn('text-[8px] px-1.5 py-0.5 rounded-full font-medium', isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-200 text-gray-600')}>#{t}</span>)}
                </div>
              )}
            </div>

            <div className={cn('grid gap-2', expandedCards.size > 0 ? 'grid-cols-1' : 'grid-cols-2')}>
              {[
                { icon: AlertCircle, title: 'Problema', text: p.problem, color: 'rose' },
                { icon: Lightbulb, title: 'Solución', text: p.solution, color: 'emerald' },
                { icon: Target, title: 'Mercado', text: p.targetMarket, color: 'sky' },
                { icon: Coins, title: 'Revenue', text: p.revenueModel, color: 'amber' },
              ].map((item) => {
                if (!item.text) return null;
                const isExpanded = expandedCards.has(item.title);
                return (
                  <div key={item.title} className={cn('rounded-xl border p-2.5', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
                    <div className="flex items-center gap-1 mb-1">
                      <item.icon className={cn('size-3', `text-${item.color}-400`)} />
                      <span className={cn('text-[9px] font-bold uppercase', isDark ? 'text-zinc-400' : 'text-gray-500')}>{item.title}</span>
                    </div>
                    <p className={cn('text-[9px] leading-relaxed', isDark ? 'text-zinc-300' : 'text-gray-700', !isExpanded && 'line-clamp-3')}>{item.text}</p>
                    {item.text.length > 100 && (
                      <button
                        onClick={() => setExpandedCards(prev => {
                          const next = new Set(prev);
                          if (next.has(item.title)) next.delete(item.title);
                          else next.add(item.title);
                          return next;
                        })}
                        className="text-[9px] text-violet-400 hover:text-violet-300 mt-1"
                      >
                        {isExpanded ? 'Ver menos' : 'Ver más'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <InfoBlock icon={Star} title="Diferenciadores" items={p.differentiators || []} isDark={isDark} color="emerald" />
            <InfoBlock icon={Eye} title="Competidores" items={p.competitors || []} isDark={isDark} color="amber" />
            <InfoBlock icon={BarChart3} title="KPIs / Métricas" items={p.metrics || []} isDark={isDark} color="sky" />
            <InfoBlock icon={ShieldAlert} title="Riesgos" items={p.risks || []} isDark={isDark} color="rose" />

            {/* SWOT if exists */}
            {p.swot && (
              <div className={cn('rounded-xl border p-3', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
                <h4 className={cn('text-[10px] font-bold uppercase tracking-wider mb-2', isDark ? 'text-zinc-400' : 'text-gray-500')}>Análisis DAFO</h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Fortalezas', items: p.swot.strengths, color: 'emerald' },
                    { label: 'Debilidades', items: p.swot.weaknesses, color: 'rose' },
                    { label: 'Oportunidades', items: p.swot.opportunities, color: 'sky' },
                    { label: 'Amenazas', items: p.swot.threats, color: 'amber' },
                  ].map((q) => (
                    <div key={q.label}>
                      <p className={cn('text-[8px] font-bold uppercase mb-1', `text-${q.color}-400`)}>{q.label}</p>
                      {q.items?.map((item, i) => <p key={i} className={cn('text-[9px] leading-relaxed', isDark ? 'text-zinc-400' : 'text-gray-600')}>• {item}</p>)}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </>
        )}
      </div>
  );

  if (embedded) return content;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SectionNav label="Proyecto" icon={Rocket} isDark={isDark} onBack={onBack} />
      {content}
    </div>
  );
}

// ── TEAM ─────────────────────────────────────────────────────────────────────

function generateProfileHtml(member: TeamMember, projectName: string): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const initial = member.name ? member.name.charAt(0).toUpperCase() : member.role.charAt(0).toUpperCase();
  const skills = (member.skills || []).map(s => `<span class="skill">${e(s)}</span>`).join('');
  const contacts: string[] = [];
  if (member.email) contacts.push(`<a href="mailto:${e(member.email)}" class="contact-link">✉ ${e(member.email)}</a>`);
  if (member.phone) contacts.push(`<span class="contact-link">📞 ${e(member.phone)}</span>`);
  if (member.linkedin) contacts.push(`<a href="${e(member.linkedin)}" target="_blank" class="contact-link">🔗 LinkedIn</a>`);
  if (member.github) contacts.push(`<a href="${e(member.github)}" target="_blank" class="contact-link">💻 GitHub</a>`);
  if (member.portfolio) contacts.push(`<a href="${e(member.portfolio)}" target="_blank" class="contact-link">🌐 Portfolio</a>`);

  const infoItems: string[] = [];
  if (member.location) infoItems.push(`<div class="info-item"><span class="info-icon">📍</span><span>${e(member.location)}</span></div>`);
  if (member.salary) infoItems.push(`<div class="info-item"><span class="info-icon">💰</span><span>${e(member.salary)}</span></div>`);
  if (member.allocation) infoItems.push(`<div class="info-item"><span class="info-icon">⏰</span><span>${e(member.allocation)}</span></div>`);
  if (member.memberType) infoItems.push(`<div class="info-item"><span class="info-icon">🏷</span><span>${e(member.memberType)}</span></div>`);
  if (member.availability) infoItems.push(`<div class="info-item"><span class="info-icon">📅</span><span>${e(member.availability)}</span></div>`);

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${e(member.name || member.role)} — ${e(projectName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;background:#09090b;font-family:'Space Grotesk',sans-serif;color:#fff;display:flex;align-items:center;justify-content:center;padding:40px 20px}
.profile{max-width:520px;width:100%}
.header{text-align:center;margin-bottom:32px}
.avatar{width:88px;height:88px;border-radius:20px;background:linear-gradient(135deg,#0ea5e9,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:800;color:#fff;margin:0 auto 20px;box-shadow:0 8px 32px rgba(139,92,246,.3)}
.name{font-family:'Playfair Display',serif;font-size:clamp(24px,4vw,36px);font-weight:700;background:linear-gradient(135deg,#fff,#93c5fd);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:4px}
.role{font-size:14px;color:#a78bfa;font-weight:600;letter-spacing:1px;text-transform:uppercase}
.priority{display:inline-block;margin-top:8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;padding:4px 12px;border-radius:20px;background:rgba(139,92,246,.12);border:1px solid rgba(139,92,246,.25);color:#a78bfa}
.section{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:24px;margin-bottom:16px}
.section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.3);margin-bottom:12px}
.bio{font-size:14px;line-height:1.8;color:rgba(255,255,255,.75)}
.skills{display:flex;flex-wrap:wrap;gap:8px}
.skill{font-size:11px;font-weight:600;padding:6px 14px;border-radius:10px;background:rgba(14,165,233,.1);border:1px solid rgba(14,165,233,.2);color:#38bdf8}
.contacts{display:flex;flex-wrap:wrap;gap:8px}
.contact-link{font-size:12px;color:#93c5fd;text-decoration:none;padding:6px 14px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);transition:background .2s}
.contact-link:hover{background:rgba(255,255,255,.08)}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.info-item{display:flex;align-items:center;gap:8px;font-size:12px;color:rgba(255,255,255,.6);padding:8px 12px;border-radius:10px;background:rgba(255,255,255,.03)}
.info-icon{font-size:14px}
.footer{text-align:center;margin-top:32px;font-size:10px;color:rgba(255,255,255,.15)}
</style></head><body>
<div class="profile">
<div class="header">
  <div class="avatar">${initial}</div>
  <div class="name">${e(member.name || member.role)}</div>
  <div class="role">${e(member.role)}</div>
  ${member.priority ? `<div class="priority">${e(member.priority)}</div>` : ''}
</div>
${(member.bio || member.description) ? `<div class="section"><div class="section-title">Sobre mí</div><div class="bio">${e(member.bio || member.description || '')}</div></div>` : ''}
${skills ? `<div class="section"><div class="section-title">Skills</div><div class="skills">${skills}</div></div>` : ''}
${infoItems.length ? `<div class="section"><div class="section-title">Información</div><div class="info-grid">${infoItems.join('')}</div></div>` : ''}
${contacts.length ? `<div class="section"><div class="section-title">Contacto</div><div class="contacts">${contacts.join('')}</div></div>` : ''}
<div class="footer">${e(member.name || member.role)} · ${e(projectName)}</div>
</div></body></html>`;
}

function downloadProfileHtml(member: TeamMember, projectName: string) {
  const html = generateProfileHtml(member, projectName);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (member.name || member.role).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  a.download = `perfil-${safeName}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Member Profile Panel ──

function MemberProfilePanel({ member, isDark, onUpdate, onClose, onDelete, projectName }: {
  member: TeamMember; isDark: boolean;
  onUpdate: (updated: TeamMember) => void; onClose: () => void; onDelete: () => void; projectName: string;
}) {
  const [form, setForm] = useState<TeamMember>({ ...member });
  const [newSkill, setNewSkill] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setForm({ ...member }); setDirty(false); }, [member]);

  const set = <K extends keyof TeamMember>(key: K, val: TeamMember[K]) => {
    setForm(f => ({ ...f, [key]: val }));
    setDirty(true);
    setSaved(false);
  };

  const addSkill = () => {
    if (!newSkill.trim()) return;
    set('skills', [...(form.skills || []), newSkill.trim()]);
    setNewSkill('');
  };

  const removeSkill = (skill: string) => {
    set('skills', (form.skills || []).filter(s => s !== skill));
  };

  const save = () => {
    onUpdate(form);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const profileCompleteness = [
    form.name, form.role, form.bio, form.description,
    (form.skills || []).length > 0, form.email, form.salary, form.location,
  ].filter(Boolean).length;
  const profilePct = Math.round((profileCompleteness / 8) * 100);

  const inputClass = cn(
    'w-full text-[11px] rounded-lg border px-2.5 py-1.5 outline-none transition-colors focus:border-violet-500/50',
    isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400',
  );

  const labelClass = cn('text-[9px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-500' : 'text-gray-400');

  const initial = form.name ? form.name.charAt(0).toUpperCase() : form.role.charAt(0).toUpperCase();

  return (
    <div className={cn('absolute inset-0 z-[80] flex flex-col', isDark ? 'bg-zinc-950' : 'bg-white')}>
      {/* Header */}
      <div className={cn('flex items-center justify-between px-3 py-2 border-b shrink-0', isDark ? 'border-zinc-800 bg-zinc-900' : 'border-gray-200 bg-gray-50')}>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className={cn('size-6 rounded-lg flex items-center justify-center', isDark ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-200 text-gray-500')}>
            <ChevronLeft className="size-4" />
          </button>
          <span className={cn('text-xs font-bold', isDark ? 'text-zinc-100' : 'text-gray-800')}>Perfil</span>
          <span className={cn('text-[8px] font-semibold px-1.5 py-0.5 rounded-full', profilePct >= 75 ? 'bg-emerald-900/30 text-emerald-400' : profilePct >= 50 ? 'bg-amber-900/30 text-amber-400' : 'bg-zinc-800 text-zinc-500')}>{profilePct}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => downloadProfileHtml(form, projectName)}
            className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors', isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            <Share2 className="size-3" /> Compartir
          </button>
          <button onClick={onDelete}
            className={cn('size-7 rounded-lg flex items-center justify-center transition-colors', isDark ? 'text-zinc-600 hover:text-red-400 hover:bg-zinc-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100')}>
            <Trash2 className="size-3" />
          </button>
          {dirty ? (
            <button onClick={save} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-500">
              <Check className="size-3" /> Guardar
            </button>
          ) : saved ? (
            <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-emerald-400">
              <Check className="size-3" /> Guardado
            </span>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Avatar + Name + Role */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <div className={cn('size-16 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg', 'bg-gradient-to-br from-sky-500 to-violet-600 text-white')}>
            {initial}
          </div>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre completo"
            className={cn('text-center text-sm font-bold bg-transparent border-none outline-none w-full', isDark ? 'text-zinc-100 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400')} />
          <input value={form.role} onChange={e => set('role', e.target.value)} placeholder="Rol / Cargo"
            className={cn('text-center text-[11px] bg-transparent border-none outline-none w-full', isDark ? 'text-violet-400 placeholder:text-zinc-600' : 'text-violet-600 placeholder:text-gray-400')} />
          {/* Completeness bar */}
          <div className="w-full max-w-[200px]">
            <div className={cn('h-1.5 rounded-full overflow-hidden', isDark ? 'bg-zinc-800' : 'bg-gray-200')}>
              <div className={cn('h-full rounded-full transition-all', profilePct >= 75 ? 'bg-emerald-500' : profilePct >= 50 ? 'bg-amber-500' : 'bg-violet-500')} style={{ width: `${profilePct}%` }} />
            </div>
            <p className={cn('text-[8px] text-center mt-0.5', isDark ? 'text-zinc-600' : 'text-gray-400')}>{profileCompleteness}/8 campos completados</p>
          </div>
        </div>

        {/* Bio */}
        <div>
          <p className={labelClass}>Biografía</p>
          <textarea value={form.bio || ''} onChange={e => set('bio', e.target.value)} rows={3} placeholder="Escribe una breve biografía..."
            className={cn(inputClass, 'resize-none min-h-[60px]')} />
        </div>

        {/* Description */}
        <div>
          <p className={labelClass}>Descripción del rol</p>
          <textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2} placeholder="¿Qué hace esta persona en el equipo?"
            className={cn(inputClass, 'resize-none')} />
        </div>

        {/* Skills */}
        <div>
          <p className={labelClass}>Skills</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {(form.skills || []).map(s => (
              <span key={s} className={cn('inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full', isDark ? 'bg-sky-900/30 text-sky-300' : 'bg-sky-100 text-sky-700')}>
                {s}
                <button onClick={() => removeSkill(s)} className="hover:text-red-400"><X className="size-2.5" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input value={newSkill} onChange={e => setNewSkill(e.target.value)} placeholder="Añadir skill"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
              className={cn(inputClass, 'flex-1')} />
            <button onClick={addSkill} disabled={!newSkill.trim()}
              className="px-2 rounded-lg bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-40 text-[10px] font-bold">+</button>
          </div>
        </div>

        {/* Contact Info */}
        <div>
          <p className={labelClass}>Contacto</p>
          <div className="space-y-2">
            {([
              { icon: Mail, key: 'email' as const, ph: 'email@ejemplo.com' },
              { icon: Phone, key: 'phone' as const, ph: '+34 600 000 000' },
              { icon: Globe, key: 'linkedin' as const, ph: 'https://linkedin.com/in/...' },
              { icon: ExternalLink, key: 'github' as const, ph: 'https://github.com/...' },
              { icon: Briefcase, key: 'portfolio' as const, ph: 'https://portfolio.com' },
            ] as const).map(f => (
              <div key={f.key} className="flex items-center gap-2">
                <f.icon className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
                <input value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} placeholder={f.ph} className={inputClass} />
              </div>
            ))}
          </div>
        </div>

        {/* Work Details */}
        <div>
          <p className={labelClass}>Detalles laborales</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <DollarSign className={cn('size-3', isDark ? 'text-zinc-500' : 'text-gray-400')} />
                <span className={cn('text-[8px] font-semibold', isDark ? 'text-zinc-500' : 'text-gray-400')}>Sueldo</span>
              </div>
              <input value={form.salary || ''} onChange={e => set('salary', e.target.value)} placeholder="€3.000/mes" className={inputClass} />
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <MapPin className={cn('size-3', isDark ? 'text-zinc-500' : 'text-gray-400')} />
                <span className={cn('text-[8px] font-semibold', isDark ? 'text-zinc-500' : 'text-gray-400')}>Ubicación</span>
              </div>
              <input value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="Madrid, España" className={inputClass} />
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Clock className={cn('size-3', isDark ? 'text-zinc-500' : 'text-gray-400')} />
                <span className={cn('text-[8px] font-semibold', isDark ? 'text-zinc-500' : 'text-gray-400')}>Dedicación</span>
              </div>
              <select value={form.allocation || ''} onChange={e => set('allocation', e.target.value)} className={inputClass}>
                <option value="">Seleccionar</option>
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="advisory">Advisory</option>
                <option value="freelance">Freelance</option>
              </select>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Users className={cn('size-3', isDark ? 'text-zinc-500' : 'text-gray-400')} />
                <span className={cn('text-[8px] font-semibold', isDark ? 'text-zinc-500' : 'text-gray-400')}>Tipo</span>
              </div>
              <select value={form.memberType || ''} onChange={e => set('memberType', e.target.value)} className={inputClass}>
                <option value="">Seleccionar</option>
                <option value="founder">Fundador</option>
                <option value="employee">Empleado</option>
                <option value="advisor">Advisor</option>
                <option value="freelance">Freelance</option>
                <option value="intern">Becario</option>
              </select>
            </div>
          </div>
        </div>

        {/* Availability */}
        <div>
          <p className={labelClass}>Disponibilidad</p>
          <input value={form.availability || ''} onChange={e => set('availability', e.target.value)} placeholder="Disponible inmediatamente / A partir de..." className={inputClass} />
        </div>

        {/* Priority */}
        <div>
          <p className={labelClass}>Prioridad de contratación</p>
          <div className="flex gap-1.5">
            {(['critical', 'high', 'medium', 'low'] as const).map(p => {
              const colors: Record<string, string> = { critical: 'bg-red-600', high: 'bg-amber-600', medium: 'bg-sky-600', low: 'bg-zinc-600' };
              const labels: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' };
              return (
                <button key={p} onClick={() => set('priority', p)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg text-[9px] font-bold transition-all',
                    form.priority === p
                      ? `${colors[p]} text-white shadow-md`
                      : isDark ? 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700' : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                  )}>
                  {labels[p]}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamView({ isDark, project, onSave, onBack, onRefresh }: {
  isDark: boolean; project: StopdownProject | null;
  onSave: (p: StopdownProject) => Promise<void>; onBack: () => void; onRefresh: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualRole, setManualRole] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const generate = async () => {
    if (!project) return;
    setGenerating(true);
    try {
      const ctx = `Proyecto: ${project.name}\n${project.description}\nSector: ${project.sector}\nEtapa: ${project.stage}\nProblema: ${project.problem}\nSolución: ${project.solution}`;
      const { result } = await agentApi.stopdownGenerate('team', ctx);
      const r = result as { roles?: { title: string; description?: string; skills?: string[]; priority?: string; type?: string; allocation?: string }[]; culture?: string };
      const now = new Date().toISOString();
      const members: TeamMember[] = (r.roles || []).map((role, i) => ({
        id: `ai-${Date.now()}-${i}`, name: '', role: role.title,
        description: role.description, skills: role.skills,
        priority: role.priority, memberType: role.type, allocation: role.allocation,
        joinedAt: now,
      }));
      const updated = { ...project, team: [...project.team, ...members], updatedAt: now };
      await onSave(updated);
      onRefresh();
    } catch { /* */ }
    setGenerating(false);
  };

  const addManual = async () => {
    if (!project || !manualRole.trim()) return;
    const member: TeamMember = { id: Date.now().toString(), name: manualName.trim(), role: manualRole.trim(), joinedAt: new Date().toISOString() };
    const updated = { ...project, team: [...project.team, member], updatedAt: new Date().toISOString() };
    await onSave(updated);
    onRefresh();
    setManualName(''); setManualRole('');
  };

  const removeMember = async (id: string) => {
    if (!project) return;
    const updated = { ...project, team: project.team.filter((m) => m.id !== id), updatedAt: new Date().toISOString() };
    await onSave(updated);
    onRefresh();
    if (selectedMemberId === id) setSelectedMemberId(null);
  };

  const updateMember = async (updated: TeamMember) => {
    if (!project) return;
    const newTeam = project.team.map(m => m.id === updated.id ? updated : m);
    await onSave({ ...project, team: newTeam, updatedAt: new Date().toISOString() });
    onRefresh();
  };

  const getMemberCompleteness = (m: TeamMember) => {
    return [m.name, m.role, m.bio, m.description, (m.skills || []).length > 0, m.email, m.salary, m.location].filter(Boolean).length;
  };

  const priorityColors: Record<string, string> = { critical: 'text-red-400', high: 'text-amber-400', medium: 'text-sky-400', low: 'text-zinc-400' };
  const typeLabels: Record<string, string> = { founder: 'Fundador', employee: 'Empleado', advisor: 'Advisor', freelance: 'Freelance', intern: 'Becario' };
  const selectedMember = project?.team.find(m => m.id === selectedMemberId);

  const filteredTeam = useMemo(() => {
    if (!project) return [];
    let list = project.team;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(m =>
        (m.name || '').toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        (m.bio || '').toLowerCase().includes(q) ||
        (m.skills || []).some(s => s.toLowerCase().includes(q)) ||
        (m.location || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q),
      );
    }
    if (filterType !== 'all') {
      list = list.filter(m => m.memberType === filterType);
    }
    return list;
  }, [project, searchQuery, filterType]);

  const teamTypes = useMemo(() => {
    if (!project) return [];
    const types = new Set(project.team.map(m => m.memberType).filter(Boolean));
    return Array.from(types) as string[];
  }, [project]);

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <SectionNav label="Equipo" icon={Users} isDark={isDark} onBack={onBack} />
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Sticky search */}
        <div className={cn('sticky -top-3 -mx-3 px-3 pt-3 pb-2 z-10 space-y-2', isDark ? 'bg-zinc-950/95 backdrop-blur-sm' : 'bg-white/95 backdrop-blur-sm')}>
          <div className="relative">
            <Search className={cn('absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5', isDark ? 'text-zinc-600' : 'text-gray-400')} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar por nombre, rol, skills..."
              className={cn('w-full text-[10px] rounded-lg border pl-8 pr-7 py-2 outline-none transition-colors focus:border-violet-500/50',
                isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400')} />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className={cn('absolute right-2 top-1/2 -translate-y-1/2', isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-gray-400 hover:text-gray-600')}>
                <X className="size-3" />
              </button>
            )}
          </div>
          {project && teamTypes.length > 1 && (
            <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5">
              <button onClick={() => setFilterType('all')}
                className={cn('shrink-0 px-2 py-1 rounded-lg text-[9px] font-bold transition-all',
                  filterType === 'all'
                    ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
                    : isDark ? 'text-zinc-500 hover:bg-zinc-800' : 'text-gray-400 hover:bg-gray-100',
                )}>
                Todos ({project.team.length})
              </button>
              {teamTypes.map(t => {
                const count = project.team.filter(m => m.memberType === t).length;
                return (
                  <button key={t} onClick={() => setFilterType(t)}
                    className={cn('shrink-0 px-2 py-1 rounded-lg text-[9px] font-bold transition-all',
                      filterType === t
                        ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
                        : isDark ? 'text-zinc-500 hover:bg-zinc-800' : 'text-gray-400 hover:bg-gray-100',
                    )}>
                    {typeLabels[t] || t} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {project && (
          <AiButton label="Generar equipo ideal con IA" loading={generating} onClick={generate} isDark={isDark} full />
        )}

        {project && project.team.length > 0 && (
          <div className={cn('flex items-center justify-between px-1')}>
            <span className={cn('text-[9px] font-semibold', isDark ? 'text-zinc-500' : 'text-gray-400')}>
              {filteredTeam.length === project.team.length
                ? `${project.team.length} miembro${project.team.length > 1 ? 's' : ''}`
                : `${filteredTeam.length} de ${project.team.length} miembro${project.team.length > 1 ? 's' : ''}`}
            </span>
            <span className={cn('text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
              {project.team.filter(m => getMemberCompleteness(m) >= 6).length} perfiles completos
            </span>
          </div>
        )}

        {filteredTeam.length === 0 && searchQuery && (
          <div className="text-center py-6">
            <Search className={cn('size-8 mx-auto mb-2', isDark ? 'text-zinc-700' : 'text-gray-300')} />
            <p className={cn('text-[10px] font-semibold', isDark ? 'text-zinc-500' : 'text-gray-400')}>Sin resultados para "{searchQuery}"</p>
          </div>
        )}

        {filteredTeam.map((m) => {
          const comp = getMemberCompleteness(m);
          const compPct = Math.round((comp / 8) * 100);
          return (
            <button key={m.id} onClick={() => setSelectedMemberId(m.id)}
              className={cn(
                'w-full rounded-xl border p-3 transition-all text-left group hover:shadow-md',
                selectedMemberId === m.id
                  ? isDark ? 'border-violet-700/50 bg-violet-950/20 ring-1 ring-violet-600/30' : 'border-violet-300 bg-violet-50/30 ring-1 ring-violet-300'
                  : isDark ? 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-800/60' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white',
              )}>
              <div className="flex items-start gap-2.5">
                <div className={cn('size-11 rounded-xl flex items-center justify-center text-sm font-black transition-transform group-hover:scale-105 shrink-0', 'bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-md')}>
                  {m.name ? m.name.charAt(0).toUpperCase() : m.role.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={cn('text-[11px] font-bold truncate', isDark ? 'text-zinc-100' : 'text-gray-900')}>{m.name || m.role}</p>
                    <ChevronRight className={cn('size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5', isDark ? 'text-zinc-600' : 'text-gray-300')} />
                  </div>
                  {m.name && <p className={cn('text-[10px] font-medium', isDark ? 'text-violet-400' : 'text-violet-600')}>{m.role}</p>}

                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {m.memberType && (
                      <span className={cn('text-[8px] px-1.5 py-0.5 rounded-full font-semibold', isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-200 text-gray-500')}>
                        {typeLabels[m.memberType] || m.memberType}
                      </span>
                    )}
                    {m.allocation && <span className={cn('text-[8px] font-medium', isDark ? 'text-zinc-500' : 'text-gray-400')}>{m.allocation}</span>}
                    {m.priority && <span className={cn('text-[8px] font-bold uppercase', priorityColors[m.priority] || 'text-zinc-400')}>{m.priority}</span>}
                    {m.salary && <span className={cn('text-[8px] font-semibold', isDark ? 'text-emerald-400' : 'text-emerald-600')}>{m.salary}</span>}
                    {m.location && <span className={cn('text-[8px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>📍 {m.location}</span>}
                  </div>

                  {/* Bio preview */}
                  {m.bio && (
                    <p className={cn('text-[9px] leading-relaxed line-clamp-1 mt-1', isDark ? 'text-zinc-500' : 'text-gray-500')}>{m.bio}</p>
                  )}

                  {/* Skills + completeness */}
                  <div className="flex items-center justify-between mt-1.5 gap-2">
                    {m.skills && m.skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                        {m.skills.slice(0, 3).map((s) => <span key={s} className={cn('text-[7px] px-1.5 py-0.5 rounded-full', isDark ? 'bg-sky-900/30 text-sky-300' : 'bg-sky-100 text-sky-700')}>{s}</span>)}
                        {m.skills.length > 3 && <span className={cn('text-[7px] px-1 py-0.5', isDark ? 'text-zinc-500' : 'text-gray-400')}>+{m.skills.length - 3}</span>}
                      </div>
                    ) : <div className="flex-1" />}
                    <div className="flex items-center gap-1 shrink-0">
                      <div className={cn('w-10 h-1 rounded-full overflow-hidden', isDark ? 'bg-zinc-800' : 'bg-gray-200')}>
                        <div className={cn('h-full rounded-full', compPct >= 75 ? 'bg-emerald-500' : compPct >= 50 ? 'bg-amber-500' : 'bg-zinc-500')} style={{ width: `${compPct}%` }} />
                      </div>
                      <span className={cn('text-[7px] font-bold', compPct >= 75 ? 'text-emerald-400' : compPct >= 50 ? 'text-amber-400' : isDark ? 'text-zinc-600' : 'text-gray-400')}>{compPct}%</span>
                    </div>
                  </div>

                  {/* Contact icons */}
                  {(m.email || m.phone || m.linkedin || m.github) && (
                    <div className="flex items-center gap-1.5 mt-1">
                      {m.email && <Mail className={cn('size-2.5', isDark ? 'text-zinc-600' : 'text-gray-300')} />}
                      {m.phone && <Phone className={cn('size-2.5', isDark ? 'text-zinc-600' : 'text-gray-300')} />}
                      {m.linkedin && <Globe className={cn('size-2.5', isDark ? 'text-zinc-600' : 'text-gray-300')} />}
                      {m.github && <ExternalLink className={cn('size-2.5', isDark ? 'text-zinc-600' : 'text-gray-300')} />}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {project && (
          <div className={cn('rounded-xl border-2 border-dashed p-3', isDark ? 'border-zinc-700' : 'border-gray-300')}>
            <p className={cn('text-[10px] font-semibold mb-2', isDark ? 'text-zinc-400' : 'text-gray-500')}>Añadir manualmente</p>
            <div className="flex gap-2">
              <input className={cn('flex-1 text-[10px] rounded-lg border px-2 py-1.5 outline-none', isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900')}
                placeholder="Nombre" value={manualName} onChange={(e) => setManualName(e.target.value)} />
              <input className={cn('flex-1 text-[10px] rounded-lg border px-2 py-1.5 outline-none', isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-white border-gray-200 text-gray-900')}
                placeholder="Rol *" value={manualRole} onChange={(e) => setManualRole(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addManual(); }} />
              <button onClick={addManual} disabled={!manualRole.trim()} className="px-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"><UserPlus className="size-3.5" /></button>
            </div>
          </div>
        )}
      </div>

      {selectedMember && (
        <MemberProfilePanel
          member={selectedMember}
          isDark={isDark}
          projectName={project?.name || ''}
          onUpdate={updateMember}
          onClose={() => setSelectedMemberId(null)}
          onDelete={() => removeMember(selectedMember.id)}
        />
      )}
    </div>
  );
}

// ── PROPOSAL AI STEPS ────────────────────────────────────────────────────────

const PROPOSAL_AI_STEPS = [
  { key: 'context', icon: '📖', duration: 1000 },
  { key: 'investor', icon: '🔍', duration: 1500 },
  { key: 'alignment', icon: '🎯', duration: 1800 },
  { key: 'proposal', icon: '📝', duration: 2200 },
  { key: 'financial', icon: '💰', duration: 1500 },
  { key: 'polish', icon: '✨', duration: 800 },
];

const PROPOSAL_STEP_LABELS: Record<string, string> = {
  context: 'Analizando contexto del proyecto...',
  investor: 'Estudiando perfil del inversor...',
  alignment: 'Identificando puntos de encaje...',
  proposal: 'Redactando propuesta personalizada...',
  financial: 'Añadiendo detalles financieros...',
  polish: 'Puliendo y finalizando...',
  done: 'Propuesta generada',
};

function useProposalAiSteps(active: boolean) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [done, setDone] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!active) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setCurrentStep(-1);
      setDone(false);
      return;
    }
    setDone(false);
    setCurrentStep(0);
    let elapsed = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < PROPOSAL_AI_STEPS.length; i++) {
      elapsed += PROPOSAL_AI_STEPS[i - 1].duration;
      const idx = i;
      timers.push(setTimeout(() => setCurrentStep(idx), elapsed));
    }
    timersRef.current = timers;
    return () => timers.forEach(clearTimeout);
  }, [active]);

  const markDone = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setCurrentStep(PROPOSAL_AI_STEPS.length);
    setDone(true);
  }, []);

  return { currentStep, done, markDone };
}

function ProposalStepsIndicator({ currentStep, done, isDark }: { currentStep: number; done: boolean; isDark: boolean }) {
  return (
    <div className={cn('rounded-xl border p-3 space-y-1', isDark ? 'border-zinc-700/60 bg-zinc-900/60' : 'border-cyan-200 bg-cyan-50/40')}>
      {PROPOSAL_AI_STEPS.map((step, i) => {
        const isActive = i === currentStep && !done;
        const isCompleted = i < currentStep || done;
        const isPending = i > currentStep && !done;
        return (
          <div key={step.key} className={cn(
            'flex items-center gap-2 px-2 py-1 rounded transition-all duration-300',
            isActive && (isDark ? 'bg-cyan-900/30' : 'bg-cyan-100'),
            isCompleted && 'opacity-70',
            isPending && 'opacity-30',
          )}>
            <span className="text-[12px] w-5 text-center shrink-0">
              {isCompleted ? <Check className="size-3 text-emerald-500 inline" /> : isActive ? <Loader2 className="size-3 animate-spin text-cyan-400 inline" /> : step.icon}
            </span>
            <span className={cn(
              'text-[10px] transition-colors duration-300',
              isActive && (isDark ? 'text-cyan-300 font-medium' : 'text-cyan-700 font-medium'),
              isCompleted && (isDark ? 'text-zinc-500' : 'text-gray-400'),
              isPending && (isDark ? 'text-zinc-600' : 'text-gray-300'),
            )}>
              {PROPOSAL_STEP_LABELS[step.key]}
            </span>
          </div>
        );
      })}
      {done && (
        <div className={cn('flex items-center gap-2 px-2 py-1 rounded mt-1', isDark ? 'bg-emerald-900/20' : 'bg-emerald-50')}>
          <Check className="size-3 text-emerald-500 shrink-0" />
          <span className={cn('text-[10px] font-semibold', isDark ? 'text-emerald-400' : 'text-emerald-600')}>{PROPOSAL_STEP_LABELS.done}</span>
        </div>
      )}
    </div>
  );
}

// ── PITCH AI STEPS ───────────────────────────────────────────────────────────

const PITCH_AI_STEPS = [
  { key: 'context', icon: '📖', duration: 1200 },
  { key: 'elevator', icon: '🚀', duration: 2000 },
  { key: 'scripts', icon: '🎤', duration: 2500 },
  { key: 'deck', icon: '📊', duration: 2200 },
  { key: 'qa', icon: '❓', duration: 1500 },
  { key: 'polish', icon: '✨', duration: 1000 },
];

const PITCH_STEP_LABELS: Record<string, string> = {
  context: 'Analizando contexto del proyecto...',
  elevator: 'Creando elevator pitch de 30s...',
  scripts: 'Redactando scripts de 1 y 3 minutos...',
  deck: 'Diseñando investor deck (10 slides)...',
  qa: 'Preparando Q&A para inversores...',
  polish: 'Puliendo y finalizando...',
  done: 'Pitches generados',
};

function usePitchAiSteps(active: boolean) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [done, setDone] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!active) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setCurrentStep(-1);
      setDone(false);
      return;
    }
    setDone(false);
    setCurrentStep(0);
    let elapsed = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < PITCH_AI_STEPS.length; i++) {
      elapsed += PITCH_AI_STEPS[i - 1].duration;
      const idx = i;
      timers.push(setTimeout(() => setCurrentStep(idx), elapsed));
    }
    timersRef.current = timers;
    return () => timers.forEach(clearTimeout);
  }, [active]);

  const markDone = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setCurrentStep(PITCH_AI_STEPS.length);
    setDone(true);
  }, []);

  return { currentStep, done, markDone };
}

function PitchStepsIndicator({ currentStep, done, isDark }: { currentStep: number; done: boolean; isDark: boolean }) {
  return (
    <div className={cn('rounded-xl border p-3 space-y-1', isDark ? 'border-zinc-700/60 bg-zinc-900/60' : 'border-violet-200 bg-violet-50/40')}>
      {PITCH_AI_STEPS.map((step, i) => {
        const isActive = i === currentStep && !done;
        const isCompleted = i < currentStep || done;
        const isPending = i > currentStep && !done;
        return (
          <div key={step.key} className={cn(
            'flex items-center gap-2 px-2 py-1 rounded transition-all duration-300',
            isActive && (isDark ? 'bg-violet-900/30' : 'bg-violet-100'),
            isCompleted && 'opacity-70',
            isPending && 'opacity-30',
          )}>
            <span className="text-[12px] w-5 text-center shrink-0">
              {isCompleted ? <Check className="size-3 text-emerald-500 inline" /> : isActive ? <Loader2 className="size-3 animate-spin text-violet-400 inline" /> : step.icon}
            </span>
            <span className={cn(
              'text-[10px] transition-colors duration-300',
              isActive && (isDark ? 'text-violet-300 font-medium' : 'text-violet-700 font-medium'),
              isCompleted && (isDark ? 'text-zinc-500' : 'text-gray-400'),
              isPending && (isDark ? 'text-zinc-600' : 'text-gray-300'),
            )}>
              {PITCH_STEP_LABELS[step.key]}
            </span>
          </div>
        );
      })}
      {done && (
        <div className={cn('flex items-center gap-2 px-2 py-1 rounded mt-1', isDark ? 'bg-emerald-900/20' : 'bg-emerald-50')}>
          <Check className="size-3 text-emerald-500 shrink-0" />
          <span className={cn('text-[10px] font-semibold', isDark ? 'text-emerald-400' : 'text-emerald-600')}>{PITCH_STEP_LABELS.done}</span>
        </div>
      )}
    </div>
  );
}

// ── PRESENTATION SLIDE TYPES ─────────────────────────────────────────────────

interface PresentationSlide {
  slideNumber: number;
  type: string;
  title: string;
  subtitle?: string;
  content: string;
  bullets?: string[];
  speakerNotes?: string;
}

interface PresentationData {
  title: string;
  subtitle: string;
  totalSlides: number;
  slides: PresentationSlide[];
}

const PRESENTATION_STEPS = [
  { key: 'analyze', icon: '🔍', duration: 2000 },
  { key: 'structure', icon: '📐', duration: 2500 },
  { key: 'slides', icon: '🎨', duration: 8000 },
  { key: 'narrative', icon: '📖', duration: 3000 },
  { key: 'design', icon: '✨', duration: 2500 },
  { key: 'finalize', icon: '🚀', duration: 1500 },
];

const PRESENTATION_STEP_LABELS: Record<string, string> = {
  analyze: 'Analizando contenido del pitch...',
  structure: 'Diseñando estructura narrativa...',
  slides: 'Generando 5-20 diapositivas con IA...',
  narrative: 'Construyendo flujo de storytelling...',
  design: 'Aplicando diseño profesional...',
  finalize: 'Finalizando presentación...',
  done: 'Presentación lista',
};

function usePresentationSteps(active: boolean) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [done, setDone] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!active) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setCurrentStep(-1);
      setDone(false);
      return;
    }
    setDone(false);
    setCurrentStep(0);
    let elapsed = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < PRESENTATION_STEPS.length; i++) {
      elapsed += PRESENTATION_STEPS[i - 1].duration;
      const idx = i;
      timers.push(setTimeout(() => setCurrentStep(idx), elapsed));
    }
    timersRef.current = timers;
    return () => timers.forEach(clearTimeout);
  }, [active]);

  const markDone = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setCurrentStep(PRESENTATION_STEPS.length);
    setDone(true);
  }, []);

  return { currentStep, done, markDone };
}

function PresentationStepsIndicator({ currentStep, done, isDark }: { currentStep: number; done: boolean; isDark: boolean }) {
  return (
    <div className={cn('rounded-xl border p-3 space-y-1', isDark ? 'border-zinc-700/60 bg-zinc-900/60' : 'border-violet-200 bg-violet-50/40')}>
      <div className={cn('text-[10px] font-bold mb-2 flex items-center gap-1.5', isDark ? 'text-violet-300' : 'text-violet-600')}>
        <Presentation className="size-3" /> Generando presentación...
      </div>
      {PRESENTATION_STEPS.map((step, i) => {
        const isActive = i === currentStep && !done;
        const isCompleted = i < currentStep || done;
        const isPending = i > currentStep && !done;
        return (
          <div key={step.key} className={cn(
            'flex items-center gap-2 px-2 py-1 rounded transition-all duration-300',
            isActive && (isDark ? 'bg-violet-900/30' : 'bg-violet-100'),
            isCompleted && 'opacity-70',
            isPending && 'opacity-30',
          )}>
            <span className="text-[12px] w-5 text-center shrink-0">
              {isCompleted ? <Check className="size-3 text-emerald-500 inline" /> : isActive ? <Loader2 className="size-3 animate-spin text-violet-400 inline" /> : step.icon}
            </span>
            <span className={cn(
              'text-[10px] transition-colors duration-300',
              isActive && (isDark ? 'text-violet-300 font-medium' : 'text-violet-700 font-medium'),
              isCompleted && (isDark ? 'text-zinc-500' : 'text-gray-400'),
              isPending && (isDark ? 'text-zinc-600' : 'text-gray-300'),
            )}>
              {PRESENTATION_STEP_LABELS[step.key]}
            </span>
          </div>
        );
      })}
      {done && (
        <div className={cn('flex items-center gap-2 px-2 py-1 rounded mt-1', isDark ? 'bg-emerald-900/20' : 'bg-emerald-50')}>
          <Check className="size-3 text-emerald-500 shrink-0" />
          <span className={cn('text-[10px] font-semibold', isDark ? 'text-emerald-400' : 'text-emerald-600')}>{PRESENTATION_STEP_LABELS.done}</span>
        </div>
      )}
    </div>
  );
}

// ── SLIDESHOW HTML GENERATOR ────────────────────────────────────────────────

function generateSlideshowHtml(data: PresentationData, projectName: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nl2br = (s: string) => esc(s).replace(/\n/g, '<br/>');

  const slideTypeColors: Record<string, { bg: string; accent: string; glow: string }> = {
    cover:          { bg: 'linear-gradient(135deg, #0f0526 0%, #1a0845 40%, #2d1163 100%)', accent: '#a78bfa', glow: 'rgba(139,92,246,.2)' },
    problem:        { bg: 'linear-gradient(135deg, #1a0000 0%, #2d0a0a 40%, #3d1515 100%)', accent: '#f87171', glow: 'rgba(248,113,113,.15)' },
    solution:       { bg: 'linear-gradient(135deg, #001a0f 0%, #0a2d1a 40%, #153d28 100%)', accent: '#34d399', glow: 'rgba(52,211,153,.15)' },
    market:         { bg: 'linear-gradient(135deg, #0a0f1a 0%, #15202d 40%, #1f3040 100%)', accent: '#60a5fa', glow: 'rgba(96,165,250,.15)' },
    product:        { bg: 'linear-gradient(135deg, #0f0526 0%, #1a0845 40%, #2d1163 100%)', accent: '#c084fc', glow: 'rgba(192,132,252,.15)' },
    traction:       { bg: 'linear-gradient(135deg, #1a0f00 0%, #2d1a0a 40%, #3d2815 100%)', accent: '#fbbf24', glow: 'rgba(251,191,36,.15)' },
    'business-model': { bg: 'linear-gradient(135deg, #001a1a 0%, #0a2d2d 40%, #153d3d 100%)', accent: '#2dd4bf', glow: 'rgba(45,212,191,.15)' },
    team:           { bg: 'linear-gradient(135deg, #0d0a1a 0%, #1a152d 40%, #271f40 100%)', accent: '#818cf8', glow: 'rgba(129,140,248,.15)' },
    financials:     { bg: 'linear-gradient(135deg, #0f1a00 0%, #1a2d0a 40%, #283d15 100%)', accent: '#a3e635', glow: 'rgba(163,230,53,.15)' },
    competition:    { bg: 'linear-gradient(135deg, #1a0011 0%, #2d0a1f 40%, #3d152d 100%)', accent: '#f472b6', glow: 'rgba(244,114,182,.15)' },
    roadmap:        { bg: 'linear-gradient(135deg, #001a12 0%, #0a2d1f 40%, #153d2d 100%)', accent: '#6ee7b7', glow: 'rgba(110,231,183,.15)' },
    vision:         { bg: 'linear-gradient(135deg, #0a001a 0%, #150a2d 40%, #1f1540 100%)', accent: '#e879f9', glow: 'rgba(232,121,249,.15)' },
    ask:            { bg: 'linear-gradient(135deg, #1a0a00 0%, #2d150a 40%, #401f15 100%)', accent: '#fb923c', glow: 'rgba(251,146,60,.15)' },
    closing:        { bg: 'linear-gradient(135deg, #0f0526 0%, #1a0845 40%, #2d1163 100%)', accent: '#a78bfa', glow: 'rgba(139,92,246,.2)' },
    quote:          { bg: 'linear-gradient(135deg, #0f0b1a 0%, #1a0d2e 50%, #0f0b1a 100%)', accent: '#fde68a', glow: 'rgba(253,230,138,.12)' },
    data:           { bg: 'linear-gradient(135deg, #00101a 0%, #0a1f2d 40%, #152d40 100%)', accent: '#38bdf8', glow: 'rgba(56,189,248,.15)' },
    metrics:        { bg: 'linear-gradient(135deg, #0a1a00 0%, #152d0a 40%, #1f4015 100%)', accent: '#4ade80', glow: 'rgba(74,222,128,.15)' },
    testimonial:    { bg: 'linear-gradient(135deg, #1a0a0f 0%, #2d1520 40%, #3d1f2d 100%)', accent: '#fb7185', glow: 'rgba(251,113,133,.15)' },
    demo:           { bg: 'linear-gradient(135deg, #001a1a 0%, #0a2d2d 40%, #153d3d 100%)', accent: '#22d3ee', glow: 'rgba(34,211,238,.15)' },
    'section-break': { bg: 'linear-gradient(135deg, #0a0a0a 0%, #151515 50%, #0a0a0a 100%)', accent: '#a1a1aa', glow: 'rgba(161,161,170,.1)' },
  };
  const defaultColors = { bg: 'linear-gradient(135deg, #0f0b1a 0%, #1a0d2e 40%, #2d1b4e 100%)', accent: '#a78bfa', glow: 'rgba(139,92,246,.15)' };

  const slidesHtml = data.slides.map((s, i) => {
    const colors = slideTypeColors[s.type] || defaultColors;
    const bulletsHtml = (s.bullets && s.bullets.length > 0)
      ? `<ul class="bullets">${s.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
      : '';
    const isCover = s.type === 'cover';
    const isClosing = s.type === 'closing';
    const isQuote = s.type === 'quote';
    const isSectionBreak = s.type === 'section-break';

    return `
    <section class="slide ${isCover ? 'slide-cover' : ''} ${isClosing ? 'slide-closing' : ''} ${isQuote ? 'slide-quote' : ''} ${isSectionBreak ? 'slide-break' : ''}"
      style="background:${colors.bg};--accent:${colors.accent};--glow:${colors.glow};animation-delay:${i * 0.05}s" data-slide="${i + 1}">
      <div class="slide-glow"></div>
      <div class="slide-inner">
        <div class="slide-header">
          <span class="slide-num">${String(i + 1).padStart(2, '0')} / ${String(data.slides.length).padStart(2, '0')}</span>
          <span class="slide-type">${esc(s.type)}</span>
        </div>
        ${isCover ? `
          <div class="cover-content">
            <h1 class="slide-title cover-title">${esc(s.title)}</h1>
            ${s.subtitle ? `<p class="slide-subtitle cover-sub">${esc(s.subtitle)}</p>` : ''}
            <div class="cover-meta">${esc(projectName)}</div>
          </div>
        ` : isQuote ? `
          <blockquote class="slide-blockquote">${nl2br(s.content)}</blockquote>
          ${s.subtitle ? `<cite class="slide-cite">— ${esc(s.subtitle)}</cite>` : ''}
        ` : isSectionBreak ? `
          <div class="break-content">
            <h2 class="slide-title break-title">${esc(s.title)}</h2>
            ${s.subtitle ? `<p class="slide-subtitle">${esc(s.subtitle)}</p>` : ''}
          </div>
        ` : `
          <h2 class="slide-title">${esc(s.title)}</h2>
          ${s.subtitle ? `<p class="slide-subtitle">${esc(s.subtitle)}</p>` : ''}
          <div class="slide-body">
            <div class="slide-content">${nl2br(s.content)}</div>
            ${bulletsHtml}
          </div>
        `}
      </div>
      <div class="slide-progress"><div class="slide-progress-bar" style="width:${((i + 1) / data.slides.length) * 100}%"></div></div>
    </section>`;
  }).join('\n');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(data.title)} — ${esc(projectName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>
:root{--accent:#a78bfa;--glow:rgba(139,92,246,.15)}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;scroll-snap-type:y mandatory}
body{font-family:'Space Grotesk',sans-serif;color:#fff;background:#09090b;overflow-x:hidden}
.slide{min-height:100vh;position:relative;display:flex;flex-direction:column;justify-content:center;padding:60px clamp(32px,6vw,80px);scroll-snap-align:start;overflow:hidden;animation:slideIn .8s ease both}
@keyframes slideIn{from{opacity:0}to{opacity:1}}
.slide-glow{position:absolute;width:500px;height:500px;background:radial-gradient(circle,var(--glow),transparent 70%);top:20%;right:-10%;pointer-events:none;opacity:.6}
.slide-inner{position:relative;z-index:1;max-width:900px;width:100%}
.slide-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:32px}
.slide-num{font-size:11px;font-weight:700;color:rgba(255,255,255,.2);letter-spacing:2px;font-variant-numeric:tabular-nums}
.slide-type{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--accent);opacity:.5;background:rgba(255,255,255,.03);padding:4px 10px;border-radius:20px;border:1px solid rgba(255,255,255,.06)}
.slide-title{font-family:'Playfair Display',serif;font-size:clamp(28px,4.5vw,52px);font-weight:700;line-height:1.15;margin-bottom:12px;background:linear-gradient(135deg,#fff 0%,var(--accent) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.slide-subtitle{font-size:clamp(14px,1.8vw,18px);color:var(--accent);font-weight:500;margin-bottom:24px;opacity:.8;letter-spacing:.5px}
.slide-body{margin-top:8px}
.slide-content{font-size:clamp(14px,1.5vw,17px);line-height:1.9;color:rgba(255,255,255,.75);max-width:760px}
.bullets{list-style:none;margin-top:24px;display:grid;gap:12px}
.bullets li{font-size:14px;line-height:1.7;color:rgba(255,255,255,.7);padding-left:24px;position:relative}
.bullets li::before{content:'';position:absolute;left:0;top:8px;width:8px;height:8px;border-radius:50%;background:var(--accent);opacity:.6}
.slide-progress{position:absolute;bottom:0;left:0;right:0;height:2px;background:rgba(255,255,255,.04)}
.slide-progress-bar{height:100%;background:var(--accent);opacity:.4;transition:width .3s ease}
.slide-cover{text-align:center;align-items:center}
.slide-cover .slide-inner{display:flex;flex-direction:column;align-items:center}
.cover-content{text-align:center}
.cover-title{font-size:clamp(36px,6vw,72px)!important;margin-bottom:20px}
.cover-sub{font-size:clamp(16px,2.2vw,24px)!important;margin-bottom:40px}
.cover-meta{font-size:12px;color:rgba(255,255,255,.25);letter-spacing:4px;text-transform:uppercase;font-weight:600;margin-top:16px}
.slide-closing{text-align:center;align-items:center}
.slide-closing .slide-inner{display:flex;flex-direction:column;align-items:center}
.slide-quote{align-items:center}
.slide-quote .slide-inner{display:flex;flex-direction:column;align-items:center;text-align:center}
.slide-blockquote{font-family:'Playfair Display',serif;font-size:clamp(22px,3vw,38px);font-style:italic;line-height:1.5;color:rgba(255,255,255,.85);max-width:700px;position:relative;padding:0 20px}
.slide-blockquote::before{content:'\\201C';font-size:80px;color:var(--accent);opacity:.3;position:absolute;top:-30px;left:-10px;font-family:'Playfair Display',serif}
.slide-cite{font-size:14px;color:var(--accent);margin-top:20px;opacity:.7}
.slide-break{align-items:center;text-align:center}
.slide-break .slide-inner{display:flex;flex-direction:column;align-items:center}
.break-title{font-size:clamp(32px,5vw,60px)!important}
.nav-dots{position:fixed;right:20px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;z-index:100}
.nav-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.15);border:none;cursor:pointer;transition:all .3s;padding:0}
.nav-dot:hover,.nav-dot.active{background:var(--accent);transform:scale(1.4)}
.toc{position:fixed;top:16px;left:16px;z-index:100}
.toc-btn{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 14px;font-size:10px;color:rgba(255,255,255,.5);cursor:pointer;font-family:'Space Grotesk',sans-serif;font-weight:600;letter-spacing:1px;text-transform:uppercase;backdrop-filter:blur(12px);transition:all .3s}
.toc-btn:hover{background:rgba(255,255,255,.1);color:rgba(255,255,255,.8)}
.footer-bar{text-align:center;padding:40px 24px;font-size:10px;color:rgba(255,255,255,.12);background:#09090b;border-top:1px solid rgba(255,255,255,.03)}
@media(max-width:768px){.slide{padding:40px 24px}.nav-dots{display:none}}
@media print{.slide{break-after:page;min-height:auto;padding:40px}.nav-dots,.toc{display:none}}
</style></head><body>
<nav class="nav-dots" id="navDots"></nav>
${slidesHtml}
<div class="footer-bar">${esc(projectName)} — ${esc(data.title)} · ${data.slides.length} diapositivas</div>
<script>
(function(){
  const slides=document.querySelectorAll('.slide');
  const nav=document.getElementById('navDots');
  slides.forEach((_,i)=>{
    const dot=document.createElement('button');
    dot.className='nav-dot';
    dot.title='Slide '+(i+1);
    dot.onclick=()=>slides[i].scrollIntoView({behavior:'smooth'});
    nav.appendChild(dot);
  });
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        const idx=parseInt(e.target.dataset.slide)-1;
        nav.querySelectorAll('.nav-dot').forEach((d,i)=>d.classList.toggle('active',i===idx));
      }
    });
  },{threshold:.5});
  slides.forEach(s=>observer.observe(s));
  document.addEventListener('keydown',e=>{
    const dots=[...nav.querySelectorAll('.nav-dot')];
    const active=dots.findIndex(d=>d.classList.contains('active'));
    if(e.key==='ArrowDown'||e.key===' '||e.key==='PageDown'){e.preventDefault();if(active<slides.length-1)slides[active+1].scrollIntoView({behavior:'smooth'})}
    if(e.key==='ArrowUp'||e.key==='PageUp'){e.preventDefault();if(active>0)slides[active-1].scrollIntoView({behavior:'smooth'})}
    if(e.key==='Home'){e.preventDefault();slides[0].scrollIntoView({behavior:'smooth'})}
    if(e.key==='End'){e.preventDefault();slides[slides.length-1].scrollIntoView({behavior:'smooth'})}
  });
})();
</script>
</body></html>`;
}

// ── PITCH HTML GENERATORS ────────────────────────────────────────────────────

function generatePitchHtml(
  type: 'elevator' | 'oneMinute' | 'threeMinute' | 'deck' | 'qa',
  pitch: StopdownPitch,
  projectName: string,
): string {
  const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const nl2br = (s: string) => escHtml(s).replace(/\n/g, '<br/>');
  const base = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">`;
  const font = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,700;1,400&display=swap" rel="stylesheet">`;

  if (type === 'elevator') {
    return `${base}<title>${escHtml(projectName)} — Elevator Pitch</title>${font}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f0b1a 0%,#1a0d2e 40%,#2d1b4e 100%);font-family:'Space Grotesk',sans-serif;color:#fff;padding:40px 20px}
.card{max-width:680px;width:100%;position:relative}
.badge{display:inline-flex;align-items:center;gap:6px;background:rgba(139,92,246,.15);border:1px solid rgba(139,92,246,.3);border-radius:40px;padding:6px 16px;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#a78bfa;margin-bottom:32px}
.badge::before{content:'';width:6px;height:6px;background:#a78bfa;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
h1{font-family:'Playfair Display',serif;font-size:clamp(28px,5vw,48px);font-weight:700;line-height:1.2;margin-bottom:40px;background:linear-gradient(135deg,#fff 0%,#c4b5fd 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.quote{font-size:clamp(16px,2.5vw,22px);line-height:1.8;color:rgba(255,255,255,.85);font-style:italic;position:relative;padding-left:24px;border-left:3px solid #8b5cf6}
.footer{margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center;font-size:12px;color:rgba(255,255,255,.3)}
.time{background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.2);border-radius:20px;padding:4px 12px;font-size:11px;color:#a78bfa}
</style>
<body><div class="card">
<div class="badge">Elevator Pitch · 30 segundos</div>
<h1>${escHtml(projectName)}</h1>
<div class="quote">${nl2br(pitch.elevator || '')}</div>
<div class="footer"><span>${escHtml(projectName)}</span><span class="time">⏱ 30s</span></div>
</div></body></html>`;
  }

  if (type === 'oneMinute' || type === 'threeMinute') {
    const content = type === 'oneMinute' ? pitch.oneMinute : pitch.threeMinute;
    const label = type === 'oneMinute' ? '1 Minuto' : '3 Minutos';
    const time = type === 'oneMinute' ? '1 min' : '3 min';
    return `${base}<title>${escHtml(projectName)} — Pitch ${label}</title>${font}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;background:#09090b;font-family:'Space Grotesk',sans-serif;color:#fff;padding:0}
.hero{min-height:35vh;display:flex;align-items:flex-end;padding:60px 48px 40px;background:linear-gradient(180deg,#1a0d2e 0%,#09090b 100%)}
.hero h1{font-family:'Playfair Display',serif;font-size:clamp(32px,5vw,56px);font-weight:700;background:linear-gradient(135deg,#fff,#c4b5fd);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero .sub{margin-top:12px;font-size:13px;color:#a78bfa;font-weight:600;letter-spacing:1.5px;text-transform:uppercase}
.content{max-width:720px;margin:0 auto;padding:48px;font-size:15px;line-height:2;color:rgba(255,255,255,.8)}
.content p{margin-bottom:20px}
.footer{text-align:center;padding:40px;font-size:11px;color:rgba(255,255,255,.2);border-top:1px solid rgba(255,255,255,.05)}
.badge{display:inline-flex;align-items:center;gap:6px;background:rgba(139,92,246,.12);border:1px solid rgba(139,92,246,.25);border-radius:40px;padding:5px 14px;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#a78bfa;margin-bottom:16px}
</style>
<body>
<div class="hero"><div><div class="badge">Pitch · ${time}</div><h1>${escHtml(projectName)}</h1><div class="sub">Pitch de ${label}</div></div></div>
<div class="content">${(content || '').split('\n').filter(Boolean).map(p => `<p>${escHtml(p)}</p>`).join('')}</div>
<div class="footer">${escHtml(projectName)} — Pitch ${label}</div>
</body></html>`;
  }

  if (type === 'deck') {
    const slides = pitch.investorDeck || [];
    const slidesHtml = slides.map((s, i) => `
<section class="slide" style="animation-delay:${i * 0.1}s">
  <div class="slide-num">${String(i + 1).padStart(2, '0')}</div>
  <h2>${escHtml(s.slide)}</h2>
  <p>${nl2br(s.content)}</p>
</section>`).join('');
    return `${base}<title>${escHtml(projectName)} — Investor Deck</title>${font}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#09090b;font-family:'Space Grotesk',sans-serif;color:#fff}
.cover{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 40px;background:linear-gradient(135deg,#0f0b1a,#1a0d2e,#2d1b4e);position:relative;overflow:hidden}
.cover::before{content:'';position:absolute;width:600px;height:600px;background:radial-gradient(circle,rgba(139,92,246,.15),transparent 70%);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none}
.cover h1{font-family:'Playfair Display',serif;font-size:clamp(40px,7vw,72px);font-weight:700;background:linear-gradient(135deg,#fff,#c4b5fd);-webkit-background-clip:text;-webkit-text-fill-color:transparent;position:relative;z-index:1}
.cover .sub{font-size:14px;color:#a78bfa;letter-spacing:3px;text-transform:uppercase;font-weight:600;margin-top:16px;position:relative;z-index:1}
.slides{max-width:800px;margin:0 auto;padding:40px 24px 80px}
.slide{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:40px;margin-bottom:24px;position:relative;animation:fadeUp .6s ease both}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.slide-num{position:absolute;top:16px;right:20px;font-size:11px;font-weight:700;color:rgba(139,92,246,.4);letter-spacing:1px}
.slide h2{font-family:'Playfair Display',serif;font-size:22px;font-weight:700;margin-bottom:16px;color:#e2e0ff}
.slide p{font-size:14px;line-height:1.8;color:rgba(255,255,255,.65)}
.footer{text-align:center;padding:40px;font-size:11px;color:rgba(255,255,255,.15)}
</style>
<body>
<div class="cover"><h1>${escHtml(projectName)}</h1><div class="sub">Investor Deck</div></div>
<div class="slides">${slidesHtml}</div>
<div class="footer">${escHtml(projectName)} — Investor Deck · ${slides.length} slides</div>
</body></html>`;
  }

  if (type === 'qa') {
    const items = pitch.qa || [];
    const qaHtml = items.map((q, i) => `
<div class="qa-item" style="animation-delay:${i * 0.1}s">
  <div class="q"><span class="q-badge">Q</span>${escHtml(q.question)}</div>
  <div class="a">${nl2br(q.answer)}</div>
</div>`).join('');
    return `${base}<title>${escHtml(projectName)} — Q&A Inversores</title>${font}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;background:#09090b;font-family:'Space Grotesk',sans-serif;color:#fff;padding:48px 24px}
.header{text-align:center;margin-bottom:48px}
.header h1{font-family:'Playfair Display',serif;font-size:clamp(28px,5vw,44px);background:linear-gradient(135deg,#fff,#fbbf24);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.header .sub{font-size:12px;color:#a78bfa;letter-spacing:2px;text-transform:uppercase;font-weight:600}
.qa-list{max-width:700px;margin:0 auto}
.qa-item{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:24px;margin-bottom:16px;animation:fadeUp .5s ease both}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.q{font-size:14px;font-weight:600;color:#fbbf24;margin-bottom:12px;display:flex;align-items:flex-start;gap:10px}
.q-badge{flex-shrink:0;width:22px;height:22px;border-radius:6px;background:rgba(251,191,36,.12);border:1px solid rgba(251,191,36,.25);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fbbf24}
.a{font-size:13px;line-height:1.8;color:rgba(255,255,255,.7);padding-left:32px}
.footer{text-align:center;padding:40px;font-size:11px;color:rgba(255,255,255,.15)}
</style>
<body>
<div class="header"><h1>${escHtml(projectName)}</h1><div class="sub">Preguntas frecuentes de inversores</div></div>
<div class="qa-list">${qaHtml}</div>
<div class="footer">${escHtml(projectName)} — Q&A · ${items.length} preguntas</div>
</body></html>`;
  }

  return '';
}

function downloadPitchHtml(type: 'elevator' | 'oneMinute' | 'threeMinute' | 'deck' | 'qa', pitch: StopdownPitch, projectName: string) {
  const html = generatePitchHtml(type, pitch, projectName);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const names: Record<string, string> = { elevator: 'elevator-pitch', oneMinute: 'pitch-1min', threeMinute: 'pitch-3min', deck: 'investor-deck', qa: 'qa-inversores' };
  a.download = `${projectName.toLowerCase().replace(/\s+/g, '-')}-${names[type]}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── PITCH CARD ───────────────────────────────────────────────────────────────

function PitchCard({ type, label, icon, description, hasContent, preview, isDark, onProduce }: {
  type: string; label: string; icon: string; description: string;
  hasContent: boolean; preview: string; isDark: boolean; onProduce: () => void;
}) {
  return (
    <div className={cn(
      'rounded-xl border overflow-hidden transition-all hover:shadow-lg group',
      hasContent
        ? isDark ? 'border-violet-800/40 bg-gradient-to-br from-zinc-900 to-violet-950/20' : 'border-violet-200 bg-gradient-to-br from-white to-violet-50'
        : isDark ? 'border-zinc-800/60 bg-zinc-900/40' : 'border-gray-200 bg-gray-50/60',
    )}>
      <div className="p-3.5">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{icon}</span>
            <div>
              <h3 className={cn('text-[11px] font-bold', isDark ? 'text-zinc-100' : 'text-gray-800')}>{label}</h3>
              <p className={cn('text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>{description}</p>
            </div>
          </div>
          {hasContent && (
            <span className={cn('text-[8px] font-bold px-1.5 py-0.5 rounded-full', isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600')}>
              LISTO
            </span>
          )}
        </div>

        {hasContent && preview && (
          <div className={cn('rounded-lg p-2.5 mb-2.5 text-[9px] leading-relaxed line-clamp-3', isDark ? 'bg-zinc-800/50 text-zinc-400' : 'bg-gray-100 text-gray-500')}>
            {preview}
          </div>
        )}

        {hasContent ? (
          <button
            onClick={onProduce}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold transition-all',
              'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-md shadow-violet-500/20',
              'group-hover:shadow-lg group-hover:shadow-violet-500/30',
            )}
          >
            <Presentation className="size-3" />
            Producir presentación
          </button>
        ) : (
          <div className={cn('text-center py-2 text-[9px] italic', isDark ? 'text-zinc-600' : 'text-gray-300')}>
            Genera los pitches con IA para desbloquear
          </div>
        )}
      </div>
    </div>
  );
}

// ── PITCH ────────────────────────────────────────────────────────────────────

type PitchCategory = 'classic' | 'investor' | 'sales' | 'strategic' | 'creative' | 'internal';

const PITCH_CATEGORIES: { key: PitchCategory; label: string; icon: string; color: string }[] = [
  { key: 'classic', label: 'Clásicos', icon: '🎤', color: 'text-violet-400' },
  { key: 'investor', label: 'Inversores', icon: '💰', color: 'text-amber-400' },
  { key: 'sales', label: 'Ventas', icon: '🤝', color: 'text-emerald-400' },
  { key: 'strategic', label: 'Estratégicos', icon: '🎯', color: 'text-cyan-400' },
  { key: 'creative', label: 'Creativos', icon: '🎨', color: 'text-pink-400' },
  { key: 'internal', label: 'Internos', icon: '🏢', color: 'text-sky-400' },
];

interface PitchTypeInfo {
  id: string; label: string; icon: string; desc: string; category: PitchCategory;
  duration?: string; builtIn?: 'elevator' | 'oneMinute' | 'threeMinute' | 'deck' | 'qa';
  prompt: string;
}

const ALL_PITCH_TYPES: PitchTypeInfo[] = [
  // ── Classic (12) ──
  { id: 'elevator', label: 'Elevator Pitch', icon: '🚀', desc: '30 segundos de impacto puro', category: 'classic', duration: '30s', builtIn: 'elevator', prompt: '' },
  { id: 'oneMinute', label: 'Pitch 1 Minuto', icon: '🎤', desc: 'Problema, solución y mercado', category: 'classic', duration: '1 min', builtIn: 'oneMinute', prompt: '' },
  { id: 'threeMinute', label: 'Pitch 3 Minutos', icon: '🎯', desc: 'Storytelling completo', category: 'classic', duration: '3 min', builtIn: 'threeMinute', prompt: '' },
  { id: 'deck', label: 'Investor Deck', icon: '📊', desc: 'Slides para inversores', category: 'classic', builtIn: 'deck', prompt: '' },
  { id: 'qa', label: 'Q&A Inversores', icon: '❓', desc: 'Preguntas y respuestas preparadas', category: 'classic', builtIn: 'qa', prompt: '' },
  { id: 'five-minute', label: 'Pitch 5 Minutos', icon: '⏱️', desc: 'Presentación completa con demos y tracción', category: 'classic', duration: '5 min', prompt: 'Genera un pitch de 5 minutos detallado con: hook, problema profundo, solución con demo flow, mercado y oportunidad, modelo de negocio, tracción y métricas, equipo, y ask financiero.' },
  { id: 'ten-minute', label: 'Pitch 10 Minutos', icon: '🕐', desc: 'Presentación completa para Demo Day', category: 'classic', duration: '10 min', prompt: 'Genera un pitch de 10 minutos tipo Demo Day con: apertura memorable, contexto del problema, journey del usuario, solución paso a paso, diferenciación, mercado TAM/SAM/SOM, modelo de negocio detallado, tracción y unit economics, equipo y advisors, roadmap, ask financiero y cierre impactante.' },
  { id: 'twenty-minute', label: 'Pitch 20 Minutos', icon: '🕑', desc: 'Deep dive para reuniones de inversión', category: 'classic', duration: '20 min', prompt: 'Genera un pitch de 20 minutos tipo boardroom deep-dive: introducción personal, problema con datos de mercado, solución técnica detallada, demo walkthrough, unit economics con proyecciones, análisis competitivo profundo, moats y defensibilidad, equipo con track record, financieros detallados, uso de fondos por trimestre, roadmap 18 meses, y sesión de Q&A preparada.' },
  { id: 'one-liner', label: 'Pitch de Una Frase', icon: '💬', desc: 'Tu proyecto en una sola línea', category: 'classic', prompt: 'Genera 10 variantes de pitch de una sola frase (logline) para el proyecto. Cada una debe ser memorable, clara y provocar curiosidad. Formatos: "X para Y", "Hacemos que [persona] pueda [beneficio] sin [dolor]", analogías, y variantes originales.' },
  { id: 'networking', label: 'Pitch de Networking', icon: '🍸', desc: 'Para eventos y cocktails', category: 'classic', duration: '15s', prompt: 'Genera 5 variantes de pitch ultra-corto para usar en eventos de networking, cocktails y encuentros casuales. Máximo 2-3 frases. Debe ser natural, memorable y generar la pregunta "cuéntame más". Incluye variantes según interlocutor: otro founder, inversor, potencial cliente, periodista, talento.' },
  { id: 'phone-pitch', label: 'Pitch Telefónico', icon: '📞', desc: 'Guión para llamada en frío', category: 'classic', duration: '2 min', prompt: 'Genera un guión de pitch para llamada telefónica en frío: apertura que evite colgar, presentación rápida, gancho de valor, pregunta que enganche, mini-pitch si hay interés, y cierre para agendar reunión. Incluye manejo de "no me interesa" y "envíame info".' },
  { id: 'keynote', label: 'Pitch Keynote', icon: '🎪', desc: 'Presentación en conferencia/escenario', category: 'classic', duration: '15 min', prompt: 'Genera un pitch estilo keynote para conferencia: apertura impactante con dato o historia, definición del problema a nivel macro, visión del futuro, cómo tu producto es el puente, demo en vivo, casos de éxito, call-to-action a la audiencia y cierre memorable con frase final poderosa.' },

  // ── Investor (20) ──
  { id: 'email-cold', label: 'Cold Email Inversores', icon: '📧', desc: 'Email frío que consigue reuniones', category: 'investor', prompt: 'Genera 3 variantes de cold email para inversores: versión ultra-corta (3 líneas), versión media (1 párrafo) y versión completa. Incluye subject lines A/B y templates de follow-up para día 3 y día 7.' },
  { id: 'investor-update', label: 'Investor Update', icon: '📈', desc: 'Informe mensual para inversores', category: 'investor', prompt: 'Genera una plantilla de investor update mensual con: resumen ejecutivo (3 líneas), métricas clave (MRR, usuarios, churn, burn rate), highlights del mes, lowlights/desafíos, prioridades próximo mes, asks/ayuda necesaria y runway.' },
  { id: 'fundraising-memo', label: 'Fundraising Memo', icon: '📋', desc: 'Memo completo de ronda de inversión', category: 'investor', prompt: 'Genera un fundraising memo detallado: thesis de inversión, problema y oportunidad de mercado, solución y producto, modelo de negocio, tracción y métricas, competencia y moat, equipo, financieros y proyecciones, uso de fondos, términos propuestos y timeline de la ronda.' },
  { id: 'angel-pitch', label: 'Pitch para Angels', icon: '😇', desc: 'Adaptado para business angels', category: 'investor', duration: '3 min', prompt: 'Genera un pitch adaptado para business angels: enfocado en la historia personal del fundador, por qué este problema, ventaja única, primeros clientes, unit economics simples, cuánto necesitas y para qué exactamente. Tono personal y directo.' },
  { id: 'vc-pitch', label: 'Pitch para VCs', icon: '🏦', desc: 'Lenguaje y métricas para venture capital', category: 'investor', duration: '5 min', prompt: 'Genera un pitch optimizado para VCs: mercado gigante (TAM >1B), crecimiento exponencial, unit economics, LTV/CAC, network effects o moats, equipo rockstar, comparable exits, uso de fondos detallado. Lenguaje de venture.' },
  { id: 'grant-pitch', label: 'Pitch para Subvenciones', icon: '🏛️', desc: 'Adaptado para convocatorias públicas', category: 'investor', prompt: 'Genera un pitch adaptado para subvenciones y convocatorias públicas: impacto social/económico, innovación tecnológica, creación de empleo, sostenibilidad, escalabilidad, alineación con ODS, plan de trabajo por fases y presupuesto desglosado.' },
  { id: 'family-office', label: 'Pitch Family Office', icon: '🏰', desc: 'Adaptado para oficinas familiares', category: 'investor', duration: '5 min', prompt: 'Genera un pitch para family offices: enfoque en preservación de capital, retorno estable, alineación con valores familiares, horizonte temporal largo, governance y transparencia, reporting detallado, co-inversión con otros family offices y exit strategy conservadora.' },
  { id: 'cvc-pitch', label: 'Pitch Corporate VC', icon: '🏭', desc: 'Para venture capital corporativo', category: 'investor', duration: '5 min', prompt: 'Genera un pitch para Corporate Venture Capital: valor estratégico para la corporación, sinergias con sus divisiones, acceso a nuevos mercados/tecnologías, no solo retorno financiero, plan de colaboración técnica, piloto con sus clientes y cómo complementas su portfolio.' },
  { id: 'impact-investor', label: 'Pitch Impact Investors', icon: '🌍', desc: 'Para inversores de impacto', category: 'investor', prompt: 'Genera un pitch para inversores de impacto: problema social/ambiental que resuelves, Theory of Change, métricas de impacto (IRIS+), alineación con ODS, doble bottom line (retorno + impacto), beneficiarios directos/indirectos, escalabilidad del impacto y framework de medición.' },
  { id: 'pre-seed', label: 'Pitch Pre-Seed', icon: '🌱', desc: 'Primera ronda con idea y MVP', category: 'investor', duration: '3 min', prompt: 'Genera un pitch de ronda pre-seed: visión transformadora, insight único del mercado, por qué tú eres la persona correcta, primer prototipo/MVP, validación inicial (conversaciones con clientes, waitlist, LOIs), ask modesto (100-500K), uso de fondos ultraespecífico y milestones para llegar a seed.' },
  { id: 'seed-pitch', label: 'Pitch Ronda Seed', icon: '🌿', desc: 'Ronda seed con tracción inicial', category: 'investor', duration: '5 min', prompt: 'Genera un pitch de ronda seed: producto funcionando, primeros clientes/usuarios con métricas, PMF signals, unit economics iniciales, ask (500K-2M), plan de uso de fondos por trimestre, milestones para Serie A, comparable companies y por qué ahora es el momento perfecto.' },
  { id: 'series-a', label: 'Pitch Serie A', icon: '📈', desc: 'Escalar con tracción demostrada', category: 'investor', duration: '10 min', prompt: 'Genera un pitch de Serie A completo: PMF demostrado con métricas, growth rate MoM/QoQ, unit economics maduros (LTV/CAC >3x, payback <12m), mercado gigante validado, flywheel de crecimiento, equipo senior completo, plan de escalado, ask (2-10M), uso de fondos, camino a rentabilidad y comparable exits.' },
  { id: 'series-b', label: 'Pitch Serie B', icon: '🚀', desc: 'Escalar agresivamente el negocio', category: 'investor', duration: '15 min', prompt: 'Genera un pitch de Serie B: liderazgo de mercado demostrado, revenue scaling predictable, expansión a nuevos mercados/segmentos, M&A strategy, international expansion plan, team scaling (50->200), path to profitability, ask (10-50M), board composition y governance.' },
  { id: 'bridge-round', label: 'Pitch Bridge Round', icon: '🌉', desc: 'Ronda puente entre rondas principales', category: 'investor', prompt: 'Genera un pitch para ronda bridge: por qué necesitas tiempo extra (sin ser negativo), milestones casi alcanzados, nueva tracción desde última ronda, términos justos (convertible note/SAFE), timeline específico para siguiente ronda, participación de inversores actuales y nuevas métricas objetivo.' },
  { id: 'investor-qa-50', label: '50 Preguntas de Inversores', icon: '🎓', desc: 'Las 50 preguntas más comunes y respuestas', category: 'investor', prompt: 'Genera las 50 preguntas más frecuentes que hacen los inversores organizadas por tema (equipo, mercado, producto, finanzas, competencia, legal) con respuestas detalladas, datos y frameworks para responder con confianza. Incluye las preguntas trampa y cómo manejarlas.' },
  { id: 'data-room-walkthrough', label: 'Walkthrough Data Room', icon: '📂', desc: 'Guía de presentación del data room', category: 'investor', prompt: 'Genera un guión para presentar el data room a inversores durante due diligence: orden de documentos, qué destacar en cada sección, métricas clave que buscarán, red flags que anticipar, cómo presentar las proyecciones financieras y la cap table, y puntos de orgullo.' },
  { id: 'follow-up-meeting', label: 'Pitch Segunda Reunión', icon: '🔁', desc: 'Para la reunión de follow-up con inversor', category: 'investor', duration: '10 min', prompt: 'Genera un pitch para segunda reunión con inversor: resumen de puntos clave de la primera reunión, respuestas a preguntas pendientes, nuevos datos/tracción desde el último encuentro, deep dive en financieros, presentación del equipo senior, demo detallada y próximos pasos hacia el term sheet.' },
  { id: 'term-sheet-negotiation', label: 'Negociación Term Sheet', icon: '⚖️', desc: 'Puntos de negociación y argumentos', category: 'investor', prompt: 'Genera una guía de negociación de term sheet: valoración y cómo justificarla, liquidation preferences aceptables, anti-dilution clauses, board composition, protective provisions, pro-rata rights, drag/tag along, y para cada punto: qué es justo, qué es agresivo, y tu posición ideal con argumentos.' },
  { id: 'cap-table-pitch', label: 'Pitch Cap Table', icon: '🥧', desc: 'Explicar la tabla de capitalización', category: 'investor', prompt: 'Genera una presentación de la cap table: distribución actual, rondas anteriores con valoraciones, dilución proyectada, pool de empleados (ESOP), escenarios de salida con waterfall analysis, comparables de mercado y por qué la estructura actual es atractiva para nuevos inversores.' },
  { id: 'revenue-deep-dive', label: 'Deep Dive Revenue', icon: '💹', desc: 'Análisis profundo del modelo de ingresos', category: 'investor', prompt: 'Genera una presentación detallada del modelo de revenue: fuentes de ingresos, pricing strategy con justificación, cohort analysis, MRR/ARR evolution, churn breakdown, expansion revenue, net dollar retention, revenue per employee, unit economics por segmento y proyecciones bottom-up a 3 años.' },

  // ── Sales (18) ──
  { id: 'customer-pitch', label: 'Pitch para Clientes', icon: '🛒', desc: 'Cómo vender a tu primer cliente', category: 'sales', duration: '2 min', prompt: 'Genera un pitch de ventas para clientes: dolor específico del cliente, coste de no resolver el problema, cómo lo resolvemos, demostración de valor, caso de uso concreto, pricing, garantía y call-to-action para empezar.' },
  { id: 'enterprise-pitch', label: 'Pitch Enterprise', icon: '🏢', desc: 'Venta a grandes empresas', category: 'sales', duration: '5 min', prompt: 'Genera un pitch para venta enterprise: ROI cuantificado, integración con sistemas existentes, seguridad y compliance, SLAs, caso de estudio, escalabilidad, soporte dedicado y proceso de onboarding. Lenguaje corporativo.' },
  { id: 'partner-pitch', label: 'Pitch para Partners', icon: '🤝', desc: 'Propuesta de partnership estratégico', category: 'sales', prompt: 'Genera un pitch para potenciales partners: sinergia de ambos productos/servicios, mercado conjunto, modelo de revenue sharing, plan de integración, co-marketing y beneficios mutuos cuantificados.' },
  { id: 'media-pitch', label: 'Pitch para Medios', icon: '📰', desc: 'Nota de prensa y pitch a periodistas', category: 'sales', prompt: 'Genera un pitch para medios y periodistas: headline noticiable, por qué es relevante ahora, datos de mercado, historia humana detrás, cita del fundador, material visual disponible y datos de contacto. Incluye versión corta para email y versión larga.' },
  { id: 'objection-handler', label: 'Manejo de Objeciones', icon: '🛡️', desc: 'Respuestas a las 20 objeciones más comunes', category: 'sales', prompt: 'Genera respuestas persuasivas para las 20 objeciones más comunes que recibirás de inversores y clientes: "es demasiado caro", "ya existe", "el mercado es pequeño", "no tenéis tracción", etc. Para cada objeción: reconocimiento, reframe y respuesta basada en datos.' },
  { id: 'demo-script', label: 'Script de Demo', icon: '💻', desc: 'Guión para demostración del producto', category: 'sales', duration: '5 min', prompt: 'Genera un guión para una demo de producto de 5 minutos: setup del contexto, flujo principal del usuario, "wow moment", features secundarias, beneficios vs competencia, Q&A anticipado y cierre con próximos pasos.' },
  { id: 'upsell-pitch', label: 'Pitch de Upsell', icon: '⬆️', desc: 'Convencer al cliente de subir de plan', category: 'sales', prompt: 'Genera un pitch de upsell/cross-sell: valor que ya obtiene el cliente, limitaciones actuales, beneficios del plan superior con ejemplos concretos, ROI de la actualización, testimonios de clientes que subieron, oferta de transición y urgencia genuina.' },
  { id: 'referral-pitch', label: 'Pitch para Referidos', icon: '📣', desc: 'Que tus clientes te recomienden', category: 'sales', prompt: 'Genera un pitch para programa de referidos: cómo el cliente puede recomendar, incentivos para ambas partes, plantilla de email que el cliente puede enviar, script de lo que decir en una llamada, y 5 momentos ideales para pedir una referencia.' },
  { id: 'tradeshow', label: 'Pitch para Ferias', icon: '🎪', desc: 'Stand de feria comercial', category: 'sales', duration: '30s', prompt: 'Genera pitches para feria/trade show: versión 10 segundos (pasillo), versión 30 segundos (stand), versión 2 minutos (reunión), follow-up email post-feria. Incluye preguntas gancho, frases para atraer a los que pasan y cómo cualificar rápidamente al visitante.' },
  { id: 'value-pitch', label: 'Pitch de Valor', icon: '💎', desc: 'Value proposition en acción', category: 'sales', prompt: 'Genera un pitch centrado 100% en el valor: antes vs después con métricas, 3 casos de uso con ROI calculado, testimonios con resultados, comparativa de coste vs beneficio, calculadora de ahorro personalizable y garantía de resultados.' },
  { id: 'anti-churn', label: 'Pitch Anti-Churn', icon: '🔄', desc: 'Retener clientes que se van', category: 'sales', prompt: 'Genera un playbook anti-churn: detección de señales de riesgo, email/llamada para diferentes motivos de baja (precio, funcionalidad, competencia, falta de uso), ofertas de retención, pitch de "qué hemos mejorado desde que te fuiste" y win-back campaign.' },
  { id: 'pricing-pitch', label: 'Pitch de Pricing', icon: '🏷️', desc: 'Justificar y presentar tus precios', category: 'sales', prompt: 'Genera un pitch de pricing: por qué este precio (value-based), comparativa con alternativas (DIY, competencia, no hacer nada), anchoring con plan premium, descuento por annual, ROI en primeros 30 días, garantía money-back y urgencia (precio early adopter).' },
  { id: 'case-study', label: 'Pitch Case Study', icon: '📑', desc: 'Historia de éxito de un cliente', category: 'sales', prompt: 'Genera 3 case studies detallados adaptados al proyecto: contexto del cliente, problema específico, solución implementada, proceso de adopción, resultados con métricas (%, tiempos, dinero ahorrado), testimonial y por qué eligieron tu solución sobre la competencia.' },
  { id: 'freemium-upgrade', label: 'Pitch Free a Premium', icon: '🔓', desc: 'Convertir usuarios free en premium', category: 'sales', prompt: 'Genera un pitch para convertir usuarios freemium a premium: momento ideal para el pitch (feature wall, uso intensivo, milestone), email sequences (5 emails), in-app messaging, comparativa visual free vs premium, trial de 14 días y testimonios de conversión.' },
  { id: 'distributor-pitch', label: 'Pitch para Distribuidores', icon: '🚚', desc: 'Venta a canales de distribución', category: 'sales', prompt: 'Genera un pitch para distribuidores/canales: margen atractivo, demanda demostrada, materiales de marketing incluidos, soporte de preventa, programa de formación, exclusividad territorial, plan de co-inversión en marketing y casos de éxito de otros distribuidores.' },
  { id: 'procurement-pitch', label: 'Pitch para Compras', icon: '📋', desc: 'Para departamentos de procurement', category: 'sales', duration: '5 min', prompt: 'Genera un pitch para departamentos de compras/procurement: compliance con policies corporativas, certificaciones (ISO, SOC2, GDPR), proceso de evaluación facilitado, benchmark vs competidores en RFP, TCO analysis, SLAs garantizados, escalation paths y contract flexibility.' },
  { id: 'renewal-pitch', label: 'Pitch de Renovación', icon: '🔄', desc: 'Renovar contrato con mejoras', category: 'sales', prompt: 'Genera un pitch de renovación de contrato: resumen de valor entregado con métricas, nuevas features desde última renovación, roadmap de lo que viene, testimonios de ROI, propuesta de expansión, descuento por renovación temprana y agenda para revisión conjunta.' },
  { id: 'marketplace-pitch', label: 'Pitch para Marketplace', icon: '🏪', desc: 'Aplicar a marketplaces y app stores', category: 'sales', prompt: 'Genera pitch para marketplace/app stores: descripción optimizada para búsqueda, screenshots/video key moments, feature highlights, comparativa con apps similares, reseñas estratégicas a conseguir, pricing para marketplace y plan de ASO/SEO dentro de la plataforma.' },

  // ── Strategic (18) ──
  { id: 'accelerator', label: 'Pitch para Aceleradoras', icon: '⚡', desc: 'Aplicación a Y Combinator, Techstars...', category: 'strategic', prompt: 'Genera respuestas para aplicar a aceleradoras top (estilo YC): qué hace tu empresa (1 línea), por qué este equipo, qué has construido, tracción, mercado, cómo hacéis dinero, revenue actual, insight único que otros no ven, y por qué ahora.' },
  { id: 'competition-pitch', label: 'Pitch para Competiciones', icon: '🏆', desc: 'Concurso de startups y hackathons', category: 'strategic', duration: '3 min', prompt: 'Genera un pitch para competiciones de startups: apertura dramática, problema enorme, solución innovadora, demo moment, mercado gigante, tracción impresionante, equipo excepcional, visión audaz y cierre memorable que gane el voto del jurado.' },
  { id: 'crowdfunding', label: 'Pitch Crowdfunding', icon: '💸', desc: 'Kickstarter/Indiegogo campaña', category: 'strategic', prompt: 'Genera el contenido para una campaña de crowdfunding: headline emocional, vídeo script (2 min), historia del fundador, descripción del producto, reward tiers (5 niveles), stretch goals, FAQ y timeline de entrega.' },
  { id: 'vision-2030', label: 'Visión 2030', icon: '🔮', desc: 'Cómo será tu empresa en 5 años', category: 'strategic', prompt: 'Genera una visión a 5 años: el mundo que queremos crear, los hitos que alcanzaremos cada año, el tamaño del equipo y la empresa, los mercados que dominaremos, el impacto social/económico y la legacy que dejaremos. Ambicioso pero creíble.' },
  { id: 'pivot-pitch', label: 'Pitch de Pivot', icon: '🔄', desc: 'Comunicar un cambio de dirección', category: 'strategic', prompt: 'Genera un pitch para comunicar un pivot: qué aprendimos del modelo anterior, datos que lo sustentan, nueva oportunidad identificada, por qué estamos mejor posicionados, plan de transición, métricas de éxito y timeline.' },
  { id: 'exit-pitch', label: 'Pitch de Exit/M&A', icon: '🏁', desc: 'Presentación para adquisición o fusión', category: 'strategic', prompt: 'Genera un pitch de exit/M&A: valor estratégico de la empresa, activos únicos (tecnología, equipo, base de clientes, datos, IP), sinergias con potenciales compradores, métricas financieras, comparable transactions y valoración justificada.' },
  { id: 'government-pitch', label: 'Pitch para Gobierno', icon: '🏛️', desc: 'Propuesta a entidades públicas', category: 'strategic', prompt: 'Genera un pitch para gobierno/reguladores: problema público que resuelves, ahorro para la administración, impacto ciudadano medible, compliance regulatorio, plan de implementación con fases piloto, interoperabilidad con sistemas existentes, creación de empleo y alineación con agenda digital.' },
  { id: 'university-pitch', label: 'Pitch para Universidades', icon: '🎓', desc: 'Colaboración académica y spin-offs', category: 'strategic', prompt: 'Genera un pitch para universidades: oportunidad de investigación conjunta, acceso a talento estudiantil, programa de prácticas/becas, transferencia tecnológica, publicaciones conjuntas, spin-off potencial, y cómo la colaboración beneficia a ambas partes.' },
  { id: 'international', label: 'Pitch Internacionalización', icon: '🌐', desc: 'Estrategia de expansión global', category: 'strategic', prompt: 'Genera un pitch de internacionalización: mercados objetivo priorizados con criterios, estrategia de entrada (directo, partner, franquicia), adaptación de producto/mensaje, regulatory requirements, equipo local necesario, inversión por mercado, timeline y KPIs de expansión.' },
  { id: 'licensing-pitch', label: 'Pitch de Licenciamiento', icon: '📜', desc: 'Licenciar tu tecnología/IP', category: 'strategic', prompt: 'Genera un pitch de licenciamiento de tecnología: IP portfolio, ventaja técnica demostrada, mercados aplicables, modelo de licensing (royalties, flat fee, usage-based), soporte técnico incluido, caso de uso para el licenciatario y proyección de ingresos por licencias.' },
  { id: 'advisory-pitch', label: 'Pitch para Advisors', icon: '🧠', desc: 'Convencer a expertos de ser advisors', category: 'strategic', prompt: 'Genera un pitch para reclutar advisors: por qué esta persona específica, qué aporta su expertise, compromiso de tiempo (2-4h/mes), compensación (0.25-1% equity con vesting), beneficios para el advisor (deal flow, innovación, impacto), y próximos pasos del advisory agreement.' },
  { id: 'joint-venture', label: 'Pitch Joint Venture', icon: '🤲', desc: 'Propuesta de empresa conjunta', category: 'strategic', prompt: 'Genera un pitch de joint venture: oportunidad de mercado conjunta, lo que cada parte aporta, governance structure, distribución de equity/beneficios, IP ownership, plan operativo, milestones compartidos, exit clauses y framework de resolución de conflictos.' },
  { id: 'white-label', label: 'Pitch White Label', icon: '🏷️', desc: 'Ofrecer tu producto como marca blanca', category: 'strategic', prompt: 'Genera un pitch white label: customización disponible, pricing por volumen, time-to-market para el partner, soporte técnico y SLA, casos de éxito con otros white-label partners, roadmap de features compartido y exclusividad territorial.' },
  { id: 'platform-api', label: 'Pitch API/Plataforma', icon: '🔌', desc: 'Tu producto como plataforma', category: 'strategic', prompt: 'Genera un pitch de plataforma/API: developer experience, documentación, SDKs disponibles, pricing tiers para developers, marketplace de integraciones, community building, partner program, y cómo los developers construyen valor sobre tu plataforma.' },
  { id: 'incubator-pitch', label: 'Pitch para Incubadoras', icon: '🐣', desc: 'Aplicar a programas de incubación', category: 'strategic', prompt: 'Genera un pitch para incubadoras: problema que resuelves y por qué eres early stage, background del equipo, validación inicial, qué necesitas de la incubadora (mentoría, espacio, red de contactos, inversión), plan de 6 meses y milestones específicos que lograrás con su apoyo.' },
  { id: 'ngo-pitch', label: 'Pitch ONG/Impacto Social', icon: '❤️', desc: 'Para organizaciones sin ánimo de lucro', category: 'strategic', prompt: 'Genera un pitch para ONGs y organizaciones de impacto: problema social/ambiental, beneficiarios directos con historias, modelo de sostenibilidad, métricas de impacto, alianzas con otros actores, escalabilidad de la solución, transparencia financiera y call-to-action para colaborar.' },
  { id: 'esg-pitch', label: 'Pitch ESG/Sostenibilidad', icon: '♻️', desc: 'Estrategia de sostenibilidad empresarial', category: 'strategic', prompt: 'Genera un pitch ESG: impacto ambiental positivo medible, governance estructura, diversidad e inclusión, huella de carbono y plan de reducción, supply chain responsable, reporting framework (GRI, SASB), stakeholder engagement y alineación con European Green Deal.' },
  { id: 'franchise-pitch', label: 'Pitch de Franquicia', icon: '🔑', desc: 'Expandir con modelo de franquicia', category: 'strategic', prompt: 'Genera un pitch para modelo de franquicia: concepto probado con métricas, inversión inicial del franquiciado, training program, soporte continuo, territory exclusivity, unit economics del franquiciado, ramp-up timeline, success stories y términos del acuerdo.' },

  // ── Creative (18) ──
  { id: 'twitter', label: 'Pitch Twitter/X', icon: '𝕏', desc: 'Tu proyecto en 280 caracteres', category: 'creative', prompt: 'Genera 5 variantes de pitch en máximo 280 caracteres cada uno para Twitter/X. Deben ser directos, memorables y generar curiosidad. Incluye hashtags relevantes.' },
  { id: 'linkedin', label: 'Pitch LinkedIn', icon: '💼', desc: 'Post profesional de presentación', category: 'creative', prompt: 'Genera un post de LinkedIn profesional presentando el proyecto: hook en primera línea, storytelling del por qué, descripción de qué hace, resultados/tracción, y call-to-action. Formato con emojis profesionales y saltos de línea.' },
  { id: 'tiktok-script', label: 'Script TikTok/Reels', icon: '🎬', desc: 'Guión para video viral de 60 segundos', category: 'creative', duration: '60s', prompt: 'Genera un guión para TikTok/Reels de 60 segundos: hook de 3 segundos, problema relatable, solución como revelación, demostración rápida, resultado y CTA. Incluye indicaciones de cámara y transiciones.' },
  { id: 'podcast-intro', label: 'Intro Podcast', icon: '🎙️', desc: 'Presentación para entrevistas en podcast', category: 'creative', duration: '2 min', prompt: 'Genera una introducción para cuando te entrevisten en un podcast: quién eres, tu historia personal con el problema, cómo surgió la idea, qué hace el producto y por qué importa. Tono conversacional y cercano.' },
  { id: 'product-hunt', label: 'Lanzamiento Product Hunt', icon: '🐱', desc: 'Tagline, descripción y comentarios', category: 'creative', prompt: 'Genera el contenido para un lanzamiento en Product Hunt: tagline (60 chars max), descripción corta, descripción larga con formato, primer comentario del maker (historia personal), 5 variantes de tweets para compartir y estrategia de lanzamiento.' },
  { id: 'problem-story', label: 'Historia del Problema', icon: '📖', desc: 'Storytelling profundo del dolor', category: 'creative', prompt: 'Genera una historia narrativa del problema que resuelves: personaje real, su día a día, el momento de frustración, las soluciones que probó, por qué fallaron, el coste emocional/económico y la necesidad no resuelta. Formato storytelling.' },
  { id: 'origin-story', label: 'Historia de Origen', icon: '🌱', desc: 'Cómo nació tu startup', category: 'creative', prompt: 'Genera la historia de origen de la startup: el momento eureka, la frustración personal, el primer prototipo, los primeros usuarios, los fracasos y aprendizajes, y la visión de futuro. Formato narrativo inspirador.' },
  { id: 'youtube-script', label: 'Script YouTube', icon: '▶️', desc: 'Video explicativo de 3-5 minutos', category: 'creative', duration: '4 min', prompt: 'Genera un guión de video YouTube de 3-5 minutos: thumbnail hook, intro de 5 segundos que retenga, contexto del problema, solución con B-roll suggestions, demo visual, beneficios, CTA suscripción y link en descripción. Incluye timestamps y tags SEO.' },
  { id: 'thread-twitter', label: 'Thread Twitter/X', icon: '🧵', desc: 'Hilo viral de 10-15 tweets', category: 'creative', prompt: 'Genera un thread viral de 12-15 tweets: tweet gancho (máximo impacto), historia del problema, cómo descubriste la solución, qué has construido, resultados con datos, lecciones aprendidas, visión de futuro y CTA final. Cada tweet debe funcionar independientemente.' },
  { id: 'tedx-talk', label: 'Charla TEDx', icon: '🔴', desc: 'Talk de 12 minutos estilo TED', category: 'creative', duration: '12 min', prompt: 'Genera una charla TEDx de 12 minutos: idea worth spreading, apertura con historia personal impactante, problema a nivel macro, datos que sorprenden, tu journey de descubrimiento, la solución como insight, demo del impacto, visión del futuro y cierre con call-to-action inspirador. Tono TED: personal, visual, sin vender.' },
  { id: 'webinar-script', label: 'Script Webinar', icon: '🖥️', desc: 'Webinar educativo con venta sutil', category: 'creative', duration: '30 min', prompt: 'Genera un guión de webinar de 30 minutos: título clickbait pero honesto, agenda, contenido educativo real (70%), transición natural al producto (20%), demo (10%), Q&A preparado, offer especial para asistentes y follow-up email sequence.' },
  { id: 'reddit-post', label: 'Pitch para Reddit', icon: '🤖', desc: 'Post para Reddit/foros sin parecer spam', category: 'creative', prompt: 'Genera un post de Reddit que presente tu proyecto sin parecer promocional: contexto personal, problema que enfrentaste, cómo lo resolviste (tu producto), resultados con transparencia, aprendizajes, pide feedback genuino y ofrece valor a la comunidad. Adaptado a subreddits relevantes.' },
  { id: 'instagram-carousel', label: 'Carrusel Instagram', icon: '📸', desc: '10 slides para carrusel viral', category: 'creative', prompt: 'Genera el contenido para un carrusel de Instagram de 10 slides: slide 1 (hook visual con texto impactante), slides 2-8 (problema, solución, beneficios, datos, proceso, testimonios), slide 9 (resumen), slide 10 (CTA). Incluye copy para caption, hashtags y sugerencias visuales.' },
  { id: 'newsletter-pitch', label: 'Pitch Newsletter', icon: '📨', desc: 'Anuncio para newsletter de startup', category: 'creative', prompt: 'Genera un pitch para ser featured en newsletters de startups (ej: The Hustle, Morning Brew, Stratechery): subject line, hook de 2 líneas, por qué tu historia es interesante, datos exclusivos, ángulo periodístico y por qué a su audiencia le importa.' },
  { id: 'email-marketing', label: 'Pitch Email Marketing', icon: '✉️', desc: 'Secuencia de emails de lanzamiento', category: 'creative', prompt: 'Genera una secuencia de 7 emails de lanzamiento: email 1 (teaser), email 2 (problema), email 3 (solución), email 4 (social proof), email 5 (objeciones), email 6 (urgencia), email 7 (última oportunidad). Para cada uno: subject line, preview text, body y CTA.' },
  { id: 'community-pitch', label: 'Pitch para Comunidades', icon: '👥', desc: 'Introducirte en comunidades relevantes', category: 'creative', prompt: 'Genera pitches adaptados a 5 tipos de comunidades: Slack de startup, Discord tech, grupo de Facebook de nicho, grupo de WhatsApp de emprendedores y foro especializado del sector. Cada uno con el tono y formato adecuado a la plataforma.' },
  { id: 'founder-brand', label: 'Marca Personal Founder', icon: '🌟', desc: 'Construir tu marca como fundador', category: 'creative', prompt: 'Genera una estrategia de marca personal para el founder: bio profesional (5 variantes para diferentes redes), 10 temas de contenido, calendario semanal de publicaciones, template de "build in public" post, historia personal del founder y cómo conectarla con el producto.' },
  { id: 'app-store', label: 'Pitch App Store', icon: '📱', desc: 'Descripción para App Store / Play Store', category: 'creative', prompt: 'Genera la descripción para App Store y Google Play: título optimizado ASO, subtitle, descripción corta (80 chars), descripción larga con keywords, 5 puntos de feature highlights, what\'s new section, categoría recomendada, keywords list y textos para screenshots.' },

  // ── Internal (14) ──
  { id: 'hiring-pitch', label: 'Pitch de Contratación', icon: '👥', desc: 'Atraer talento a tu startup', category: 'internal', prompt: 'Genera un pitch para atraer talento: visión inspiradora, problema que resolvéis, cultura de equipo, beneficios únicos (equity, flexibilidad, impacto), stack tecnológico, growth profesional y por qué unirse ahora es el mejor momento.' },
  { id: 'board-pitch', label: 'Pitch para Board', icon: '📊', desc: 'Presentación para consejo de dirección', category: 'internal', duration: '10 min', prompt: 'Genera un pitch para reunión de board/consejo: resumen ejecutivo, KPIs vs objetivos, P&L actualizado, cash flow y runway, desafíos estratégicos, decisiones a tomar, plan del próximo trimestre y asks del board.' },
  { id: 'team-vision', label: 'Visión de Equipo', icon: '🌟', desc: 'Motivar e inspirar al equipo', category: 'internal', prompt: 'Genera un discurso motivacional para el equipo: dónde empezamos, lo que hemos logrado, el impacto que estamos generando, la oportunidad que tenemos delante, nuestra ventaja única, qué viene después y por qué cada persona importa.' },
  { id: 'onboarding', label: 'Pitch de Onboarding', icon: '🎒', desc: 'Presentación para nuevos empleados', category: 'internal', prompt: 'Genera una presentación de onboarding: historia de la empresa, misión y visión, qué hacemos y para quién, cultura y valores, cómo trabajamos, estructura del equipo, herramientas, primeras semanas y recursos útiles.' },
  { id: 'all-hands', label: 'All-Hands Presentation', icon: '🏟️', desc: 'Reunión general de toda la empresa', category: 'internal', duration: '15 min', prompt: 'Genera una presentación all-hands: celebración de logros del mes/trimestre, métricas clave (transparencia radical), actualizaciones de cada departamento, nuevos miembros, reconocimientos, desafíos que enfrentamos, roadmap próximo periodo, Q&A y momento de team building.' },
  { id: 'budget-pitch', label: 'Pitch de Presupuesto', icon: '💳', desc: 'Defender presupuesto de área', category: 'internal', prompt: 'Genera un pitch para defender el presupuesto de un área: ROI del periodo anterior, proyectos entregados vs presupuesto, plan del próximo periodo con detalle, alternativas si se reduce presupuesto, riesgos de no invertir y benchmarks de mercado.' },
  { id: 'new-feature', label: 'Pitch Nuevo Feature', icon: '✨', desc: 'Proponer nuevo proyecto o feature', category: 'internal', prompt: 'Genera un pitch para proponer un nuevo feature/proyecto: oportunidad identificada (datos de usuarios, mercado), impacto esperado (métricas), esfuerzo estimado (t-shirt sizing), riesgos, alternativas consideradas, plan de MVP, success criteria y timeline propuesto.' },
  { id: 'org-change', label: 'Pitch Cambio Organizacional', icon: '🔀', desc: 'Comunicar reestructuración', category: 'internal', prompt: 'Genera un pitch para comunicar un cambio organizacional: por qué es necesario (datos), qué cambia exactamente, qué NO cambia, timeline de transición, impacto en cada persona, soporte disponible, FAQ anticipadas y visión positiva del resultado.' },
  { id: 'quarterly-review', label: 'Quarterly Business Review', icon: '📈', desc: 'Revisión trimestral del negocio', category: 'internal', duration: '20 min', prompt: 'Genera una presentación QBR (Quarterly Business Review): scorecard de OKRs, revenue y pipeline review, customer health metrics, product roadmap update, competitive landscape changes, team growth y hiring, financieros y burn, top risks y mitigation y prioridades Q+1.' },
  { id: 'postmortem', label: 'Postmortem Presentation', icon: '🔍', desc: 'Análisis de un incidente o fracaso', category: 'internal', prompt: 'Genera una presentación postmortem (blameless): timeline del incidente, impacto cuantificado, root cause analysis (5 whys), qué hicimos bien, qué podemos mejorar, action items con owners y deadlines, proceso para prevenir recurrencia y lecciones aprendidas.' },
  { id: 'culture-deck', label: 'Culture Deck', icon: '🎨', desc: 'Deck de cultura estilo Netflix', category: 'internal', prompt: 'Genera un culture deck completo estilo Netflix: nuestros valores (no genéricos), qué significan en la práctica con ejemplos, cómo tomamos decisiones, feedback culture, cómo evaluamos, libertad con responsabilidad, cómo contratamos, cómo despedimos y anti-valores (lo que NO somos).' },
  { id: 'remote-pitch', label: 'Pitch Equipo Remoto', icon: '🏠', desc: 'Vender el modelo remote-first', category: 'internal', prompt: 'Genera un pitch para implementar/defender el modelo remote-first: productividad con datos, ahorro de costes (oficina, commute), acceso a talento global, herramientas y procesos async, ritmo de comunicación, social events virtuales, offsites y métricas de engagement.' },
  { id: 'sprint-review', label: 'Sprint Review Pitch', icon: '🏃', desc: 'Presentar resultados del sprint', category: 'internal', duration: '5 min', prompt: 'Genera una presentación de sprint review: objetivo del sprint, features completadas con demo, métricas de impacto, bugs resueltos, deuda técnica pagada, lo que no se completó y por qué, aprendizajes, feedback recibido y plan para el próximo sprint.' },
  { id: 'promotion-pitch', label: 'Pitch de Promoción', icon: '📈', desc: 'Argumentar un ascenso', category: 'internal', prompt: 'Genera un pitch para argumentar una promoción interna: logros cuantificados del periodo, impacto en el equipo/empresa, habilidades demostradas del nuevo nivel, feedback de peers y managers, plan de desarrollo, cómo el ascenso beneficia a la empresa y comparables de mercado.' },
];

function PitchView({ isDark, project, pitches, onSavePitch, onBack, onRefresh }: {
  isDark: boolean; project: StopdownProject | null; pitches: StopdownPitch[];
  onSavePitch: (p: StopdownPitch) => Promise<void>; onBack: () => void; onRefresh: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [producingId, setProducingId] = useState<string | null>(null);
  const { currentStep, done: stepsDone, markDone } = usePitchAiSteps(generating);
  const { currentStep: presStep, done: presDone, markDone: presMarkDone } = usePresentationSteps(!!producingId);
  const pitch = pitches[0] || null;
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCat, setFilterCat] = useState<PitchCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const generateAll = async () => {
    if (!project) return;
    setGenerating(true);
    try {
      const ctx = `Proyecto: ${project.name}\nDescripción: ${project.description}\nProblema: ${project.problem}\nSolución: ${project.solution}\nMercado: ${project.targetMarket}\nRevenue: ${project.revenueModel}\nSector: ${project.sector}\nDiferenciadores: ${project.differentiators?.join(', ')}`;
      const { result } = await agentApi.stopdownGenerate('pitch', ctx);
      const r = result as Record<string, unknown>;
      const now = new Date().toISOString();
      const newPitch: StopdownPitch = {
        ...(pitch?._id ? { _id: pitch._id, _rev: pitch._rev } : {}),
        type: 'pitch', projectId: project._id || '', projectName: project.name,
        elevator: (r.elevator as string) || '', oneMinute: (r.oneMinute as string) || '',
        threeMinute: (r.threeMinute as string) || '',
        investorDeck: (r.investorDeck as StopdownPitch['investorDeck']) || [],
        qa: (r.qa as StopdownPitch['qa']) || [],
        votes: pitch?.votes || { up: 0, down: 0 }, feedback: pitch?.feedback || [],
        status: 'draft', createdAt: pitch?.createdAt || now,
        extraPitches: pitch?.extraPitches || {},
      };
      markDone();
      await new Promise(r => setTimeout(r, 700));
      await onSavePitch(newPitch);
      onRefresh();
    } catch { /* */ }
    setGenerating(false);
  };

  const generateSingle = async (pt: PitchTypeInfo) => {
    if (!project || generatingId) return;
    setGeneratingId(pt.id);
    try {
      const ctx = `Proyecto: ${project.name}\nDescripción: ${project.description}\nProblema: ${project.problem}\nSolución: ${project.solution}\nMercado: ${project.targetMarket}\nRevenue: ${project.revenueModel}\nSector: ${project.sector}\nVisión: ${project.vision || ''}\nDiferenciadores: ${(project.differentiators || []).join(', ')}\nCompetidores: ${(project.competitors || []).join(', ')}\n\nINSTRUCCIÓN: ${pt.prompt}`;
      const { result } = await agentApi.stopdownGenerate('pitch', ctx);
      const r = result as Record<string, unknown>;
      const content = typeof r === 'string' ? r : (r.threeMinute as string) || (r.oneMinute as string) || (r.elevator as string) || JSON.stringify(r, null, 2);
      const now = new Date().toISOString();
      const updated: StopdownPitch = {
        ...(pitch?._id ? { _id: pitch._id, _rev: pitch._rev } : {}),
        type: 'pitch', projectId: project._id || '', projectName: project.name,
        elevator: pitch?.elevator || '', oneMinute: pitch?.oneMinute || '',
        threeMinute: pitch?.threeMinute || '',
        investorDeck: pitch?.investorDeck || [], qa: pitch?.qa || [],
        votes: pitch?.votes || { up: 0, down: 0 }, feedback: pitch?.feedback || [],
        status: 'draft', createdAt: pitch?.createdAt || now,
        extraPitches: { ...(pitch?.extraPitches || {}), [pt.id]: content },
      };
      await onSavePitch(updated);
      onRefresh();
    } catch { /* */ }
    setGeneratingId(null);
  };

  const produceSingle = async (pt: PitchTypeInfo) => {
    if (!project || !pitch || producingId) return;
    setProducingId(pt.id);
    try {
      const content = getContent(pt);
      if (!content) { setProducingId(null); return; }

      const ctx = [
        `Proyecto: ${project.name}`,
        `Descripción: ${project.description || ''}`,
        `Problema: ${project.problem || ''}`,
        `Solución: ${project.solution || ''}`,
        `Mercado: ${project.targetMarket || ''}`,
        `Revenue: ${project.revenueModel || ''}`,
        `Sector: ${project.sector}`,
        `Visión: ${project.vision || ''}`,
        `Diferenciadores: ${(project.differentiators || []).join(', ')}`,
        `Competidores: ${(project.competitors || []).join(', ')}`,
        '',
        `TIPO DE PITCH: ${pt.label}`,
        `DESCRIPCIÓN: ${pt.desc}`,
        '',
        `CONTENIDO DEL PITCH A CONVERTIR EN PRESENTACIÓN:`,
        content,
        '',
        `INSTRUCCIÓN: Transforma este contenido en una presentación profesional de 8-20 diapositivas. Cada diapositiva debe desarrollar una idea clave del pitch. Incluye diapositiva de portada y cierre.`,
      ].join('\n');

      const { result } = await agentApi.stopdownGenerate('pitchPresentation', ctx);
      const r = result as PresentationData;

      if (r.slides && r.slides.length > 0) {
        presMarkDone();
        await new Promise(resolve => setTimeout(resolve, 800));
        const html = generateSlideshowHtml(r, project.name);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-${pt.id}-presentacion.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch { /* */ }
    setProducingId(null);
  };

  const getContent = (pt: PitchTypeInfo): string => {
    if (!pitch) return '';
    if (pt.builtIn) {
      if (pt.builtIn === 'elevator') return pitch.elevator || '';
      if (pt.builtIn === 'oneMinute') return pitch.oneMinute || '';
      if (pt.builtIn === 'threeMinute') return pitch.threeMinute || '';
      if (pt.builtIn === 'deck') return pitch.investorDeck?.map(s => `${s.slide}: ${s.content}`).join('\n\n') || '';
      if (pt.builtIn === 'qa') return pitch.qa?.map(q => `P: ${q.question}\nR: ${q.answer}`).join('\n\n') || '';
    }
    return pitch.extraPitches?.[pt.id] || '';
  };

  const downloadSingle = (pt: PitchTypeInfo) => {
    if (!pitch || !project) return;
    if (pt.builtIn) {
      downloadPitchHtml(pt.builtIn, pitch, project.name);
      return;
    }
    const content = pitch.extraPitches?.[pt.id] || '';
    if (!content) return;
    const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escHtml(project.name)} — ${escHtml(pt.label)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;background:#09090b;font-family:'Space Grotesk',sans-serif;color:#fff;padding:48px 24px}
.wrap{max-width:700px;margin:0 auto}.badge{display:inline-flex;align-items:center;gap:6px;background:rgba(139,92,246,.12);border:1px solid rgba(139,92,246,.25);border-radius:40px;padding:5px 14px;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#a78bfa;margin-bottom:20px}
h1{font-family:'Playfair Display',serif;font-size:clamp(28px,5vw,44px);background:linear-gradient(135deg,#fff,#c4b5fd);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.sub{font-size:12px;color:#a78bfa;letter-spacing:2px;text-transform:uppercase;font-weight:600;margin-bottom:40px}
.content{font-size:14px;line-height:2;color:rgba(255,255,255,.8);white-space:pre-wrap}
.content p{margin-bottom:16px}.footer{margin-top:48px;padding-top:24px;border-top:1px solid rgba(255,255,255,.06);text-align:center;font-size:11px;color:rgba(255,255,255,.15)}</style>
<body><div class="wrap"><div class="badge">${escHtml(pt.icon)} ${escHtml(pt.label)}${pt.duration ? ` · ${pt.duration}` : ''}</div>
<h1>${escHtml(project.name)}</h1><div class="sub">${escHtml(pt.label)}</div>
<div class="content">${escHtml(content).replace(/\n/g, '<br/>')}</div>
<div class="footer">${escHtml(project.name)} · ${escHtml(pt.label)}</div></div></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-${pt.id}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredPitches = useMemo(() => {
    let list = ALL_PITCH_TYPES;
    if (filterCat !== 'all') list = list.filter(p => p.category === filterCat);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    return list;
  }, [filterCat, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<PitchCategory, PitchTypeInfo[]>();
    for (const cat of PITCH_CATEGORIES) map.set(cat.key, []);
    for (const pt of filteredPitches) {
      const arr = map.get(pt.category);
      if (arr) arr.push(pt);
    }
    return map;
  }, [filteredPitches]);

  const totalGenerated = ALL_PITCH_TYPES.filter(pt => !!getContent(pt)).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SectionNav label="Pitches" icon={Mic2} isDark={isDark} onBack={onBack} />
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Sticky search */}
        <div className={cn('sticky -top-3 -mx-3 px-3 pt-3 pb-2 z-10 space-y-2', isDark ? 'bg-zinc-950/95 backdrop-blur-sm' : 'bg-white/95 backdrop-blur-sm')}>
          <div className="relative">
            <Search className={cn('absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5', isDark ? 'text-zinc-600' : 'text-gray-400')} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar pitches..."
              className={cn('w-full text-[10px] rounded-lg border pl-8 pr-7 py-2 outline-none transition-colors focus:border-violet-500/50',
                isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400')} />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className={cn('absolute right-2 top-1/2 -translate-y-1/2', isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-gray-400 hover:text-gray-600')}>
                <X className="size-3" />
              </button>
            )}
          </div>
          <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5">
            <button onClick={() => setFilterCat('all')}
              className={cn('shrink-0 px-2 py-1 rounded-lg text-[9px] font-bold transition-all',
                filterCat === 'all'
                  ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
                  : isDark ? 'text-zinc-500 hover:bg-zinc-800' : 'text-gray-400 hover:bg-gray-100',
              )}>
              Todo ({ALL_PITCH_TYPES.length})
            </button>
            {PITCH_CATEGORIES.map(cat => {
              const count = ALL_PITCH_TYPES.filter(p => p.category === cat.key).length;
              return (
                <button key={cat.key} onClick={() => setFilterCat(filterCat === cat.key ? 'all' : cat.key)}
                  className={cn('shrink-0 px-2 py-1 rounded-lg text-[9px] font-bold transition-all',
                    filterCat === cat.key
                      ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
                      : isDark ? 'text-zinc-500 hover:bg-zinc-800' : 'text-gray-400 hover:bg-gray-100',
                  )}>
                  {cat.icon} {cat.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <AiButton label={pitch ? 'Regenerar pitches base con IA' : 'Generar pitches base con IA'} loading={generating} onClick={generateAll} isDark={isDark} full />

        {generating && currentStep >= 0 && (
          <PitchStepsIndicator currentStep={currentStep} done={stepsDone} isDark={isDark} />
        )}

        {producingId && presStep >= 0 && (
          <PresentationStepsIndicator currentStep={presStep} done={presDone} isDark={isDark} />
        )}

        {!generating && (
          <>
            {/* Stats */}
            <div className={cn('flex items-center justify-between px-1')}>
              <span className={cn('text-[9px] font-semibold', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                {totalGenerated}/{ALL_PITCH_TYPES.length} generados
              </span>
              <span className={cn('text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                {filteredPitches.length} pitches
              </span>
            </div>

            {/* Grouped cards */}
            {PITCH_CATEGORIES.map(cat => {
              const items = grouped.get(cat.key) || [];
              if (items.length === 0) return null;
              return (
                <div key={cat.key}>
                  <div className="flex items-center gap-1.5 mb-2 mt-1">
                    <span className="text-xs">{cat.icon}</span>
                    <span className={cn('text-[10px] font-bold uppercase tracking-wider', cat.color)}>{cat.label}</span>
                    <span className={cn('text-[8px] font-semibold px-1.5 rounded-full', isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-200 text-gray-500')}>{items.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map(pt => {
                      const content = getContent(pt);
                      const hasContent = !!content;
                      const isGenerating = generatingId === pt.id;
                      const isExpanded = expandedId === pt.id;
                      return (
                        <div key={pt.id} className={cn(
                          'rounded-xl border overflow-hidden transition-all',
                          hasContent
                            ? isDark ? 'border-violet-800/30 bg-gradient-to-r from-zinc-900 to-violet-950/10' : 'border-violet-200/60 bg-gradient-to-r from-white to-violet-50/30'
                            : isDark ? 'border-zinc-800/60 bg-zinc-900/30' : 'border-gray-200 bg-gray-50/50',
                        )}>
                          <div className="flex items-center gap-2.5 p-2.5">
                            <span className="text-sm shrink-0">{pt.icon}</span>
                            <button onClick={() => setExpandedId(isExpanded ? null : pt.id)} className="flex-1 min-w-0 text-left">
                              <div className="flex items-center gap-1.5">
                                <p className={cn('text-[10px] font-bold truncate', isDark ? 'text-zinc-200' : 'text-gray-800')}>{pt.label}</p>
                                {pt.duration && <span className={cn('text-[7px] px-1 py-0.5 rounded font-bold shrink-0', isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-200 text-gray-400')}>{pt.duration}</span>}
                                {hasContent && <Check className="size-3 shrink-0 text-emerald-400" />}
                              </div>
                              <p className={cn('text-[8px] truncate', isDark ? 'text-zinc-600' : 'text-gray-400')}>{pt.desc}</p>
                            </button>
                            <div className="flex items-center gap-1 shrink-0">
                              {hasContent && (
                                <button onClick={() => downloadSingle(pt)} title="Descargar texto"
                                  className={cn('size-6 rounded-lg flex items-center justify-center transition-colors', isDark ? 'text-zinc-600 hover:text-violet-400 hover:bg-zinc-800' : 'text-gray-400 hover:text-violet-500 hover:bg-gray-100')}>
                                  <Download className="size-3" />
                                </button>
                              )}
                              {pt.builtIn ? (
                                hasContent ? (
                                  <button onClick={() => produceSingle(pt)} disabled={!!producingId}
                                    className={cn('px-2 py-1 rounded-lg text-[8px] font-bold transition-colors flex items-center gap-1',
                                      producingId === pt.id
                                        ? 'bg-violet-600/20 text-violet-400'
                                        : isDark ? 'bg-violet-900/30 text-violet-400 hover:bg-violet-800/40' : 'bg-violet-100 text-violet-600 hover:bg-violet-200',
                                      'disabled:opacity-40',
                                    )}>
                                    {producingId === pt.id ? <Loader2 className="size-2.5 animate-spin" /> : <Presentation className="size-2.5" />}
                                    {producingId === pt.id ? 'Produciendo...' : 'Producir'}
                                  </button>
                                ) : null
                              ) : (
                                <div className="flex items-center gap-1">
                                  {hasContent && (
                                    <button onClick={() => produceSingle(pt)} disabled={!!producingId}
                                      className={cn('px-2 py-1 rounded-lg text-[8px] font-bold transition-colors flex items-center gap-1',
                                        producingId === pt.id
                                          ? 'bg-violet-600/20 text-violet-400'
                                          : isDark ? 'bg-violet-900/30 text-violet-400 hover:bg-violet-800/40' : 'bg-violet-100 text-violet-600 hover:bg-violet-200',
                                        'disabled:opacity-40',
                                      )}>
                                      {producingId === pt.id ? <Loader2 className="size-2.5 animate-spin" /> : <Presentation className="size-2.5" />}
                                      {producingId === pt.id ? '...' : 'Producir'}
                                    </button>
                                  )}
                                  <button onClick={() => generateSingle(pt)} disabled={!!generatingId || !!producingId}
                                    className={cn('px-2 py-1 rounded-lg text-[8px] font-bold transition-all flex items-center gap-1',
                                      isGenerating
                                        ? 'bg-violet-600/20 text-violet-400'
                                        : hasContent
                                          ? isDark ? 'bg-zinc-800 text-zinc-500 hover:text-violet-300 hover:bg-violet-900/20' : 'bg-gray-100 text-gray-400 hover:text-violet-500'
                                          : isDark ? 'bg-violet-900/20 text-violet-400 hover:bg-violet-800/30' : 'bg-violet-50 text-violet-600 hover:bg-violet-100',
                                      'disabled:opacity-30',
                                    )}>
                                    {isGenerating ? <Loader2 className="size-2.5 animate-spin" /> : <Sparkles className="size-2.5" />}
                                    {isGenerating ? '...' : hasContent ? 'Regen' : 'Generar'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {isExpanded && hasContent && (
                            <div className={cn('border-t px-3 py-2.5', isDark ? 'border-zinc-800/60' : 'border-gray-200/60')}>
                              <p className={cn('text-[9px] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto', isDark ? 'text-zinc-400' : 'text-gray-600')}>
                                {content.slice(0, 2000)}{content.length > 2000 ? '...' : ''}
                              </p>
                              <div className="flex gap-1.5 mt-2">
                                <button onClick={() => produceSingle(pt)} disabled={!!producingId}
                                  className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-bold transition-colors',
                                    producingId === pt.id
                                      ? 'bg-violet-600/30 text-violet-300'
                                      : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500',
                                    'disabled:opacity-40',
                                  )}>
                                  {producingId === pt.id ? <Loader2 className="size-2.5 animate-spin" /> : <Presentation className="size-2.5" />}
                                  {producingId === pt.id ? 'Generando presentación...' : 'Producir presentación'}
                                </button>
                                <button onClick={() => downloadSingle(pt)}
                                  className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-bold transition-colors', isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                                  <Download className="size-2.5" /> Descargar
                                </button>
                                <button onClick={() => { navigator.clipboard.writeText(content); }}
                                  className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-bold transition-colors', isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                                  <Copy className="size-2.5" /> Copiar
                                </button>
                              </div>
                            </div>
                          )}

                          {isExpanded && !hasContent && (
                            <div className={cn('border-t px-3 py-3 text-center', isDark ? 'border-zinc-800/60' : 'border-gray-200/60')}>
                              <p className={cn('text-[9px] italic mb-2', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                                {pt.builtIn ? 'Genera los pitches base con el botón de arriba' : 'Haz click en Generar para crear este pitch con IA'}
                              </p>
                              {!pt.builtIn && (
                                <button onClick={() => generateSingle(pt)} disabled={!!generatingId}
                                  className={cn('flex items-center justify-center gap-1.5 mx-auto px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all',
                                    'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-40')}>
                                  <Sparkles className="size-3" /> Generar con IA
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── DATA ROOM ────────────────────────────────────────────────────────────────

const DOC_CATEGORIES: { key: DocCategory; label: string; color: string; bgDark: string; bgLight: string; icon: string }[] = [
  { key: 'contract', label: 'Contratos', color: 'text-rose-400', bgDark: 'bg-rose-900/20', bgLight: 'bg-rose-50', icon: '📄' },
  { key: 'nda', label: 'NDA', color: 'text-red-400', bgDark: 'bg-red-900/20', bgLight: 'bg-red-50', icon: '🔒' },
  { key: 'agreement', label: 'Acuerdos', color: 'text-emerald-400', bgDark: 'bg-emerald-900/20', bgLight: 'bg-emerald-50', icon: '🤝' },
  { key: 'pitch-deck', label: 'Pitch Deck', color: 'text-violet-400', bgDark: 'bg-violet-900/20', bgLight: 'bg-violet-50', icon: '🎤' },
  { key: 'financial', label: 'Financiero', color: 'text-amber-400', bgDark: 'bg-amber-900/20', bgLight: 'bg-amber-50', icon: '💰' },
  { key: 'legal', label: 'Legal', color: 'text-sky-400', bgDark: 'bg-sky-900/20', bgLight: 'bg-sky-50', icon: '⚖️' },
  { key: 'technical', label: 'Técnico', color: 'text-cyan-400', bgDark: 'bg-cyan-900/20', bgLight: 'bg-cyan-50', icon: '⚙️' },
  { key: 'other', label: 'Otro', color: 'text-zinc-400', bgDark: 'bg-zinc-800/40', bgLight: 'bg-gray-100', icon: '📁' },
];

const DATA_ROOM_TEMPLATES: { name: string; category: DocCategory; accessLevel: 'founders' | 'team' | 'investors' | 'public'; priority: 'essential' | 'recommended' | 'optional' }[] = [
  // ── Legal (15) ──
  { name: 'Escritura de Constitución de la Sociedad', category: 'legal', accessLevel: 'founders', priority: 'essential' },
  { name: 'Estatutos Sociales', category: 'legal', accessLevel: 'founders', priority: 'essential' },
  { name: 'Poderes Notariales', category: 'legal', accessLevel: 'founders', priority: 'recommended' },
  { name: 'Acta de Asamblea Constitutiva', category: 'legal', accessLevel: 'founders', priority: 'essential' },
  { name: 'Registro Mercantil', category: 'legal', accessLevel: 'founders', priority: 'essential' },
  { name: 'Licencias y Permisos de Operación', category: 'legal', accessLevel: 'team', priority: 'essential' },
  { name: 'Política de Privacidad (GDPR/LOPD)', category: 'legal', accessLevel: 'public', priority: 'essential' },
  { name: 'Términos y Condiciones de Servicio', category: 'legal', accessLevel: 'public', priority: 'essential' },
  { name: 'Política de Cookies', category: 'legal', accessLevel: 'public', priority: 'recommended' },
  { name: 'Aviso Legal del Sitio Web', category: 'legal', accessLevel: 'public', priority: 'recommended' },
  { name: 'Registro de Marca Comercial', category: 'legal', accessLevel: 'founders', priority: 'essential' },
  { name: 'Patentes y Propiedad Intelectual', category: 'legal', accessLevel: 'founders', priority: 'recommended' },
  { name: 'Certificado de Cumplimiento Normativo', category: 'legal', accessLevel: 'investors', priority: 'recommended' },
  { name: 'Política de Protección de Datos', category: 'legal', accessLevel: 'team', priority: 'essential' },
  { name: 'Acta de Nombramiento de Administradores', category: 'legal', accessLevel: 'founders', priority: 'essential' },
  // ── Contracts (15) ──
  { name: 'Contrato de Trabajo Estándar', category: 'contract', accessLevel: 'team', priority: 'essential' },
  { name: 'Contrato de Prestación de Servicios', category: 'contract', accessLevel: 'team', priority: 'essential' },
  { name: 'Contrato de Desarrollo de Software', category: 'contract', accessLevel: 'team', priority: 'recommended' },
  { name: 'Contrato de Licencia de Software (SaaS)', category: 'contract', accessLevel: 'investors', priority: 'essential' },
  { name: 'Contrato de Distribución', category: 'contract', accessLevel: 'founders', priority: 'recommended' },
  { name: 'Contrato de Franquicia', category: 'contract', accessLevel: 'founders', priority: 'optional' },
  { name: 'Contrato con Proveedores', category: 'contract', accessLevel: 'team', priority: 'essential' },
  { name: 'Contrato de Alquiler de Oficina', category: 'contract', accessLevel: 'founders', priority: 'recommended' },
  { name: 'Contrato de Consultoría', category: 'contract', accessLevel: 'team', priority: 'recommended' },
  { name: 'Contrato de Marketing y Publicidad', category: 'contract', accessLevel: 'team', priority: 'recommended' },
  { name: 'Contrato de Mantenimiento Técnico', category: 'contract', accessLevel: 'team', priority: 'optional' },
  { name: 'Contrato de Joint Venture', category: 'contract', accessLevel: 'founders', priority: 'optional' },
  { name: 'Contrato de Outsourcing', category: 'contract', accessLevel: 'founders', priority: 'optional' },
  { name: 'Contrato de Representación Comercial', category: 'contract', accessLevel: 'team', priority: 'optional' },
  { name: 'Contrato de Suministro', category: 'contract', accessLevel: 'team', priority: 'recommended' },
  // ── NDA (8) ──
  { name: 'NDA Unilateral (Estándar)', category: 'nda', accessLevel: 'team', priority: 'essential' },
  { name: 'NDA Bilateral (Mutuo)', category: 'nda', accessLevel: 'team', priority: 'essential' },
  { name: 'NDA para Empleados', category: 'nda', accessLevel: 'team', priority: 'essential' },
  { name: 'NDA para Inversores', category: 'nda', accessLevel: 'investors', priority: 'essential' },
  { name: 'NDA para Consultores Externos', category: 'nda', accessLevel: 'team', priority: 'recommended' },
  { name: 'NDA para Partners Tecnológicos', category: 'nda', accessLevel: 'founders', priority: 'recommended' },
  { name: 'NDA para Due Diligence', category: 'nda', accessLevel: 'investors', priority: 'essential' },
  { name: 'NDA para Proveedores', category: 'nda', accessLevel: 'team', priority: 'recommended' },
  // ── Agreements (15) ──
  { name: 'Acuerdo de Socios (Shareholders Agreement)', category: 'agreement', accessLevel: 'founders', priority: 'essential' },
  { name: 'Pacto de Socios', category: 'agreement', accessLevel: 'founders', priority: 'essential' },
  { name: 'Acuerdo de Vesting de Acciones', category: 'agreement', accessLevel: 'founders', priority: 'essential' },
  { name: 'Acuerdo de No Competencia', category: 'agreement', accessLevel: 'team', priority: 'essential' },
  { name: 'Acuerdo de Confidencialidad con Empleados', category: 'agreement', accessLevel: 'team', priority: 'essential' },
  { name: 'Acuerdo de Cesión de Propiedad Intelectual', category: 'agreement', accessLevel: 'team', priority: 'essential' },
  { name: 'Acuerdo de Nivel de Servicio (SLA)', category: 'agreement', accessLevel: 'investors', priority: 'recommended' },
  { name: 'Acuerdo de Procesamiento de Datos (DPA)', category: 'agreement', accessLevel: 'team', priority: 'essential' },
  { name: 'Acuerdo de Partnership Estratégico', category: 'agreement', accessLevel: 'founders', priority: 'recommended' },
  { name: 'Acuerdo de Distribución de Beneficios', category: 'agreement', accessLevel: 'founders', priority: 'recommended' },
  { name: 'Acuerdo de Co-desarrollo', category: 'agreement', accessLevel: 'founders', priority: 'optional' },
  { name: 'Acuerdo SAFE (Simple Agreement for Future Equity)', category: 'agreement', accessLevel: 'investors', priority: 'essential' },
  { name: 'Acuerdo de Convertible Note', category: 'agreement', accessLevel: 'investors', priority: 'recommended' },
  { name: 'Acuerdo de Stock Options (ESOP)', category: 'agreement', accessLevel: 'founders', priority: 'essential' },
  { name: 'Acuerdo Marco de Colaboración', category: 'agreement', accessLevel: 'team', priority: 'recommended' },
  // ── Financial (15) ──
  { name: 'Plan Financiero a 3 Años', category: 'financial', accessLevel: 'investors', priority: 'essential' },
  { name: 'Modelo de Proyección de Ingresos', category: 'financial', accessLevel: 'investors', priority: 'essential' },
  { name: 'Estado de Resultados (P&L)', category: 'financial', accessLevel: 'investors', priority: 'essential' },
  { name: 'Balance General', category: 'financial', accessLevel: 'investors', priority: 'essential' },
  { name: 'Flujo de Caja (Cash Flow)', category: 'financial', accessLevel: 'founders', priority: 'essential' },
  { name: 'Tabla de Capitalización (Cap Table)', category: 'financial', accessLevel: 'founders', priority: 'essential' },
  { name: 'Presupuesto Operativo Anual', category: 'financial', accessLevel: 'founders', priority: 'essential' },
  { name: 'Análisis de Punto de Equilibrio (Break-even)', category: 'financial', accessLevel: 'investors', priority: 'recommended' },
  { name: 'Modelo de Valoración de la Empresa', category: 'financial', accessLevel: 'founders', priority: 'essential' },
  { name: 'Plan de Uso de Fondos (Use of Funds)', category: 'financial', accessLevel: 'investors', priority: 'essential' },
  { name: 'Unit Economics (LTV, CAC, Churn)', category: 'financial', accessLevel: 'investors', priority: 'essential' },
  { name: 'Modelo de Pricing y Revenue', category: 'financial', accessLevel: 'founders', priority: 'recommended' },
  { name: 'Informe de Gastos Mensuales', category: 'financial', accessLevel: 'founders', priority: 'recommended' },
  { name: 'Plan de Runway y Burn Rate', category: 'financial', accessLevel: 'founders', priority: 'essential' },
  { name: 'Informe de Métricas Financieras (KPIs)', category: 'financial', accessLevel: 'investors', priority: 'essential' },
  // ── Pitch Deck (12) ──
  { name: 'Pitch Deck para Inversores (Completo)', category: 'pitch-deck', accessLevel: 'investors', priority: 'essential' },
  { name: 'One-Pager Ejecutivo', category: 'pitch-deck', accessLevel: 'investors', priority: 'essential' },
  { name: 'Executive Summary', category: 'pitch-deck', accessLevel: 'investors', priority: 'essential' },
  { name: 'Elevator Pitch Script (30 segundos)', category: 'pitch-deck', accessLevel: 'team', priority: 'essential' },
  { name: 'Pitch Deck para Aceleradoras', category: 'pitch-deck', accessLevel: 'investors', priority: 'recommended' },
  { name: 'Investor Teaser', category: 'pitch-deck', accessLevel: 'investors', priority: 'recommended' },
  { name: 'Pitch Deck de Producto', category: 'pitch-deck', accessLevel: 'team', priority: 'recommended' },
  { name: 'Presentación de Ronda Seed', category: 'pitch-deck', accessLevel: 'investors', priority: 'essential' },
  { name: 'Presentación de Serie A', category: 'pitch-deck', accessLevel: 'investors', priority: 'recommended' },
  { name: 'Demo Day Presentation', category: 'pitch-deck', accessLevel: 'investors', priority: 'recommended' },
  { name: 'Pitch Deck para Partners Estratégicos', category: 'pitch-deck', accessLevel: 'founders', priority: 'optional' },
  { name: 'Documento de FAQ para Inversores', category: 'pitch-deck', accessLevel: 'investors', priority: 'essential' },
  // ── Technical (12) ──
  { name: 'Arquitectura Técnica del Sistema', category: 'technical', accessLevel: 'team', priority: 'essential' },
  { name: 'Documentación de API', category: 'technical', accessLevel: 'team', priority: 'essential' },
  { name: 'Plan de Seguridad Informática', category: 'technical', accessLevel: 'founders', priority: 'essential' },
  { name: 'Política de Backup y Recuperación', category: 'technical', accessLevel: 'team', priority: 'essential' },
  { name: 'Roadmap Técnico del Producto', category: 'technical', accessLevel: 'investors', priority: 'essential' },
  { name: 'Documento de Especificaciones Técnicas', category: 'technical', accessLevel: 'team', priority: 'recommended' },
  { name: 'Plan de Escalabilidad', category: 'technical', accessLevel: 'investors', priority: 'recommended' },
  { name: 'Auditoría de Código y Seguridad', category: 'technical', accessLevel: 'founders', priority: 'recommended' },
  { name: 'Documentación de Infraestructura (Cloud)', category: 'technical', accessLevel: 'team', priority: 'recommended' },
  { name: 'Plan de Continuidad del Negocio (BCP)', category: 'technical', accessLevel: 'founders', priority: 'essential' },
  { name: 'Política de Control de Versiones', category: 'technical', accessLevel: 'team', priority: 'optional' },
  { name: 'Manual Técnico de Integraciones', category: 'technical', accessLevel: 'team', priority: 'optional' },
  // ── Other (8) ──
  { name: 'Business Model Canvas', category: 'other', accessLevel: 'investors', priority: 'essential' },
  { name: 'Lean Canvas', category: 'other', accessLevel: 'investors', priority: 'essential' },
  { name: 'Plan de Negocio Completo', category: 'other', accessLevel: 'investors', priority: 'essential' },
  { name: 'Análisis de Mercado y Competencia', category: 'other', accessLevel: 'investors', priority: 'essential' },
  { name: 'Plan de Marketing y Growth', category: 'other', accessLevel: 'team', priority: 'recommended' },
  { name: 'Manual de Cultura y Valores de la Empresa', category: 'other', accessLevel: 'public', priority: 'recommended' },
  { name: 'Plan de Contratación y RRHH', category: 'other', accessLevel: 'founders', priority: 'recommended' },
  { name: 'Estrategia de Go-to-Market', category: 'other', accessLevel: 'investors', priority: 'essential' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateDocHtml(doc: StopdownDocument, projectName: string): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const catInfo = DOC_CATEGORIES.find(c => c.key === doc.category);
  const content = doc.content.split('\n').map(line => {
    if (line.startsWith('# ')) return `<h1>${e(line.slice(2))}</h1>`;
    if (line.startsWith('## ')) return `<h2>${e(line.slice(3))}</h2>`;
    if (line.startsWith('- ')) return `<li>${e(line.slice(2))}</li>`;
    if (!line.trim()) return '<br/>';
    return `<p>${e(line)}</p>`;
  }).join('\n');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${e(doc.name)} — ${e(projectName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;background:#09090b;font-family:'Space Grotesk',sans-serif;color:#fff}
.header{padding:48px;background:linear-gradient(135deg,#0f0b1a,#1a0d2e);border-bottom:1px solid rgba(255,255,255,.06)}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.4);margin-bottom:16px}
.badge span{font-size:14px}
h1.title{font-family:'Playfair Display',serif;font-size:clamp(24px,4vw,40px);background:linear-gradient(135deg,#fff,#c4b5fd);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.meta{display:flex;gap:16px;font-size:11px;color:rgba(255,255,255,.35)}
.meta .tag{padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
.content{max-width:720px;margin:0 auto;padding:48px 32px}
.content h1{font-family:'Playfair Display',serif;font-size:24px;color:#e2e0ff;margin:32px 0 12px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.06)}
.content h2{font-size:18px;font-weight:700;color:#c4b5fd;margin:24px 0 8px}
.content p{font-size:14px;line-height:1.9;color:rgba(255,255,255,.7);margin-bottom:8px}
.content li{font-size:13px;line-height:1.8;color:rgba(255,255,255,.65);margin-left:20px;list-style:disc;margin-bottom:4px}
.footer{text-align:center;padding:32px;font-size:10px;color:rgba(255,255,255,.12);border-top:1px solid rgba(255,255,255,.04)}
</style></head><body>
<div class="header">
<div class="badge"><span>${catInfo?.icon || '📄'}</span> ${e(catInfo?.label || doc.category)}</div>
<h1 class="title">${e(doc.name)}</h1>
<div class="meta"><span class="tag">${e(doc.accessLevel)}</span>${doc.priority ? `<span class="tag">${e(doc.priority)}</span>` : ''}<span>v${doc.version}</span></div>
</div>
<div class="content">${content}</div>
<div class="footer">${e(projectName)} — Data Room · ${e(doc.name)}</div>
</body></html>`;
}

function downloadDocHtml(doc: StopdownDocument, projectName: string) {
  if (doc.fileDataUrl) {
    const a = document.createElement('a');
    a.href = doc.fileDataUrl;
    a.download = doc.fileName || `${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }
  const html = generateDocHtml(doc, projectName);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function DataRoomView({ isDark, project, documents, onSaveDoc, onDeleteDoc, onBack, onRefresh }: {
  isDark: boolean; project: StopdownProject | null; documents: StopdownDocument[];
  onSaveDoc: (d: StopdownDocument) => Promise<void>; onDeleteDoc: (id: string, rev: string) => Promise<void>;
  onBack: () => void; onRefresh: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [generatingDocId, setGeneratingDocId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState(false);
  const [dragOverCat, setDragOverCat] = useState<DocCategory | null>(null);
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [filterCat, setFilterCat] = useState<DocCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    if (!project || seededRef.current || loadingTemplates) return;
    const existingNames = new Set(documents.map(d => d.name));
    const missing = DATA_ROOM_TEMPLATES.filter(t => !existingNames.has(t.name));
    if (missing.length === 0) { seededRef.current = true; return; }
    seededRef.current = true;
    setLoadingTemplates(true);
    (async () => {
      try {
        const now = new Date().toISOString();
        for (const tpl of missing) {
          await onSaveDoc({
            type: 'document', projectId: project._id || '', name: tpl.name,
            category: tpl.category, content: '', accessLevel: tpl.accessLevel,
            priority: tpl.priority, version: 1, createdAt: now, updatedAt: now,
          });
        }
        onRefresh();
      } catch { /* */ }
      setLoadingTemplates(false);
    })();
  }, [project?._id]);

  const generate = async () => {
    if (!project) return;
    setGenerating(true);
    try {
      const ctx = `Proyecto: ${project.name}\nDescripción: ${project.description}\nSector: ${project.sector}\nEquipo: ${project.team.map((t) => t.role).join(', ')}\nEtapa: ${project.stage}`;
      const { result } = await agentApi.stopdownGenerate('dataroom', ctx);
      const r = result as { documents?: { name: string; category: DocCategory; content: string; accessLevel: string; priority?: string }[] };
      const now = new Date().toISOString();
      for (const doc of (r.documents || [])) {
        const newDoc: StopdownDocument = {
          type: 'document', projectId: project._id || '', name: doc.name,
          category: doc.category, content: doc.content,
          accessLevel: (doc.accessLevel as StopdownDocument['accessLevel']) || 'founders',
          priority: doc.priority, version: 1, createdAt: now, updatedAt: now,
        };
        await onSaveDoc(newDoc);
      }
      onRefresh();
    } catch { /* */ }
    setGenerating(false);
  };

  const generateDocContent = async (doc: StopdownDocument) => {
    if (!project || generatingDocId) return;
    setGeneratingDocId(doc._id || null);
    try {
      const catLabel = DOC_CATEGORIES.find(c => c.key === doc.category)?.label || doc.category;
      const ctx = `Proyecto: ${project.name}\nDescripción: ${project.description}\nSector: ${project.sector}\nEtapa: ${project.stage}\nProblema: ${project.problem}\nSolución: ${project.solution}\nMercado: ${project.targetMarket}\nRevenue: ${project.revenueModel}\nVisión: ${project.vision || ''}\nCompetidores: ${(project.competitors || []).join(', ')}\nDiferenciadores: ${(project.differentiators || []).join(', ')}\nRiesgos: ${(project.risks || []).join(', ')}\n\nGENERA EL CONTENIDO COMPLETO Y DETALLADO PARA EL SIGUIENTE DOCUMENTO:\nNombre: ${doc.name}\nCategoría: ${catLabel}\nNivel de acceso: ${doc.accessLevel}\n\nEl documento debe ser profesional, detallado y listo para usar. Escríbelo en formato de texto estructurado con secciones claras.`;
      const { result } = await agentApi.stopdownGenerate('pitch', ctx);
      const r = result as Record<string, unknown>;
      const content = typeof r === 'string' ? r : (r.threeMinute as string) || (r.oneMinute as string) || (r.elevator as string) || JSON.stringify(r, null, 2);
      const updatedDoc: StopdownDocument = {
        ...doc, content, updatedAt: new Date().toISOString(), version: (doc.version || 1) + 1,
      };
      const html = generateDocHtml(updatedDoc, project.name);
      const blob = new Blob([html], { type: 'text/html' });
      const fileDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      updatedDoc.fileName = `${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
      updatedDoc.fileSize = blob.size;
      updatedDoc.fileType = 'text/html';
      updatedDoc.fileDataUrl = fileDataUrl;
      await onSaveDoc(updatedDoc);
      onRefresh();
      setExpandedId(doc._id || null);
    } catch { /* */ }
    setGeneratingDocId(null);
  };

  const isDocGenerated = (d: StopdownDocument): boolean => {
    if (d.isFile) return true;
    if (!d.content) return false;
    return d.content.length > 100 && !d.content.startsWith('Archivo subido:');
  };

  const processFiles = async (files: FileList | File[]) => {
    if (!project) return;
    const now = new Date().toISOString();
    for (const file of Array.from(files)) {
      const category = guessCategory(file.name, file.type);
      let fileDataUrl = '';
      if (file.size <= 2 * 1024 * 1024) {
        fileDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }
      const newDoc: StopdownDocument = {
        type: 'document', projectId: project._id || '', name: file.name.replace(/\.[^.]+$/, ''),
        category, content: `Archivo subido: ${file.name}\nTamaño: ${formatFileSize(file.size)}\nTipo: ${file.type || 'desconocido'}`,
        accessLevel: 'founders', version: 1, createdAt: now, updatedAt: now,
        isFile: true, fileName: file.name, fileSize: file.size, fileType: file.type,
        ...(fileDataUrl ? { fileDataUrl } : {}),
      };
      await onSaveDoc(newDoc);
    }
    onRefresh();
  };

  const guessCategory = (name: string, mime: string): DocCategory => {
    const n = name.toLowerCase();
    if (n.includes('nda') || n.includes('confidencial')) return 'nda';
    if (n.includes('contrato') || n.includes('contract')) return 'contract';
    if (n.includes('acuerdo') || n.includes('agreement')) return 'agreement';
    if (n.includes('pitch') || n.includes('deck') || n.includes('presentaci')) return 'pitch-deck';
    if (n.includes('financ') || n.includes('budget') || n.includes('balance')) return 'financial';
    if (n.includes('legal') || n.includes('estatut') || n.includes('pact')) return 'legal';
    if (n.includes('tech') || n.includes('api') || n.includes('arch')) return 'technical';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return 'financial';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return 'pitch-deck';
    return 'other';
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverZone(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleCatDrop = async (e: React.DragEvent, targetCat: DocCategory) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCat(null);

    if (e.dataTransfer.files.length > 0) {
      if (!project) return;
      const now = new Date().toISOString();
      for (const file of Array.from(e.dataTransfer.files)) {
        let fileDataUrl = '';
        if (file.size <= 2 * 1024 * 1024) {
          fileDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
        }
        const newDoc: StopdownDocument = {
          type: 'document', projectId: project._id || '', name: file.name.replace(/\.[^.]+$/, ''),
          category: targetCat, content: `Archivo subido: ${file.name}\nTamaño: ${formatFileSize(file.size)}\nTipo: ${file.type || 'desconocido'}`,
          accessLevel: 'founders', version: 1, createdAt: now, updatedAt: now,
          isFile: true, fileName: file.name, fileSize: file.size, fileType: file.type,
          ...(fileDataUrl ? { fileDataUrl } : {}),
        };
        await onSaveDoc(newDoc);
      }
      onRefresh();
      return;
    }

    if (draggingDocId) {
      const doc = documents.find(d => d._id === draggingDocId);
      if (doc && doc.category !== targetCat) {
        await onSaveDoc({ ...doc, category: targetCat, updatedAt: new Date().toISOString() });
        onRefresh();
      }
      setDraggingDocId(null);
    }
  };

  const toggleCat = (cat: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.content || '').toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q) ||
      (d.fileName || '').toLowerCase().includes(q),
    );
  }, [documents, searchQuery]);

  const grouped = useMemo(() => {
    const map = new Map<DocCategory, StopdownDocument[]>();
    for (const cat of DOC_CATEGORIES) map.set(cat.key, []);
    for (const doc of filteredDocuments) {
      const arr = map.get(doc.category) || map.get('other')!;
      arr.push(doc);
    }
    return map;
  }, [filteredDocuments]);

  const filteredCats = filterCat === 'all'
    ? DOC_CATEGORIES.filter(c => (grouped.get(c.key) || []).length > 0)
    : DOC_CATEGORIES.filter(c => c.key === filterCat);

  const emptyCats = DOC_CATEGORIES.filter(c => (grouped.get(c.key) || []).length === 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SectionNav label="Data Room" icon={FolderLock} isDark={isDark} onBack={onBack} />
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Sticky search */}
        <div className={cn('sticky -top-3 -mx-3 px-3 pt-3 pb-2 z-10 space-y-2', isDark ? 'bg-zinc-950/95 backdrop-blur-sm' : 'bg-white/95 backdrop-blur-sm')}>
          <div className="relative">
            <Search className={cn('absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5', isDark ? 'text-zinc-600' : 'text-gray-400')} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar documentos..."
              className={cn('w-full text-[10px] rounded-lg border pl-8 pr-7 py-2 outline-none transition-colors focus:border-violet-500/50',
                isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400')} />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className={cn('absolute right-2 top-1/2 -translate-y-1/2', isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-gray-400 hover:text-gray-600')}>
                <X className="size-3" />
              </button>
            )}
          </div>
          {documents.length > 0 && (
            <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5">
              <button onClick={() => setFilterCat('all')}
                className={cn('shrink-0 px-2 py-1 rounded-lg text-[9px] font-bold transition-all',
                  filterCat === 'all'
                    ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
                    : isDark ? 'text-zinc-500 hover:bg-zinc-800' : 'text-gray-400 hover:bg-gray-100',
                )}>
                Todo ({documents.length})
              </button>
              {DOC_CATEGORIES.filter(c => (grouped.get(c.key) || []).length > 0).map(c => (
                <button key={c.key} onClick={() => setFilterCat(filterCat === c.key ? 'all' : c.key)}
                  className={cn('shrink-0 px-2 py-1 rounded-lg text-[9px] font-bold transition-all',
                    filterCat === c.key
                      ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
                      : isDark ? 'text-zinc-500 hover:bg-zinc-800' : 'text-gray-400 hover:bg-gray-100',
                  )}>
                  {c.icon} {c.label} ({(grouped.get(c.key) || []).length})
                </button>
              ))}
            </div>
          )}
        </div>

        <AiButton label={documents.length ? 'Regenerar documentos' : 'Generar documentos con IA'} loading={generating} onClick={generate} isDark={isDark} full />

        {loadingTemplates && (
          <div className={cn('flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-medium', isDark ? 'bg-zinc-900/60 text-zinc-400' : 'bg-gray-50 text-gray-500')}>
            <Loader2 className="size-3 animate-spin text-violet-400" />
            Cargando plantillas del data room...
          </div>
        )}

        {/* Progress indicator */}
        {documents.length > 0 && !loadingTemplates && (() => {
          const generated = documents.filter(d => isDocGenerated(d)).length;
          const total = documents.length;
          const pct = Math.round((generated / total) * 100);
          return (
            <div className={cn('rounded-xl border p-2.5', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn('text-[9px] font-bold', isDark ? 'text-zinc-400' : 'text-gray-500')}>
                  {generated === total ? '✅ Todos los documentos generados' : `📄 ${generated}/${total} documentos generados`}
                </span>
                <span className={cn('text-[9px] font-bold tabular-nums', isDark ? 'text-zinc-300' : 'text-gray-700')}>{pct}%</span>
              </div>
              <div className={cn('h-1.5 rounded-full overflow-hidden', isDark ? 'bg-zinc-800' : 'bg-gray-200')}>
                <div className={cn('h-full rounded-full transition-all duration-700',
                  pct === 100 ? 'bg-gradient-to-r from-emerald-500 to-green-400' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500',
                )} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })()}

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverZone(true); }}
          onDragLeave={() => setDragOverZone(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-all',
            dragOverZone
              ? isDark ? 'border-violet-500 bg-violet-900/20' : 'border-violet-400 bg-violet-50'
              : isDark ? 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900/40' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50',
          )}
        >
          <Upload className={cn('size-5 mx-auto mb-1.5', dragOverZone ? 'text-violet-400' : isDark ? 'text-zinc-600' : 'text-gray-400')} />
          <p className={cn('text-[10px] font-semibold', isDark ? 'text-zinc-400' : 'text-gray-500')}>
            {dragOverZone ? 'Suelta los archivos aquí' : 'Arrastra archivos o haz click para subir'}
          </p>
          <p className={cn('text-[8px] mt-0.5', isDark ? 'text-zinc-600' : 'text-gray-400')}>PDF, DOC, XLS, PPT, imágenes... (máx 2MB)</p>
          <input ref={fileInputRef} type="file" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) { processFiles(e.target.files); e.target.value = ''; } }} />
        </div>

        {searchQuery && filteredDocuments.length === 0 && (
          <div className="text-center py-6">
            <Search className={cn('size-8 mx-auto mb-2', isDark ? 'text-zinc-700' : 'text-gray-300')} />
            <p className={cn('text-[10px] font-semibold', isDark ? 'text-zinc-500' : 'text-gray-400')}>Sin resultados para "{searchQuery}"</p>
          </div>
        )}

        {/* Grouped documents */}
        {filteredCats.map(cat => {
          const docs = grouped.get(cat.key) || [];
          if (docs.length === 0) return null;
          const collapsed = collapsedCats.has(cat.key);
          return (
            <div key={cat.key}
              onDragOver={(e) => { e.preventDefault(); setDragOverCat(cat.key); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCat(null); }}
              onDrop={(e) => handleCatDrop(e, cat.key)}
              className={cn('rounded-xl border overflow-hidden transition-all',
                dragOverCat === cat.key
                  ? isDark ? 'border-violet-500/50 bg-violet-900/10' : 'border-violet-300 bg-violet-50/30'
                  : isDark ? 'border-zinc-800' : 'border-gray-200',
              )}>
              <button onClick={() => toggleCat(cat.key)}
                className={cn('w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                  isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-gray-50')}>
                <span className="text-sm">{cat.icon}</span>
                <span className={cn('text-[10px] font-bold flex-1', cat.color)}>{cat.label}</span>
                {(() => {
                  const generated = docs.filter(d => isDocGenerated(d)).length;
                  return (
                    <span className={cn('text-[8px] font-bold px-1.5 py-0.5 rounded-full',
                      generated === docs.length
                        ? isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-600'
                        : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-200 text-gray-500',
                    )}>
                      {generated}/{docs.length}
                    </span>
                  );
                })()}
                <ChevronDown className={cn('size-3 transition-transform', collapsed && '-rotate-90', isDark ? 'text-zinc-600' : 'text-gray-400')} />
              </button>

              {!collapsed && (
                <div className={cn('border-t px-1 pb-1', isDark ? 'border-zinc-800/60' : 'border-gray-100')}>
                  {docs.map(d => {
                    const hasGenerated = isDocGenerated(d);
                    const isGenDoc = generatingDocId === d._id;
                    return (
                    <div key={d._id}
                      draggable
                      onDragStart={() => setDraggingDocId(d._id || null)}
                      onDragEnd={() => { setDraggingDocId(null); setDragOverCat(null); }}
                      className={cn('rounded-lg mx-1 mt-1 transition-all',
                        draggingDocId === d._id ? 'opacity-40' : !hasGenerated && !d.isFile ? 'opacity-45' : '',
                        isDark ? 'bg-zinc-900/60 hover:bg-zinc-800/60' : 'bg-white hover:bg-gray-50',
                        !hasGenerated && !d.isFile && (isDark ? 'border border-dashed border-zinc-800' : 'border border-dashed border-gray-200'),
                      )}>
                      <div className="flex items-center gap-2 p-2.5">
                        <GripVertical className={cn('size-3 shrink-0 cursor-grab active:cursor-grabbing', isDark ? 'text-zinc-700' : 'text-gray-300')} />
                        {d.isFile
                          ? <File className={cn('size-3.5 shrink-0', cat.color)} />
                          : <FileText className={cn('size-3.5 shrink-0', hasGenerated ? cat.color : isDark ? 'text-zinc-600' : 'text-gray-300')} />
                        }
                        <button onClick={() => setExpandedId(expandedId === d._id ? null : d._id!)}
                          className="flex-1 min-w-0 text-left">
                          <div className="flex items-center gap-1.5">
                            <p className={cn('text-[10px] font-semibold truncate', hasGenerated ? (isDark ? 'text-zinc-200' : 'text-gray-800') : (isDark ? 'text-zinc-500' : 'text-gray-400'))}>{d.name}</p>
                            {hasGenerated && !d.isFile && <Check className="size-3 shrink-0 text-emerald-400" />}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {d.isFile && d.fileSize && (
                              <span className={cn('text-[8px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>{formatFileSize(d.fileSize)}</span>
                            )}
                            <span className={cn('text-[8px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>{d.accessLevel}</span>
                            {d.version > 1 && <span className={cn('text-[7px] px-1 rounded font-bold', isDark ? 'bg-cyan-900/30 text-cyan-400' : 'bg-cyan-50 text-cyan-600')}>v{d.version}</span>}
                            {d.priority && <span className={cn('text-[7px] px-1 rounded font-bold',
                              d.priority === 'essential' ? isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-500' : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-200 text-gray-500'
                            )}>{d.priority}</span>}
                          </div>
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {!d.isFile && (
                            <button onClick={() => generateDocContent(d)} disabled={!!generatingDocId}
                              title={hasGenerated ? 'Regenerar contenido' : 'Generar contenido'}
                              className={cn('size-6 rounded-lg flex items-center justify-center transition-colors',
                                isGenDoc
                                  ? 'text-violet-400'
                                  : hasGenerated
                                    ? isDark ? 'text-zinc-600 hover:text-cyan-400 hover:bg-zinc-800' : 'text-gray-400 hover:text-cyan-500 hover:bg-gray-100'
                                    : isDark ? 'text-violet-400 hover:bg-violet-900/30' : 'text-violet-500 hover:bg-violet-50',
                                'disabled:opacity-30',
                              )}>
                              {isGenDoc ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                            </button>
                          )}
                          {hasGenerated && (
                            <button onClick={() => downloadDocHtml(d, project?.name || 'Proyecto')}
                              title={d.fileDataUrl ? 'Descargar documento' : 'Descargar / Compartir'}
                              className={cn('size-6 rounded-lg flex items-center justify-center transition-colors',
                                d.fileDataUrl
                                  ? isDark ? 'text-emerald-500 hover:text-emerald-400 hover:bg-emerald-900/20' : 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50'
                                  : isDark ? 'text-zinc-600 hover:text-violet-400 hover:bg-zinc-800' : 'text-gray-400 hover:text-violet-500 hover:bg-gray-100',
                              )}>
                              {d.fileDataUrl ? <Download className="size-3" /> : <Share2 className="size-3" />}
                            </button>
                          )}
                          <button onClick={() => { if (d._id && d._rev) onDeleteDoc(d._id, d._rev).then(onRefresh); }}
                            className={cn('size-6 rounded-lg flex items-center justify-center transition-colors', isDark ? 'text-zinc-600 hover:text-red-400 hover:bg-zinc-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100')}>
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>

                      {/* Generate prompt for empty docs */}
                      {!hasGenerated && !d.isFile && expandedId !== d._id && (
                        <div className={cn('mx-2.5 mb-2 px-2.5 py-2 rounded-lg border border-dashed text-center', isDark ? 'border-zinc-700/50 bg-zinc-900/30' : 'border-gray-200 bg-gray-50/50')}>
                          <button onClick={() => generateDocContent(d)} disabled={!!generatingDocId}
                            className={cn(
                              'flex items-center justify-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg text-[9px] font-bold transition-all',
                              isGenDoc
                                ? 'bg-violet-600/20 text-violet-400'
                                : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500',
                              'disabled:opacity-40',
                            )}>
                            {isGenDoc ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                            {isGenDoc ? 'Generando documento...' : 'Generar documento con IA'}
                          </button>
                          <p className={cn('text-[8px] mt-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>El contenido se generará según el contexto del proyecto</p>
                        </div>
                      )}

                      {expandedId === d._id && (
                        <div className={cn('mx-2.5 mb-2.5 rounded-lg border p-2.5', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
                          {/* Category selector */}
                          <div className="flex flex-wrap gap-1 mb-2">
                            {DOC_CATEGORIES.map(c => (
                              <button key={c.key} onClick={async () => {
                                if (d.category !== c.key) {
                                  await onSaveDoc({ ...d, category: c.key, updatedAt: new Date().toISOString() });
                                  onRefresh();
                                }
                              }}
                                className={cn('px-1.5 py-0.5 rounded text-[8px] font-bold transition-all',
                                  d.category === c.key
                                    ? isDark ? `${c.bgDark} ${c.color}` : `${c.bgLight} ${c.color}`
                                    : isDark ? 'bg-zinc-800 text-zinc-600 hover:text-zinc-400' : 'bg-gray-100 text-gray-400 hover:text-gray-600',
                                )}>
                                {c.icon} {c.label}
                              </button>
                            ))}
                          </div>
                          {/* Access level */}
                          <div className="flex gap-1 mb-2">
                            {(['founders', 'team', 'investors', 'public'] as const).map(level => (
                              <button key={level} onClick={async () => {
                                if (d.accessLevel !== level) {
                                  await onSaveDoc({ ...d, accessLevel: level, updatedAt: new Date().toISOString() });
                                  onRefresh();
                                }
                              }}
                                className={cn('px-1.5 py-0.5 rounded text-[8px] font-semibold transition-all',
                                  d.accessLevel === level
                                    ? isDark ? 'bg-violet-900/30 text-violet-400' : 'bg-violet-100 text-violet-600'
                                    : isDark ? 'bg-zinc-800 text-zinc-600 hover:text-zinc-400' : 'bg-gray-100 text-gray-400 hover:text-gray-600',
                                )}>
                                {level === 'founders' ? '👑' : level === 'team' ? '👥' : level === 'investors' ? '💼' : '🌐'} {level}
                              </button>
                            ))}
                          </div>

                          {/* Content or generate */}
                          {hasGenerated ? (
                            <>
                              <pre className={cn('text-[9px] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto', isDark ? 'text-zinc-400' : 'text-gray-600')}>{d.content}</pre>
                              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t" style={{ borderColor: isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)' }}>
                                {!d.isFile && (
                                  <button onClick={() => generateDocContent(d)} disabled={!!generatingDocId}
                                    className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-bold transition-colors',
                                      isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-violet-900/20 hover:text-violet-400' : 'bg-gray-100 text-gray-500 hover:bg-violet-50 hover:text-violet-600',
                                      'disabled:opacity-30',
                                    )}>
                                    {isGenDoc ? <Loader2 className="size-2.5 animate-spin" /> : <RefreshCw className="size-2.5" />}
                                    Regenerar
                                  </button>
                                )}
                                <button onClick={() => downloadDocHtml(d, project?.name || 'Proyecto')}
                                  className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-bold transition-colors',
                                    isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                                  <Share2 className="size-2.5" /> Compartir
                                </button>
                                <button onClick={() => { navigator.clipboard.writeText(d.content); }}
                                  className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-bold transition-colors',
                                    isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200')}>
                                  <Copy className="size-2.5" /> Copiar
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="text-center py-4">
                              <FileText className={cn('size-6 mx-auto mb-2', isDark ? 'text-zinc-700' : 'text-gray-300')} />
                              <p className={cn('text-[9px] font-semibold mb-2', isDark ? 'text-zinc-500' : 'text-gray-400')}>Documento sin contenido</p>
                              <button onClick={() => generateDocContent(d)} disabled={!!generatingDocId}
                                className={cn(
                                  'flex items-center justify-center gap-1.5 mx-auto px-4 py-2 rounded-lg text-[10px] font-bold transition-all',
                                  isGenDoc
                                    ? 'bg-violet-600/20 text-violet-400'
                                    : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500',
                                  'disabled:opacity-40',
                                )}>
                                {isGenDoc ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                                {isGenDoc ? 'Generando...' : 'Generar documento con IA'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Empty categories as drop targets */}
        {filterCat === 'all' && emptyCats.length > 0 && documents.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {emptyCats.map(cat => (
              <div key={cat.key}
                onDragOver={(e) => { e.preventDefault(); setDragOverCat(cat.key); }}
                onDragLeave={() => setDragOverCat(null)}
                onDrop={(e) => handleCatDrop(e, cat.key)}
                className={cn(
                  'rounded-lg border-2 border-dashed p-2 text-center transition-all',
                  dragOverCat === cat.key
                    ? isDark ? 'border-violet-500/50 bg-violet-900/10' : 'border-violet-300 bg-violet-50'
                    : isDark ? 'border-zinc-800/50' : 'border-gray-200',
                )}>
                <span className="text-xs">{cat.icon}</span>
                <p className={cn('text-[7px] font-bold mt-0.5', isDark ? 'text-zinc-600' : 'text-gray-400')}>{cat.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CALENDAR ─────────────────────────────────────────────────────────────────

const EVENT_TYPES: { key: EventType; label: string; icon: string; bg: string; ring: string }[] = [
  { key: 'meeting', label: 'Reunión', icon: '🤝', bg: 'bg-sky-500', ring: 'ring-sky-400/30' },
  { key: 'call', label: 'Llamada', icon: '📞', bg: 'bg-emerald-500', ring: 'ring-emerald-400/30' },
  { key: 'demo', label: 'Demo', icon: '💻', bg: 'bg-violet-500', ring: 'ring-violet-400/30' },
  { key: 'pitch', label: 'Pitch', icon: '🎤', bg: 'bg-amber-500', ring: 'ring-amber-400/30' },
  { key: 'review', label: 'Review', icon: '📋', bg: 'bg-cyan-500', ring: 'ring-cyan-400/30' },
  { key: 'deadline', label: 'Deadline', icon: '⏰', bg: 'bg-red-500', ring: 'ring-red-400/30' },
  { key: 'social', label: 'Social', icon: '🎉', bg: 'bg-pink-500', ring: 'ring-pink-400/30' },
  { key: 'other', label: 'Otro', icon: '📌', bg: 'bg-zinc-500', ring: 'ring-zinc-400/30' },
];

const ATTENDANCE_CFG: Record<AttendanceStatus, { label: string; icon: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', icon: '⏳', color: 'text-zinc-400', bg: 'bg-zinc-500/20' },
  confirmed: { label: 'Confirmado', icon: '✅', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  declined: { label: 'Rechazado', icon: '❌', color: 'text-red-400', bg: 'bg-red-500/20' },
  tentative: { label: 'Tentativo', icon: '🤔', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  attended: { label: 'Asistió', icon: '🟢', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  'no-show': { label: 'No asistió', icon: '🔴', color: 'text-red-400', bg: 'bg-red-500/20' },
};

function generateShareHtml(ev: CalendarEvent, projectName: string): string {
  const typeInfo = EVENT_TYPES.find(t => t.key === ev.eventType);
  const endTime = (() => {
    const [h, m] = ev.time.split(':').map(Number);
    const total = h * 60 + m + ev.duration;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  })();
  const dateFormatted = new Date(ev.date + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ev.title} - ${projectName}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;color:#e4e4e7;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{max-width:480px;width:100%;background:linear-gradient(135deg,#18181b,#1c1c22);border-radius:24px;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,.5)}
.header{padding:32px 28px 24px;background:linear-gradient(135deg,#059669,#0891b2);position:relative;overflow:hidden}
.header::after{content:'';position:absolute;top:-50%;right:-20%;width:200px;height:200px;background:rgba(255,255,255,.05);border-radius:50%}
.icon{font-size:36px;margin-bottom:12px}.title{font-size:20px;font-weight:800;color:#fff;margin-bottom:4px}.project{font-size:11px;font-weight:600;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:1px}
.body{padding:24px 28px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.meta-item{background:#27272a;border-radius:12px;padding:12px}.meta-label{font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.meta-value{font-size:13px;font-weight:600;color:#e4e4e7}.desc{background:#27272a;border-radius:12px;padding:14px;margin-bottom:16px;font-size:12px;line-height:1.6;color:#a1a1aa}
.section-title{font-size:10px;font-weight:800;color:#71717a;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}
.attendee{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#27272a;border-radius:10px;margin-bottom:6px}
.avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:#fff;background:linear-gradient(135deg,#6366f1,#8b5cf6)}
.att-name{font-size:12px;font-weight:600;color:#e4e4e7}.att-role{font-size:10px;color:#71717a}
.att-status{margin-left:auto;font-size:10px;font-weight:700;padding:3px 8px;border-radius:99px}
.footer{padding:16px 28px;background:#111113;text-align:center;font-size:10px;color:#52525b}
.link{color:#0891b2;text-decoration:none;display:inline-flex;align-items:center;gap:4px;background:#083344;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:600;margin-top:12px}
</style></head><body><div class="card">
<div class="header"><div class="icon">${typeInfo?.icon || '📌'}</div><div class="title">${ev.title}</div><div class="project">${projectName}</div></div>
<div class="body"><div class="meta">
<div class="meta-item"><div class="meta-label">Fecha</div><div class="meta-value">${dateFormatted}</div></div>
<div class="meta-item"><div class="meta-label">Hora</div><div class="meta-value">${ev.time} - ${endTime}</div></div>
<div class="meta-item"><div class="meta-label">Duración</div><div class="meta-value">${ev.duration} min</div></div>
<div class="meta-item"><div class="meta-label">Tipo</div><div class="meta-value">${typeInfo?.icon} ${typeInfo?.label}</div></div>
${ev.location ? `<div class="meta-item"><div class="meta-label">Ubicación</div><div class="meta-value">📍 ${ev.location}</div></div>` : ''}
${ev.videoLink ? `<div class="meta-item"><div class="meta-label">Videollamada</div><div class="meta-value"><a href="${ev.videoLink}" class="link" target="_blank">Unirse</a></div></div>` : ''}
</div>
${ev.description ? `<div class="desc">${ev.description}</div>` : ''}
${ev.attendees.length > 0 ? `<div class="section-title">Participantes (${ev.attendees.length})</div>${ev.attendees.map(a => {
  const st = ATTENDANCE_CFG[a.attendance || 'pending'];
  return `<div class="attendee"><div class="avatar">${a.name.charAt(0).toUpperCase()}</div><div><div class="att-name">${a.name}</div>${a.role ? `<div class="att-role">${a.role}</div>` : ''}</div><div class="att-status" style="background:${a.attendance === 'confirmed' || a.attendance === 'attended' ? '#064e3b' : a.attendance === 'declined' || a.attendance === 'no-show' ? '#450a0a' : '#27272a'};color:${a.attendance === 'confirmed' || a.attendance === 'attended' ? '#6ee7b7' : a.attendance === 'declined' || a.attendance === 'no-show' ? '#fca5a5' : '#a1a1aa'}">${st.icon} ${st.label}</div></div>`;
}).join('')}` : ''}
${ev.agenda && ev.agenda.length > 0 ? `<div class="section-title" style="margin-top:16px">Agenda</div>${ev.agenda.map((a, i) => `<div style="display:flex;gap:8px;padding:8px 12px;background:#27272a;border-radius:8px;margin-bottom:4px"><span style="color:#0891b2;font-weight:800;font-size:12px">${i + 1}.</span><span style="font-size:12px;color:#d4d4d8">${a}</span></div>`).join('')}` : ''}
</div><div class="footer">Generado por Stopdown Platform</div></div></body></html>`;
}

function CalendarView({ isDark, project, events, onSaveEvent, onDeleteEvent, onBack, onRefresh }: {
  isDark: boolean; project: StopdownProject | null; events: CalendarEvent[];
  onSaveEvent: (e: CalendarEvent) => Promise<void>; onDeleteEvent: (id: string, rev: string) => Promise<void>;
  onBack: () => void; onRefresh: () => void;
}) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [view, setView] = useState<'calendar' | 'agenda' | 'week'>('calendar');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<EventType>('meeting');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('10:00');
  const [formDuration, setFormDuration] = useState(60);
  const [formLocation, setFormLocation] = useState('');
  const [formVideoLink, setFormVideoLink] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formAttendees, setFormAttendees] = useState<EventAttendee[]>([]);
  const [formPriority, setFormPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [formRecurring, setFormRecurring] = useState<CalendarEvent['recurring']>('none');
  const [formAgenda, setFormAgenda] = useState<string[]>([]);
  const [newAgendaItem, setNewAgendaItem] = useState('');
  const [newAttendeeName, setNewAttendeeName] = useState('');
  const [newAttendeeRole, setNewAttendeeRole] = useState('');

  const resetForm = () => {
    setFormTitle(''); setFormDesc(''); setFormType('meeting');
    setFormDate(selectedDate || new Date().toISOString().slice(0, 10));
    setFormTime('10:00'); setFormDuration(60); setFormLocation('');
    setFormVideoLink(''); setFormNotes(''); setFormAttendees([]);
    setFormPriority('normal'); setFormRecurring('none'); setFormAgenda([]);
    setEditingEvent(null);
  };

  const openNew = (date?: string) => {
    resetForm();
    if (date) setFormDate(date);
    setShowForm(true);
  };

  const openEdit = (ev: CalendarEvent) => {
    setEditingEvent(ev);
    setFormTitle(ev.title); setFormDesc(ev.description || ''); setFormType(ev.eventType);
    setFormDate(ev.date); setFormTime(ev.time); setFormDuration(ev.duration);
    setFormLocation(ev.location || ''); setFormVideoLink(ev.videoLink || '');
    setFormNotes(ev.notes || ''); setFormAttendees([...ev.attendees]);
    setFormPriority(ev.priority || 'normal'); setFormRecurring(ev.recurring || 'none');
    setFormAgenda([...(ev.agenda || [])]);
    setShowForm(true); setDetailEvent(null);
  };

  const saveEvent = async () => {
    if (!project || !formTitle.trim()) return;
    const ev: CalendarEvent = {
      ...(editingEvent?._id ? { _id: editingEvent._id, _rev: editingEvent._rev } : {}),
      type: 'event', projectId: project._id || '',
      title: formTitle.trim(), description: formDesc || undefined,
      eventType: formType, date: formDate, time: formTime, duration: formDuration,
      attendees: formAttendees, location: formLocation || undefined,
      videoLink: formVideoLink || undefined, notes: formNotes || undefined,
      status: 'scheduled', createdAt: editingEvent?.createdAt || new Date().toISOString(),
      shareId: editingEvent?.shareId || Math.random().toString(36).slice(2, 10),
      priority: formPriority, recurring: formRecurring,
      agenda: formAgenda.length > 0 ? formAgenda : undefined,
    };
    await onSaveEvent(ev);
    onRefresh();
    setShowForm(false);
    resetForm();
  };

  const addAttendee = () => {
    if (!newAttendeeName.trim()) return;
    setFormAttendees([...formAttendees, { name: newAttendeeName.trim(), role: newAttendeeRole.trim() || undefined, attendance: 'pending' }]);
    setNewAttendeeName(''); setNewAttendeeRole('');
  };

  const addTeamMember = (m: TeamMember) => {
    if (formAttendees.some(a => a.name === (m.name || m.role))) return;
    setFormAttendees([...formAttendees, { name: m.name || m.role, role: m.role, email: m.email, attendance: 'pending' }]);
  };

  const toggleAttendance = async (ev: CalendarEvent, idx: number, newStatus: AttendanceStatus) => {
    const updated = { ...ev, attendees: ev.attendees.map((a, i) => i === idx ? { ...a, attendance: newStatus } : a) };
    await onSaveEvent(updated);
    onRefresh();
    setDetailEvent(updated);
  };

  const shareEvent = (ev: CalendarEvent) => {
    const html = generateShareHtml(ev, project?.name || 'Proyecto');
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `evento-${ev.shareId || 'share'}.html`;
    a.click(); URL.revokeObjectURL(url);
  };

  const copyShareLink = (ev: CalendarEvent) => {
    const text = `${ev.title}\n${new Date(ev.date + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}\n${ev.time} (${ev.duration}min)\n${ev.attendees.map(a => `- ${a.name}`).join('\n')}${ev.videoLink ? `\nEnlace: ${ev.videoLink}` : ''}${ev.location ? `\nLugar: ${ev.location}` : ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const markEventCompleted = async (ev: CalendarEvent) => {
    await onSaveEvent({ ...ev, status: ev.status === 'completed' ? 'scheduled' : 'completed' });
    onRefresh(); setDetailEvent({ ...ev, status: ev.status === 'completed' ? 'scheduled' : 'completed' });
  };

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1); };
  const goToday = () => { setViewMonth(today.getMonth()); setViewYear(today.getFullYear()); setSelectedDate(todayStr); };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.toLowerCase();
    return events.filter(e =>
      e.title.toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q) ||
      (e.location || '').toLowerCase().includes(q) ||
      e.attendees.some(a => a.name.toLowerCase().includes(q)) ||
      e.eventType.toLowerCase().includes(q),
    );
  }, [events, searchQuery]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of filteredEvents) {
      const arr = map.get(ev.date) || [];
      arr.push(ev);
      map.set(ev.date, arr);
    }
    return map;
  }, [filteredEvents]);

  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const inputClass = cn(
    'w-full text-[11px] rounded-xl border px-3 py-2 outline-none transition-all focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50',
    isDark ? 'bg-zinc-800/80 border-zinc-700/50 text-zinc-100 placeholder:text-zinc-600' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400',
  );

  const selectedDateEvents = selectedDate ? (eventsByDate.get(selectedDate) || []).sort((a, b) => a.time.localeCompare(b.time)) : [];

  const upcomingEvents = useMemo(() =>
    filteredEvents
      .filter(e => e.date >= todayStr)
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)),
    [filteredEvents, todayStr],
  );

  const todayEvents = useMemo(() =>
    (eventsByDate.get(todayStr) || []).sort((a, b) => a.time.localeCompare(b.time)),
    [eventsByDate, todayStr],
  );

  const weekDays = useMemo(() => {
    const start = new Date();
    const dow = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  }, []);

  const stats = useMemo(() => {
    const total = events.length;
    const upcoming = events.filter(e => e.date >= todayStr && e.status === 'scheduled').length;
    const completed = events.filter(e => e.status === 'completed').length;
    const totalAttendees = events.reduce((s, e) => s + e.attendees.length, 0);
    const confirmed = events.reduce((s, e) => s + e.attendees.filter(a => a.attendance === 'confirmed' || a.attendance === 'attended').length, 0);
    return { total, upcoming, completed, totalAttendees, confirmed };
  }, [events, todayStr]);

  // ── DETAIL PANEL ──
  if (detailEvent) {
    const ev = detailEvent;
    const typeInfo = EVENT_TYPES.find(t => t.key === ev.eventType);
    const isPast = ev.date < todayStr || ev.status === 'completed';
    const endTime = (() => {
      const [h, m] = ev.time.split(':').map(Number);
      const total = h * 60 + m + ev.duration;
      return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    })();
    const confirmedCount = ev.attendees.filter(a => a.attendance === 'confirmed' || a.attendance === 'attended').length;
    const declinedCount = ev.attendees.filter(a => a.attendance === 'declined' || a.attendance === 'no-show').length;

    return (
      <div className={cn('absolute inset-0 z-[80] flex flex-col', isDark ? 'bg-zinc-950' : 'bg-white')}>
        {/* Gradient header */}
        <div className={cn('relative px-4 pt-3 pb-4 shrink-0', typeInfo?.bg || 'bg-emerald-500')} style={{ background: `linear-gradient(135deg, ${typeInfo?.key === 'meeting' ? '#0ea5e9,#6366f1' : typeInfo?.key === 'call' ? '#10b981,#059669' : typeInfo?.key === 'demo' ? '#8b5cf6,#6366f1' : typeInfo?.key === 'pitch' ? '#f59e0b,#ef4444' : typeInfo?.key === 'review' ? '#06b6d4,#0ea5e9' : typeInfo?.key === 'deadline' ? '#ef4444,#dc2626' : typeInfo?.key === 'social' ? '#ec4899,#f43f5e' : '#71717a,#52525b'})` }}>
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setDetailEvent(null)} className="size-7 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/30">
                <ChevronLeft className="size-4" />
              </button>
              <div className="flex items-center gap-1.5">
                <button onClick={() => copyShareLink(ev)} className="size-7 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/30">
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </button>
                <button onClick={() => shareEvent(ev)} className="size-7 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/30">
                  <Share2 className="size-3.5" />
                </button>
                <button onClick={() => openEdit(ev)} className="size-7 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center text-white hover:bg-white/30">
                  <Pencil className="size-3.5" />
                </button>
              </div>
            </div>
            <span className="text-2xl">{typeInfo?.icon}</span>
            <h2 className="text-base font-black text-white mt-1.5 leading-tight">{ev.title}</h2>
            <p className="text-[10px] font-semibold text-white/70 mt-1">
              {new Date(ev.date + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })} · {ev.time} - {endTime}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Status + actions */}
          <div className="flex items-center gap-2">
            <button onClick={() => markEventCompleted(ev)}
              className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold transition-all',
                ev.status === 'completed'
                  ? isDark ? 'bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-700/50' : 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
                  : isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-emerald-900/20 hover:text-emerald-400' : 'bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600',
              )}>
              <CheckCircle2 className="size-3.5" /> {ev.status === 'completed' ? 'Completado' : 'Marcar completado'}
            </button>
            {ev._id && ev._rev && (
              <button onClick={() => { onDeleteEvent(ev._id!, ev._rev!).then(onRefresh); setDetailEvent(null); }}
                className={cn('size-9 rounded-xl flex items-center justify-center', isDark ? 'bg-zinc-800 text-zinc-500 hover:text-red-400 hover:bg-red-900/20' : 'bg-gray-100 text-gray-400 hover:text-red-500 hover:bg-red-50')}>
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2">
            {ev.location && (
              <div className={cn('rounded-xl p-3', isDark ? 'bg-zinc-900/60' : 'bg-gray-50')}>
                <p className={cn('text-[8px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>Ubicación</p>
                <p className={cn('text-[10px] font-semibold', isDark ? 'text-zinc-300' : 'text-gray-700')}>📍 {ev.location}</p>
              </div>
            )}
            {ev.videoLink && (
              <div className={cn('rounded-xl p-3', isDark ? 'bg-zinc-900/60' : 'bg-gray-50')}>
                <p className={cn('text-[8px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>Videollamada</p>
                <a href={ev.videoLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-sky-300">
                  <Video className="size-3" /> Unirse
                </a>
              </div>
            )}
            <div className={cn('rounded-xl p-3', isDark ? 'bg-zinc-900/60' : 'bg-gray-50')}>
              <p className={cn('text-[8px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>Duración</p>
              <p className={cn('text-[10px] font-semibold', isDark ? 'text-zinc-300' : 'text-gray-700')}>
                {ev.duration >= 60 ? `${Math.floor(ev.duration / 60)}h${ev.duration % 60 ? ` ${ev.duration % 60}m` : ''}` : `${ev.duration}min`}
              </p>
            </div>
            {ev.priority && ev.priority !== 'normal' && (
              <div className={cn('rounded-xl p-3', isDark ? 'bg-zinc-900/60' : 'bg-gray-50')}>
                <p className={cn('text-[8px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>Prioridad</p>
                <p className={cn('text-[10px] font-bold', ev.priority === 'urgent' ? 'text-red-400' : ev.priority === 'high' ? 'text-amber-400' : 'text-zinc-400')}>
                  {ev.priority === 'urgent' ? '🔴 Urgente' : ev.priority === 'high' ? '🟠 Alta' : '⚪ Baja'}
                </p>
              </div>
            )}
          </div>

          {ev.description && (
            <div className={cn('rounded-xl p-3', isDark ? 'bg-zinc-900/60' : 'bg-gray-50')}>
              <p className={cn('text-[10px] leading-relaxed', isDark ? 'text-zinc-400' : 'text-gray-600')}>{ev.description}</p>
            </div>
          )}

          {/* Agenda */}
          {ev.agenda && ev.agenda.length > 0 && (
            <div>
              <p className={cn('text-[9px] font-bold uppercase tracking-wider mb-2', isDark ? 'text-zinc-500' : 'text-gray-400')}>Agenda</p>
              <div className="space-y-1">
                {ev.agenda.map((item, i) => (
                  <div key={i} className={cn('flex items-start gap-2.5 p-2.5 rounded-xl', isDark ? 'bg-zinc-900/60' : 'bg-gray-50')}>
                    <div className={cn('size-5 rounded-full flex items-center justify-center text-[8px] font-black shrink-0 mt-0.5',
                      isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-700')}>{i + 1}</div>
                    <p className={cn('text-[10px] font-medium', isDark ? 'text-zinc-300' : 'text-gray-700')}>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attendees with attendance tracking */}
          {ev.attendees.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className={cn('text-[9px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                  Participantes ({ev.attendees.length})
                </p>
                <div className="flex items-center gap-2">
                  {confirmedCount > 0 && <span className="text-[8px] font-bold text-emerald-400">✅ {confirmedCount}</span>}
                  {declinedCount > 0 && <span className="text-[8px] font-bold text-red-400">❌ {declinedCount}</span>}
                </div>
              </div>
              <div className="space-y-1.5">
                {ev.attendees.map((a, i) => {
                  const cfg = ATTENDANCE_CFG[a.attendance || 'pending'];
                  return (
                    <div key={i} className={cn('rounded-xl p-2.5', isDark ? 'bg-zinc-900/60' : 'bg-gray-50')}>
                      <div className="flex items-center gap-2.5">
                        <div className={cn('size-8 rounded-xl flex items-center justify-center text-[10px] font-black',
                          a.attendance === 'confirmed' || a.attendance === 'attended' ? 'bg-emerald-500/20 text-emerald-400' :
                          a.attendance === 'declined' || a.attendance === 'no-show' ? 'bg-red-500/20 text-red-400' :
                          'bg-sky-500/20 text-sky-400')}>
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-[10px] font-bold truncate', isDark ? 'text-zinc-200' : 'text-gray-800')}>{a.name}</p>
                          {a.role && <p className={cn('text-[8px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>{a.role}</p>}
                        </div>
                        <span className={cn('text-[8px] font-bold', cfg.color)}>{cfg.icon}</span>
                      </div>
                      <div className="flex gap-1 mt-2">
                        {(isPast
                          ? (['attended', 'no-show', 'pending'] as AttendanceStatus[])
                          : (['confirmed', 'tentative', 'declined'] as AttendanceStatus[])
                        ).map(status => {
                          const sc = ATTENDANCE_CFG[status];
                          const isActive = a.attendance === status;
                          return (
                            <button key={status} onClick={() => toggleAttendance(ev, i, status)}
                              className={cn('flex-1 py-1 rounded-lg text-[7px] font-bold transition-all',
                                isActive
                                  ? `${sc.bg} ${sc.color} ring-1 ${status === 'confirmed' || status === 'attended' ? 'ring-emerald-700/50' : status === 'declined' || status === 'no-show' ? 'ring-red-700/50' : 'ring-amber-700/50'}`
                                  : isDark ? 'bg-zinc-800/50 text-zinc-600 hover:text-zinc-400' : 'bg-gray-100 text-gray-400 hover:text-gray-600',
                              )}>
                              {sc.icon} {sc.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {ev.notes && (
            <div className={cn('rounded-xl p-3', isDark ? 'bg-zinc-900/60' : 'bg-gray-50')}>
              <p className={cn('text-[8px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>Notas</p>
              <p className={cn('text-[10px] leading-relaxed', isDark ? 'text-zinc-400' : 'text-gray-600')}>{ev.notes}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── FORM ──
  if (showForm) {
    return (
      <div className={cn('absolute inset-0 z-[80] flex flex-col', isDark ? 'bg-zinc-950' : 'bg-white')}>
        <div className={cn('flex items-center justify-between px-3 py-2.5 border-b shrink-0', isDark ? 'border-zinc-800 bg-zinc-900/80' : 'border-gray-200 bg-gray-50')}>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowForm(false); resetForm(); }} className={cn('size-7 rounded-xl flex items-center justify-center', isDark ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-200 text-gray-500')}>
              <ChevronLeft className="size-4" />
            </button>
            <span className={cn('text-xs font-black', isDark ? 'text-zinc-100' : 'text-gray-800')}>{editingEvent ? 'Editar evento' : 'Nuevo evento'}</span>
          </div>
          <button onClick={saveEvent} disabled={!formTitle.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-gradient-to-r from-emerald-600 to-cyan-600 text-white hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-40 shadow-lg shadow-emerald-500/20">
            <Check className="size-3" /> Guardar
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Título del evento *"
            className={cn('w-full text-sm font-black bg-transparent border-none outline-none py-1', isDark ? 'text-zinc-100 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400')} />

          {/* Type pills */}
          <div className="flex flex-wrap gap-1">
            {EVENT_TYPES.map(t => (
              <button key={t.key} onClick={() => setFormType(t.key)}
                className={cn('px-2.5 py-1.5 rounded-xl text-[9px] font-bold transition-all',
                  formType === t.key
                    ? `${t.bg} text-white shadow-md`
                    : isDark ? 'bg-zinc-800/80 text-zinc-500 hover:text-zinc-300' : 'bg-gray-100 text-gray-400 hover:text-gray-600',
                )}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Date / Time / Duration */}
          <div className="grid grid-cols-3 gap-2">
            <div><span className={cn('text-[8px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>Fecha</span>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className={inputClass} /></div>
            <div><span className={cn('text-[8px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>Hora</span>
              <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} className={inputClass} /></div>
            <div><span className={cn('text-[8px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>Duración</span>
              <select value={formDuration} onChange={e => setFormDuration(Number(e.target.value))} className={inputClass}>
                <option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option>
                <option value={60}>1 hora</option><option value={90}>1.5h</option><option value={120}>2h</option>
                <option value={180}>3h</option><option value={480}>Día</option>
              </select></div>
          </div>

          {/* Priority & Recurring */}
          <div className="grid grid-cols-2 gap-2">
            <div><span className={cn('text-[8px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>Prioridad</span>
              <div className="flex gap-1 mt-1">
                {(['low', 'normal', 'high', 'urgent'] as const).map(p => (
                  <button key={p} onClick={() => setFormPriority(p)}
                    className={cn('flex-1 py-1 rounded-lg text-[8px] font-bold transition-all',
                      formPriority === p
                        ? p === 'urgent' ? 'bg-red-500/20 text-red-400 ring-1 ring-red-700/50' : p === 'high' ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-700/50' : p === 'low' ? 'bg-zinc-500/20 text-zinc-400 ring-1 ring-zinc-700/50' : 'bg-sky-500/20 text-sky-400 ring-1 ring-sky-700/50'
                        : isDark ? 'bg-zinc-800/50 text-zinc-600' : 'bg-gray-100 text-gray-400',
                    )}>
                    {p === 'urgent' ? '🔴' : p === 'high' ? '🟠' : p === 'normal' ? '🔵' : '⚪'}
                  </button>
                ))}
              </div>
            </div>
            <div><span className={cn('text-[8px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>Repetir</span>
              <select value={formRecurring} onChange={e => setFormRecurring(e.target.value as CalendarEvent['recurring'])} className={cn(inputClass, 'mt-1')}>
                <option value="none">No repetir</option><option value="daily">Diario</option>
                <option value="weekly">Semanal</option><option value="biweekly">Quincenal</option>
                <option value="monthly">Mensual</option>
              </select>
            </div>
          </div>

          <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Descripción del evento..." rows={2} className={cn(inputClass, 'resize-none')} />

          {/* Location / Video */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <MapPin className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
              <input value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="Ubicación" className={inputClass} />
            </div>
            <div className="flex items-center gap-2">
              <Video className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
              <input value={formVideoLink} onChange={e => setFormVideoLink(e.target.value)} placeholder="Link videollamada" className={inputClass} />
            </div>
          </div>

          {/* Agenda */}
          <div>
            <p className={cn('text-[9px] font-bold uppercase tracking-wider mb-1.5', isDark ? 'text-zinc-500' : 'text-gray-400')}>Agenda</p>
            {formAgenda.length > 0 && (
              <div className="space-y-1 mb-2">
                {formAgenda.map((item, i) => (
                  <div key={i} className={cn('flex items-center gap-2 p-2 rounded-xl', isDark ? 'bg-zinc-800/60' : 'bg-gray-50')}>
                    <span className={cn('text-[9px] font-black', isDark ? 'text-emerald-400' : 'text-emerald-600')}>{i + 1}.</span>
                    <span className={cn('flex-1 text-[10px]', isDark ? 'text-zinc-300' : 'text-gray-700')}>{item}</span>
                    <button onClick={() => setFormAgenda(formAgenda.filter((_, j) => j !== i))}
                      className={cn('size-5 rounded flex items-center justify-center', isDark ? 'text-zinc-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500')}>
                      <X className="size-3" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input value={newAgendaItem} onChange={e => setNewAgendaItem(e.target.value)} placeholder="Punto de agenda..." className={cn(inputClass, 'flex-1')}
                onKeyDown={e => { if (e.key === 'Enter' && newAgendaItem.trim()) { e.preventDefault(); setFormAgenda([...formAgenda, newAgendaItem.trim()]); setNewAgendaItem(''); } }} />
              <button onClick={() => { if (newAgendaItem.trim()) { setFormAgenda([...formAgenda, newAgendaItem.trim()]); setNewAgendaItem(''); } }}
                disabled={!newAgendaItem.trim()} className="px-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 text-[10px] font-bold">+</button>
            </div>
          </div>

          {/* Attendees */}
          <div>
            <p className={cn('text-[9px] font-bold uppercase tracking-wider mb-1.5', isDark ? 'text-zinc-500' : 'text-gray-400')}>Participantes</p>
            {project && project.team.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {project.team.map(m => {
                  const added = formAttendees.some(a => a.name === (m.name || m.role));
                  return (
                    <button key={m.id} onClick={() => !added && addTeamMember(m)} disabled={added}
                      className={cn('px-2 py-1 rounded-xl text-[8px] font-bold transition-all',
                        added
                          ? isDark ? 'bg-emerald-900/30 text-emerald-400 ring-1 ring-emerald-800/50' : 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
                          : isDark ? 'bg-zinc-800/80 text-zinc-400 hover:bg-sky-900/20 hover:text-sky-400' : 'bg-gray-100 text-gray-500 hover:bg-sky-50 hover:text-sky-600',
                      )}>
                      {added ? '✓' : '+'} {m.name || m.role}
                    </button>
                  );
                })}
              </div>
            )}
            {formAttendees.length > 0 && (
              <div className="space-y-1 mb-2">
                {formAttendees.map((a, i) => (
                  <div key={i} className={cn('flex items-center gap-2.5 p-2 rounded-xl', isDark ? 'bg-zinc-800/60' : 'bg-gray-50')}>
                    <div className={cn('size-7 rounded-xl flex items-center justify-center text-[9px] font-black shrink-0', 'bg-gradient-to-br from-sky-500 to-violet-600 text-white')}>
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-[10px] font-bold truncate', isDark ? 'text-zinc-200' : 'text-gray-800')}>{a.name}</p>
                      {a.role && <p className={cn('text-[8px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>{a.role}</p>}
                    </div>
                    <button onClick={() => setFormAttendees(formAttendees.filter((_, j) => j !== i))}
                      className={cn('size-5 rounded flex items-center justify-center', isDark ? 'text-zinc-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500')}>
                      <X className="size-3" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input value={newAttendeeName} onChange={e => setNewAttendeeName(e.target.value)} placeholder="Nombre" className={cn(inputClass, 'flex-1')}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }} />
              <input value={newAttendeeRole} onChange={e => setNewAttendeeRole(e.target.value)} placeholder="Cargo" className={cn(inputClass, 'w-20')}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }} />
              <button onClick={addAttendee} disabled={!newAttendeeName.trim()} className="px-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-violet-600 text-white hover:from-sky-400 hover:to-violet-500 disabled:opacity-40 text-[10px] font-bold">+</button>
            </div>
          </div>

          <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Notas adicionales..." rows={2} className={cn(inputClass, 'resize-none')} />
        </div>
      </div>
    );
  }

  // ── MAIN VIEW ──
  const renderEventCard = (ev: CalendarEvent, compact = false) => {
    const typeInfo = EVENT_TYPES.find(t => t.key === ev.eventType);
    const isCompleted = ev.status === 'completed';
    const confirmed = ev.attendees.filter(a => a.attendance === 'confirmed' || a.attendance === 'attended').length;
    return (
      <button key={ev._id} onClick={() => setDetailEvent(ev)}
        className={cn('w-full text-left rounded-xl transition-all group',
          compact ? 'p-2' : 'p-3',
          isCompleted
            ? isDark ? 'bg-zinc-900/20 opacity-60' : 'bg-gray-50 opacity-60'
            : isDark ? 'bg-zinc-900/40 hover:bg-zinc-800/60 hover:shadow-lg' : 'bg-gray-50 hover:bg-white hover:shadow-md',
        )}>
        <div className="flex items-start gap-2.5">
          <div className={cn('shrink-0 rounded-xl flex items-center justify-center', compact ? 'size-8 text-sm' : 'size-10 text-lg',
            isDark ? 'bg-zinc-800' : 'bg-gray-100')} style={{ background: `linear-gradient(135deg, ${typeInfo?.key === 'meeting' ? '#0ea5e920,#6366f120' : typeInfo?.key === 'call' ? '#10b98120,#05966920' : typeInfo?.key === 'demo' ? '#8b5cf620,#6366f120' : typeInfo?.key === 'pitch' ? '#f59e0b20,#ef444420' : typeInfo?.key === 'review' ? '#06b6d420,#0ea5e920' : typeInfo?.key === 'deadline' ? '#ef444420,#dc262620' : typeInfo?.key === 'social' ? '#ec489920,#f43f5e20' : '#71717a20,#52525b20'})` }}>
            {typeInfo?.icon || '📌'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className={cn('text-[10px] font-black truncate', isCompleted ? 'line-through' : '', isDark ? 'text-zinc-200' : 'text-gray-800')}>{ev.title}</p>
              {ev.priority === 'urgent' && <span className="text-[7px]">🔴</span>}
              {ev.priority === 'high' && <span className="text-[7px]">🟠</span>}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Clock className={cn('size-2.5', isDark ? 'text-zinc-600' : 'text-gray-400')} />
              <span className={cn('text-[9px] font-semibold', isDark ? 'text-zinc-400' : 'text-gray-500')}>{ev.time}</span>
              <span className={cn('text-[8px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>{ev.duration >= 60 ? `${Math.floor(ev.duration / 60)}h${ev.duration % 60 ? `${ev.duration % 60}m` : ''}` : `${ev.duration}m`}</span>
              {ev.location && <span className={cn('text-[8px] truncate', isDark ? 'text-zinc-600' : 'text-gray-400')}>📍 {ev.location}</span>}
              {ev.videoLink && <Video className={cn('size-2.5', isDark ? 'text-sky-500' : 'text-sky-400')} />}
              {ev.recurring && ev.recurring !== 'none' && <RefreshCw className={cn('size-2.5', isDark ? 'text-violet-500' : 'text-violet-400')} />}
            </div>
            {ev.attendees.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="flex -space-x-1.5">
                  {ev.attendees.slice(0, 5).map((a, j) => (
                    <div key={j} className={cn('size-5 rounded-full flex items-center justify-center text-[7px] font-black ring-1',
                      a.attendance === 'confirmed' || a.attendance === 'attended' ? isDark ? 'ring-zinc-900 bg-emerald-900/60 text-emerald-300' : 'ring-white bg-emerald-100 text-emerald-700' :
                      a.attendance === 'declined' || a.attendance === 'no-show' ? isDark ? 'ring-zinc-900 bg-red-900/60 text-red-300' : 'ring-white bg-red-100 text-red-700' :
                      isDark ? 'ring-zinc-900 bg-sky-900/60 text-sky-300' : 'ring-white bg-sky-100 text-sky-700')}>
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                  ))}
                  {ev.attendees.length > 5 && (
                    <div className={cn('size-5 rounded-full flex items-center justify-center text-[7px] font-bold ring-1',
                      isDark ? 'ring-zinc-900 bg-zinc-800 text-zinc-400' : 'ring-white bg-gray-200 text-gray-500')}>
                      +{ev.attendees.length - 5}
                    </div>
                  )}
                </div>
                {confirmed > 0 && <span className="text-[7px] font-bold text-emerald-400">✅{confirmed}</span>}
              </div>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SectionNav label="Calendario" icon={Calendar} isDark={isDark} onBack={onBack} />
      <div className="flex-1 overflow-y-auto">
        {/* Sticky search */}
        <div className={cn('sticky top-0 px-3 pt-3 pb-2 z-10', isDark ? 'bg-zinc-950/95 backdrop-blur-sm' : 'bg-white/95 backdrop-blur-sm')}>
          <div className="relative">
            <Search className={cn('absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5', isDark ? 'text-zinc-600' : 'text-gray-400')} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar eventos..."
              className={cn('w-full text-[10px] rounded-lg border pl-8 pr-7 py-2 outline-none transition-colors focus:border-violet-500/50',
                isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400')} />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className={cn('absolute right-2 top-1/2 -translate-y-1/2', isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-gray-400 hover:text-gray-600')}>
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* Stats banner */}
        <div className={cn('px-3 pt-3 pb-2')}>
          <div className="flex gap-1.5">
            {[
              { v: stats.upcoming, l: 'Próximos', c: 'from-emerald-500 to-cyan-500' },
              { v: stats.completed, l: 'Completados', c: 'from-violet-500 to-fuchsia-500' },
              { v: stats.confirmed, l: 'Confirmados', c: 'from-sky-500 to-blue-500' },
            ].map(s => (
              <div key={s.l} className={cn('flex-1 rounded-xl p-2', isDark ? 'bg-zinc-900/60' : 'bg-gray-50')}>
                <p className={cn('text-lg font-black bg-gradient-to-r bg-clip-text text-transparent', s.c)}>{s.v}</p>
                <p className={cn('text-[7px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-600' : 'text-gray-400')}>{s.l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Add event + today */}
        <div className="px-3 flex gap-2 mb-2">
          <button onClick={() => openNew()} className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[10px] font-bold transition-all',
            'bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-500/20',
          )}>
            <CalendarPlus className="size-3.5" /> Nuevo evento
          </button>
          <button onClick={goToday} className={cn('px-3 py-2.5 rounded-xl text-[10px] font-bold transition-all',
            isDark ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-200' : 'bg-gray-100 text-gray-500 hover:text-gray-800')}>
            Hoy
          </button>
        </div>

        {/* View tabs */}
        <div className="px-3 mb-3">
          <div className={cn('flex gap-0.5 p-0.5 rounded-xl', isDark ? 'bg-zinc-900' : 'bg-gray-100')}>
            {([
              { k: 'calendar' as const, l: 'Mes' },
              { k: 'week' as const, l: 'Semana' },
              { k: 'agenda' as const, l: 'Agenda' },
            ]).map(v => (
              <button key={v.k} onClick={() => setView(v.k)}
                className={cn('flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all',
                  view === v.k
                    ? isDark ? 'bg-zinc-800 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
                    : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600',
                )}>
                {v.l}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3 pb-3 space-y-3">
          {/* Today events banner */}
          {todayEvents.length > 0 && view !== 'week' && (
            <div className={cn('rounded-xl overflow-hidden', isDark ? 'bg-gradient-to-r from-emerald-950/40 to-cyan-950/40 ring-1 ring-emerald-800/30' : 'bg-gradient-to-r from-emerald-50 to-cyan-50 ring-1 ring-emerald-200/50')}>
              <div className="px-3 pt-2.5 pb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className={cn('text-[9px] font-black uppercase tracking-wider', isDark ? 'text-emerald-400' : 'text-emerald-700')}>Hoy · {todayEvents.length} evento{todayEvents.length > 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="px-2 pb-2 space-y-1">
                {todayEvents.map(ev => renderEventCard(ev, true))}
              </div>
            </div>
          )}

          {view === 'calendar' && (
            <>
              {/* Month header */}
              <div className="flex items-center justify-between">
                <button onClick={prevMonth} className={cn('size-8 rounded-xl flex items-center justify-center', isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500')}>
                  <ChevronLeft className="size-4" />
                </button>
                <p className={cn('text-sm font-black', isDark ? 'text-zinc-100' : 'text-gray-900')}>{monthNames[viewMonth]} {viewYear}</p>
                <button onClick={nextMonth} className={cn('size-8 rounded-xl flex items-center justify-center', isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500')}>
                  <ChevronRight className="size-4" />
                </button>
              </div>

              {/* Calendar grid */}
              <div className={cn('rounded-2xl overflow-hidden border', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-white')}>
                <div className="grid grid-cols-7">
                  {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                    <div key={d} className={cn('text-center text-[8px] font-black uppercase tracking-wider py-2', isDark ? 'text-zinc-600 bg-zinc-900/60' : 'text-gray-400 bg-gray-50')}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {Array.from({ length: firstDow }).map((_, i) => (
                    <div key={`e-${i}`} className={cn('min-h-[44px] border-t', isDark ? 'border-zinc-800/50 bg-zinc-950/30' : 'border-gray-100 bg-gray-50/50')} />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayEvents = eventsByDate.get(dateStr) || [];
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    const isWeekend = ((firstDow + i) % 7) >= 5;
                    return (
                      <button key={day} onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                        className={cn('relative min-h-[44px] border-t p-0.5 text-left transition-all',
                          isDark ? 'border-zinc-800/50' : 'border-gray-100',
                          isSelected
                            ? isDark ? 'bg-emerald-950/30 ring-1 ring-inset ring-emerald-500/40' : 'bg-emerald-50 ring-1 ring-inset ring-emerald-300'
                            : isToday
                              ? isDark ? 'bg-violet-950/20' : 'bg-violet-50/50'
                              : isWeekend
                                ? isDark ? 'bg-zinc-950/40 hover:bg-zinc-800/30' : 'bg-gray-50/80 hover:bg-gray-100/80'
                                : isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-gray-50',
                        )}>
                        <span className={cn('text-[10px] font-bold block px-1',
                          isToday ? 'text-violet-400' : isSelected ? 'text-emerald-400' : isDark ? 'text-zinc-400' : 'text-gray-600',
                        )}>
                          {isToday && <span className="inline-block size-1 rounded-full bg-violet-500 mr-0.5 align-middle" />}
                          {day}
                        </span>
                        {dayEvents.length > 0 && (
                          <div className="flex flex-col gap-0.5 px-0.5 mt-0.5">
                            {dayEvents.slice(0, 2).map((ev, j) => {
                              const t = EVENT_TYPES.find(x => x.key === ev.eventType);
                              return (
                                <div key={j} className={cn('rounded px-1 py-0.5 text-[6px] font-bold truncate leading-tight',
                                  ev.status === 'completed' ? isDark ? 'bg-zinc-800 text-zinc-600 line-through' : 'bg-gray-200 text-gray-400 line-through' :
                                  isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-gray-100 text-gray-600',
                                )} style={ev.status !== 'completed' ? { borderLeft: `2px solid ${t?.key === 'meeting' ? '#0ea5e9' : t?.key === 'call' ? '#10b981' : t?.key === 'demo' ? '#8b5cf6' : t?.key === 'pitch' ? '#f59e0b' : t?.key === 'review' ? '#06b6d4' : t?.key === 'deadline' ? '#ef4444' : t?.key === 'social' ? '#ec4899' : '#71717a'}` } : {}}>
                                  {ev.time.slice(0, 5)} {ev.title}
                                </div>
                              );
                            })}
                            {dayEvents.length > 2 && (
                              <span className={cn('text-[6px] font-bold px-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>+{dayEvents.length - 2} más</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected date detail */}
              {selectedDate && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className={cn('text-[11px] font-black', isDark ? 'text-zinc-200' : 'text-gray-800')}>
                      {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <button onClick={() => openNew(selectedDate)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-bold bg-emerald-600 text-white hover:bg-emerald-500">
                      <Plus className="size-3" /> Crear
                    </button>
                  </div>
                  {selectedDateEvents.length === 0 ? (
                    <div className={cn('text-center py-6 rounded-xl', isDark ? 'bg-zinc-900/30' : 'bg-gray-50')}>
                      <Calendar className={cn('size-6 mx-auto mb-2', isDark ? 'text-zinc-700' : 'text-gray-300')} />
                      <p className={cn('text-[9px] italic', isDark ? 'text-zinc-600' : 'text-gray-400')}>Sin eventos este día</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">{selectedDateEvents.map(ev => renderEventCard(ev))}</div>
                  )}
                </div>
              )}
            </>
          )}

          {view === 'week' && (
            <div className="space-y-2">
              {weekDays.map(dateStr => {
                const dayEvents = (eventsByDate.get(dateStr) || []).sort((a, b) => a.time.localeCompare(b.time));
                const isToday = dateStr === todayStr;
                const d = new Date(dateStr + 'T00:00:00');
                return (
                  <div key={dateStr}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={cn('size-9 rounded-xl flex flex-col items-center justify-center shrink-0',
                        isToday
                          ? 'bg-gradient-to-br from-emerald-600 to-cyan-600 text-white shadow-lg shadow-emerald-500/20'
                          : isDark ? 'bg-zinc-800' : 'bg-gray-100',
                      )}>
                        <span className={cn('text-[7px] font-black uppercase', isToday ? 'text-white/80' : isDark ? 'text-zinc-500' : 'text-gray-400')}>
                          {d.toLocaleDateString('es', { weekday: 'short' })}
                        </span>
                        <span className={cn('text-xs font-black leading-none', isToday ? 'text-white' : isDark ? 'text-zinc-200' : 'text-gray-800')}>
                          {d.getDate()}
                        </span>
                      </div>
                      <div className={cn('flex-1 h-px', isDark ? 'bg-zinc-800' : 'bg-gray-200')} />
                      <button onClick={() => openNew(dateStr)} className={cn('size-6 rounded-lg flex items-center justify-center', isDark ? 'text-zinc-700 hover:text-emerald-400' : 'text-gray-300 hover:text-emerald-500')}>
                        <Plus className="size-3" />
                      </button>
                    </div>
                    {dayEvents.length === 0 ? (
                      <p className={cn('text-[8px] italic pl-11', isDark ? 'text-zinc-700' : 'text-gray-300')}>Sin eventos</p>
                    ) : (
                      <div className="space-y-1 pl-11">{dayEvents.map(ev => renderEventCard(ev, true))}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {view === 'agenda' && (
            <>
              {upcomingEvents.length === 0 ? (
                <div className="text-center py-10">
                  <div className={cn('size-16 mx-auto mb-4 rounded-2xl flex items-center justify-center', isDark ? 'bg-zinc-900' : 'bg-gray-100')}>
                    <Calendar className={cn('size-8', isDark ? 'text-zinc-700' : 'text-gray-300')} />
                  </div>
                  <p className={cn('text-[12px] font-bold', isDark ? 'text-zinc-500' : 'text-gray-400')}>No hay eventos próximos</p>
                  <p className={cn('text-[9px] mt-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>Tu agenda está libre</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingEvents.map((ev, i) => {
                    const showDateHeader = i === 0 || upcomingEvents[i - 1].date !== ev.date;
                    const isToday2 = ev.date === todayStr;
                    return (
                      <div key={ev._id}>
                        {showDateHeader && (
                          <p className={cn('text-[9px] font-black uppercase tracking-wider mb-1.5 mt-1',
                            isToday2 ? 'text-emerald-400' : isDark ? 'text-zinc-500' : 'text-gray-400')}>
                            {isToday2 ? '● Hoy' : new Date(ev.date + 'T00:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </p>
                        )}
                        {renderEventCard(ev)}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── INVESTORS ────────────────────────────────────────────────────────────────

const STATUS_ORDER: StopdownInvestor['contactStatus'][] = ['none', 'contacted', 'meeting', 'negotiating', 'committed', 'rejected'];
const STATUS_CFG: Record<string, { label: string; color: string; bg: string; bgLight: string; icon: string }> = {
  none: { label: 'Sin contacto', color: 'text-zinc-400', bg: 'bg-zinc-800', bgLight: 'bg-gray-100', icon: '⚪' },
  contacted: { label: 'Contactado', color: 'text-sky-400', bg: 'bg-sky-900/30', bgLight: 'bg-sky-50', icon: '📧' },
  meeting: { label: 'Reunión', color: 'text-amber-400', bg: 'bg-amber-900/30', bgLight: 'bg-amber-50', icon: '🤝' },
  negotiating: { label: 'Negociando', color: 'text-violet-400', bg: 'bg-violet-900/30', bgLight: 'bg-violet-50', icon: '📋' },
  committed: { label: 'Comprometido', color: 'text-emerald-400', bg: 'bg-emerald-900/30', bgLight: 'bg-emerald-50', icon: '✅' },
  rejected: { label: 'Rechazado', color: 'text-red-400', bg: 'bg-red-900/30', bgLight: 'bg-red-50', icon: '❌' },
};

function generateInvestorHtml(inv: StopdownInvestor, projectName: string): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const st = STATUS_CFG[inv.contactStatus];
  const contacts: string[] = [];
  if (inv.email) contacts.push(`<a href="mailto:${e(inv.email)}" class="cl">✉ ${e(inv.email)}</a>`);
  if (inv.phone) contacts.push(`<span class="cl">📞 ${e(inv.phone)}</span>`);
  if (inv.linkedin) contacts.push(`<a href="${e(inv.linkedin)}" target="_blank" class="cl">🔗 LinkedIn</a>`);
  if (inv.website) contacts.push(`<a href="${e(inv.website)}" target="_blank" class="cl">🌐 ${e(inv.website)}</a>`);
  const proposals = (inv.proposals || []).map(p => `
<div class="proposal"><div class="prop-head"><h3>${e(p.title)}</h3><div class="prop-meta">${p.amount ? `<span>💰 ${e(p.amount)}</span>` : ''}${p.equity ? `<span>📊 ${e(p.equity)}</span>` : ''}</div></div>
<div class="prop-body">${e(p.content).replace(/\n/g, '<br/>')}</div>
${p.terms ? `<div class="prop-terms"><strong>Términos:</strong> ${e(p.terms)}</div>` : ''}</div>`).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${e(inv.name)} — ${e(projectName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;background:#09090b;font-family:'Space Grotesk',sans-serif;color:#fff;padding:48px 24px}
.card{max-width:600px;margin:0 auto}
.head{text-align:center;margin-bottom:32px}
.avatar{width:72px;height:72px;border-radius:18px;background:linear-gradient(135deg,#06b6d4,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;margin:0 auto 16px;box-shadow:0 8px 24px rgba(6,182,212,.3)}
.name{font-family:'Playfair Display',serif;font-size:28px;background:linear-gradient(135deg,#fff,#67e8f9);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.type{font-size:12px;color:#22d3ee;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px}
.status{display:inline-block;margin-top:10px;font-size:10px;font-weight:700;padding:4px 14px;border-radius:20px;background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.2);color:#67e8f9}
.sec{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:20px;margin-bottom:14px}
.sec-t{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.3);margin-bottom:10px}
.sec p,.sec .txt{font-size:13px;line-height:1.8;color:rgba(255,255,255,.7)}
.tags{display:flex;flex-wrap:wrap;gap:6px}.tag{font-size:10px;font-weight:600;padding:4px 12px;border-radius:8px;background:rgba(6,182,212,.08);border:1px solid rgba(6,182,212,.15);color:#67e8f9}
.cls{display:flex;flex-wrap:wrap;gap:6px}.cl{font-size:11px;color:#93c5fd;text-decoration:none;padding:5px 12px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)}
.proposal{background:rgba(139,92,246,.05);border:1px solid rgba(139,92,246,.15);border-radius:14px;padding:20px;margin-bottom:12px}
.prop-head{margin-bottom:10px}.prop-head h3{font-size:16px;color:#c4b5fd;margin-bottom:4px}
.prop-meta{display:flex;gap:12px;font-size:11px;color:rgba(255,255,255,.5)}
.prop-body{font-size:13px;line-height:1.8;color:rgba(255,255,255,.7)}
.prop-terms{margin-top:10px;font-size:11px;color:rgba(255,255,255,.5);padding-top:10px;border-top:1px solid rgba(255,255,255,.06)}
.foot{text-align:center;margin-top:32px;font-size:10px;color:rgba(255,255,255,.12)}
</style></head><body><div class="card">
<div class="head"><div class="avatar">${e(inv.name.charAt(0))}</div><div class="name">${e(inv.name)}</div><div class="type">${e(inv.investorType)}</div>
<div class="status">${st?.icon || ''} ${e(st?.label || inv.contactStatus)}</div></div>
${inv.why ? `<div class="sec"><div class="sec-t">Por qué encaja</div><p>${e(inv.why)}</p></div>` : ''}
${inv.approach ? `<div class="sec"><div class="sec-t">Cómo acercarse</div><p>${e(inv.approach)}</p></div>` : ''}
${inv.notes ? `<div class="sec"><div class="sec-t">Notas</div><p>${e(inv.notes)}</p></div>` : ''}
${inv.sectors.length ? `<div class="sec"><div class="sec-t">Sectores</div><div class="tags">${inv.sectors.map(s => `<span class="tag">${e(s)}</span>`).join('')}</div></div>` : ''}
${contacts.length ? `<div class="sec"><div class="sec-t">Contacto</div><div class="cls">${contacts.join('')}</div></div>` : ''}
${inv.ticketRange.max > 0 ? `<div class="sec"><div class="sec-t">Rango de inversión</div><p>€${inv.ticketRange.min.toLocaleString()} — €${inv.ticketRange.max.toLocaleString()}</p></div>` : ''}
${proposals ? `<div class="sec"><div class="sec-t">Propuestas</div>${proposals}</div>` : ''}
<div class="foot">${e(inv.name)} · ${e(projectName)}</div></div></body></html>`;
}

function downloadInvestorHtml(inv: StopdownInvestor, projectName: string) {
  const html = generateInvestorHtml(inv, projectName);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${inv.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-investor.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function InvestorDetailPanel({ inv, isDark, project, onUpdate, onClose }: {
  inv: StopdownInvestor; isDark: boolean; project: StopdownProject | null;
  onUpdate: (updated: StopdownInvestor) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<StopdownInvestor>({ ...inv });
  const [dirty, setDirty] = useState(false);
  const [newSector, setNewSector] = useState('');
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'proposals'>('info');
  const { currentStep: proposalStep, done: proposalStepsDone, markDone: markProposalDone } = useProposalAiSteps(generatingProposal);

  const set = <K extends keyof StopdownInvestor>(key: K, val: StopdownInvestor[K]) => {
    setForm(f => ({ ...f, [key]: val }));
    setDirty(true);
  };

  const save = () => { onUpdate(form); setDirty(false); };

  const addSector = () => {
    if (!newSector.trim()) return;
    set('sectors', [...(form.sectors || []), newSector.trim()]);
    setNewSector('');
  };

  const generateProposal = async () => {
    if (!project) return;
    setGeneratingProposal(true);
    try {
      const ctx = `Proyecto: ${project.name}\nDescripción: ${project.description}\nSector: ${project.sector}\nProblema: ${project.problem}\nSolución: ${project.solution}\nMercado: ${project.targetMarket}\nRevenue: ${project.revenueModel}\n\nInversor: ${form.name}\nTipo: ${form.investorType}\nPor qué encaja: ${form.why || 'N/A'}\nRango: €${form.ticketRange.min} - €${form.ticketRange.max}\nSectores: ${form.sectors.join(', ')}\nNotas: ${form.notes || 'N/A'}`;
      const { result } = await agentApi.stopdownGenerate('pitch', ctx);
      const r = result as Record<string, unknown>;
      const now = new Date().toISOString();
      const proposal: InvestorProposal = {
        id: `prop-${Date.now()}`,
        title: `Propuesta para ${form.name}`,
        content: (r.threeMinute as string) || (r.oneMinute as string) || JSON.stringify(r),
        amount: form.ticketRange.max > 0 ? `€${form.ticketRange.min.toLocaleString()} - €${form.ticketRange.max.toLocaleString()}` : '',
        equity: '',
        terms: '',
        createdAt: now,
      };
      set('proposals', [...(form.proposals || []), proposal]);
      markProposalDone();
      await new Promise(r => setTimeout(r, 1200));
      setActiveTab('proposals');
    } catch { /* */ }
    setGeneratingProposal(false);
  };

  const removeProposal = (id: string) => {
    set('proposals', (form.proposals || []).filter(p => p.id !== id));
  };

  const updateProposal = (id: string, changes: Partial<InvestorProposal>) => {
    set('proposals', (form.proposals || []).map(p => p.id === id ? { ...p, ...changes } : p));
  };

  const inputClass = cn(
    'w-full text-[11px] rounded-lg border px-2.5 py-1.5 outline-none transition-colors focus:border-cyan-500/50',
    isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400',
  );
  const labelClass = cn('text-[9px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-500' : 'text-gray-400');
  const st = STATUS_CFG[form.contactStatus];

  return (
    <div className={cn('absolute inset-0 z-[80] flex flex-col', isDark ? 'bg-zinc-950' : 'bg-white')}>
      <div className={cn('flex items-center justify-between px-3 py-2 border-b shrink-0', isDark ? 'border-zinc-800 bg-zinc-900' : 'border-gray-200 bg-gray-50')}>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className={cn('size-6 rounded-lg flex items-center justify-center', isDark ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-200 text-gray-500')}>
            <ChevronLeft className="size-4" />
          </button>
          <span className={cn('text-xs font-bold', isDark ? 'text-zinc-100' : 'text-gray-800')}>Inversor</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => downloadInvestorHtml(form, project?.name || 'Proyecto')}
            className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold', isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            <Share2 className="size-3" /> Compartir
          </button>
          {dirty && (
            <button onClick={save} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-500">
              <Check className="size-3" /> Guardar
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={cn('flex gap-1 px-3 pt-2 pb-1 border-b shrink-0', isDark ? 'border-zinc-800' : 'border-gray-200')}>
        {([{ k: 'info' as const, l: 'Información' }, { k: 'proposals' as const, l: `Propuestas (${(form.proposals || []).length})` }]).map(t => (
          <button key={t.k} onClick={() => setActiveTab(t.k)}
            className={cn('px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all',
              activeTab === t.k
                ? 'bg-gradient-to-r from-cyan-600 to-violet-600 text-white'
                : isDark ? 'text-zinc-500 hover:bg-zinc-800' : 'text-gray-400 hover:bg-gray-100',
            )}>{t.l}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {activeTab === 'info' && (
          <>
            {/* Header */}
            <div className="flex flex-col items-center gap-2 pt-1">
              <div className={cn('size-14 rounded-2xl flex items-center justify-center text-xl font-black shadow-lg', 'bg-gradient-to-br from-cyan-500 to-violet-600 text-white')}>
                {form.name.charAt(0).toUpperCase()}
              </div>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre del inversor"
                className={cn('text-center text-sm font-bold bg-transparent border-none outline-none w-full', isDark ? 'text-zinc-100' : 'text-gray-900')} />
            </div>

            {/* Status */}
            <div>
              <p className={labelClass}>Estado de contacto</p>
              <div className="flex flex-wrap gap-1">
                {STATUS_ORDER.map(s => {
                  const cfg = STATUS_CFG[s];
                  return (
                    <button key={s} onClick={() => set('contactStatus', s)}
                      className={cn('px-2 py-1 rounded-lg text-[9px] font-bold transition-all',
                        form.contactStatus === s
                          ? isDark ? `${cfg.bg} ${cfg.color}` : `${cfg.bgLight} ${cfg.color}`
                          : isDark ? 'bg-zinc-800 text-zinc-600 hover:text-zinc-400' : 'bg-gray-100 text-gray-400 hover:text-gray-600',
                      )}>
                      {cfg.icon} {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Type & Fund */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className={labelClass}>Tipo</p>
                <select value={form.investorType} onChange={e => set('investorType', e.target.value)} className={inputClass}>
                  <option value="angel">Angel</option>
                  <option value="vc">VC</option>
                  <option value="accelerator">Aceleradora</option>
                  <option value="incubator">Incubadora</option>
                  <option value="corporate">Corporate</option>
                  <option value="public">Público</option>
                </select>
              </div>
              <div>
                <p className={labelClass}>Fondo</p>
                <input value={form.fund || ''} onChange={e => set('fund', e.target.value)} placeholder="Nombre del fondo" className={inputClass} />
              </div>
            </div>

            {/* Ticket range */}
            <div>
              <p className={labelClass}>Rango de inversión (€)</p>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={form.ticketRange.min || ''} onChange={e => set('ticketRange', { ...form.ticketRange, min: Number(e.target.value) })}
                  placeholder="Mínimo" className={inputClass} />
                <input type="number" value={form.ticketRange.max || ''} onChange={e => set('ticketRange', { ...form.ticketRange, max: Number(e.target.value) })}
                  placeholder="Máximo" className={inputClass} />
              </div>
            </div>

            {/* Why & Approach */}
            <div>
              <p className={labelClass}>Por qué encaja</p>
              <textarea value={form.why || ''} onChange={e => set('why', e.target.value)} rows={2} placeholder="¿Por qué este inversor es ideal?" className={cn(inputClass, 'resize-none')} />
            </div>
            <div>
              <p className={labelClass}>Cómo acercarse</p>
              <textarea value={form.approach || ''} onChange={e => set('approach', e.target.value)} rows={2} placeholder="Estrategia de contacto" className={cn(inputClass, 'resize-none')} />
            </div>

            {/* Sectors */}
            <div>
              <p className={labelClass}>Sectores</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {(form.sectors || []).map(s => (
                  <span key={s} className={cn('inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full', isDark ? 'bg-cyan-900/30 text-cyan-300' : 'bg-cyan-100 text-cyan-700')}>
                    {s} <button onClick={() => set('sectors', form.sectors.filter(x => x !== s))} className="hover:text-red-400"><X className="size-2.5" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input value={newSector} onChange={e => setNewSector(e.target.value)} placeholder="Añadir sector"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSector(); } }} className={cn(inputClass, 'flex-1')} />
                <button onClick={addSector} disabled={!newSector.trim()} className="px-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40 text-[10px] font-bold">+</button>
              </div>
            </div>

            {/* Contact */}
            <div>
              <p className={labelClass}>Contacto</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mail className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
                  <input value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="email@inversor.com" className={inputClass} />
                </div>
                <div className="flex items-center gap-2">
                  <Phone className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
                  <input value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+34 600 000 000" className={inputClass} />
                </div>
                <div className="flex items-center gap-2">
                  <Globe className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
                  <input value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://fund.com" className={inputClass} />
                </div>
                <div className="flex items-center gap-2">
                  <ExternalLink className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
                  <input value={form.linkedin || ''} onChange={e => set('linkedin', e.target.value)} placeholder="https://linkedin.com/in/..." className={inputClass} />
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
                  <input value={form.location || ''} onChange={e => set('location', e.target.value)} placeholder="Madrid, España" className={inputClass} />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className={labelClass}>Notas internas</p>
              <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Notas, seguimiento, contexto..." className={cn(inputClass, 'resize-none')} />
            </div>
          </>
        )}

        {activeTab === 'proposals' && (
          <>
            <button onClick={generateProposal} disabled={generatingProposal}
              className={cn(
                'w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-bold transition-all',
                'bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 text-white shadow-lg shadow-cyan-500/20',
                'disabled:opacity-60 disabled:cursor-not-allowed',
              )}>
              {generatingProposal ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {generatingProposal ? 'Generando propuesta...' : 'Generar propuesta con IA'}
            </button>

            {generatingProposal && proposalStep >= 0 && (
              <ProposalStepsIndicator currentStep={proposalStep} done={proposalStepsDone} isDark={isDark} />
            )}

            {(form.proposals || []).map(p => (
              <div key={p.id} className={cn('rounded-xl border overflow-hidden', isDark ? 'border-violet-800/30 bg-violet-950/10' : 'border-violet-200 bg-violet-50/30')}>
                <div className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <input value={p.title} onChange={e => updateProposal(p.id, { title: e.target.value })}
                      className={cn('text-[11px] font-bold bg-transparent border-none outline-none flex-1', isDark ? 'text-zinc-100' : 'text-gray-900')} />
                    <button onClick={() => removeProposal(p.id)} className={cn('size-5 rounded flex items-center justify-center shrink-0', isDark ? 'text-zinc-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500')}>
                      <Trash2 className="size-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <span className={cn('text-[8px] font-bold', isDark ? 'text-zinc-500' : 'text-gray-400')}>Cantidad</span>
                      <input value={p.amount} onChange={e => updateProposal(p.id, { amount: e.target.value })}
                        placeholder="€50.000 - €100.000" className={cn(inputClass, 'text-[10px]')} />
                    </div>
                    <div>
                      <span className={cn('text-[8px] font-bold', isDark ? 'text-zinc-500' : 'text-gray-400')}>Equity</span>
                      <input value={p.equity} onChange={e => updateProposal(p.id, { equity: e.target.value })}
                        placeholder="5% - 10%" className={cn(inputClass, 'text-[10px]')} />
                    </div>
                  </div>

                  <textarea value={p.content} onChange={e => updateProposal(p.id, { content: e.target.value })}
                    rows={4} className={cn(inputClass, 'resize-none text-[10px] leading-relaxed mb-2')} />

                  <div>
                    <span className={cn('text-[8px] font-bold', isDark ? 'text-zinc-500' : 'text-gray-400')}>Términos</span>
                    <input value={p.terms} onChange={e => updateProposal(p.id, { terms: e.target.value })}
                      placeholder="Condiciones, milestones, vesting..." className={cn(inputClass, 'text-[10px]')} />
                  </div>

                  <p className={cn('text-[8px] mt-2', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                    Creada: {new Date(p.createdAt).toLocaleDateString('es')}
                  </p>
                </div>
              </div>
            ))}

            {(form.proposals || []).length === 0 && !generatingProposal && (
              <div className="text-center py-6">
                <FileText className={cn('size-8 mx-auto mb-2', isDark ? 'text-zinc-700' : 'text-gray-300')} />
                <p className={cn('text-[10px] font-semibold', isDark ? 'text-zinc-500' : 'text-gray-400')}>Sin propuestas aún</p>
                <p className={cn('text-[9px] mt-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>Genera una propuesta personalizada con IA</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function InvestorsView({ isDark, project, investors, onSaveInvestor, onDeleteInvestor, onBack, onRefresh }: {
  isDark: boolean; project: StopdownProject | null; investors: StopdownInvestor[];
  onSaveInvestor: (i: StopdownInvestor) => Promise<void>; onDeleteInvestor: (id: string, rev: string) => Promise<void>;
  onBack: () => void; onRefresh: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [strategy, setStrategy] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const generate = async () => {
    if (!project) return;
    setGenerating(true);
    try {
      const ctx = `Proyecto: ${project.name}\nDescripción: ${project.description}\nSector: ${project.sector}\nEtapa: ${project.stage}\nProblema: ${project.problem}\nSolución: ${project.solution}\nMercado: ${project.targetMarket}\nRevenue: ${project.revenueModel}`;
      const { result } = await agentApi.stopdownGenerate('investors', ctx);
      const r = result as { strategy?: string; idealInvestors?: { name: string; type: string; why?: string; sectors?: string[]; stages?: string[]; ticketRange?: { min: number; max: number }; approach?: string }[] };
      setStrategy((r.strategy as string) || '');
      const now = new Date().toISOString();
      for (const inv of (r.idealInvestors || [])) {
        const newInv: StopdownInvestor = {
          type: 'investor', projectId: project._id || '', name: inv.name,
          investorType: inv.type || 'angel', why: inv.why,
          sectors: inv.sectors || [], stages: inv.stages || [],
          ticketRange: inv.ticketRange || { min: 0, max: 0 },
          approach: inv.approach, contactStatus: 'none', createdAt: now,
        };
        await onSaveInvestor(newInv);
      }
      onRefresh();
    } catch { /* */ }
    setGenerating(false);
  };

  const updateInvestor = async (updated: StopdownInvestor) => {
    await onSaveInvestor(updated);
    onRefresh();
  };

  const filteredInvestors = useMemo(() => {
    if (!searchQuery.trim()) return investors;
    const q = searchQuery.toLowerCase();
    return investors.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.investorType || '').toLowerCase().includes(q) ||
      (i.why || '').toLowerCase().includes(q) ||
      (i.approach || '').toLowerCase().includes(q) ||
      (i.sectors || []).some(s => s.toLowerCase().includes(q)) ||
      (i.contactStatus || '').toLowerCase().includes(q),
    );
  }, [investors, searchQuery]);

  const selectedInv = investors.find(i => i._id === selectedId);

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <SectionNav label="Inversores" icon={TrendingUp} isDark={isDark} onBack={onBack} />
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Sticky search */}
        <div className={cn('sticky -top-3 -mx-3 px-3 pt-3 pb-2 z-10', isDark ? 'bg-zinc-950/95 backdrop-blur-sm' : 'bg-white/95 backdrop-blur-sm')}>
          <div className="relative">
            <Search className={cn('absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5', isDark ? 'text-zinc-600' : 'text-gray-400')} />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar inversores..."
              className={cn('w-full text-[10px] rounded-lg border pl-8 pr-7 py-2 outline-none transition-colors focus:border-violet-500/50',
                isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400')} />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className={cn('absolute right-2 top-1/2 -translate-y-1/2', isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-gray-400 hover:text-gray-600')}>
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        <AiButton label={investors.length ? 'Regenerar estrategia' : 'Generar estrategia de inversión con IA'} loading={generating} onClick={generate} isDark={isDark} full />

        {strategy && (
          <div className={cn('rounded-xl border p-3', isDark ? 'border-cyan-800/40 bg-cyan-900/10' : 'border-cyan-200 bg-cyan-50')}>
            <h4 className={cn('text-[10px] font-bold uppercase tracking-wider mb-1.5', isDark ? 'text-cyan-400' : 'text-cyan-700')}>Estrategia de Fundraising</h4>
            <p className={cn('text-[9px] leading-relaxed whitespace-pre-wrap', isDark ? 'text-zinc-300' : 'text-gray-700')}>{strategy}</p>
          </div>
        )}

        {searchQuery && filteredInvestors.length === 0 && (
          <div className="text-center py-6">
            <Search className={cn('size-8 mx-auto mb-2', isDark ? 'text-zinc-700' : 'text-gray-300')} />
            <p className={cn('text-[10px] font-semibold', isDark ? 'text-zinc-500' : 'text-gray-400')}>Sin resultados para "{searchQuery}"</p>
          </div>
        )}

        {filteredInvestors.map((inv) => {
          const st = STATUS_CFG[inv.contactStatus];
          return (
            <button key={inv._id} onClick={() => setSelectedId(inv._id || null)}
              className={cn('w-full rounded-xl border p-3 transition-all text-left group hover:shadow-md',
                isDark ? 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-800/60' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white')}>
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center gap-2.5">
                  <div className={cn('size-10 rounded-xl flex items-center justify-center text-sm font-black transition-transform group-hover:scale-105', 'bg-gradient-to-br from-cyan-500 to-violet-600 text-white shadow-md')}>
                    {inv.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className={cn('text-[11px] font-bold truncate', isDark ? 'text-zinc-100' : 'text-gray-900')}>{inv.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn('text-[8px] px-1.5 py-0.5 rounded-full font-semibold', isDark ? 'bg-cyan-900/30 text-cyan-300' : 'bg-cyan-100 text-cyan-700')}>{inv.investorType}</span>
                      {inv.ticketRange.max > 0 && <span className={cn('text-[8px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>€{Math.round(inv.ticketRange.min / 1000)}K-{Math.round(inv.ticketRange.max / 1000)}K</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={cn('text-[8px] font-bold px-1.5 py-0.5 rounded-lg', st?.color, isDark ? st?.bg : st?.bgLight)}>
                    {st?.icon} {st?.label}
                  </span>
                  <ChevronRight className={cn('size-3.5 transition-transform group-hover:translate-x-0.5', isDark ? 'text-zinc-600' : 'text-gray-300')} />
                </div>
              </div>
              {inv.why && <p className={cn('text-[9px] leading-relaxed line-clamp-2 ml-[50px]', isDark ? 'text-zinc-500' : 'text-gray-500')}>{inv.why}</p>}
              {(inv.proposals || []).length > 0 && (
                <div className={cn('flex items-center gap-1 ml-[50px] mt-1')}>
                  <FileText className={cn('size-3', isDark ? 'text-violet-500' : 'text-violet-400')} />
                  <span className={cn('text-[8px] font-semibold', isDark ? 'text-violet-400' : 'text-violet-500')}>{inv.proposals!.length} propuesta{inv.proposals!.length > 1 ? 's' : ''}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedInv && (
        <InvestorDetailPanel
          inv={selectedInv}
          isDark={isDark}
          project={project}
          onUpdate={(updated) => { updateInvestor(updated); setSelectedId(null); }}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ── ACTIVITY & ACTIONS ───────────────────────────────────────────────────────

const ACTION_TYPES: { key: ActionType; label: string; icon: string; color: string; desc: string }[] = [
  { key: 'need-talent', label: 'Busco Talento', icon: '🎯', color: 'text-violet-400', desc: 'Diseñador, dev, marketing...' },
  { key: 'need-funding', label: 'Necesito Financiación', icon: '💰', color: 'text-amber-400', desc: 'Patentes, desarrollo, expansión...' },
  { key: 'need-cofounder', label: 'Busco Cofundador', icon: '🤝', color: 'text-emerald-400', desc: 'Partner técnico, comercial...' },
  { key: 'need-partner', label: 'Busco Partner', icon: '🔗', color: 'text-sky-400', desc: 'Alianza estratégica, distribución...' },
  { key: 'need-advice', label: 'Necesito Consejo', icon: '💡', color: 'text-cyan-400', desc: 'Mentoría, asesoría legal, fiscal...' },
  { key: 'need-resource', label: 'Necesito Recurso', icon: '📦', color: 'text-orange-400', desc: 'Herramientas, oficina, servidor...' },
  { key: 'need-market', label: 'Abrir Mercado', icon: '🌍', color: 'text-rose-400', desc: 'Expansión a nueva ciudad/país...' },
  { key: 'custom', label: 'Otra Necesidad', icon: '✨', color: 'text-fuchsia-400', desc: 'Cualquier otra cosa...' },
];

const ACTION_SOURCES: { key: ActionSource; label: string; icon: string }[] = [
  { key: 'post', label: 'Post', icon: '📝' },
  { key: 'video', label: 'Video', icon: '🎬' },
  { key: 'survey', label: 'Encuesta', icon: '📊' },
  { key: 'meeting', label: 'Reunión', icon: '🤝' },
  { key: 'direct', label: 'Directo', icon: '⚡' },
];

const ACTION_STATUSES: { key: ActionStatus; label: string; color: string; bg: string; bgDark: string }[] = [
  { key: 'open', label: 'Abierta', color: 'text-sky-400', bg: 'bg-sky-50 border-sky-200', bgDark: 'bg-sky-900/20 border-sky-800/40' },
  { key: 'in-progress', label: 'En Progreso', color: 'text-amber-400', bg: 'bg-amber-50 border-amber-200', bgDark: 'bg-amber-900/20 border-amber-800/40' },
  { key: 'matched', label: 'Conectada', color: 'text-violet-400', bg: 'bg-violet-50 border-violet-200', bgDark: 'bg-violet-900/20 border-violet-800/40' },
  { key: 'resolved', label: 'Resuelta', color: 'text-emerald-400', bg: 'bg-emerald-50 border-emerald-200', bgDark: 'bg-emerald-900/20 border-emerald-800/40' },
  { key: 'closed', label: 'Cerrada', color: 'text-zinc-400', bg: 'bg-gray-50 border-gray-200', bgDark: 'bg-zinc-800/40 border-zinc-700/40' },
];

const URGENCY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  critical: { label: 'Crítica', color: 'text-red-400', dot: 'bg-red-500' },
  high: { label: 'Alta', color: 'text-orange-400', dot: 'bg-orange-500' },
  medium: { label: 'Media', color: 'text-amber-400', dot: 'bg-amber-500' },
  low: { label: 'Baja', color: 'text-emerald-400', dot: 'bg-emerald-500' },
};

function VelocityRing({ value, size = 64, stroke = 5, isDark }: { value: number; size?: number; stroke?: number; isDark: boolean }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={isDark ? '#27272a' : '#e5e7eb'} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-all duration-1000 ease-out" />
    </svg>
  );
}

function SparkLine({ data, color = '#8b5cf6', height = 24, width = 80 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) * step} cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2} r="2.5" fill={color} />
    </svg>
  );
}

function BuzzMeter({ level, isDark }: { level: number; isDark: boolean }) {
  const bars = 12;
  const active = Math.round((Math.min(100, level) / 100) * bars);
  return (
    <div className="flex items-end gap-[2px] h-6">
      {Array.from({ length: bars }).map((_, i) => {
        const isActive = i < active;
        const h = 6 + (i / bars) * 18;
        const color = i < bars * 0.3 ? 'bg-emerald-500' : i < bars * 0.7 ? 'bg-amber-500' : 'bg-red-500';
        return (
          <div key={i} className={cn('w-1.5 rounded-full transition-all duration-500', isActive ? color : isDark ? 'bg-zinc-800' : 'bg-gray-200')}
            style={{ height: `${h}px`, opacity: isActive ? 1 : 0.3 }} />
        );
      })}
    </div>
  );
}

function ActivityView({ isDark, project, actions, documents, investors, events, pitches, onSaveAction, onDeleteAction, onBack, onRefresh }: {
  isDark: boolean; project: StopdownProject | null; actions: StopdownAction[];
  documents: StopdownDocument[]; investors: StopdownInvestor[]; events: CalendarEvent[]; pitches: StopdownPitch[];
  onSaveAction: (a: StopdownAction) => Promise<void>; onDeleteAction: (id: string, rev: string) => Promise<void>;
  onBack: () => void; onRefresh: () => void;
}) {
  const [tab, setTab] = useState<'dashboard' | 'actions' | 'feed'>('dashboard');
  const [showNewAction, setShowNewAction] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<ActionType>('need-talent');
  const [formSource, setFormSource] = useState<ActionSource>('direct');
  const [formUrgency, setFormUrgency] = useState<'critical' | 'high' | 'medium' | 'low'>('medium');
  const [formTags, setFormTags] = useState('');

  const resetForm = () => {
    setFormTitle(''); setFormDesc(''); setFormType('need-talent');
    setFormSource('direct'); setFormUrgency('medium'); setFormTags('');
  };

  const saveAction = async () => {
    if (!project || !formTitle.trim()) return;
    const now = new Date().toISOString();
    const action: StopdownAction = {
      type: 'action', projectId: project._id || '',
      title: formTitle.trim(), description: formDesc.trim(),
      actionType: formType, source: formSource, status: 'open',
      urgency: formUrgency,
      tags: formTags.split(',').map(t => t.trim()).filter(Boolean),
      responses: [], synergies: [],
      metrics: { views: 0, interests: 0, shares: 0 },
      createdAt: now, updatedAt: now,
    };
    await onSaveAction(action);
    resetForm(); setShowNewAction(false); onRefresh();
  };

  const updateStatus = async (action: StopdownAction, status: ActionStatus) => {
    const updated = { ...action, status, updatedAt: new Date().toISOString() };
    if (status === 'resolved') updated.resolvedAt = new Date().toISOString();
    await onSaveAction(updated); onRefresh();
  };

  const addResponse = async (action: StopdownAction, name: string, message: string) => {
    const updated = {
      ...action,
      responses: [...action.responses, { name, message, date: new Date().toISOString(), status: 'pending' as const }],
      metrics: { ...action.metrics, interests: action.metrics.interests + 1 },
      updatedAt: new Date().toISOString(),
    };
    await onSaveAction(updated); onRefresh();
  };

  const addSynergy = async (action: StopdownAction, partnerName: string, synergyType: string) => {
    const updated = {
      ...action,
      synergies: [...action.synergies, { partnerName, synergyType, status: 'proposed' as const, date: new Date().toISOString() }],
      status: (action.status === 'open' ? 'matched' : action.status) as ActionStatus,
      updatedAt: new Date().toISOString(),
    };
    await onSaveAction(updated); onRefresh();
  };

  // ── Computed metrics ──
  const openActions = actions.filter(a => a.status === 'open').length;
  const inProgressActions = actions.filter(a => a.status === 'in-progress' || a.status === 'matched').length;
  const resolvedActions = actions.filter(a => a.status === 'resolved').length;
  const totalInterests = actions.reduce((sum, a) => sum + a.metrics.interests, 0);
  const totalSynergies = actions.reduce((sum, a) => sum + a.synergies.length, 0);

  const milestones = project?.milestones || [];
  const completedMilestones = milestones.filter((_, i) => {
    const action = actions.find(a => a.status === 'resolved' && a.title.toLowerCase().includes(milestones[i]?.name?.toLowerCase() || ''));
    return !!action || i < Math.floor(milestones.length * (resolvedActions / Math.max(actions.length, 1)));
  });
  const velocityPct = milestones.length > 0
    ? Math.round((completedMilestones.length / milestones.length) * 100)
    : resolvedActions > 0 ? Math.min(95, Math.round((resolvedActions / Math.max(actions.length, 1)) * 100)) : 0;

  const buzzLevel = Math.min(100, Math.round(
    (totalInterests * 8) + (totalSynergies * 15) + (actions.length * 5) + (events.length * 3) + (investors.filter(i => i.contactStatus !== 'none' && i.contactStatus !== 'rejected').length * 12)
  ));

  const activityTimeline = useMemo(() => {
    const items: { date: string; type: string; icon: string; label: string; color: string; detail?: string }[] = [];
    for (const a of actions) {
      items.push({ date: a.createdAt, type: 'action', icon: ACTION_TYPES.find(t => t.key === a.actionType)?.icon || '📌', label: a.title, color: 'violet', detail: `Acción: ${ACTION_TYPES.find(t => t.key === a.actionType)?.label}` });
      for (const r of a.responses) items.push({ date: r.date, type: 'response', icon: '💬', label: `${r.name} respondió a "${a.title}"`, color: 'sky', detail: r.message.slice(0, 60) });
      for (const s of a.synergies) items.push({ date: s.date, type: 'synergy', icon: '🤝', label: `Sinergia con ${s.partnerName}`, color: 'emerald', detail: s.synergyType });
      if (a.resolvedAt) items.push({ date: a.resolvedAt, type: 'resolved', icon: '✅', label: `"${a.title}" resuelta`, color: 'emerald' });
    }
    for (const d of documents.slice(-10)) items.push({ date: d.createdAt, type: 'doc', icon: '📄', label: `Documento: ${d.name}`, color: 'orange' });
    for (const inv of investors.slice(-8)) items.push({ date: inv.createdAt, type: 'investor', icon: '💼', label: `Inversor: ${inv.name}`, color: 'cyan', detail: inv.contactStatus });
    for (const ev of events.filter(e => e.status === 'completed').slice(-5)) items.push({ date: ev.createdAt, type: 'event', icon: '📅', label: ev.title, color: 'emerald' });
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  }, [actions, documents, investors, events]);

  const weeklyActivity = useMemo(() => {
    const now = Date.now();
    return Array.from({ length: 7 }).map((_, i) => {
      const day = new Date(now - (6 - i) * 86400000).toISOString().slice(0, 10);
      return activityTimeline.filter(item => item.date.startsWith(day)).length;
    });
  }, [activityTimeline]);

  const tractionScore = Math.min(100, Math.round(
    velocityPct * 0.3 + buzzLevel * 0.3 + (resolvedActions / Math.max(actions.length, 1)) * 100 * 0.2 + Math.min(100, investors.length * 10) * 0.2
  ));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SectionNav label="Actividad" icon={Zap} isDark={isDark} onBack={onBack} />

      {/* Tabs */}
      <div className={cn('flex gap-0.5 px-3 pt-2 pb-1 shrink-0', isDark ? 'bg-zinc-950' : 'bg-white')}>
        {([
          { key: 'dashboard' as const, label: 'Dashboard', icon: '📊' },
          { key: 'actions' as const, label: 'Acciones', icon: '⚡' },
          { key: 'feed' as const, label: 'Feed', icon: '📡' },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[9px] font-bold transition-all',
              tab === t.key
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/20'
                : isDark ? 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600',
            )}>
            <span>{t.icon}</span> {t.label}
            {t.key === 'actions' && openActions > 0 && (
              <span className={cn('px-1 py-0.5 rounded-full text-[7px] font-black min-w-[14px] text-center',
                tab === t.key ? 'bg-white/20' : 'bg-red-500 text-white')}>{openActions}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* ═══ DASHBOARD TAB ═══ */}
        {tab === 'dashboard' && (
          <>
            {/* Traction Score Hero */}
            <div className={cn('relative rounded-2xl border overflow-hidden', isDark ? 'border-zinc-800' : 'border-gray-200')}>
              <div className={cn('absolute inset-0', isDark ? 'bg-gradient-to-br from-violet-950/80 via-zinc-900 to-fuchsia-950/60' : 'bg-gradient-to-br from-violet-50 via-white to-fuchsia-50')} />
              <div className="relative p-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <VelocityRing value={tractionScore} size={72} stroke={5} isDark={isDark} />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <p className={cn('text-lg font-black', isDark ? 'text-zinc-50' : 'text-gray-900')}>{tractionScore}</p>
                        <p className={cn('text-[7px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>Score</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={cn('text-sm font-black mb-0.5', isDark ? 'text-zinc-50' : 'text-gray-900')}>Tracción del Proyecto</h3>
                    <p className={cn('text-[9px] leading-relaxed mb-2', isDark ? 'text-zinc-400' : 'text-gray-500')}>
                      {tractionScore >= 70 ? '🔥 Tracción excelente. Los inversores querrán subirse.' : tractionScore >= 40 ? '📈 Buena progresión. Sigue generando actividad.' : '🚀 Empieza a crear acciones para generar tracción.'}
                    </p>
                    <SparkLine data={weeklyActivity.length >= 2 ? weeklyActivity : [0, 0]} color={tractionScore >= 70 ? '#10b981' : tractionScore >= 40 ? '#f59e0b' : '#8b5cf6'} width={100} height={20} />
                    <p className={cn('text-[7px] mt-0.5', isDark ? 'text-zinc-600' : 'text-gray-400')}>Actividad últimos 7 días</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className={cn('rounded-xl border p-3', isDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-gray-200 bg-white')}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="size-6 rounded-lg bg-violet-500/15 flex items-center justify-center">
                      <Zap className="size-3 text-violet-400" />
                    </div>
                    <span className={cn('text-[8px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>Velocity</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <VelocityRing value={velocityPct} size={40} stroke={3} isDark={isDark} />
                  <div>
                    <p className={cn('text-base font-black', isDark ? 'text-zinc-50' : 'text-gray-900')}>{velocityPct}%</p>
                    <p className={cn('text-[7px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>Avance milestones</p>
                  </div>
                </div>
              </div>

              <div className={cn('rounded-xl border p-3', isDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-gray-200 bg-white')}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="size-6 rounded-lg bg-rose-500/15 flex items-center justify-center">
                      <TrendingUp className="size-3 text-rose-400" />
                    </div>
                    <span className={cn('text-[8px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>Buzz</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <BuzzMeter level={buzzLevel} isDark={isDark} />
                  <div>
                    <p className={cn('text-base font-black', isDark ? 'text-zinc-50' : 'text-gray-900')}>{buzzLevel}</p>
                    <p className={cn('text-[7px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>Interés generado</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Stats */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: 'Abiertas', value: openActions, color: 'sky', icon: '🔵' },
                { label: 'En curso', value: inProgressActions, color: 'amber', icon: '🟡' },
                { label: 'Resueltas', value: resolvedActions, color: 'emerald', icon: '🟢' },
                { label: 'Sinergias', value: totalSynergies, color: 'violet', icon: '🤝' },
              ].map(s => (
                <div key={s.label} className={cn('rounded-xl border p-2 text-center', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-white')}>
                  <span className="text-xs">{s.icon}</span>
                  <p className={cn('text-sm font-black', isDark ? 'text-zinc-50' : 'text-gray-900')}>{s.value}</p>
                  <p className={cn('text-[7px] font-bold', isDark ? 'text-zinc-600' : 'text-gray-400')}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Investor Readiness */}
            <div className={cn('rounded-xl border p-3', isDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-gray-200 bg-white')}>
              <div className="flex items-center gap-1.5 mb-3">
                <DollarSign className={cn('size-3.5 text-amber-400')} />
                <span className={cn('text-[10px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-400' : 'text-gray-500')}>Readiness para Inversores</span>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Data Room completo', pct: documents.length > 0 ? Math.min(100, Math.round((documents.filter(d => d.content.length > 100).length / Math.max(documents.length, 1)) * 100)) : 0, color: 'from-orange-500 to-amber-500' },
                  { label: 'Pitches preparados', pct: pitches.length > 0 ? 100 : 0, color: 'from-violet-500 to-fuchsia-500' },
                  { label: 'Inversores contactados', pct: Math.min(100, investors.filter(i => i.contactStatus !== 'none').length * 15), color: 'from-cyan-500 to-sky-500' },
                  { label: 'Acciones resueltas', pct: actions.length > 0 ? Math.round((resolvedActions / actions.length) * 100) : 0, color: 'from-emerald-500 to-green-500' },
                  { label: 'Eventos completados', pct: events.length > 0 ? Math.round((events.filter(e => e.status === 'completed').length / events.length) * 100) : 0, color: 'from-rose-500 to-pink-500' },
                ].map(m => (
                  <div key={m.label}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={cn('text-[8px] font-semibold', isDark ? 'text-zinc-400' : 'text-gray-500')}>{m.label}</span>
                      <span className={cn('text-[8px] font-bold tabular-nums', isDark ? 'text-zinc-300' : 'text-gray-700')}>{m.pct}%</span>
                    </div>
                    <div className={cn('h-1.5 rounded-full overflow-hidden', isDark ? 'bg-zinc-800' : 'bg-gray-200')}>
                      <div className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-700', m.color)} style={{ width: `${m.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Milestone Velocity Timeline */}
            {milestones.length > 0 && (
              <div className={cn('rounded-xl border p-3', isDark ? 'border-zinc-800 bg-zinc-900/60' : 'border-gray-200 bg-white')}>
                <div className="flex items-center gap-1.5 mb-3">
                  <Target className="size-3.5 text-violet-400" />
                  <span className={cn('text-[10px] font-bold uppercase tracking-wider', isDark ? 'text-zinc-400' : 'text-gray-500')}>Vector de Milestones</span>
                </div>
                <div className="relative">
                  <div className={cn('absolute left-[7px] top-2 bottom-2 w-0.5', isDark ? 'bg-zinc-800' : 'bg-gray-200')} />
                  {milestones.map((m, i) => {
                    const done = i < completedMilestones.length;
                    return (
                      <div key={i} className="flex items-start gap-2.5 py-1 relative">
                        <div className={cn('size-4 rounded-full flex items-center justify-center shrink-0 relative z-10 ring-2 transition-all',
                          done
                            ? 'bg-emerald-500 ring-emerald-500/30'
                            : i === completedMilestones.length ? cn('ring-violet-500/30 animate-pulse', isDark ? 'bg-violet-600' : 'bg-violet-500')
                            : isDark ? 'bg-zinc-800 ring-zinc-800' : 'bg-gray-200 ring-gray-200',
                        )}>
                          {done && <Check className="size-2.5 text-white" />}
                          {!done && i === completedMilestones.length && <div className="size-1.5 rounded-full bg-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-[9px] font-semibold', done ? 'text-emerald-400 line-through' : i === completedMilestones.length ? (isDark ? 'text-violet-300' : 'text-violet-600') : isDark ? 'text-zinc-500' : 'text-gray-400')}>{m.name}</p>
                          {m.timeframe && <p className={cn('text-[7px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>{m.timeframe}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Traction Warning */}
            {tractionScore < 30 && actions.length < 3 && (
              <div className={cn('rounded-xl border-2 border-dashed p-4 text-center', isDark ? 'border-amber-800/40 bg-amber-950/10' : 'border-amber-300 bg-amber-50')}>
                <AlertCircle className={cn('size-6 mx-auto mb-2', isDark ? 'text-amber-500' : 'text-amber-600')} />
                <p className={cn('text-[10px] font-bold mb-1', isDark ? 'text-amber-400' : 'text-amber-700')}>Tracción baja detectada</p>
                <p className={cn('text-[9px] mb-3', isDark ? 'text-amber-500/70' : 'text-amber-600/70')}>Crea acciones para generar sinergias, interés y mover el proyecto.</p>
                <button onClick={() => { setTab('actions'); setShowNewAction(true); }}
                  className="flex items-center gap-1 mx-auto px-3 py-1.5 rounded-lg text-[9px] font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 transition-all">
                  <Plus className="size-3" /> Crear primera acción
                </button>
              </div>
            )}
          </>
        )}

        {/* ═══ ACTIONS TAB ═══ */}
        {tab === 'actions' && (
          <>
            <button onClick={() => { resetForm(); setShowNewAction(!showNewAction); }}
              className={cn('w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all',
                showNewAction
                  ? isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-gray-100 text-gray-600'
                  : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40',
              )}>
              {showNewAction ? <><X className="size-3.5" /> Cancelar</> : <><Plus className="size-3.5" /> Nueva Acción / Ticket</>}
            </button>

            {showNewAction && (
              <div className={cn('rounded-xl border p-3 space-y-2.5', isDark ? 'border-violet-800/40 bg-violet-950/10' : 'border-violet-200 bg-violet-50/30')}>
                <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="¿Qué necesitas? Ej: Busco diseñador UX senior"
                  className={cn('w-full text-xs font-semibold rounded-lg border px-3 py-2 outline-none transition-colors focus:border-violet-500',
                    isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400')} />
                <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={2} placeholder="Describe con detalle lo que necesitas, contexto, requisitos..."
                  className={cn('w-full text-[10px] rounded-lg border px-3 py-2 outline-none resize-none transition-colors focus:border-violet-500',
                    isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400')} />

                <div>
                  <p className={cn('text-[8px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-500' : 'text-gray-400')}>Tipo de necesidad</p>
                  <div className="flex flex-wrap gap-1">
                    {ACTION_TYPES.map(t => (
                      <button key={t.key} onClick={() => setFormType(t.key)}
                        className={cn('px-2 py-1 rounded-lg text-[8px] font-bold transition-all',
                          formType === t.key
                            ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
                            : isDark ? 'bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'bg-gray-100 text-gray-400 hover:text-gray-600',
                        )}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <p className={cn('text-[8px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-500' : 'text-gray-400')}>Origen</p>
                    <div className="flex gap-1">
                      {ACTION_SOURCES.map(s => (
                        <button key={s.key} onClick={() => setFormSource(s.key)}
                          className={cn('flex-1 px-1 py-1 rounded-lg text-[8px] font-bold transition-all text-center',
                            formSource === s.key
                              ? isDark ? 'bg-violet-900/40 text-violet-300' : 'bg-violet-100 text-violet-600'
                              : isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-100 text-gray-400',
                          )}>
                          {s.icon}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className={cn('text-[8px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-500' : 'text-gray-400')}>Urgencia</p>
                    <div className="flex gap-1">
                      {(['critical', 'high', 'medium', 'low'] as const).map(u => (
                        <button key={u} onClick={() => setFormUrgency(u)}
                          className={cn('flex-1 px-1 py-1 rounded-lg text-[8px] font-bold transition-all text-center',
                            formUrgency === u
                              ? isDark ? 'bg-violet-900/40 text-violet-300' : 'bg-violet-100 text-violet-600'
                              : isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-100 text-gray-400',
                          )}>
                          <span className={cn('inline-block size-1.5 rounded-full mr-0.5', URGENCY_CONFIG[u].dot)} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <input value={formTags} onChange={e => setFormTags(e.target.value)} placeholder="Tags: react, diseño, Madrid..."
                  className={cn('w-full text-[10px] rounded-lg border px-3 py-1.5 outline-none transition-colors focus:border-violet-500',
                    isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400')} />

                <button onClick={saveAction} disabled={!formTitle.trim()}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all disabled:opacity-40">
                  <Send className="size-3" /> Publicar Acción
                </button>
              </div>
            )}

            {/* Action Status Filters */}
            {actions.length > 0 && (
              <div className="flex gap-1 overflow-x-auto scrollbar-none">
                {ACTION_STATUSES.map(s => {
                  const count = actions.filter(a => a.status === s.key).length;
                  if (count === 0) return null;
                  return (
                    <span key={s.key} className={cn('shrink-0 px-2 py-0.5 rounded-full text-[8px] font-bold border',
                      isDark ? s.bgDark : s.bg, s.color)}>
                      {s.label} ({count})
                    </span>
                  );
                })}
              </div>
            )}

            {/* Actions List */}
            {actions.length === 0 ? (
              <div className={cn('rounded-xl border-2 border-dashed p-6 text-center', isDark ? 'border-zinc-800' : 'border-gray-200')}>
                <Zap className={cn('size-8 mx-auto mb-3', isDark ? 'text-zinc-700' : 'text-gray-300')} />
                <p className={cn('text-xs font-bold mb-1', isDark ? 'text-zinc-400' : 'text-gray-500')}>Sin acciones todavía</p>
                <p className={cn('text-[9px] mb-3', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                  Crea tu primera acción: busca talento, financiación, partners...
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {actions.sort((a, b) => {
                  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                  const statusOrder: Record<string, number> = { open: 0, 'in-progress': 1, matched: 2, resolved: 3, closed: 4 };
                  if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
                  return (order[a.urgency] || 2) - (order[b.urgency] || 2);
                }).map(action => {
                  const typeInfo = ACTION_TYPES.find(t => t.key === action.actionType);
                  const statusInfo = ACTION_STATUSES.find(s => s.key === action.status);
                  const urgInfo = URGENCY_CONFIG[action.urgency];
                  const isExpanded = expandedId === action._id;

                  return (
                    <div key={action._id} className={cn('rounded-xl border overflow-hidden transition-all',
                      action.status === 'resolved' ? (isDark ? 'border-emerald-800/30 bg-emerald-950/5' : 'border-emerald-200/50 bg-emerald-50/20')
                      : isDark ? 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60' : 'border-gray-200 bg-white hover:bg-gray-50')}>
                      <div className="flex items-start gap-2 p-2.5 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : action._id!)}>
                        <div className={cn('size-8 rounded-lg flex items-center justify-center shrink-0 text-sm',
                          isDark ? 'bg-zinc-800' : 'bg-gray-100')}>
                          {typeInfo?.icon || '📌'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={cn('size-1.5 rounded-full shrink-0', urgInfo.dot)} />
                            <p className={cn('text-[10px] font-bold truncate', isDark ? 'text-zinc-100' : 'text-gray-900')}>{action.title}</p>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={cn('text-[7px] font-bold px-1.5 py-0.5 rounded-full border', isDark ? statusInfo?.bgDark : statusInfo?.bg, statusInfo?.color)}>
                              {statusInfo?.label}
                            </span>
                            <span className={cn('text-[7px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                              {ACTION_SOURCES.find(s => s.key === action.source)?.icon} {typeInfo?.label}
                            </span>
                            {action.responses.length > 0 && (
                              <span className={cn('text-[7px] font-bold', isDark ? 'text-sky-400' : 'text-sky-500')}>💬 {action.responses.length}</span>
                            )}
                            {action.synergies.length > 0 && (
                              <span className={cn('text-[7px] font-bold', isDark ? 'text-emerald-400' : 'text-emerald-500')}>🤝 {action.synergies.length}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {action.metrics.interests > 0 && (
                            <span className={cn('text-[8px] font-bold flex items-center gap-0.5', isDark ? 'text-amber-400' : 'text-amber-500')}>
                              <Star className="size-2.5" /> {action.metrics.interests}
                            </span>
                          )}
                          <ChevronDown className={cn('size-3 transition-transform', isExpanded && 'rotate-180', isDark ? 'text-zinc-600' : 'text-gray-400')} />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className={cn('border-t px-3 pb-3 pt-2 space-y-2.5', isDark ? 'border-zinc-800' : 'border-gray-100')}>
                          {action.description && (
                            <p className={cn('text-[9px] leading-relaxed', isDark ? 'text-zinc-400' : 'text-gray-600')}>{action.description}</p>
                          )}
                          {action.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {action.tags.map(t => (
                                <span key={t} className={cn('text-[7px] px-1.5 py-0.5 rounded-full font-medium', isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-500')}>#{t}</span>
                              ))}
                            </div>
                          )}

                          {/* Status changer */}
                          <div>
                            <p className={cn('text-[7px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>Estado</p>
                            <div className="flex gap-1">
                              {ACTION_STATUSES.map(s => (
                                <button key={s.key} onClick={() => updateStatus(action, s.key)}
                                  className={cn('px-1.5 py-0.5 rounded text-[7px] font-bold transition-all border',
                                    action.status === s.key ? (isDark ? s.bgDark : s.bg) + ' ' + s.color : isDark ? 'border-zinc-800 text-zinc-600 hover:text-zinc-400' : 'border-gray-200 text-gray-400 hover:text-gray-600',
                                  )}>
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Responses */}
                          {action.responses.length > 0 && (
                            <div>
                              <p className={cn('text-[7px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>Respuestas ({action.responses.length})</p>
                              {action.responses.map((r, i) => (
                                <div key={i} className={cn('flex items-start gap-1.5 py-1 text-[8px]', isDark ? 'text-zinc-400' : 'text-gray-500')}>
                                  <UserPlus className="size-2.5 shrink-0 mt-0.5 text-sky-400" />
                                  <div><span className="font-bold">{r.name}:</span> {r.message}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Synergies */}
                          {action.synergies.length > 0 && (
                            <div>
                              <p className={cn('text-[7px] font-bold uppercase tracking-wider mb-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>Sinergias ({action.synergies.length})</p>
                              {action.synergies.map((s, i) => (
                                <div key={i} className={cn('flex items-center gap-1.5 py-1 text-[8px]', isDark ? 'text-zinc-400' : 'text-gray-500')}>
                                  <span className={cn('size-1.5 rounded-full', s.status === 'completed' ? 'bg-emerald-500' : s.status === 'active' ? 'bg-amber-500' : 'bg-violet-500')} />
                                  <span className="font-bold">{s.partnerName}</span> — {s.synergyType}
                                  <span className={cn('text-[7px] px-1 rounded', s.status === 'completed' ? 'text-emerald-400' : s.status === 'active' ? 'text-amber-400' : 'text-violet-400')}>{s.status}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Quick actions */}
                          <div className="flex gap-1.5 pt-1">
                            <button onClick={() => {
                              const name = prompt('Nombre de quien responde:');
                              const msg = name ? prompt('Mensaje:') : null;
                              if (name && msg) addResponse(action, name, msg);
                            }} className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-bold transition-all',
                              isDark ? 'bg-sky-900/20 text-sky-400 hover:bg-sky-900/40' : 'bg-sky-50 text-sky-600 hover:bg-sky-100')}>
                              <MessageCircle className="size-2.5" /> Responder
                            </button>
                            <button onClick={() => {
                              const partner = prompt('Nombre del partner/contacto:');
                              const type = partner ? prompt('Tipo de sinergia (ej: co-desarrollo, inversión, talento):') : null;
                              if (partner && type) addSynergy(action, partner, type);
                            }} className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-bold transition-all',
                              isDark ? 'bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100')}>
                              <Layers className="size-2.5" /> Sinergia
                            </button>
                            <button onClick={() => { if (action._id && action._rev) onDeleteAction(action._id, action._rev).then(onRefresh); }}
                              className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-bold transition-all',
                                isDark ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40' : 'bg-red-50 text-red-600 hover:bg-red-100')}>
                              <Trash2 className="size-2.5" /> Eliminar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ═══ FEED TAB ═══ */}
        {tab === 'feed' && (
          <>
            {activityTimeline.length === 0 ? (
              <div className={cn('rounded-xl border-2 border-dashed p-6 text-center', isDark ? 'border-zinc-800' : 'border-gray-200')}>
                <Clock className={cn('size-8 mx-auto mb-3', isDark ? 'text-zinc-700' : 'text-gray-300')} />
                <p className={cn('text-xs font-bold mb-1', isDark ? 'text-zinc-400' : 'text-gray-500')}>Sin actividad todavía</p>
                <p className={cn('text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>La actividad aparecerá aquí cuando crees acciones, documentos, eventos...</p>
              </div>
            ) : (
              <div className="relative">
                <div className={cn('absolute left-[11px] top-4 bottom-4 w-0.5', isDark ? 'bg-zinc-800' : 'bg-gray-200')} />
                {activityTimeline.map((item, i) => {
                  const d = new Date(item.date);
                  const timeAgo = (() => {
                    const diff = Date.now() - d.getTime();
                    if (diff < 60000) return 'ahora';
                    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
                    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
                    return `${Math.floor(diff / 86400000)}d`;
                  })();
                  return (
                    <div key={i} className="flex items-start gap-3 py-2 relative">
                      <div className={cn('size-6 rounded-full flex items-center justify-center text-xs shrink-0 relative z-10 ring-2',
                        isDark ? 'ring-zinc-900' : 'ring-white',
                        `bg-${item.color}-500/15`)}>
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-[9px] font-semibold', isDark ? 'text-zinc-200' : 'text-gray-800')}>{item.label}</p>
                        {item.detail && <p className={cn('text-[8px] mt-0.5', isDark ? 'text-zinc-500' : 'text-gray-400')}>{item.detail}</p>}
                      </div>
                      <span className={cn('text-[7px] font-medium shrink-0 tabular-nums', isDark ? 'text-zinc-600' : 'text-gray-400')}>{timeAgo}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

export function StopdownPlatform() {
  const { isDark } = usePluginSettings();
  const [section, setSection] = useState<Section>('home');
  const [loading, setLoading] = useState(true);

  const [projects, setProjects] = useState<StopdownProject[]>([]);
  const [pitches, setPitches] = useState<StopdownPitch[]>([]);
  const [documents, setDocuments] = useState<StopdownDocument[]>([]);
  const [investors, setInvestors] = useState<StopdownInvestor[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [actions, setActions] = useState<StopdownAction[]>([]);

  const project = projects[0] || null;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pi, d, i, ev, ac] = await Promise.all([
        loadDocs<StopdownProject>('project'),
        loadDocs<StopdownPitch>('pitch'),
        loadDocs<StopdownDocument>('document'),
        loadDocs<StopdownInvestor>('investor'),
        loadDocs<CalendarEvent>('event'),
        loadDocs<StopdownAction>('action'),
      ]);
      setProjects(p); setPitches(pi); setDocuments(d); setInvestors(i); setEvents(ev); setActions(ac);
    } catch { /* db may not exist */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSaveProject = async (p: StopdownProject) => { await saveDoc(p as unknown as Record<string, unknown>); };
  const handleSavePitch = async (p: StopdownPitch) => { await saveDoc(p as unknown as Record<string, unknown>); };
  const handleSaveDoc = async (d: StopdownDocument) => { await saveDoc(d as unknown as Record<string, unknown>); };
  const handleSaveInvestor = async (i: StopdownInvestor) => { await saveDoc(i as unknown as Record<string, unknown>); };
  const handleSaveEvent = async (e: CalendarEvent) => { await saveDoc(e as unknown as Record<string, unknown>); };
  const handleSaveAction = async (a: StopdownAction) => { await saveDoc(a as unknown as Record<string, unknown>); };
  const handleDelete = async (id: string, rev: string) => { await delDoc(id, rev); };

  const [aiResetProgress, setAiResetProgress] = useState<string | null>(null);

  const handleAiFullReset = async () => {
    if (aiResetProgress) return;
    const now = new Date().toISOString();

    try {
      // Step 1: scan code
      setAiResetProgress('Escaneando código fuente...');
      const codeContext = await scanCodebase();
      const codeHint = codeContext ? `\n\nCÓDIGO FUENTE DEL PROYECTO:\n${codeContext}` : '';

      // Step 2: generate project
      setAiResetProgress('Generando proyecto completo...');
      const projectPrompt = `Genera un proyecto de negocio MUY completo y detallado basándote en la siguiente información. Rellena TODOS los campos posibles con contenido profesional y extenso, como si un CEO hubiese trabajado 100 horas. Incluye visión ambiciosa, problema detallado, solución innovadora, mercado objetivo con datos, modelo de revenue realista, al menos 5 diferenciadores, al menos 4 competidores, métricas KPI, riesgos con mitigaciones, roadmap de al menos 6 hitos, y análisis DAFO completo con 4+ elementos en cada cuadrante.${codeHint}${project ? `\n\nProyecto actual: ${project.name}\n${project.description}` : ''}`;
      const { result: projR } = await agentApi.stopdownGenerate('project', projectPrompt);
      const pr = projR as Record<string, unknown>;
      const proj: StopdownProject = {
        ...(project || {} as StopdownProject),
        type: 'project',
        name: (pr.name as string) || project?.name || 'Mi Proyecto',
        description: (pr.description as string) || '', stage: (pr.stage as ProjectStage) || 'mvp',
        sector: (pr.sector as string) || '', tags: (pr.tags as string[]) || [],
        team: project?.team || [], tokens: project?.tokens || [],
        status: 'active', visibility: 'private',
        vision: (pr.vision as string) || '', problem: (pr.problem as string) || '',
        solution: (pr.solution as string) || '', targetMarket: (pr.targetMarket as string) || '',
        revenueModel: (pr.revenueModel as string) || '',
        differentiators: (pr.differentiators as string[]) || [],
        competitors: (pr.competitors as string[]) || [],
        kpis: (pr.kpis as string[]) || [], risks: (pr.risks as string[]) || [],
        roadmap: (pr.roadmap as StopdownProject['roadmap']) || [],
        swot: (pr.swot as StopdownProject['swot']) || { strengths: [], weaknesses: [], opportunities: [], threats: [] },
        createdAt: project?.createdAt || now, updatedAt: now,
      };
      await handleSaveProject(proj);

      // Step 3: generate team
      setAiResetProgress('Generando equipo ideal...');
      const teamCtx = `Proyecto: ${proj.name}\n${proj.description}\nSector: ${proj.sector}\nEtapa: ${proj.stage}\nProblema: ${proj.problem}\nSolución: ${proj.solution}\nMercado: ${proj.targetMarket}\nRevenue: ${proj.revenueModel}\n\nGenera un equipo COMPLETO de al menos 8-10 roles con skills detallados, bio, ubicación, sueldo estimado, tipo (cofundador/empleado/freelance/advisor) y prioridad. Incluye CTO, CEO, CMO, desarrolladores, diseñador, comercial, legal, etc.`;
      const { result: teamR } = await agentApi.stopdownGenerate('team', teamCtx);
      const tr = teamR as { roles?: { title: string; description?: string; skills?: string[]; priority?: string; type?: string; allocation?: string; salary?: string; location?: string; bio?: string }[]; culture?: string };
      const members: TeamMember[] = (tr.roles || []).map((role, i) => ({
        id: `member-${Date.now()}-${i}`, role: role.title, name: '',
        description: role.description || '', skills: role.skills || [],
        priority: (role.priority as 'critical' | 'high' | 'medium' | 'low') || 'high',
        memberType: (role.type as TeamMember['memberType']) || 'employee',
        allocation: role.allocation || '100%', salary: role.salary || '',
        location: role.location || '', bio: role.bio || '',
        status: 'active' as const, joinedAt: now,
      }));
      proj.team = members;
      proj.culture = (tr.culture as string) || proj.culture;
      await handleSaveProject(proj);

      // Step 4: generate pitches
      setAiResetProgress('Generando pitches...');
      const pitchCtx = `Proyecto: ${proj.name}\nDescripción: ${proj.description}\nProblema: ${proj.problem}\nSolución: ${proj.solution}\nMercado: ${proj.targetMarket}\nRevenue: ${proj.revenueModel}\nSector: ${proj.sector}\nVisión: ${proj.vision}\nDiferenciadores: ${proj.differentiators?.join(', ')}`;
      const { result: pitchR } = await agentApi.stopdownGenerate('pitch', pitchCtx);
      const piR = pitchR as Record<string, unknown>;
      const newPitch: StopdownPitch = {
        ...(pitches[0] || {}),
        type: 'pitch', projectId: proj._id || '',
        elevator: (piR.elevator as string) || '', oneMinute: (piR.oneMinute as string) || '',
        threeMinute: (piR.threeMinute as string) || '', investor: (piR.investor as string) || '',
        technical: (piR.technical as string) || '',
        extraPitches: pitches[0]?.extraPitches || {},
        createdAt: pitches[0]?.createdAt || now, updatedAt: now,
      };
      await handleSavePitch(newPitch);

      // Step 5: generate data room
      setAiResetProgress('Generando documentos legales...');
      const drCtx = `Proyecto: ${proj.name}\nDescripción: ${proj.description}\nSector: ${proj.sector}\nEquipo: ${members.map(t => t.role).join(', ')}\nEtapa: ${proj.stage}\nProblema: ${proj.problem}\nSolución: ${proj.solution}\nMercado: ${proj.targetMarket}\n\nGenera al menos 12 documentos variados y completos: plan de negocio, pitch deck, modelo financiero, acuerdo de socios, NDA, términos de servicio, plan de marketing, análisis de mercado, etc.`;
      const { result: drR } = await agentApi.stopdownGenerate('dataroom', drCtx);
      const dr = drR as { documents?: { name: string; category: DocCategory; content: string; accessLevel: string; priority?: string }[] };
      for (const doc of (dr.documents || [])) {
        const newDoc: StopdownDocument = {
          type: 'document', projectId: proj._id || '', name: doc.name,
          category: doc.category || 'other', content: doc.content || '',
          accessLevel: (doc.accessLevel as 'public' | 'team' | 'confidential') || 'team',
          version: 1, createdAt: now, updatedAt: now,
        };
        await handleSaveDoc(newDoc);
      }

      // Step 6: generate investors
      setAiResetProgress('Generando estrategia de inversión...');
      const invCtx = `Proyecto: ${proj.name}\nDescripción: ${proj.description}\nSector: ${proj.sector}\nEtapa: ${proj.stage}\nProblema: ${proj.problem}\nSolución: ${proj.solution}\nMercado: ${proj.targetMarket}\nRevenue: ${proj.revenueModel}\n\nGenera al menos 8 inversores ideales y realistas con nombre, tipo (angel/vc/corporate/accelerator), por qué encaja, rango de inversión, sectores de interés y approach sugerido.`;
      const { result: invR } = await agentApi.stopdownGenerate('investors', invCtx);
      const ir = invR as { strategy?: string; idealInvestors?: { name: string; type: string; why?: string; sectors?: string[]; stages?: string[]; ticketRange?: { min: number; max: number }; approach?: string }[] };
      for (const inv of (ir.idealInvestors || [])) {
        const newInv: StopdownInvestor = {
          type: 'investor', projectId: proj._id || '',
          name: inv.name, investorType: (inv.type as StopdownInvestor['investorType']) || 'angel',
          contactStatus: 'identified', why: inv.why || '', sectors: inv.sectors || [],
          stages: inv.stages || [],
          ticketRange: inv.ticketRange || { min: 50000, max: 500000 },
          approach: inv.approach || '', notes: '', createdAt: now,
        };
        await handleSaveInvestor(newInv);
      }

      // Step 7: generate events
      setAiResetProgress('Generando agenda de reuniones...');
      const todayDate = new Date();
      const evCtx = `Proyecto: ${proj.name}\nDescripción: ${proj.description}\nEtapa: ${proj.stage}\nEquipo: ${members.map(m => m.role).join(', ')}\nInversores: ${(ir.idealInvestors || []).map(i => i.name).join(', ')}\n\nGenera al menos 8 eventos/reuniones realistas para las próximas 4 semanas del proyecto. Incluye: kickoff de equipo, reuniones de inversores, demos de producto, reviews de sprint, calls con advisors, deadlines de documentos, etc. Fecha actual: ${todayDate.toISOString().slice(0, 10)}. Responde en JSON con formato: { "events": [{ "title": "...", "description": "...", "eventType": "meeting|call|demo|pitch|review|deadline|social|other", "date": "YYYY-MM-DD", "time": "HH:MM", "duration": 60, "attendees": [{"name": "...", "role": "..."}], "location": "...", "videoLink": "..." }] }`;
      const { result: evR } = await agentApi.stopdownGenerate('pitch', evCtx);
      const evData = evR as { events?: { title: string; description?: string; eventType?: EventType; date: string; time: string; duration?: number; attendees?: { name: string; role?: string }[]; location?: string; videoLink?: string }[] };
      for (const ev of (evData.events || [])) {
        const newEv: CalendarEvent = {
          type: 'event', projectId: proj._id || '',
          title: ev.title, description: ev.description,
          eventType: ev.eventType || 'meeting',
          date: ev.date, time: ev.time, duration: ev.duration || 60,
          attendees: (ev.attendees || []).map(a => ({ ...a, attendance: 'pending' as AttendanceStatus })),
          location: ev.location,
          videoLink: ev.videoLink, status: 'scheduled', createdAt: now,
          shareId: Math.random().toString(36).slice(2, 10),
        };
        await handleSaveEvent(newEv);
      }

      setAiResetProgress('¡Completado! Recargando...');
      await loadAll();
      setAiResetProgress(null);
    } catch (err) {
      console.error('AI Full Reset error', err);
      setAiResetProgress(null);
    }
  };

  if (loading) {
    return <TabLoader text="Cargando tu empresa..." />;
  }

  const NAV_ITEMS: { key: Section; icon: typeof Rocket; label: string }[] = [
    { key: 'home', icon: Building2, label: 'Inicio' },
    { key: 'activity', icon: Zap, label: 'Actividad' },
    { key: 'team', icon: Users, label: 'Equipo' },
    { key: 'pitch', icon: Mic2, label: 'Pitches' },
    { key: 'dataroom', icon: FolderLock, label: 'Docs' },
    { key: 'calendar', icon: Calendar, label: 'Eventos' },
    { key: 'investors', icon: TrendingUp, label: 'Inversores' },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {project && (
        <div className={cn('shrink-0 border-b flex items-center justify-around px-1 py-1', isDark ? 'border-zinc-800 bg-zinc-950' : 'border-gray-200 bg-white')}>
          {NAV_ITEMS.map(({ key, icon: Icon, label }) => {
            const isActive = section === key;
            return (
              <button
                key={key}
                onClick={() => setSection(key)}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg transition-all min-w-0 flex-1',
                  isActive
                    ? isDark ? 'bg-violet-500/10 text-violet-400' : 'bg-violet-50 text-violet-600'
                    : isDark ? 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50',
                )}
              >
                <Icon className={cn('size-3.5 transition-transform', isActive && 'scale-110')} />
                <span className={cn('text-[7px] font-bold truncate leading-none', isActive && 'font-extrabold')}>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        {section === 'home' && (
          <div className="h-full overflow-y-auto">
            <HomeView isDark={isDark} project={project} pitches={pitches} documents={documents} investors={investors} events={events} actions={actions}
              onNavigate={setSection} onCreateProject={() => {}} onAiReset={handleAiFullReset} aiResetProgress={aiResetProgress} />
            <ProjectView isDark={isDark} project={project} onSave={handleSaveProject} onSaveDoc={handleSaveDoc} onBack={() => setSection('home')} onRefresh={loadAll} onNavigateDataRoom={() => setSection('dataroom')} embedded />
          </div>
        )}
        {section === 'team' && (
          <TeamView isDark={isDark} project={project} onSave={handleSaveProject} onBack={() => setSection('home')} onRefresh={loadAll} />
        )}
        {section === 'pitch' && (
          <PitchView isDark={isDark} project={project} pitches={pitches} onSavePitch={handleSavePitch} onBack={() => setSection('home')} onRefresh={loadAll} />
        )}
        {section === 'dataroom' && (
          <DataRoomView isDark={isDark} project={project} documents={documents} onSaveDoc={handleSaveDoc} onDeleteDoc={handleDelete} onBack={() => setSection('home')} onRefresh={loadAll} />
        )}
        {section === 'calendar' && (
          <CalendarView isDark={isDark} project={project} events={events} onSaveEvent={handleSaveEvent} onDeleteEvent={handleDelete} onBack={() => setSection('home')} onRefresh={loadAll} />
        )}
        {section === 'investors' && (
          <InvestorsView isDark={isDark} project={project} investors={investors} onSaveInvestor={handleSaveInvestor} onDeleteInvestor={handleDelete} onBack={() => setSection('home')} onRefresh={loadAll} />
        )}
        {section === 'activity' && (
          <ActivityView isDark={isDark} project={project} actions={actions} documents={documents} investors={investors} events={events} pitches={pitches}
            onSaveAction={handleSaveAction} onDeleteAction={handleDelete} onBack={() => setSection('home')} onRefresh={loadAll} />
        )}
      </div>
    </div>
  );
}
