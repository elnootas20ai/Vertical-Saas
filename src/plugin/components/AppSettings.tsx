import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Settings, Server, Globe, CreditCard, Search,
  Shield, ShieldOff, Plus, Trash2,
  Check, RotateCcw, Image as ImageIcon, FileText,
  Link, Tag, Bot, Monitor, HardDrive, Calendar,
  Pencil,
  ChevronDown, Sun, Moon, Keyboard, Move, Circle, MessageSquare,
  Key, Eye, EyeOff, Loader2, AlertCircle, Mail, Send,
  Repeat, Zap, Gift, BarChart3, Star, Play,
  CheckCircle2, XCircle, Clock, ChevronRight, Sparkles, X,
} from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings, LOCALE_LABELS, LOCALE_FLAGS, type PluginLocale } from '../PluginProvider';
import type { BubblePosition, PopupPosition, ShortcutConfig } from '../PluginPanel';
import { agentApi } from '../lib/api';
import { TokensTab } from './TokensTab';

type SettingsTab = 'general' | 'login' | 'payments' | 'seo' | 'tokens';

type LoginType = 'none' | 'standard';
type PaymentInterval = 'monthly' | 'yearly' | 'one_time';
type PaymentModel = 'saas' | 'one_time' | 'freemium' | 'pay_per_use';

interface PaymentPlan {
  id: string;
  name: string;
  price: number;
  interval: PaymentInterval;
  features: string[];
  active: boolean;
  highlighted: boolean;
}

interface PaymentTestCase {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'passed' | 'failed';
}

interface AppSettingsData {
  appName: string;
  description: string;
  port: number;
  frontendActive: boolean;
  backendActive: boolean;
  technology: string;
  createdAt: string;
  loginType: LoginType;
  loginPromptNone: string;
  loginPromptStandard: string;
  paymentModel: PaymentModel;
  paymentGateway: string;
  paymentPrompt: string;
  plans: PaymentPlan[];
  paymentTests: PaymentTestCase[];
  favicon: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  keywords: string;
  robots: string;
  canonical: string;
}

const STORAGE_KEY = 'pluginAppSettings';

const DEFAULT_PROMPT_NONE = `Configura la aplicación SIN sistema de login ni autenticación.

- No debe haber pantalla de login, registro ni protección de rutas
- El usuario es anónimo/temporal: genera un ID de sesión aleatorio (UUID) y guárdalo en localStorage
- Usa ese ID como identificador del usuario temporal en todas las operaciones
- No guardes datos sensibles, todo es efímero para ese navegador
- Si la app tiene backend, las rutas API no deben requerir token ni autenticación
- Si hay datos por usuario, asócialos al sessionId temporal
- Al cerrar el navegador o limpiar localStorage, se pierde la sesión`;

const DEFAULT_PROMPT_STANDARD = `Implementa un sistema de autenticación estándar completo con las siguientes especificaciones:

BACKEND (Express + CouchDB):
- Base de datos "app_users" con documentos: { _id, type: "user", email, password (bcrypt hash), role: "admin"|"user", name, createdAt }
- POST /api/auth/register → valida email único, hashea password con bcrypt (10 rounds), crea usuario con role "user"
- POST /api/auth/login → busca por email, compara password con bcrypt, devuelve JWT (secret: process.env.JWT_SECRET || "app-secret-2024", expiración 7d) con { userId, email, role }
- GET /api/auth/me → middleware verifica JWT del header Authorization: Bearer <token>, devuelve datos del usuario sin password
- Middleware authRequired que verifica JWT y adjunta req.user
- Middleware adminRequired que además verifica role === "admin"

SEED de usuario admin al arrancar:
- Email: definido en variable de entorno ADMIN_SEED_EMAIL
- Password: definido en variable de entorno ADMIN_SEED_PASSWORD
- Role: admin
- Si ya existe, no duplicar (buscar por email antes de crear)

FRONTEND (React):
- Página /login con formulario de email + password, botón "Iniciar sesión" y enlace a registro
- Página /register con formulario nombre + email + password + confirmar password
- Guarda el JWT en localStorage al hacer login/register exitoso
- AuthContext/Provider que expone: user, login(), register(), logout(), isAuthenticated, isAdmin
- ProtectedRoute component que redirige a /login si no hay token
- En el header/navbar mostrar nombre del usuario y botón logout
- Diseño moderno y limpio con el sistema de diseño existente (Tailwind)
- Validación de formularios: email válido, password mínimo 6 caracteres, passwords coinciden en registro

IMPORTANTE:
- El admin seed SIEMPRE debe crearse con las credenciales definidas en las variables de entorno
- Las rutas protegidas usan el middleware authRequired
- Las rutas de admin usan adminRequired
- Al hacer logout, limpia localStorage y redirige a /login`;

const PAYMENT_PROMPTS: Record<PaymentModel, string> = {
  saas: `Implementa un sistema de pagos SaaS con suscripciones recurrentes.

BACKEND (Express + Stripe):
- Integración con Stripe: crear cliente, suscripciones, webhooks
- POST /api/payments/create-checkout → crea sesión de Stripe Checkout con el plan seleccionado
- POST /api/payments/webhook → maneja eventos: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted
- GET /api/payments/subscription → devuelve suscripción activa del usuario (plan, estado, próxima facturación)
- POST /api/payments/cancel → cancela suscripción al final del período
- POST /api/payments/change-plan → upgrade/downgrade de plan (proration automática)
- Middleware checkSubscription que verifica si el usuario tiene un plan activo
- Guardar en CouchDB: { userId, stripeCustomerId, subscriptionId, planId, status, currentPeriodEnd }

FRONTEND (React):
- Página /pricing con cards de cada plan activo, resaltando el plan recomendado
- Botón "Suscribirse" que redirige a Stripe Checkout
- Dashboard /billing con: plan actual, próxima facturación, historial de pagos, botones cambiar/cancelar
- Badge en el header mostrando el plan actual del usuario
- Página de éxito (/payment-success) y cancelación (/payment-cancelled)
- Proteger rutas premium con el plan requerido

IMPORTANTE:
- Usar STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET de env
- Los planes se sincronizan con Stripe Products/Prices
- Manejar correctamente los webhooks con verificación de firma
- Trial period configurable por plan`,

  one_time: `Implementa un sistema de pagos únicos (compra una vez, acceso permanente).

BACKEND (Express + Stripe):
- POST /api/payments/create-payment → crea Payment Intent o Checkout Session para pago único
- POST /api/payments/webhook → maneja payment_intent.succeeded, checkout.session.completed
- GET /api/payments/purchases → lista de compras del usuario
- GET /api/payments/verify/:productId → verifica si el usuario compró un producto
- Guardar en CouchDB: { userId, productId, amount, purchasedAt, stripePaymentId }

FRONTEND (React):
- Página de producto con precio y botón "Comprar ahora"
- Checkout con Stripe Elements o redirección a Checkout
- Página de confirmación post-compra
- Sección "Mis compras" en el perfil del usuario
- Desbloqueo inmediato del contenido/funcionalidad comprada

IMPORTANTE:
- Cada producto tiene un precio fijo, se paga una vez
- El acceso es permanente después de la compra
- Enviar email de confirmación (opcional)`,

  freemium: `Implementa un modelo Freemium con plan gratuito limitado y planes premium.

BACKEND (Express + Stripe):
- Plan Free: sin pago, con límites (ej: 100 requests/día, 1GB almacenamiento, funciones básicas)
- Planes Premium: desbloquean límites y funciones avanzadas
- GET /api/payments/usage → devuelve uso actual vs límites del plan
- POST /api/payments/upgrade → upgrade de Free a Premium (Stripe Checkout)
- Middleware checkUsage que valida límites según el plan
- Middleware checkFeature(feature) que verifica acceso a funcionalidades premium
- Guardar en CouchDB: { userId, plan, usage: { requests, storage, ... }, limits: { ... } }

FRONTEND (React):
- Banner "Upgrade" cuando el usuario se acerca a sus límites
- Comparativa de planes Free vs Premium con checkmarks
- Barra de progreso mostrando uso actual (requests, storage, etc.)
- Modal de upgrade contextual cuando se intenta usar una función premium
- Feature gates: componentes que muestran "Premium" badge o bloqueo

IMPORTANTE:
- El plan Free SIEMPRE está disponible, sin tarjeta de crédito
- Los límites se resetean mensualmente
- Transición suave de Free a Premium sin perder datos`,

  pay_per_use: `Implementa un sistema de pago por uso (pay-as-you-go).

BACKEND (Express + Stripe):
- POST /api/payments/add-credits → compra créditos/saldo (Stripe Checkout)
- POST /api/payments/consume → consume créditos por operación (con coste configurable)
- GET /api/payments/balance → saldo actual del usuario
- GET /api/payments/transactions → historial de consumos y recargas
- POST /api/payments/auto-recharge → configura recarga automática cuando el saldo baja de X
- Guardar en CouchDB: { userId, balance, transactions: [{ type, amount, description, timestamp }] }

FRONTEND (React):
- Widget de saldo siempre visible en el header
- Página /credits con opciones de recarga (packs: $5, $20, $50, custom)
- Historial de transacciones con filtros (consumos, recargas)
- Configuración de auto-recarga
- Antes de cada operación costosa, mostrar coste estimado y confirmar
- Alerta cuando el saldo está bajo

IMPORTANTE:
- Cada operación tiene un coste en créditos definido
- El saldo nunca puede ser negativo
- Transacciones atómicas para evitar race conditions`,
};

const DEFAULT_PAYMENT_TESTS: PaymentTestCase[] = [
  { id: 'test-1', name: 'Crear suscripción', description: 'Un usuario nuevo selecciona un plan y completa el pago con Stripe Checkout', status: 'pending' },
  { id: 'test-2', name: 'Cancelar suscripción', description: 'Un usuario activo cancela su suscripción y mantiene acceso hasta fin de período', status: 'pending' },
  { id: 'test-3', name: 'Upgrade de plan', description: 'Un usuario cambia de plan Basic a Pro con prorrateo automático', status: 'pending' },
  { id: 'test-4', name: 'Webhook de pago exitoso', description: 'El webhook de Stripe procesa correctamente un evento invoice.paid', status: 'pending' },
  { id: 'test-5', name: 'Pago fallido', description: 'El sistema maneja correctamente un pago rechazado y notifica al usuario', status: 'pending' },
  { id: 'test-6', name: 'Acceso protegido', description: 'Las rutas premium devuelven 403 si el usuario no tiene plan activo', status: 'pending' },
];

function loadSettings(): AppSettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.loginPromptNone) parsed.loginPromptNone = DEFAULT_PROMPT_NONE;
      if (!parsed.loginPromptStandard) parsed.loginPromptStandard = DEFAULT_PROMPT_STANDARD;
      if (!parsed.paymentModel) parsed.paymentModel = 'saas';
      if (!parsed.paymentPrompt) parsed.paymentPrompt = PAYMENT_PROMPTS.saas;
      if (!parsed.paymentTests) parsed.paymentTests = [...DEFAULT_PAYMENT_TESTS];
      if (parsed.plans) {
        parsed.plans = parsed.plans.map((p: PaymentPlan) => ({
          ...p,
          features: p.features || [],
          highlighted: p.highlighted || false,
        }));
      }
      delete parsed.loginProvider;
      return parsed;
    }
  } catch { /* ignore */ }
  return {
    appName: 'Mi Aplicación',
    description: '',
    port: 3000,
    frontendActive: true,
    backendActive: true,
    technology: 'React + Node.js + CouchDB',
    createdAt: new Date().toISOString().split('T')[0],
    loginType: 'none',
    loginPromptNone: DEFAULT_PROMPT_NONE,
    loginPromptStandard: DEFAULT_PROMPT_STANDARD,
    paymentModel: 'saas',
    paymentGateway: 'Stripe',
    paymentPrompt: PAYMENT_PROMPTS.saas,
    plans: [],
    paymentTests: [...DEFAULT_PAYMENT_TESTS],
    favicon: '/favicon.ico',
    metaTitle: '',
    metaDescription: '',
    ogImage: '',
    keywords: '',
    robots: 'index, follow',
    canonical: '',
  };
}

function saveSettings(data: AppSettingsData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function FieldRow({ label, desc, children, isDark }: {
  label: string;
  desc?: string;
  children: React.ReactNode;
  isDark: boolean;
}) {
  return (
    <div className={cn(
      'flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4 py-3 border-b last:border-b-0',
      isDark ? 'border-zinc-800/60' : 'border-gray-100',
    )}>
      <div className="sm:w-[140px] shrink-0">
        <p className={cn('text-xs font-medium', isDark ? 'text-zinc-300' : 'text-gray-700')}>{label}</p>
        {desc && <p className={cn('text-[10px] mt-0.5', isDark ? 'text-zinc-600' : 'text-gray-400')}>{desc}</p>}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, isDark }: { checked: boolean; onChange: (v: boolean) => void; isDark: boolean }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        checked
          ? 'bg-emerald-500'
          : isDark ? 'bg-zinc-700' : 'bg-gray-300',
      )}
    >
      <span className={cn(
        'inline-block size-3.5 transform rounded-full bg-white transition-transform shadow-sm',
        checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
      )} />
    </button>
  );
}

function InputField({ value, onChange, placeholder, isDark, type = 'text', className }: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  isDark: boolean;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full rounded-lg px-3 py-1.5 text-xs outline-none border transition-colors',
        isDark
          ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/60'
          : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-violet-400',
        className,
      )}
    />
  );
}

function TextareaField({ value, onChange, placeholder, isDark, rows = 2 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  isDark: boolean;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={cn(
        'w-full rounded-lg px-3 py-1.5 text-xs outline-none border transition-colors resize-none',
        isDark
          ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/60'
          : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-violet-400',
      )}
    />
  );
}

function SelectField({ value, onChange, options, isDark }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  isDark: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full rounded-lg px-3 py-1.5 text-xs outline-none border transition-colors appearance-none pr-7',
          isDark
            ? 'bg-zinc-900 border-zinc-700 text-zinc-200 focus:border-violet-500/60'
            : 'bg-white border-gray-200 text-gray-900 focus:border-violet-400',
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className={cn('absolute right-2 top-1/2 -translate-y-1/2 size-3 pointer-events-none', isDark ? 'text-zinc-500' : 'text-gray-400')} />
    </div>
  );
}

const ALL_LOCALES: PluginLocale[] = ['en', 'es', 'fr', 'pt'];

function LanguageSelector({ isDark }: { isDark: boolean }) {
  const { locale, setLocale } = usePluginSettings();

  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all',
            locale === l
              ? isDark
                ? 'border-violet-500/50 bg-violet-950/30 text-violet-300 ring-1 ring-violet-500/20'
                : 'border-violet-400 bg-violet-50 text-violet-700 ring-1 ring-violet-200'
              : isDark
                ? 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800',
          )}
        >
          <span className="text-[10px] font-bold">{LOCALE_FLAGS[l]}</span>
          <span>{LOCALE_LABELS[l]}</span>
          {locale === l && <Check className="size-3 text-violet-400 ml-1" />}
        </button>
      ))}
    </div>
  );
}

function ThemeSelector({ isDark }: { isDark: boolean }) {
  const { toggleTheme, t } = usePluginSettings();

  const options = [
    { key: 'light', icon: Sun, label: t('lightMode'), active: !isDark },
    { key: 'dark', icon: Moon, label: t('darkMode'), active: isDark },
  ] as const;

  return (
    <div className="flex gap-1.5">
      {options.map(({ key, icon: Icon, label, active }) => (
        <button
          key={key}
          onClick={() => { if (!active) toggleTheme(); }}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all',
            active
              ? isDark
                ? 'border-violet-500/50 bg-violet-950/30 text-violet-300 ring-1 ring-violet-500/20'
                : 'border-violet-400 bg-violet-50 text-violet-700 ring-1 ring-violet-200'
              : isDark
                ? 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800',
          )}
        >
          <Icon className="size-3.5" />
          <span>{label}</span>
          {active && <Check className="size-3 text-violet-400 ml-1" />}
        </button>
      ))}
    </div>
  );
}

function ShortcutField({ shortcut, onChange, isDark, t }: {
  shortcut: ShortcutConfig;
  onChange: (s: ShortcutConfig) => void;
  isDark: boolean;
  t: (k: string) => string;
}) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState('');
  const recRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    recRef.current = true;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        setPreview(parts.join('+') + '+...');
        return;
      }

      const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      parts.push(k);

      onChange({ key: e.key.toLowerCase(), ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey, label: parts.join('+') });
      setRecording(false);
      setPreview('');
      recRef.current = false;
    };

    window.addEventListener('keydown', handler, true);
    return () => { window.removeEventListener('keydown', handler, true); recRef.current = false; };
  }, [recording, onChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Keyboard className={cn('size-3.5', isDark ? 'text-zinc-500' : 'text-gray-400')} />
        {shortcut.label.split('+').map((part, i) => (
          <kbd
            key={i}
            className={cn(
              'inline-flex items-center justify-center min-w-[24px] h-6 px-2 border rounded-md text-[11px] font-mono font-medium',
              isDark ? 'bg-zinc-800 border-zinc-600 text-zinc-300' : 'bg-gray-100 border-gray-300 text-gray-700',
            )}
          >
            {part}
          </kbd>
        ))}
      </div>
      {recording ? (
        <div className={cn(
          'flex items-center gap-3 py-3 px-3 rounded-lg border',
          isDark ? 'bg-violet-950/30 border-violet-500/30' : 'bg-violet-50 border-violet-200',
        )}>
          <div className="size-5 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
            <div className="size-1.5 rounded-full bg-red-400" />
          </div>
          <p className={cn('text-xs font-medium flex-1', isDark ? 'text-violet-300' : 'text-violet-600')}>
            {preview || t('pressShortcut')}
          </p>
          <button
            onClick={() => { setRecording(false); setPreview(''); }}
            className={cn('text-[10px] font-medium', isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
          >
            {t('cancel')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setRecording(true)}
          className={cn(
            'text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors',
            isDark ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700',
          )}
        >
          {t('recordShortcut')}
        </button>
      )}
    </div>
  );
}

type GridPosition = BubblePosition & PopupPosition;

const gridPositions: { id: GridPosition; row: number; col: number }[] = [
  { id: 'top-left',      row: 0, col: 0 },
  { id: 'top-center',    row: 0, col: 1 },
  { id: 'top-right',     row: 0, col: 2 },
  { id: 'center-left',   row: 1, col: 0 },
  { id: 'center',        row: 1, col: 1 },
  { id: 'center-right',  row: 1, col: 2 },
  { id: 'bottom-left',   row: 2, col: 0 },
  { id: 'bottom-center', row: 2, col: 1 },
  { id: 'bottom-right',  row: 2, col: 2 },
];

function PositionField({
  bubblePosition, popupPosition, onChangeBubble, onChangePopup, isDark, t,
}: {
  bubblePosition: BubblePosition;
  popupPosition: PopupPosition;
  onChangeBubble: (pos: BubblePosition) => void;
  onChangePopup: (pos: PopupPosition) => void;
  isDark: boolean;
  t: (k: string) => string;
}) {
  const [posTab, setPosTab] = useState<'bubble' | 'popup'>('bubble');
  const currentPos = posTab === 'bubble' ? bubblePosition : popupPosition;
  const handleChange = (pos: GridPosition) => {
    if (posTab === 'bubble') onChangeBubble(pos);
    else onChangePopup(pos);
  };

  return (
    <div className="space-y-2">
      <div className={cn('flex gap-1 rounded-lg p-0.5', isDark ? 'bg-zinc-800/60' : 'bg-gray-100')}>
        <button
          onClick={() => setPosTab('bubble')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-all',
            posTab === 'bubble'
              ? 'bg-emerald-600 text-white shadow-sm'
              : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-gray-400 hover:text-gray-700',
          )}
        >
          <Circle className="size-2.5" />
          {t('bubble')}
        </button>
        <button
          onClick={() => setPosTab('popup')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-all',
            posTab === 'popup'
              ? 'bg-violet-600 text-white shadow-sm'
              : isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-gray-400 hover:text-gray-700',
          )}
        >
          <MessageSquare className="size-2.5" />
          {t('popup')}
        </button>
      </div>

      <div
        className={cn(
          'relative w-full aspect-[16/10] rounded-lg border p-1.5',
          isDark ? 'bg-zinc-800/60 border-zinc-700/50' : 'bg-gray-100 border-gray-200',
        )}
      >
        <div className="grid grid-cols-3 grid-rows-3 gap-1 w-full h-full">
          {gridPositions.map((pos) => {
            const isActive = currentPos === pos.id;
            const activeColor = posTab === 'bubble' ? 'bg-emerald-600 shadow-emerald-600/30' : 'bg-violet-600 shadow-violet-600/30';
            const otherPos = posTab === 'bubble' ? popupPosition : bubblePosition;
            const isOther = otherPos === pos.id;

            return (
              <button
                key={pos.id}
                onClick={() => handleChange(pos.id)}
                className={cn(
                  'rounded-md flex items-center justify-center transition-all relative',
                  isActive
                    ? `${activeColor} shadow-md`
                    : isDark ? 'bg-zinc-700/60 hover:bg-zinc-600/80' : 'bg-gray-200 hover:bg-gray-300',
                )}
                title={pos.id}
              >
                <div className={cn('size-2 rounded-full transition-colors', isActive ? 'bg-white' : 'bg-zinc-500')} />
                {isOther && !isActive && (
                  <div
                    className={cn('absolute size-1.5 rounded-full', posTab === 'bubble' ? 'bg-violet-500/60' : 'bg-emerald-500/60')}
                    style={{ top: 2, right: 2 }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-5 rounded-sm border border-zinc-600/20" />
        </div>
      </div>

      <div className="text-center">
        <span className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium',
          posTab === 'bubble' ? 'bg-emerald-600/15 text-emerald-400' : 'bg-violet-600/15 text-violet-400',
        )}>
          <span className="capitalize">{currentPos.replace('-', ' ')}</span>
        </span>
      </div>
    </div>
  );
}

function OpenAIKeyField({ isDark, t }: { isDark: boolean; t: (k: string) => string }) {
  const [configured, setConfigured] = useState(false);
  const [masked, setMasked] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    agentApi.getOpenAIKey()
      .then(data => { setConfigured(data.configured); setMasked(data.masked); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!inputValue.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await agentApi.setOpenAIKey(inputValue.trim());
      setConfigured(true);
      setMasked(res.masked);
      setInputValue('');
      setShowInput(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await agentApi.removeOpenAIKey();
      setConfigured(false);
      setMasked('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loader2 className={cn('size-3.5 animate-spin', isDark ? 'text-zinc-500' : 'text-gray-400')} />;
  }

  return (
    <div className="space-y-2">
      {configured && !showInput ? (
        <div className="flex items-center gap-2 flex-wrap">
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono',
            isDark ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700',
          )}>
            <Key className="size-3.5" />
            <span>{masked}</span>
            <Check className="size-3 ml-1" />
          </div>
          <button
            onClick={() => setShowInput(true)}
            className={cn(
              'text-[10px] font-medium px-2 py-1 rounded-md transition-colors',
              isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
            )}
          >
            {t('settingsChangeKey')}
          </button>
          <button
            onClick={handleRemove}
            disabled={saving}
            className={cn(
              'text-[10px] font-medium px-2 py-1 rounded-md transition-colors',
              isDark ? 'text-red-400/70 hover:text-red-400 hover:bg-red-950/30' : 'text-red-400 hover:text-red-600 hover:bg-red-50',
            )}
          >
            {t('delete')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'flex-1 flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors',
              isDark
                ? 'bg-zinc-900 border-zinc-700 focus-within:border-violet-500/60'
                : 'bg-white border-gray-200 focus-within:border-violet-400',
            )}>
              <Key className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
              <input
                type={showKey ? 'text' : 'password'}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setShowInput(false); setInputValue(''); } }}
                placeholder="sk-..."
                className={cn(
                  'flex-1 bg-transparent text-xs outline-none font-mono',
                  isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400',
                )}
                autoFocus
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className={cn('shrink-0', isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
              >
                {showKey ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !inputValue.trim()}
              className={cn(
                'shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40',
                'bg-violet-600 hover:bg-violet-500 text-white',
              )}
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            </button>
            {configured && (
              <button
                onClick={() => { setShowInput(false); setInputValue(''); }}
                className={cn('shrink-0', isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {error && (
            <div className={cn('flex items-center gap-1.5 text-[10px]', isDark ? 'text-red-400' : 'text-red-500')}>
              <AlertCircle className="size-3" />
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SMTPField({ isDark, t }: { isDark: boolean; t: (k: string) => string }) {
  const [configured, setConfigured] = useState(false);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [maskedPass, setMaskedPass] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    agentApi.getSmtpConfig()
      .then(data => {
        setConfigured(data.configured);
        setUser(data.user || '');
        setMaskedPass(data.maskedPass || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!user.trim()) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: { user: string; pass?: string } = { user: user.trim() };
      if (pass.trim()) payload.pass = pass.trim();
      const res = await agentApi.saveSmtpConfig(payload);
      setConfigured(res.configured);
      setUser(res.user);
      setMaskedPass(res.maskedPass);
      setPass('');
      setShowEdit(false);
      setSuccess(t('settingsSmtpSaved'));
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError('');
    setSuccess('');
    try {
      const res = await agentApi.testSmtp();
      setSuccess(`${t('settingsSmtpTestOk')} ${res.sentTo}`);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    setError('');
    try {
      await agentApi.removeSmtpConfig();
      setConfigured(false);
      setUser('');
      setPass('');
      setMaskedPass('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loader2 className={cn('size-3.5 animate-spin', isDark ? 'text-zinc-500' : 'text-gray-400')} />;
  }

  return (
    <div className="space-y-2">
      {configured && !showEdit ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono',
              isDark ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700',
            )}>
              <Mail className="size-3.5" />
              <span>{user}</span>
              <Check className="size-3 ml-1" />
            </div>
            <button
              onClick={() => setShowEdit(true)}
              className={cn(
                'text-[10px] font-medium px-2 py-1 rounded-md transition-colors',
                isDark ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
              )}
            >
              {t('settingsChangeKey')}
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className={cn(
                'text-[10px] font-medium px-2 py-1 rounded-md transition-colors flex items-center gap-1',
                isDark ? 'text-violet-400 hover:text-violet-300 hover:bg-violet-950/30' : 'text-violet-600 hover:text-violet-700 hover:bg-violet-50',
              )}
            >
              {testing ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
              {t('settingsSmtpTest')}
            </button>
            <button
              onClick={handleRemove}
              disabled={saving}
              className={cn(
                'text-[10px] font-medium px-2 py-1 rounded-md transition-colors',
                isDark ? 'text-red-400/70 hover:text-red-400 hover:bg-red-950/30' : 'text-red-400 hover:text-red-600 hover:bg-red-50',
              )}
            >
              {t('delete')}
            </button>
          </div>
          {success && (
            <div className={cn('flex items-center gap-1.5 text-[10px]', isDark ? 'text-emerald-400' : 'text-emerald-600')}>
              <Check className="size-3" />
              {success}
            </div>
          )}
          {error && (
            <div className={cn('flex items-center gap-1.5 text-[10px]', isDark ? 'text-red-400' : 'text-red-500')}>
              <AlertCircle className="size-3" />
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'flex-1 flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors',
              isDark
                ? 'bg-zinc-900 border-zinc-700 focus-within:border-violet-500/60'
                : 'bg-white border-gray-200 focus-within:border-violet-400',
            )}>
              <Mail className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
              <input
                type="email"
                value={user}
                onChange={e => setUser(e.target.value)}
                placeholder={t('settingsSmtpUserPlaceholder')}
                className={cn(
                  'flex-1 bg-transparent text-xs outline-none',
                  isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400',
                )}
                autoFocus
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={cn(
              'flex-1 flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors',
              isDark
                ? 'bg-zinc-900 border-zinc-700 focus-within:border-violet-500/60'
                : 'bg-white border-gray-200 focus-within:border-violet-400',
            )}>
              <Key className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
              <input
                type={showPass ? 'text' : 'password'}
                value={pass}
                onChange={e => setPass(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setShowEdit(false); setPass(''); } }}
                placeholder={configured ? t('settingsSmtpPassPlaceholderChange') : t('settingsSmtpPassPlaceholder')}
                className={cn(
                  'flex-1 bg-transparent text-xs outline-none font-mono',
                  isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400',
                )}
              />
              <button
                onClick={() => setShowPass(!showPass)}
                className={cn('shrink-0', isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
              >
                {showPass ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !user.trim() || (!configured && !pass.trim())}
              className={cn(
                'shrink-0 text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40',
                'bg-violet-600 hover:bg-violet-500 text-white',
              )}
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            </button>
            {configured && (
              <button
                onClick={() => { setShowEdit(false); setPass(''); }}
                className={cn('shrink-0', isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {error && (
            <div className={cn('flex items-center gap-1.5 text-[10px]', isDark ? 'text-red-400' : 'text-red-500')}>
              <AlertCircle className="size-3" />
              {error}
            </div>
          )}
          {success && (
            <div className={cn('flex items-center gap-1.5 text-[10px]', isDark ? 'text-emerald-400' : 'text-emerald-600')}>
              <Check className="size-3" />
              {success}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GeneralTab({ settings, onChange, isDark, t, shortcut, onChangeShortcut, bubblePosition, popupPosition, onChangeBubblePosition, onChangePopupPosition }: {
  settings: AppSettingsData;
  onChange: (patch: Partial<AppSettingsData>) => void;
  isDark: boolean;
  t: (k: string) => string;
  shortcut?: ShortcutConfig;
  onChangeShortcut?: (s: ShortcutConfig) => void;
  bubblePosition?: BubblePosition;
  popupPosition?: PopupPosition;
  onChangeBubblePosition?: (pos: BubblePosition) => void;
  onChangePopupPosition?: (pos: PopupPosition) => void;
}) {
  return (
    <div className="space-y-0">
      <FieldRow label={t('language')} desc={t('settingsLanguageDesc')} isDark={isDark}>
        <LanguageSelector isDark={isDark} />
      </FieldRow>
      <FieldRow label={t('settingsTheme')} desc={t('settingsThemeDesc')} isDark={isDark}>
        <ThemeSelector isDark={isDark} />
      </FieldRow>
      <FieldRow label="OpenAI API Key" desc={t('settingsOpenAIKeyDesc')} isDark={isDark}>
        <OpenAIKeyField isDark={isDark} t={t} />
      </FieldRow>
      <FieldRow label={t('settingsSmtpLabel')} desc={t('settingsSmtpDesc')} isDark={isDark}>
        <SMTPField isDark={isDark} t={t} />
      </FieldRow>
      {shortcut && onChangeShortcut && (
        <FieldRow label={t('settingsShortcut')} desc={t('settingsShortcutDesc')} isDark={isDark}>
          <ShortcutField shortcut={shortcut} onChange={onChangeShortcut} isDark={isDark} t={t} />
        </FieldRow>
      )}
      {bubblePosition && popupPosition && onChangeBubblePosition && onChangePopupPosition && (
        <FieldRow label={t('settingsPosition')} desc={t('settingsPositionDesc')} isDark={isDark}>
          <PositionField
            bubblePosition={bubblePosition}
            popupPosition={popupPosition}
            onChangeBubble={onChangeBubblePosition}
            onChangePopup={onChangePopupPosition}
            isDark={isDark}
            t={t}
          />
        </FieldRow>
      )}
      <FieldRow label={t('settingsAppName')} desc={t('settingsAppNameDesc')} isDark={isDark}>
        <InputField value={settings.appName} onChange={(v) => onChange({ appName: v })} isDark={isDark} />
      </FieldRow>
      <FieldRow label={t('settingsDescription')} desc={t('settingsDescriptionDesc')} isDark={isDark}>
        <TextareaField value={settings.description} onChange={(v) => onChange({ description: v })} isDark={isDark} placeholder="..." />
      </FieldRow>
      <FieldRow label={t('settingsPort')} desc={t('settingsPortDesc')} isDark={isDark}>
        <div className="flex items-center gap-2">
          <InputField value={settings.port} onChange={(v) => onChange({ port: parseInt(v) || 0 })} isDark={isDark} type="number" className="w-24" />
          <span className={cn('text-[10px] font-mono px-2 py-1 rounded-md', isDark ? 'bg-zinc-800 text-emerald-400' : 'bg-gray-100 text-emerald-600')}>
            :{settings.port}
          </span>
        </div>
      </FieldRow>
      <FieldRow label={t('settingsStack')} desc={t('settingsStackDesc')} isDark={isDark}>
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ frontendActive: !settings.frontendActive })}
            className={cn(
              'flex-1 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all',
              settings.frontendActive
                ? isDark
                  ? 'border-emerald-500/40 bg-emerald-950/30 ring-1 ring-emerald-500/10'
                  : 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-100'
                : isDark
                  ? 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300',
            )}
          >
            <Monitor className={cn('size-4 shrink-0', settings.frontendActive ? 'text-emerald-500' : isDark ? 'text-zinc-600' : 'text-gray-400')} />
            <div className="flex-1 min-w-0 text-left">
              <p className={cn('text-[11px] font-semibold', isDark ? 'text-zinc-200' : 'text-gray-700')}>Frontend</p>
              <p className={cn('text-[9px]', settings.frontendActive ? 'text-emerald-500' : isDark ? 'text-zinc-600' : 'text-gray-400')}>
                {settings.frontendActive ? t('settingsActive') : t('settingsInactive')}
              </p>
            </div>
            <div className={cn(
              'size-2 rounded-full shrink-0 transition-colors',
              settings.frontendActive ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : isDark ? 'bg-zinc-700' : 'bg-gray-300',
            )} />
          </button>
          <button
            onClick={() => onChange({ backendActive: !settings.backendActive })}
            className={cn(
              'flex-1 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all',
              settings.backendActive
                ? isDark
                  ? 'border-emerald-500/40 bg-emerald-950/30 ring-1 ring-emerald-500/10'
                  : 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-100'
                : isDark
                  ? 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                  : 'border-gray-200 bg-gray-50 hover:border-gray-300',
            )}
          >
            <HardDrive className={cn('size-4 shrink-0', settings.backendActive ? 'text-emerald-500' : isDark ? 'text-zinc-600' : 'text-gray-400')} />
            <div className="flex-1 min-w-0 text-left">
              <p className={cn('text-[11px] font-semibold', isDark ? 'text-zinc-200' : 'text-gray-700')}>Backend</p>
              <p className={cn('text-[9px]', settings.backendActive ? 'text-emerald-500' : isDark ? 'text-zinc-600' : 'text-gray-400')}>
                {settings.backendActive ? t('settingsActive') : t('settingsInactive')}
              </p>
            </div>
            <div className={cn(
              'size-2 rounded-full shrink-0 transition-colors',
              settings.backendActive ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : isDark ? 'bg-zinc-700' : 'bg-gray-300',
            )} />
          </button>
        </div>
      </FieldRow>
      <FieldRow label={t('settingsTechnology')} desc={t('settingsTechnologyDesc')} isDark={isDark}>
        <InputField value={settings.technology} onChange={(v) => onChange({ technology: v })} isDark={isDark} />
      </FieldRow>
      <FieldRow label={t('settingsCreatedAt')} isDark={isDark}>
        <div className="flex items-center gap-2">
          <Calendar className={cn('size-3.5', isDark ? 'text-zinc-500' : 'text-gray-400')} />
          <InputField value={settings.createdAt} onChange={(v) => onChange({ createdAt: v })} isDark={isDark} type="date" className="w-40" />
        </div>
      </FieldRow>
    </div>
  );
}

function LoginTab({ settings, onChange, isDark, t }: {
  settings: AppSettingsData;
  onChange: (patch: Partial<AppSettingsData>) => void;
  isDark: boolean;
  t: (k: string) => string;
}) {
  const [editingPrompt, setEditingPrompt] = useState(false);
  const activePrompt = settings.loginType === 'standard' ? settings.loginPromptStandard : settings.loginPromptNone;
  const promptKey = settings.loginType === 'standard' ? 'loginPromptStandard' : 'loginPromptNone';

  const handleResetPrompt = () => {
    onChange({
      [promptKey]: settings.loginType === 'standard' ? DEFAULT_PROMPT_STANDARD : DEFAULT_PROMPT_NONE,
    } as Partial<AppSettingsData>);
  };

  const noneActive = settings.loginType === 'none';
  const stdActive = settings.loginType === 'standard';

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {/* No login */}
        <button
          onClick={() => onChange({ loginType: 'none' })}
          className={cn(
            'relative text-left rounded-xl border p-4 transition-all overflow-hidden',
            noneActive
              ? isDark
                ? 'border-amber-500/40 bg-gradient-to-br from-amber-950/40 to-zinc-900 ring-1 ring-amber-500/20'
                : 'border-amber-300 bg-gradient-to-br from-amber-50 to-white ring-1 ring-amber-200'
              : isDark
                ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-900'
                : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50',
          )}
        >
          <div className="flex items-start gap-3">
            <div className={cn(
              'size-10 rounded-xl flex items-center justify-center shrink-0',
              noneActive
                ? isDark ? 'bg-amber-600/20' : 'bg-amber-100'
                : isDark ? 'bg-zinc-800' : 'bg-gray-100',
            )}>
              <ShieldOff className={cn('size-5', noneActive ? isDark ? 'text-amber-400' : 'text-amber-600' : isDark ? 'text-zinc-500' : 'text-gray-400')} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={cn('text-sm font-semibold', isDark ? 'text-zinc-100' : 'text-gray-800')}>{t('settingsLoginNone')}</p>
                {noneActive && (
                  <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full', isDark ? 'bg-amber-600/20 text-amber-400' : 'bg-amber-100 text-amber-700')}>
                    {t('settingsActive')}
                  </span>
                )}
              </div>
              <p className={cn('text-[11px] mt-1 leading-relaxed', isDark ? 'text-zinc-400' : 'text-gray-500')}>{t('settingsLoginNoneDesc')}</p>
              {noneActive && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {[t('loginFeatureTemp'), t('loginFeatureNoRoutes'), t('loginFeatureLocalStorage')].map((feat, i) => (
                    <span key={i} className={cn('inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full', isDark ? 'bg-amber-950/50 text-amber-300 ring-1 ring-amber-800/30' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200')}>
                      <Check className="size-2.5" />{feat}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {noneActive && (
              <div className={cn('size-5 rounded-full flex items-center justify-center shrink-0', isDark ? 'bg-amber-600' : 'bg-amber-500')}>
                <Check className="size-3 text-white" />
              </div>
            )}
          </div>
        </button>

        {/* Standard login */}
        <button
          onClick={() => onChange({ loginType: 'standard' })}
          className={cn(
            'relative text-left rounded-xl border p-4 transition-all overflow-hidden',
            stdActive
              ? isDark
                ? 'border-blue-500/40 bg-gradient-to-br from-blue-950/40 to-zinc-900 ring-1 ring-blue-500/20'
                : 'border-blue-300 bg-gradient-to-br from-blue-50 to-white ring-1 ring-blue-200'
              : isDark
                ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-900'
                : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50',
          )}
        >
          <div className="flex items-start gap-3">
            <div className={cn(
              'size-10 rounded-xl flex items-center justify-center shrink-0',
              stdActive
                ? isDark ? 'bg-blue-600/20' : 'bg-blue-100'
                : isDark ? 'bg-zinc-800' : 'bg-gray-100',
            )}>
              <Shield className={cn('size-5', stdActive ? isDark ? 'text-blue-400' : 'text-blue-600' : isDark ? 'text-zinc-500' : 'text-gray-400')} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={cn('text-sm font-semibold', isDark ? 'text-zinc-100' : 'text-gray-800')}>{t('settingsLoginStandard')}</p>
                {stdActive && (
                  <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full', isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-100 text-blue-700')}>
                    {t('settingsActive')}
                  </span>
                )}
              </div>
              <p className={cn('text-[11px] mt-1 leading-relaxed', isDark ? 'text-zinc-400' : 'text-gray-500')}>{t('settingsLoginStandardDesc')}</p>
              {stdActive && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {[t('loginFeatureJWT'), t('loginFeatureAdmin'), t('loginFeatureProtected'), t('loginFeatureBcrypt')].map((feat, i) => (
                    <span key={i} className={cn('inline-flex items-center gap-1 text-[9px] font-medium px-2 py-0.5 rounded-full', isDark ? 'bg-blue-950/50 text-blue-300 ring-1 ring-blue-800/30' : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200')}>
                      <Check className="size-2.5" />{feat}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {stdActive && (
              <div className={cn('size-5 rounded-full flex items-center justify-center shrink-0', isDark ? 'bg-blue-600' : 'bg-blue-500')}>
                <Check className="size-3 text-white" />
              </div>
            )}
          </div>

          {stdActive && (
            <div className={cn('mt-3 pt-3 border-t', isDark ? 'border-zinc-800/80' : 'border-blue-100')}>
              <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2', isDark ? 'bg-zinc-800/60' : 'bg-blue-50/80')}>
                <Key className={cn('size-3.5 shrink-0', isDark ? 'text-blue-400' : 'text-blue-500')} />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-[10px] font-semibold', isDark ? 'text-zinc-300' : 'text-gray-700')}>Admin seed</p>
                  <p className={cn('text-[10px] font-mono', isDark ? 'text-zinc-500' : 'text-gray-500')}>
                    Definido en variables de entorno
                  </p>
                </div>
              </div>
            </div>
          )}
        </button>
      </div>

      {/* Agent Prompt Editor */}
      <div className={cn(
        'rounded-xl border overflow-hidden',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        <div className={cn(
          'flex items-center justify-between px-4 py-2.5',
          isDark ? 'bg-zinc-900/80' : 'bg-gray-50',
        )}>
          <div className="flex items-center gap-2">
            <Bot className={cn('size-3.5', isDark ? 'text-violet-400' : 'text-violet-500')} />
            <span className={cn('text-[11px] font-semibold', isDark ? 'text-zinc-200' : 'text-gray-700')}>
              {t('settingsLoginAgentPrompt')}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleResetPrompt}
              className={cn(
                'text-[9px] font-medium px-2 py-1 rounded-md transition-colors',
                isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
              )}
            >
              <RotateCcw className="size-2.5 inline mr-1" />
              {t('settingsReset')}
            </button>
            <button
              onClick={() => setEditingPrompt(!editingPrompt)}
              className={cn(
                'text-[9px] font-medium px-2 py-1 rounded-md transition-colors',
                editingPrompt
                  ? isDark ? 'bg-violet-600/20 text-violet-400' : 'bg-violet-100 text-violet-600'
                  : isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
              )}
            >
              <Pencil className="size-2.5 inline mr-1" />
              {editingPrompt ? t('settingsLoginPromptDone') : t('settingsLoginPromptEdit')}
            </button>
          </div>
        </div>
        {editingPrompt ? (
          <textarea
            ref={(el) => {
              if (el) {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
              }
            }}
            value={activePrompt}
            onChange={(e) => {
              onChange({ [promptKey]: e.target.value } as Partial<AppSettingsData>);
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
            }}
            rows={4}
            className={cn(
              'w-full text-[11px] font-mono leading-relaxed p-4 outline-none resize-none border-t',
              isDark
                ? 'bg-zinc-950 text-zinc-300 border-zinc-800 placeholder:text-zinc-700'
                : 'bg-white text-gray-700 border-gray-200 placeholder:text-gray-400',
            )}
          />
        ) : (
          <div className={cn(
            'p-4 border-t max-h-40 overflow-y-auto',
            isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200',
          )}>
            <pre className={cn(
              'text-[10px] font-mono leading-relaxed whitespace-pre-wrap',
              isDark ? 'text-zinc-500' : 'text-gray-400',
            )}>
              {activePrompt}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentsTab({ settings, onChange, isDark, t }: {
  settings: AppSettingsData;
  onChange: (patch: Partial<AppSettingsData>) => void;
  isDark: boolean;
  t: (k: string) => string;
}) {
  const [section, setSection] = useState<'model' | 'gateway' | 'plans' | 'tests' | 'prompt'>('model');
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [newFeature, setNewFeature] = useState('');
  const [editingPrompt, setEditingPrompt] = useState(false);

  // Gateway tokens state
  const [gwMode, setGwMode] = useState<'test' | 'live'>('test');
  const [gwTestKey, setGwTestKey] = useState<{ configured: boolean; masked: string }>({ configured: false, masked: '' });
  const [gwLiveKey, setGwLiveKey] = useState<{ configured: boolean; masked: string }>({ configured: false, masked: '' });
  const [gwTestInput, setGwTestInput] = useState('');
  const [gwLiveInput, setGwLiveInput] = useState('');
  const [gwShowTest, setGwShowTest] = useState(false);
  const [gwShowLive, setGwShowLive] = useState(false);
  const [gwSaving, setGwSaving] = useState(false);
  const [gwFeedback, setGwFeedback] = useState<string | null>(null);

  useEffect(() => {
    agentApi.getPaymentGateway()
      .then((data) => {
        setGwMode(data.mode);
        setGwTestKey(data.testKey);
        setGwLiveKey(data.liveKey);
      })
      .catch(() => {});
  }, []);

  const handleGwSave = async (updates: Parameters<typeof agentApi.savePaymentGateway>[0]) => {
    setGwSaving(true);
    setGwFeedback(null);
    try {
      const result = await agentApi.savePaymentGateway({ ...updates, provider: settings.paymentGateway });
      if (result.ok) {
        setGwMode(result.mode);
        setGwTestKey(result.testKey);
        setGwLiveKey(result.liveKey);
        setGwTestInput('');
        setGwLiveInput('');
        setGwFeedback(t('payGwSaved'));
        setTimeout(() => setGwFeedback(null), 3000);
      }
    } catch (err) {
      setGwFeedback(err instanceof Error ? err.message : 'Error');
    } finally {
      setGwSaving(false);
    }
  };

  interface ModelConfig {
    key: PaymentModel;
    icon: typeof Repeat;
    label: string;
    desc: string;
    darkBg: string;
    lightBg: string;
    darkBorder: string;
    lightBorder: string;
    darkRing: string;
    lightRing: string;
    darkIconBg: string;
    lightIconBg: string;
    darkIconColor: string;
    lightIconColor: string;
    darkCheck: string;
    lightCheck: string;
  }
  const models: ModelConfig[] = [
    { key: 'saas', icon: Repeat, label: t('payModelSaaS'), desc: t('payModelSaaSDesc'), darkBg: 'bg-emerald-950/40', lightBg: 'bg-emerald-50', darkBorder: 'border-emerald-500/40', lightBorder: 'border-emerald-300', darkRing: 'ring-emerald-500/20', lightRing: 'ring-emerald-200', darkIconBg: 'bg-emerald-950/40', lightIconBg: 'bg-emerald-50', darkIconColor: 'text-emerald-400', lightIconColor: 'text-emerald-600', darkCheck: 'bg-emerald-600', lightCheck: 'bg-emerald-500' },
    { key: 'one_time', icon: Zap, label: t('payModelOneTime'), desc: t('payModelOneTimeDesc'), darkBg: 'bg-blue-950/40', lightBg: 'bg-blue-50', darkBorder: 'border-blue-500/40', lightBorder: 'border-blue-300', darkRing: 'ring-blue-500/20', lightRing: 'ring-blue-200', darkIconBg: 'bg-blue-950/40', lightIconBg: 'bg-blue-50', darkIconColor: 'text-blue-400', lightIconColor: 'text-blue-600', darkCheck: 'bg-blue-600', lightCheck: 'bg-blue-500' },
    { key: 'freemium', icon: Gift, label: t('payModelFreemium'), desc: t('payModelFreemiumDesc'), darkBg: 'bg-violet-950/40', lightBg: 'bg-violet-50', darkBorder: 'border-violet-500/40', lightBorder: 'border-violet-300', darkRing: 'ring-violet-500/20', lightRing: 'ring-violet-200', darkIconBg: 'bg-violet-950/40', lightIconBg: 'bg-violet-50', darkIconColor: 'text-violet-400', lightIconColor: 'text-violet-600', darkCheck: 'bg-violet-600', lightCheck: 'bg-violet-500' },
    { key: 'pay_per_use', icon: BarChart3, label: t('payModelPayPerUse'), desc: t('payModelPayPerUseDesc'), darkBg: 'bg-amber-950/40', lightBg: 'bg-amber-50', darkBorder: 'border-amber-500/40', lightBorder: 'border-amber-300', darkRing: 'ring-amber-500/20', lightRing: 'ring-amber-200', darkIconBg: 'bg-amber-950/40', lightIconBg: 'bg-amber-50', darkIconColor: 'text-amber-400', lightIconColor: 'text-amber-600', darkCheck: 'bg-amber-600', lightCheck: 'bg-amber-500' },
  ];

  const handleModelChange = (model: PaymentModel) => {
    onChange({ paymentModel: model, paymentPrompt: PAYMENT_PROMPTS[model] });
  };

  const addPlan = () => {
    const plan: PaymentPlan = {
      id: Date.now().toString(36),
      name: t('payNewPlan'),
      price: 9.99,
      interval: 'monthly',
      features: [],
      active: true,
      highlighted: false,
    };
    onChange({ plans: [...settings.plans, plan] });
    setEditingPlanId(plan.id);
  };

  const updatePlan = (id: string, patch: Partial<PaymentPlan>) => {
    onChange({ plans: settings.plans.map((p) => p.id === id ? { ...p, ...patch } : p) });
  };

  const removePlan = (id: string) => {
    onChange({ plans: settings.plans.filter((p) => p.id !== id) });
    if (editingPlanId === id) setEditingPlanId(null);
  };

  const addFeature = (planId: string) => {
    if (!newFeature.trim()) return;
    const plan = settings.plans.find(p => p.id === planId);
    if (plan) {
      updatePlan(planId, { features: [...plan.features, newFeature.trim()] });
      setNewFeature('');
    }
  };

  const removeFeature = (planId: string, idx: number) => {
    const plan = settings.plans.find(p => p.id === planId);
    if (plan) {
      updatePlan(planId, { features: plan.features.filter((_, i) => i !== idx) });
    }
  };

  const addTest = () => {
    const test: PaymentTestCase = {
      id: Date.now().toString(36),
      name: t('payNewTest'),
      description: '',
      status: 'pending',
    };
    onChange({ paymentTests: [...settings.paymentTests, test] });
  };

  const updateTest = (id: string, patch: Partial<PaymentTestCase>) => {
    onChange({ paymentTests: settings.paymentTests.map((tc) => tc.id === id ? { ...tc, ...patch } : tc) });
  };

  const removeTest = (id: string) => {
    onChange({ paymentTests: settings.paymentTests.filter((tc) => tc.id !== id) });
  };

  const cycleTestStatus = (id: string) => {
    const tc = settings.paymentTests.find(t => t.id === id);
    if (!tc) return;
    const next: PaymentTestCase['status'] = tc.status === 'pending' ? 'passed' : tc.status === 'passed' ? 'failed' : 'pending';
    updateTest(id, { status: next });
  };

  const testStats = {
    total: settings.paymentTests.length,
    passed: settings.paymentTests.filter(t => t.status === 'passed').length,
    failed: settings.paymentTests.filter(t => t.status === 'failed').length,
    pending: settings.paymentTests.filter(t => t.status === 'pending').length,
  };

  const handleResetPrompt = () => {
    onChange({ paymentPrompt: PAYMENT_PROMPTS[settings.paymentModel] });
  };

  const handleResetTests = () => {
    onChange({ paymentTests: [...DEFAULT_PAYMENT_TESTS] });
  };

  const sections = [
    { key: 'model' as const, icon: Sparkles, label: t('paySecModel') },
    { key: 'gateway' as const, icon: Key, label: t('paySecGateway') },
    { key: 'plans' as const, icon: CreditCard, label: t('paySecPlans') },
    { key: 'tests' as const, icon: Play, label: t('paySecTests') },
    { key: 'prompt' as const, icon: Bot, label: t('paySecPrompt') },
  ];

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className={cn('flex rounded-xl border overflow-hidden', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
        {sections.map(({ key, icon: SIcon, label }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-medium transition-all relative',
              section === key
                ? isDark ? 'bg-emerald-600/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
                : isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
            )}
          >
            <SIcon className="size-3" />
            <span className="hidden sm:inline">{label}</span>
            {key === 'gateway' && (gwTestKey.configured || gwLiveKey.configured) && (
              <span className={cn(
                'size-1.5 rounded-full ml-0.5',
                gwMode === 'live' && gwLiveKey.configured
                  ? 'bg-emerald-500'
                  : gwTestKey.configured ? 'bg-amber-500' : 'bg-zinc-500',
              )} />
            )}
            {key === 'tests' && testStats.total > 0 && (
              <span className={cn(
                'text-[8px] font-bold px-1 py-0.5 rounded-full ml-0.5',
                testStats.failed > 0
                  ? isDark ? 'bg-red-600/20 text-red-400' : 'bg-red-100 text-red-600'
                  : testStats.passed === testStats.total
                    ? isDark ? 'bg-emerald-600/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600'
                    : isDark ? 'bg-zinc-700 text-zinc-400' : 'bg-gray-200 text-gray-500',
              )}>
                {testStats.passed}/{testStats.total}
              </span>
            )}
            {section === key && <div className={cn('absolute bottom-0 left-2 right-2 h-0.5 rounded-full', isDark ? 'bg-emerald-500' : 'bg-emerald-600')} />}
          </button>
        ))}
      </div>

      {/* Gateway selector */}
      <FieldRow label={t('settingsPaymentsGateway')} desc={t('settingsPaymentsGatewayDesc')} isDark={isDark}>
        <SelectField
          value={settings.paymentGateway}
          onChange={(v) => onChange({ paymentGateway: v })}
          options={[
            { value: 'Stripe', label: 'Stripe' },
            { value: 'PayPal', label: 'PayPal' },
            { value: 'MercadoPago', label: 'Mercado Pago' },
            { value: 'Square', label: 'Square' },
            { value: 'Paddle', label: 'Paddle' },
            { value: 'LemonSqueezy', label: 'Lemon Squeezy' },
            { value: 'none', label: '—' },
          ]}
          isDark={isDark}
        />
      </FieldRow>

      {/* === MODEL SECTION === */}
      {section === 'model' && (
        <div className="grid grid-cols-2 gap-2">
          {models.map((m) => {
            const active = settings.paymentModel === m.key;
            const MIcon = m.icon;
            return (
              <button
                key={m.key}
                onClick={() => handleModelChange(m.key)}
                className={cn(
                  'relative text-left rounded-xl border p-3.5 transition-all overflow-hidden',
                  active
                    ? isDark
                      ? `${m.darkBorder} bg-gradient-to-br ${m.darkBg} to-zinc-900 ring-1 ${m.darkRing}`
                      : `${m.lightBorder} bg-gradient-to-br ${m.lightBg} to-white ring-1 ${m.lightRing}`
                    : isDark
                      ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50'
                      : 'border-gray-200 hover:border-gray-300 bg-white',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className={cn(
                    'size-8 rounded-lg flex items-center justify-center shrink-0',
                    active
                      ? isDark ? m.darkIconBg : m.lightIconBg
                      : isDark ? 'bg-zinc-800' : 'bg-gray-100',
                  )}>
                    <MIcon className={cn(
                      'size-4',
                      active
                        ? isDark ? m.darkIconColor : m.lightIconColor
                        : isDark ? 'text-zinc-500' : 'text-gray-400',
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={cn('text-xs font-semibold', isDark ? 'text-zinc-100' : 'text-gray-800')}>{m.label}</p>
                      {active && (
                        <div className={cn('size-3.5 rounded-full flex items-center justify-center shrink-0', isDark ? m.darkCheck : m.lightCheck)}>
                          <Check className="size-2 text-white" />
                        </div>
                      )}
                    </div>
                    <p className={cn('text-[9px] mt-0.5 leading-relaxed', isDark ? 'text-zinc-500' : 'text-gray-400')}>{m.desc}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* === GATEWAY TOKENS SECTION === */}
      {section === 'gateway' && (
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className={cn('rounded-xl border p-4', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
            <div className="flex items-center justify-between mb-3">
              <p className={cn('text-xs font-semibold', isDark ? 'text-zinc-200' : 'text-gray-700')}>{t('payGwMode')}</p>
              <div className={cn('flex rounded-lg border overflow-hidden', isDark ? 'border-zinc-700' : 'border-gray-300')}>
                <button
                  onClick={() => void handleGwSave({ mode: 'test' })}
                  disabled={gwSaving}
                  className={cn(
                    'px-3 py-1.5 text-[10px] font-semibold transition-all',
                    gwMode === 'test'
                      ? isDark ? 'bg-amber-600/20 text-amber-300' : 'bg-amber-100 text-amber-800'
                      : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600',
                  )}
                >
                  Test
                </button>
                <button
                  onClick={() => {
                    if (!gwLiveKey.configured) {
                      setGwFeedback(t('payGwNoLive'));
                      setTimeout(() => setGwFeedback(null), 3000);
                      return;
                    }
                    void handleGwSave({ mode: 'live' });
                  }}
                  disabled={gwSaving}
                  className={cn(
                    'px-3 py-1.5 text-[10px] font-semibold transition-all',
                    gwMode === 'live'
                      ? isDark ? 'bg-emerald-600/20 text-emerald-300' : 'bg-emerald-100 text-emerald-800'
                      : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600',
                  )}
                >
                  Live
                </button>
              </div>
            </div>
            <div className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-[10px]',
              gwMode === 'test'
                ? isDark ? 'bg-amber-950/30 text-amber-400 border border-amber-800/40' : 'bg-amber-50 text-amber-700 border border-amber-200'
                : isDark ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-800/40' : 'bg-emerald-50 text-emerald-700 border border-emerald-200',
            )}>
              {gwMode === 'test' ? (
                <AlertCircle className="size-3 shrink-0" />
              ) : (
                <Shield className="size-3 shrink-0" />
              )}
              {gwMode === 'test' ? t('payGwTestWarn') : t('payGwLiveWarn')}
            </div>
          </div>

          {/* Test Key */}
          <div className={cn('rounded-xl border p-4 space-y-2', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
            <div className="flex items-center justify-between">
              <label className={cn('text-[10px] font-semibold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                {t('payGwTestKey')}
              </label>
              {gwTestKey.configured && (
                <span className={cn('flex items-center gap-1 text-[9px] font-medium', isDark ? 'text-emerald-400' : 'text-emerald-600')}>
                  <CheckCircle2 className="size-2.5" />{t('payGwConfigured')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type={gwShowTest ? 'text' : 'password'}
                  value={gwTestInput || (gwTestKey.configured ? gwTestKey.masked : '')}
                  onChange={(e) => setGwTestInput(e.target.value)}
                  placeholder={gwTestKey.configured ? t('payGwReplace') : 'pk_test_xxxxxxxxxxxx'}
                  className={cn(
                    'w-full text-[11px] font-mono px-3 py-2 pr-8 rounded-lg border outline-none transition-colors',
                    isDark
                      ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500'
                      : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-amber-500',
                  )}
                />
                <button
                  type="button"
                  onClick={() => setGwShowTest(!gwShowTest)}
                  className={cn('absolute right-2.5 top-1/2 -translate-y-1/2', isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
                >
                  {gwShowTest ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                </button>
              </div>
              <button
                disabled={!gwTestInput.trim() || gwSaving}
                onClick={() => void handleGwSave({ testKey: gwTestInput.trim() })}
                className={cn(
                  'shrink-0 flex items-center gap-1 text-[10px] font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-40',
                  isDark ? 'bg-amber-600/20 text-amber-300 hover:bg-amber-600/30' : 'bg-amber-100 text-amber-700 hover:bg-amber-200',
                )}
              >
                {gwSaving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              </button>
            </div>
          </div>

          {/* Live Key */}
          <div className={cn('rounded-xl border p-4 space-y-2', isDark ? 'border-zinc-800 bg-zinc-900/40' : 'border-gray-200 bg-gray-50')}>
            <div className="flex items-center justify-between">
              <label className={cn('text-[10px] font-semibold uppercase tracking-wider', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                {t('payGwLiveKey')}
              </label>
              {gwLiveKey.configured && (
                <span className={cn('flex items-center gap-1 text-[9px] font-medium', isDark ? 'text-emerald-400' : 'text-emerald-600')}>
                  <CheckCircle2 className="size-2.5" />{t('payGwConfigured')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type={gwShowLive ? 'text' : 'password'}
                  value={gwLiveInput || (gwLiveKey.configured ? gwLiveKey.masked : '')}
                  onChange={(e) => setGwLiveInput(e.target.value)}
                  placeholder={gwLiveKey.configured ? t('payGwReplace') : 'pk_live_xxxxxxxxxxxx'}
                  className={cn(
                    'w-full text-[11px] font-mono px-3 py-2 pr-8 rounded-lg border outline-none transition-colors',
                    isDark
                      ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500'
                      : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-emerald-500',
                  )}
                />
                <button
                  type="button"
                  onClick={() => setGwShowLive(!gwShowLive)}
                  className={cn('absolute right-2.5 top-1/2 -translate-y-1/2', isDark ? 'text-zinc-600 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
                >
                  {gwShowLive ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                </button>
              </div>
              <button
                disabled={!gwLiveInput.trim() || gwSaving}
                onClick={() => void handleGwSave({ liveKey: gwLiveInput.trim() })}
                className={cn(
                  'shrink-0 flex items-center gap-1 text-[10px] font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-40',
                  isDark ? 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
                )}
              >
                {gwSaving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              </button>
            </div>
          </div>

          {/* Feedback */}
          {gwFeedback && (
            <div className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-medium',
              gwFeedback === t('payGwSaved')
                ? isDark ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-800/40' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : isDark ? 'bg-red-950/30 text-red-400 border border-red-800/40' : 'bg-red-50 text-red-700 border border-red-200',
            )}>
              {gwFeedback === t('payGwSaved') ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
              {gwFeedback}
            </div>
          )}
        </div>
      )}

      {/* === PLANS SECTION === */}
      {section === 'plans' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className={cn('text-xs font-semibold', isDark ? 'text-zinc-200' : 'text-gray-700')}>
              {t('paySecPlans')}
              <span className={cn('ml-2 text-[10px] font-normal', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                {settings.plans.filter(p => p.active).length}/{settings.plans.length} {t('settingsPaymentsActive').toLowerCase()}
              </span>
            </p>
            <button
              onClick={addPlan}
              className={cn(
                'flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-lg transition-colors',
                isDark ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200',
              )}
            >
              <Plus className="size-3" />
              {t('settingsPaymentsAdd')}
            </button>
          </div>

          {settings.plans.length === 0 ? (
            <div className={cn(
              'rounded-xl border border-dashed py-10 text-center',
              isDark ? 'border-zinc-800 bg-zinc-900/30' : 'border-gray-200 bg-gray-50',
            )}>
              <CreditCard className={cn('size-8 mx-auto mb-3', isDark ? 'text-zinc-700' : 'text-gray-300')} />
              <p className={cn('text-xs font-medium', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                {t('settingsPaymentsNoPlans')}
              </p>
              <p className={cn('text-[10px] mt-1', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                {t('payNoPlansHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {settings.plans.map((plan) => {
                const isEditing = editingPlanId === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      'rounded-xl border transition-all overflow-hidden',
                      plan.highlighted
                        ? isDark
                          ? 'border-emerald-500/40 ring-1 ring-emerald-500/10'
                          : 'border-emerald-300 ring-1 ring-emerald-100'
                        : isDark ? 'border-zinc-800' : 'border-gray-200',
                      !plan.active && 'opacity-50',
                    )}
                  >
                    {/* Plan header */}
                    <div className={cn(
                      'flex items-center gap-3 px-4 py-3',
                      isDark ? 'bg-zinc-900/60' : 'bg-gray-50/80',
                    )}>
                      <button
                        onClick={() => setEditingPlanId(isEditing ? null : plan.id)}
                        className={cn('shrink-0', isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
                      >
                        <ChevronRight className={cn('size-3.5 transition-transform', isEditing && 'rotate-90')} />
                      </button>
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            value={plan.name}
                            onChange={(e) => updatePlan(plan.id, { name: e.target.value })}
                            className={cn(
                              'text-xs font-semibold px-2 py-0.5 rounded border outline-none w-full',
                              isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-white border-gray-200 text-gray-900',
                            )}
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <p className={cn('text-xs font-semibold truncate', isDark ? 'text-zinc-100' : 'text-gray-800')}>{plan.name}</p>
                            {plan.highlighted && (
                              <span className={cn('text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full', isDark ? 'bg-emerald-600/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700')}>
                                <Star className="size-2 inline mr-0.5" />{t('payRecommended')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className={cn('text-sm font-bold font-mono', plan.active ? isDark ? 'text-emerald-400' : 'text-emerald-600' : isDark ? 'text-zinc-600' : 'text-gray-400')}>
                        ${plan.price.toFixed(2)}
                      </span>
                      <span className={cn('text-[9px] font-medium', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                        /{plan.interval === 'monthly' ? t('payMo') : plan.interval === 'yearly' ? t('payYr') : t('payOnce')}
                      </span>
                      <Toggle checked={plan.active} onChange={(v) => updatePlan(plan.id, { active: v })} isDark={isDark} />
                    </div>

                    {/* Plan details (expanded) */}
                    {isEditing && (
                      <div className={cn('px-4 py-3 space-y-3 border-t', isDark ? 'border-zinc-800 bg-zinc-950/50' : 'border-gray-100 bg-white')}>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className={cn('text-[9px] font-medium mb-1 block', isDark ? 'text-zinc-500' : 'text-gray-400')}>{t('settingsPaymentsPrice')}</label>
                            <input
                              type="number"
                              step="0.01"
                              value={plan.price}
                              onChange={(e) => updatePlan(plan.id, { price: parseFloat(e.target.value) || 0 })}
                              className={cn(
                                'w-full text-xs px-2 py-1.5 rounded-lg border outline-none font-mono',
                                isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-white border-gray-200 text-gray-900',
                              )}
                            />
                          </div>
                          <div>
                            <label className={cn('text-[9px] font-medium mb-1 block', isDark ? 'text-zinc-500' : 'text-gray-400')}>{t('settingsPaymentsInterval')}</label>
                            <select
                              value={plan.interval}
                              onChange={(e) => updatePlan(plan.id, { interval: e.target.value as PaymentInterval })}
                              className={cn(
                                'w-full text-xs px-2 py-1.5 rounded-lg border outline-none',
                                isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-white border-gray-200 text-gray-900',
                              )}
                            >
                              <option value="monthly">{t('settingsPaymentsMonthly')}</option>
                              <option value="yearly">{t('settingsPaymentsYearly')}</option>
                              <option value="one_time">{t('settingsPaymentsOneTime')}</option>
                            </select>
                          </div>
                          <div className="flex flex-col justify-end gap-1.5">
                            <button
                              onClick={() => updatePlan(plan.id, { highlighted: !plan.highlighted })}
                              className={cn(
                                'flex items-center gap-1 text-[9px] font-medium px-2 py-1.5 rounded-lg transition-colors',
                                plan.highlighted
                                  ? isDark ? 'bg-emerald-600/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600'
                                  : isDark ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-200' : 'bg-gray-100 text-gray-500 hover:text-gray-700',
                              )}
                            >
                              <Star className="size-2.5" />
                              {t('payRecommended')}
                            </button>
                          </div>
                        </div>

                        {/* Features */}
                        <div>
                          <label className={cn('text-[9px] font-medium mb-1.5 block', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                            {t('payFeatures')} ({plan.features.length})
                          </label>
                          <div className="space-y-1">
                            {plan.features.map((feat, idx) => (
                              <div key={idx} className={cn(
                                'flex items-center gap-2 rounded-lg px-2.5 py-1.5',
                                isDark ? 'bg-zinc-900/60' : 'bg-gray-50',
                              )}>
                                <Check className={cn('size-2.5 shrink-0', isDark ? 'text-emerald-500' : 'text-emerald-500')} />
                                <span className={cn('flex-1 text-[10px]', isDark ? 'text-zinc-300' : 'text-gray-700')}>{feat}</span>
                                <button
                                  onClick={() => removeFeature(plan.id, idx)}
                                  className={cn('shrink-0 size-4 rounded flex items-center justify-center', isDark ? 'text-zinc-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500')}
                                >
                                  <X className="size-2.5" />
                                </button>
                              </div>
                            ))}
                            <div className="flex items-center gap-1.5">
                              <input
                                value={newFeature}
                                onChange={(e) => setNewFeature(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') addFeature(plan.id); }}
                                placeholder={t('payAddFeature')}
                                className={cn(
                                  'flex-1 text-[10px] px-2.5 py-1.5 rounded-lg border outline-none',
                                  isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400',
                                )}
                              />
                              <button
                                onClick={() => addFeature(plan.id)}
                                disabled={!newFeature.trim()}
                                className={cn(
                                  'shrink-0 size-6 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30',
                                  isDark ? 'bg-zinc-800 text-zinc-400 hover:text-emerald-400' : 'bg-gray-100 text-gray-500 hover:text-emerald-600',
                                )}
                              >
                                <Plus className="size-3" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            onClick={() => removePlan(plan.id)}
                            className={cn(
                              'flex items-center gap-1 text-[9px] font-medium px-2 py-1 rounded-md transition-colors',
                              isDark ? 'text-red-400/70 hover:text-red-400 hover:bg-red-950/30' : 'text-red-400 hover:text-red-600 hover:bg-red-50',
                            )}
                          >
                            <Trash2 className="size-2.5" />
                            {t('delete')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === TESTS SECTION === */}
      {section === 'tests' && (
        <div className="space-y-3">
          {/* Stats bar */}
          {testStats.total > 0 && (
            <div className={cn('flex items-center gap-3 rounded-xl px-4 py-2.5', isDark ? 'bg-zinc-900/60 border border-zinc-800' : 'bg-gray-50 border border-gray-200')}>
              <div className="flex-1 h-2 rounded-full overflow-hidden bg-zinc-800/50">
                <div className="h-full flex">
                  {testStats.passed > 0 && (
                    <div className="bg-emerald-500 transition-all" style={{ width: `${(testStats.passed / testStats.total) * 100}%` }} />
                  )}
                  {testStats.failed > 0 && (
                    <div className="bg-red-500 transition-all" style={{ width: `${(testStats.failed / testStats.total) * 100}%` }} />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-[9px] font-medium shrink-0">
                <span className={cn('flex items-center gap-1', isDark ? 'text-emerald-400' : 'text-emerald-600')}>
                  <CheckCircle2 className="size-2.5" />{testStats.passed}
                </span>
                <span className={cn('flex items-center gap-1', isDark ? 'text-red-400' : 'text-red-500')}>
                  <XCircle className="size-2.5" />{testStats.failed}
                </span>
                <span className={cn('flex items-center gap-1', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                  <Clock className="size-2.5" />{testStats.pending}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className={cn('text-xs font-semibold', isDark ? 'text-zinc-200' : 'text-gray-700')}>{t('payTestCases')}</p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleResetTests}
                className={cn(
                  'text-[9px] font-medium px-2 py-1 rounded-md transition-colors',
                  isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
                )}
              >
                <RotateCcw className="size-2.5 inline mr-1" />{t('settingsReset')}
              </button>
              <button
                onClick={addTest}
                className={cn(
                  'flex items-center gap-1 text-[10px] font-medium px-2.5 py-1.5 rounded-lg transition-colors',
                  isDark ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200',
                )}
              >
                <Plus className="size-3" />{t('payAddTest')}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {settings.paymentTests.map((tc) => (
              <div
                key={tc.id}
                className={cn(
                  'rounded-xl border p-3 transition-all',
                  tc.status === 'passed'
                    ? isDark ? 'border-emerald-800/40 bg-emerald-950/20' : 'border-emerald-200 bg-emerald-50/50'
                    : tc.status === 'failed'
                      ? isDark ? 'border-red-800/40 bg-red-950/20' : 'border-red-200 bg-red-50/50'
                      : isDark ? 'border-zinc-800 bg-zinc-900/30' : 'border-gray-200 bg-white',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    onClick={() => cycleTestStatus(tc.id)}
                    className="shrink-0 mt-0.5"
                    title={t('payToggleStatus')}
                  >
                    {tc.status === 'passed' ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : tc.status === 'failed' ? (
                      <XCircle className="size-4 text-red-500" />
                    ) : (
                      <Clock className={cn('size-4', isDark ? 'text-zinc-600' : 'text-gray-400')} />
                    )}
                  </button>
                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      value={tc.name}
                      onChange={(e) => updateTest(tc.id, { name: e.target.value })}
                      className={cn(
                        'w-full text-xs font-semibold bg-transparent outline-none',
                        tc.status === 'passed'
                          ? isDark ? 'text-emerald-300' : 'text-emerald-700'
                          : tc.status === 'failed'
                            ? isDark ? 'text-red-300' : 'text-red-700'
                            : isDark ? 'text-zinc-200' : 'text-gray-800',
                      )}
                    />
                    <input
                      value={tc.description}
                      onChange={(e) => updateTest(tc.id, { description: e.target.value })}
                      placeholder={t('payTestDesc')}
                      className={cn(
                        'w-full text-[10px] bg-transparent outline-none',
                        isDark ? 'text-zinc-500 placeholder:text-zinc-700' : 'text-gray-400 placeholder:text-gray-300',
                      )}
                    />
                  </div>
                  <button
                    onClick={() => removeTest(tc.id)}
                    className={cn(
                      'shrink-0 size-5 rounded flex items-center justify-center transition-colors',
                      isDark ? 'text-zinc-700 hover:text-red-400' : 'text-gray-300 hover:text-red-500',
                    )}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === PROMPT SECTION === */}
      {section === 'prompt' && (
        <div className={cn(
          'rounded-xl border overflow-hidden',
          isDark ? 'border-zinc-800' : 'border-gray-200',
        )}>
          <div className={cn(
            'flex items-center justify-between px-4 py-2.5',
            isDark ? 'bg-zinc-900/80' : 'bg-gray-50',
          )}>
            <div className="flex items-center gap-2">
              <Bot className={cn('size-3.5', isDark ? 'text-emerald-400' : 'text-emerald-500')} />
              <span className={cn('text-[11px] font-semibold', isDark ? 'text-zinc-200' : 'text-gray-700')}>
                {t('payPromptTitle')}
              </span>
              <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full', isDark ? 'bg-emerald-950/50 text-emerald-400' : 'bg-emerald-100 text-emerald-600')}>
                {models.find(m => m.key === settings.paymentModel)?.label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleResetPrompt}
                className={cn(
                  'text-[9px] font-medium px-2 py-1 rounded-md transition-colors',
                  isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
                )}
              >
                <RotateCcw className="size-2.5 inline mr-1" />{t('settingsReset')}
              </button>
              <button
                onClick={() => setEditingPrompt(!editingPrompt)}
                className={cn(
                  'text-[9px] font-medium px-2 py-1 rounded-md transition-colors',
                  editingPrompt
                    ? isDark ? 'bg-emerald-600/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600'
                    : isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
                )}
              >
                <Pencil className="size-2.5 inline mr-1" />
                {editingPrompt ? t('settingsLoginPromptDone') : t('settingsLoginPromptEdit')}
              </button>
            </div>
          </div>
          {editingPrompt ? (
            <textarea
              ref={(el) => {
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = el.scrollHeight + 'px';
                }
              }}
              value={settings.paymentPrompt}
              onChange={(e) => {
                onChange({ paymentPrompt: e.target.value });
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
              }}
              rows={4}
              className={cn(
                'w-full text-[11px] font-mono leading-relaxed p-4 outline-none resize-none border-t',
                isDark
                  ? 'bg-zinc-950 text-zinc-300 border-zinc-800 placeholder:text-zinc-700'
                  : 'bg-white text-gray-700 border-gray-200 placeholder:text-gray-400',
              )}
            />
          ) : (
            <div className={cn(
              'p-4 border-t max-h-60 overflow-y-auto',
              isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200',
            )}>
              <pre className={cn(
                'text-[10px] font-mono leading-relaxed whitespace-pre-wrap',
                isDark ? 'text-zinc-500' : 'text-gray-400',
              )}>
                {settings.paymentPrompt}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SeoTab({ settings, onChange, isDark, t }: {
  settings: AppSettingsData;
  onChange: (patch: Partial<AppSettingsData>) => void;
  isDark: boolean;
  t: (k: string) => string;
}) {
  return (
    <div className="space-y-0">
      <FieldRow label={t('settingsFavicon')} desc={t('settingsFaviconDesc')} isDark={isDark}>
        <div className="flex items-center gap-2">
          <div className={cn(
            'size-8 rounded-lg border flex items-center justify-center shrink-0',
            isDark ? 'border-zinc-700 bg-zinc-900' : 'border-gray-200 bg-gray-50',
          )}>
            {settings.favicon ? (
              <img src={settings.favicon} alt="favicon" className="size-4" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <ImageIcon className={cn('size-3.5', isDark ? 'text-zinc-600' : 'text-gray-400')} />
            )}
          </div>
          <InputField value={settings.favicon} onChange={(v) => onChange({ favicon: v })} isDark={isDark} placeholder="/favicon.ico" />
        </div>
      </FieldRow>
      <FieldRow label={t('settingsMetaTitle')} desc={t('settingsMetaTitleDesc')} isDark={isDark}>
        <InputField value={settings.metaTitle} onChange={(v) => onChange({ metaTitle: v })} isDark={isDark} placeholder="Mi App - Título" />
      </FieldRow>
      <FieldRow label={t('settingsMetaDescription')} desc={t('settingsMetaDescriptionDesc')} isDark={isDark}>
        <div>
          <TextareaField value={settings.metaDescription} onChange={(v) => onChange({ metaDescription: v })} isDark={isDark} placeholder="Descripción para buscadores..." />
          <p className={cn(
            'text-[9px] mt-1 text-right',
            (settings.metaDescription.length > 160)
              ? 'text-red-400'
              : isDark ? 'text-zinc-600' : 'text-gray-400',
          )}>
            {settings.metaDescription.length}/160
          </p>
        </div>
      </FieldRow>
      <FieldRow label={t('settingsOgImage')} desc={t('settingsOgImageDesc')} isDark={isDark}>
        <InputField value={settings.ogImage} onChange={(v) => onChange({ ogImage: v })} isDark={isDark} placeholder="https://..." />
      </FieldRow>
      <FieldRow label={t('settingsKeywords')} desc={t('settingsKeywordsDesc')} isDark={isDark}>
        <InputField value={settings.keywords} onChange={(v) => onChange({ keywords: v })} isDark={isDark} placeholder="react, saas, dashboard..." />
      </FieldRow>
      <FieldRow label={t('settingsRobots')} desc={t('settingsRobotsDesc')} isDark={isDark}>
        <SelectField
          value={settings.robots}
          onChange={(v) => onChange({ robots: v })}
          options={[
            { value: 'index, follow', label: 'index, follow' },
            { value: 'noindex, follow', label: 'noindex, follow' },
            { value: 'index, nofollow', label: 'index, nofollow' },
            { value: 'noindex, nofollow', label: 'noindex, nofollow' },
          ]}
          isDark={isDark}
        />
      </FieldRow>
      <FieldRow label={t('settingsCanonical')} desc={t('settingsCanonicalDesc')} isDark={isDark}>
        <InputField value={settings.canonical} onChange={(v) => onChange({ canonical: v })} isDark={isDark} placeholder="https://miapp.com" />
      </FieldRow>
    </div>
  );
}

const TABS: { key: SettingsTab; icon: typeof Server; color: string }[] = [
  { key: 'general', icon: Server, color: 'violet' },
  { key: 'login', icon: Shield, color: 'blue' },
  { key: 'payments', icon: CreditCard, color: 'emerald' },
  { key: 'tokens', icon: Key, color: 'pink' },
  { key: 'seo', icon: Search, color: 'amber' },
];

interface AppSettingsProps {
  shortcut?: ShortcutConfig;
  onChangeShortcut?: (s: ShortcutConfig) => void;
  bubblePosition?: BubblePosition;
  popupPosition?: PopupPosition;
  onChangeBubblePosition?: (pos: BubblePosition) => void;
  onChangePopupPosition?: (pos: PopupPosition) => void;
}

export function AppSettings({
  shortcut, onChangeShortcut,
  bubblePosition, popupPosition, onChangeBubblePosition, onChangePopupPosition,
}: AppSettingsProps) {
  const { isDark, t } = usePluginSettings();
  const [tab, setTab] = useState<SettingsTab>('general');
  const [settings, setSettings] = useState<AppSettingsData>(loadSettings);
  const [saved, setSaved] = useState(false);

  const handleChange = useCallback((patch: Partial<AppSettingsData>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [settings]);

  const handleReset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSettings(loadSettings());
  }, []);

  const tabLabel = (key: SettingsTab) => {
    switch (key) {
      case 'general': return t('settingsGeneral');
      case 'login': return t('settingsLogin');
      case 'payments': return t('settingsPayments');
      case 'tokens': return 'Tokens';
      case 'seo': return t('settingsSeo');
    }
  };

  const tabColor = (key: SettingsTab, active: boolean) => {
    if (!active) return isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700';
    switch (key) {
      case 'general': return isDark ? 'text-violet-300' : 'text-violet-600';
      case 'login': return isDark ? 'text-blue-300' : 'text-blue-600';
      case 'payments': return isDark ? 'text-emerald-300' : 'text-emerald-600';
      case 'tokens': return isDark ? 'text-pink-300' : 'text-pink-600';
      case 'seo': return isDark ? 'text-amber-300' : 'text-amber-600';
    }
  };

  const activeBarColor = (key: SettingsTab) => {
    switch (key) {
      case 'general': return isDark ? 'bg-violet-500' : 'bg-violet-600';
      case 'login': return isDark ? 'bg-blue-500' : 'bg-blue-600';
      case 'payments': return isDark ? 'bg-emerald-500' : 'bg-emerald-600';
      case 'tokens': return isDark ? 'bg-pink-500' : 'bg-pink-600';
      case 'seo': return isDark ? 'bg-amber-500' : 'bg-amber-600';
    }
  };

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', isDark ? 'bg-zinc-950' : 'bg-white')}>
      {/* Header */}
      <div className={cn(
        'flex items-center gap-2 px-4 py-3 border-b shrink-0',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        <div className={cn(
          'size-7 rounded-lg flex items-center justify-center',
          isDark ? 'bg-violet-600/20' : 'bg-violet-100',
        )}>
          <Settings className="size-4 text-violet-400" />
        </div>
        <div className="flex-1">
          <p className={cn('text-sm font-semibold', isDark ? 'text-zinc-100' : 'text-gray-900')}>
            {t('settingsLabel')}
          </p>
          <p className={cn('text-[10px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
            {settings.appName} &middot; :{settings.port}
          </p>
        </div>
      </div>

      {/* Inner tabs — icon top, text bottom */}
      <div className={cn(
        'flex border-b shrink-0 px-2 py-1.5 gap-1',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        {TABS.map(({ key, icon: Icon, color }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all relative group',
                active
                  ? isDark ? `bg-${color}-500/10 border border-${color}-500/20` : `bg-${color}-50 border border-${color}-200`
                  : isDark ? 'hover:bg-zinc-800/60 border border-transparent' : 'hover:bg-gray-50 border border-transparent',
              )}
            >
              <div className={cn(
                'size-8 rounded-lg flex items-center justify-center transition-all',
                active
                  ? `bg-${color}-500/20 shadow-sm`
                  : isDark ? 'bg-zinc-800/50 group-hover:bg-zinc-700/50' : 'bg-gray-100 group-hover:bg-gray-200/70',
              )}>
                <Icon className={cn('size-4 transition-colors', active ? tabColor(key, true) : isDark ? 'text-zinc-500' : 'text-gray-400')} />
              </div>
              <span className={cn(
                'text-[9px] font-semibold leading-none transition-colors',
                active ? tabColor(key, true) : isDark ? 'text-zinc-500' : 'text-gray-400',
              )}>
                {tabLabel(key)}
              </span>
              {active && (
                <div className={cn('absolute -bottom-1.5 left-1/4 right-1/4 h-0.5 rounded-full', activeBarColor(key))} />
              )}
            </button>
          );
        })}
      </div>

      {/* Info bar */}
      <div className={cn(
        'flex items-center gap-2 px-4 py-1.5 border-b text-[10px] shrink-0',
        isDark ? 'border-zinc-800/60 bg-zinc-900/40' : 'border-gray-100 bg-gray-50',
      )}>
        <span className={cn('font-mono', isDark ? 'text-zinc-500' : 'text-gray-400')}>
          :{settings.port}
        </span>
        <div className={cn('w-px h-3', isDark ? 'bg-zinc-800' : 'bg-gray-200')} />
        <div className="flex items-center gap-1">
          <Monitor className={cn('size-2.5', settings.frontendActive ? 'text-emerald-500' : isDark ? 'text-zinc-600' : 'text-gray-300')} />
          <div className={cn('size-1.5 rounded-full', settings.frontendActive ? 'bg-emerald-500' : isDark ? 'bg-zinc-600' : 'bg-gray-300')} />
        </div>
        <div className="flex items-center gap-1">
          <HardDrive className={cn('size-2.5', settings.backendActive ? 'text-emerald-500' : isDark ? 'text-zinc-600' : 'text-gray-300')} />
          <div className={cn('size-1.5 rounded-full', settings.backendActive ? 'bg-emerald-500' : isDark ? 'bg-zinc-600' : 'bg-gray-300')} />
        </div>
        <div className={cn('w-px h-3', isDark ? 'bg-zinc-800' : 'bg-gray-200')} />
        <span className={cn('truncate', isDark ? 'text-zinc-600' : 'text-gray-400')}>{settings.technology}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {tab === 'general' && <GeneralTab settings={settings} onChange={handleChange} isDark={isDark} t={t}
          shortcut={shortcut} onChangeShortcut={onChangeShortcut}
          bubblePosition={bubblePosition} popupPosition={popupPosition}
          onChangeBubblePosition={onChangeBubblePosition} onChangePopupPosition={onChangePopupPosition}
        />}
        {tab === 'login' && <LoginTab settings={settings} onChange={handleChange} isDark={isDark} t={t} />}
        {tab === 'payments' && <PaymentsTab settings={settings} onChange={handleChange} isDark={isDark} t={t} />}
        {tab === 'tokens' && <TokensTab isDark={isDark} t={t} />}
        {tab === 'seo' && <SeoTab settings={settings} onChange={handleChange} isDark={isDark} t={t} />}
      </div>

      {/* Footer actions */}
      <div className={cn(
        'flex items-center justify-between px-4 py-2.5 border-t shrink-0',
        isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-gray-200 bg-gray-50',
      )}>
        <button
          onClick={handleReset}
          className={cn(
            'flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors',
            isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
          )}
        >
          <RotateCcw className="size-3" />
          {t('settingsReset')}
        </button>
        <button
          onClick={handleSave}
          className={cn(
            'flex items-center gap-1.5 text-[11px] font-semibold px-4 py-1.5 rounded-lg transition-all',
            saved
              ? 'bg-emerald-600 text-white'
              : 'bg-violet-600 hover:bg-violet-500 text-white',
          )}
        >
          {saved ? (
            <>
              <Check className="size-3" />
              {t('settingsSaved')}
            </>
          ) : (
            <>
              <Check className="size-3" />
              {t('settingsSave')}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
