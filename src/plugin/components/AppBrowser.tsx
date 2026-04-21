import { useState, useEffect } from 'react';
import {
  Search, FolderOpen, Package, GitBranch, Globe, RefreshCw,
  Loader2, Terminal, FileCode, Box, ChevronRight, Layers,
  Star, Download, Users, TrendingUp, Sparkles, Shield,
  BarChart3, ShoppingCart, MessageCircle, Palette, Zap,
  Database, Layout, Cpu, Heart, Eye, ArrowLeft, Share2,
  Clock, Code2, Tag, ExternalLink, Info, CheckCircle2,
} from 'lucide-react';
import type { LocalApp } from '../types';
import { agentApi } from '../lib/api';
import { cn } from '../../app/components/ui/utils';
import { usePluginSettings } from '../PluginProvider';
import { TabLoader } from './TabLoader';

interface Props {
  onOpenApp?: (app: LocalApp) => void;
}

type MainTab = 'local' | 'community';
type Category = 'all' | 'dashboard' | 'ecommerce' | 'saas' | 'landing' | 'api' | 'cms' | 'ai' | 'social';

const frameworkColors: Record<string, { bg: string; text: string; border: string }> = {
  'Vite + React': { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' },
  'React': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  'Next.js': { bg: 'bg-white/10', text: 'text-white', border: 'border-white/20' },
  'Vue': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  'Nuxt': { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  'Express': { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  'Svelte': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  'Fastify': { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/20' },
  'Hono': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
};

const categories: { key: Category; icon: typeof Layout; label: string; color: string }[] = [
  { key: 'all', icon: Layers, label: 'Todo', color: 'sky' },
  { key: 'dashboard', icon: BarChart3, label: 'Dashboard', color: 'violet' },
  { key: 'ecommerce', icon: ShoppingCart, label: 'E-commerce', color: 'emerald' },
  { key: 'saas', icon: Zap, label: 'SaaS', color: 'amber' },
  { key: 'landing', icon: Layout, label: 'Landing', color: 'pink' },
  { key: 'api', icon: Database, label: 'API', color: 'cyan' },
  { key: 'cms', icon: FileCode, label: 'CMS', color: 'orange' },
  { key: 'ai', icon: Cpu, label: 'IA', color: 'purple' },
  { key: 'social', icon: MessageCircle, label: 'Social', color: 'blue' },
];

interface CommunityApp {
  id: string;
  name: string;
  author: string;
  description: string;
  category: Category;
  framework: string;
  stars: number;
  downloads: number;
  rating: number;
  tags: string[];
  featured?: boolean;
  verified?: boolean;
  image?: string;
}

const communityApps: CommunityApp[] = [
  { id: '1', name: 'AdminPro Dashboard', author: 'aythen', description: 'Panel de administración completo con gráficas, tablas y gestión de usuarios. Tema oscuro y claro.', category: 'dashboard', framework: 'Vite + React', stars: 2340, downloads: 12500, rating: 4.8, tags: ['tailwind', 'charts', 'auth'], featured: true, verified: true },
  { id: '2', name: 'ShopFlow', author: 'marketplace-dev', description: 'Tienda online con carrito, pasarela de pagos Stripe y panel de vendedor integrado.', category: 'ecommerce', framework: 'Next.js', stars: 1890, downloads: 8700, rating: 4.7, tags: ['stripe', 'cart', 'payments'], featured: true, verified: true },
  { id: '3', name: 'SaaSKit Pro', author: 'indie-stack', description: 'Boilerplate SaaS con auth, billing, emails transaccionales, roles y multi-tenancy.', category: 'saas', framework: 'Next.js', stars: 3100, downloads: 15200, rating: 4.9, tags: ['auth', 'billing', 'multi-tenant'], featured: true, verified: true },
  { id: '4', name: 'LandingCraft', author: 'ui-lab', description: 'Generador de landings con bloques drag & drop, animaciones y formularios.', category: 'landing', framework: 'Vite + React', stars: 980, downloads: 4300, rating: 4.5, tags: ['drag-drop', 'animations', 'forms'] },
  { id: '5', name: 'RestForge', author: 'api-masters', description: 'API REST scaffolding con validación Zod, Swagger automático y testing integrado.', category: 'api', framework: 'Express', stars: 1560, downloads: 6800, rating: 4.6, tags: ['zod', 'swagger', 'testing'], verified: true },
  { id: '6', name: 'ContentHub', author: 'cms-crew', description: 'CMS headless con editor visual, versionado, media library y webhooks.', category: 'cms', framework: 'Nuxt', stars: 720, downloads: 3100, rating: 4.3, tags: ['editor', 'media', 'webhooks'] },
  { id: '7', name: 'ChatGPT Clone', author: 'ai-builders', description: 'Interfaz de chat IA con streaming, historial, plugins y soporte multi-modelo.', category: 'ai', framework: 'Vite + React', stars: 4200, downloads: 22000, rating: 4.9, tags: ['openai', 'streaming', 'plugins'], featured: true, verified: true },
  { id: '8', name: 'SocialBee', author: 'social-labs', description: 'Red social con feed, stories, mensajes directos, notificaciones real-time y perfiles.', category: 'social', framework: 'React', stars: 1340, downloads: 5600, rating: 4.4, tags: ['feed', 'realtime', 'chat'] },
  { id: '9', name: 'FinTrack', author: 'fintech-io', description: 'Dashboard financiero con gráficas de inversiones, portfolio tracker y alertas.', category: 'dashboard', framework: 'Vite + React', stars: 870, downloads: 3900, rating: 4.5, tags: ['finance', 'charts', 'alerts'] },
  { id: '10', name: 'DevPortfolio', author: 'creative-dev', description: 'Portfolio para desarrolladores con blog MDX, proyectos y contacto. Minimalista.', category: 'landing', framework: 'Next.js', stars: 2100, downloads: 9800, rating: 4.7, tags: ['portfolio', 'mdx', 'blog'], verified: true },
  { id: '11', name: 'ImageGen Studio', author: 'ai-builders', description: 'Generación de imágenes con Stable Diffusion, galería, favoritos e historial.', category: 'ai', framework: 'Next.js', stars: 1800, downloads: 7400, rating: 4.6, tags: ['stable-diffusion', 'gallery', 'generation'] },
  { id: '12', name: 'FastAPI Starter', author: 'api-masters', description: 'Backend Python con FastAPI, SQLAlchemy, JWT auth y deploy Docker.', category: 'api', framework: 'Fastify', stars: 950, downloads: 4100, rating: 4.4, tags: ['python', 'docker', 'jwt'] },
  { id: '13', name: 'MegaStore', author: 'ecom-pro', description: 'Marketplace multi-vendor con panel admin, reseñas, inventario y reportes.', category: 'ecommerce', framework: 'Nuxt', stars: 1100, downloads: 5200, rating: 4.5, tags: ['marketplace', 'admin', 'reports'] },
  { id: '14', name: 'TeamSync', author: 'saas-studio', description: 'Gestión de proyectos con kanban, calendario, time tracking y chat de equipo.', category: 'saas', framework: 'Vite + React', stars: 1650, downloads: 7100, rating: 4.6, tags: ['kanban', 'calendar', 'tracking'], verified: true },
  { id: '15', name: 'BlogEngine', author: 'cms-crew', description: 'Blog con editor Markdown, comentarios, RSS, SEO automático y newsletter.', category: 'cms', framework: 'Next.js', stars: 1400, downloads: 6300, rating: 4.5, tags: ['markdown', 'seo', 'newsletter'] },
  { id: '16', name: 'LiveChat Widget', author: 'social-labs', description: 'Widget de chat en vivo para webs con panel de agente, bots y analytics.', category: 'social', framework: 'React', stars: 890, downloads: 3700, rating: 4.3, tags: ['widget', 'bots', 'analytics'] },
  { id: '17', name: 'NeonMetrics', author: 'dashcraft', description: 'Dashboard de métricas en tiempo real con WebSockets, gráficos D3 y exportación PDF.', category: 'dashboard', framework: 'Vite + React', stars: 1920, downloads: 8900, rating: 4.7, tags: ['d3', 'websockets', 'pdf'], verified: true },
  { id: '18', name: 'VintageShop', author: 'retro-dev', description: 'E-commerce retro con catálogo visual, filtros avanzados y checkout animado.', category: 'ecommerce', framework: 'Svelte', stars: 760, downloads: 3200, rating: 4.4, tags: ['retro', 'animations', 'filters'] },
  { id: '19', name: 'LaunchPad SaaS', author: 'rocketcode', description: 'Template SaaS con onboarding wizard, dashboards por rol y notificaciones push.', category: 'saas', framework: 'Next.js', stars: 2800, downloads: 13400, rating: 4.8, tags: ['onboarding', 'roles', 'push'], featured: true, verified: true },
  { id: '20', name: 'PixelPerfect', author: 'design-first', description: 'Landing page builder con componentes premium, parallax y optimización Core Web Vitals.', category: 'landing', framework: 'Vite + React', stars: 1430, downloads: 6100, rating: 4.6, tags: ['parallax', 'cwv', 'premium'] },
  { id: '21', name: 'GraphQL Forge', author: 'schema-labs', description: 'API GraphQL con schema-first, subscriptions, dataloaders y playground integrado.', category: 'api', framework: 'Express', stars: 2100, downloads: 9400, rating: 4.7, tags: ['graphql', 'subscriptions', 'schema'], verified: true },
  { id: '22', name: 'WikiForge', author: 'knowledge-dev', description: 'Wiki colaborativa con Markdown, búsqueda full-text, permisos y versionado de páginas.', category: 'cms', framework: 'Next.js', stars: 1150, downloads: 5000, rating: 4.5, tags: ['wiki', 'search', 'collaboration'] },
  { id: '23', name: 'VoiceAssistant AI', author: 'speech-tech', description: 'Asistente de voz con STT/TTS, comandos naturales, wake word y multi-idioma.', category: 'ai', framework: 'Vite + React', stars: 3400, downloads: 16800, rating: 4.8, tags: ['voice', 'stt', 'tts'], featured: true, verified: true },
  { id: '24', name: 'ThreadSpace', author: 'comm-labs', description: 'Foro moderno tipo Reddit con hilos, upvotes, moderación automática y perfiles.', category: 'social', framework: 'Next.js', stars: 1780, downloads: 7600, rating: 4.6, tags: ['forum', 'threads', 'moderation'] },
  { id: '25', name: 'CloudWatch Lite', author: 'infra-tools', description: 'Monitor de infraestructura con health checks, uptime, logs y alertas Slack/Discord.', category: 'dashboard', framework: 'Svelte', stars: 1340, downloads: 5800, rating: 4.5, tags: ['monitoring', 'health', 'alerts'] },
  { id: '26', name: 'FoodieCart', author: 'gastro-dev', description: 'Plataforma de delivery con menú interactivo, tracking en mapa y pagos in-app.', category: 'ecommerce', framework: 'React', stars: 2050, downloads: 9100, rating: 4.7, tags: ['delivery', 'maps', 'payments'], verified: true },
  { id: '27', name: 'InvoiceNinja', author: 'biztools-io', description: 'Sistema de facturación con plantillas, recurrentes, multi-moneda y reportes fiscales.', category: 'saas', framework: 'Vue', stars: 1560, downloads: 6700, rating: 4.6, tags: ['invoicing', 'templates', 'fiscal'] },
  { id: '28', name: 'StartupLaunch', author: 'founders-kit', description: 'Landing para startups con hero animado, pricing table, testimonios y CTA sticky.', category: 'landing', framework: 'Next.js', stars: 1870, downloads: 8200, rating: 4.7, tags: ['startup', 'pricing', 'testimonials'], verified: true },
  { id: '29', name: 'WebSocket Hub', author: 'realtime-dev', description: 'Servidor WebSocket escalable con rooms, auth, rate limiting y panel de monitoreo.', category: 'api', framework: 'Hono', stars: 1680, downloads: 7300, rating: 4.6, tags: ['websocket', 'rooms', 'scalable'] },
  { id: '30', name: 'DocuPress', author: 'docu-team', description: 'Generador de documentación técnica con search, versioning, i18n y dark mode.', category: 'cms', framework: 'Next.js', stars: 2400, downloads: 11200, rating: 4.8, tags: ['docs', 'versioning', 'i18n'], verified: true },
  { id: '31', name: 'CodePilot', author: 'dev-ai', description: 'IDE en el navegador con autocompletado IA, terminal, git integrado y colaboración.', category: 'ai', framework: 'Vite + React', stars: 5100, downloads: 28000, rating: 4.9, tags: ['ide', 'copilot', 'collaboration'], featured: true, verified: true },
  { id: '32', name: 'Streamify', author: 'media-labs', description: 'Plataforma de streaming con chat en vivo, donaciones, clips y panel de streamer.', category: 'social', framework: 'React', stars: 2200, downloads: 10500, rating: 4.7, tags: ['streaming', 'live', 'donations'] },
  { id: '33', name: 'DataViz Pro', author: 'chart-masters', description: 'Dashboards interactivos con 30+ tipos de gráficos, filtros dinámicos y exportación.', category: 'dashboard', framework: 'Vue', stars: 1890, downloads: 8400, rating: 4.7, tags: ['charts', 'interactive', 'export'] },
  { id: '34', name: 'AuctionHouse', author: 'bid-tech', description: 'Plataforma de subastas en tiempo real con pujas, countdown, notificaciones y escrow.', category: 'ecommerce', framework: 'Next.js', stars: 1340, downloads: 5900, rating: 4.5, tags: ['auction', 'realtime', 'escrow'] },
  { id: '35', name: 'HelpDesk Pro', author: 'support-kit', description: 'Sistema de tickets con SLA, prioridades, base de conocimiento y chat integrado.', category: 'saas', framework: 'Vite + React', stars: 1450, downloads: 6200, rating: 4.5, tags: ['tickets', 'sla', 'knowledge-base'] },
  { id: '36', name: 'Eventify', author: 'event-craft', description: 'Landing para eventos con countdown, agenda, speakers, registro y mapa del venue.', category: 'landing', framework: 'Svelte', stars: 1120, downloads: 4800, rating: 4.4, tags: ['events', 'countdown', 'registration'] },
  { id: '37', name: 'AuthShield', author: 'security-first', description: 'Servicio de autenticación OAuth2/OIDC con MFA, passkeys, session management.', category: 'api', framework: 'Express', stars: 3200, downloads: 14600, rating: 4.9, tags: ['oauth2', 'mfa', 'passkeys'], featured: true, verified: true },
  { id: '38', name: 'PageStudio', author: 'builder-team', description: 'Page builder visual WYSIWYG con componentes custom, temas y publicación one-click.', category: 'cms', framework: 'Vite + React', stars: 1670, downloads: 7200, rating: 4.6, tags: ['wysiwyg', 'builder', 'themes'] },
  { id: '39', name: 'TranslateAI', author: 'lingua-tech', description: 'Traductor IA con 120 idiomas, contexto semántico, glosarios custom y API REST.', category: 'ai', framework: 'Next.js', stars: 2600, downloads: 12100, rating: 4.8, tags: ['translation', 'nlp', 'multilingual'] },
  { id: '40', name: 'Clubhouse Clone', author: 'audio-social', description: 'Audio rooms con moderación, recording, schedule y perfiles con seguidores.', category: 'social', framework: 'React', stars: 1560, downloads: 6700, rating: 4.5, tags: ['audio', 'rooms', 'social'] },
  { id: '41', name: 'IoT Dashboard', author: 'iot-works', description: 'Panel IoT con telemetría en tiempo real, mapas de dispositivos y alertas MQTT.', category: 'dashboard', framework: 'Vite + React', stars: 1100, downloads: 4700, rating: 4.4, tags: ['iot', 'mqtt', 'telemetry'] },
  { id: '42', name: 'DropShip Pro', author: 'ecom-suite', description: 'Dropshipping automatizado con sincronización de productos, tracking y márgenes.', category: 'ecommerce', framework: 'Nuxt', stars: 1780, downloads: 7800, rating: 4.6, tags: ['dropshipping', 'sync', 'tracking'] },
  { id: '43', name: 'CRMLite', author: 'biz-tools', description: 'CRM ligero con pipeline visual, contactos, notas, tareas y email integrado.', category: 'saas', framework: 'Vue', stars: 2100, downloads: 9500, rating: 4.7, tags: ['crm', 'pipeline', 'contacts'], verified: true },
  { id: '44', name: 'AppShowcase', author: 'portfolio-dev', description: 'Landing para apps móviles con mockups 3D, features animadas y descarga directa.', category: 'landing', framework: 'Vite + React', stars: 1340, downloads: 5600, rating: 4.5, tags: ['app', '3d', 'mockups'] },
  { id: '45', name: 'CronMaster', author: 'scheduler-io', description: 'Gestor de cron jobs distribuido con retry, logs, dashboard y webhooks de estado.', category: 'api', framework: 'Fastify', stars: 1230, downloads: 5300, rating: 4.5, tags: ['cron', 'scheduler', 'distributed'] },
  { id: '46', name: 'NewsPress', author: 'media-cms', description: 'CMS para medios con editor columnar, galería multimedia, SEO y AMP automático.', category: 'cms', framework: 'Nuxt', stars: 980, downloads: 4200, rating: 4.3, tags: ['news', 'amp', 'multimedia'] },
  { id: '47', name: 'ResumeAI', author: 'career-tech', description: 'Generador de CVs con IA que optimiza para ATS, múltiples plantillas y export PDF.', category: 'ai', framework: 'Vite + React', stars: 3800, downloads: 19500, rating: 4.8, tags: ['resume', 'ats', 'pdf'], verified: true },
  { id: '48', name: 'DiscordUI', author: 'chat-builders', description: 'Clon de Discord con servidores, canales, roles, bots y videollamadas WebRTC.', category: 'social', framework: 'Next.js', stars: 4500, downloads: 24000, rating: 4.9, tags: ['discord', 'webrtc', 'bots'], featured: true, verified: true },
  { id: '49', name: 'ServerPulse', author: 'devops-ui', description: 'Dashboard DevOps con status de servicios, métricas Docker, logs y deploy history.', category: 'dashboard', framework: 'Svelte', stars: 1560, downloads: 6900, rating: 4.6, tags: ['devops', 'docker', 'logs'] },
  { id: '50', name: 'TicketBooth', author: 'events-io', description: 'Venta de entradas online con selección de asientos, QR codes y check-in app.', category: 'ecommerce', framework: 'Next.js', stars: 1200, downloads: 5100, rating: 4.4, tags: ['tickets', 'qr', 'events'] },
  { id: '51', name: 'FormBuilder Pro', author: 'form-craft', description: 'Constructor de formularios drag & drop con lógica condicional, validación y analytics.', category: 'saas', framework: 'Vite + React', stars: 2400, downloads: 11000, rating: 4.8, tags: ['forms', 'drag-drop', 'analytics'], verified: true },
  { id: '52', name: 'CryptoLanding', author: 'web3-ui', description: 'Landing Web3 con wallet connect, tokenomics, roadmap interactivo y whitepaper.', category: 'landing', framework: 'React', stars: 1680, downloads: 7200, rating: 4.5, tags: ['crypto', 'web3', 'wallet'] },
  { id: '53', name: 'FileVault API', author: 'storage-dev', description: 'API de almacenamiento con upload chunked, thumbnails, CDN y permisos granulares.', category: 'api', framework: 'Hono', stars: 1890, downloads: 8300, rating: 4.7, tags: ['storage', 'upload', 'cdn'], verified: true },
  { id: '54', name: 'RecipeBox', author: 'food-cms', description: 'CMS de recetas con ingredientes, pasos interactivos, nutrición y búsqueda por dieta.', category: 'cms', framework: 'Nuxt', stars: 890, downloads: 3800, rating: 4.3, tags: ['recipes', 'nutrition', 'search'] },
  { id: '55', name: 'MusicGen AI', author: 'audio-ai', description: 'Generación de música con IA, loops, samples, mezcla por capas y export WAV/MP3.', category: 'ai', framework: 'Vite + React', stars: 2900, downloads: 14200, rating: 4.7, tags: ['music', 'generation', 'audio'] },
  { id: '56', name: 'PetSocial', author: 'animal-dev', description: 'Red social para mascotas con perfiles, fotos, veterinarios cercanos y adopción.', category: 'social', framework: 'React', stars: 950, downloads: 4100, rating: 4.3, tags: ['pets', 'photos', 'adoption'] },
  { id: '57', name: 'SalesForce Lite', author: 'crm-open', description: 'Dashboard de ventas con pipeline, forecasting, KPIs y reportes automáticos.', category: 'dashboard', framework: 'Next.js', stars: 1670, downloads: 7400, rating: 4.6, tags: ['sales', 'kpi', 'forecasting'] },
  { id: '58', name: 'PrintOnDemand', author: 'merch-lab', description: 'Tienda print-on-demand con diseñador de productos, mockups y fulfillment API.', category: 'ecommerce', framework: 'Vite + React', stars: 1340, downloads: 5800, rating: 4.5, tags: ['print', 'mockups', 'fulfillment'] },
  { id: '59', name: 'EmailCamp', author: 'mail-pro', description: 'Plataforma de email marketing con templates, segmentación, A/B testing y analytics.', category: 'saas', framework: 'Next.js', stars: 1890, downloads: 8600, rating: 4.7, tags: ['email', 'marketing', 'ab-testing'], verified: true },
  { id: '60', name: 'SaaSLanding Kit', author: 'conversion-lab', description: 'Landing optimizada para conversión con hero, features grid, FAQ y pricing toggle.', category: 'landing', framework: 'Next.js', stars: 2300, downloads: 10700, rating: 4.8, tags: ['conversion', 'pricing', 'faq'], verified: true },
  { id: '61', name: 'PaymentGate', author: 'fintech-api', description: 'Gateway de pagos unificado con Stripe, PayPal, crypto y webhooks de estado.', category: 'api', framework: 'Express', stars: 2700, downloads: 12800, rating: 4.8, tags: ['payments', 'stripe', 'paypal'], verified: true },
  { id: '62', name: 'PortfolioCMS', author: 'artist-dev', description: 'CMS para artistas y fotógrafos con galerías masonry, lightbox y cliente portal.', category: 'cms', framework: 'Svelte', stars: 780, downloads: 3300, rating: 4.2, tags: ['portfolio', 'gallery', 'lightbox'] },
  { id: '63', name: 'SentimentScope', author: 'nlp-studio', description: 'Análisis de sentimiento en tiempo real de redes sociales con gráficos y alertas.', category: 'ai', framework: 'Vue', stars: 1450, downloads: 6300, rating: 4.5, tags: ['sentiment', 'nlp', 'social-media'] },
  { id: '64', name: 'GamerHub', author: 'gaming-social', description: 'Red social gaming con perfiles, clanes, torneos, matchmaking y stats tracker.', category: 'social', framework: 'Next.js', stars: 2800, downloads: 13500, rating: 4.7, tags: ['gaming', 'tournaments', 'stats'] },
  { id: '65', name: 'HealthDash', author: 'medtech-ui', description: 'Dashboard médico con historial clínico, citas, recetas y gráficos de salud.', category: 'dashboard', framework: 'React', stars: 1230, downloads: 5400, rating: 4.5, tags: ['health', 'medical', 'appointments'] },
  { id: '66', name: 'BookStore Pro', author: 'literary-dev', description: 'Librería online con reseñas, listas de lectura, recomendaciones IA y ebooks.', category: 'ecommerce', framework: 'Nuxt', stars: 1100, downloads: 4800, rating: 4.4, tags: ['books', 'reviews', 'ebooks'] },
  { id: '67', name: 'ScheduleWise', author: 'time-tools', description: 'Planificador de citas con calendario embebido, Zoom integration y reminders SMS.', category: 'saas', framework: 'Vite + React', stars: 1780, downloads: 7800, rating: 4.6, tags: ['scheduling', 'zoom', 'sms'] },
  { id: '68', name: 'NFT Gallery', author: 'web3-art', description: 'Landing NFT con galería 3D, wallet connect, minting y countdown del drop.', category: 'landing', framework: 'React', stars: 1450, downloads: 6200, rating: 4.4, tags: ['nft', '3d', 'minting'] },
  { id: '69', name: 'NotificationAPI', author: 'notify-hub', description: 'Servicio de notificaciones multi-canal: push, email, SMS, Slack con templates.', category: 'api', framework: 'Fastify', stars: 2100, downloads: 9600, rating: 4.7, tags: ['notifications', 'multi-channel', 'templates'], verified: true },
  { id: '70', name: 'LearningLMS', author: 'edu-platform', description: 'LMS con cursos, quizzes, certificados, progreso de alumnos y pagos.', category: 'cms', framework: 'Next.js', stars: 2500, downloads: 11800, rating: 4.8, tags: ['lms', 'courses', 'certificates'], verified: true },
  { id: '71', name: 'DeepSearch', author: 'search-ai', description: 'Motor de búsqueda semántica con embeddings, RAG, filtros y ranking inteligente.', category: 'ai', framework: 'Vite + React', stars: 3100, downloads: 15000, rating: 4.8, tags: ['search', 'rag', 'embeddings'], featured: true },
  { id: '72', name: 'DateConnect', author: 'social-match', description: 'App de citas con matching IA, chat cifrado, verificación foto y videollamadas.', category: 'social', framework: 'React', stars: 1670, downloads: 7200, rating: 4.4, tags: ['dating', 'matching', 'video'] },
  { id: '73', name: 'EnergyMonitor', author: 'green-tech', description: 'Dashboard de consumo energético con predicciones IA, alertas y comparativas.', category: 'dashboard', framework: 'Vue', stars: 890, downloads: 3800, rating: 4.3, tags: ['energy', 'predictions', 'green'] },
  { id: '74', name: 'FashionStore', author: 'style-dev', description: 'Tienda de moda con look builder, probador virtual AR y recomendaciones IA.', category: 'ecommerce', framework: 'Next.js', stars: 2200, downloads: 10300, rating: 4.7, tags: ['fashion', 'ar', 'recommendations'], verified: true },
  { id: '75', name: 'SurveyMonkey Lite', author: 'feedback-io', description: 'Encuestas con lógica de salto, templates, analytics avanzados y exportación.', category: 'saas', framework: 'Vue', stars: 1340, downloads: 5800, rating: 4.5, tags: ['surveys', 'analytics', 'templates'] },
  { id: '76', name: 'AgencyPro', author: 'agency-kit', description: 'Landing para agencias con portfolio carousel, equipo, servicios y blog.', category: 'landing', framework: 'Nuxt', stars: 1560, downloads: 6700, rating: 4.6, tags: ['agency', 'carousel', 'services'] },
  { id: '77', name: 'SearchEngine API', author: 'index-tech', description: 'API de búsqueda full-text con Elasticsearch, facets, suggest y geo-search.', category: 'api', framework: 'Express', stars: 1780, downloads: 7800, rating: 4.6, tags: ['elasticsearch', 'facets', 'geo'] },
  { id: '78', name: 'PodcastCMS', author: 'audio-content', description: 'CMS para podcasts con RSS feed, player embebido, transcripciones y analytics.', category: 'cms', framework: 'Next.js', stars: 1120, downloads: 4900, rating: 4.4, tags: ['podcast', 'rss', 'transcription'] },
  { id: '79', name: 'WriterBot', author: 'content-ai', description: 'Asistente de escritura IA con corrección, reescritura, tone control y SEO tips.', category: 'ai', framework: 'Vite + React', stars: 2800, downloads: 13200, rating: 4.7, tags: ['writing', 'correction', 'seo'] },
  { id: '80', name: 'NeighborApp', author: 'local-dev', description: 'Red social de barrio con avisos, marketplace local, eventos y grupos vecinales.', category: 'social', framework: 'Nuxt', stars: 780, downloads: 3400, rating: 4.2, tags: ['neighborhood', 'local', 'events'] },
  { id: '81', name: 'CryptoTracker', author: 'blockchain-ui', description: 'Dashboard crypto con precios en vivo, portfolio, alertas y gráficos de velas.', category: 'dashboard', framework: 'Vite + React', stars: 2400, downloads: 11500, rating: 4.7, tags: ['crypto', 'portfolio', 'candlestick'], verified: true },
  { id: '82', name: 'GroceryGo', author: 'fresh-dev', description: 'Supermercado online con listas inteligentes, delivery slots y recetas sugeridas.', category: 'ecommerce', framework: 'React', stars: 1230, downloads: 5300, rating: 4.5, tags: ['grocery', 'delivery', 'recipes'] },
  { id: '83', name: 'SignaturePad', author: 'legal-tools', description: 'Firma digital de documentos con templates, workflow de aprobación y audit trail.', category: 'saas', framework: 'Vite + React', stars: 1560, downloads: 6800, rating: 4.6, tags: ['signature', 'documents', 'audit'] },
  { id: '84', name: 'RestaurantPage', author: 'food-landing', description: 'Landing para restaurantes con menú visual, reservas, galería y Google Maps.', category: 'landing', framework: 'Svelte', stars: 890, downloads: 3900, rating: 4.3, tags: ['restaurant', 'reservations', 'menu'] },
  { id: '85', name: 'QueueService', author: 'infra-api', description: 'Cola de mensajes HTTP con retry exponencial, dead letters, prioridades y dashboard.', category: 'api', framework: 'Hono', stars: 1450, downloads: 6300, rating: 4.5, tags: ['queue', 'messages', 'retry'] },
  { id: '86', name: 'MultiLingualCMS', author: 'i18n-experts', description: 'CMS con i18n nativo, traducción automática, workflows de revisión y CDN global.', category: 'cms', framework: 'Nuxt', stars: 1340, downloads: 5800, rating: 4.5, tags: ['i18n', 'translation', 'global'] },
  { id: '87', name: 'FaceSwap Studio', author: 'visual-ai', description: 'Herramienta de face swap con IA, editor de resultados, batch processing y API.', category: 'ai', framework: 'React', stars: 2100, downloads: 10200, rating: 4.5, tags: ['face-swap', 'editing', 'batch'] },
  { id: '88', name: 'StudyBuddy', author: 'edu-social', description: 'Plataforma de estudio con grupos, flashcards compartidas, pomodoro y rankings.', category: 'social', framework: 'Vite + React', stars: 1670, downloads: 7400, rating: 4.6, tags: ['study', 'flashcards', 'pomodoro'] },
  { id: '89', name: 'HRDashboard', author: 'people-ops', description: 'Panel de RRHH con organigrama, nóminas, vacaciones, evaluaciones y analytics.', category: 'dashboard', framework: 'Next.js', stars: 1890, downloads: 8500, rating: 4.7, tags: ['hr', 'payroll', 'analytics'], verified: true },
  { id: '90', name: 'SubscriptionBox', author: 'box-commerce', description: 'Plataforma de suscripciones con boxes customizables, billing y logística.', category: 'ecommerce', framework: 'Next.js', stars: 1120, downloads: 4800, rating: 4.4, tags: ['subscription', 'boxes', 'billing'] },
  { id: '91', name: 'ContractHub', author: 'legal-saas', description: 'Gestión de contratos con templates, firma electrónica, vencimientos y alertas.', category: 'saas', framework: 'Vue', stars: 1340, downloads: 5900, rating: 4.5, tags: ['contracts', 'legal', 'alerts'] },
  { id: '92', name: 'ProductHunt Clone', author: 'launch-ui', description: 'Landing tipo Product Hunt con votaciones, comentarios, lanzamientos y rankings.', category: 'landing', framework: 'Next.js', stars: 2100, downloads: 9800, rating: 4.7, tags: ['product-hunt', 'launches', 'voting'] },
  { id: '93', name: 'FeatureFlagAPI', author: 'toggle-dev', description: 'API de feature flags con targeting, gradual rollouts, A/B tests y SDK.', category: 'api', framework: 'Fastify', stars: 1670, downloads: 7300, rating: 4.6, tags: ['feature-flags', 'rollouts', 'sdk'] },
  { id: '94', name: 'EventCMS', author: 'events-content', description: 'CMS para conferencias con agenda, speakers, sponsors, tickets y streaming.', category: 'cms', framework: 'Vite + React', stars: 1010, downloads: 4400, rating: 4.4, tags: ['events', 'speakers', 'streaming'] },
  { id: '95', name: 'DataLabelAI', author: 'ml-tools', description: 'Plataforma de etiquetado de datos para ML con bounding boxes, NER y QA.', category: 'ai', framework: 'Vite + React', stars: 1780, downloads: 7800, rating: 4.6, tags: ['labeling', 'ml', 'annotation'] },
  { id: '96', name: 'FitConnect', author: 'health-social', description: 'Red social fitness con retos, rutinas compartidas, progreso y leaderboards.', category: 'social', framework: 'React', stars: 1450, downloads: 6200, rating: 4.5, tags: ['fitness', 'challenges', 'leaderboard'] },
  { id: '97', name: 'WarehouseDash', author: 'logistics-ui', description: 'Dashboard de almacén con inventario, ubicaciones, picking lists y reportes.', category: 'dashboard', framework: 'Vue', stars: 780, downloads: 3400, rating: 4.2, tags: ['warehouse', 'inventory', 'logistics'] },
  { id: '98', name: 'ArtMarket', author: 'creative-shop', description: 'Marketplace de arte digital con licencias, preview watermark y pagos seguros.', category: 'ecommerce', framework: 'Svelte', stars: 1010, downloads: 4400, rating: 4.4, tags: ['art', 'digital', 'licenses'] },
  { id: '99', name: 'OKRTracker', author: 'goals-io', description: 'Seguimiento de OKRs con alineación de equipo, check-ins y dashboards de progreso.', category: 'saas', framework: 'Vite + React', stars: 1120, downloads: 4900, rating: 4.4, tags: ['okr', 'goals', 'alignment'] },
  { id: '100', name: 'MinimalFolio', author: 'minimal-ui', description: 'Portfolio ultra minimalista con tipografía elegante, smooth scroll y case studies.', category: 'landing', framework: 'Svelte', stars: 2600, downloads: 12000, rating: 4.8, tags: ['minimal', 'typography', 'smooth-scroll'], verified: true },
  { id: '101', name: 'GeoAPI', author: 'location-dev', description: 'API de geolocalización con geocoding, rutas, isócronas y mapas estáticos.', category: 'api', framework: 'Express', stars: 1340, downloads: 5800, rating: 4.5, tags: ['geo', 'routing', 'maps'] },
  { id: '102', name: 'HeadlessBlog', author: 'jamstack-dev', description: 'Blog headless con MDX, ISR, comentarios y newsletter Buttondown integrada.', category: 'cms', framework: 'Next.js', stars: 1560, downloads: 6700, rating: 4.6, tags: ['headless', 'mdx', 'isr'] },
  { id: '103', name: 'AutomateFlow', author: 'workflow-ai', description: 'Automatización visual tipo Zapier con nodos IA, webhooks y 200+ integraciones.', category: 'ai', framework: 'Vite + React', stars: 3600, downloads: 17500, rating: 4.8, tags: ['automation', 'workflow', 'integrations'], featured: true, verified: true },
  { id: '104', name: 'MusicSocial', author: 'sound-labs', description: 'Red social musical con playlists colaborativas, reviews y discover semanal.', category: 'social', framework: 'Next.js', stars: 1230, downloads: 5300, rating: 4.4, tags: ['music', 'playlists', 'reviews'] },
  { id: '105', name: 'LogAnalyzer', author: 'observability-io', description: 'Dashboard de análisis de logs con patrones, anomalías, alertas y drill-down.', category: 'dashboard', framework: 'Vite + React', stars: 1450, downloads: 6300, rating: 4.5, tags: ['logs', 'anomalies', 'observability'] },
  { id: '106', name: 'WineStore', author: 'sommelier-dev', description: 'Tienda de vinos con cata virtual, maridajes sugeridos y suscripción mensual.', category: 'ecommerce', framework: 'Nuxt', stars: 890, downloads: 3900, rating: 4.3, tags: ['wine', 'tasting', 'subscription'] },
  { id: '107', name: 'BudgetApp', author: 'money-tools', description: 'Gestión de presupuestos con categorías, reglas automáticas y gráficos de gastos.', category: 'saas', framework: 'Vite + React', stars: 1670, downloads: 7300, rating: 4.6, tags: ['budget', 'expenses', 'categories'] },
  { id: '108', name: 'GymLanding', author: 'fitness-ui', description: 'Landing para gimnasios con horarios, clases, trainers y suscripción online.', category: 'landing', framework: 'React', stars: 780, downloads: 3400, rating: 4.2, tags: ['gym', 'classes', 'trainers'] },
  { id: '109', name: 'RateLimiter Pro', author: 'api-shield', description: 'Rate limiting distribuido con Redis, sliding window, IP whitelist y dashboard.', category: 'api', framework: 'Hono', stars: 1560, downloads: 6800, rating: 4.6, tags: ['rate-limit', 'redis', 'distributed'] },
  { id: '110', name: 'KnowledgeBase', author: 'help-docs', description: 'Base de conocimiento con búsqueda inteligente, categorías y feedback de artículos.', category: 'cms', framework: 'Next.js', stars: 1120, downloads: 4800, rating: 4.4, tags: ['knowledge', 'search', 'feedback'] },
  { id: '111', name: 'VideoEditor AI', author: 'edit-ai', description: 'Editor de video en navegador con cortes IA, subtítulos automáticos y templates.', category: 'ai', framework: 'Vite + React', stars: 4100, downloads: 21000, rating: 4.9, tags: ['video', 'editor', 'subtitles'], featured: true, verified: true },
  { id: '112', name: 'TravelBuddy', author: 'travel-social', description: 'Red social de viajes con itinerarios, spots, fotos geolocalizadas y tips.', category: 'social', framework: 'React', stars: 1890, downloads: 8400, rating: 4.6, tags: ['travel', 'itinerary', 'geo'] },
  { id: '113', name: 'ProjectBoard', author: 'pm-tools', description: 'Dashboard de gestión de proyectos con Gantt, dependencias y burndown charts.', category: 'dashboard', framework: 'Next.js', stars: 2100, downloads: 9600, rating: 4.7, tags: ['gantt', 'burndown', 'project'], verified: true },
  { id: '114', name: 'PlantShop', author: 'green-ecom', description: 'Tienda de plantas con guías de cuidado, filtro por luz/espacio y suscripción.', category: 'ecommerce', framework: 'Svelte', stars: 950, downloads: 4200, rating: 4.4, tags: ['plants', 'guides', 'subscription'] },
  { id: '115', name: 'WhiteboardPro', author: 'collab-tools', description: 'Pizarra colaborativa con dibujo libre, sticky notes, voting y export de frames.', category: 'saas', framework: 'Vite + React', stars: 2400, downloads: 11200, rating: 4.8, tags: ['whiteboard', 'collaboration', 'drawing'], verified: true },
  { id: '116', name: 'CoachLanding', author: 'coaching-ui', description: 'Landing para coaches con booking, testimonios en video y programa de sesiones.', category: 'landing', framework: 'Nuxt', stars: 670, downloads: 2900, rating: 4.1, tags: ['coaching', 'booking', 'video'] },
  { id: '117', name: 'MediaProxy', author: 'cdn-tools', description: 'API de procesamiento de imágenes con resize, crop, watermark y cache CDN.', category: 'api', framework: 'Fastify', stars: 1780, downloads: 7800, rating: 4.6, tags: ['images', 'resize', 'cdn'] },
  { id: '118', name: 'ComicCMS', author: 'webtoon-dev', description: 'CMS para webcomics con reader vertical, capítulos, suscripción y comentarios.', category: 'cms', framework: 'Nuxt', stars: 870, downloads: 3700, rating: 4.3, tags: ['comics', 'reader', 'chapters'] },
  { id: '119', name: 'PromptLibrary', author: 'prompt-eng', description: 'Biblioteca de prompts con ratings, categorías, variables y playground de testing.', category: 'ai', framework: 'Next.js', stars: 2200, downloads: 10500, rating: 4.7, tags: ['prompts', 'playground', 'testing'] },
  { id: '120', name: 'AlumniNet', author: 'university-dev', description: 'Red de alumni con directorio, eventos, mentorías y ofertas de trabajo.', category: 'social', framework: 'Vue', stars: 890, downloads: 3900, rating: 4.3, tags: ['alumni', 'mentoring', 'jobs'] },
  { id: '121', name: 'AnalyticsDash', author: 'metrics-pro', description: 'Dashboard de analytics web con funnel, heatmaps, sesiones y comparativas.', category: 'dashboard', framework: 'Vite + React', stars: 2700, downloads: 12800, rating: 4.8, tags: ['analytics', 'heatmaps', 'funnel'], verified: true },
  { id: '122', name: 'HandmadeCraft', author: 'artisan-shop', description: 'Marketplace de artesanías con perfiles de artesanos, custom orders y reviews.', category: 'ecommerce', framework: 'Next.js', stars: 1010, downloads: 4400, rating: 4.4, tags: ['handmade', 'artisan', 'custom'] },
  { id: '123', name: 'TimeSheet Pro', author: 'time-tracker', description: 'Control de horas con proyectos, clientes, reportes y facturación automática.', category: 'saas', framework: 'Vue', stars: 1230, downloads: 5300, rating: 4.5, tags: ['timesheet', 'billing', 'reports'] },
  { id: '124', name: 'PhotoLanding', author: 'photo-ui', description: 'Landing para fotógrafos con galería fullscreen, booking y portfolio filtrable.', category: 'landing', framework: 'Vite + React', stars: 1560, downloads: 6700, rating: 4.6, tags: ['photography', 'fullscreen', 'booking'] },
  { id: '125', name: 'EmailAPI Pro', author: 'mail-infra', description: 'API transaccional de emails con templates Handlebars, tracking y bounce handling.', category: 'api', framework: 'Express', stars: 2300, downloads: 10800, rating: 4.8, tags: ['email', 'transactional', 'tracking'], verified: true },
  { id: '126', name: 'PropertyCMS', author: 'realestate-dev', description: 'CMS inmobiliario con listados, mapas, filtros avanzados y tours virtuales 360.', category: 'cms', framework: 'Next.js', stars: 1450, downloads: 6300, rating: 4.5, tags: ['realestate', '360', 'maps'] },
  { id: '127', name: 'OCR Scanner', author: 'doc-ai', description: 'Escáner OCR con IA para documentos, extracción de datos estructurados y validación.', category: 'ai', framework: 'Vite + React', stars: 1890, downloads: 8600, rating: 4.6, tags: ['ocr', 'documents', 'extraction'] },
  { id: '128', name: 'BookClub', author: 'readers-social', description: 'Club de lectura social con discusiones por capítulo, retos y recomendaciones.', category: 'social', framework: 'Svelte', stars: 780, downloads: 3400, rating: 4.2, tags: ['books', 'discussions', 'challenges'] },
  { id: '129', name: 'FleetTracker', author: 'transport-ui', description: 'Dashboard de flota vehicular con GPS en vivo, rutas, mantenimientos y combustible.', category: 'dashboard', framework: 'React', stars: 1120, downloads: 4900, rating: 4.4, tags: ['fleet', 'gps', 'tracking'] },
  { id: '130', name: 'CourseMarket', author: 'edu-shop', description: 'Marketplace de cursos online con preview, ratings, certificados y afiliados.', category: 'ecommerce', framework: 'Next.js', stars: 2100, downloads: 9700, rating: 4.7, tags: ['courses', 'marketplace', 'certificates'], verified: true },
  { id: '131', name: 'InventoryPro', author: 'stock-saas', description: 'Control de inventario con códigos de barras, stock mínimo, proveedores y pedidos.', category: 'saas', framework: 'Vite + React', stars: 1340, downloads: 5800, rating: 4.5, tags: ['inventory', 'barcode', 'suppliers'] },
  { id: '132', name: 'ConferenceLanding', author: 'event-ui', description: 'Landing para conferencias tech con schedule, speakers carousel y early-bird.', category: 'landing', framework: 'Next.js', stars: 1230, downloads: 5300, rating: 4.5, tags: ['conference', 'schedule', 'early-bird'] },
  { id: '133', name: 'TaskQueue API', author: 'async-dev', description: 'Cola de tareas asíncrona con workers, prioridades, retry y resultados con TTL.', category: 'api', framework: 'Hono', stars: 1450, downloads: 6300, rating: 4.5, tags: ['tasks', 'async', 'workers'] },
  { id: '134', name: 'ChangelogCMS', author: 'release-team', description: 'CMS de changelogs con timeline, categorías, suscripciones y widget embebible.', category: 'cms', framework: 'Svelte', stars: 670, downloads: 2900, rating: 4.1, tags: ['changelog', 'timeline', 'widget'] },
  { id: '135', name: 'ChatBot Builder', author: 'bot-studio', description: 'Constructor visual de chatbots con flujos, intents, NLU y analytics de conversación.', category: 'ai', framework: 'Vite + React', stars: 2700, downloads: 12800, rating: 4.8, tags: ['chatbot', 'nlu', 'visual-builder'], verified: true },
  { id: '136', name: 'DevConnect', author: 'coder-social', description: 'Red social para devs con code snippets, pair programming y job board.', category: 'social', framework: 'Next.js', stars: 3400, downloads: 16500, rating: 4.8, tags: ['developers', 'snippets', 'jobs'], verified: true },
  { id: '137', name: 'SEODashboard', author: 'seo-tools', description: 'Dashboard SEO con rankings, backlinks, auditorías técnicas y sugerencias IA.', category: 'dashboard', framework: 'Vite + React', stars: 1670, downloads: 7400, rating: 4.6, tags: ['seo', 'rankings', 'audit'] },
  { id: '138', name: 'PetStore', author: 'animal-shop', description: 'Tienda de mascotas con productos, vet marketplace, delivery express y suscripción.', category: 'ecommerce', framework: 'Vue', stars: 870, downloads: 3800, rating: 4.3, tags: ['pets', 'delivery', 'subscription'] },
  { id: '139', name: 'ExpenseTracker', author: 'finance-saas', description: 'Gestión de gastos empresariales con OCR de recibos, aprobaciones y reportes.', category: 'saas', framework: 'Next.js', stars: 1890, downloads: 8500, rating: 4.7, tags: ['expenses', 'ocr', 'approvals'], verified: true },
  { id: '140', name: 'ArchitectFolio', author: 'arch-studio', description: 'Portfolio para arquitectos con renders 3D, planos interactivos y timeline.', category: 'landing', framework: 'Vite + React', stars: 1120, downloads: 4800, rating: 4.4, tags: ['architecture', '3d', 'renders'] },
  { id: '141', name: 'WebhookRelay', author: 'hook-infra', description: 'Relay de webhooks con transformaciones, retry, logs y debugging en tiempo real.', category: 'api', framework: 'Fastify', stars: 1340, downloads: 5800, rating: 4.5, tags: ['webhooks', 'relay', 'debugging'] },
  { id: '142', name: 'MenuBuilder', author: 'restaurant-cms', description: 'CMS de menús para restaurantes con QR, alérgenos, precios y diseño visual.', category: 'cms', framework: 'Vue', stars: 780, downloads: 3400, rating: 4.2, tags: ['menu', 'qr', 'restaurant'] },
  { id: '143', name: 'AnomalyDetect', author: 'security-ai', description: 'Detección de anomalías en tiempo real con ML, dashboards y alertas automáticas.', category: 'ai', framework: 'Vite + React', stars: 1560, downloads: 6800, rating: 4.6, tags: ['anomaly', 'ml', 'security'] },
  { id: '144', name: 'VolunteerHub', author: 'ngo-social', description: 'Plataforma de voluntariado con matching, eventos, horas y certificaciones.', category: 'social', framework: 'Nuxt', stars: 670, downloads: 2900, rating: 4.1, tags: ['volunteer', 'ngo', 'matching'] },
  { id: '145', name: 'RealTimeDash', author: 'stream-ui', description: 'Dashboard con datos en streaming via SSE, gráficos animados y alertas push.', category: 'dashboard', framework: 'Svelte', stars: 1780, downloads: 7800, rating: 4.6, tags: ['realtime', 'sse', 'streaming'] },
  { id: '146', name: 'AutoParts', author: 'motor-ecom', description: 'Tienda de recambios de coches con buscador por modelo, compatibilidad y envío.', category: 'ecommerce', framework: 'Next.js', stars: 1010, downloads: 4400, rating: 4.4, tags: ['auto', 'parts', 'compatibility'] },
  { id: '147', name: 'HabitTracker', author: 'wellness-saas', description: 'Tracker de hábitos con streaks, analytics, recordatorios y gamificación.', category: 'saas', framework: 'Vite + React', stars: 2200, downloads: 10300, rating: 4.7, tags: ['habits', 'streaks', 'gamification'], verified: true },
  { id: '148', name: 'MusicianPage', author: 'band-landing', description: 'Landing para músicos con bio, discografía, tour dates, merch y Spotify embed.', category: 'landing', framework: 'React', stars: 890, downloads: 3900, rating: 4.3, tags: ['music', 'tour', 'spotify'] },
  { id: '149', name: 'APIGateway', author: 'gateway-pro', description: 'API Gateway con routing, auth middleware, rate limiting y request transformation.', category: 'api', framework: 'Express', stars: 2400, downloads: 11200, rating: 4.8, tags: ['gateway', 'routing', 'middleware'], verified: true },
  { id: '150', name: 'RecipeCMS Pro', author: 'chef-digital', description: 'CMS de recetas premium con video steps, shopping list y meal planner semanal.', category: 'cms', framework: 'Next.js', stars: 1230, downloads: 5300, rating: 4.5, tags: ['recipes', 'video', 'meal-plan'] },
  { id: '151', name: 'DreamInterpreter', author: 'mind-ai', description: 'Interpretación de sueños con IA, diario de sueños, patrones y comunidad.', category: 'ai', framework: 'React', stars: 1120, downloads: 4800, rating: 4.3, tags: ['dreams', 'journal', 'patterns'] },
  { id: '152', name: 'ParentConnect', author: 'family-social', description: 'Red social para padres con consejos, marketplace de segunda mano y actividades.', category: 'social', framework: 'Vue', stars: 890, downloads: 3900, rating: 4.3, tags: ['parenting', 'marketplace', 'activities'] },
  { id: '153', name: 'SchoolDash', author: 'edu-admin', description: 'Dashboard escolar con asistencia, calificaciones, comunicaciones y calendarios.', category: 'dashboard', framework: 'Next.js', stars: 1340, downloads: 5800, rating: 4.5, tags: ['school', 'grades', 'attendance'] },
  { id: '154', name: 'LuxuryWatch', author: 'prestige-ecom', description: 'Tienda de relojes de lujo con zoom HD, comparador, historial de precios y auth.', category: 'ecommerce', framework: 'Vite + React', stars: 1560, downloads: 6700, rating: 4.6, tags: ['luxury', 'watches', 'comparator'] },
  { id: '155', name: 'ClientPortal', author: 'agency-saas', description: 'Portal de clientes con proyectos, archivos, aprobaciones, facturas y chat.', category: 'saas', framework: 'Next.js', stars: 1670, downloads: 7300, rating: 4.6, tags: ['portal', 'clients', 'approvals'] },
  { id: '156', name: 'CharityLanding', author: 'ngo-ui', description: 'Landing para ONGs con donaciones, campañas, contador de impacto y voluntarios.', category: 'landing', framework: 'Nuxt', stars: 780, downloads: 3400, rating: 4.2, tags: ['charity', 'donations', 'impact'] },
  { id: '157', name: 'PDFGenerator', author: 'doc-api', description: 'API de generación de PDFs con templates HTML/CSS, merge, watermark y firma.', category: 'api', framework: 'Fastify', stars: 1890, downloads: 8500, rating: 4.7, tags: ['pdf', 'templates', 'generation'], verified: true },
  { id: '158', name: 'DirectoryCMS', author: 'listing-dev', description: 'Directorio de negocios con listados, mapas, reviews, filtros y suscripción.', category: 'cms', framework: 'Next.js', stars: 1010, downloads: 4400, rating: 4.4, tags: ['directory', 'listings', 'reviews'] },
  { id: '159', name: 'CodeReview AI', author: 'review-bot', description: 'Revisión de código automatizada con IA que detecta bugs, mejoras y seguridad.', category: 'ai', framework: 'Vite + React', stars: 3200, downloads: 15800, rating: 4.8, tags: ['code-review', 'bugs', 'security'], featured: true, verified: true },
  { id: '160', name: 'WeddingApp', author: 'celebration-dev', description: 'App de bodas con invitaciones, RSVP, mesa seating, timeline y galería compartida.', category: 'social', framework: 'Svelte', stars: 1230, downloads: 5300, rating: 4.5, tags: ['wedding', 'rsvp', 'gallery'] },
  { id: '161', name: 'AdsDashboard', author: 'marketing-ui', description: 'Dashboard de campañas publicitarias multi-plataforma con ROI, CPA y atribución.', category: 'dashboard', framework: 'Vite + React', stars: 1450, downloads: 6300, rating: 4.5, tags: ['ads', 'roi', 'attribution'] },
  { id: '162', name: 'FurnitureShop', author: 'home-ecom', description: 'Tienda de muebles con visualización AR en espacio, configurador 3D y delivery.', category: 'ecommerce', framework: 'Next.js', stars: 1780, downloads: 7800, rating: 4.6, tags: ['furniture', 'ar', '3d-config'] },
  { id: '163', name: 'SprintPlanner', author: 'agile-saas', description: 'Planificación ágil con sprints, story points, velocity charts y retrospectivas.', category: 'saas', framework: 'Vite + React', stars: 1560, downloads: 6800, rating: 4.6, tags: ['agile', 'sprints', 'velocity'] },
  { id: '164', name: 'PhotographerPro', author: 'lens-landing', description: 'Landing premium para fotógrafos con galería Ken Burns, booking y prints store.', category: 'landing', framework: 'Vite + React', stars: 1340, downloads: 5800, rating: 4.5, tags: ['photography', 'ken-burns', 'prints'] },
  { id: '165', name: 'CMSAPI Headless', author: 'content-api', description: 'API headless CMS con content types dinámicos, relaciones, media y roles.', category: 'api', framework: 'Hono', stars: 2100, downloads: 9600, rating: 4.7, tags: ['headless', 'content-types', 'dynamic'], verified: true },
  { id: '166', name: 'NewspaperCMS', author: 'press-dev', description: 'CMS para periódicos con ediciones, secciones, breaking news y paywalls.', category: 'cms', framework: 'Nuxt', stars: 1120, downloads: 4800, rating: 4.4, tags: ['newspaper', 'breaking-news', 'paywall'] },
  { id: '167', name: 'StyleTransfer', author: 'art-ai', description: 'Transferencia de estilos artísticos con IA, presets de artistas y batch mode.', category: 'ai', framework: 'Vite + React', stars: 1670, downloads: 7300, rating: 4.5, tags: ['style-transfer', 'art', 'presets'] },
  { id: '168', name: 'CookingCommunity', author: 'foodie-social', description: 'Comunidad de cocina con recetas, retos semanales, tips y mercado de ingredientes.', category: 'social', framework: 'React', stars: 1010, downloads: 4400, rating: 4.4, tags: ['cooking', 'recipes', 'challenges'] },
  { id: '169', name: 'BankingDash', author: 'neobank-ui', description: 'Dashboard neobank con cuentas, transferencias, tarjetas virtuales y analytics.', category: 'dashboard', framework: 'Next.js', stars: 2600, downloads: 12300, rating: 4.8, tags: ['banking', 'transfers', 'cards'], verified: true },
  { id: '170', name: 'TechGadgets', author: 'gadget-shop', description: 'Tienda de gadgets tech con specs comparator, unboxing videos y reviews IA.', category: 'ecommerce', framework: 'Vite + React', stars: 1230, downloads: 5300, rating: 4.5, tags: ['gadgets', 'tech', 'comparator'] },
  { id: '171', name: 'RecruitFlow', author: 'hiring-saas', description: 'ATS con pipeline de candidatos, scheduling, scorecards y career page builder.', category: 'saas', framework: 'Next.js', stars: 2100, downloads: 9700, rating: 4.7, tags: ['recruiting', 'ats', 'hiring'], verified: true },
  { id: '172', name: 'FreelancerPage', author: 'freelance-ui', description: 'Landing para freelancers con servicios, pricing packages, portfolio y contacto.', category: 'landing', framework: 'Svelte', stars: 1450, downloads: 6200, rating: 4.5, tags: ['freelance', 'services', 'pricing'] },
  { id: '173', name: 'LogStreamAPI', author: 'observability-api', description: 'API de streaming de logs con ingesta, query language, alertas y retención.', category: 'api', framework: 'Express', stars: 1670, downloads: 7300, rating: 4.6, tags: ['logs', 'streaming', 'query'] },
  { id: '174', name: 'GalleryCMS', author: 'exhibit-dev', description: 'CMS para galerías de arte con exposiciones, artistas, obras y visitas virtuales.', category: 'cms', framework: 'Vite + React', stars: 670, downloads: 2900, rating: 4.1, tags: ['gallery', 'art', 'virtual-tour'] },
  { id: '175', name: 'PredictiveAI', author: 'forecast-lab', description: 'Plataforma de predicciones con series temporales, modelos ML y dashboards.', category: 'ai', framework: 'Next.js', stars: 2400, downloads: 11200, rating: 4.7, tags: ['predictions', 'time-series', 'ml'] },
  { id: '176', name: 'SportsFan', author: 'sports-social', description: 'Red social deportiva con partidos en vivo, estadísticas, fantasy y debates.', category: 'social', framework: 'React', stars: 2800, downloads: 13500, rating: 4.7, tags: ['sports', 'live', 'fantasy'] },
  { id: '177', name: 'SupplyChainDash', author: 'logistics-pro', description: 'Dashboard de cadena de suministro con proveedores, lead times y forecasting.', category: 'dashboard', framework: 'Vue', stars: 1010, downloads: 4400, rating: 4.4, tags: ['supply-chain', 'procurement', 'forecast'] },
  { id: '178', name: 'DigitalDownloads', author: 'creator-ecom', description: 'Tienda de productos digitales con licencias, download links y drip content.', category: 'ecommerce', framework: 'Svelte', stars: 1340, downloads: 5800, rating: 4.5, tags: ['digital', 'downloads', 'licenses'] },
  { id: '179', name: 'MeetingRoom', author: 'office-saas', description: 'Reserva de salas de reuniones con calendario, recursos, catering y check-in QR.', category: 'saas', framework: 'Vue', stars: 890, downloads: 3900, rating: 4.3, tags: ['meetings', 'rooms', 'calendar'] },
  { id: '180', name: 'TherapistPage', author: 'health-landing', description: 'Landing para terapeutas con servicios, blog de bienestar, booking y FAQ.', category: 'landing', framework: 'Next.js', stars: 670, downloads: 2900, rating: 4.1, tags: ['therapy', 'wellness', 'booking'] },
  { id: '181', name: 'CacheAPI Pro', author: 'perf-api', description: 'API de caching distribuido con Redis/Memcached, invalidación inteligente y stats.', category: 'api', framework: 'Hono', stars: 1230, downloads: 5300, rating: 4.5, tags: ['cache', 'redis', 'performance'] },
  { id: '182', name: 'ForumEngine', author: 'community-cms', description: 'Motor de foros con categorías, moderación, badges, karma y búsqueda avanzada.', category: 'cms', framework: 'Next.js', stars: 1560, downloads: 6700, rating: 4.6, tags: ['forum', 'moderation', 'badges'] },
  { id: '183', name: 'TextToSQL', author: 'data-ai', description: 'Convierte lenguaje natural a SQL con IA, preview de resultados y optimización.', category: 'ai', framework: 'Vite + React', stars: 3500, downloads: 17200, rating: 4.9, tags: ['sql', 'natural-language', 'database'], featured: true, verified: true },
  { id: '184', name: 'PetCareSocial', author: 'vet-community', description: 'Comunidad de cuidado de mascotas con veterinarios, tips, adopciones y seguros.', category: 'social', framework: 'Nuxt', stars: 780, downloads: 3400, rating: 4.2, tags: ['pets', 'vet', 'adoption'] },
  { id: '185', name: 'CallCenterDash', author: 'support-ops', description: 'Dashboard de call center con colas, métricas de agentes, grabaciones y SLA.', category: 'dashboard', framework: 'React', stars: 1120, downloads: 4800, rating: 4.4, tags: ['call-center', 'agents', 'sla'] },
  { id: '186', name: 'SneakerDrop', author: 'hype-ecom', description: 'Tienda de sneakers con drops, raffle system, notificaciones y resale market.', category: 'ecommerce', framework: 'Next.js', stars: 2400, downloads: 11500, rating: 4.7, tags: ['sneakers', 'drops', 'raffle'], verified: true },
  { id: '187', name: 'DocumentSign', author: 'esign-saas', description: 'Firma electrónica avanzada con templates, campos dinámicos, audit trail y API.', category: 'saas', framework: 'Vite + React', stars: 1780, downloads: 7800, rating: 4.6, tags: ['esign', 'documents', 'audit'] },
  { id: '188', name: 'YogaStudio', author: 'wellness-landing', description: 'Landing para estudios de yoga con clases, horarios, instructores y retiros.', category: 'landing', framework: 'Svelte', stars: 560, downloads: 2400, rating: 4.0, tags: ['yoga', 'classes', 'wellness'] },
  { id: '189', name: 'ConfigService', author: 'platform-api', description: 'Servicio de configuración remota con feature flags, A/B, environments y SDK.', category: 'api', framework: 'Fastify', stars: 1560, downloads: 6800, rating: 4.6, tags: ['config', 'remote', 'environments'] },
  { id: '190', name: 'TutorialCMS', author: 'learn-content', description: 'CMS de tutoriales con steps interactivos, code playground y progreso de usuario.', category: 'cms', framework: 'Vite + React', stars: 1340, downloads: 5800, rating: 4.5, tags: ['tutorials', 'playground', 'progress'] },
  { id: '191', name: 'VoiceClone AI', author: 'speech-gen', description: 'Clonación de voz con IA, text-to-speech personalizado y voice mixing.', category: 'ai', framework: 'Next.js', stars: 2900, downloads: 14200, rating: 4.7, tags: ['voice-clone', 'tts', 'mixing'] },
  { id: '192', name: 'RunClub', author: 'fitness-social', description: 'Comunidad de running con rutas GPS, retos, rankings y planes de entrenamiento.', category: 'social', framework: 'React', stars: 1670, downloads: 7300, rating: 4.5, tags: ['running', 'gps', 'training'] },
  { id: '193', name: 'ComplianceDash', author: 'regulatory-ui', description: 'Dashboard de cumplimiento normativo con checklist, auditorías y certificaciones.', category: 'dashboard', framework: 'Vite + React', stars: 890, downloads: 3900, rating: 4.3, tags: ['compliance', 'audit', 'certifications'] },
  { id: '194', name: 'VinylStore', author: 'retro-music', description: 'Tienda de vinilos con player preview, colecciones, wishlists y ediciones limitadas.', category: 'ecommerce', framework: 'Svelte', stars: 780, downloads: 3400, rating: 4.2, tags: ['vinyl', 'music', 'collections'] },
  { id: '195', name: 'APIMonitor Pro', author: 'uptime-saas', description: 'Monitorización de APIs con uptime, latencia, alertas multi-canal y status page.', category: 'saas', framework: 'Vite + React', stars: 2300, downloads: 10800, rating: 4.8, tags: ['monitoring', 'uptime', 'status-page'], verified: true },
  { id: '196', name: 'LawyerLanding', author: 'legal-ui', description: 'Landing para bufetes con áreas de práctica, equipo, casos de éxito y consulta.', category: 'landing', framework: 'Next.js', stars: 890, downloads: 3900, rating: 4.3, tags: ['legal', 'law', 'consultation'] },
  { id: '197', name: 'SSO Gateway', author: 'auth-api', description: 'Single Sign-On con SAML, OIDC, directory sync y admin portal.', category: 'api', framework: 'Express', stars: 2100, downloads: 9600, rating: 4.7, tags: ['sso', 'saml', 'oidc'], verified: true },
  { id: '198', name: 'HotelCMS', author: 'hospitality-dev', description: 'CMS hotelero con habitaciones, disponibilidad, booking engine y guest reviews.', category: 'cms', framework: 'Nuxt', stars: 1120, downloads: 4800, rating: 4.4, tags: ['hotel', 'booking', 'availability'] },
  { id: '199', name: 'DesignSystem AI', author: 'ds-generator', description: 'Generador de design systems con IA, tokens, componentes y documentación auto.', category: 'ai', framework: 'Vite + React', stars: 3800, downloads: 19000, rating: 4.9, tags: ['design-system', 'tokens', 'components'], featured: true, verified: true },
  { id: '200', name: 'OpenMic', author: 'podcast-social', description: 'Plataforma social de podcasts con grabación, edición, distribución y comunidad.', category: 'social', framework: 'Next.js', stars: 2100, downloads: 9700, rating: 4.7, tags: ['podcast', 'recording', 'community'], verified: true },
];

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

function RatingStars({ rating, isDark }: { rating: number; isDark: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn(
            'size-2.5',
            i <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : isDark ? 'text-zinc-700' : 'text-gray-300',
          )}
        />
      ))}
      <span className={cn('text-[9px] ml-0.5 font-medium', isDark ? 'text-zinc-400' : 'text-gray-500')}>
        {rating}
      </span>
    </div>
  );
}

export function AppBrowser({ onOpenApp }: Props) {
  const { isDark, t } = usePluginSettings();
  const [mainTab, setMainTab] = useState<MainTab>('local');
  const [apps, setApps] = useState<LocalApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [selectedApp, setSelectedApp] = useState<CommunityApp | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await agentApi.listLocalApps();
      setApps(data.apps);
    } catch (err) {
      console.error('Failed to load apps:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredLocal = apps.filter(app => {
    if (!search) return true;
    const q = search.toLowerCase();
    return app.name.toLowerCase().includes(q) ||
      (app.description || '').toLowerCase().includes(q) ||
      (app.framework || '').toLowerCase().includes(q);
  });

  const filteredCommunity = communityApps.filter(app => {
    const matchesSearch = !search ||
      app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.description.toLowerCase().includes(search.toLowerCase()) ||
      app.author.toLowerCase().includes(search.toLowerCase()) ||
      app.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
    if (!matchesSearch) return false;
    if (category !== 'all') return app.category === category;
    return true;
  });

  const featured = communityApps.filter(a => a.featured);

  if (selectedApp) {
    return (
      <AppProfile
        app={selectedApp}
        isDark={isDark}
        onBack={() => setSelectedApp(null)}
        allApps={communityApps}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={cn(
        'flex items-center justify-between px-4 py-2.5 border-b shrink-0',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-sky-400" />
          <span className={cn('font-semibold text-xs', isDark ? 'text-zinc-100' : 'text-gray-900')}>
            Apps
          </span>
        </div>
        {mainTab === 'local' && (
          <button
            onClick={load}
            disabled={loading}
            className={cn(
              'size-6 rounded-md flex items-center justify-center transition-colors',
              isDark ? 'hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700',
            )}
            title="Recargar"
          >
            <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
          </button>
        )}
      </div>

      {/* Main tabs: Local / Community */}
      <div className={cn(
        'flex border-b shrink-0',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        {([
          { key: 'local' as const, label: t('myApps'), icon: FolderOpen, count: apps.length },
          { key: 'community' as const, label: t('community'), icon: Users, count: communityApps.length },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setMainTab(tab.key); setSearch(''); setCategory('all'); }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors relative',
              mainTab === tab.key
                ? isDark ? 'text-sky-300' : 'text-sky-600'
                : isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-700',
            )}
          >
            <tab.icon className="size-3" />
            {tab.label}
            <span className={cn(
              'text-[9px] px-1 py-px rounded-full',
              mainTab === tab.key
                ? isDark ? 'bg-sky-600/20 text-sky-400' : 'bg-sky-100 text-sky-600'
                : isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-100 text-gray-400',
            )}>
              {tab.count}
            </span>
            {mainTab === tab.key && (
              <div className={cn('absolute bottom-0 left-4 right-4 h-0.5 rounded-full', isDark ? 'bg-sky-500' : 'bg-sky-600')} />
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className={cn('px-3 py-2 border-b shrink-0', isDark ? 'border-zinc-800' : 'border-gray-200')}>
        <div className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors',
          isDark
            ? 'bg-zinc-900/80 border-zinc-700/50 focus-within:border-sky-500/40'
            : 'bg-gray-50 border-gray-300 focus-within:border-sky-500/40',
        )}>
          <Search className={cn('size-3 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={mainTab === 'local' ? 'Buscar en mis apps...' : 'Buscar en comunidad...'}
            className={cn(
              'flex-1 bg-transparent text-xs outline-none',
              isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400',
            )}
          />
          {search && (
            <button onClick={() => setSearch('')} className={cn('text-sm leading-none', isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* Category pills (community only) */}
      {mainTab === 'community' && (
        <div className={cn(
          'shrink-0 border-b overflow-x-auto',
          isDark ? 'border-zinc-800' : 'border-gray-200',
        )}>
          <div className="flex items-center gap-1 px-3 py-2 min-w-max">
            {categories.map(cat => {
              const active = category === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-all whitespace-nowrap',
                    active
                      ? isDark ? 'bg-sky-600/20 text-sky-300 ring-1 ring-sky-500/30' : 'bg-sky-100 text-sky-700 ring-1 ring-sky-200'
                      : isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
                  )}
                >
                  <cat.icon className="size-2.5" />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {mainTab === 'local' ? (
          <LocalAppsView apps={filteredLocal} loading={loading} search={search} isDark={isDark} onOpenApp={onOpenApp} totalCount={apps.length} />
        ) : (
          <CommunityView
            apps={filteredCommunity}
            featured={category === 'all' && !search ? featured : []}
            search={search}
            isDark={isDark}
            onSelectApp={setSelectedApp}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Local Apps View ─── */

function LocalAppsView({ apps, loading, search, isDark, onOpenApp, totalCount }: {
  apps: LocalApp[];
  loading: boolean;
  search: string;
  isDark: boolean;
  onOpenApp?: (app: LocalApp) => void;
  totalCount: number;
}) {
  if (loading) {
    return <TabLoader text="Cargando apps..." />;
  }

  if (apps.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <FolderOpen className={cn('size-10 mx-auto mb-3', isDark ? 'text-zinc-700' : 'text-gray-300')} />
        <p className={cn('text-sm', isDark ? 'text-zinc-500' : 'text-gray-400')}>
          {search ? 'No se encontraron apps' : 'No hay apps en /var/www'}
        </p>
      </div>
    );
  }

  const projectCount = apps.filter(a => a.hasPackageJson).length;

  return (
    <>
      <div className="px-2 py-1 space-y-0.5">
        {apps.map(app => (
          <LocalAppCard key={app.name} app={app} isDark={isDark} onOpen={onOpenApp} />
        ))}
      </div>
      <div className={cn(
        'px-4 py-2 border-t text-[10px]',
        isDark ? 'border-zinc-800 text-zinc-600' : 'border-gray-200 text-gray-400',
      )}>
        <span className="font-mono">/var/www/</span> · {totalCount} directorios · {projectCount} proyectos
      </div>
    </>
  );
}

function LocalAppCard({ app, isDark, onOpen }: { app: LocalApp; isDark: boolean; onOpen?: (app: LocalApp) => void }) {
  const fw = app.framework ? frameworkColors[app.framework] || frameworkColors['Express'] : null;

  return (
    <button
      onClick={() => onOpen?.(app)}
      className={cn(
        'group relative w-full text-left rounded-lg px-3 py-2.5 transition-all border',
        isDark
          ? 'hover:bg-zinc-800/60 border-transparent hover:border-zinc-700/50'
          : 'hover:bg-gray-50 border-transparent hover:border-gray-200',
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className={cn(
          'size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors',
          app.hasPackageJson
            ? isDark ? 'bg-sky-600/20 text-sky-400 group-hover:bg-sky-600/30' : 'bg-sky-100 text-sky-600'
            : isDark ? 'bg-zinc-800 text-zinc-500' : 'bg-gray-100 text-gray-400',
        )}>
          {app.hasPackageJson ? <Package className="size-4" /> : <FolderOpen className="size-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'text-sm font-medium truncate',
              isDark ? 'text-zinc-200 group-hover:text-sky-300' : 'text-gray-800 group-hover:text-sky-600',
            )}>
              {app.name}
            </span>
            {app.version && (
              <span className={cn('text-[9px] shrink-0', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                v{app.version}
              </span>
            )}
          </div>

          {app.description && (
            <p className={cn('text-[11px] truncate mt-0.5', isDark ? 'text-zinc-500' : 'text-gray-500')}>
              {app.description}
            </p>
          )}

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {app.framework && fw && (
              <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded border', fw.bg, fw.text, fw.border)}>
                {app.framework}
              </span>
            )}
            {app.hasGit && (
              <span className={cn('flex items-center gap-0.5 text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                <GitBranch className="size-2.5" /> git
              </span>
            )}
            {app.port && (
              <span className={cn('flex items-center gap-0.5 text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                <Globe className="size-2.5" /> :{app.port}
              </span>
            )}
            {app.hasPackageJson && (
              <span className={cn('flex items-center gap-0.5 text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                <Box className="size-2.5" /> {app.dependencies} deps
              </span>
            )}
            {app.scripts.length > 0 && (
              <span className={cn('flex items-center gap-0.5 text-[9px]', isDark ? 'text-zinc-600' : 'text-gray-400')}>
                <Terminal className="size-2.5" /> {app.scripts.length} scripts
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <ChevronRight className={cn(
            'size-3.5 opacity-0 group-hover:opacity-100 transition-opacity',
            isDark ? 'text-zinc-500' : 'text-gray-400',
          )} />
          {app.updatedAt && (
            <span className={cn('text-[9px] whitespace-nowrap', isDark ? 'text-zinc-700' : 'text-gray-400')}>
              {timeAgo(app.updatedAt)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ─── Community View ─── */

function CommunityView({ apps, featured, search, isDark, onSelectApp }: {
  apps: CommunityApp[];
  featured: CommunityApp[];
  search: string;
  isDark: boolean;
  onSelectApp: (app: CommunityApp) => void;
}) {
  return (
    <div className="pb-4">
      {/* Featured section */}
      {featured.length > 0 && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Sparkles className="size-3 text-amber-400" />
            <span className={cn('text-[11px] font-semibold uppercase tracking-wider', isDark ? 'text-zinc-400' : 'text-gray-500')}>
              Destacados
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {featured.map(app => (
              <FeaturedCard key={app.id} app={app} isDark={isDark} onSelect={onSelectApp} />
            ))}
          </div>
        </div>
      )}

      {/* Trending */}
      {!search && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-1.5 mb-2.5">
            <TrendingUp className="size-3 text-emerald-400" />
            <span className={cn('text-[11px] font-semibold uppercase tracking-wider', isDark ? 'text-zinc-400' : 'text-gray-500')}>
              Tendencia
            </span>
          </div>
        </div>
      )}

      {/* App list */}
      {apps.length === 0 ? (
        <div className="text-center py-10 px-4">
          <Search className={cn('size-8 mx-auto mb-3', isDark ? 'text-zinc-700' : 'text-gray-300')} />
          <p className={cn('text-sm', isDark ? 'text-zinc-500' : 'text-gray-400')}>
            No se encontraron apps
          </p>
        </div>
      ) : (
        <div className="px-2 space-y-0.5">
          {apps.map(app => (
            <CommunityAppCard key={app.id} app={app} isDark={isDark} onSelect={onSelectApp} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeaturedCard({ app, isDark, onSelect }: { app: CommunityApp; isDark: boolean; onSelect: (app: CommunityApp) => void }) {
  const fw = frameworkColors[app.framework] || frameworkColors['Express'];
  const gradients: Record<string, string> = {
    dashboard: 'from-violet-600/30 to-indigo-600/10',
    ecommerce: 'from-emerald-600/30 to-teal-600/10',
    saas: 'from-amber-600/30 to-orange-600/10',
    ai: 'from-purple-600/30 to-fuchsia-600/10',
    landing: 'from-pink-600/30 to-rose-600/10',
    api: 'from-cyan-600/30 to-sky-600/10',
    cms: 'from-orange-600/30 to-amber-600/10',
    social: 'from-blue-600/30 to-indigo-600/10',
    all: 'from-sky-600/30 to-blue-600/10',
  };

  return (
    <div
      onClick={() => onSelect(app)}
      className={cn(
        'shrink-0 w-[200px] rounded-xl border p-3 cursor-pointer transition-all hover:scale-[1.02]',
        isDark
          ? 'border-zinc-700/50 hover:border-zinc-600 bg-gradient-to-br ' + gradients[app.category]
          : 'border-gray-200 hover:border-gray-300 bg-gradient-to-br from-gray-50 to-white hover:shadow-md',
      )}>
      <div className="flex items-start justify-between mb-2">
        <div className={cn(
          'size-9 rounded-xl flex items-center justify-center',
          isDark ? 'bg-white/10' : 'bg-white shadow-sm border border-gray-100',
        )}>
          <Package className={cn('size-4', fw.text)} />
        </div>
        {app.verified && (
          <Shield className="size-3 text-sky-400" />
        )}
      </div>
      <p className={cn('text-xs font-semibold truncate', isDark ? 'text-zinc-100' : 'text-gray-800')}>
        {app.name}
      </p>
      <p className={cn('text-[10px] mt-0.5', isDark ? 'text-zinc-500' : 'text-gray-400')}>
        {app.author}
      </p>
      <p className={cn('text-[10px] mt-1.5 line-clamp-2 leading-relaxed', isDark ? 'text-zinc-400' : 'text-gray-500')}>
        {app.description}
      </p>
      <div className="flex items-center justify-between mt-2.5">
        <RatingStars rating={app.rating} isDark={isDark} />
        <span className={cn('text-[9px] font-medium', isDark ? 'text-zinc-500' : 'text-gray-400')}>
          {formatNumber(app.downloads)}
        </span>
      </div>
    </div>
  );
}

function CommunityAppCard({ app, isDark, onSelect }: { app: CommunityApp; isDark: boolean; onSelect: (app: CommunityApp) => void }) {
  const fw = frameworkColors[app.framework] || frameworkColors['Express'];
  const cat = categories.find(c => c.key === app.category);

  return (
    <div
      onClick={() => onSelect(app)}
      className={cn(
        'group relative w-full text-left rounded-lg px-3 py-2.5 transition-all border cursor-pointer',
        isDark
          ? 'hover:bg-zinc-800/60 border-transparent hover:border-zinc-700/50'
          : 'hover:bg-gray-50 border-transparent hover:border-gray-200',
      )}>
      <div className="flex items-start gap-2.5">
        <div className={cn(
          'size-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
          isDark ? 'bg-zinc-800 group-hover:bg-zinc-700/80' : 'bg-gray-100 group-hover:bg-gray-200/80',
        )}>
          <Package className={cn('size-5', fw.text)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'text-[13px] font-medium truncate',
              isDark ? 'text-zinc-200' : 'text-gray-800',
            )}>
              {app.name}
            </span>
            {app.verified && <Shield className="size-3 text-sky-400 shrink-0" />}
          </div>

          <p className={cn('text-[10px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
            {app.author}
          </p>

          <p className={cn('text-[11px] mt-1 line-clamp-2 leading-relaxed', isDark ? 'text-zinc-400' : 'text-gray-500')}>
            {app.description}
          </p>

          <div className="flex items-center gap-2.5 mt-2 flex-wrap">
            <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded border', fw.bg, fw.text, fw.border)}>
              {app.framework}
            </span>
            {cat && cat.key !== 'all' && (
              <span className={cn('text-[9px] px-1.5 py-0.5 rounded', isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-500')}>
                {cat.label}
              </span>
            )}
            <div className="flex items-center gap-2">
              <span className={cn('flex items-center gap-0.5 text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                <Star className="size-2.5 text-amber-400 fill-amber-400" /> {app.rating}
              </span>
              <span className={cn('flex items-center gap-0.5 text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                <Download className="size-2.5" /> {formatNumber(app.downloads)}
              </span>
              <span className={cn('flex items-center gap-0.5 text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                <Heart className="size-2.5" /> {formatNumber(app.stars)}
              </span>
            </div>
          </div>

          {app.tags.length > 0 && (
            <div className="hidden group-hover:flex flex-wrap gap-1 mt-2">
              {app.tags.map(tag => (
                <span
                  key={tag}
                  className={cn(
                    'text-[9px] font-mono px-1.5 py-0.5 rounded',
                    isDark ? 'bg-zinc-800/80 text-zinc-400' : 'bg-gray-100 text-gray-600',
                  )}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── App Profile (Marketplace Detail) ─── */

const categoryGradients: Record<string, { from: string; to: string; accent: string }> = {
  dashboard: { from: 'from-violet-600', to: 'to-indigo-700', accent: 'violet' },
  ecommerce: { from: 'from-emerald-600', to: 'to-teal-700', accent: 'emerald' },
  saas: { from: 'from-amber-500', to: 'to-orange-600', accent: 'amber' },
  ai: { from: 'from-purple-600', to: 'to-fuchsia-700', accent: 'purple' },
  landing: { from: 'from-pink-500', to: 'to-rose-600', accent: 'pink' },
  api: { from: 'from-cyan-500', to: 'to-sky-600', accent: 'cyan' },
  cms: { from: 'from-orange-500', to: 'to-amber-600', accent: 'orange' },
  social: { from: 'from-blue-500', to: 'to-indigo-600', accent: 'blue' },
  all: { from: 'from-sky-500', to: 'to-blue-600', accent: 'sky' },
};

function AppProfile({ app, isDark, onBack, allApps }: {
  app: CommunityApp;
  isDark: boolean;
  onBack: () => void;
  allApps: CommunityApp[];
}) {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const fw = frameworkColors[app.framework] || frameworkColors['Express'];
  const cat = categories.find(c => c.key === app.category);
  const gradient = categoryGradients[app.category] || categoryGradients.all;
  const related = allApps.filter(a => a.id !== app.id && a.category === app.category).slice(0, 4);

  const handleInstall = () => {
    setInstalling(true);
    setTimeout(() => {
      setInstalling(false);
      setInstalled(true);
    }, 2000);
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(`https://aythen.com/marketplace/${app.id}`);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/* Top bar */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 border-b shrink-0 z-10',
        isDark ? 'border-zinc-800 bg-zinc-950/95 backdrop-blur-sm' : 'border-gray-200 bg-white/95 backdrop-blur-sm',
      )}>
        <button
          onClick={onBack}
          className={cn(
            'size-7 rounded-lg flex items-center justify-center transition-colors',
            isDark ? 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700',
          )}
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className={cn('text-xs font-medium truncate flex-1', isDark ? 'text-zinc-300' : 'text-gray-700')}>
          {app.name}
        </span>
        {app.verified && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sky-500/10">
            <Shield className="size-2.5 text-sky-400" />
            <span className="text-[9px] font-medium text-sky-400">Verificado</span>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-20">
        {/* Hero gradient */}
        <div className={cn(
          'relative h-32 bg-gradient-to-br overflow-hidden',
          gradient.from, gradient.to,
        )}>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_70%)]" />
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="absolute bottom-3 left-4 flex items-end gap-3">
            <div className={cn(
              'size-14 rounded-2xl flex items-center justify-center shadow-lg ring-2',
              isDark ? 'bg-zinc-900 ring-zinc-800' : 'bg-white ring-white',
            )}>
              <Package className={cn('size-7', fw.text)} />
            </div>
            <div className="pb-0.5">
              <h2 className="text-base font-bold text-white drop-shadow-sm leading-tight">{app.name}</h2>
              <p className="text-[11px] text-white/70">{app.author}</p>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className={cn(
          'grid grid-cols-4 divide-x border-b',
          isDark ? 'divide-zinc-800 border-zinc-800' : 'divide-gray-200 border-gray-200',
        )}>
          {[
            { icon: Star, label: 'Rating', value: app.rating.toString(), sub: 'de 5', color: 'text-amber-400' },
            { icon: Download, label: 'Descargas', value: formatNumber(app.downloads), sub: 'total', color: 'text-emerald-400' },
            { icon: Heart, label: 'Likes', value: formatNumber(app.stars), sub: 'likes', color: 'text-pink-400' },
            { icon: Code2, label: 'Framework', value: app.framework.split(' ').pop() || '', sub: app.framework, color: fw.text },
          ].map((stat, i) => (
            <div key={i} className="flex flex-col items-center py-3 gap-0.5">
              <stat.icon className={cn('size-3.5', stat.color)} />
              <span className={cn('text-sm font-bold', isDark ? 'text-zinc-100' : 'text-gray-800')}>{stat.value}</span>
              <span className={cn('text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>{stat.sub}</span>
            </div>
          ))}
        </div>

        {/* Rating stars */}
        <div className={cn('px-4 py-3 border-b', isDark ? 'border-zinc-800' : 'border-gray-200')}>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(i => (
                <Star
                  key={i}
                  className={cn(
                    'size-4',
                    i <= Math.round(app.rating) ? 'text-amber-400 fill-amber-400' : isDark ? 'text-zinc-700' : 'text-gray-300',
                  )}
                />
              ))}
            </div>
            <span className={cn('text-xs font-semibold', isDark ? 'text-zinc-200' : 'text-gray-700')}>
              {app.rating}
            </span>
            <span className={cn('text-[10px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
              ({formatNumber(app.downloads)} reviews)
            </span>
          </div>
        </div>

        {/* Description */}
        <div className={cn('px-4 py-4 border-b', isDark ? 'border-zinc-800' : 'border-gray-200')}>
          <div className="flex items-center gap-1.5 mb-2">
            <Info className={cn('size-3.5', isDark ? 'text-zinc-400' : 'text-gray-500')} />
            <span className={cn('text-[11px] font-semibold uppercase tracking-wider', isDark ? 'text-zinc-400' : 'text-gray-500')}>
              Descripción
            </span>
          </div>
          <p className={cn('text-[12px] leading-relaxed', isDark ? 'text-zinc-300' : 'text-gray-600')}>
            {app.description}
          </p>
        </div>

        {/* Tags */}
        {app.tags.length > 0 && (
          <div className={cn('px-4 py-3 border-b', isDark ? 'border-zinc-800' : 'border-gray-200')}>
            <div className="flex items-center gap-1.5 mb-2">
              <Tag className={cn('size-3.5', isDark ? 'text-zinc-400' : 'text-gray-500')} />
              <span className={cn('text-[11px] font-semibold uppercase tracking-wider', isDark ? 'text-zinc-400' : 'text-gray-500')}>
                Tags
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {app.tags.map(tag => (
                <span
                  key={tag}
                  className={cn(
                    'text-[10px] font-mono px-2 py-1 rounded-lg border',
                    isDark ? 'bg-zinc-800/60 text-zinc-300 border-zinc-700/50' : 'bg-gray-50 text-gray-600 border-gray-200',
                  )}
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Details */}
        <div className={cn('px-4 py-3 border-b', isDark ? 'border-zinc-800' : 'border-gray-200')}>
          <div className="flex items-center gap-1.5 mb-2.5">
            <FileCode className={cn('size-3.5', isDark ? 'text-zinc-400' : 'text-gray-500')} />
            <span className={cn('text-[11px] font-semibold uppercase tracking-wider', isDark ? 'text-zinc-400' : 'text-gray-500')}>
              Detalles
            </span>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Framework', value: app.framework, badge: true },
              { label: 'Categoría', value: cat?.label || app.category },
              { label: 'Autor', value: app.author },
              { label: 'Verificado', value: app.verified ? 'Sí' : 'No' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className={cn('text-[11px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>{item.label}</span>
                {item.badge ? (
                  <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded border', fw.bg, fw.text, fw.border)}>
                    {item.value}
                  </span>
                ) : (
                  <span className={cn('text-[11px] font-medium', isDark ? 'text-zinc-300' : 'text-gray-700')}>
                    {item.value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Related apps */}
        {related.length > 0 && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Layers className={cn('size-3.5', isDark ? 'text-zinc-400' : 'text-gray-500')} />
              <span className={cn('text-[11px] font-semibold uppercase tracking-wider', isDark ? 'text-zinc-400' : 'text-gray-500')}>
                Apps similares
              </span>
            </div>
            <div className="space-y-1">
              {related.map(rel => {
                const relFw = frameworkColors[rel.framework] || frameworkColors['Express'];
                return (
                  <button
                    key={rel.id}
                    onClick={() => {
                      setInstalled(false);
                      setInstalling(false);
                      onBack();
                      setTimeout(() => {}, 0);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors text-left',
                      isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-gray-50',
                    )}
                  >
                    <div className={cn(
                      'size-8 rounded-lg flex items-center justify-center shrink-0',
                      isDark ? 'bg-zinc-800' : 'bg-gray-100',
                    )}>
                      <Package className={cn('size-4', relFw.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-[11px] font-medium truncate', isDark ? 'text-zinc-200' : 'text-gray-700')}>
                        {rel.name}
                      </p>
                      <p className={cn('text-[9px]', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                        {rel.author} · <Star className="size-2 inline text-amber-400 fill-amber-400" /> {rel.rating}
                      </p>
                    </div>
                    <ChevronRight className={cn('size-3', isDark ? 'text-zinc-600' : 'text-gray-300')} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 px-3 py-3 border-t shrink-0 z-10',
        isDark
          ? 'bg-zinc-950/95 backdrop-blur-md border-zinc-800 shadow-[0_-4px_20px_rgba(0,0,0,0.4)]'
          : 'bg-white/95 backdrop-blur-md border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]',
      )}>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className={cn(
              'size-10 rounded-xl flex items-center justify-center transition-all border',
              isDark
                ? 'border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                : 'border-gray-300 hover:border-gray-400 text-gray-500 hover:text-gray-700 hover:bg-gray-50',
            )}
            title="Compartir"
          >
            <Share2 className="size-4" />
          </button>
          <button
            onClick={handleInstall}
            disabled={installing || installed}
            className={cn(
              'flex-1 h-10 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-all',
              installed
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 cursor-default'
                : installing
                  ? isDark ? 'bg-sky-600/30 text-sky-300 cursor-wait' : 'bg-sky-100 text-sky-600 cursor-wait'
                  : isDark
                    ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20 active:scale-[0.98]'
                    : 'bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20 active:scale-[0.98]',
            )}
          >
            {installed ? (
              <>
                <CheckCircle2 className="size-4" />
                Instalado
              </>
            ) : installing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Instalando...
              </>
            ) : (
              <>
                <Download className="size-4" />
                Instalar
              </>
            )}
          </button>
          <button
            className={cn(
              'size-10 rounded-xl flex items-center justify-center transition-all border',
              isDark
                ? 'border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-pink-400 hover:bg-zinc-800'
                : 'border-gray-300 hover:border-gray-400 text-gray-500 hover:text-pink-500 hover:bg-gray-50',
            )}
            title="Favorito"
          >
            <Heart className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
