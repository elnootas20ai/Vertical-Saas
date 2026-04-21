import { useState, useEffect, useMemo } from 'react';
import {
  Search, Eye, EyeOff, Check, X, Trash2, ExternalLink,
  Loader2, Key, Shield, ChevronLeft, Copy, CheckCircle2,
} from 'lucide-react';
import { cn } from '../../app/components/ui/utils';
import { agentApi } from '../lib/api';

// ── Token catalog ──

interface TokenDef {
  id: string;
  name: string;
  category: string;
  description: string;
  website: string;
  logo: string;
  placeholder: string;
  docsUrl: string;
}

const CATEGORIES = [
  'Todas', 'AI & ML', 'Email', 'Cloud', 'Pagos', 'Social', 'Analytics',
  'Comunicación', 'Storage', 'Base de datos', 'DevOps', 'Mapas',
  'Auth', 'CRM & Marketing', 'E-commerce', 'Media', 'Productividad', 'Seguridad',
  'IoT', 'Fintech', 'Blockchain', 'Testing', 'CDN & Performance', 'Search',
  'Logistics', 'Healthcare', 'Education', 'Legal', 'HR', 'Real Estate',
  'Food & Delivery', 'Travel', 'Gaming', 'Government', 'Weather', 'SMS',
  'Video', 'DNS & Domain', 'Design', 'Accounting', 'Customer Support', 'Monitoring',
  'Translation', 'Forms', 'Identity', 'Events', 'Automotive', 'Energy',
  'Agriculture', 'Insurance', 'Construction', 'Podcast & Audio', 'AR/VR',
  'News & Data', 'Sports & Fitness', 'Music', 'Data Enrichment', 'PDF & Documents',
  'Compliance', 'Scheduling', 'Notifications', 'eSignature', 'Enterprise',
  'Telecom', 'Sustainability', 'Accessibility', 'Cybersecurity', 'Network',
  'Backup', 'Feature Flags', 'Error Tracking',
] as const;

const TOKENS: TokenDef[] = [
  // AI & ML
  { id: 'openai', name: 'OpenAI', category: 'AI & ML', description: 'GPT-4, DALL·E, Whisper, embeddings y más. La plataforma líder de IA generativa.', website: 'https://openai.com', logo: '🤖', placeholder: 'sk-...', docsUrl: 'https://platform.openai.com/docs' },
  { id: 'anthropic', name: 'Anthropic', category: 'AI & ML', description: 'Claude AI — modelos de lenguaje seguros y capaces para producción.', website: 'https://anthropic.com', logo: '🧠', placeholder: 'sk-ant-...', docsUrl: 'https://docs.anthropic.com' },
  { id: 'google-ai', name: 'Google AI (Gemini)', category: 'AI & ML', description: 'Gemini, PaLM y servicios de IA de Google Cloud.', website: 'https://ai.google.dev', logo: '♊', placeholder: 'AIza...', docsUrl: 'https://ai.google.dev/docs' },
  { id: 'mistral', name: 'Mistral AI', category: 'AI & ML', description: 'Modelos open-weight de alto rendimiento. Mistral, Mixtral y más.', website: 'https://mistral.ai', logo: '🌀', placeholder: 'sk-...', docsUrl: 'https://docs.mistral.ai' },
  { id: 'cohere', name: 'Cohere', category: 'AI & ML', description: 'NLP empresarial: generación, clasificación, embeddings y RAG.', website: 'https://cohere.com', logo: '🔮', placeholder: 'co-...', docsUrl: 'https://docs.cohere.com' },
  { id: 'replicate', name: 'Replicate', category: 'AI & ML', description: 'Ejecuta modelos de ML en la nube con una API simple.', website: 'https://replicate.com', logo: '🔁', placeholder: 'r8_...', docsUrl: 'https://replicate.com/docs' },
  { id: 'huggingface', name: 'Hugging Face', category: 'AI & ML', description: 'Hub de modelos ML. Inference API para miles de modelos.', website: 'https://huggingface.co', logo: '🤗', placeholder: 'hf_...', docsUrl: 'https://huggingface.co/docs' },
  { id: 'stability', name: 'Stability AI', category: 'AI & ML', description: 'Stable Diffusion y generación de imágenes por IA.', website: 'https://stability.ai', logo: '🎨', placeholder: 'sk-...', docsUrl: 'https://platform.stability.ai/docs' },
  { id: 'elevenlabs', name: 'ElevenLabs', category: 'AI & ML', description: 'Síntesis de voz hiperrealista con IA y clonación de voz.', website: 'https://elevenlabs.io', logo: '🗣️', placeholder: 'xi-...', docsUrl: 'https://docs.elevenlabs.io' },
  { id: 'deepl', name: 'DeepL', category: 'AI & ML', description: 'Traducción automática de alta calidad para 30+ idiomas.', website: 'https://deepl.com', logo: '🌐', placeholder: 'deepl-...', docsUrl: 'https://developers.deepl.com/docs' },
  { id: 'groq', name: 'Groq', category: 'AI & ML', description: 'Inferencia ultrarrápida para modelos LLM open-source.', website: 'https://groq.com', logo: '⚡', placeholder: 'gsk_...', docsUrl: 'https://console.groq.com/docs' },
  { id: 'perplexity', name: 'Perplexity', category: 'AI & ML', description: 'IA de búsqueda en tiempo real con respuestas citadas.', website: 'https://perplexity.ai', logo: '🔍', placeholder: 'pplx-...', docsUrl: 'https://docs.perplexity.ai' },

  // Email
  { id: 'gmail', name: 'Gmail (Google)', category: 'Email', description: 'API de Gmail para enviar, leer y gestionar correos electrónicos.', website: 'https://mail.google.com', logo: '📧', placeholder: 'ya29...', docsUrl: 'https://developers.google.com/gmail/api' },
  { id: 'outlook', name: 'Outlook (Microsoft)', category: 'Email', description: 'API de Microsoft Graph para correo Outlook/Exchange.', website: 'https://outlook.com', logo: '📬', placeholder: 'EwB...', docsUrl: 'https://learn.microsoft.com/graph/api/resources/mail-api-overview' },
  { id: 'sendgrid', name: 'SendGrid', category: 'Email', description: 'Plataforma de email transaccional y marketing de Twilio.', website: 'https://sendgrid.com', logo: '📤', placeholder: 'SG...', docsUrl: 'https://docs.sendgrid.com' },
  { id: 'mailgun', name: 'Mailgun', category: 'Email', description: 'API de email para desarrolladores. Envío, tracking y validación.', website: 'https://mailgun.com', logo: '🔫', placeholder: 'key-...', docsUrl: 'https://documentation.mailgun.com' },
  { id: 'resend', name: 'Resend', category: 'Email', description: 'Email API moderna para desarrolladores. Simple y potente.', website: 'https://resend.com', logo: '✉️', placeholder: 're_...', docsUrl: 'https://resend.com/docs' },
  { id: 'postmark', name: 'Postmark', category: 'Email', description: 'Entrega de email transaccional rápida y confiable.', website: 'https://postmarkapp.com', logo: '📮', placeholder: 'pmk-...', docsUrl: 'https://postmarkapp.com/developer' },
  { id: 'mailchimp', name: 'Mailchimp', category: 'CRM & Marketing', description: 'Email marketing, automatización y CRM todo en uno.', website: 'https://mailchimp.com', logo: '🐵', placeholder: 'md-...', docsUrl: 'https://mailchimp.com/developer' },

  // Cloud & Hosting
  { id: 'aws', name: 'AWS', category: 'Cloud', description: 'Amazon Web Services — S3, EC2, Lambda y 200+ servicios cloud.', website: 'https://aws.amazon.com', logo: '☁️', placeholder: 'AKIA...', docsUrl: 'https://docs.aws.amazon.com' },
  { id: 'gcp', name: 'Google Cloud', category: 'Cloud', description: 'Compute, Storage, BigQuery, Kubernetes y más.', website: 'https://cloud.google.com', logo: '🌩️', placeholder: 'AIza...', docsUrl: 'https://cloud.google.com/docs' },
  { id: 'azure', name: 'Microsoft Azure', category: 'Cloud', description: 'Cloud de Microsoft: VMs, App Service, Cosmos DB, AI.', website: 'https://azure.microsoft.com', logo: '🔷', placeholder: 'key...', docsUrl: 'https://learn.microsoft.com/azure' },
  { id: 'digitalocean', name: 'DigitalOcean', category: 'Cloud', description: 'Cloud simple para droplets, Kubernetes y App Platform.', website: 'https://digitalocean.com', logo: '🐳', placeholder: 'dop_v1_...', docsUrl: 'https://docs.digitalocean.com' },
  { id: 'vercel', name: 'Vercel', category: 'Cloud', description: 'Deploy frontend y serverless. La plataforma de Next.js.', website: 'https://vercel.com', logo: '▲', placeholder: 'vercel_...', docsUrl: 'https://vercel.com/docs' },
  { id: 'netlify', name: 'Netlify', category: 'Cloud', description: 'Deploy de sitios estáticos y funciones serverless.', website: 'https://netlify.com', logo: '🌿', placeholder: 'nfp_...', docsUrl: 'https://docs.netlify.com' },
  { id: 'cloudflare', name: 'Cloudflare', category: 'Cloud', description: 'CDN, DNS, Workers, R2, seguridad y rendimiento web.', website: 'https://cloudflare.com', logo: '🛡️', placeholder: 'cf_...', docsUrl: 'https://developers.cloudflare.com' },
  { id: 'railway', name: 'Railway', category: 'Cloud', description: 'Deploy de apps con base de datos incluida. Dev-friendly.', website: 'https://railway.app', logo: '🚂', placeholder: 'railway_...', docsUrl: 'https://docs.railway.app' },
  { id: 'render', name: 'Render', category: 'Cloud', description: 'Cloud moderno para web services, DBs y cron jobs.', website: 'https://render.com', logo: '🎯', placeholder: 'rnd_...', docsUrl: 'https://render.com/docs' },
  { id: 'fly', name: 'Fly.io', category: 'Cloud', description: 'Deploy apps globalmente cerca de tus usuarios.', website: 'https://fly.io', logo: '✈️', placeholder: 'fo1_...', docsUrl: 'https://fly.io/docs' },

  // Pagos
  { id: 'stripe', name: 'Stripe', category: 'Pagos', description: 'Plataforma líder de pagos online, suscripciones y facturación.', website: 'https://stripe.com', logo: '💳', placeholder: 'sk_...', docsUrl: 'https://stripe.com/docs/api' },
  { id: 'paypal', name: 'PayPal', category: 'Pagos', description: 'Pagos globales, checkout y transferencias P2P.', website: 'https://paypal.com', logo: '💰', placeholder: 'access_token...', docsUrl: 'https://developer.paypal.com/docs' },
  { id: 'square', name: 'Square', category: 'Pagos', description: 'Pagos presenciales y online, POS e inventario.', website: 'https://squareup.com', logo: '⬛', placeholder: 'EAAAl...', docsUrl: 'https://developer.squareup.com' },
  { id: 'mercadopago', name: 'Mercado Pago', category: 'Pagos', description: 'Pagos online para Latinoamérica. Checkout y suscripciones.', website: 'https://mercadopago.com', logo: '🤝', placeholder: 'APP_USR-...', docsUrl: 'https://www.mercadopago.com/developers' },
  { id: 'coinbase', name: 'Coinbase Commerce', category: 'Pagos', description: 'Acepta pagos en criptomonedas de forma simple.', website: 'https://commerce.coinbase.com', logo: '₿', placeholder: 'coinbase_...', docsUrl: 'https://docs.cloud.coinbase.com' },

  // Social Media
  { id: 'twitter', name: 'Twitter / X', category: 'Social', description: 'API de Twitter para tweets, búsqueda, DMs y analytics.', website: 'https://x.com', logo: '🐦', placeholder: 'Bearer ...', docsUrl: 'https://developer.x.com/docs' },
  { id: 'facebook', name: 'Facebook / Meta', category: 'Social', description: 'Graph API de Meta para Facebook, Instagram y WhatsApp.', website: 'https://developers.facebook.com', logo: '👤', placeholder: 'EAAl...', docsUrl: 'https://developers.facebook.com/docs' },
  { id: 'instagram', name: 'Instagram', category: 'Social', description: 'API de Instagram para media, stories y business profiles.', website: 'https://instagram.com', logo: '📸', placeholder: 'IGQ...', docsUrl: 'https://developers.facebook.com/docs/instagram-api' },
  { id: 'linkedin', name: 'LinkedIn', category: 'Social', description: 'API profesional para perfiles, posts y marketing.', website: 'https://linkedin.com', logo: '💼', placeholder: 'AQX...', docsUrl: 'https://learn.microsoft.com/linkedin' },
  { id: 'youtube', name: 'YouTube', category: 'Social', description: 'Data API para videos, channels, playlists y analytics.', website: 'https://youtube.com', logo: '▶️', placeholder: 'AIza...', docsUrl: 'https://developers.google.com/youtube' },
  { id: 'tiktok', name: 'TikTok', category: 'Social', description: 'API para contenido, login social y analytics.', website: 'https://tiktok.com', logo: '🎵', placeholder: 'tt-...', docsUrl: 'https://developers.tiktok.com/doc' },
  { id: 'discord', name: 'Discord', category: 'Social', description: 'Bots, webhooks e integración con servidores Discord.', website: 'https://discord.com', logo: '🎮', placeholder: 'Bot ...', docsUrl: 'https://discord.com/developers/docs' },
  { id: 'reddit', name: 'Reddit', category: 'Social', description: 'API para posts, comentarios y subreddits.', website: 'https://reddit.com', logo: '🟠', placeholder: 'reddit_...', docsUrl: 'https://www.reddit.com/dev/api' },
  { id: 'pinterest', name: 'Pinterest', category: 'Social', description: 'API para pins, boards y analytics de contenido visual.', website: 'https://pinterest.com', logo: '📌', placeholder: 'pina_...', docsUrl: 'https://developers.pinterest.com' },

  // Analytics
  { id: 'google-analytics', name: 'Google Analytics', category: 'Analytics', description: 'Analítica web completa: tráfico, conversiones, comportamiento.', website: 'https://analytics.google.com', logo: '📊', placeholder: 'AIza...', docsUrl: 'https://developers.google.com/analytics' },
  { id: 'mixpanel', name: 'Mixpanel', category: 'Analytics', description: 'Product analytics avanzado: eventos, funnels, retención.', website: 'https://mixpanel.com', logo: '📈', placeholder: 'mp-...', docsUrl: 'https://developer.mixpanel.com' },
  { id: 'amplitude', name: 'Amplitude', category: 'Analytics', description: 'Analítica de producto para entender el comportamiento de usuarios.', website: 'https://amplitude.com', logo: '📉', placeholder: 'amp-...', docsUrl: 'https://www.docs.developers.amplitude.com' },
  { id: 'segment', name: 'Segment', category: 'Analytics', description: 'Customer Data Platform. Recopila y enruta datos de usuario.', website: 'https://segment.com', logo: '🔀', placeholder: 'seg_...', docsUrl: 'https://segment.com/docs' },
  { id: 'posthog', name: 'PostHog', category: 'Analytics', description: 'Product analytics open-source: eventos, heatmaps, feature flags.', website: 'https://posthog.com', logo: '🦔', placeholder: 'phc_...', docsUrl: 'https://posthog.com/docs' },
  { id: 'plausible', name: 'Plausible', category: 'Analytics', description: 'Web analytics ligero, privado y sin cookies.', website: 'https://plausible.io', logo: '🌱', placeholder: 'pl-...', docsUrl: 'https://plausible.io/docs' },

  // Comunicación
  { id: 'twilio', name: 'Twilio', category: 'Comunicación', description: 'SMS, llamadas, video, WhatsApp y verificación.', website: 'https://twilio.com', logo: '📱', placeholder: 'SK...', docsUrl: 'https://www.twilio.com/docs' },
  { id: 'whatsapp', name: 'WhatsApp Business', category: 'Comunicación', description: 'API oficial de WhatsApp para mensajes de negocio.', website: 'https://business.whatsapp.com', logo: '💬', placeholder: 'EAAl...', docsUrl: 'https://developers.facebook.com/docs/whatsapp' },
  { id: 'telegram', name: 'Telegram Bot', category: 'Comunicación', description: 'Crea bots de Telegram para automatización y notificaciones.', website: 'https://telegram.org', logo: '✈️', placeholder: 'bot...', docsUrl: 'https://core.telegram.org/bots/api' },
  { id: 'slack', name: 'Slack', category: 'Comunicación', description: 'Bots, webhooks y apps para workspaces de Slack.', website: 'https://slack.com', logo: '💬', placeholder: 'xoxb-...', docsUrl: 'https://api.slack.com' },
  { id: 'pusher', name: 'Pusher', category: 'Comunicación', description: 'Realtime APIs: canales, notificaciones push y chat.', website: 'https://pusher.com', logo: '🔔', placeholder: 'app_...', docsUrl: 'https://pusher.com/docs' },
  { id: 'vonage', name: 'Vonage (Nexmo)', category: 'Comunicación', description: 'SMS, voz, video y verificación de número.', website: 'https://vonage.com', logo: '📞', placeholder: 'vnx-...', docsUrl: 'https://developer.vonage.com' },

  // Storage
  { id: 'ftp', name: 'FTP / SFTP', category: 'Storage', description: 'Protocolo clásico de transferencia de archivos a servidores remotos.', website: 'https://en.wikipedia.org/wiki/FTP', logo: '📁', placeholder: 'ftp://user:pass@host', docsUrl: 'https://en.wikipedia.org/wiki/FTP' },
  { id: 's3', name: 'Amazon S3', category: 'Storage', description: 'Object storage de AWS. El estándar de almacenamiento en la nube.', website: 'https://aws.amazon.com/s3', logo: '🪣', placeholder: 'AKIA...', docsUrl: 'https://docs.aws.amazon.com/s3' },
  { id: 'r2', name: 'Cloudflare R2', category: 'Storage', description: 'Object storage compatible con S3, sin egress fees.', website: 'https://cloudflare.com/r2', logo: '📦', placeholder: 'cf_r2_...', docsUrl: 'https://developers.cloudflare.com/r2' },
  { id: 'gcs', name: 'Google Cloud Storage', category: 'Storage', description: 'Object storage unificado de Google Cloud.', website: 'https://cloud.google.com/storage', logo: '🗄️', placeholder: 'AIza...', docsUrl: 'https://cloud.google.com/storage/docs' },
  { id: 'supabase-storage', name: 'Supabase Storage', category: 'Storage', description: 'Almacenamiento de archivos con Supabase, con CDN integrado.', website: 'https://supabase.com', logo: '⚡', placeholder: 'sbp_...', docsUrl: 'https://supabase.com/docs/guides/storage' },
  { id: 'uploadthing', name: 'UploadThing', category: 'Storage', description: 'Upload de archivos moderno para apps TypeScript/React.', website: 'https://uploadthing.com', logo: '📤', placeholder: 'sk_live_...', docsUrl: 'https://docs.uploadthing.com' },

  // Base de datos
  { id: 'supabase', name: 'Supabase', category: 'Base de datos', description: 'Firebase alternativa open-source: Postgres, Auth, Realtime.', website: 'https://supabase.com', logo: '⚡', placeholder: 'sbp_...', docsUrl: 'https://supabase.com/docs' },
  { id: 'firebase', name: 'Firebase', category: 'Base de datos', description: 'Backend de Google: Firestore, Auth, Hosting, Functions.', website: 'https://firebase.google.com', logo: '🔥', placeholder: 'AIza...', docsUrl: 'https://firebase.google.com/docs' },
  { id: 'planetscale', name: 'PlanetScale', category: 'Base de datos', description: 'MySQL serverless con branching tipo Git.', website: 'https://planetscale.com', logo: '🪐', placeholder: 'pscale_...', docsUrl: 'https://planetscale.com/docs' },
  { id: 'neon', name: 'Neon', category: 'Base de datos', description: 'Postgres serverless con branching y auto-scaling.', website: 'https://neon.tech', logo: '💚', placeholder: 'neon_...', docsUrl: 'https://neon.tech/docs' },
  { id: 'mongodb-atlas', name: 'MongoDB Atlas', category: 'Base de datos', description: 'MongoDB en la nube: clusters, search, serverless.', website: 'https://mongodb.com/atlas', logo: '🍃', placeholder: 'mongodb+srv://...', docsUrl: 'https://www.mongodb.com/docs/atlas' },
  { id: 'redis', name: 'Redis Cloud', category: 'Base de datos', description: 'Base de datos in-memory: cache, pub/sub, streams.', website: 'https://redis.com', logo: '🔴', placeholder: 'redis://...', docsUrl: 'https://redis.io/docs' },
  { id: 'turso', name: 'Turso', category: 'Base de datos', description: 'SQLite distribuido en el edge. Rápido y económico.', website: 'https://turso.tech', logo: '🐢', placeholder: 'turso_...', docsUrl: 'https://docs.turso.tech' },

  // DevOps
  { id: 'github', name: 'GitHub', category: 'DevOps', description: 'API para repos, issues, PRs, Actions y más.', website: 'https://github.com', logo: '🐙', placeholder: 'ghp_...', docsUrl: 'https://docs.github.com/rest' },
  { id: 'gitlab', name: 'GitLab', category: 'DevOps', description: 'DevOps completo: repos, CI/CD, registry y más.', website: 'https://gitlab.com', logo: '🦊', placeholder: 'glpat-...', docsUrl: 'https://docs.gitlab.com/ee/api' },
  { id: 'docker-hub', name: 'Docker Hub', category: 'DevOps', description: 'Registry de imágenes Docker. Pull/push de containers.', website: 'https://hub.docker.com', logo: '🐋', placeholder: 'dckr_pat_...', docsUrl: 'https://docs.docker.com/docker-hub' },
  { id: 'sentry', name: 'Sentry', category: 'DevOps', description: 'Monitoreo de errores y performance para aplicaciones.', website: 'https://sentry.io', logo: '🐛', placeholder: 'sntrys_...', docsUrl: 'https://docs.sentry.io' },
  { id: 'datadog', name: 'Datadog', category: 'DevOps', description: 'Monitoreo de infraestructura, APM, logs y seguridad.', website: 'https://datadoghq.com', logo: '🐕', placeholder: 'dd-...', docsUrl: 'https://docs.datadoghq.com' },
  { id: 'newrelic', name: 'New Relic', category: 'DevOps', description: 'Observabilidad full-stack: APM, infra, logs, browser.', website: 'https://newrelic.com', logo: '📡', placeholder: 'NRAK-...', docsUrl: 'https://docs.newrelic.com' },
  { id: 'terraform', name: 'Terraform Cloud', category: 'DevOps', description: 'Infrastructure as Code con HCL. Gestión de cloud.', website: 'https://terraform.io', logo: '🏗️', placeholder: 'tf-...', docsUrl: 'https://developer.hashicorp.com/terraform' },

  // Mapas
  { id: 'google-maps', name: 'Google Maps', category: 'Mapas', description: 'Mapas, geocoding, rutas, Street View y Places.', website: 'https://maps.google.com', logo: '🗺️', placeholder: 'AIza...', docsUrl: 'https://developers.google.com/maps' },
  { id: 'mapbox', name: 'Mapbox', category: 'Mapas', description: 'Mapas personalizados, geocoding, navigation y search.', website: 'https://mapbox.com', logo: '🌍', placeholder: 'pk....', docsUrl: 'https://docs.mapbox.com' },
  { id: 'here', name: 'HERE Maps', category: 'Mapas', description: 'Mapas, routing, geocoding y datos de localización.', website: 'https://here.com', logo: '📍', placeholder: 'here_...', docsUrl: 'https://developer.here.com' },

  // Auth
  { id: 'auth0', name: 'Auth0', category: 'Auth', description: 'Autenticación y autorización como servicio. SSO, MFA.', website: 'https://auth0.com', logo: '🔐', placeholder: 'auth0_...', docsUrl: 'https://auth0.com/docs' },
  { id: 'clerk', name: 'Clerk', category: 'Auth', description: 'Auth para React/Next.js: login, signup, user management.', website: 'https://clerk.com', logo: '👤', placeholder: 'sk_live_...', docsUrl: 'https://clerk.com/docs' },
  { id: 'supabase-auth', name: 'Supabase Auth', category: 'Auth', description: 'Autenticación completa con Supabase: email, OAuth, MFA.', website: 'https://supabase.com', logo: '⚡', placeholder: 'sbp_...', docsUrl: 'https://supabase.com/docs/guides/auth' },
  { id: 'firebase-auth', name: 'Firebase Auth', category: 'Auth', description: 'Auth de Google: email, phone, social login, anónimo.', website: 'https://firebase.google.com', logo: '🔥', placeholder: 'AIza...', docsUrl: 'https://firebase.google.com/docs/auth' },
  { id: 'okta', name: 'Okta', category: 'Auth', description: 'Identity management empresarial: SSO, MFA, API access.', website: 'https://okta.com', logo: '🔑', placeholder: 'okta_...', docsUrl: 'https://developer.okta.com/docs' },

  // CRM & Marketing
  { id: 'hubspot', name: 'HubSpot', category: 'CRM & Marketing', description: 'CRM, marketing automation, sales y servicio al cliente.', website: 'https://hubspot.com', logo: '🧲', placeholder: 'pat-...', docsUrl: 'https://developers.hubspot.com' },
  { id: 'salesforce', name: 'Salesforce', category: 'CRM & Marketing', description: 'CRM empresarial líder mundial. Sales, Service, Marketing.', website: 'https://salesforce.com', logo: '☁️', placeholder: 'sf_...', docsUrl: 'https://developer.salesforce.com/docs' },
  { id: 'brevo', name: 'Brevo (Sendinblue)', category: 'CRM & Marketing', description: 'Email marketing, SMS, chat y CRM todo en uno.', website: 'https://brevo.com', logo: '💌', placeholder: 'xkeysib-...', docsUrl: 'https://developers.brevo.com' },
  { id: 'intercom', name: 'Intercom', category: 'CRM & Marketing', description: 'Plataforma de comunicación con clientes: chat, bots, help desk.', website: 'https://intercom.com', logo: '💬', placeholder: 'dG9r...', docsUrl: 'https://developers.intercom.com' },
  { id: 'crisp', name: 'Crisp', category: 'CRM & Marketing', description: 'Live chat, chatbots y helpdesk multichannel.', website: 'https://crisp.chat', logo: '💭', placeholder: 'crisp_...', docsUrl: 'https://docs.crisp.chat' },

  // E-commerce
  { id: 'shopify', name: 'Shopify', category: 'E-commerce', description: 'Plataforma de e-commerce: tiendas, pagos, inventario.', website: 'https://shopify.com', logo: '🛒', placeholder: 'shpat_...', docsUrl: 'https://shopify.dev/docs' },
  { id: 'woocommerce', name: 'WooCommerce', category: 'E-commerce', description: 'E-commerce para WordPress: productos, pedidos, pagos.', website: 'https://woocommerce.com', logo: '🟣', placeholder: 'ck_...', docsUrl: 'https://woocommerce.com/document' },
  { id: 'printful', name: 'Printful', category: 'E-commerce', description: 'Print-on-demand: camisetas, tazas, posters y más.', website: 'https://printful.com', logo: '👕', placeholder: 'pf_...', docsUrl: 'https://developers.printful.com' },

  // Media & Content
  { id: 'cloudinary', name: 'Cloudinary', category: 'Media', description: 'Gestión de imágenes y video: upload, transform, CDN.', website: 'https://cloudinary.com', logo: '🖼️', placeholder: 'cloudinary://...', docsUrl: 'https://cloudinary.com/documentation' },
  { id: 'imgix', name: 'imgix', category: 'Media', description: 'Procesamiento de imágenes en tiempo real vía URL.', website: 'https://imgix.com', logo: '🎞️', placeholder: 'ix-...', docsUrl: 'https://docs.imgix.com' },
  { id: 'spotify', name: 'Spotify', category: 'Media', description: 'API de Spotify: tracks, playlists, artistas y recomendaciones.', website: 'https://spotify.com', logo: '🎧', placeholder: 'BQA...', docsUrl: 'https://developer.spotify.com/documentation/web-api' },
  { id: 'unsplash', name: 'Unsplash', category: 'Media', description: 'API de fotos de alta calidad gratuitas para tu app.', website: 'https://unsplash.com', logo: '📷', placeholder: 'unsplash_...', docsUrl: 'https://unsplash.com/documentation' },
  { id: 'giphy', name: 'Giphy', category: 'Media', description: 'API de GIFs y stickers para integrar en tu app.', website: 'https://giphy.com', logo: '🎬', placeholder: 'giphy_...', docsUrl: 'https://developers.giphy.com/docs' },

  // Productividad
  { id: 'notion', name: 'Notion', category: 'Productividad', description: 'API de Notion para bases de datos, páginas y bloques.', website: 'https://notion.so', logo: '📝', placeholder: 'ntn_...', docsUrl: 'https://developers.notion.com' },
  { id: 'airtable', name: 'Airtable', category: 'Productividad', description: 'Base de datos tipo spreadsheet con API potente.', website: 'https://airtable.com', logo: '📋', placeholder: 'pat...', docsUrl: 'https://airtable.com/developers/web' },
  { id: 'google-sheets', name: 'Google Sheets', category: 'Productividad', description: 'API de Sheets para leer/escribir hojas de cálculo.', website: 'https://sheets.google.com', logo: '📗', placeholder: 'AIza...', docsUrl: 'https://developers.google.com/sheets' },
  { id: 'jira', name: 'Jira', category: 'Productividad', description: 'Project management y issue tracking de Atlassian.', website: 'https://atlassian.com/jira', logo: '📘', placeholder: 'ATATT3x...', docsUrl: 'https://developer.atlassian.com/cloud/jira' },
  { id: 'linear', name: 'Linear', category: 'Productividad', description: 'Issue tracking moderno para equipos de software.', website: 'https://linear.app', logo: '📐', placeholder: 'lin_api_...', docsUrl: 'https://developers.linear.app' },
  { id: 'trello', name: 'Trello', category: 'Productividad', description: 'Tableros Kanban para gestión de proyectos.', website: 'https://trello.com', logo: '📇', placeholder: 'ATTA...', docsUrl: 'https://developer.atlassian.com/cloud/trello' },
  { id: 'zapier', name: 'Zapier', category: 'Productividad', description: 'Automatización: conecta 5000+ apps sin código.', website: 'https://zapier.com', logo: '⚡', placeholder: 'zap_...', docsUrl: 'https://platform.zapier.com/docs' },
  { id: 'make', name: 'Make (Integromat)', category: 'Productividad', description: 'Automatización visual de workflows complejos.', website: 'https://make.com', logo: '🔄', placeholder: 'make_...', docsUrl: 'https://www.make.com/en/api-documentation' },
  { id: 'google-calendar', name: 'Google Calendar', category: 'Productividad', description: 'API de Google Calendar: eventos, recordatorios, invitaciones.', website: 'https://calendar.google.com', logo: '📅', placeholder: 'AIza...', docsUrl: 'https://developers.google.com/calendar' },

  // Seguridad
  { id: 'recaptcha', name: 'reCAPTCHA', category: 'Seguridad', description: 'Protección contra bots de Google: v2, v3 y Enterprise.', website: 'https://www.google.com/recaptcha', logo: '🛡️', placeholder: '6Le...', docsUrl: 'https://developers.google.com/recaptcha' },
  { id: 'hcaptcha', name: 'hCaptcha', category: 'Seguridad', description: 'CAPTCHA que respeta la privacidad, alternativa a reCAPTCHA.', website: 'https://hcaptcha.com', logo: '🔒', placeholder: '0x...', docsUrl: 'https://docs.hcaptcha.com' },
  { id: 'snyk', name: 'Snyk', category: 'Seguridad', description: 'Análisis de vulnerabilidades en código y dependencias.', website: 'https://snyk.io', logo: '🐍', placeholder: 'snyk-...', docsUrl: 'https://docs.snyk.io' },

  // ── Pagos (extra) ──
  { id: 'monei', name: 'MONEI', category: 'Pagos', description: 'Pasarela de pagos española: tarjetas, Bizum, Apple Pay y Google Pay.', website: 'https://monei.com', logo: '💶', placeholder: 'pk_...', docsUrl: 'https://docs.monei.com' },
  { id: 'redsys', name: 'Redsys', category: 'Pagos', description: 'Pasarela y TPV virtual muy usada en España para comercio electrónico seguro.', website: 'https://www.redsys.es', logo: '🏦', placeholder: 'Ds_Merchant_...', docsUrl: 'https://pagosonline.redsys.es/desarrolladores-inicio.html' },
  { id: 'sequra', name: 'SeQura', category: 'Pagos', description: 'Soluciones de pago aplazado y BNPL para e-commerce con enfoque en conversión.', website: 'https://sequra.es', logo: '📅', placeholder: 'sq_...', docsUrl: 'https://sequra.es/desarrolladores' },
  { id: 'adyen', name: 'Adyen', category: 'Pagos', description: 'Plataforma global de pagos omnicanal para tarjetas, wallets y métodos locales.', website: 'https://www.adyen.com', logo: '💳', placeholder: 'AQE...', docsUrl: 'https://docs.adyen.com' },
  { id: 'klarna', name: 'Klarna', category: 'Pagos', description: 'Pagos aplazados y checkout optimizado para aumentar ventas en tiendas online.', website: 'https://www.klarna.com', logo: '🛍️', placeholder: 'K1234567890...', docsUrl: 'https://docs.klarna.com' },
  { id: 'paddle', name: 'Paddle', category: 'Pagos', description: 'Facturación y cobros para SaaS y software con gestión fiscal integrada.', website: 'https://www.paddle.com', logo: '🧾', placeholder: 'pdl_...', docsUrl: 'https://developer.paddle.com' },
  { id: 'lemon-squeezy', name: 'Lemon Squeezy', category: 'Pagos', description: 'Merchant of record para vender licencias y suscripciones de productos digitales.', website: 'https://www.lemonsqueezy.com', logo: '🍋', placeholder: 'ls_...', docsUrl: 'https://docs.lemonsqueezy.com' },
  { id: 'chargebee', name: 'Chargebee', category: 'Pagos', description: 'Facturación recurrente, suscripciones e integración con múltiples pasarelas.', website: 'https://www.chargebee.com', logo: '🔁', placeholder: 'cb_...', docsUrl: 'https://apidocs.chargebee.com' },
  { id: 'razorpay', name: 'Razorpay', category: 'Pagos', description: 'Pasarela de pagos india con soporte para UPI, tarjetas y pagos recurrentes.', website: 'https://razorpay.com', logo: '🇮🇳', placeholder: 'rzp_...', docsUrl: 'https://razorpay.com/docs' },
  { id: 'payu', name: 'PayU', category: 'Pagos', description: 'Procesamiento de pagos online en mercados emergentes de Europa y Latinoamérica.', website: 'https://corporate.payu.com', logo: '🌎', placeholder: 'payu_...', docsUrl: 'https://docs.payu.com' },
  { id: 'dlocal', name: 'dLocal', category: 'Pagos', description: 'Pagos locales en LATAM y mercados emergentes con liquidación internacional.', website: 'https://www.dlocal.com', logo: '🌐', placeholder: 'dl_...', docsUrl: 'https://docs.dlocal.com' },
  { id: 'worldline', name: 'Worldline', category: 'Pagos', description: 'Servicios de pago y adquirencia para comercios y grandes volúmenes transaccionales.', website: 'https://worldline.com', logo: '🏛️', placeholder: 'wl_...', docsUrl: 'https://docs.worldline.com' },
  { id: 'checkout-com', name: 'Checkout.com', category: 'Pagos', description: 'API de pagos unificada con adquirencia, riesgo y datos de rendimiento.', website: 'https://www.checkout.com', logo: '✅', placeholder: 'sk_...', docsUrl: 'https://www.checkout.com/docs' },
  { id: 'braintree', name: 'Braintree', category: 'Pagos', description: 'SDK y API de PayPal para pagos web y móviles con múltiples métodos.', website: 'https://www.braintreepayments.com', logo: '💰', placeholder: 'access_token$...', docsUrl: 'https://developer.paypal.com/braintree/docs' },
  { id: 'mollie', name: 'Mollie', category: 'Pagos', description: 'Pasarela europea con iDEAL, tarjetas y métodos locales para PYMEs.', website: 'https://www.mollie.com', logo: '🇳🇱', placeholder: 'live_...', docsUrl: 'https://docs.mollie.com' },
  { id: 'paycomet', name: 'Paycomet', category: 'Pagos', description: 'TPV virtual y tokenización para comercios en España con cumplimiento PCI.', website: 'https://www.paycomet.com', logo: '🔐', placeholder: 'merchant_...', docsUrl: 'https://docs.paycomet.com' },
  { id: 'openpay', name: 'Openpay', category: 'Pagos', description: 'Pasarela de pagos en México con tarjetas, OXXO y transferencias.', website: 'https://www.openpay.mx', logo: '🇲🇽', placeholder: 'sk_...', docsUrl: 'https://www.openpay.mx/docs' },
  { id: 'paymongo', name: 'PayMongo', category: 'Pagos', description: 'API de pagos para negocios en Filipinas con tarjetas y e-wallets.', website: 'https://www.paymongo.com', logo: '🇵🇭', placeholder: 'sk_...', docsUrl: 'https://developers.paymongo.com' },
  { id: 'gocardless', name: 'GoCardless', category: 'Pagos', description: 'Cobros por domiciliación bancaria SEPA y débito directo recurrente.', website: 'https://gocardless.com', logo: '🏧', placeholder: 'live_...', docsUrl: 'https://developer.gocardless.com' },
  { id: 'afterpay-clearpay', name: 'Afterpay / Clearpay', category: 'Pagos', description: 'Compra ahora y paga después integrada en checkout para retail online.', website: 'https://www.afterpay.com', logo: '⏳', placeholder: 'ap_...', docsUrl: 'https://developers.afterpay.com' },

  // ── AI & ML (extra) ──
  { id: 'openrouter', name: 'OpenRouter', category: 'AI & ML', description: 'Gateway unificado para consumir cientos de modelos LLM con una sola API.', website: 'https://openrouter.ai', logo: '🔀', placeholder: 'sk-or-...', docsUrl: 'https://openrouter.ai/docs' },
  { id: 'assemblyai', name: 'AssemblyAI', category: 'AI & ML', description: 'Transcripción, resúmenes y análisis de audio con modelos de vanguardia.', website: 'https://www.assemblyai.com', logo: '🎙️', placeholder: '...', docsUrl: 'https://www.assemblyai.com/docs' },
  { id: 'deepgram', name: 'Deepgram', category: 'AI & ML', description: 'Reconocimiento de voz y transcripción en tiempo real de baja latencia.', website: 'https://deepgram.com', logo: '📡', placeholder: '...', docsUrl: 'https://developers.deepgram.com' },
  { id: 'fal-ai', name: 'fal.ai', category: 'AI & ML', description: 'Inferencia y generación de imágenes/video en la nube con modelos abiertos.', website: 'https://fal.ai', logo: '⚡', placeholder: 'fal_...', docsUrl: 'https://fal.ai/docs' },
  { id: 'together-ai', name: 'Together AI', category: 'AI & ML', description: 'Infraestructura para entrenar y desplegar modelos open source a escala.', website: 'https://www.together.ai', logo: '🤝', placeholder: '...', docsUrl: 'https://docs.together.ai' },
  { id: 'fireworks-ai', name: 'Fireworks AI', category: 'AI & ML', description: 'Inferencia rápida de LLM y embeddings para aplicaciones en producción.', website: 'https://fireworks.ai', logo: '🎆', placeholder: 'fw_...', docsUrl: 'https://docs.fireworks.ai' },
  { id: 'pinecone', name: 'Pinecone', category: 'AI & ML', description: 'Base de datos vectorial gestionada para búsqueda semántica y RAG.', website: 'https://www.pinecone.io', logo: '🌲', placeholder: 'pcsk_...', docsUrl: 'https://docs.pinecone.io' },
  { id: 'weaviate', name: 'Weaviate', category: 'AI & ML', description: 'Motor de búsqueda vectorial open source con módulos de ML integrados.', website: 'https://weaviate.io', logo: '🔎', placeholder: 'wcs_...', docsUrl: 'https://weaviate.io/developers/weaviate' },
  { id: 'qdrant-cloud', name: 'Qdrant Cloud', category: 'AI & ML', description: 'Base vectorial de alto rendimiento para filtrado y búsqueda por similitud.', website: 'https://qdrant.tech', logo: '🎯', placeholder: '...', docsUrl: 'https://qdrant.tech/documentation' },
  { id: 'langsmith', name: 'LangSmith', category: 'AI & ML', description: 'Observabilidad, trazas y evaluación para cadenas LangChain en producción.', website: 'https://www.langchain.com/langsmith', logo: '🧪', placeholder: 'lsv2_...', docsUrl: 'https://docs.smith.langchain.com' },
  { id: 'humanloop', name: 'Humanloop', category: 'AI & ML', description: 'Plataforma para iterar prompts, evaluar y desplegar LLM con feedback humano.', website: 'https://humanloop.com', logo: '🔁', placeholder: 'hl_...', docsUrl: 'https://docs.humanloop.com' },
  { id: 'roboflow', name: 'Roboflow', category: 'AI & ML', description: 'Etiquetado, entrenamiento y despliegue de modelos de visión por computador.', website: 'https://roboflow.com', logo: '👁️', placeholder: 'rf_...', docsUrl: 'https://docs.roboflow.com' },
  { id: 'jina-ai', name: 'Jina AI', category: 'AI & ML', description: 'Embeddings y búsqueda multimodal para texto, imágenes y documentos.', website: 'https://jina.ai', logo: '🧬', placeholder: 'jina_...', docsUrl: 'https://jina.ai/embeddings' },
  { id: 'modal-labs', name: 'Modal', category: 'AI & ML', description: 'Ejecución serverless de cargas GPU/CPU para ML e inferencia a escala.', website: 'https://modal.com', logo: '☁️', placeholder: 'ak-...', docsUrl: 'https://modal.com/docs' },
  { id: 'voyage-ai', name: 'Voyage AI', category: 'AI & ML', description: 'Modelos de embeddings especializados para RAG y recuperación de contexto.', website: 'https://www.voyageai.com', logo: '🧭', placeholder: 'pa-...', docsUrl: 'https://docs.voyageai.com' },
  { id: 'runpod', name: 'RunPod', category: 'AI & ML', description: 'Alquiler de GPUs en la nube para entrenamiento e inferencia de modelos.', website: 'https://www.runpod.io', logo: '🖥️', placeholder: 'rpa_...', docsUrl: 'https://docs.runpod.io' },
  { id: 'lambda-labs', name: 'Lambda Labs', category: 'AI & ML', description: 'Instancias GPU cloud y hardware para deep learning de alto rendimiento.', website: 'https://lambdalabs.com', logo: 'λ', placeholder: 'secret_...', docsUrl: 'https://docs.lambdalabs.com' },
  { id: 'baseten', name: 'Baseten', category: 'AI & ML', description: 'Despliegue y escalado de modelos ML con endpoints listos para producción.', website: 'https://www.baseten.co', logo: '🏗️', placeholder: '...', docsUrl: 'https://docs.baseten.co' },
  { id: 'anyscale', name: 'Anyscale', category: 'AI & ML', description: 'Ray en la nube para entrenamiento distribuido y orquestación de ML.', website: 'https://www.anyscale.com', logo: '📶', placeholder: 'anyscale_...', docsUrl: 'https://docs.anyscale.com' },
  { id: 'weights-biases', name: 'Weights & Biases', category: 'AI & ML', description: 'Seguimiento de experimentos, artefactos y monitorización de modelos.', website: 'https://wandb.ai', logo: '📊', placeholder: 'wandb_...', docsUrl: 'https://docs.wandb.ai' },
  { id: 'scale-ai', name: 'Scale AI', category: 'AI & ML', description: 'Etiquetado de datos y evaluación para modelos de visión y lenguaje.', website: 'https://scale.com', logo: '🏷️', placeholder: 'live_...', docsUrl: 'https://docs.scale.com' },
  { id: 'cohere-rerank', name: 'Cohere Rerank', category: 'AI & ML', description: 'Reordenación semántica de resultados para mejorar precisión en búsqueda.', website: 'https://cohere.com', logo: '📑', placeholder: '...', docsUrl: 'https://docs.cohere.com' },

  // ── IoT ──
  { id: 'particle', name: 'Particle', category: 'IoT', description: 'Plataforma y conectividad para dispositivos embebidos y edge con OTA y reglas.', website: 'https://www.particle.io', logo: '⚛️', placeholder: 'particle_...', docsUrl: 'https://docs.particle.io' },
  { id: 'blynk', name: 'Blynk', category: 'IoT', description: 'Constructor visual de apps móviles y firmware para prototipos y productos IoT.', website: 'https://blynk.io', logo: '📲', placeholder: 'BLYNK_AUTH_...', docsUrl: 'https://docs.blynk.io' },
  { id: 'thingsboard', name: 'ThingsBoard', category: 'IoT', description: 'Plataforma open source para telemetría, reglas, dashboards y gemelos digitales.', website: 'https://thingsboard.io', logo: '📟', placeholder: 'tb_...', docsUrl: 'https://thingsboard.io/docs' },
  { id: 'adafruit-io', name: 'Adafruit IO', category: 'IoT', description: 'Nube sencilla para sensores, feeds y automatizaciones de proyectos maker.', website: 'https://io.adafruit.com', logo: '🧵', placeholder: 'aio_...', docsUrl: 'https://learn.adafruit.com/adafruit-io' },
  { id: 'tuya-smart', name: 'Tuya Smart', category: 'IoT', description: 'Ecosistema PaaS para dispositivos inteligentes del hogar y apps white-label.', website: 'https://www.tuya.com', logo: '🏠', placeholder: 'tuya_...', docsUrl: 'https://developer.tuya.com' },
  { id: 'shelly-cloud', name: 'Shelly Cloud', category: 'IoT', description: 'API y automatización para relés, medidores y dispositivos Shelly en el hogar.', website: 'https://www.shelly.com', logo: '🔌', placeholder: 'shelly_...', docsUrl: 'https://shelly-api-docs.shelly.cloud' },
  { id: 'onomondo', name: 'Onomondo', category: 'IoT', description: 'SIMs y red global con visibilidad fina del tráfico M2M para flotas de dispositivos.', website: 'https://onomondo.com', logo: '📶', placeholder: 'ono_...', docsUrl: 'https://docs.onomondo.com' },
  { id: 'hologram', name: 'Hologram', category: 'IoT', description: 'Conectividad celular IoT con SIM y API para enrutar datos de campo a la nube.', website: 'https://www.hologram.io', logo: '🛰️', placeholder: 'hologram_...', docsUrl: 'https://docs.hologram.io' },

  // ── Fintech ──
  { id: 'plaid', name: 'Plaid', category: 'Fintech', description: 'Agregación bancaria y verificación de cuentas para apps de finanzas personales.', website: 'https://plaid.com', logo: '🏦', placeholder: 'plaid_...', docsUrl: 'https://plaid.com/docs' },
  { id: 'truelayer', name: 'TrueLayer', category: 'Fintech', description: 'Open banking europeo para pagos iniciados y acceso a datos con consentimiento.', website: 'https://truelayer.com', logo: '🔗', placeholder: 'tl_...', docsUrl: 'https://docs.truelayer.com' },
  { id: 'tink', name: 'Tink', category: 'Fintech', description: 'APIs de datos financieros y pagos para banca, lending y personal finance.', website: 'https://tink.com', logo: '💡', placeholder: 'tink_...', docsUrl: 'https://docs.tink.com' },
  { id: 'yodlee', name: 'Yodlee', category: 'Fintech', description: 'Agregación de cuentas y datos de transacciones para servicios financieros.', website: 'https://www.yodlee.com', logo: '📒', placeholder: 'yodlee_...', docsUrl: 'https://developer.yodlee.com' },
  { id: 'marqeta', name: 'Marqeta', category: 'Fintech', description: 'Emisión de tarjetas virtuales y físicas con control programático de reglas.', website: 'https://www.marqeta.com', logo: '💳', placeholder: 'AppToken ...', docsUrl: 'https://www.marqeta.com/docs' },
  { id: 'wise-platform', name: 'Wise Platform', category: 'Fintech', description: 'Pagos internacionales y cuentas multi-divisa integrados vía API para partners.', website: 'https://wise.com', logo: '🌍', placeholder: 'wise_...', docsUrl: 'https://docs.wise.com' },
  { id: 'mercury-bank', name: 'Mercury', category: 'Fintech', description: 'Banca para startups con API de cuentas, tarjetas y automatización contable.', website: 'https://mercury.com', logo: '☿️', placeholder: 'mercury_...', docsUrl: 'https://docs.mercury.com' },
  { id: 'brex', name: 'Brex', category: 'Fintech', description: 'Tarjetas corporativas y spend management con integraciones y límites dinámicos.', website: 'https://www.brex.com', logo: '🏢', placeholder: 'brex_...', docsUrl: 'https://developer.brex.com' },

  // ── Blockchain ──
  { id: 'alchemy', name: 'Alchemy', category: 'Blockchain', description: 'Infraestructura de nodos y APIs para Ethereum, L2 y lectura de contratos.', website: 'https://www.alchemy.com', logo: '⚗️', placeholder: 'alchemy_...', docsUrl: 'https://docs.alchemy.com' },
  { id: 'infura', name: 'Infura', category: 'Blockchain', description: 'Acceso a redes Ethereum e IPFS con endpoints gestionados y cuotas escalables.', website: 'https://www.infura.io', logo: '🌐', placeholder: '...', docsUrl: 'https://docs.infura.io' },
  { id: 'moralis', name: 'Moralis', category: 'Blockchain', description: 'Backend Web3 con indexación, auth de wallet y APIs para dApps.', website: 'https://moralis.io', logo: '🦊', placeholder: 'moralis_...', docsUrl: 'https://docs.moralis.io' },
  { id: 'etherscan', name: 'Etherscan', category: 'Blockchain', description: 'Explorador y API de datos on-chain, logs y verificación de contratos.', website: 'https://etherscan.io', logo: '🔍', placeholder: 'YourApiKey...', docsUrl: 'https://docs.etherscan.io' },
  { id: 'chainlink', name: 'Chainlink', category: 'Blockchain', description: 'Oráculos descentralizados que conectan contratos inteligentes con datos del mundo real.', website: 'https://chain.link', logo: '⛓️', placeholder: '0x...', docsUrl: 'https://docs.chain.link' },
  { id: 'quicknode', name: 'QuickNode', category: 'Blockchain', description: 'Endpoints RPC de baja latencia para múltiples cadenas y analítica Web3.', website: 'https://www.quicknode.com', logo: '⚡', placeholder: 'qn_...', docsUrl: 'https://www.quicknode.com/docs' },
  { id: 'thirdweb', name: 'thirdweb', category: 'Blockchain', description: 'SDKs y paneles para desplegar NFTs, marketplaces y contratos sin fricción.', website: 'https://thirdweb.com', logo: '🧱', placeholder: 'tw_...', docsUrl: 'https://portal.thirdweb.com' },
  { id: 'helius', name: 'Helius', category: 'Blockchain', description: 'Infraestructura Solana: RPC, webhooks parseados y búsqueda de transacciones.', website: 'https://www.helius.dev', logo: '☀️', placeholder: 'helius_...', docsUrl: 'https://docs.helius.dev' },

  // ── Testing ──
  { id: 'browserstack', name: 'BrowserStack', category: 'Testing', description: 'Nube de navegadores y dispositivos reales para pruebas manuales y automatizadas.', website: 'https://www.browserstack.com', logo: '🖥️', placeholder: 'BROWSERSTACK_...', docsUrl: 'https://www.browserstack.com/docs' },
  { id: 'lambdatest', name: 'LambdaTest', category: 'Testing', description: 'Grid en la nube para Selenium, Cypress y pruebas visuales multiplataforma.', website: 'https://www.lambdatest.com', logo: 'λ', placeholder: 'LT_...', docsUrl: 'https://www.lambdatest.com/support/docs' },
  { id: 'cypress-cloud', name: 'Cypress Cloud', category: 'Testing', description: 'Paralelización, grabación y analítica de suites E2E de Cypress en CI.', website: 'https://www.cypress.io', logo: '🌲', placeholder: 'cypress_...', docsUrl: 'https://docs.cypress.io/cloud' },
  { id: 'k6-cloud', name: 'Grafana k6 Cloud', category: 'Testing', description: 'Pruebas de carga como código con métricas, umbrales y ejecución distribuida.', website: 'https://k6.io', logo: '📈', placeholder: 'k6_...', docsUrl: 'https://grafana.com/docs/grafana-cloud/k6' },
  { id: 'saucelabs', name: 'Sauce Labs', category: 'Testing', description: 'Testing continuo en dispositivos reales y emuladores para web y apps móviles.', website: 'https://saucelabs.com', logo: '🥫', placeholder: 'SAUCE_...', docsUrl: 'https://docs.saucelabs.com' },
  { id: 'applitools', name: 'Applitools', category: 'Testing', description: 'Validación visual inteligente con IA para UI y regresiones cross-browser.', website: 'https://applitools.com', logo: '👁️', placeholder: 'APPLITOOLS_...', docsUrl: 'https://applitools.com/docs' },
  { id: 'testingbot', name: 'TestingBot', category: 'Testing', description: 'Selenium y Appium en la nube con miles de combinaciones navegador/OS.', website: 'https://testingbot.com', logo: '🤖', placeholder: 'key_...', docsUrl: 'https://testingbot.com/support' },
  { id: 'loadmill', name: 'Loadmill', category: 'Testing', description: 'Tests de carga basados en tráfico real reproducido desde sesiones de usuario.', website: 'https://www.loadmill.com', logo: '🧨', placeholder: 'loadmill_...', docsUrl: 'https://docs.loadmill.com' },

  // ── CDN & Performance ──
  { id: 'bunny-net', name: 'Bunny.net', category: 'CDN & Performance', description: 'CDN, almacenamiento y streaming de video con precios simples y PoPs globales.', website: 'https://bunny.net', logo: '🐰', placeholder: 'bunny_...', docsUrl: 'https://docs.bunny.net' },
  { id: 'fastly-api', name: 'Fastly', category: 'CDN & Performance', description: 'Edge computing y CDN programable con VCL y compute@edge para latencia mínima.', website: 'https://www.fastly.com', logo: '🚀', placeholder: 'FASTLYKEY...', docsUrl: 'https://developer.fastly.com' },
  { id: 'keycdn', name: 'KeyCDN', category: 'CDN & Performance', description: 'CDN HTTP/2 y TLS con panel simple, zonas pull/push y reglas de caché.', website: 'https://www.keycdn.com', logo: '🔑', placeholder: 'keycdn_...', docsUrl: 'https://www.keycdn.com/documentation' },
  { id: 'akamai-api', name: 'Akamai', category: 'CDN & Performance', description: 'Red de distribución y seguridad perimetral para sitios y APIs de alto tráfico.', website: 'https://www.akamai.com', logo: '🛡️', placeholder: 'akamai_...', docsUrl: 'https://techdocs.akamai.com' },
  { id: 'imagekit-io', name: 'ImageKit', category: 'CDN & Performance', description: 'Optimización, transformación y entrega de imágenes y vídeo desde la edge.', website: 'https://imagekit.io', logo: '🖼️', placeholder: 'private_...', docsUrl: 'https://docs.imagekit.io' },
  { id: 'imgproxy', name: 'imgproxy', category: 'CDN & Performance', description: 'Servidor de redimensionado y procesado de imágenes on-the-fly, ideal en contenedores.', website: 'https://imgproxy.net', logo: '🧩', placeholder: 'IMGPROXY_KEY...', docsUrl: 'https://docs.imgproxy.net' },
  { id: 'cloudimage', name: 'Cloudimage', category: 'CDN & Performance', description: 'CDN de imágenes con recorte, compresión y lazy loading acelerado.', website: 'https://www.cloudimage.io', logo: '☁️', placeholder: 'token/...', docsUrl: 'https://docs.cloudimage.io' },
  { id: 'cachefly', name: 'CacheFly', category: 'CDN & Performance', description: 'CDN orientado a baja latencia para descargas, actualizaciones y gaming.', website: 'https://www.cachefly.com', logo: '🎯', placeholder: 'cachefly_...', docsUrl: 'https://docs.cachefly.com' },

  // ── Search ──
  { id: 'algolia', name: 'Algolia', category: 'Search', description: 'Búsqueda como servicio con typo-tolerance, facetas y ranking personalizable.', website: 'https://www.algolia.com', logo: '🔎', placeholder: 'Algolia_...', docsUrl: 'https://www.algolia.com/doc' },
  { id: 'typesense', name: 'Typesense', category: 'Search', description: 'Motor de búsqueda open source ultrarrápido con API REST y tolerancia a errores.', website: 'https://typesense.org', logo: '📇', placeholder: 'xyz...', docsUrl: 'https://typesense.org/docs' },
  { id: 'meilisearch-cloud', name: 'Meilisearch Cloud', category: 'Search', description: 'Búsqueda instantánea con relevancia ajustable e indexación sencilla.', website: 'https://www.meilisearch.com', logo: '⚡', placeholder: 'masterKey...', docsUrl: 'https://www.meilisearch.com/docs' },
  { id: 'swiftype', name: 'Swiftype (Elastic)', category: 'Search', description: 'Búsqueda para sitios y SaaS con analítica de consultas y sinónimos.', website: 'https://swiftype.com', logo: '🧭', placeholder: 'st_...', docsUrl: 'https://swiftype.com/documentation' },
  { id: 'addsearch', name: 'AddSearch', category: 'Search', description: 'Búsqueda integrable en webs y e-commerce con filtros y sugerencias.', website: 'https://www.addsearch.com', logo: '➕', placeholder: 'addsearch_...', docsUrl: 'https://www.addsearch.com/docs' },
  { id: 'azure-ai-search', name: 'Azure AI Search', category: 'Search', description: 'Índice cognitivo híbrido con vectores, OCR y enriquecimiento con modelos.', website: 'https://azure.microsoft.com/products/ai-services/ai-search', logo: '🔷', placeholder: 'search_...', docsUrl: 'https://learn.microsoft.com/azure/search/' },
  { id: 'site-search-360', name: 'Site Search 360', category: 'Search', description: 'Motor de búsqueda para sitios con control de ranking y sin resultados vacíos.', website: 'https://sitesearch360.com', logo: '🔢', placeholder: 'ss360_...', docsUrl: 'https://sitesearch360.com/documentation' },
  { id: 'searchblox', name: 'SearchBlox', category: 'Search', description: 'Búsqueda empresarial con conectores, seguridad y analítica de uso.', website: 'https://www.searchblox.com', logo: '📚', placeholder: 'sb_...', docsUrl: 'https://www.searchblox.com/docs' },

  // ── Logistics ──
  { id: 'ups-developer', name: 'UPS Developer', category: 'Logistics', description: 'Envíos, etiquetas, seguimiento y tiempos de tránsito de paquetería global.', website: 'https://developer.ups.com', logo: '📦', placeholder: 'ups_...', docsUrl: 'https://developer.ups.com/api/reference' },
  { id: 'fedex-developer', name: 'FedEx Developer', category: 'Logistics', description: 'APIs de envío, tasación y rastreo para integraciones logísticas B2B.', website: 'https://developer.fedex.com', logo: '✈️', placeholder: 'fedex_...', docsUrl: 'https://developer.fedex.com/api/en-us/catalog' },
  { id: 'dhl-express', name: 'DHL Express API', category: 'Logistics', description: 'Cotización, recogidas y tracking para envíos express internacionales.', website: 'https://developer.dhl.com', logo: '🚚', placeholder: 'dhl_...', docsUrl: 'https://developer.dhl.com/api-reference' },
  { id: 'shipstation-api', name: 'ShipStation', category: 'Logistics', description: 'Centraliza transportistas, etiquetas y pedidos de múltiples canales de venta.', website: 'https://www.shipstation.com', logo: '🏷️', placeholder: 'SS-...', docsUrl: 'https://www.shipstation.com/docs/api' },
  { id: 'easypost', name: 'EasyPost', category: 'Logistics', description: 'API unificada de paquetería con comparación de tarifas y seguimiento.', website: 'https://www.easypost.com', logo: '📬', placeholder: 'EZTK...', docsUrl: 'https://docs.easypost.com' },
  { id: 'aftership', name: 'AfterShip', category: 'Logistics', description: 'Seguimiento post-compra, notificaciones y analítica de entregas multitransportista.', website: 'https://www.aftership.com', logo: '🛰️', placeholder: 'as_...', docsUrl: 'https://www.aftership.com/docs' },
  { id: 'shippo-api', name: 'Shippo', category: 'Logistics', description: 'Comparación de etiquetas y aduanas con normalización de direcciones.', website: 'https://goshippo.com', logo: '🐶', placeholder: 'shippo_...', docsUrl: 'https://docs.goshippo.com' },
  { id: 'sendcloud', name: 'Sendcloud', category: 'Logistics', description: 'Checkout de envíos y automatización para e-commerce europeo multitransportista.', website: 'https://www.sendcloud.es', logo: '🇪🇺', placeholder: 'sc_...', docsUrl: 'https://api.sendcloud.dev' },

  // ── Healthcare ──
  { id: 'epic-fhir', name: 'Epic (FHIR)', category: 'Healthcare', description: 'Interoperabilidad clínica con APIs FHIR para historias, citas y resultados.', website: 'https://open.epic.com', logo: '🏥', placeholder: 'epic_...', docsUrl: 'https://open.epic.com/Documentation' },
  { id: 'athenahealth', name: 'athenahealth', category: 'Healthcare', description: 'APIs de EHR para citas, facturación y datos de pacientes en EE. UU.', website: 'https://www.athenahealth.com', logo: '⚕️', placeholder: 'athena_...', docsUrl: 'https://docs.athenahealth.com' },
  { id: 'human-api', name: 'Human API', category: 'Healthcare', description: 'Agregación de registros de salud con consentimiento del usuario vía conexiones.', website: 'https://www.humanapi.co', logo: '🫀', placeholder: 'human_...', docsUrl: 'https://docs.humanapi.co' },
  { id: 'dosespot', name: 'DoseSpot', category: 'Healthcare', description: 'ePrescribing y gestión de medicamentos para proveedores digitales.', website: 'https://www.dosespot.com', logo: '💊', placeholder: 'ds_...', docsUrl: 'https://www.dosespot.com/api-documentation' },
  { id: 'flexpa', name: 'Flexpa', category: 'Healthcare', description: 'Acceso FHIR a pagadores y planes para apps de beneficios y precios.', website: 'https://www.flexpa.com', logo: '🧾', placeholder: 'flexpa_...', docsUrl: 'https://docs.flexpa.com' },
  { id: 'health-gorilla', name: 'Health Gorilla', category: 'Healthcare', description: 'Intercambio clínico y laboratorio con APIs de datos agregados.', website: 'https://www.healthgorilla.com', logo: '🦍', placeholder: 'hg_...', docsUrl: 'https://developer.healthgorilla.com' },
  { id: 'oracle-health-api', name: 'Oracle Health', category: 'Healthcare', description: 'Integraciones sobre registros clínicos empresariales y flujos hospitalarios.', website: 'https://www.oracle.com/health', logo: '🔶', placeholder: 'oh_...', docsUrl: 'https://docs.oracle.com/en/industries/health/' },
  { id: 'teladoc-developer', name: 'Teladoc Health', category: 'Healthcare', description: 'Telemedicina B2B con APIs de programación y datos de visitas virtuales.', website: 'https://www.teladochealth.com', logo: '📞', placeholder: 'teladoc_...', docsUrl: 'https://developers.teladoc.com' },

  // ── Education ──
  { id: 'instructure-canvas', name: 'Canvas LMS', category: 'Education', description: 'LMS líder con REST y LTI para cursos, tareas y calificaciones.', website: 'https://www.instructure.com/canvas', logo: '🎓', placeholder: 'canvas_...', docsUrl: 'https://canvas.instructure.com/doc/api' },
  { id: 'clever-com', name: 'Clever', category: 'Education', description: 'Single sign-on y aprovisionamiento para escuelas y edtech.', website: 'https://www.clever.com', logo: '🧠', placeholder: 'clever_...', docsUrl: 'https://dev.clever.com' },
  { id: 'classlink', name: 'ClassLink', category: 'Education', description: 'Acceso unificado y analítica de uso de aplicaciones educativas.', website: 'https://www.classlink.com', logo: '🔗', placeholder: 'classlink_...', docsUrl: 'https://docs.classlink.com' },
  { id: 'turnitin', name: 'Turnitin', category: 'Education', description: 'Originalidad y retroalimentación de escritura con integraciones LMS.', website: 'https://www.turnitin.com', logo: '📝', placeholder: 'turnitin_...', docsUrl: 'https://guides.turnitin.com' },
  { id: 'blackboard-learn', name: 'Blackboard Learn', category: 'Education', description: 'APIs de cursos, usuarios y contenido para campus virtuales.', website: 'https://www.anthology.com/blackboard', logo: '⬛', placeholder: 'bb_...', docsUrl: 'https://developer.anthology.com' },
  { id: 'moodle-cloud', name: 'Moodle', category: 'Education', description: 'Plataforma open source de enseñanza con web services y plugins.', website: 'https://moodle.com', logo: '📘', placeholder: 'wstoken=...', docsUrl: 'https://docs.moodle.org/dev/Web_services' },
  { id: 'google-classroom-api', name: 'Google Classroom', category: 'Education', description: 'Gestión de clases, deberes y entregas integrada con Google Workspace.', website: 'https://developers.google.com/classroom', logo: '🏫', placeholder: 'ya29...', docsUrl: 'https://developers.google.com/classroom' },
  { id: 'edmodo', name: 'Edmodo', category: 'Education', description: 'Red educativa para tareas, mensajes y recursos entre alumnos y familias.', website: 'https://www.edmodo.com', logo: '📣', placeholder: 'edmodo_...', docsUrl: 'https://api.edmodo.com' },

  // ── Legal ──
  { id: 'clio', name: 'Clio', category: 'Legal', description: 'Practice management legal con API de asuntos, facturación y contactos.', website: 'https://www.clio.com', logo: '⚖️', placeholder: 'clio_...', docsUrl: 'https://app.clio.com/api/v4/documentation' },
  { id: 'docusign', name: 'DocuSign', category: 'Legal', description: 'Firma electrónica y flujos de acuerdos con plantillas y webhooks.', website: 'https://www.docusign.com', logo: '✍️', placeholder: 'integrator_key...', docsUrl: 'https://developers.docusign.com' },
  { id: 'pandadoc', name: 'PandaDoc', category: 'Legal', description: 'Propuestas y contratos con campos dinámicos y cobro integrado.', website: 'https://www.pandadoc.com', logo: '🐼', placeholder: 'api_key_...', docsUrl: 'https://developers.pandadoc.com' },
  { id: 'ironclad', name: 'Ironclad', category: 'Legal', description: 'CLM con workflows legales, repositorio y extracción de cláusulas.', website: 'https://ironcladapp.com', logo: '🛡️', placeholder: 'ironclad_...', docsUrl: 'https://developer.ironcladapp.com' },
  { id: 'iubenda', name: 'iubenda', category: 'Legal', description: 'Generación y gestión de políticas, cookies y consentimientos conforme a normas.', website: 'https://www.iubenda.com', logo: '📜', placeholder: 'iub_...', docsUrl: 'https://www.iubenda.com/en/api' },
  { id: 'lexisnexis-risk', name: 'LexisNexis Risk', category: 'Legal', description: 'Datos y scoring para cumplimiento KYC/AML y prevención de fraude.', website: 'https://risk.lexisnexis.com', logo: '📚', placeholder: 'ln_...', docsUrl: 'https://developer.lexisnexis.com' },
  { id: 'rocket-lawyer-dev', name: 'Rocket Lawyer', category: 'Legal', description: 'Documentos legales on-demand y firma para PYMEs y consumidores.', website: 'https://www.rocketlawyer.com', logo: '🚀', placeholder: 'rl_...', docsUrl: 'https://developer.rocketlawyer.com' },
  { id: 'contractbook', name: 'Contractbook', category: 'Legal', description: 'Repositorio contractual con datos estructurados y automatización post-firma.', website: 'https://contractbook.com', logo: '📑', placeholder: 'cb_...', docsUrl: 'https://api.contractbook.com' },

  // ── HR ──
  { id: 'bamboohr', name: 'BambooHR', category: 'HR', description: 'RRHH para PYMEs con API de empleados, ausencias y onboarding.', website: 'https://www.bamboohr.com', logo: '🎋', placeholder: 'bamboo_...', docsUrl: 'https://documentation.bamboohr.com' },
  { id: 'greenhouse', name: 'Greenhouse', category: 'HR', description: 'ATS con pipelines, entrevistas y reporting para reclutamiento.', website: 'https://www.greenhouse.com', logo: '🌱', placeholder: 'gh_...', docsUrl: 'https://developers.greenhouse.io' },
  { id: 'lever', name: 'Lever', category: 'HR', description: 'Reclutamiento colaborativo con CRM de candidatos y automatizaciones.', website: 'https://www.lever.co', logo: '🎯', placeholder: 'lever_...', docsUrl: 'https://hire.lever.co/developer/documentation' },
  { id: 'ashby', name: 'Ashby', category: 'HR', description: 'ATS todo-en-uno con API moderna para reporting y sincronización.', website: 'https://www.ashbyhq.com', logo: '🅰️', placeholder: 'ashby_...', docsUrl: 'https://developers.ashbyhq.com' },
  { id: 'rippling', name: 'Rippling', category: 'HR', description: 'RRHH, nómina e IT unificados con aprovisionamiento de apps.', website: 'https://www.rippling.com', logo: '🌊', placeholder: 'rippling_...', docsUrl: 'https://developer.rippling.com' },
  { id: 'deel', name: 'Deel', category: 'HR', description: 'Contratación global, nómina local y cumplimiento para equipos remotos.', website: 'https://www.deel.com', logo: '🌎', placeholder: 'deel_...', docsUrl: 'https://developer.deel.com' },
  { id: 'gusto', name: 'Gusto', category: 'HR', description: 'Nómina y beneficios para pymes en EE. UU. con API de empleados.', website: 'https://gusto.com', logo: '😊', placeholder: 'gusto_...', docsUrl: 'https://docs.gusto.com' },
  { id: 'workday-api', name: 'Workday', category: 'HR', description: 'ERP de RRHH y finanzas con servicios web para datos maestros.', website: 'https://www.workday.com', logo: '📅', placeholder: 'workday_...', docsUrl: 'https://developer.workday.com' },

  // ── Real Estate ──
  { id: 'zillow-api', name: 'Zillow', category: 'Real Estate', description: 'Datos de vivienda, Zestimates y listados para portales inmobiliarios.', website: 'https://www.zillow.com/howto/api/APIOverview.htm', logo: '🏠', placeholder: 'zws-id=...', docsUrl: 'https://www.zillowgroup.com/developers' },
  { id: 'redfin-partner', name: 'Redfin', category: 'Real Estate', description: 'Datos de mercado y listados con foco en experiencia de comprador.', website: 'https://www.redfin.com', logo: '🏘️', placeholder: 'redfin_...', docsUrl: 'https://www.redfin.com/news/data-center' },
  { id: 'realtor-com', name: 'Realtor.com', category: 'Real Estate', description: 'Listados MLS y datos normalizados para búsquedas de propiedades.', website: 'https://www.realtor.com', logo: '🔑', placeholder: 'realtor_...', docsUrl: 'https://developer.realtor.com' },
  { id: 'rentcast', name: 'RentCast', category: 'Real Estate', description: 'Datos de alquiler, valuaciones y ocupación para analítica inmobiliaria.', website: 'https://www.rentcast.io', logo: '🏢', placeholder: 'rentcast_...', docsUrl: 'https://developers.rentcast.io' },
  { id: 'attom-data', name: 'ATTOM Data', category: 'Real Estate', description: 'Dataset masivo de parcelas, gravámenes y características físicas.', website: 'https://www.attomdata.com', logo: '🗺️', placeholder: 'attom_...', docsUrl: 'https://api.developer.attomdata.com' },
  { id: 'compass-api', name: 'Compass', category: 'Real Estate', description: 'Herramientas para agentes y equipos con datos de mercado premium.', website: 'https://www.compass.com', logo: '🧭', placeholder: 'compass_...', docsUrl: 'https://www.compass.com/developers' },
  { id: 'realpage', name: 'RealPage', category: 'Real Estate', description: 'Software multifamily con APIs de leasing, rentas y mantenimiento.', website: 'https://www.realpage.com', logo: '🏙️', placeholder: 'rp_...', docsUrl: 'https://developer.realpage.com' },
  { id: 'mls-grid', name: 'MLS Grid', category: 'Real Estate', description: 'Acceso estandarizado a feeds RESO para portales y CRM inmobiliario.', website: 'https://www.mlsgrid.com', logo: '📋', placeholder: 'mls_...', docsUrl: 'https://docs.mlsgrid.com' },

  // ── Food & Delivery ──
  { id: 'uber-eats', name: 'Uber Eats', category: 'Food & Delivery', description: 'Integración de restaurantes con menús, pedidos y reparto en marketplace.', website: 'https://developer.uber.com/docs/eats', logo: '🍔', placeholder: 'uber_...', docsUrl: 'https://developer.uber.com/docs/eats/api' },
  { id: 'doordash-drive-merchant', name: 'DoorDash Drive', category: 'Food & Delivery', description: 'Logística last-mile white-label para marcas que envían desde sus tiendas.', website: 'https://developer.doordash.com', logo: '🚪', placeholder: 'dd_...', docsUrl: 'https://developer.doordash.com/en-US/docs/drive' },
  { id: 'deliveroo-partner', name: 'Deliveroo', category: 'Food & Delivery', description: 'APIs de partner para restaurantes y dark kitchens en mercados europeos.', website: 'https://developers.deliveroo.com', logo: '🥡', placeholder: 'deliveroo_...', docsUrl: 'https://developers.deliveroo.com/docs' },
  { id: 'grubhub-developer', name: 'Grubhub', category: 'Food & Delivery', description: 'Pedidos y disponibilidad para integraciones POS y agregadores.', website: 'https://developer.grubhub.com', logo: '🍕', placeholder: 'grubhub_...', docsUrl: 'https://developer.grubhub.com/documentation' },
  { id: 'toast-tab', name: 'Toast', category: 'Food & Delivery', description: 'POS restaurante con órdenes, menús y pagos vía API para partners.', website: 'https://pos.toasttab.com', logo: '🍞', placeholder: 'toast_...', docsUrl: 'https://doc.toasttab.com' },
  { id: 'gloriafood', name: 'GloriaFood', category: 'Food & Delivery', description: 'Pedidos online para restaurantes con widget y gestión de comisiones.', website: 'https://www.gloriafood.com', logo: '🍽️', placeholder: 'gloria_...', docsUrl: 'https://www.gloriafood.com/developers' },
  { id: 'just-eat-partner', name: 'Just Eat Takeaway', category: 'Food & Delivery', description: 'Integración con marketplaces de comida a domicilio en Europa.', website: 'https://developers.justeattakeaway.com', logo: '🛵', placeholder: 'jet_...', docsUrl: 'https://developers.justeattakeaway.com' },
  { id: 'open-table-api', name: 'OpenTable', category: 'Food & Delivery', description: 'Reservas de restaurante, disponibilidad y experiencia del comensal.', website: 'https://opentable.com', logo: '📅', placeholder: 'ot_...', docsUrl: 'https://platform.opentable.com' },

  // ── Travel ──
  { id: 'amadeus-dev', name: 'Amadeus for Developers', category: 'Travel', description: 'Vuelos, hoteles y destinos con datos de agregación turística global.', website: 'https://developers.amadeus.com', logo: '✈️', placeholder: 'amadeus_...', docsUrl: 'https://developers.amadeus.com/self-service' },
  { id: 'sabre-dev', name: 'Sabre', category: 'Travel', description: 'GDS para inventario aéreo, hoteles y vehículos para agencias.', website: 'https://developer.sabre.com', logo: '🧳', placeholder: 'sabre_...', docsUrl: 'https://developer.sabre.com' },
  { id: 'skyscanner-partner', name: 'Skyscanner', category: 'Travel', description: 'Metabuscador de vuelos y hoteles con deep links y analítica de clicks.', website: 'https://www.skyscanner.net', logo: '🔭', placeholder: 'sky_...', docsUrl: 'https://developers.skyscanner.net' },
  { id: 'booking-com-affiliate', name: 'Booking.com', category: 'Travel', description: 'Afiliados y conectividad para disponibilidad hotelera y precios.', website: 'https://www.booking.com', logo: '🛏️', placeholder: 'booking_...', docsUrl: 'https://developers.booking.com' },
  { id: 'tripadvisor-content', name: 'Tripadvisor', category: 'Travel', description: 'Contenido de reseñas, fotos y rankings para apps de viajes.', website: 'https://www.tripadvisor.com', logo: '🧭', placeholder: 'ta_...', docsUrl: 'https://developer-tripadvisor.com' },
  { id: 'expedia-partner-solutions', name: 'Expedia Partner Solutions', category: 'Travel', description: 'APIs B2B de hoteles, actividades y paquetes para OTAs.', website: 'https://www.expediapartnersolutions.com', logo: '🌴', placeholder: 'eps_...', docsUrl: 'https://developers.expediagroup.com' },
  { id: 'viator-partner', name: 'Viator', category: 'Travel', description: 'Catálogo global de tours y actividades con disponibilidad en tiempo real.', website: 'https://www.viator.com', logo: '🎟️', placeholder: 'viator_...', docsUrl: 'https://docs.viator.com' },
  { id: 'kayak-api', name: 'KAYAK', category: 'Travel', description: 'Metabúsqueda de viajes con endpoints de tendencias y alertas de precio.', website: 'https://www.kayak.com', logo: '🛶', placeholder: 'kayak_...', docsUrl: 'https://www.kayak.com/affiliate' },

  // ── Email (extra) ──
  { id: 'mailersend', name: 'MailerSend', category: 'Email', description: 'API transaccional con plantillas, analítica y dominios dedicados.', website: 'https://www.mailersend.com', logo: '✉️', placeholder: 'mlsn_...', docsUrl: 'https://developers.mailersend.com' },
  { id: 'mailjet', name: 'Mailjet', category: 'Email', description: 'Email marketing y transaccional con editor colaborativo y segmentación.', website: 'https://www.mailjet.com', logo: '🛩️', placeholder: 'mj_...', docsUrl: 'https://dev.mailjet.com' },
  { id: 'sparkpost', name: 'SparkPost', category: 'Email', description: 'Entrega SMTP/API con telemetría detallada de rebotes y engagement.', website: 'https://www.sparkpost.com', logo: '✨', placeholder: 'SPARKPOST_...', docsUrl: 'https://developers.sparkpost.com' },
  { id: 'loops-so', name: 'Loops', category: 'Email', description: 'Email marketing moderno para SaaS con automatizaciones sencillas.', website: 'https://loops.so', logo: '🔁', placeholder: 'loops_...', docsUrl: 'https://loops.so/docs' },
  { id: 'beehiiv', name: 'beehiiv', category: 'Email', description: 'Newsletters con growth tools, referidos y monetización nativa.', website: 'https://www.beehiiv.com', logo: '🐝', placeholder: 'bh_...', docsUrl: 'https://developers.beehiiv.com' },
  { id: 'mailtrap-api', name: 'Mailtrap', category: 'Email', description: 'Entorno de staging de email con bandeja de pruebas y validación SPF/DKIM.', website: 'https://mailtrap.io', logo: '🪤', placeholder: 'api_token...', docsUrl: 'https://help.mailtrap.io/article/12-mailtrap-api' },
  { id: 'smtp2go', name: 'SMTP2GO', category: 'Email', description: 'SMTP relay con reporting de entregas y supresión de rebotes.', website: 'https://www.smtp2go.com', logo: '📤', placeholder: 'api-...', docsUrl: 'https://developers.smtp2go.com' },
  { id: 'elastic-email', name: 'Elastic Email', category: 'Email', description: 'Email marketing y transaccional con editor y automatizaciones.', website: 'https://elasticemail.com', logo: '📧', placeholder: 'ee_...', docsUrl: 'https://elasticemail.com/developers/api-limits' },

  // ── Cloud (extra) ──
  { id: 'heroku-api', name: 'Heroku', category: 'Cloud', description: 'PaaS con dynos, add-ons y despliegue Git para apps web y workers.', website: 'https://www.heroku.com', logo: '🟣', placeholder: 'HEROKU_API_KEY...', docsUrl: 'https://devcenter.heroku.com/categories/reference' },
  { id: 'scaleway-api', name: 'Scaleway', category: 'Cloud', description: 'Nube europea con instancias, Kubernetes bare metal y bases gestionadas.', website: 'https://www.scaleway.com', logo: '🇫🇷', placeholder: 'SCW_SECRET_KEY...', docsUrl: 'https://www.scaleway.com/en/developers/api' },
  { id: 'vultr-api', name: 'Vultr', category: 'Cloud', description: 'VPS y bare metal globales con API para orquestar infraestructura.', website: 'https://www.vultr.com', logo: '🔺', placeholder: 'vultr_...', docsUrl: 'https://www.vultr.com/api' },
  { id: 'ovh-api', name: 'OVHcloud', category: 'Cloud', description: 'Hosting, OpenStack y servicios gestionados con API completa.', website: 'https://www.ovhcloud.com', logo: '☁️', placeholder: 'ovh_...', docsUrl: 'https://api.ovh.com' },
  { id: 'ibm-cloud', name: 'IBM Cloud', category: 'Cloud', description: 'IaaS, Watson y servicios gestionados con catálogo enterprise.', website: 'https://www.ibm.com/cloud', logo: '💠', placeholder: 'iam_apikey...', docsUrl: 'https://cloud.ibm.com/docs' },
  { id: 'oracle-cloud-infra', name: 'Oracle Cloud Infrastructure', category: 'Cloud', description: 'Compute bare metal, bases Autonomous y redes de baja latencia.', website: 'https://www.oracle.com/cloud', logo: '🔶', placeholder: 'ocid1...', docsUrl: 'https://docs.oracle.com/en-us/iaas' },
  { id: 'alibaba-cloud', name: 'Alibaba Cloud', category: 'Cloud', description: 'Nube líder en Asia con CDN, big data y e-commerce cloud.', website: 'https://www.alibabacloud.com', logo: '🇨🇳', placeholder: 'LTAI...', docsUrl: 'https://www.alibabacloud.com/help' },
  { id: 'upcloud', name: 'UpCloud', category: 'Cloud', description: 'VPS de alto IOPS con redes privadas y snapshots rápidos.', website: 'https://upcloud.com', logo: '⬆️', placeholder: 'ucloud_...', docsUrl: 'https://developers.upcloud.com' },
  { id: 'contabo-api', name: 'Contabo', category: 'Cloud', description: 'VPS y bare metal económicos con API de ciclo de vida.', website: 'https://contabo.com', logo: '🖧', placeholder: 'client_id:secret', docsUrl: 'https://api.contabo.com' },
  { id: 'ionos-cloud', name: 'IONOS Cloud', category: 'Cloud', description: 'Infraestructura europea con compute, storage y Kubernetes.', website: 'https://cloud.ionos.com', logo: '🔷', placeholder: 'token ...', docsUrl: 'https://api.ionos.com/docs' },
  { id: 'upstash', name: 'Upstash', category: 'Cloud', description: 'Redis, Kafka y QStash serverless con límites generosos en edge.', website: 'https://upstash.com', logo: '⚡', placeholder: 'UPSTASH_...', docsUrl: 'https://docs.upstash.com' },
  { id: 'leaseweb', name: 'Leaseweb', category: 'Cloud', description: 'Hosting dedicado, privado y CDN para cargas de alto ancho de banda.', website: 'https://www.leaseweb.com', logo: '🌐', placeholder: 'lsw_...', docsUrl: 'https://developer.leaseweb.com' },

  // ── Social (extra) ──
  { id: 'mastodon-api', name: 'Mastodon', category: 'Social', description: 'Red federada ActivityPub con REST para toots, timelines y OAuth.', website: 'https://joinmastodon.org', logo: '🐘', placeholder: 'access_token...', docsUrl: 'https://docs.joinmastodon.org' },
  { id: 'bluesky-api', name: 'Bluesky (AT Proto)', category: 'Social', description: 'Red social descentralizada con APIs para feeds y identidad.', website: 'https://bsky.app', logo: '🦋', placeholder: 'bsky_...', docsUrl: 'https://docs.bsky.app' },
  { id: 'threads-api', name: 'Threads API', category: 'Social', description: 'Publicación y lectura en Threads integrada con Instagram Graph.', website: 'https://www.threads.net', logo: '🧵', placeholder: 'IGAA...', docsUrl: 'https://developers.facebook.com/docs/threads' },
  { id: 'snapchat-kit', name: 'Snap Kit', category: 'Social', description: 'Login, contenido compartido y lenses para apps de terceros.', website: 'https://kit.snapchat.com', logo: '👻', placeholder: 'snap_...', docsUrl: 'https://developers.snap.com/snap-kit' },
  { id: 'medium-api', name: 'Medium', category: 'Social', description: 'Publicación y lectura de historias para integraciones editoriales.', website: 'https://medium.com', logo: '✍️', placeholder: 'Bearer ...', docsUrl: 'https://github.com/Medium/medium-api-docs' },
  { id: 'substack', name: 'Substack', category: 'Social', description: 'Newsletters de pago y comunidad para creadores independientes.', website: 'https://substack.com', logo: '📰', placeholder: 'substack_...', docsUrl: 'https://substack.com/api' },
  { id: 'patreon-api', name: 'Patreon', category: 'Social', description: 'Miembros, tiers y beneficios para monetización de comunidades.', website: 'https://www.patreon.com', logo: '🎨', placeholder: 'access_token...', docsUrl: 'https://docs.patreon.com' },
  { id: 'strava-api', name: 'Strava', category: 'Social', description: 'Actividades deportivas, segmentos y datos de rendimiento social.', website: 'https://www.strava.com', logo: '🚴', placeholder: 'access_token...', docsUrl: 'https://developers.strava.com' },

  // ── Analytics (extra) ──
  { id: 'heap-analytics', name: 'Heap', category: 'Analytics', description: 'Analítica de producto con autocaptura de eventos y funnels retroactivos.', website: 'https://www.heap.io', logo: '📚', placeholder: 'heap_...', docsUrl: 'https://developers.heap.io' },
  { id: 'fullstory-api', name: 'FullStory', category: 'Analytics', description: 'Reproducción de sesiones y DX datos con privacidad por máscaras.', website: 'https://www.fullstory.com', logo: '🎬', placeholder: 'fs_...', docsUrl: 'https://developer.fullstory.com' },
  { id: 'hotjar-api', name: 'Hotjar', category: 'Analytics', description: 'Mapas de calor, encuestas y grabaciones para optimizar conversiones.', website: 'https://www.hotjar.com', logo: '🔥', placeholder: 'hj_...', docsUrl: 'https://help.hotjar.com/hc/en-us/categories/360001349193-Hotjar-API' },
  { id: 'matomo-cloud', name: 'Matomo', category: 'Analytics', description: 'Analítica web open source alojada con cumplimiento RGPD.', website: 'https://matomo.org', logo: '📈', placeholder: 'token_auth=...', docsUrl: 'https://developer.matomo.org/api-reference' },
  { id: 'fathom-analytics', name: 'Fathom', category: 'Analytics', description: 'Métricas de privacidad sin cookies para sitios y SaaS.', website: 'https://usefathom.com', logo: '🔒', placeholder: 'site_id=...', docsUrl: 'https://usefathom.com/api' },
  { id: 'umami-is', name: 'Umami', category: 'Analytics', description: 'Analítica ligera autoalojada con paneles simples y eventos.', website: 'https://umami.is', logo: '🍙', placeholder: 'umami_...', docsUrl: 'https://umami.is/docs' },
  { id: 'logrocket', name: 'LogRocket', category: 'Analytics', description: 'Session replay con logs de front y monitorización de errores.', website: 'https://logrocket.com', logo: '🚀', placeholder: 'lr_...', docsUrl: 'https://docs.logrocket.com' },
  { id: 'clarity-microsoft', name: 'Microsoft Clarity', category: 'Analytics', description: 'Mapas de calor y grabaciones gratuitas con métricas de frustración.', website: 'https://clarity.microsoft.com', logo: '🔍', placeholder: 'project_id...', docsUrl: 'https://docs.microsoft.com/clarity' },

  // ── Mapas (extra) ──
  { id: 'maptiler', name: 'MapTiler', category: 'Mapas', description: 'Mapas vectoriales autoalojados y tiles con estilos personalizables.', website: 'https://www.maptiler.com', logo: '🗺️', placeholder: 'maptiler_...', docsUrl: 'https://docs.maptiler.com/cloud/api' },
  { id: 'tomtom-developer', name: 'TomTom', category: 'Mapas', description: 'Routing, tráfico y búsqueda de POIs para apps de movilidad.', website: 'https://developer.tomtom.com', logo: '🚗', placeholder: 'tomtom_...', docsUrl: 'https://developer.tomtom.com/documentation' },
  { id: 'opencage', name: 'OpenCage', category: 'Mapas', description: 'Geocodificación directa e inversa agregando fuentes abiertas.', website: 'https://opencagedata.com', logo: '🌍', placeholder: 'oc_...', docsUrl: 'https://opencagedata.com/api' },

  // ── Gaming ──
  { id: 'steam-web-api', name: 'Steam Web API', category: 'Gaming', description: 'Perfiles, inventario y logros de jugadores en el ecosistema Valve.', website: 'https://steamcommunity.com/dev', logo: '🎮', placeholder: 'steamkey=...', docsUrl: 'https://partner.steamgames.com/documentation' },
  { id: 'twitch-api', name: 'Twitch', category: 'Gaming', description: 'Streams, chat, suscripciones y datos de creadores en tiempo real.', website: 'https://www.twitch.tv', logo: '📺', placeholder: 'oauth:...', docsUrl: 'https://dev.twitch.tv/docs' },
  { id: 'epic-games-dev', name: 'Epic Online Services', category: 'Gaming', description: 'Auth cross-play, amigos, logros y voice para títulos Unreal/Epic.', website: 'https://dev.epicgames.com', logo: '🎯', placeholder: 'eg_...', docsUrl: 'https://dev.epicgames.com/docs' },
  { id: 'playfab', name: 'PlayFab', category: 'Gaming', description: 'Backend de juegos con economía virtual, leaderboards y LiveOps.', website: 'https://playfab.com', logo: '🕹️', placeholder: 'PF_...', docsUrl: 'https://learn.microsoft.com/gaming/playfab/' },
  { id: 'roblox-open-cloud', name: 'Roblox Open Cloud', category: 'Gaming', description: 'Gestión de assets, datos y automatización para experiencias Roblox.', website: 'https://www.roblox.com', logo: '🟥', placeholder: 'roblox_...', docsUrl: 'https://create.roblox.com/docs/reference/cloud' },
  { id: 'rawg-database', name: 'RAWG', category: 'Gaming', description: 'Metadatos masivos de videojuegos, capturas y recomendaciones.', website: 'https://rawg.io', logo: '🗃️', placeholder: 'rawg_...', docsUrl: 'https://api.rawg.io/docs' },
  { id: 'itch-io', name: 'itch.io', category: 'Gaming', description: 'API de tienda indie para juegos, bundles y descargas.', website: 'https://itch.io', logo: '🎨', placeholder: 'itch_...', docsUrl: 'https://itch.io/docs/api' },
  { id: 'beamable', name: 'Beamable', category: 'Gaming', description: 'Backend liveops con inventario, eventos y commerce para Unity/Unreal.', website: 'https://beamable.com', logo: '🔦', placeholder: 'beam_...', docsUrl: 'https://docs.beamable.com' },

  // ── Government ──
  { id: 'data-gov-us', name: 'Data.gov', category: 'Government', description: 'Catálogo federal de datasets abiertos de EE. UU. vía CKAN/Socrata.', website: 'https://data.gov', logo: '🏛️', placeholder: 'api_key...', docsUrl: 'https://catalog.data.gov/dataset' },
  { id: 'opendatasoft', name: 'Opendatasoft', category: 'Government', description: 'Portal de datos abiertos para ciudades con APIs tabulares y geo.', website: 'https://www.opendatasoft.com', logo: '📊', placeholder: 'ods_...', docsUrl: 'https://help.opendatasoft.com/apis' },
  { id: 'eurostat-api', name: 'Eurostat', category: 'Government', description: 'Estadísticas oficiales de la UE: economía, demografía y sociedad.', website: 'https://ec.europa.eu/eurostat', logo: '🇪🇺', placeholder: 'none', docsUrl: 'https://ec.europa.eu/eurostat/web/main/data/web-services' },
  { id: 'ine-espana-api', name: 'INE (España)', category: 'Government', description: 'Indicadores demográficos y macroeconómicos oficiales de España.', website: 'https://www.ine.es', logo: '🇪🇸', placeholder: 'none', docsUrl: 'https://www.ine.es/dyngs/DataLab/manual.html?cid=45' },
  { id: 'nasa-open-apis', name: 'NASA Open APIs', category: 'Government', description: 'Imágenes APOD, datos de asteroides y telemetría de misiones.', website: 'https://api.nasa.gov', logo: '🚀', placeholder: 'DEMO_KEY', docsUrl: 'https://api.nasa.gov' },
  { id: 'world-bank-data', name: 'Banco Mundial (Open Data)', category: 'Government', description: 'Indicadores de desarrollo, pobreza y comercio por país y año.', website: 'https://data.worldbank.org', logo: '🌐', placeholder: 'format=json', docsUrl: 'https://datahelpdesk.worldbank.org/knowledgebase/articles/889392' },
  { id: 'un-data-catalog', name: 'UN Data', category: 'Government', description: 'Agregados de Naciones Unidas sobre población, energía y comercio.', website: 'https://data.un.org', logo: '🇺🇳', placeholder: 'none', docsUrl: 'https://data.un.org/Host.aspx?Content=API' },
  { id: 'ckan-api', name: 'CKAN', category: 'Government', description: 'Estándar de portales open data usado por gobiernos y ONG.', website: 'https://ckan.org', logo: '📦', placeholder: 'apikey=...', docsUrl: 'https://docs.ckan.org/en/latest/api/' },

  // ── Weather ──
  { id: 'open-meteo', name: 'Open-Meteo', category: 'Weather', description: 'API meteorológica gratuita sin clave con modelos ECMWF y GFS.', website: 'https://open-meteo.com', logo: '🌤️', placeholder: 'none', docsUrl: 'https://open-meteo.com/en/docs' },
  { id: 'weather-api-com', name: 'WeatherAPI.com', category: 'Weather', description: 'Pronóstico, histórico y alertas con cobertura global.', website: 'https://www.weatherapi.com', logo: '🌧️', placeholder: 'key=...', docsUrl: 'https://www.weatherapi.com/docs' },
  { id: 'openweathermap', name: 'OpenWeather', category: 'Weather', description: 'Mapas meteorológicos, one-call y datos de contaminación.', website: 'https://openweathermap.org', logo: '🌩️', placeholder: 'appid=...', docsUrl: 'https://openweathermap.org/api' },
  { id: 'accuweather-api', name: 'AccuWeather', category: 'Weather', description: 'Pronósticos hiperlocales e índices de salud y actividades.', website: 'https://developer.accuweather.com', logo: '☂️', placeholder: 'apikey=...', docsUrl: 'https://developer.accuweather.com/core-weather-apis' },
  { id: 'weatherbit-io', name: 'Weatherbit', category: 'Weather', description: 'Datos históricos, agrícolas y marítimos con API REST.', website: 'https://www.weatherbit.io', logo: '🧭', placeholder: 'key=...', docsUrl: 'https://www.weatherbit.io/api' },
  { id: 'tomorrow-io', name: 'Tomorrow.io', category: 'Weather', description: 'Pronóstico minuto a minuto y capas para logística y aviación.', website: 'https://www.tomorrow.io', logo: '🛰️', placeholder: 'tomorrow_...', docsUrl: 'https://docs.tomorrow.io' },
  { id: 'visual-crossing', name: 'Visual Crossing', category: 'Weather', description: 'Histórico, forecast y datos solares para analítica empresarial.', website: 'https://www.visualcrossing.com', logo: '📈', placeholder: 'key=...', docsUrl: 'https://www.visualcrossing.com/resources/documentation/weather-api/' },
  { id: 'aerisweather', name: 'AerisWeather', category: 'Weather', description: 'Mapas, alertas severas y datos para broadcast y apps móviles.', website: 'https://www.aerisweather.com', logo: '🌪️', placeholder: 'client_id:secret', docsUrl: 'https://www.aerisweather.com/support/docs/api' },

  // ── SMS ──
  { id: 'messagebird', name: 'Bird (MessageBird)', category: 'SMS', description: 'SMS, WhatsApp Business y voz omnicanal con orquestación global.', website: 'https://bird.com', logo: '🐦', placeholder: 'AccessKey...', docsUrl: 'https://developers.bird.com' },
  { id: 'plivo', name: 'Plivo', category: 'SMS', description: 'SMS y voz con precios transparentes y números en decenas de países.', website: 'https://www.plivo.com', logo: '📱', placeholder: 'auth_id:token', docsUrl: 'https://www.plivo.com/docs' },
  { id: 'telnyx', name: 'Telnyx', category: 'SMS', description: 'Telecom API-first con SMS 10DLC, números y voz sobre IP.', website: 'https://telnyx.com', logo: '🔷', placeholder: 'KEY...', docsUrl: 'https://developers.telnyx.com' },
  { id: 'bandwidth-com', name: 'Bandwidth', category: 'SMS', description: 'Mensajería y voz para CPaaS de nivel carrier en EE. UU.', website: 'https://www.bandwidth.com', logo: '📡', placeholder: 'user:pass', docsUrl: 'https://dev.bandwidth.com' },
  { id: 'infobip', name: 'Infobip', category: 'SMS', description: 'Canales móviles globales con enrutado inteligente y analítica.', website: 'https://www.infobip.com', logo: '📨', placeholder: 'App ...', docsUrl: 'https://www.infobip.com/docs' },
  { id: 'clickatell', name: 'Clickatell', category: 'SMS', description: 'SMS transaccional y campañas con cobertura en mercados emergentes.', website: 'https://www.clickatell.com', logo: '✉️', placeholder: 'apiKey=...', docsUrl: 'https://docs.clickatell.com' },
  { id: 'sinch', name: 'Sinch', category: 'SMS', description: 'Mensajería, verificación y voz para apps de alto volumen.', website: 'https://www.sinch.com', logo: '📲', placeholder: 'Bearer ...', docsUrl: 'https://developers.sinch.com' },

  // ── Video ──
  { id: 'mux-video', name: 'Mux', category: 'Video', description: 'Video on demand y live streaming con encoding y player analítico.', website: 'https://www.mux.com', logo: '🎬', placeholder: 'mux_token_...', docsUrl: 'https://docs.mux.com' },
  { id: 'daily-co', name: 'Daily.co', category: 'Video', description: 'WebRTC de salas con grabación, transcripción y dominios personalizados.', website: 'https://www.daily.co', logo: '📹', placeholder: 'daily_...', docsUrl: 'https://docs.daily.co' },
  { id: 'whereby-api', name: 'Whereby', category: 'Video', description: 'Salas de videollamada embebidas sin apps nativas para usuarios finales.', website: 'https://whereby.com', logo: '🚪', placeholder: 'Bearer ...', docsUrl: 'https://docs.whereby.com' },
  { id: 'agora-io', name: 'Agora', category: 'Video', description: 'RTC global con baja latencia para voz, vídeo y streaming interactivo.', website: 'https://www.agora.io', logo: '📡', placeholder: 'appid:...', docsUrl: 'https://docs.agora.io' },
  { id: 'api-video', name: 'api.video', category: 'Video', description: 'Encoding, hosting y player de vídeo con API sencilla para devs.', website: 'https://api.video', logo: '🎥', placeholder: 'apikey_...', docsUrl: 'https://docs.api.video' },
  { id: 'stream-video', name: 'GetStream Video', category: 'Video', description: 'Live y on-demand sobre infraestructura de chat de Stream.', website: 'https://getstream.io/video/', logo: '📼', placeholder: 'stream_...', docsUrl: 'https://getstream.io/video/docs/' },
  { id: 'vimeo-developer', name: 'Vimeo', category: 'Video', description: 'Hosting premium, privacidad y analítica para OTT y marketing.', website: 'https://vimeo.com', logo: '🎞️', placeholder: 'access_token...', docsUrl: 'https://developer.vimeo.com' },
  { id: 'hundred-ms', name: '100ms', category: 'Video', description: 'Salas WebRTC con roles, RTMP y HLS para edtech y eventos.', website: 'https://www.100ms.live', logo: '💯', placeholder: 'management_token...', docsUrl: 'https://www.100ms.live/docs' },

  // ── DNS & Domain ──
  { id: 'dnsimple', name: 'DNSimple', category: 'DNS & Domain', description: 'Registro DNS con API limpia para zonas, certificados y whois.', website: 'https://dnsimple.com', logo: '📗', placeholder: 'token id:secret', docsUrl: 'https://developer.dnsimple.com' },
  { id: 'namecheap', name: 'Namecheap', category: 'DNS & Domain', description: 'Registro de dominios, DNS y SSL con API para revendedores.', website: 'https://www.namecheap.com', logo: '🏷️', placeholder: 'ApiUser/ApiKey', docsUrl: 'https://www.namecheap.com/support/api/' },
  { id: 'godaddy-api', name: 'GoDaddy', category: 'DNS & Domain', description: 'Gestión masiva de dominios, DNS y subastas para partners.', website: 'https://www.godaddy.com', logo: '🐆', placeholder: 'sso-key ...', docsUrl: 'https://developer.godaddy.com' },
  { id: 'porkbun', name: 'Porkbun', category: 'DNS & Domain', description: 'Dominios asequibles con API DNS y correo incluido.', website: 'https://porkbun.com', logo: '🐷', placeholder: 'apikey=...', docsUrl: 'https://porkbun.com/api/json/v3/documentation' },
  { id: 'gandi', name: 'Gandi', category: 'DNS & Domain', description: 'Dominio, hosting y correo con API REST europea.', website: 'https://www.gandi.net', logo: '🐘', placeholder: 'Bearer ...', docsUrl: 'https://api.gandi.net/docs/' },
  { id: 'hetzner-dns', name: 'Hetzner DNS', category: 'DNS & Domain', description: 'DNS gratuito y API para gestionar registros con baja latencia.', website: 'https://www.hetzner.com/dns-console', logo: '🇩🇪', placeholder: 'dns_token...', docsUrl: 'https://dns.hetzner.com/api-docs' },
  { id: 'cloudns-net', name: 'ClouDNS', category: 'DNS & Domain', description: 'DNS anycast con failover, georouting y registros avanzados.', website: 'https://www.cloudns.net', logo: '☁️', placeholder: 'auth-id:key', docsUrl: 'https://www.cloudns.net/wiki/article/42/' },
  { id: 'name-com-api', name: 'Name.com', category: 'DNS & Domain', description: 'Registro y transferencias con API para integradores y marcas blancas.', website: 'https://www.name.com', logo: '📝', placeholder: 'username:token', docsUrl: 'https://www.name.com/api-docs' },

  // ── Comunicación (extra) ──
  { id: 'getstream-chat', name: 'Stream Chat', category: 'Comunicación', description: 'Chat en tiempo real con moderación, threads y reacciones.', website: 'https://getstream.io/chat/', logo: '💬', placeholder: 'stream_...', docsUrl: 'https://getstream.io/chat/docs/' },
  { id: 'sendbird', name: 'Sendbird', category: 'Comunicación', description: 'Mensajería in-app, voz y video para comunidades y marketplaces.', website: 'https://sendbird.com', logo: '🐦', placeholder: 'sb_...', docsUrl: 'https://sendbird.com/docs' },
  { id: 'pubnub', name: 'PubNub', category: 'Comunicación', description: 'Red de datos en tiempo real para chat, IoT y presencia.', website: 'https://www.pubnub.com', logo: '📡', placeholder: 'sub-key...', docsUrl: 'https://www.pubnub.com/docs' },
  { id: 'ably-realtime', name: 'Ably', category: 'Comunicación', description: 'WebSockets y pub/sub global con garantías de entrega.', website: 'https://ably.com', logo: '🔴', placeholder: 'ably_...', docsUrl: 'https://ably.com/docs' },
  { id: 'novu', name: 'Novu', category: 'Comunicación', description: 'Orquestación de notificaciones multicanal open source.', website: 'https://novu.co', logo: '🔔', placeholder: 'nv_...', docsUrl: 'https://docs.novu.co' },
  { id: 'knock-app', name: 'Knock', category: 'Comunicación', description: 'Workflows de notificaciones con plantillas y preferencias de usuario.', website: 'https://knock.app', logo: '✊', placeholder: 'sk_...', docsUrl: 'https://docs.knock.app' },
  { id: 'customer-io-api', name: 'Customer.io', category: 'Comunicación', description: 'Mensajes basados en comportamiento por email, push y SMS.', website: 'https://customer.io', logo: '📣', placeholder: 'cio_...', docsUrl: 'https://customer.io/docs/api' },
  { id: 'braze-developers', name: 'Braze', category: 'Comunicación', description: 'Engagement multicanal con segmentación y experimentación en app.', website: 'https://www.braze.com', logo: '🔥', placeholder: 'braze_...', docsUrl: 'https://www.braze.com/docs/api' },

  // ── Storage (extra) ──
  { id: 'backblaze-b2', name: 'Backblaze B2', category: 'Storage', description: 'Object storage S3-compatible económico para backup y media.', website: 'https://www.backblaze.com/b2', logo: '💾', placeholder: 'keyID:key', docsUrl: 'https://www.backblaze.com/b2/docs' },
  { id: 'wasabi-api', name: 'Wasabi', category: 'Storage', description: 'Almacenamiento en frío caliente sin cargos de egress agresivos.', website: 'https://wasabi.com', logo: '🌶️', placeholder: 'accesskey...', docsUrl: 'https://docs.wasabi.com' },
  { id: 'idrive-e2', name: 'IDrive e2', category: 'Storage', description: 'S3-compatible con precios simples para archivos y backups.', website: 'https://www.idrive.com/e2/', logo: '🆔', placeholder: 'e2_...', docsUrl: 'https://www.idrive.com/e2/documentation' },
  { id: 'filestack-api', name: 'Filestack', category: 'Storage', description: 'Uploads, transformaciones y entrega de ficheros para apps web.', website: 'https://www.filestack.com', logo: '📎', placeholder: 'APIKEY...', docsUrl: 'https://www.filestack.com/docs' },
  { id: 'bytescale', name: 'Bytescale', category: 'Storage', description: 'Hosting de archivos con CDN, validación y transformaciones.', website: 'https://www.bytescale.com', logo: '📦', placeholder: 'public_...', docsUrl: 'https://www.bytescale.com/docs' },
  { id: 'storj-io', name: 'Storj', category: 'Storage', description: 'Almacenamiento descentralizado S3-compatible con cifrado extremo a extremo.', website: 'https://www.storj.io', logo: '🛰️', placeholder: 'access_grant...', docsUrl: 'https://docs.storj.io' },

  // ── Base de datos (extra) ──
  { id: 'cockroach-serverless', name: 'CockroachDB', category: 'Base de datos', description: 'SQL distribuida con consistencia fuerte y multiregión serverless.', website: 'https://www.cockroachlabs.com', logo: '🪳', placeholder: 'postgres://...', docsUrl: 'https://www.cockroachlabs.com/docs/stable/' },
  { id: 'timescaledb-cloud', name: 'Timescale', category: 'Base de datos', description: 'Postgres para series temporales, métricas y analítica híbrida.', website: 'https://www.timescale.com', logo: '⏱️', placeholder: 'tsdb_...', docsUrl: 'https://docs.timescale.com' },
  { id: 'elastic-cloud', name: 'Elastic Cloud', category: 'Base de datos', description: 'Elasticsearch, Kibana y observabilidad gestionados en la nube.', website: 'https://www.elastic.co/cloud', logo: '🔎', placeholder: 'elastic_...', docsUrl: 'https://www.elastic.co/guide/en/elasticsearch/reference/current/rest-apis.html' },
  { id: 'clickhouse-cloud', name: 'ClickHouse Cloud', category: 'Base de datos', description: 'OLAP columnar ultrarrápido para analítica y logs a escala.', website: 'https://clickhouse.com', logo: '⚡', placeholder: 'clickhouse_...', docsUrl: 'https://clickhouse.com/docs' },
  { id: 'influxdb-cloud', name: 'InfluxDB Cloud', category: 'Base de datos', description: 'Series temporales para IoT, DevOps y métricas de producto.', website: 'https://www.influxdata.com', logo: '📉', placeholder: 'influx_...', docsUrl: 'https://docs.influxdata.com' },
  { id: 'snowflake-account', name: 'Snowflake', category: 'Base de datos', description: 'Data warehouse elástico con separación compute/storage.', website: 'https://www.snowflake.com', logo: '❄️', placeholder: 'account.user:pass', docsUrl: 'https://docs.snowflake.com' },
  { id: 'databricks-workspace', name: 'Databricks', category: 'Base de datos', description: 'Lakehouse con Spark, ML y SQL serverless.', website: 'https://www.databricks.com', logo: '🧱', placeholder: 'dapi...', docsUrl: 'https://docs.databricks.com' },
  { id: 'tinybird-cloud', name: 'Tinybird', category: 'Base de datos', description: 'Pipelines SQL sobre ClickHouse para APIs de datos en tiempo real.', website: 'https://www.tinybird.co', logo: '🐤', placeholder: 'tb_...', docsUrl: 'https://www.tinybird.co/docs' },

  // ── DevOps (extra) ──
  { id: 'circleci-api', name: 'CircleCI', category: 'DevOps', description: 'CI/CD en la nube con orbs, matrices y runners propios.', website: 'https://circleci.com', logo: '⭕', placeholder: 'CIRCLE_TOKEN...', docsUrl: 'https://circleci.com/docs/api/v2' },
  { id: 'buildkite-com', name: 'Buildkite', category: 'DevOps', description: 'Pipelines híbridos con agentes en tu infra y UI en la nube.', website: 'https://buildkite.com', logo: '🪜', placeholder: 'bk_...', docsUrl: 'https://buildkite.com/docs/apis' },
  { id: 'pulumi-cloud', name: 'Pulumi', category: 'DevOps', description: 'IaC en TypeScript/Python/Go con estado remoto y políticas.', website: 'https://www.pulumi.com', logo: '🧩', placeholder: 'pulumi_...', docsUrl: 'https://www.pulumi.com/docs' },
  { id: 'argo-cd', name: 'Argo CD', category: 'DevOps', description: 'GitOps continuo sobre Kubernetes con sync y health checks.', website: 'https://argo-cd.readthedocs.io', logo: '🐙', placeholder: 'argocd_token...', docsUrl: 'https://argo-cd.readthedocs.io/en/stable/developer-guide/api-docs/' },
  { id: 'spacelift-io', name: 'Spacelift', category: 'DevOps', description: 'Plataforma de IaC con políticas, drift detection y private workers.', website: 'https://spacelift.io', logo: '🛰️', placeholder: 'spacelift_...', docsUrl: 'https://docs.spacelift.io' },
  { id: 'harness-io', name: 'Harness', category: 'DevOps', description: 'CD, feature flags y cost optimization para equipos de plataforma.', website: 'https://www.harness.io', logo: '🎯', placeholder: 'harness_...', docsUrl: 'https://developer.harness.io' },

  // ── Auth (extra) ──
  { id: 'workos', name: 'WorkOS', category: 'Auth', description: 'SSO SAML, SCIM y Directory Sync para apps B2B enterprise-ready.', website: 'https://workos.com', logo: '🔐', placeholder: 'sk_...', docsUrl: 'https://workos.com/docs' },
  { id: 'stytch', name: 'Stytch', category: 'Auth', description: 'Passwordless, OTP y sesiones seguras con SDKs móviles y web.', website: 'https://stytch.com', logo: '✨', placeholder: 'project-live-...', docsUrl: 'https://stytch.com/docs' },
  { id: 'magic-link-auth', name: 'Magic', category: 'Auth', description: 'Wallets y login Web3 sin fricción para dApps y productos híbridos.', website: 'https://magic.link', logo: '🪄', placeholder: 'pk_live_...', docsUrl: 'https://magic.link/docs' },
  { id: 'fusionauth', name: 'FusionAuth', category: 'Auth', description: 'Auth autoalojada con SSO, MFA y cumplimiento RGPD.', website: 'https://fusionauth.io', logo: '🔗', placeholder: 'fa_...', docsUrl: 'https://fusionauth.io/docs' },
  { id: 'ory', name: 'Ory', category: 'Auth', description: 'Kratos, Hydra y Keto para identidad, OAuth2 y permisos.', website: 'https://www.ory.sh', logo: '🛡️', placeholder: 'ory_...', docsUrl: 'https://www.ory.sh/docs' },

  // ── E-commerce (extra) ──
  { id: 'bigcommerce', name: 'BigCommerce', category: 'E-commerce', description: 'Headless commerce con APIs de catálogo, carrito y checkout.', website: 'https://www.bigcommerce.com', logo: '🛒', placeholder: 'X-Auth-Token...', docsUrl: 'https://developer.bigcommerce.com' },
  { id: 'magento-adobe', name: 'Adobe Commerce', category: 'E-commerce', description: 'Plataforma enterprise Magento con REST/GraphQL extensibles.', website: 'https://business.adobe.com/products/magento/magento-commerce.html', logo: '🅰️', placeholder: 'integration_...', docsUrl: 'https://developer.adobe.com/commerce/docs' },
  { id: 'saleor', name: 'Saleor', category: 'E-commerce', description: 'Headless GraphQL open source con multi-tenant y marketplaces.', website: 'https://saleor.io', logo: '🧾', placeholder: 'saleor_...', docsUrl: 'https://docs.saleor.io' },
  { id: 'medusa', name: 'Medusa', category: 'E-commerce', description: 'Backend modular para tiendas headless con plugins y admin.', website: 'https://medusajs.com', logo: '🏺', placeholder: 'medusa_...', docsUrl: 'https://docs.medusajs.com' },
  { id: 'commerce-layer', name: 'Commerce Layer', category: 'E-commerce', description: 'Order management API-first para stacks headless y POS.', website: 'https://commercelayer.io', logo: '🧱', placeholder: 'cl_...', docsUrl: 'https://docs.commercelayer.io' },

  // ── Media (extra) ──
  { id: 'shutterstock-api', name: 'Shutterstock', category: 'Media', description: 'Stock de fotos, vídeo y música con licencias y búsqueda editorial.', website: 'https://www.shutterstock.com', logo: '📷', placeholder: 'v2/...', docsUrl: 'https://api-reference.shutterstock.com' },
  { id: 'getty-images-api', name: 'Getty Images', category: 'Media', description: 'Contenido editorial y creativo premium con metadatos ricos.', website: 'https://www.gettyimages.com', logo: '🖼️', placeholder: 'api-key...', docsUrl: 'https://developers.gettyimages.com' },
  { id: 'pexels-api', name: 'Pexels', category: 'Media', description: 'Fotos y vídeos libres de alta calidad con API sencilla.', website: 'https://www.pexels.com', logo: '📸', placeholder: 'Authorization: ...', docsUrl: 'https://www.pexels.com/api/documentation' },
  { id: 'pixabay-api', name: 'Pixabay', category: 'Media', description: 'Imágenes, vídeos e ilustraciones con licencia permisiva.', website: 'https://pixabay.com', logo: '🎨', placeholder: 'key=...', docsUrl: 'https://pixabay.com/api/docs/' },

  // ── Productividad (extra) ──
  { id: 'asana-api', name: 'Asana', category: 'Productividad', description: 'Tareas, proyectos y automatizaciones para equipos remotos.', website: 'https://asana.com', logo: '✅', placeholder: 'pat_...', docsUrl: 'https://developers.asana.com/docs' },
  { id: 'clickup-api', name: 'ClickUp', category: 'Productividad', description: 'Todo-en-uno con vistas, time tracking y API de espacios.', website: 'https://clickup.com', logo: '🖱️', placeholder: 'pk_...', docsUrl: 'https://clickup.com/api' },
  { id: 'monday-com-api', name: 'monday.com', category: 'Productividad', description: 'Work OS con tableros, automatizaciones y GraphQL API.', website: 'https://monday.com', logo: '🗓️', placeholder: 'api_token...', docsUrl: 'https://developer.monday.com' },

  // ── Seguridad (extra) ──
  { id: 'bitwarden-secrets', name: 'Bitwarden', category: 'Seguridad', description: 'Gestor de secretos y contraseñas con SDK y APIs de vault.', website: 'https://bitwarden.com', logo: '🛡️', placeholder: 'bw_...', docsUrl: 'https://bitwarden.com/help/cli/' },
  { id: 'hashicorp-vault', name: 'HashiCorp Vault', category: 'Seguridad', description: 'Gestión de secretos, PKI y cifrado como servicio.', website: 'https://www.hashicorp.com/products/vault', logo: '🏦', placeholder: 'hvs.CAES...', docsUrl: 'https://developer.hashicorp.com/vault/docs' },
  { id: 'qualys-api', name: 'Qualys', category: 'Seguridad', description: 'VM, compliance y detección de vulnerabilidades en activos.', website: 'https://www.qualys.com', logo: '🔍', placeholder: 'user:pass', docsUrl: 'https://www.qualys.com/docs/' },
  { id: 'tenable-io', name: 'Tenable', category: 'Seguridad', description: 'Nessus y exposure management con APIs de escaneo continuo.', website: 'https://www.tenable.com', logo: '🐴', placeholder: 'accessKey:secretKey', docsUrl: 'https://developer.tenable.com' },

  // ── CRM & Marketing (extra) ──
  { id: 'pipedrive-api', name: 'Pipedrive', category: 'CRM & Marketing', description: 'CRM de ventas con pipeline, actividades y automatizaciones.', website: 'https://www.pipedrive.com', logo: '🎯', placeholder: 'api_token=...', docsUrl: 'https://developers.pipedrive.com' },

  // ── Catálogo extendido (600+) ──
{ id: 'figma-api', name: 'Figma', category: 'Design', description: 'Diseño colaborativo con API para archivos, componentes y comentarios.', website: 'https://www.figma.com', logo: '🎨', placeholder: 'figd_...', docsUrl: 'https://www.figma.com/developers/api' },
  { id: 'canva-connect', name: 'Canva Connect', category: 'Design', description: 'API para crear y editar diseños gráficos desde tu aplicación.', website: 'https://www.canva.com', logo: '🖌️', placeholder: 'cnv_...', docsUrl: 'https://www.canva.dev/docs/connect/' },
  { id: 'sketch-api', name: 'Sketch', category: 'Design', description: 'Herramienta de diseño vectorial con plugins y API.', website: 'https://www.sketch.com', logo: '💎', placeholder: 'sketch_...', docsUrl: 'https://developer.sketch.com' },
  { id: 'adobe-creative-cloud', name: 'Adobe Creative Cloud', category: 'Design', description: 'APIs de Photoshop, Lightroom e Illustrator en la nube.', website: 'https://developer.adobe.com', logo: '🅰️', placeholder: 'adobe_cc_...', docsUrl: 'https://developer.adobe.com/creative-cloud/' },
  { id: 'invision-api', name: 'InVision', category: 'Design', description: 'Prototipado y colaboración de diseño con API de proyectos.', website: 'https://www.invisionapp.com', logo: '🔮', placeholder: 'inv_...', docsUrl: 'https://developers.invisionapp.com' },
  { id: 'zeplin-api', name: 'Zeplin', category: 'Design', description: 'Handoff de diseño a desarrollo con guías de estilo y assets.', website: 'https://zeplin.io', logo: '📐', placeholder: 'zep_...', docsUrl: 'https://docs.zeplin.dev' },
  { id: 'framer-api', name: 'Framer', category: 'Design', description: 'Diseño web interactivo con componentes React y animaciones.', website: 'https://www.framer.com', logo: '⚡', placeholder: 'framer_...', docsUrl: 'https://www.framer.com/developers/' },
  { id: 'penpot-api', name: 'Penpot', category: 'Design', description: 'Plataforma de diseño open-source con colaboración en tiempo real.', website: 'https://penpot.app', logo: '✏️', placeholder: 'penpot_...', docsUrl: 'https://help.penpot.app/technical-guide/' },
  { id: 'miro-api', name: 'Miro', category: 'Design', description: 'Pizarra colaborativa con API para boards, widgets y equipos.', website: 'https://miro.com', logo: '📋', placeholder: 'miro_...', docsUrl: 'https://developers.miro.com' },
  { id: 'abstract-api', name: 'Abstract', category: 'Design', description: 'Control de versiones para archivos de diseño Sketch y XD.', website: 'https://www.abstract.com', logo: '🔄', placeholder: 'abs_...', docsUrl: 'https://developer.abstract.com' },
  { id: 'coolors-api', name: 'Coolors', category: 'Design', description: 'Generador de paletas de colores con exportación y API.', website: 'https://coolors.co', logo: '🎨', placeholder: 'coolors_...', docsUrl: 'https://coolors.co/api' },
  { id: 'lottiefiles-api', name: 'LottieFiles', category: 'Design', description: 'Animaciones Lottie con biblioteca y editor en la nube.', website: 'https://lottiefiles.com', logo: '🎬', placeholder: 'lottie_...', docsUrl: 'https://developers.lottiefiles.com' },
  { id: 'iconify-api', name: 'Iconify', category: 'Design', description: 'Framework unificado de iconos con más de 150.000 iconos SVG.', website: 'https://iconify.design', logo: '🔷', placeholder: 'iconify_...', docsUrl: 'https://iconify.design/docs/api/' },
  { id: 'quickbooks-api', name: 'QuickBooks', category: 'Accounting', description: 'Contabilidad y facturación para pymes con API REST completa.', website: 'https://quickbooks.intuit.com', logo: '📗', placeholder: 'qb_...', docsUrl: 'https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/account' },
  { id: 'xero-api', name: 'Xero', category: 'Accounting', description: 'Software de contabilidad en la nube con API de facturación y bancos.', website: 'https://www.xero.com', logo: '📘', placeholder: 'xero_...', docsUrl: 'https://developer.xero.com/documentation/api' },
  { id: 'freshbooks-api', name: 'FreshBooks', category: 'Accounting', description: 'Facturación y contabilidad para freelancers y pymes.', website: 'https://www.freshbooks.com', logo: '🧾', placeholder: 'fb_...', docsUrl: 'https://www.freshbooks.com/api' },
  { id: 'wave-accounting', name: 'Wave', category: 'Accounting', description: 'Contabilidad gratuita con facturación y recibos automatizados.', website: 'https://www.waveapps.com', logo: '🌊', placeholder: 'wave_...', docsUrl: 'https://developer.waveapps.com' },
  { id: 'sage-api', name: 'Sage', category: 'Accounting', description: 'ERP y contabilidad empresarial con API para pymes y grandes empresas.', website: 'https://www.sage.com', logo: '🟢', placeholder: 'sage_...', docsUrl: 'https://developer.sage.com' },
  { id: 'zoho-books-api', name: 'Zoho Books', category: 'Accounting', description: 'Contabilidad online con gestión de gastos y conciliación bancaria.', website: 'https://www.zoho.com/books/', logo: '📒', placeholder: 'zoho_books_...', docsUrl: 'https://www.zoho.com/books/api/v3/' },
  { id: 'holded-api', name: 'Holded', category: 'Accounting', description: 'ERP y facturación española en la nube con API REST.', website: 'https://www.holded.com', logo: '🇪🇸', placeholder: 'holded_...', docsUrl: 'https://developers.holded.com' },
  { id: 'debitoor-api', name: 'SumUp Invoices', category: 'Accounting', description: 'Facturación simple con seguimiento de gastos y pagos.', website: 'https://www.sumup.com/invoices', logo: '💶', placeholder: 'sumup_inv_...', docsUrl: 'https://developer.sumup.com' },
  { id: 'freeagent-api', name: 'FreeAgent', category: 'Accounting', description: 'Contabilidad para autónomos y agencias del Reino Unido.', website: 'https://www.freeagent.com', logo: '🆓', placeholder: 'freeagent_...', docsUrl: 'https://dev.freeagent.com' },
  { id: 'lexoffice-api', name: 'lexoffice', category: 'Accounting', description: 'Software de contabilidad alemán con facturación automática.', website: 'https://www.lexoffice.de', logo: '🇩🇪', placeholder: 'lexoffice_...', docsUrl: 'https://developers.lexoffice.io' },
  { id: 'facturapi', name: 'Facturapi', category: 'Accounting', description: 'API de facturación electrónica CFDI para México.', website: 'https://www.facturapi.io', logo: '🇲🇽', placeholder: 'facturapi_...', docsUrl: 'https://docs.facturapi.io' },
  { id: 'bexio-api', name: 'Bexio', category: 'Accounting', description: 'Software empresarial suizo con contabilidad y CRM integrados.', website: 'https://www.bexio.com', logo: '🇨🇭', placeholder: 'bexio_...', docsUrl: 'https://docs.bexio.com' },
  { id: 'sevdesk-api', name: 'sevDesk', category: 'Accounting', description: 'Contabilidad online alemana con OCR de facturas.', website: 'https://sevdesk.de', logo: '📄', placeholder: 'sevdesk_...', docsUrl: 'https://api.sevdesk.de' },
  { id: 'zendesk-api', name: 'Zendesk', category: 'Customer Support', description: 'Soporte al cliente omnicanal con tickets, chat y base de conocimiento.', website: 'https://www.zendesk.com', logo: '🎫', placeholder: 'zd_...', docsUrl: 'https://developer.zendesk.com' },
  { id: 'freshdesk-api', name: 'Freshdesk', category: 'Customer Support', description: 'Helpdesk en la nube con tickets, automatización y portal de autoservicio.', website: 'https://www.freshdesk.com', logo: '🌿', placeholder: 'freshdesk_...', docsUrl: 'https://developers.freshdesk.com/api/' },
  { id: 'helpscout-api', name: 'Help Scout', category: 'Customer Support', description: 'Plataforma de soporte por email con buzones compartidos y docs.', website: 'https://www.helpscout.com', logo: '🏠', placeholder: 'helpscout_...', docsUrl: 'https://developer.helpscout.com' },
  { id: 'front-api', name: 'Front', category: 'Customer Support', description: 'Inbox colaborativo para equipos con automatización y analytics.', website: 'https://front.com', logo: '📬', placeholder: 'front_...', docsUrl: 'https://dev.frontapp.com' },
  { id: 'tawk-to-api', name: 'Tawk.to', category: 'Customer Support', description: 'Chat en vivo gratuito con widget personalizable y dashboard.', website: 'https://www.tawk.to', logo: '💬', placeholder: 'tawk_...', docsUrl: 'https://developer.tawk.to' },
  { id: 'livechat-api', name: 'LiveChat', category: 'Customer Support', description: 'Chat en vivo y chatbots para soporte y ventas online.', website: 'https://www.livechat.com', logo: '🗨️', placeholder: 'livechat_...', docsUrl: 'https://developers.livechat.com' },
  { id: 'tidio-api', name: 'Tidio', category: 'Customer Support', description: 'Chatbot con IA y live chat para e-commerce y soporte.', website: 'https://www.tidio.com', logo: '🤖', placeholder: 'tidio_...', docsUrl: 'https://docs.tidio.com' },
  { id: 'kayako-api', name: 'Kayako', category: 'Customer Support', description: 'Helpdesk unificado con chat, email y redes sociales.', website: 'https://kayako.com', logo: '🛶', placeholder: 'kayako_...', docsUrl: 'https://developer.kayako.com' },
  { id: 'groove-api', name: 'Groove', category: 'Customer Support', description: 'Helpdesk simple para startups con base de conocimiento integrada.', website: 'https://www.groovehq.com', logo: '🎵', placeholder: 'groove_...', docsUrl: 'https://www.groovehq.com/docs' },
  { id: 'gorgias-api', name: 'Gorgias', category: 'Customer Support', description: 'Helpdesk para e-commerce con integraciones Shopify y Magento.', website: 'https://www.gorgias.com', logo: '🛍️', placeholder: 'gorgias_...', docsUrl: 'https://developers.gorgias.com' },
  { id: 'gladly-api', name: 'Gladly', category: 'Customer Support', description: 'CX personalizado con historial unificado del cliente.', website: 'https://www.gladly.com', logo: '😊', placeholder: 'gladly_...', docsUrl: 'https://developer.gladly.com' },
  { id: 'dixa-api', name: 'Dixa', category: 'Customer Support', description: 'Plataforma conversacional para atención omnicanal al cliente.', website: 'https://www.dixa.com', logo: '💜', placeholder: 'dixa_...', docsUrl: 'https://docs.dixa.io' },
  { id: 'grafana-cloud', name: 'Grafana Cloud', category: 'Monitoring', description: 'Observabilidad con métricas, logs y trazas en dashboards.', website: 'https://grafana.com', logo: '📊', placeholder: 'glc_...', docsUrl: 'https://grafana.com/docs/grafana-cloud/' },
  { id: 'prometheus-api', name: 'Prometheus', category: 'Monitoring', description: 'Monitoreo y alertas con base de datos de series temporales.', website: 'https://prometheus.io', logo: '🔥', placeholder: 'prom_...', docsUrl: 'https://prometheus.io/docs/' },
  { id: 'elastic-apm', name: 'Elastic APM', category: 'Monitoring', description: 'Monitoreo de rendimiento de aplicaciones con Elasticsearch.', website: 'https://www.elastic.co/apm', logo: '🔍', placeholder: 'elastic_apm_...', docsUrl: 'https://www.elastic.co/guide/en/apm/guide/current/' },
  { id: 'dynatrace-api', name: 'Dynatrace', category: 'Monitoring', description: 'Observabilidad full-stack con IA para detección automática.', website: 'https://www.dynatrace.com', logo: '🟩', placeholder: 'dt0c01_...', docsUrl: 'https://docs.dynatrace.com' },
  { id: 'pagerduty-api', name: 'PagerDuty', category: 'Monitoring', description: 'Gestión de incidentes y alertas on-call para equipos DevOps.', website: 'https://www.pagerduty.com', logo: '🚨', placeholder: 'pdKey_...', docsUrl: 'https://developer.pagerduty.com' },
  { id: 'opsgenie-api', name: 'OpsGenie', category: 'Monitoring', description: 'Alertas y gestión de guardias para equipos de operaciones.', website: 'https://www.atlassian.com/software/opsgenie', logo: '🔔', placeholder: 'opsgenie_...', docsUrl: 'https://docs.opsgenie.com/docs/api-overview' },
  { id: 'statuspage-api', name: 'Statuspage', category: 'Monitoring', description: 'Páginas de estado públicas para comunicar incidentes a usuarios.', website: 'https://www.atlassian.com/software/statuspage', logo: '📟', placeholder: 'statuspage_...', docsUrl: 'https://developer.statuspage.io' },
  { id: 'uptimerobot-api', name: 'UptimeRobot', category: 'Monitoring', description: 'Monitoreo de uptime con alertas y páginas de estado gratuitas.', website: 'https://uptimerobot.com', logo: '🤖', placeholder: 'ur_...', docsUrl: 'https://uptimerobot.com/api/' },
  { id: 'betteruptime-api', name: 'Better Uptime', category: 'Monitoring', description: 'Monitoreo de disponibilidad con alertas y gestión de incidentes.', website: 'https://betterstack.com/uptime', logo: '⬆️', placeholder: 'better_...', docsUrl: 'https://betterstack.com/docs/uptime/api/' },
  { id: 'checkly-api', name: 'Checkly', category: 'Monitoring', description: 'Monitoreo sintético y testing de APIs con Playwright.', website: 'https://www.checklyhq.com', logo: '✅', placeholder: 'cu_...', docsUrl: 'https://www.checklyhq.com/docs/api/' },
  { id: 'honeycomb-api', name: 'Honeycomb', category: 'Monitoring', description: 'Observabilidad basada en eventos y trazas distribuidas.', website: 'https://www.honeycomb.io', logo: '🍯', placeholder: 'hc_...', docsUrl: 'https://docs.honeycomb.io/api/' },
  { id: 'lightstep-api', name: 'ServiceNow Lightstep', category: 'Monitoring', description: 'Observabilidad con OpenTelemetry y análisis de latencia.', website: 'https://lightstep.com', logo: '💡', placeholder: 'ls_...', docsUrl: 'https://docs.lightstep.com' },
  { id: 'cronitor-api', name: 'Cronitor', category: 'Monitoring', description: 'Monitoreo de cron jobs, heartbeats y pipelines de datos.', website: 'https://cronitor.io', logo: '⏰', placeholder: 'cronitor_...', docsUrl: 'https://cronitor.io/docs/api' },
  { id: 'google-translate-api', name: 'Google Translate', category: 'Translation', description: 'Traducción automática neuronal en más de 100 idiomas.', website: 'https://cloud.google.com/translate', logo: '🌐', placeholder: 'gcloud_translate_...', docsUrl: 'https://cloud.google.com/translate/docs' },
  { id: 'aws-translate', name: 'Amazon Translate', category: 'Translation', description: 'Traducción automática neuronal escalable de AWS.', website: 'https://aws.amazon.com/translate/', logo: '📝', placeholder: 'aws_translate_...', docsUrl: 'https://docs.aws.amazon.com/translate/' },
  { id: 'crowdin-api', name: 'Crowdin', category: 'Translation', description: 'Plataforma de localización con integración Git y traducciones colaborativas.', website: 'https://crowdin.com', logo: '🌍', placeholder: 'crowdin_...', docsUrl: 'https://developer.crowdin.com' },
  { id: 'transifex-api', name: 'Transifex', category: 'Translation', description: 'Gestión de localización con flujos de trabajo y TM compartida.', website: 'https://www.transifex.com', logo: '🔤', placeholder: 'transifex_...', docsUrl: 'https://developers.transifex.com' },
  { id: 'lokalise-api', name: 'Lokalise', category: 'Translation', description: 'Plataforma de traducción con SDK para apps y webs.', website: 'https://lokalise.com', logo: '🗺️', placeholder: 'lokalise_...', docsUrl: 'https://developers.lokalise.com' },
  { id: 'phrase-api', name: 'Phrase', category: 'Translation', description: 'TMS profesional con traducción automática y memorias.', website: 'https://phrase.com', logo: '💬', placeholder: 'phrase_...', docsUrl: 'https://developers.phrase.com' },
  { id: 'smartling-api', name: 'Smartling', category: 'Translation', description: 'Localización empresarial con IA y traductores humanos.', website: 'https://www.smartling.com', logo: '🧠', placeholder: 'smartling_...', docsUrl: 'https://api-reference.smartling.com' },
  { id: 'weglot-api', name: 'Weglot', category: 'Translation', description: 'Traducción de sitios web con detección automática de contenido.', website: 'https://weglot.com', logo: '🌐', placeholder: 'wg_...', docsUrl: 'https://developers.weglot.com' },
  { id: 'memsource-api', name: 'Phrase TMS', category: 'Translation', description: 'Sistema de gestión de traducción con flujos avanzados.', website: 'https://phrase.com/products/phrase-tms/', logo: '📚', placeholder: 'memsource_...', docsUrl: 'https://cloud.memsource.com/web/docs/api' },
  { id: 'matecat-api', name: 'MateCat', category: 'Translation', description: 'Herramienta CAT open-source con traducción automática integrada.', website: 'https://www.matecat.com', logo: '🐱', placeholder: 'matecat_...', docsUrl: 'https://www.matecat.com/api/docs' },
  { id: 'lilt-api', name: 'Lilt', category: 'Translation', description: 'Traducción adaptativa con IA que aprende del contexto.', website: 'https://lilt.com', logo: '✍️', placeholder: 'lilt_...', docsUrl: 'https://lilt.com/docs/api' },
  { id: 'typeform-api', name: 'Typeform', category: 'Forms', description: 'Formularios interactivos y encuestas con lógica condicional y diseño elegante.', website: 'https://www.typeform.com', logo: '📝', placeholder: 'tfp_...', docsUrl: 'https://developer.typeform.com' },
  { id: 'jotform-api', name: 'JotForm', category: 'Forms', description: 'Constructor de formularios online con más de 10.000 plantillas.', website: 'https://www.jotform.com', logo: '📋', placeholder: 'jotform_...', docsUrl: 'https://api.jotform.com/docs/' },
  { id: 'google-forms-api', name: 'Google Forms', category: 'Forms', description: 'Formularios y encuestas con respuestas en Google Sheets.', website: 'https://docs.google.com/forms', logo: '📊', placeholder: 'gforms_...', docsUrl: 'https://developers.google.com/forms/api' },
  { id: 'surveymonkey-api', name: 'SurveyMonkey', category: 'Forms', description: 'Encuestas profesionales con análisis estadístico avanzado.', website: 'https://www.surveymonkey.com', logo: '🐒', placeholder: 'sm_...', docsUrl: 'https://developer.surveymonkey.com' },
  { id: 'tally-forms', name: 'Tally', category: 'Forms', description: 'Constructor de formularios simple y gratuito sin límites.', website: 'https://tally.so', logo: '📑', placeholder: 'tally_...', docsUrl: 'https://tally.so/help/webhooks' },
  { id: 'paperform-api', name: 'Paperform', category: 'Forms', description: 'Formularios con páginas de pago y lógica avanzada.', website: 'https://paperform.co', logo: '📄', placeholder: 'paperform_...', docsUrl: 'https://paperform.co/help/articles/api/' },
  { id: 'formbricks-api', name: 'Formbricks', category: 'Forms', description: 'Encuestas in-app open-source para feedback de producto.', website: 'https://formbricks.com', logo: '🧱', placeholder: 'formbricks_...', docsUrl: 'https://formbricks.com/docs/api' },
  { id: 'fillout-api', name: 'Fillout', category: 'Forms', description: 'Formularios potentes con integraciones nativas a bases de datos.', website: 'https://www.fillout.com', logo: '✏️', placeholder: 'fillout_...', docsUrl: 'https://www.fillout.com/help/developers' },
  { id: 'reform-api', name: 'Reform', category: 'Forms', description: 'Formularios rápidos optimizados para conversión y UX.', website: 'https://www.reform.app', logo: '📮', placeholder: 'reform_...', docsUrl: 'https://www.reform.app/docs' },
  { id: 'feathery-api', name: 'Feathery', category: 'Forms', description: 'Constructor de formularios sin código para onboarding y registro.', website: 'https://www.feathery.io', logo: '🪶', placeholder: 'feathery_...', docsUrl: 'https://docs.feathery.io' },
  { id: 'onfido-api', name: 'Onfido', category: 'Identity', description: 'Verificación de identidad con documentos y biometría facial.', website: 'https://onfido.com', logo: '🪪', placeholder: 'api_live_...', docsUrl: 'https://documentation.onfido.com' },
  { id: 'jumio-api', name: 'Jumio', category: 'Identity', description: 'KYC y verificación de documentos con IA y detección de fraude.', website: 'https://www.jumio.com', logo: '🔐', placeholder: 'jumio_...', docsUrl: 'https://docs.jumio.com' },
  { id: 'veriff-api', name: 'Veriff', category: 'Identity', description: 'Verificación de identidad online con video y documentos.', website: 'https://www.veriff.com', logo: '✓', placeholder: 'veriff_...', docsUrl: 'https://developers.veriff.com' },
  { id: 'sumsub-api', name: 'Sumsub', category: 'Identity', description: 'KYC, KYB y AML todo en uno para cumplimiento regulatorio.', website: 'https://sumsub.com', logo: '🛡️', placeholder: 'sbx_...', docsUrl: 'https://developers.sumsub.com' },
  { id: 'persona-api', name: 'Persona', category: 'Identity', description: 'Plataforma de verificación de identidad configurable y escalable.', website: 'https://withpersona.com', logo: '👤', placeholder: 'persona_...', docsUrl: 'https://docs.withpersona.com' },
  { id: 'trulioo-api', name: 'Trulioo', category: 'Identity', description: 'Verificación de identidad global con cobertura en 195 países.', website: 'https://www.trulioo.com', logo: '🌏', placeholder: 'trulioo_...', docsUrl: 'https://developer.trulioo.com' },
  { id: 'idenfy-api', name: 'iDenfy', category: 'Identity', description: 'Verificación de identidad por IA con detección de liveness.', website: 'https://www.idenfy.com', logo: '📷', placeholder: 'idenfy_...', docsUrl: 'https://documentation.idenfy.com' },
  { id: 'au10tix-api', name: 'AU10TIX', category: 'Identity', description: 'Autenticación de documentos de identidad para onboarding digital.', website: 'https://www.au10tix.com', logo: '🔬', placeholder: 'au10tix_...', docsUrl: 'https://docs.au10tix.com' },
  { id: 'sardine-api', name: 'Sardine', category: 'Identity', description: 'Detección de fraude y compliance para fintech y crypto.', website: 'https://www.sardine.ai', logo: '🐟', placeholder: 'sardine_...', docsUrl: 'https://docs.sardine.ai' },
  { id: 'socure-api', name: 'Socure', category: 'Identity', description: 'Verificación de identidad digital con grafos predictivos.', website: 'https://www.socure.com', logo: '🧬', placeholder: 'socure_...', docsUrl: 'https://developer.socure.com' },
  { id: 'alloy-api', name: 'Alloy', category: 'Identity', description: 'Orquestación de decisiones de identidad y riesgo para banca.', website: 'https://www.alloy.com', logo: '⚙️', placeholder: 'alloy_...', docsUrl: 'https://docs.alloy.com' },
  { id: 'eventbrite-api', name: 'Eventbrite', category: 'Events', description: 'Creación y gestión de eventos con ticketing y promoción.', website: 'https://www.eventbrite.com', logo: '🎪', placeholder: 'eb_...', docsUrl: 'https://www.eventbrite.com/platform/api' },
  { id: 'luma-api', name: 'Luma', category: 'Events', description: 'Eventos presenciales y virtuales con registro y páginas elegantes.', website: 'https://lu.ma', logo: '✨', placeholder: 'luma_...', docsUrl: 'https://docs.lu.ma/reference' },
  { id: 'hopin-api', name: 'Hopin', category: 'Events', description: 'Plataforma de eventos virtuales e híbridos con networking.', website: 'https://hopin.com', logo: '🎤', placeholder: 'hopin_...', docsUrl: 'https://developers.hopin.com' },
  { id: 'bizzabo-api', name: 'Bizzabo', category: 'Events', description: 'Software de gestión de eventos con analytics y networking.', website: 'https://www.bizzabo.com', logo: '📅', placeholder: 'bizzabo_...', docsUrl: 'https://docs.bizzabo.com' },
  { id: 'splash-events-api', name: 'Splash', category: 'Events', description: 'Marketing de eventos con páginas branded y check-in móvil.', website: 'https://splashthat.com', logo: '💧', placeholder: 'splash_...', docsUrl: 'https://docs.splashthat.com' },
  { id: 'cvent-api', name: 'Cvent', category: 'Events', description: 'Gestión de eventos corporativos con registro y planificación.', website: 'https://www.cvent.com', logo: '🏢', placeholder: 'cvent_...', docsUrl: 'https://developers.cvent.com' },
  { id: 'meetup-api', name: 'Meetup', category: 'Events', description: 'Comunidades locales y eventos con API para grupos y RSVPs.', website: 'https://www.meetup.com', logo: '🤝', placeholder: 'meetup_...', docsUrl: 'https://www.meetup.com/api/' },
  { id: 'ticketmaster-api', name: 'Ticketmaster', category: 'Events', description: 'Descubrimiento y venta de entradas para espectáculos y deportes.', website: 'https://www.ticketmaster.com', logo: '🎟️', placeholder: 'tm_...', docsUrl: 'https://developer.ticketmaster.com' },
  { id: 'seatgeek-api', name: 'SeatGeek', category: 'Events', description: 'Agregador de entradas para deportes, conciertos y teatro.', website: 'https://seatgeek.com', logo: '💺', placeholder: 'seatgeek_...', docsUrl: 'https://platform.seatgeek.com' },
  { id: 'pretalx-api', name: 'pretalx', category: 'Events', description: 'Gestión de conferencias open-source con call for papers.', website: 'https://pretalx.com', logo: '🎙️', placeholder: 'pretalx_...', docsUrl: 'https://docs.pretalx.org/api/' },
  { id: 'ibm-watsonx', name: 'IBM watsonx', category: 'AI & ML', description: 'Plataforma empresarial de IA generativa y gobernanza de datos.', website: 'https://www.ibm.com/watsonx', logo: '🧠', placeholder: 'watsonx_...', docsUrl: 'https://cloud.ibm.com/apidocs/watson' },
  { id: 'datarobot-api', name: 'DataRobot', category: 'AI & ML', description: 'AutoML empresarial con predicción y despliegue automatizado.', website: 'https://www.datarobot.com', logo: '🤖', placeholder: 'datarobot_...', docsUrl: 'https://docs.datarobot.com' },
  { id: 'clarifai-api', name: 'Clarifai', category: 'AI & ML', description: 'Visión artificial y NLP con modelos preentrenados y custom.', website: 'https://www.clarifai.com', logo: '👁️', placeholder: 'clarifai_...', docsUrl: 'https://docs.clarifai.com' },
  { id: 'aws-bedrock', name: 'AWS Bedrock', category: 'AI & ML', description: 'Acceso a modelos fundacionales de IA via API gestionada de AWS.', website: 'https://aws.amazon.com/bedrock/', logo: '🪨', placeholder: 'bedrock_...', docsUrl: 'https://docs.aws.amazon.com/bedrock/' },
  { id: 'azure-openai', name: 'Azure OpenAI', category: 'AI & ML', description: 'Modelos OpenAI desplegados en infraestructura Azure con compliance.', website: 'https://azure.microsoft.com/products/ai-services/openai-service', logo: '🔵', placeholder: 'azure_oai_...', docsUrl: 'https://learn.microsoft.com/azure/ai-services/openai/' },
  { id: 'vertex-ai', name: 'Google Vertex AI', category: 'AI & ML', description: 'MLOps y Gemini en Google Cloud para entrenamiento y predicción.', website: 'https://cloud.google.com/vertex-ai', logo: '🔺', placeholder: 'vertex_...', docsUrl: 'https://cloud.google.com/vertex-ai/docs' },
  { id: 'labelbox-api', name: 'Labelbox', category: 'AI & ML', description: 'Etiquetado de datos y gestión de datasets para entrenar modelos.', website: 'https://labelbox.com', logo: '🏷️', placeholder: 'labelbox_...', docsUrl: 'https://docs.labelbox.com' },
  { id: 'neptune-ai', name: 'Neptune.ai', category: 'AI & ML', description: 'Tracking de experimentos ML con comparación y colaboración.', website: 'https://neptune.ai', logo: '🔱', placeholder: 'neptune_...', docsUrl: 'https://docs.neptune.ai' },
  { id: 'mlflow-api', name: 'MLflow', category: 'AI & ML', description: 'Plataforma open-source para gestión del ciclo de vida ML.', website: 'https://mlflow.org', logo: '📈', placeholder: 'mlflow_...', docsUrl: 'https://mlflow.org/docs/latest/' },
  { id: 'comet-ml', name: 'Comet ML', category: 'AI & ML', description: 'Seguimiento de experimentos con visualización y debugging de modelos.', website: 'https://www.comet.com', logo: '☄️', placeholder: 'comet_...', docsUrl: 'https://www.comet.com/docs/' },
  { id: 'octoai-api', name: 'OctoAI', category: 'AI & ML', description: 'Inferencia optimizada de modelos de IA con autoscaling.', website: 'https://octo.ai', logo: '🐙', placeholder: 'octoai_...', docsUrl: 'https://docs.octo.ai' },
  { id: 'cerebras-api', name: 'Cerebras', category: 'AI & ML', description: 'Inferencia ultrarrápida con chips de wafer-scale para LLMs.', website: 'https://cerebras.ai', logo: '🧪', placeholder: 'cerebras_...', docsUrl: 'https://docs.cerebras.ai' },
  { id: 'amazon-ses-api', name: 'Amazon SES', category: 'Email', description: 'Servicio de email escalable de AWS para envíos transaccionales y masivos.', website: 'https://aws.amazon.com/ses/', logo: '📨', placeholder: 'ses_...', docsUrl: 'https://docs.aws.amazon.com/ses/' },
  { id: 'brevo-email', name: 'Brevo', category: 'Email', description: 'Email marketing y transaccional con CRM y automatización.', website: 'https://www.brevo.com', logo: '💙', placeholder: 'brevo_...', docsUrl: 'https://developers.brevo.com' },
  { id: 'mailpace-api', name: 'MailPace', category: 'Email', description: 'Email transaccional simple con enfoque en privacidad.', website: 'https://mailpace.com', logo: '✉️', placeholder: 'mailpace_...', docsUrl: 'https://docs.mailpace.com' },
  { id: 'postmark-streams', name: 'Postmark Streams', category: 'Email', description: 'Streams de email transaccional y broadcast con alta entregabilidad.', website: 'https://postmarkapp.com', logo: '📮', placeholder: 'postmark_...', docsUrl: 'https://postmarkapp.com/developer' },
  { id: 'mailchimp-transactional', name: 'Mailchimp Mandrill', category: 'Email', description: 'API transaccional de Mailchimp para correos a escala.', website: 'https://mailchimp.com/features/transactional-email/', logo: '🐵', placeholder: 'mandrill_...', docsUrl: 'https://mailchimp.com/developer/transactional/api/' },
  { id: 'customer-io-email', name: 'Customer.io', category: 'Email', description: 'Mensajería automatizada basada en comportamiento del usuario.', website: 'https://customer.io', logo: '👥', placeholder: 'cio_...', docsUrl: 'https://customer.io/docs/api/' },
  { id: 'linode-api', name: 'Linode (Akamai)', category: 'Cloud', description: 'VPS y cloud computing con red global de Akamai.', website: 'https://www.linode.com', logo: '🟢', placeholder: 'linode_...', docsUrl: 'https://www.linode.com/docs/api/' },
  { id: 'oracle-oci', name: 'Oracle Cloud', category: 'Cloud', description: 'Infraestructura cloud de Oracle con GPU, cómputo y redes.', website: 'https://www.oracle.com/cloud/', logo: '🔴', placeholder: 'oci_...', docsUrl: 'https://docs.oracle.com/en-us/iaas/Content/API/' },
  { id: 'exoscale-api', name: 'Exoscale', category: 'Cloud', description: 'Cloud europeo con Kubernetes, object storage y DNS.', website: 'https://www.exoscale.com', logo: '🇨🇭', placeholder: 'exoscale_...', docsUrl: 'https://community.exoscale.com/documentation/' },
  { id: 'kamatera-api', name: 'Kamatera', category: 'Cloud', description: 'Servidores cloud escalables con facturación por minuto.', website: 'https://www.kamatera.com', logo: '☁️', placeholder: 'kamatera_...', docsUrl: 'https://www.kamatera.com/express/compute/docs/' },
  { id: 'civo-api', name: 'Civo', category: 'Cloud', description: 'Cloud nativo de Kubernetes con despliegue rápido y económico.', website: 'https://www.civo.com', logo: '🟦', placeholder: 'civo_...', docsUrl: 'https://www.civo.com/docs' },
  { id: 'lambda-cloud-api', name: 'Lambda Cloud', category: 'Cloud', description: 'GPU cloud para deep learning con instancias A100 y H100.', website: 'https://lambdalabs.com/service/gpu-cloud', logo: '🟣', placeholder: 'lambda_...', docsUrl: 'https://cloud.lambdalabs.com/api/v1/docs' },
  { id: 'paperspace-api', name: 'Paperspace', category: 'Cloud', description: 'GPUs en la nube para ML con notebooks y despliegue de modelos.', website: 'https://www.paperspace.com', logo: '📃', placeholder: 'paperspace_...', docsUrl: 'https://docs.paperspace.com' },
  { id: 'sumup-api', name: 'SumUp', category: 'Pagos', description: 'Pagos con tarjeta para pequeños negocios con API y lectores.', website: 'https://www.sumup.com', logo: '💳', placeholder: 'sumup_...', docsUrl: 'https://developer.sumup.com' },
  { id: 'zettle-api', name: 'Zettle (PayPal)', category: 'Pagos', description: 'Punto de venta y pagos para comercios con integración PayPal.', website: 'https://www.zettle.com', logo: '💰', placeholder: 'zettle_...', docsUrl: 'https://developer.zettle.com' },
  { id: 'rapyd-api', name: 'Rapyd', category: 'Pagos', description: 'Pagos y fintech como servicio con cobertura global.', website: 'https://www.rapyd.net', logo: '🌐', placeholder: 'rapyd_...', docsUrl: 'https://docs.rapyd.net' },
  { id: 'airwallex-api', name: 'Airwallex', category: 'Pagos', description: 'Pagos internacionales y cuentas multi-divisa para empresas.', website: 'https://www.airwallex.com', logo: '✈️', placeholder: 'airwallex_...', docsUrl: 'https://www.airwallex.com/docs/api' },
  { id: 'payoneer-api', name: 'Payoneer', category: 'Pagos', description: 'Pagos transfronterizos y cobros para freelancers y marketplaces.', website: 'https://www.payoneer.com', logo: '🔶', placeholder: 'payoneer_...', docsUrl: 'https://payouts.payoneer.com/docs/' },
  { id: 'flutterwave-api', name: 'Flutterwave', category: 'Pagos', description: 'Pagos para África con tarjetas, mobile money y transferencias.', website: 'https://flutterwave.com', logo: '🦋', placeholder: 'FLWSECK_...', docsUrl: 'https://developer.flutterwave.com' },
  { id: 'paystack-api', name: 'Paystack', category: 'Pagos', description: 'Pagos online para negocios en África con API simple.', website: 'https://paystack.com', logo: '🟢', placeholder: 'sk_live_...', docsUrl: 'https://paystack.com/docs/api/' },
  { id: 'mercadopago-v2', name: 'Mercado Pago (v2)', category: 'Pagos', description: 'Pagos en LATAM con checkout, QR y suscripciones.', website: 'https://www.mercadopago.com', logo: '🤝', placeholder: 'APP_USR_...', docsUrl: 'https://www.mercadopago.com/developers/es/docs' },
  { id: 'xendit-api', name: 'Xendit', category: 'Pagos', description: 'Pagos para el sudeste asiático con ewallet y bancos locales.', website: 'https://www.xendit.co', logo: '🔷', placeholder: 'xnd_...', docsUrl: 'https://docs.xendit.co' },
  { id: 'midtrans-api', name: 'Midtrans', category: 'Pagos', description: 'Gateway de pagos para Indonesia con múltiples métodos locales.', website: 'https://midtrans.com', logo: '🇮🇩', placeholder: 'mid_...', docsUrl: 'https://docs.midtrans.com' },
  { id: 'pagseguro-api', name: 'PagSeguro', category: 'Pagos', description: 'Pagos online y presenciales para Brasil con boleto y PIX.', website: 'https://pagseguro.uol.com.br', logo: '🇧🇷', placeholder: 'pagseguro_...', docsUrl: 'https://dev.pagseguro.uol.com.br' },
  { id: 'tumblr-api', name: 'Tumblr', category: 'Social', description: 'Microblogging con API para posts, likes y followers.', website: 'https://www.tumblr.com', logo: '📱', placeholder: 'tumblr_...', docsUrl: 'https://www.tumblr.com/docs/en/api/v2' },
  { id: 'kick-api', name: 'Kick', category: 'Social', description: 'Streaming en vivo con chat y comunidad de creadores.', website: 'https://kick.com', logo: '🟩', placeholder: 'kick_...', docsUrl: 'https://docs.kick.com' },
  { id: 'whatsapp-business', name: 'WhatsApp Business', category: 'Social', description: 'API de mensajería empresarial para comunicación con clientes.', website: 'https://business.whatsapp.com', logo: '📱', placeholder: 'whatsapp_biz_...', docsUrl: 'https://developers.facebook.com/docs/whatsapp' },
  { id: 'line-api', name: 'LINE Messaging', category: 'Social', description: 'Mensajería y bots para Asia con rich menus y Flex Messages.', website: 'https://line.me', logo: '🟢', placeholder: 'line_...', docsUrl: 'https://developers.line.biz/en/docs/messaging-api/' },
  { id: 'wechat-api', name: 'WeChat', category: 'Social', description: 'Mensajería y mini-programas para el mercado chino.', website: 'https://www.wechat.com', logo: '💚', placeholder: 'wechat_...', docsUrl: 'https://developers.weixin.qq.com/doc/' },
  { id: 'viber-api', name: 'Viber', category: 'Social', description: 'Mensajería con bots y campañas comerciales.', website: 'https://www.viber.com', logo: '💜', placeholder: 'viber_...', docsUrl: 'https://developers.viber.com/docs/api/' },
  { id: 'matrix-api', name: 'Matrix (Element)', category: 'Social', description: 'Protocolo de comunicación descentralizado con cifrado E2E.', website: 'https://matrix.org', logo: '🔐', placeholder: 'matrix_...', docsUrl: 'https://spec.matrix.org' },
  { id: 'countly-api', name: 'Countly', category: 'Analytics', description: 'Analytics de producto open-source con crash reporting y push.', website: 'https://countly.com', logo: '📊', placeholder: 'countly_...', docsUrl: 'https://api.count.ly/reference' },
  { id: 'plausible-analytics', name: 'Plausible Analytics', category: 'Analytics', description: 'Analytics web ligero, privado y sin cookies.', website: 'https://plausible.io', logo: '📈', placeholder: 'plausible_...', docsUrl: 'https://plausible.io/docs/stats-api' },
  { id: 'snowplow-api', name: 'Snowplow', category: 'Analytics', description: 'Recolección de datos de comportamiento con pipeline open-source.', website: 'https://snowplow.io', logo: '❄️', placeholder: 'snowplow_...', docsUrl: 'https://docs.snowplow.io' },
  { id: 'june-analytics', name: 'June.so', category: 'Analytics', description: 'Analytics de producto para SaaS B2B con segmentos de empresas.', website: 'https://june.so', logo: '🌸', placeholder: 'june_...', docsUrl: 'https://www.june.so/docs/api' },
  { id: 'rudderstack-api', name: 'RudderStack', category: 'Analytics', description: 'Customer data platform open-source para data warehouses.', website: 'https://rudderstack.com', logo: '🚢', placeholder: 'rudder_...', docsUrl: 'https://www.rudderstack.com/docs/' },
  { id: 'pirsch-analytics', name: 'Pirsch', category: 'Analytics', description: 'Analytics web sin cookies que cumple con GDPR.', website: 'https://pirsch.io', logo: '🍑', placeholder: 'pirsch_...', docsUrl: 'https://docs.pirsch.io/api' },
  { id: 'zoom-api', name: 'Zoom', category: 'Comunicación', description: 'Videoconferencias y webinars con API para reuniones.', website: 'https://zoom.us', logo: '📹', placeholder: 'zoom_...', docsUrl: 'https://developers.zoom.us/docs/api/' },
  { id: 'teams-graph-api', name: 'Microsoft Teams', category: 'Comunicación', description: 'Bots, tabs y extensiones para colaboración en Teams.', website: 'https://www.microsoft.com/microsoft-teams', logo: '💬', placeholder: 'teams_...', docsUrl: 'https://learn.microsoft.com/graph/teams-concept-overview' },
  { id: 'ringcentral-api', name: 'RingCentral', category: 'Comunicación', description: 'UCaaS con voz, SMS y video empresarial.', website: 'https://www.ringcentral.com', logo: '📞', placeholder: 'ringcentral_...', docsUrl: 'https://developers.ringcentral.com' },
  { id: 'webex-api', name: 'Cisco Webex', category: 'Comunicación', description: 'Reuniones, mensajería y dispositivos con API REST.', website: 'https://www.webex.com', logo: '🔵', placeholder: 'webex_...', docsUrl: 'https://developer.webex.com' },
  { id: 'livekit-api', name: 'LiveKit', category: 'Comunicación', description: 'WebRTC open-source para audio, video y datos en tiempo real.', website: 'https://livekit.io', logo: '🎙️', placeholder: 'livekit_...', docsUrl: 'https://docs.livekit.io' },
  { id: 'jitsi-api', name: 'Jitsi Meet', category: 'Comunicación', description: 'Videoconferencia open-source con integración y SDK.', website: 'https://jitsi.org', logo: '📺', placeholder: 'jitsi_...', docsUrl: 'https://jitsi.github.io/handbook/' },
  { id: 'minio-api', name: 'MinIO', category: 'Storage', description: 'Almacenamiento de objetos compatible con S3 de alto rendimiento.', website: 'https://min.io', logo: '🗂️', placeholder: 'minio_...', docsUrl: 'https://min.io/docs/minio/linux/reference/minio-mc.html' },
  { id: 'digitalocean-spaces', name: 'DigitalOcean Spaces', category: 'Storage', description: 'Object storage compatible con S3 con CDN integrado.', website: 'https://www.digitalocean.com/products/spaces', logo: '🌊', placeholder: 'do_spaces_...', docsUrl: 'https://docs.digitalocean.com/reference/api/spaces-api/' },
  { id: 'bunny-storage', name: 'Bunny.net Storage', category: 'Storage', description: 'Almacenamiento edge replicado globalmente con API simple.', website: 'https://bunny.net/storage', logo: '🐰', placeholder: 'bunny_...', docsUrl: 'https://docs.bunny.net/reference/storage-api' },
  { id: 'tigris-api', name: 'Tigris', category: 'Storage', description: 'Object storage distribuido globalmente compatible con S3.', website: 'https://www.tigrisdata.com', logo: '🐯', placeholder: 'tid_...', docsUrl: 'https://www.tigrisdata.com/docs/' },
  { id: 'ceph-api', name: 'Ceph', category: 'Storage', description: 'Almacenamiento distribuido open-source con block, object y file.', website: 'https://ceph.io', logo: '🐙', placeholder: 'ceph_...', docsUrl: 'https://docs.ceph.com/en/latest/' },
  { id: 'supabase-db', name: 'Supabase Database', category: 'Base de datos', description: 'PostgreSQL gestionado con API auto-generada y realtime.', website: 'https://supabase.com', logo: '⚡', placeholder: 'supabase_db_...', docsUrl: 'https://supabase.com/docs/guides/database' },
  { id: 'aiven-pg', name: 'Aiven', category: 'Base de datos', description: 'PostgreSQL, MySQL, Kafka y Redis gestionados en multi-cloud.', website: 'https://aiven.io', logo: '☁️', placeholder: 'aiven_...', docsUrl: 'https://docs.aiven.io' },
  { id: 'tidb-cloud-api', name: 'TiDB Cloud', category: 'Base de datos', description: 'Base SQL distribuida compatible con MySQL para cargas HTAP.', website: 'https://www.pingcap.com/tidb-cloud', logo: '🐘', placeholder: 'tidb_...', docsUrl: 'https://docs.pingcap.com/tidbcloud/' },
  { id: 'singlestore-api', name: 'SingleStore', category: 'Base de datos', description: 'Base de datos analítica y transaccional unificada en memoria.', website: 'https://www.singlestore.com', logo: '⚡', placeholder: 'singlestore_...', docsUrl: 'https://docs.singlestore.com' },
  { id: 'fauna-api', name: 'Fauna', category: 'Base de datos', description: 'Base de datos distribuida con transacciones ACID y GraphQL.', website: 'https://fauna.com', logo: '🦎', placeholder: 'fnAE...', docsUrl: 'https://docs.fauna.com' },
  { id: 'datomic-api', name: 'Datomic', category: 'Base de datos', description: 'Base inmutable con historial completo de datos y consultas Datalog.', website: 'https://www.datomic.com', logo: '💠', placeholder: 'datomic_...', docsUrl: 'https://docs.datomic.com' },
  { id: 'xata-api', name: 'Xata', category: 'Base de datos', description: 'Base de datos serverless con búsqueda full-text y branching.', website: 'https://xata.io', logo: '🔮', placeholder: 'xau_...', docsUrl: 'https://xata.io/docs' },
  { id: 'convex-api', name: 'Convex', category: 'Base de datos', description: 'Backend reactivo con base de datos, funciones y scheduling.', website: 'https://www.convex.dev', logo: '🔺', placeholder: 'convex_...', docsUrl: 'https://docs.convex.dev' },
  { id: 'jenkins-api', name: 'Jenkins', category: 'DevOps', description: 'Servidor de CI/CD open-source con pipeline como código.', website: 'https://www.jenkins.io', logo: '🔧', placeholder: 'jenkins_...', docsUrl: 'https://www.jenkins.io/doc/' },
  { id: 'buddy-ci', name: 'Buddy', category: 'DevOps', description: 'CI/CD visual con pipelines basados en contenedores.', website: 'https://buddy.works', logo: '🤝', placeholder: 'buddy_...', docsUrl: 'https://buddy.works/docs' },
  { id: 'semaphore-ci', name: 'Semaphore', category: 'DevOps', description: 'Integración continua en la nube con paralelismo y caching.', website: 'https://semaphoreci.com', logo: '🚦', placeholder: 'semaphore_...', docsUrl: 'https://docs.semaphoreci.com' },
  { id: 'octopus-deploy', name: 'Octopus Deploy', category: 'DevOps', description: 'Despliegue automatizado para Kubernetes, VMs y cloud.', website: 'https://octopus.com', logo: '🐙', placeholder: 'octopus_...', docsUrl: 'https://octopus.com/docs' },
  { id: 'sonarqube-api', name: 'SonarQube', category: 'DevOps', description: 'Análisis estático de código con detección de bugs y vulnerabilidades.', website: 'https://www.sonarqube.org', logo: '🔍', placeholder: 'sonar_...', docsUrl: 'https://docs.sonarsource.com/sonarqube/' },
  { id: 'codefresh-api', name: 'Codefresh', category: 'DevOps', description: 'GitOps y CI/CD nativo de Kubernetes con Argo.', website: 'https://codefresh.io', logo: '☕', placeholder: 'codefresh_...', docsUrl: 'https://codefresh.io/docs/' },
  { id: 'waypoint-api', name: 'HashiCorp Waypoint', category: 'DevOps', description: 'Despliegue de aplicaciones simplificado para cualquier plataforma.', website: 'https://www.waypointproject.io', logo: '🧭', placeholder: 'waypoint_...', docsUrl: 'https://developer.hashicorp.com/waypoint/docs' },
  { id: 'portainer-api', name: 'Portainer', category: 'DevOps', description: 'Gestión visual de contenedores Docker y Kubernetes.', website: 'https://www.portainer.io', logo: '🐳', placeholder: 'portainer_...', docsUrl: 'https://docs.portainer.io/api/access' },
  { id: 'openstreetmap-api', name: 'OpenStreetMap', category: 'Mapas', description: 'Datos geográficos abiertos del mundo con APIs de edición y consulta.', website: 'https://www.openstreetmap.org', logo: '🗺️', placeholder: 'osm_...', docsUrl: 'https://wiki.openstreetmap.org/wiki/API' },
  { id: 'what3words-api', name: 'what3words', category: 'Mapas', description: 'Direcciones de 3 palabras para localización precisa en cualquier lugar.', website: 'https://what3words.com', logo: '📍', placeholder: 'w3w_...', docsUrl: 'https://developer.what3words.com' },
  { id: 'positionstack-api', name: 'positionstack', category: 'Mapas', description: 'Geocodificación directa e inversa con API REST gratuita.', website: 'https://positionstack.com', logo: '📌', placeholder: 'positionstack_...', docsUrl: 'https://positionstack.com/documentation' },
  { id: 'geoapify-api', name: 'Geoapify', category: 'Mapas', description: 'Mapas, geocodificación y routing con tiles vector modernos.', website: 'https://www.geoapify.com', logo: '🌍', placeholder: 'geoapify_...', docsUrl: 'https://apidocs.geoapify.com' },
  { id: 'radar-io-api', name: 'Radar', category: 'Mapas', description: 'Geofencing, geocodificación y tracking para apps móviles.', website: 'https://radar.com', logo: '📡', placeholder: 'prj_live_...', docsUrl: 'https://radar.com/documentation' },
  { id: 'keycloak-api', name: 'Keycloak', category: 'Auth', description: 'IAM open-source con SSO, OIDC, SAML y federación.', website: 'https://www.keycloak.org', logo: '🔑', placeholder: 'keycloak_...', docsUrl: 'https://www.keycloak.org/documentation' },
  { id: 'microsoft-entra', name: 'Microsoft Entra ID', category: 'Auth', description: 'Identidad empresarial con OAuth, SAML y MFA.', website: 'https://www.microsoft.com/security/business/microsoft-entra', logo: '🪟', placeholder: 'entra_...', docsUrl: 'https://learn.microsoft.com/en-us/entra/' },
  { id: 'jumpcloud-api', name: 'JumpCloud', category: 'Auth', description: 'Directorio cloud con SSO, MFA y gestión de dispositivos.', website: 'https://jumpcloud.com', logo: '🔐', placeholder: 'jumpcloud_...', docsUrl: 'https://docs.jumpcloud.com' },
  { id: 'frontegg-api', name: 'Frontegg', category: 'Auth', description: 'Autenticación B2B con SSO, roles y multi-tenant.', website: 'https://frontegg.com', logo: '🥚', placeholder: 'frontegg_...', docsUrl: 'https://developers.frontegg.com' },
  { id: 'descope-api', name: 'Descope', category: 'Auth', description: 'Flujos de auth sin código con passkeys y CIAM.', website: 'https://www.descope.com', logo: '🎯', placeholder: 'descope_...', docsUrl: 'https://docs.descope.com' },
  { id: 'propelauth-api', name: 'PropelAuth', category: 'Auth', description: 'Autenticación B2B con organizaciones y roles lista para usar.', website: 'https://www.propelauth.com', logo: '🚀', placeholder: 'propel_...', docsUrl: 'https://docs.propelauth.com' },
  { id: 'zoho-crm', name: 'Zoho CRM', category: 'CRM & Marketing', description: 'CRM en la nube con automatización y API REST extensa.', website: 'https://www.zoho.com/crm/', logo: '📇', placeholder: 'zoho_crm_...', docsUrl: 'https://www.zoho.com/crm/developer/docs/api/' },
  { id: 'activecampaign-api', name: 'ActiveCampaign', category: 'CRM & Marketing', description: 'Automatización de marketing con email y CRM unificados.', website: 'https://www.activecampaign.com', logo: '📧', placeholder: 'activecampaign_...', docsUrl: 'https://developers.activecampaign.com' },
  { id: 'drip-api', name: 'Drip', category: 'CRM & Marketing', description: 'Marketing automation para e-commerce con segmentación avanzada.', website: 'https://www.drip.com', logo: '💧', placeholder: 'drip_...', docsUrl: 'https://developer.drip.com' },
  { id: 'klaviyo-api', name: 'Klaviyo', category: 'CRM & Marketing', description: 'Marketing para e-commerce con email, SMS y segmentación por datos.', website: 'https://www.klaviyo.com', logo: '📊', placeholder: 'pk_...', docsUrl: 'https://developers.klaviyo.com' },
  { id: 'sendinblue-api', name: 'Brevo CRM', category: 'CRM & Marketing', description: 'CRM con pipeline de ventas, reuniones y automatización.', website: 'https://www.brevo.com/crm/', logo: '💙', placeholder: 'brevo_crm_...', docsUrl: 'https://developers.brevo.com' },
  { id: 'copper-crm-api', name: 'Copper CRM', category: 'CRM & Marketing', description: 'CRM integrado con Google Workspace para equipos de ventas.', website: 'https://www.copper.com', logo: '🥉', placeholder: 'copper_...', docsUrl: 'https://developer.copper.com' },
  { id: 'squarespace-api', name: 'Squarespace', category: 'E-commerce', description: 'Sitios web y tiendas con diseño premium y API commerce.', website: 'https://www.squarespace.com', logo: '⬛', placeholder: 'sqsp_...', docsUrl: 'https://developers.squarespace.com' },
  { id: 'wix-api', name: 'Wix eCommerce', category: 'E-commerce', description: 'Tiendas online con gestión de productos y pedidos vía API.', website: 'https://www.wix.com', logo: '✨', placeholder: 'wix_...', docsUrl: 'https://dev.wix.com/docs/rest' },
  { id: 'ecwid-api', name: 'Ecwid', category: 'E-commerce', description: 'Comercio electrónico embebido en cualquier sitio web.', website: 'https://www.ecwid.com', logo: '🛒', placeholder: 'ecwid_...', docsUrl: 'https://api-docs.ecwid.com' },
  { id: 'prestashop-api', name: 'PrestaShop', category: 'E-commerce', description: 'Plataforma e-commerce open-source con API y módulos.', website: 'https://www.prestashop.com', logo: '🛍️', placeholder: 'presta_...', docsUrl: 'https://devdocs.prestashop.com' },
  { id: 'vtex-api', name: 'VTEX', category: 'E-commerce', description: 'Plataforma enterprise de comercio digital para LATAM y global.', website: 'https://vtex.com', logo: '🔴', placeholder: 'vtex_...', docsUrl: 'https://developers.vtex.com' },
  { id: 'stripe-connect', name: 'Stripe Connect', category: 'E-commerce', description: 'Marketplace y pagos multi-partido con onboarding de vendedores.', website: 'https://stripe.com/connect', logo: '🔗', placeholder: 'sk_live_...', docsUrl: 'https://docs.stripe.com/connect' },
  { id: 'twitch-ext-api', name: 'Twitch Extensions', category: 'Media', description: 'Extensiones interactivas para streams en vivo de Twitch.', website: 'https://www.twitch.tv', logo: '🟣', placeholder: 'twitch_ext_...', docsUrl: 'https://dev.twitch.tv/docs/extensions/' },
  { id: 'soundcloud-api', name: 'SoundCloud', category: 'Media', description: 'Plataforma de audio con streaming y distribución de música.', website: 'https://soundcloud.com', logo: '🔊', placeholder: 'soundcloud_...', docsUrl: 'https://developers.soundcloud.com' },
  { id: 'deezer-api', name: 'Deezer', category: 'Media', description: 'Streaming de música con API para catálogo y playlists.', website: 'https://www.deezer.com', logo: '🎶', placeholder: 'deezer_...', docsUrl: 'https://developers.deezer.com/api' },
  { id: 'tidal-api', name: 'TIDAL', category: 'Media', description: 'Streaming de música HiFi con API para artistas y contenido.', website: 'https://tidal.com', logo: '🌊', placeholder: 'tidal_...', docsUrl: 'https://developer.tidal.com' },
  { id: 'bandcamp-api', name: 'Bandcamp', category: 'Media', description: 'Plataforma de venta directa de música y merch para artistas.', website: 'https://bandcamp.com', logo: '🎵', placeholder: 'bandcamp_...', docsUrl: 'https://bandcamp.com/developer' },
  { id: 'removebg-api', name: 'remove.bg', category: 'Media', description: 'Eliminar fondo de imágenes automáticamente con IA.', website: 'https://www.remove.bg', logo: '✂️', placeholder: 'removebg_...', docsUrl: 'https://www.remove.bg/api' },
  { id: 'tinypng-api', name: 'TinyPNG', category: 'Media', description: 'Compresión inteligente de imágenes PNG y JPEG vía API.', website: 'https://tinypng.com', logo: '🐼', placeholder: 'tinypng_...', docsUrl: 'https://tinypng.com/developers' },
  { id: 'todoist-api', name: 'Todoist', category: 'Productividad', description: 'Gestión de tareas y proyectos con API sync y REST.', website: 'https://todoist.com', logo: '✅', placeholder: 'todoist_...', docsUrl: 'https://developer.todoist.com' },
  { id: 'obsidian-api', name: 'Obsidian', category: 'Productividad', description: 'Base de conocimiento personal con markdown y plugins.', website: 'https://obsidian.md', logo: '💎', placeholder: 'obsidian_...', docsUrl: 'https://docs.obsidian.md' },
  { id: 'coda-api', name: 'Coda', category: 'Productividad', description: 'Documentos con datos en vivo, botones y automatizaciones.', website: 'https://coda.io', logo: '📝', placeholder: 'coda_...', docsUrl: 'https://coda.io/developers/apis/v1' },
  { id: 'basecamp-api', name: 'Basecamp', category: 'Productividad', description: 'Gestión de proyectos con to-dos, mensajes y archivos.', website: 'https://basecamp.com', logo: '⛺', placeholder: 'basecamp_...', docsUrl: 'https://github.com/basecamp/bc3-api' },
  { id: 'smartsheet-api', name: 'Smartsheet', category: 'Productividad', description: 'Hojas de cálculo con gestión de trabajo y automatización.', website: 'https://www.smartsheet.com', logo: '📊', placeholder: 'smartsheet_...', docsUrl: 'https://smartsheet.redoc.ly' },
  { id: 'roam-research-api', name: 'Roam Research', category: 'Productividad', description: 'Notas enlazadas con grafo de conocimiento bidireccional.', website: 'https://roamresearch.com', logo: '🔗', placeholder: 'roam_...', docsUrl: 'https://roamresearch.com/#/app/developer-documentation' },
  { id: 'cal-com-api', name: 'Cal.com', category: 'Productividad', description: 'Programación de reuniones open-source con múltiples calendarios.', website: 'https://cal.com', logo: '📅', placeholder: 'cal_...', docsUrl: 'https://cal.com/docs/enterprise-features/api' },
  { id: 'calendly-api', name: 'Calendly', category: 'Productividad', description: 'Programación de citas sin fricción con integraciones y webhooks.', website: 'https://calendly.com', logo: '🗓️', placeholder: 'calendly_...', docsUrl: 'https://developer.calendly.com' },
  { id: 'crowdstrike-api', name: 'CrowdStrike', category: 'Seguridad', description: 'Protección endpoint con IA y threat intelligence en la nube.', website: 'https://www.crowdstrike.com', logo: '🦅', placeholder: 'crowdstrike_...', docsUrl: 'https://falcon.crowdstrike.com/documentation/' },
  { id: 'wiz-api', name: 'Wiz', category: 'Seguridad', description: 'Seguridad cloud nativa con visibilidad completa del stack.', website: 'https://www.wiz.io', logo: '🧙', placeholder: 'wiz_...', docsUrl: 'https://docs.wiz.io' },
  { id: 'lacework-api', name: 'Lacework', category: 'Seguridad', description: 'Seguridad cloud con detección de anomalías y compliance.', website: 'https://www.lacework.com', logo: '🔒', placeholder: 'lacework_...', docsUrl: 'https://docs.lacework.net' },
  { id: 'aqua-security', name: 'Aqua Security', category: 'Seguridad', description: 'Seguridad para contenedores, Kubernetes y funciones serverless.', website: 'https://www.aquasec.com', logo: '🐠', placeholder: 'aqua_...', docsUrl: 'https://docs.aquasec.com' },
  { id: 'orca-security', name: 'Orca Security', category: 'Seguridad', description: 'CNAPP con escaneo sin agentes para AWS, Azure y GCP.', website: 'https://orca.security', logo: '🐋', placeholder: 'orca_...', docsUrl: 'https://docs.orcasecurity.io' },
  { id: 'okta-api', name: 'Okta', category: 'Seguridad', description: 'Gestión de identidad empresarial con SSO, MFA y lifecycle.', website: 'https://www.okta.com', logo: '🔵', placeholder: 'okta_...', docsUrl: 'https://developer.okta.com/docs/' },
  { id: 'hivemq-api', name: 'HiveMQ', category: 'IoT', description: 'Broker MQTT gestionado para IoT industrial y conectividad.', website: 'https://www.hivemq.com', logo: '🐝', placeholder: 'hivemq_...', docsUrl: 'https://docs.hivemq.com' },
  { id: 'azure-iot', name: 'Azure IoT Hub', category: 'IoT', description: 'Plataforma IoT de Microsoft para gestión de dispositivos.', website: 'https://azure.microsoft.com/services/iot-hub/', logo: '☁️', placeholder: 'azure_iot_...', docsUrl: 'https://learn.microsoft.com/azure/iot-hub/' },
  { id: 'aws-iot-core', name: 'AWS IoT Core', category: 'IoT', description: 'Servicio de IoT gestionado para conectar dispositivos a la nube.', website: 'https://aws.amazon.com/iot-core/', logo: '📡', placeholder: 'aws_iot_...', docsUrl: 'https://docs.aws.amazon.com/iot/' },
  { id: 'balena-api', name: 'Balena', category: 'IoT', description: 'Plataforma para desplegar y gestionar flotas de dispositivos IoT.', website: 'https://www.balena.io', logo: '🐳', placeholder: 'balena_...', docsUrl: 'https://www.balena.io/docs/reference/api/overview/' },
  { id: 'losant-api', name: 'Losant', category: 'IoT', description: 'Plataforma IoT empresarial con workflows visuales y dashboards.', website: 'https://www.losant.com', logo: '🔌', placeholder: 'losant_...', docsUrl: 'https://docs.losant.com/rest-api/overview/' },
  { id: 'dwolla-api', name: 'Dwolla', category: 'Fintech', description: 'Pagos ACH y transferencias bancarias en Estados Unidos.', website: 'https://www.dwolla.com', logo: '💵', placeholder: 'dwolla_...', docsUrl: 'https://developers.dwolla.com' },
  { id: 'salt-edge-api', name: 'Salt Edge', category: 'Fintech', description: 'Agregación bancaria PSD2 y open banking para Europa.', website: 'https://www.saltedge.com', logo: '🧂', placeholder: 'saltedge_...', docsUrl: 'https://docs.saltedge.com' },
  { id: 'finicity-api', name: 'Finicity (Mastercard)', category: 'Fintech', description: 'Verificación de ingresos y datos financieros para préstamos.', website: 'https://www.finicity.com', logo: '📊', placeholder: 'finicity_...', docsUrl: 'https://developer.mastercard.com/product/finicity' },
  { id: 'yapily-api', name: 'Yapily', category: 'Fintech', description: 'Open banking con conectores a bancos europeos y pagos A2A.', website: 'https://www.yapily.com', logo: '🏦', placeholder: 'yapily_...', docsUrl: 'https://docs.yapily.com' },
  { id: 'belvo-api', name: 'Belvo', category: 'Fintech', description: 'Open finance para LATAM con conexión a bancos y datos fiscales.', website: 'https://belvo.com', logo: '🐝', placeholder: 'belvo_...', docsUrl: 'https://developers.belvo.com' },
  { id: 'modulr-api', name: 'Modulr', category: 'Fintech', description: 'Cuentas y pagos embebidos para plataformas fintech UK/EU.', website: 'https://www.modulrfinance.com', logo: '💳', placeholder: 'modulr_...', docsUrl: 'https://modulr.readme.io' },
  { id: 'chainstack-api', name: 'Chainstack', category: 'Blockchain', description: 'Infraestructura de nodos blockchain multi-protocolo.', website: 'https://chainstack.com', logo: '⛓️', placeholder: 'chainstack_...', docsUrl: 'https://docs.chainstack.com' },
  { id: 'getblock-api', name: 'GetBlock', category: 'Blockchain', description: 'Acceso RPC a nodos blockchain para más de 50 protocolos.', website: 'https://getblock.io', logo: '🧱', placeholder: 'getblock_...', docsUrl: 'https://getblock.io/docs/' },
  { id: 'tatum-api', name: 'Tatum', category: 'Blockchain', description: 'SDK para construir apps Web3 sin gestionar nodos.', website: 'https://tatum.io', logo: '🔮', placeholder: 'tatum_...', docsUrl: 'https://docs.tatum.io' },
  { id: 'nftscan-api', name: 'NFTScan', category: 'Blockchain', description: 'API de datos NFT multi-chain con metadata y analytics.', website: 'https://nftscan.com', logo: '🖼️', placeholder: 'nftscan_...', docsUrl: 'https://docs.nftscan.com' },
  { id: 'covalent-api', name: 'Covalent', category: 'Blockchain', description: 'API unificada de datos blockchain para más de 100 cadenas.', website: 'https://www.covalenthq.com', logo: '🔗', placeholder: 'cqt_...', docsUrl: 'https://www.covalenthq.com/docs/' },
  { id: 'zapper-api', name: 'Zapper', category: 'Blockchain', description: 'Portfolio DeFi y datos de protocolos para dashboards Web3.', website: 'https://zapper.xyz', logo: '⚡', placeholder: 'zapper_...', docsUrl: 'https://studio.zapper.xyz/docs/apis' },
  { id: 'playwright-cloud', name: 'Playwright', category: 'Testing', description: 'Testing E2E cross-browser con auto-waits y trazas.', website: 'https://playwright.dev', logo: '🎭', placeholder: 'playwright_...', docsUrl: 'https://playwright.dev/docs/intro' },
  { id: 'percy-api', name: 'Percy (BrowserStack)', category: 'Testing', description: 'Visual testing automatizado con comparación de screenshots.', website: 'https://percy.io', logo: '👁️', placeholder: 'percy_...', docsUrl: 'https://docs.percy.io' },
  { id: 'chromatic-api', name: 'Chromatic', category: 'Testing', description: 'Visual testing y revisión de UI para Storybook.', website: 'https://www.chromatic.com', logo: '🎨', placeholder: 'chromatic_...', docsUrl: 'https://www.chromatic.com/docs/' },
  { id: 'mabl-api', name: 'mabl', category: 'Testing', description: 'Testing automatizado con IA para aplicaciones web.', website: 'https://www.mabl.com', logo: '🧪', placeholder: 'mabl_...', docsUrl: 'https://help.mabl.com' },
  { id: 'testim-api', name: 'Testim', category: 'Testing', description: 'Testing E2E con grabación inteligente y auto-healing.', website: 'https://www.testim.io', logo: '🔬', placeholder: 'testim_...', docsUrl: 'https://help.testim.io' },
  { id: 'cloudfront-api', name: 'AWS CloudFront', category: 'CDN & Performance', description: 'CDN global de AWS con edge computing y Lambda@Edge.', website: 'https://aws.amazon.com/cloudfront/', logo: '☁️', placeholder: 'cloudfront_...', docsUrl: 'https://docs.aws.amazon.com/cloudfront/' },
  { id: 'azure-cdn-api', name: 'Azure CDN', category: 'CDN & Performance', description: 'CDN de Microsoft con reglas de caché y WAF integrado.', website: 'https://azure.microsoft.com/services/cdn/', logo: '🔵', placeholder: 'azure_cdn_...', docsUrl: 'https://learn.microsoft.com/azure/cdn/' },
  { id: 'gcore-api', name: 'Gcore CDN', category: 'CDN & Performance', description: 'CDN global con streaming, edge compute y protección DDoS.', website: 'https://gcore.com', logo: '🌐', placeholder: 'gcore_...', docsUrl: 'https://gcore.com/docs/' },
  { id: 'section-io-api', name: 'Section.io', category: 'CDN & Performance', description: 'Edge computing modular con Varnish y seguridad.', website: 'https://www.section.io', logo: '📦', placeholder: 'section_...', docsUrl: 'https://www.section.io/docs/' },
  { id: 'webpagetest-api', name: 'WebPageTest', category: 'CDN & Performance', description: 'Tests de rendimiento web desde múltiples ubicaciones y navegadores.', website: 'https://www.webpagetest.org', logo: '⏱️', placeholder: 'wpt_...', docsUrl: 'https://docs.webpagetest.org/api/' },
  { id: 'elasticsearch-api', name: 'Elasticsearch', category: 'Search', description: 'Motor de búsqueda distribuido y analytics en tiempo real.', website: 'https://www.elastic.co', logo: '🔍', placeholder: 'elastic_...', docsUrl: 'https://www.elastic.co/guide/en/elasticsearch/reference/current/' },
  { id: 'opensearch-api', name: 'OpenSearch', category: 'Search', description: 'Motor de búsqueda open-source derivado de Elasticsearch.', website: 'https://opensearch.org', logo: '🔎', placeholder: 'opensearch_...', docsUrl: 'https://opensearch.org/docs/latest/' },
  { id: 'docsearch-api', name: 'DocSearch (Algolia)', category: 'Search', description: 'Búsqueda en documentación técnica powered by Algolia.', website: 'https://docsearch.algolia.com', logo: '📚', placeholder: 'docsearch_...', docsUrl: 'https://docsearch.algolia.com/docs/what-is-docsearch' },
  { id: 'orama-api', name: 'Orama', category: 'Search', description: 'Motor de búsqueda full-text en el edge con vectores.', website: 'https://orama.com', logo: '🔮', placeholder: 'orama_...', docsUrl: 'https://docs.orama.com' },
  { id: 'trieve-api', name: 'Trieve', category: 'Search', description: 'Búsqueda semántica y RAG como servicio con chunking.', website: 'https://trieve.ai', logo: '🌲', placeholder: 'trieve_...', docsUrl: 'https://docs.trieve.ai' },
  { id: 'shipengine-api', name: 'ShipEngine', category: 'Logistics', description: 'API de envíos multi-transportista con etiquetas y tracking.', website: 'https://www.shipengine.com', logo: '📦', placeholder: 'shipengine_...', docsUrl: 'https://www.shipengine.com/docs/' },
  { id: 'correos-api', name: 'Correos (España)', category: 'Logistics', description: 'API de envíos, oficinas y seguimiento de Correos.', website: 'https://www.correos.es', logo: '🇪🇸', placeholder: 'correos_...', docsUrl: 'https://developers.correos.es' },
  { id: 'seur-api', name: 'SEUR', category: 'Logistics', description: 'Envíos nacionales e internacionales con tracking en España.', website: 'https://www.seur.com', logo: '🔴', placeholder: 'seur_...', docsUrl: 'https://www.seur.com/empresas/' },
  { id: 'gls-api', name: 'GLS', category: 'Logistics', description: 'Paquetería europea con API de envíos y recogidas.', website: 'https://www.gls-group.eu', logo: '📮', placeholder: 'gls_...', docsUrl: 'https://api.gls-group.eu' },
  { id: 'nacex-api', name: 'Nacex', category: 'Logistics', description: 'Mensajería urgente en España con API de envíos y tracking.', website: 'https://www.nacex.es', logo: '🚚', placeholder: 'nacex_...', docsUrl: 'https://www.nacex.es/irWebWS.do' },
  { id: 'laposte-api', name: 'La Poste (France)', category: 'Logistics', description: 'Envíos y tracking de paquetes del correo francés.', website: 'https://developer.laposte.fr', logo: '🇫🇷', placeholder: 'laposte_...', docsUrl: 'https://developer.laposte.fr/products' },
  { id: 'flexport-api', name: 'Flexport', category: 'Logistics', description: 'Logística global con visibilidad de cadena de suministro.', website: 'https://www.flexport.com', logo: '🌏', placeholder: 'flexport_...', docsUrl: 'https://developers.flexport.com' },
  { id: 'elation-api', name: 'Elation Health', category: 'Healthcare', description: 'EHR centrado en atención primaria con API clínica REST.', website: 'https://www.elationhealth.com', logo: '🩺', placeholder: 'elation_...', docsUrl: 'https://docs.elationhealth.com' },
  { id: 'redox-api', name: 'Redox Engine', category: 'Healthcare', description: 'Interoperabilidad FHIR para conectar sistemas sanitarios.', website: 'https://www.redoxengine.com', logo: '🔴', placeholder: 'redox_...', docsUrl: 'https://docs.redoxengine.com' },
  { id: 'kareo-api', name: 'Kareo (Tebra)', category: 'Healthcare', description: 'Gestión de consultas médicas con facturación y EHR.', website: 'https://www.tebra.com', logo: '💊', placeholder: 'kareo_...', docsUrl: 'https://developer.kareo.com' },
  { id: 'hint-health-api', name: 'Hint Health', category: 'Healthcare', description: 'Plataforma de membresía y DPC para consultas médicas.', website: 'https://www.hint.com', logo: '💡', placeholder: 'hint_...', docsUrl: 'https://api.hint.com/docs' },
  { id: 'veradigm-api', name: 'Veradigm', category: 'Healthcare', description: 'Red de datos sanitarios con analytics y interoperabilidad.', website: 'https://veradigm.com', logo: '📋', placeholder: 'veradigm_...', docsUrl: 'https://developer.veradigm.com' },
  { id: 'canvas-lms-api', name: 'Canvas LMS', category: 'Education', description: 'Sistema de gestión de aprendizaje con API REST completa.', website: 'https://www.instructure.com/canvas', logo: '📚', placeholder: 'canvas_...', docsUrl: 'https://canvas.instructure.com/doc/api/' },
  { id: 'schoology-api', name: 'Schoology', category: 'Education', description: 'LMS con herramientas de evaluación y API de integración.', website: 'https://www.schoology.com', logo: '🏫', placeholder: 'schoology_...', docsUrl: 'https://developers.schoology.com' },
  { id: 'edmodo-api', name: 'Edmodo', category: 'Education', description: 'Red social educativa con recursos y gestión de clases.', website: 'https://new.edmodo.com', logo: '📖', placeholder: 'edmodo_...', docsUrl: 'https://developers.edmodo.com' },
  { id: 'd2l-brightspace', name: 'D2L Brightspace', category: 'Education', description: 'Plataforma de aprendizaje con analytics y evaluaciones.', website: 'https://www.d2l.com', logo: '🌟', placeholder: 'd2l_...', docsUrl: 'https://docs.valence.desire2learn.com' },
  { id: 'blackbaud-api', name: 'Blackbaud', category: 'Education', description: 'Software para escuelas privadas con admisión y donaciones.', website: 'https://www.blackbaud.com', logo: '🎓', placeholder: 'blackbaud_...', docsUrl: 'https://developer.blackbaud.com' },
  { id: 'lexmachina-api', name: 'Lex Machina', category: 'Legal', description: 'Analytics legal con datos de litigios y patentes.', website: 'https://lexmachina.com', logo: '⚖️', placeholder: 'lexmachina_...', docsUrl: 'https://developer.lexmachina.com' },
  { id: 'casetext-api', name: 'CaseText (Thomson Reuters)', category: 'Legal', description: 'Investigación legal con IA y búsqueda de jurisprudencia.', website: 'https://casetext.com', logo: '📜', placeholder: 'casetext_...', docsUrl: 'https://casetext.com/api' },
  { id: 'relativity-api', name: 'Relativity', category: 'Legal', description: 'Plataforma de eDiscovery y revisión de documentos legales.', website: 'https://www.relativity.com', logo: '📂', placeholder: 'relativity_...', docsUrl: 'https://platform.relativity.com/RelativityOne/' },
  { id: 'juro-api', name: 'Juro', category: 'Legal', description: 'Gestión de contratos con automatización y firma electrónica.', website: 'https://juro.com', logo: '📝', placeholder: 'juro_...', docsUrl: 'https://docs.juro.com' },
  { id: 'legartis-api', name: 'Legartis', category: 'Legal', description: 'Revisión de contratos con IA para detección de riesgos.', website: 'https://www.legartis.ai', logo: '🤖', placeholder: 'legartis_...', docsUrl: 'https://docs.legartis.ai' },
  { id: 'workable-hr', name: 'Workable', category: 'HR', description: 'ATS y reclutamiento con API para vacantes y candidatos.', website: 'https://www.workable.com', logo: '✅', placeholder: 'workable_...', docsUrl: 'https://workable.readme.io/reference' },
  { id: 'personio-hr', name: 'Personio', category: 'HR', description: 'HRIS europeo con nómina, ausencias y reclutamiento.', website: 'https://www.personio.com', logo: '👤', placeholder: 'personio_...', docsUrl: 'https://developer.personio.de' },
  { id: 'hibob-hr', name: 'HiBob', category: 'HR', description: 'Plataforma people-first con cultura, beneficios y tiempo.', website: 'https://www.hibob.com', logo: '🧑‍💼', placeholder: 'hibob_...', docsUrl: 'https://apidocs.hibob.com' },
  { id: 'culture-amp-api', name: 'Culture Amp', category: 'HR', description: 'Encuestas de engagement y gestión del rendimiento.', website: 'https://www.cultureamp.com', logo: '📈', placeholder: 'cultureamp_...', docsUrl: 'https://developer.cultureamp.com' },
  { id: 'namely-api', name: 'Namely', category: 'HR', description: 'HRIS para medianas empresas con nómina y beneficios.', website: 'https://www.namely.com', logo: '🏢', placeholder: 'namely_...', docsUrl: 'https://developers.namely.com' },
  { id: 'idealista-api', name: 'Idealista', category: 'Real Estate', description: 'Portal inmobiliario español con API de anuncios y datos.', website: 'https://www.idealista.com', logo: '🏠', placeholder: 'idealista_...', docsUrl: 'https://developers.idealista.com' },
  { id: 'inmuebles24-api', name: 'Inmuebles24', category: 'Real Estate', description: 'Portal inmobiliario de LATAM con búsqueda y publicación.', website: 'https://www.inmuebles24.com', logo: '🏗️', placeholder: 'inm24_...', docsUrl: 'https://www.inmuebles24.com/developers' },
  { id: 'fotocasa-api', name: 'Fotocasa', category: 'Real Estate', description: 'Buscador de vivienda en España con datos de mercado.', website: 'https://www.fotocasa.es', logo: '📸', placeholder: 'fotocasa_...', docsUrl: 'https://www.fotocasa.es/developers' },
  { id: 'housecanary-api', name: 'HouseCanary', category: 'Real Estate', description: 'Valuación inmobiliaria con IA y datos de propiedades en EE. UU.', website: 'https://www.housecanary.com', logo: '🐤', placeholder: 'housecanary_...', docsUrl: 'https://api-docs.housecanary.com' },
  { id: 'cbre-api', name: 'CBRE API', category: 'Real Estate', description: 'Datos de inmuebles comerciales y análisis de mercado.', website: 'https://www.cbre.com', logo: '🏢', placeholder: 'cbre_...', docsUrl: 'https://developer.cbre.com' },
  { id: 'rappi-api', name: 'Rappi', category: 'Food & Delivery', description: 'Super-app de delivery para LATAM con restaurantes y tiendas.', website: 'https://www.rappi.com', logo: '🟠', placeholder: 'rappi_...', docsUrl: 'https://developers.rappi.com' },
  { id: 'ifood-api', name: 'iFood', category: 'Food & Delivery', description: 'Delivery de comida líder en Brasil con API para restaurantes.', website: 'https://www.ifood.com.br', logo: '🍔', placeholder: 'ifood_...', docsUrl: 'https://developer.ifood.com.br' },
  { id: 'caviar-api', name: 'DoorDash (Caviar)', category: 'Food & Delivery', description: 'Delivery premium de restaurantes con API de pedidos.', website: 'https://www.doordash.com', logo: '🍽️', placeholder: 'caviar_...', docsUrl: 'https://developer.doordash.com' },
  { id: 'instacart-api', name: 'Instacart', category: 'Food & Delivery', description: 'Delivery de supermercados con API para retailers.', website: 'https://www.instacart.com', logo: '🥕', placeholder: 'instacart_...', docsUrl: 'https://docs.instacart.com' },
  { id: 'getir-api', name: 'Getir', category: 'Food & Delivery', description: 'Delivery ultrarrápido de supermercado y restaurantes.', website: 'https://getir.com', logo: '🟣', placeholder: 'getir_...', docsUrl: 'https://developers.getir.com' },
  { id: 'google-flights-api', name: 'Google Flights', category: 'Travel', description: 'Búsqueda de vuelos con precios y calendario flexible.', website: 'https://www.google.com/travel/flights', logo: '✈️', placeholder: 'gflights_...', docsUrl: 'https://developers.google.com/travel' },
  { id: 'kiwi-api', name: 'Kiwi.com', category: 'Travel', description: 'Metabuscador de vuelos con combinaciones multi-transportista.', website: 'https://www.kiwi.com', logo: '🥝', placeholder: 'kiwi_...', docsUrl: 'https://docs.kiwi.com' },
  { id: 'hotelbeds-api', name: 'Hotelbeds', category: 'Travel', description: 'API B2B de distribución hotelera con +180.000 propiedades.', website: 'https://developer.hotelbeds.com', logo: '🏨', placeholder: 'hotelbeds_...', docsUrl: 'https://developer.hotelbeds.com/documentation' },
  { id: 'travelport-api', name: 'Travelport', category: 'Travel', description: 'GDS para vuelos, hoteles y coches con API NDC.', website: 'https://www.travelport.com', logo: '🌏', placeholder: 'travelport_...', docsUrl: 'https://developer.travelport.com' },
  { id: 'airbnb-api', name: 'Airbnb', category: 'Travel', description: 'Alojamientos y experiencias con integración de calendario.', website: 'https://www.airbnb.com', logo: '🏡', placeholder: 'airbnb_...', docsUrl: 'https://www.airbnb.com/partner' },
  { id: 'despegar-api', name: 'Despegar', category: 'Travel', description: 'OTA líder en LATAM con vuelos, hoteles y paquetes.', website: 'https://www.despegar.com', logo: '🛫', placeholder: 'despegar_...', docsUrl: 'https://developers.despegar.com' },
  { id: 'unity-api', name: 'Unity Services', category: 'Gaming', description: 'Backend multijugador, analytics y monetización para juegos.', website: 'https://unity.com', logo: '🎮', placeholder: 'unity_...', docsUrl: 'https://docs.unity.com/ugs/' },
  { id: 'unreal-online', name: 'Unreal Engine Online', category: 'Gaming', description: 'Servicios online de Epic para multijugador y matchmaking.', website: 'https://dev.epicgames.com/en-US/services', logo: '🎯', placeholder: 'unreal_...', docsUrl: 'https://dev.epicgames.com/docs/services' },
  { id: 'xsolla-api', name: 'Xsolla', category: 'Gaming', description: 'Pagos, launcher y comercio para estudios de videojuegos.', website: 'https://xsolla.com', logo: '💰', placeholder: 'xsolla_...', docsUrl: 'https://developers.xsolla.com' },
  { id: 'gamesparks-api', name: 'GameSparks', category: 'Gaming', description: 'BaaS para lógica multijugador, economía y leaderboards.', website: 'https://gamesparks.com', logo: '✨', placeholder: 'gamesparks_...', docsUrl: 'https://docs.gamesparks.com' },
  { id: 'accelbyte-api', name: 'AccelByte', category: 'Gaming', description: 'Plataforma de servicios en vivo para juegos AAA y F2P.', website: 'https://accelbyte.io', logo: '🚀', placeholder: 'accelbyte_...', docsUrl: 'https://docs.accelbyte.io' },
  { id: 'datos-gob-es', name: 'datos.gob.es', category: 'Government', description: 'Portal de datos abiertos del gobierno de España.', website: 'https://datos.gob.es', logo: '🇪🇸', placeholder: 'datosgob_...', docsUrl: 'https://datos.gob.es/es/apidata' },
  { id: 'data-gov-uk', name: 'data.gov.uk', category: 'Government', description: 'Datos abiertos del gobierno del Reino Unido.', website: 'https://www.data.gov.uk', logo: '🇬🇧', placeholder: 'datagovuk_...', docsUrl: 'https://www.data.gov.uk/using-data-gov-uk-api' },
  { id: 'datos-gob-ar', name: 'datos.gob.ar', category: 'Government', description: 'Datos abiertos del gobierno de Argentina.', website: 'https://datos.gob.ar', logo: '🇦🇷', placeholder: 'datosgobar_...', docsUrl: 'https://datosgobar.github.io/series-tiempo-ar-api/' },
  { id: 'datos-gob-mx', name: 'datos.gob.mx', category: 'Government', description: 'Portal de datos abiertos del gobierno de México.', website: 'https://datos.gob.mx', logo: '🇲🇽', placeholder: 'datosgobmx_...', docsUrl: 'https://datos.gob.mx/busca/dataset' },
  { id: 'data-gouv-fr', name: 'data.gouv.fr', category: 'Government', description: 'Portal de datos abiertos del gobierno de Francia.', website: 'https://www.data.gouv.fr', logo: '🇫🇷', placeholder: 'datagouv_...', docsUrl: 'https://www.data.gouv.fr/api/' },
  { id: 'windy-api', name: 'Windy', category: 'Weather', description: 'Datos meteorológicos con mapas de viento y oleaje en tiempo real.', website: 'https://www.windy.com', logo: '🌬️', placeholder: 'windy_...', docsUrl: 'https://api.windy.com' },
  { id: 'climacell-api', name: 'Tomorrow.io (ClimaCell)', category: 'Weather', description: 'Inteligencia meteorológica hyperlocal con IA para decisiones.', website: 'https://www.tomorrow.io', logo: '⛅', placeholder: 'tomorrow_...', docsUrl: 'https://docs.tomorrow.io' },
  { id: 'worldweather-api', name: 'World Weather Online', category: 'Weather', description: 'API meteorológica global con históricos y pronóstico 14 días.', website: 'https://www.worldweatheronline.com', logo: '🌤️', placeholder: 'worldweather_...', docsUrl: 'https://www.worldweatheronline.com/developer/' },
  { id: 'stormglass-api', name: 'Stormglass', category: 'Weather', description: 'Datos oceánicos y meteorológicos para deportes y navegación.', website: 'https://stormglass.io', logo: '🌊', placeholder: 'stormglass_...', docsUrl: 'https://docs.stormglass.io' },
  { id: 'aemet-api', name: 'AEMET OpenData', category: 'Weather', description: 'Datos meteorológicos oficiales de España de la AEMET.', website: 'https://opendata.aemet.es', logo: '🇪🇸', placeholder: 'aemet_...', docsUrl: 'https://opendata.aemet.es/centrodedescargas/inicio' },
  { id: 'twilio-sms', name: 'Twilio SMS', category: 'SMS', description: 'Envío y recepción de SMS con API programable global.', website: 'https://www.twilio.com/sms', logo: '📱', placeholder: 'twilio_sms_...', docsUrl: 'https://www.twilio.com/docs/sms' },
  { id: 'nexmo-sms', name: 'Vonage SMS', category: 'SMS', description: 'API de SMS global con DLR y números virtuales.', website: 'https://www.vonage.com', logo: '📨', placeholder: 'vonage_sms_...', docsUrl: 'https://developer.vonage.com/en/messaging/sms/overview' },
  { id: 'esendex-api', name: 'Esendex', category: 'SMS', description: 'SMS empresarial con API para envíos masivos en Europa.', website: 'https://www.esendex.com', logo: '💬', placeholder: 'esendex_...', docsUrl: 'https://developers.esendex.com' },
  { id: 'labsmobile-api', name: 'LabsMobile', category: 'SMS', description: 'SMS profesional para empresas españolas con API REST y SMTP.', website: 'https://www.labsmobile.com', logo: '🇪🇸', placeholder: 'labsmobile_...', docsUrl: 'https://www.labsmobile.com/api-sms' },
  { id: 'textmagic-api', name: 'TextMagic', category: 'SMS', description: 'SMS masivo y notificaciones con API y gateway propio.', website: 'https://www.textmagic.com', logo: '✨', placeholder: 'textmagic_...', docsUrl: 'https://docs.textmagic.com' },
  { id: 'cloudflare-stream', name: 'Cloudflare Stream', category: 'Video', description: 'Streaming de video serverless con encoding y delivery global.', website: 'https://www.cloudflare.com/products/cloudflare-stream/', logo: '🟠', placeholder: 'cf_stream_...', docsUrl: 'https://developers.cloudflare.com/stream/' },
  { id: 'bunny-stream', name: 'Bunny Stream', category: 'Video', description: 'Video hosting económico con transcoding y player personalizable.', website: 'https://bunny.net/stream', logo: '🐰', placeholder: 'bunny_video_...', docsUrl: 'https://docs.bunny.net/reference/bunnynet-stream-api' },
  { id: 'wistia-api', name: 'Wistia', category: 'Video', description: 'Video hosting para marketing con analytics y CTAs embebidos.', website: 'https://wistia.com', logo: '🎬', placeholder: 'wistia_...', docsUrl: 'https://wistia.com/support/developers' },
  { id: 'brightcove-api', name: 'Brightcove', category: 'Video', description: 'Plataforma de video empresarial con OTT y monetización.', website: 'https://www.brightcove.com', logo: '🎥', placeholder: 'brightcove_...', docsUrl: 'https://apis.support.brightcove.com' },
  { id: 'jwplayer-api', name: 'JW Player', category: 'Video', description: 'Reproductor de video y plataforma de streaming con analytics.', website: 'https://www.jwplayer.com', logo: '▶️', placeholder: 'jwplayer_...', docsUrl: 'https://developer.jwplayer.com' },
  { id: 'route53-api', name: 'Amazon Route 53', category: 'DNS & Domain', description: 'DNS y health checks en la nube de AWS.', website: 'https://aws.amazon.com/route53/', logo: '🛣️', placeholder: 'route53_...', docsUrl: 'https://docs.aws.amazon.com/route53/' },
  { id: 'ns1-api', name: 'NS1 (IBM)', category: 'DNS & Domain', description: 'DNS inteligente con enrutamiento basado en datos.', website: 'https://ns1.com', logo: '1️⃣', placeholder: 'ns1_...', docsUrl: 'https://ns1.com/api' },
  { id: 'dnsmadeeasy-api', name: 'DNS Made Easy', category: 'DNS & Domain', description: 'DNS anycast con failover y API de gestión.', website: 'https://dnsmadeeasy.com', logo: '⚡', placeholder: 'dnsme_...', docsUrl: 'https://api-docs.dnsmadeeasy.com' },
  { id: 'constellix-api', name: 'Constellix', category: 'DNS & Domain', description: 'DNS con geoproximidad y monitoreo de salud avanzado.', website: 'https://constellix.com', logo: '✨', placeholder: 'constellix_...', docsUrl: 'https://api-docs.constellix.com' },
  { id: 'desec-api', name: 'deSEC', category: 'DNS & Domain', description: 'DNS hosting seguro y gratuito con DNSSEC automático.', website: 'https://desec.io', logo: '🔒', placeholder: 'desec_...', docsUrl: 'https://desec.readthedocs.io' },
  { id: 'tesla-fleet-api', name: 'Tesla Fleet API', category: 'Automotive', description: 'Control y telemetría de vehículos Tesla para flotas.', website: 'https://developer.tesla.com', logo: '🚗', placeholder: 'tesla_...', docsUrl: 'https://developer.tesla.com/docs/fleet-api' },
  { id: 'smartcar-api', name: 'Smartcar', category: 'Automotive', description: 'API universal para conectar con vehículos de +30 marcas.', website: 'https://smartcar.com', logo: '🔌', placeholder: 'smartcar_...', docsUrl: 'https://smartcar.com/docs' },
  { id: 'here-fleet-api', name: 'HERE Fleet', category: 'Automotive', description: 'Gestión de flotas con routing, tracking y geofencing.', website: 'https://www.here.com', logo: '📍', placeholder: 'here_fleet_...', docsUrl: 'https://developer.here.com/documentation/fleet-telematics' },
  { id: 'obd2-api', name: 'Automatic (OBD)', category: 'Automotive', description: 'Datos de diagnóstico vehicular OBD-II vía API cloud.', website: 'https://automatic.com', logo: '🔧', placeholder: 'obd_...', docsUrl: 'https://developer.automatic.com' },
  { id: 'carmd-api', name: 'CarMD', category: 'Automotive', description: 'Diagnóstico y datos de mantenimiento de vehículos.', website: 'https://www.carmd.com', logo: '🔩', placeholder: 'carmd_...', docsUrl: 'https://api.carmd.com/member/docs' },
  { id: 'nhtsa-api', name: 'NHTSA Vehicle API', category: 'Automotive', description: 'Datos de seguridad vehicular y decodificación de VIN.', website: 'https://www.nhtsa.gov', logo: '🛡️', placeholder: 'nhtsa_...', docsUrl: 'https://vpic.nhtsa.dot.gov/api/' },
  { id: 'turo-api', name: 'Turo', category: 'Automotive', description: 'Marketplace de alquiler de coches entre particulares.', website: 'https://turo.com', logo: '🚙', placeholder: 'turo_...', docsUrl: 'https://developer.turo.com' },
  { id: 'enphase-api', name: 'Enphase Energy', category: 'Energy', description: 'Monitorización de producción solar con microinversores.', website: 'https://developer.enphase.com', logo: '☀️', placeholder: 'enphase_...', docsUrl: 'https://developer.enphase.com/docs' },
  { id: 'solaredge-api', name: 'SolarEdge', category: 'Energy', description: 'Monitoreo de sistemas fotovoltaicos y baterías.', website: 'https://www.solaredge.com', logo: '🔆', placeholder: 'solaredge_...', docsUrl: 'https://www.solaredge.com/sites/default/files/se_monitoring_api.pdf' },
  { id: 'octopus-energy-api', name: 'Octopus Energy', category: 'Energy', description: 'Datos de consumo energético y tarifas inteligentes UK.', website: 'https://octopus.energy', logo: '🐙', placeholder: 'octopus_energy_...', docsUrl: 'https://developer.octopus.energy/docs/api/' },
  { id: 'gridx-api', name: 'gridX', category: 'Energy', description: 'Plataforma IoT para gestión de energía descentralizada.', website: 'https://gridx.de', logo: '⚡', placeholder: 'gridx_...', docsUrl: 'https://developer.gridx.de' },
  { id: 'tibber-api', name: 'Tibber', category: 'Energy', description: 'Electricidad inteligente con API GraphQL y precios por hora.', website: 'https://tibber.com', logo: '💡', placeholder: 'tibber_...', docsUrl: 'https://developer.tibber.com' },
  { id: 'utility-api', name: 'UtilityAPI', category: 'Energy', description: 'Acceso a datos de utilidades y facturas energéticas.', website: 'https://utilityapi.com', logo: '🔋', placeholder: 'utility_api_...', docsUrl: 'https://utilityapi.com/docs' },
  { id: 'agworld-api', name: 'Agworld', category: 'Agriculture', description: 'Gestión de cultivos con planificación y registro de actividades.', website: 'https://www.agworld.com', logo: '🌾', placeholder: 'agworld_...', docsUrl: 'https://developer.agworld.com' },
  { id: 'arable-api', name: 'Arable', category: 'Agriculture', description: 'Sensores agrícolas con datos de clima, suelo y cultivos.', website: 'https://www.arable.com', logo: '🌱', placeholder: 'arable_...', docsUrl: 'https://developer.arable.com' },
  { id: 'john-deere-api', name: 'John Deere', category: 'Agriculture', description: 'Datos de maquinaria agrícola y operaciones de campo.', website: 'https://developer.deere.com', logo: '🚜', placeholder: 'deere_...', docsUrl: 'https://developer.deere.com/#!documentation' },
  { id: 'climate-fieldview', name: 'Climate FieldView', category: 'Agriculture', description: 'Plataforma digital de agricultura con mapas de rendimiento.', website: 'https://climate.com', logo: '🌿', placeholder: 'fieldview_...', docsUrl: 'https://developer.climate.com' },
  { id: 'farmbot-api', name: 'FarmBot', category: 'Agriculture', description: 'Agricultura automatizada con robot open-source y API web.', website: 'https://farm.bot', logo: '🤖', placeholder: 'farmbot_...', docsUrl: 'https://developer.farm.bot' },
  { id: 'cropio-api', name: 'Cropio', category: 'Agriculture', description: 'Monitoreo satelital de campos con NDVI y alertas.', website: 'https://about.cropio.com', logo: '🛰️', placeholder: 'cropio_...', docsUrl: 'https://about.cropio.com/api-docs' },
  { id: 'lemonade-api', name: 'Lemonade', category: 'Insurance', description: 'Seguros digitales con IA para hogar, auto y mascotas.', website: 'https://www.lemonade.com', logo: '🍋', placeholder: 'lemonade_...', docsUrl: 'https://developers.lemonade.com' },
  { id: 'root-insurance-api', name: 'Root Insurance', category: 'Insurance', description: 'Seguro de auto basado en conducción con telemática.', website: 'https://www.joinroot.com', logo: '🌳', placeholder: 'root_ins_...', docsUrl: 'https://developer.joinroot.com' },
  { id: 'socotra-api', name: 'Socotra', category: 'Insurance', description: 'Core platform de seguros cloud-native con API-first.', website: 'https://www.socotra.com', logo: '🏔️', placeholder: 'socotra_...', docsUrl: 'https://docs.socotra.com' },
  { id: 'cuvva-api', name: 'Cuvva', category: 'Insurance', description: 'Seguros de auto por horas y viaje desde app móvil.', website: 'https://www.cuvva.com', logo: '🚗', placeholder: 'cuvva_...', docsUrl: 'https://developer.cuvva.com' },
  { id: 'zelros-api', name: 'Zelros', category: 'Insurance', description: 'IA para recomendación de productos de seguros personalizados.', website: 'https://www.zelros.com', logo: '🤖', placeholder: 'zelros_...', docsUrl: 'https://docs.zelros.com' },
  { id: 'wefox-api', name: 'Wefox', category: 'Insurance', description: 'Insurtech europea con seguros digitales y gestión de siniestros.', website: 'https://www.wefox.com', logo: '🦊', placeholder: 'wefox_...', docsUrl: 'https://developer.wefox.com' },
  { id: 'procore-api', name: 'Procore', category: 'Construction', description: 'Gestión de proyectos de construcción con documentos y presupuestos.', website: 'https://www.procore.com', logo: '🏗️', placeholder: 'procore_...', docsUrl: 'https://developers.procore.com' },
  { id: 'plangrid-api', name: 'PlanGrid (Autodesk)', category: 'Construction', description: 'Planos digitales y gestión de obras en campo.', website: 'https://www.autodesk.com/products/plangrid', logo: '📐', placeholder: 'plangrid_...', docsUrl: 'https://developer.plangrid.com' },
  { id: 'buildertrend-api', name: 'BuilderTrend', category: 'Construction', description: 'Software de gestión para constructores con scheduling y pagos.', website: 'https://www.buildertrend.com', logo: '🔨', placeholder: 'buildertrend_...', docsUrl: 'https://developer.buildertrend.com' },
  { id: 'bim360-api', name: 'Autodesk BIM 360', category: 'Construction', description: 'Plataforma BIM para diseño, construcción y operación.', website: 'https://www.autodesk.com/bim-360/', logo: '🏢', placeholder: 'bim360_...', docsUrl: 'https://forge.autodesk.com/en/docs/bim360/v1/overview/' },
  { id: 'fieldwire-api', name: 'Fieldwire', category: 'Construction', description: 'Gestión de tareas y planos para equipos en obra.', website: 'https://www.fieldwire.com', logo: '📋', placeholder: 'fieldwire_...', docsUrl: 'https://developer.fieldwire.com' },
  { id: 'spotify-podcasters', name: 'Spotify for Podcasters', category: 'Podcast & Audio', description: 'Distribución y analytics de podcasts en Spotify.', website: 'https://podcasters.spotify.com', logo: '🎙️', placeholder: 'spotify_pod_...', docsUrl: 'https://developer.spotify.com' },
  { id: 'buzzsprout-api', name: 'Buzzsprout', category: 'Podcast & Audio', description: 'Hosting de podcasts con distribución y estadísticas.', website: 'https://www.buzzsprout.com', logo: '🐝', placeholder: 'buzzsprout_...', docsUrl: 'https://www.buzzsprout.com/api' },
  { id: 'transistor-api', name: 'Transistor.fm', category: 'Podcast & Audio', description: 'Hosting de podcasts para marcas con analytics privados.', website: 'https://transistor.fm', logo: '📻', placeholder: 'transistor_...', docsUrl: 'https://developers.transistor.fm' },
  { id: 'podbean-api', name: 'Podbean', category: 'Podcast & Audio', description: 'Hosting y monetización de podcasts con live streaming.', website: 'https://www.podbean.com', logo: '🫘', placeholder: 'podbean_...', docsUrl: 'https://developers.podbean.com' },
  { id: 'listen-notes-api', name: 'Listen Notes', category: 'Podcast & Audio', description: 'Motor de búsqueda de podcasts con API de episodios.', website: 'https://www.listennotes.com', logo: '🔍', placeholder: 'listennotes_...', docsUrl: 'https://www.listennotes.com/api/docs/' },
  { id: 'audiomack-api', name: 'Audiomack', category: 'Podcast & Audio', description: 'Streaming gratuito de música y podcasts para artistas.', website: 'https://audiomack.com', logo: '🎵', placeholder: 'audiomack_...', docsUrl: 'https://audiomack.com/data-api/docs' },
  { id: 'anchor-api', name: 'Anchor (Spotify)', category: 'Podcast & Audio', description: 'Creación y distribución gratuita de podcasts.', website: 'https://anchor.fm', logo: '⚓', placeholder: 'anchor_...', docsUrl: 'https://anchor.fm/api' },
  { id: 'niantic-lightship', name: 'Niantic Lightship', category: 'AR/VR', description: 'SDK de realidad aumentada con mapeo del mundo real.', website: 'https://lightship.dev', logo: '🌍', placeholder: 'lightship_...', docsUrl: 'https://lightship.dev/docs/' },
  { id: 'meta-quest-api', name: 'Meta Quest', category: 'AR/VR', description: 'Desarrollo de apps VR para Meta Quest con SDK.', website: 'https://developer.oculus.com', logo: '🥽', placeholder: 'meta_quest_...', docsUrl: 'https://developer.oculus.com/documentation/' },
  { id: 'apple-arkit', name: 'Apple ARKit', category: 'AR/VR', description: 'Framework de realidad aumentada para iOS y iPadOS.', website: 'https://developer.apple.com/arkit/', logo: '📱', placeholder: 'arkit_...', docsUrl: 'https://developer.apple.com/documentation/arkit' },
  { id: 'google-arcore', name: 'Google ARCore', category: 'AR/VR', description: 'Realidad aumentada para Android con tracking y depth.', website: 'https://developers.google.com/ar', logo: '🤖', placeholder: 'arcore_...', docsUrl: 'https://developers.google.com/ar/develop' },
  { id: '8thwall-api', name: '8th Wall', category: 'AR/VR', description: 'AR web-based sin app para experiencias interactivas.', website: 'https://www.8thwall.com', logo: '🧱', placeholder: '8thwall_...', docsUrl: 'https://www.8thwall.com/docs' },
  { id: 'vuforia-api', name: 'Vuforia (PTC)', category: 'AR/VR', description: 'SDK de AR industrial para mantenimiento y formación.', website: 'https://developer.vuforia.com', logo: '🔬', placeholder: 'vuforia_...', docsUrl: 'https://developer.vuforia.com/library/' },
  { id: 'newsapi-org', name: 'NewsAPI', category: 'News & Data', description: 'API de noticias globales con más de 80.000 fuentes.', website: 'https://newsapi.org', logo: '📰', placeholder: 'newsapi_...', docsUrl: 'https://newsapi.org/docs' },
  { id: 'gdelt-api', name: 'GDELT Project', category: 'News & Data', description: 'Base de datos global de eventos, noticias y sentimiento.', website: 'https://www.gdeltproject.org', logo: '🌐', placeholder: 'gdelt_...', docsUrl: 'https://www.gdeltproject.org/data.html' },
  { id: 'mediastack-api', name: 'Mediastack', category: 'News & Data', description: 'API de noticias en tiempo real de 7.500+ fuentes globales.', website: 'https://mediastack.com', logo: '📡', placeholder: 'mediastack_...', docsUrl: 'https://mediastack.com/documentation' },
  { id: 'gnews-api', name: 'GNews', category: 'News & Data', description: 'API de Google News con búsqueda y filtrado por idioma.', website: 'https://gnews.io', logo: '📢', placeholder: 'gnews_...', docsUrl: 'https://gnews.io/docs/v4' },
  { id: 'aylien-news', name: 'AYLIEN News', category: 'News & Data', description: 'NLP y analytics sobre noticias con sentimiento y entidades.', website: 'https://aylien.com/news-api', logo: '🧠', placeholder: 'aylien_...', docsUrl: 'https://docs.aylien.com/newsapi/' },
  { id: 'currents-api', name: 'Currents API', category: 'News & Data', description: 'Noticias actuales con categorización y búsqueda por keywords.', website: 'https://currentsapi.services', logo: '⚡', placeholder: 'currents_...', docsUrl: 'https://currentsapi.services/en/docs/' },
  { id: 'strava-v3', name: 'Strava', category: 'Sports & Fitness', description: 'Red social deportiva con tracking de actividades y rutas.', website: 'https://www.strava.com', logo: '🏃', placeholder: 'strava_...', docsUrl: 'https://developers.strava.com' },
  { id: 'fitbit-api', name: 'Fitbit (Google)', category: 'Sports & Fitness', description: 'Datos de salud y fitness con wearables y tracking.', website: 'https://dev.fitbit.com', logo: '⌚', placeholder: 'fitbit_...', docsUrl: 'https://dev.fitbit.com/build/reference/' },
  { id: 'garmin-connect', name: 'Garmin Connect', category: 'Sports & Fitness', description: 'Datos de dispositivos Garmin con actividades y métricas.', website: 'https://developer.garmin.com', logo: '📊', placeholder: 'garmin_...', docsUrl: 'https://developer.garmin.com/connect-iq/' },
  { id: 'sportradar-api', name: 'Sportradar', category: 'Sports & Fitness', description: 'Datos deportivos en tiempo real para fútbol, NBA, NFL y más.', website: 'https://sportradar.com', logo: '⚽', placeholder: 'sportradar_...', docsUrl: 'https://developer.sportradar.com' },
  { id: 'api-football', name: 'API-Football', category: 'Sports & Fitness', description: 'Datos de fútbol con ligas, partidos y estadísticas en vivo.', website: 'https://www.api-football.com', logo: '⚽', placeholder: 'apifootball_...', docsUrl: 'https://www.api-football.com/documentation-v3' },
  { id: 'opta-stats', name: 'Opta (Stats Perform)', category: 'Sports & Fitness', description: 'Estadísticas deportivas detalladas para análisis y medios.', website: 'https://www.statsperform.com', logo: '📈', placeholder: 'opta_...', docsUrl: 'https://developer.statsperform.com' },
  { id: 'whoop-api', name: 'WHOOP', category: 'Sports & Fitness', description: 'Wearable de rendimiento con recovery, strain y sueño.', website: 'https://www.whoop.com', logo: '💪', placeholder: 'whoop_...', docsUrl: 'https://developer.whoop.com' },
  { id: 'polar-api', name: 'Polar', category: 'Sports & Fitness', description: 'Datos de entrenamiento y frecuencia cardíaca de relojes Polar.', website: 'https://www.polar.com', logo: '❄️', placeholder: 'polar_...', docsUrl: 'https://www.polar.com/accesslink-api/' },
  { id: 'spotify-web-api', name: 'Spotify Web API', category: 'Music', description: 'Catálogo musical, playlists y player con OAuth2.', website: 'https://developer.spotify.com', logo: '🎵', placeholder: 'spotify_...', docsUrl: 'https://developer.spotify.com/documentation/web-api' },
  { id: 'apple-music-api', name: 'Apple Music', category: 'Music', description: 'Catálogo de Apple Music con playlists y recomendaciones.', website: 'https://developer.apple.com/musickit/', logo: '🎶', placeholder: 'apple_music_...', docsUrl: 'https://developer.apple.com/documentation/applemusicapi' },
  { id: 'musixmatch-api', name: 'Musixmatch', category: 'Music', description: 'Base de datos de letras de canciones con sincronización.', website: 'https://developer.musixmatch.com', logo: '🎤', placeholder: 'musixmatch_...', docsUrl: 'https://developer.musixmatch.com/documentation' },
  { id: 'genius-api', name: 'Genius', category: 'Music', description: 'Letras y anotaciones de canciones con API de búsqueda.', website: 'https://genius.com', logo: '💡', placeholder: 'genius_...', docsUrl: 'https://docs.genius.com' },
  { id: 'lastfm-api', name: 'Last.fm', category: 'Music', description: 'Scrobbling y datos de escucha con artistas y tags.', website: 'https://www.last.fm', logo: '📻', placeholder: 'lastfm_...', docsUrl: 'https://www.last.fm/api' },
  { id: 'discogs-api', name: 'Discogs', category: 'Music', description: 'Base de datos de música con discografías y marketplace.', website: 'https://www.discogs.com', logo: '💿', placeholder: 'discogs_...', docsUrl: 'https://www.discogs.com/developers' },
  { id: 'clearbit-api', name: 'Clearbit', category: 'Data Enrichment', description: 'Enriquecimiento de datos empresariales con emails y dominios.', website: 'https://clearbit.com', logo: '📊', placeholder: 'clearbit_...', docsUrl: 'https://clearbit.com/docs' },
  { id: 'fullcontact-api', name: 'FullContact', category: 'Data Enrichment', description: 'Resolución de identidad y enriquecimiento de contactos.', website: 'https://www.fullcontact.com', logo: '👤', placeholder: 'fullcontact_...', docsUrl: 'https://docs.fullcontact.com' },
  { id: 'pipl-api', name: 'Pipl', category: 'Data Enrichment', description: 'Búsqueda de personas con verificación de identidad.', website: 'https://pipl.com', logo: '🔍', placeholder: 'pipl_...', docsUrl: 'https://docs.pipl.com' },
  { id: 'hunter-io-api', name: 'Hunter.io', category: 'Data Enrichment', description: 'Búsqueda y verificación de emails profesionales.', website: 'https://hunter.io', logo: '🎯', placeholder: 'hunter_...', docsUrl: 'https://hunter.io/api-documentation' },
  { id: 'apollo-io-api', name: 'Apollo.io', category: 'Data Enrichment', description: 'Prospección B2B con base de datos de contactos y empresas.', website: 'https://www.apollo.io', logo: '🚀', placeholder: 'apollo_...', docsUrl: 'https://apolloio.github.io/apollo-api-docs/' },
  { id: 'zoominfo-api', name: 'ZoomInfo', category: 'Data Enrichment', description: 'Inteligencia B2B con datos de empresas y contactos.', website: 'https://www.zoominfo.com', logo: '🔬', placeholder: 'zoominfo_...', docsUrl: 'https://developer.zoominfo.com' },
  { id: 'snov-io-api', name: 'Snov.io', category: 'Data Enrichment', description: 'Herramienta de outreach con buscador de emails y drip campaigns.', website: 'https://snov.io', logo: '❄️', placeholder: 'snov_...', docsUrl: 'https://snov.io/knowledgebase/category/api/' },
  { id: 'pdfshift-api', name: 'PDFShift', category: 'PDF & Documents', description: 'Conversión de HTML a PDF con API REST de alta fidelidad.', website: 'https://pdfshift.io', logo: '📄', placeholder: 'pdfshift_...', docsUrl: 'https://docs.pdfshift.io' },
  { id: 'gotenberg-api', name: 'Gotenberg', category: 'PDF & Documents', description: 'Generación de PDF desde HTML, Markdown y Office via Docker.', website: 'https://gotenberg.dev', logo: '📑', placeholder: 'gotenberg_...', docsUrl: 'https://gotenberg.dev/docs/about' },
  { id: 'docspring-api', name: 'DocSpring', category: 'PDF & Documents', description: 'Generación de PDFs desde plantillas con API REST.', website: 'https://docspring.com', logo: '📋', placeholder: 'docspring_...', docsUrl: 'https://docspring.com/docs' },
  { id: 'ilovepdf-api', name: 'iLovePDF', category: 'PDF & Documents', description: 'Herramientas de PDF (merge, split, compress) vía API.', website: 'https://developer.ilovepdf.com', logo: '❤️', placeholder: 'ilovepdf_...', docsUrl: 'https://developer.ilovepdf.com/docs/api-reference' },
  { id: 'pdf-co-api', name: 'PDF.co', category: 'PDF & Documents', description: 'API para crear, editar y extraer datos de documentos PDF.', website: 'https://pdf.co', logo: '📄', placeholder: 'pdfco_...', docsUrl: 'https://developer.pdf.co' },
  { id: 'apryse-api', name: 'Apryse (PDFTron)', category: 'PDF & Documents', description: 'SDK de documentos con visor, editor y firma de PDFs.', website: 'https://apryse.com', logo: '📝', placeholder: 'apryse_...', docsUrl: 'https://docs.apryse.com' },
  { id: 'vanta-api', name: 'Vanta', category: 'Compliance', description: 'Automatización de compliance SOC 2, ISO 27001 y HIPAA.', website: 'https://www.vanta.com', logo: '🛡️', placeholder: 'vanta_...', docsUrl: 'https://developer.vanta.com' },
  { id: 'drata-api', name: 'Drata', category: 'Compliance', description: 'Automatización de auditoría y compliance continuo.', website: 'https://drata.com', logo: '✅', placeholder: 'drata_...', docsUrl: 'https://drata.com/product/api' },
  { id: 'onetrust-api', name: 'OneTrust', category: 'Compliance', description: 'Privacidad, seguridad y gobernanza de datos con GDPR y CCPA.', website: 'https://www.onetrust.com', logo: '🔒', placeholder: 'onetrust_...', docsUrl: 'https://developer.onetrust.com' },
  { id: 'cookiebot-api', name: 'Cookiebot', category: 'Compliance', description: 'Gestión de consentimiento de cookies conforme a GDPR.', website: 'https://www.cookiebot.com', logo: '🍪', placeholder: 'cookiebot_...', docsUrl: 'https://www.cookiebot.com/en/developer/' },
  { id: 'transcend-api', name: 'Transcend', category: 'Compliance', description: 'Privacidad de datos con DSR automation y consent.', website: 'https://transcend.io', logo: '🔐', placeholder: 'transcend_...', docsUrl: 'https://docs.transcend.io' },
  { id: 'securiti-api', name: 'Securiti', category: 'Compliance', description: 'Gobernanza y privacidad de datos con IA para empresas.', website: 'https://securiti.ai', logo: '🏛️', placeholder: 'securiti_...', docsUrl: 'https://docs.securiti.ai' },
  { id: 'acuity-api', name: 'Acuity Scheduling', category: 'Scheduling', description: 'Programación de citas online con pagos y formularios.', website: 'https://acuityscheduling.com', logo: '📅', placeholder: 'acuity_...', docsUrl: 'https://developers.acuityscheduling.com' },
  { id: 'zcal-api', name: 'Zcal', category: 'Scheduling', description: 'Programación de reuniones minimalista y gratuita.', website: 'https://zcal.co', logo: '📆', placeholder: 'zcal_...', docsUrl: 'https://zcal.co/docs' },
  { id: 'youcanbook-api', name: 'YouCanBook.me', category: 'Scheduling', description: 'Reservas online conectadas a Google y Outlook Calendar.', website: 'https://youcanbook.me', logo: '📖', placeholder: 'ycbm_...', docsUrl: 'https://youcanbook.me/api/' },
  { id: 'savvycal-api', name: 'SavvyCal', category: 'Scheduling', description: 'Scheduling colaborativo con overlay de calendarios.', website: 'https://savvycal.com', logo: '🗓️', placeholder: 'savvycal_...', docsUrl: 'https://savvycal.com/docs/api' },
  { id: 'doodle-api', name: 'Doodle', category: 'Scheduling', description: 'Encuestas de disponibilidad para coordinar reuniones de grupo.', website: 'https://doodle.com', logo: '✏️', placeholder: 'doodle_...', docsUrl: 'https://developer.doodle.com' },
  { id: 'onesignal-api', name: 'OneSignal', category: 'Notifications', description: 'Push notifications para web y móvil con segmentación.', website: 'https://onesignal.com', logo: '🔔', placeholder: 'onesignal_...', docsUrl: 'https://documentation.onesignal.com' },
  { id: 'firebase-fcm', name: 'Firebase Cloud Messaging', category: 'Notifications', description: 'Push notifications cross-platform de Google.', website: 'https://firebase.google.com/docs/cloud-messaging', logo: '🔥', placeholder: 'fcm_...', docsUrl: 'https://firebase.google.com/docs/cloud-messaging/http-server-ref' },
  { id: 'pushover-api', name: 'Pushover', category: 'Notifications', description: 'Notificaciones push simples para móvil y escritorio.', website: 'https://pushover.net', logo: '📢', placeholder: 'pushover_...', docsUrl: 'https://pushover.net/api' },
  { id: 'ntfy-api', name: 'ntfy', category: 'Notifications', description: 'Servicio de notificaciones push open-source con HTTP PUT.', website: 'https://ntfy.sh', logo: '📨', placeholder: 'ntfy_...', docsUrl: 'https://docs.ntfy.sh' },
  { id: 'courier-api', name: 'Courier', category: 'Notifications', description: 'Orquestación de notificaciones multi-canal con plantillas.', website: 'https://www.courier.com', logo: '📮', placeholder: 'courier_...', docsUrl: 'https://www.courier.com/docs/' },
  { id: 'engagespot-api', name: 'Engagespot', category: 'Notifications', description: 'Centro de notificaciones in-app con bell icon y API.', website: 'https://www.engagespot.co', logo: '🔕', placeholder: 'engagespot_...', docsUrl: 'https://docs.engagespot.co' },
  { id: 'docusign-api', name: 'DocuSign', category: 'eSignature', description: 'Firma electrónica líder con API para contratos y acuerdos.', website: 'https://www.docusign.com', logo: '✍️', placeholder: 'docusign_...', docsUrl: 'https://developers.docusign.com' },
  { id: 'hellosign-api', name: 'Dropbox Sign', category: 'eSignature', description: 'Firma electrónica simple con API y plantillas embebidas.', website: 'https://sign.dropbox.com', logo: '📝', placeholder: 'hellosign_...', docsUrl: 'https://developers.hellosign.com' },
  { id: 'signrequest-api', name: 'SignRequest', category: 'eSignature', description: 'Firma digital para PyMEs con API y integraciones.', website: 'https://signrequest.com', logo: '🖊️', placeholder: 'signrequest_...', docsUrl: 'https://signrequest.com/api/v1/docs/' },
  { id: 'yousign-api', name: 'Yousign', category: 'eSignature', description: 'Firma electrónica francesa conforme a eIDAS con API.', website: 'https://yousign.com', logo: '🇫🇷', placeholder: 'yousign_...', docsUrl: 'https://developers.yousign.com' },
  { id: 'signaturit-api', name: 'Signaturit', category: 'eSignature', description: 'Firma electrónica española con validez legal y API REST.', website: 'https://www.signaturit.com', logo: '🇪🇸', placeholder: 'signaturit_...', docsUrl: 'https://docs.signaturit.com' },
  { id: 'bizum-api', name: 'Bizum', category: 'Pagos', description: 'Pagos móviles instantáneos entre personas y comercios en España.', website: 'https://bizum.es', logo: '🇪🇸', placeholder: 'bizum_...', docsUrl: 'https://bizum.es/en/developers/' },
  { id: 'satispay-api', name: 'Satispay', category: 'Pagos', description: 'Pagos móviles para Italia con cashback y e-commerce.', website: 'https://www.satispay.com', logo: '🇮🇹', placeholder: 'satispay_...', docsUrl: 'https://developers.satispay.com' },
  { id: 'swish-api', name: 'Swish', category: 'Pagos', description: 'Pagos móviles instantáneos en Suecia con API para comercios.', website: 'https://www.swish.nu', logo: '🇸🇪', placeholder: 'swish_...', docsUrl: 'https://developer.swish.nu' },
  { id: 'ideal-api', name: 'iDEAL', category: 'Pagos', description: 'Pagos bancarios online líderes en los Países Bajos.', website: 'https://www.ideal.nl', logo: '🇳🇱', placeholder: 'ideal_...', docsUrl: 'https://www.ideal.nl/en/developers/' },
  { id: 'bancontact-api', name: 'Bancontact', category: 'Pagos', description: 'Pagos con tarjeta de débito y móvil en Bélgica.', website: 'https://www.bancontact.com', logo: '🇧🇪', placeholder: 'bancontact_...', docsUrl: 'https://developer.bancontact.com' },
  { id: 'mbway-api', name: 'MB WAY', category: 'Pagos', description: 'Pagos móviles instantáneos en Portugal.', website: 'https://www.mbway.pt', logo: '🇵🇹', placeholder: 'mbway_...', docsUrl: 'https://www.mbway.pt/developers/' },
  { id: 'pix-api', name: 'PIX (Brasil)', category: 'Pagos', description: 'Sistema de pagos instantáneos del Banco Central de Brasil.', website: 'https://www.bcb.gov.br/estabilidadefinanceira/pix', logo: '🇧🇷', placeholder: 'pix_...', docsUrl: 'https://www.bcb.gov.br/estabilidadefinanceira/comunicacaodados' },
  { id: 'upi-api', name: 'UPI (India)', category: 'Pagos', description: 'Pagos instantáneos de cuenta a cuenta en India.', website: 'https://www.npci.org.in/what-we-do/upi/product-overview', logo: '🇮🇳', placeholder: 'upi_...', docsUrl: 'https://www.npci.org.in/what-we-do/upi/upi-developer-portal' },
  { id: 'openai-whisper', name: 'OpenAI Whisper', category: 'AI & ML', description: 'Transcripción de audio a texto con soporte multilingüe.', website: 'https://openai.com/research/whisper', logo: '🎤', placeholder: 'whisper_...', docsUrl: 'https://platform.openai.com/docs/guides/speech-to-text' },
  { id: 'midjourney-api', name: 'Midjourney', category: 'AI & ML', description: 'Generación de imágenes con IA de alta calidad artística.', website: 'https://www.midjourney.com', logo: '🖼️', placeholder: 'midjourney_...', docsUrl: 'https://docs.midjourney.com' },
  { id: 'runway-api', name: 'Runway ML', category: 'AI & ML', description: 'Generación y edición de video con IA generativa.', website: 'https://runwayml.com', logo: '🎬', placeholder: 'runway_...', docsUrl: 'https://docs.runwayml.com' },
  { id: 'suno-api', name: 'Suno AI', category: 'AI & ML', description: 'Generación de música y canciones con IA.', website: 'https://suno.com', logo: '🎵', placeholder: 'suno_...', docsUrl: 'https://docs.suno.com' },
  { id: 'github-copilot', name: 'GitHub Copilot', category: 'AI & ML', description: 'Asistente de código con IA para autocompletado y chat.', website: 'https://github.com/features/copilot', logo: '🤖', placeholder: 'copilot_...', docsUrl: 'https://docs.github.com/copilot' },
  { id: 'tabnine-api', name: 'Tabnine', category: 'AI & ML', description: 'Autocompletado de código con IA privada para equipos.', website: 'https://www.tabnine.com', logo: '⌨️', placeholder: 'tabnine_...', docsUrl: 'https://docs.tabnine.com' },
  { id: 'vercel-ai', name: 'Vercel AI SDK', category: 'AI & ML', description: 'SDK para construir apps de IA con streaming y edge.', website: 'https://sdk.vercel.ai', logo: '▲', placeholder: 'vercel_ai_...', docsUrl: 'https://sdk.vercel.ai/docs' },
  { id: 'langchain-api', name: 'LangChain', category: 'AI & ML', description: 'Framework para construir aplicaciones con LLMs y RAG.', website: 'https://www.langchain.com', logo: '🦜', placeholder: 'langchain_...', docsUrl: 'https://docs.langchain.com' },
  { id: 'llamaindex-api', name: 'LlamaIndex', category: 'AI & ML', description: 'Framework de datos para apps de IA con indexación y RAG.', website: 'https://www.llamaindex.ai', logo: '🦙', placeholder: 'llamaindex_...', docsUrl: 'https://docs.llamaindex.ai' },
  { id: 'sanity-api', name: 'Sanity', category: 'Productividad', description: 'CMS headless con contenido estructurado y GROQ query.', website: 'https://www.sanity.io', logo: '📝', placeholder: 'sanity_...', docsUrl: 'https://www.sanity.io/docs' },
  { id: 'contentful-api', name: 'Contentful', category: 'Productividad', description: 'CMS headless con API GraphQL y modelos flexibles.', website: 'https://www.contentful.com', logo: '📦', placeholder: 'contentful_...', docsUrl: 'https://www.contentful.com/developers/docs/' },
  { id: 'strapi-api', name: 'Strapi', category: 'Productividad', description: 'CMS headless open-source con Node.js y API auto-generada.', website: 'https://strapi.io', logo: '🚀', placeholder: 'strapi_...', docsUrl: 'https://docs.strapi.io' },
  { id: 'payload-cms', name: 'Payload CMS', category: 'Productividad', description: 'CMS headless TypeScript-first con admin UI auto-generado.', website: 'https://payloadcms.com', logo: '💠', placeholder: 'payload_...', docsUrl: 'https://payloadcms.com/docs' },
  { id: 'resemble-ai', name: 'Resemble AI', category: 'AI & ML', description: 'Clonación y síntesis de voz con IA en tiempo real.', website: 'https://www.resemble.ai', logo: '🗣️', placeholder: 'resemble_...', docsUrl: 'https://docs.resemble.ai' },
  { id: 'playht-api', name: 'Play.ht', category: 'AI & ML', description: 'Text-to-speech realista con voces clonadas y API.', website: 'https://play.ht', logo: '🔊', placeholder: 'playht_...', docsUrl: 'https://docs.play.ht' },
  { id: 'retool-api', name: 'Retool', category: 'Productividad', description: 'Constructor de apps internas con drag-and-drop y APIs.', website: 'https://retool.com', logo: '🔧', placeholder: 'retool_...', docsUrl: 'https://docs.retool.com' },
  { id: 'appsmith-api', name: 'Appsmith', category: 'Productividad', description: 'Plataforma open-source para construir apps internas.', website: 'https://www.appsmith.com', logo: '🏗️', placeholder: 'appsmith_...', docsUrl: 'https://docs.appsmith.com' },
  { id: 'budibase-api', name: 'Budibase', category: 'Productividad', description: 'Low-code open-source para apps internas y formularios.', website: 'https://budibase.com', logo: '🅱️', placeholder: 'budibase_...', docsUrl: 'https://docs.budibase.com' },
  { id: 'plaid-link', name: 'Plaid Link', category: 'Fintech', description: 'Widget de conexión bancaria segura para apps financieras.', website: 'https://plaid.com/plaid-link/', logo: '🔗', placeholder: 'plaid_link_...', docsUrl: 'https://plaid.com/docs/link/' },
  { id: 'stripe-billing', name: 'Stripe Billing', category: 'Fintech', description: 'Suscripciones y facturación recurrente con Stripe.', website: 'https://stripe.com/billing', logo: '💰', placeholder: 'stripe_billing_...', docsUrl: 'https://docs.stripe.com/billing' },
  { id: 'github-actions', name: 'GitHub Actions', category: 'DevOps', description: 'CI/CD integrado en GitHub con workflows YAML.', website: 'https://github.com/features/actions', logo: '⚡', placeholder: 'gh_actions_...', docsUrl: 'https://docs.github.com/actions' },
  { id: 'gitlab-ci', name: 'GitLab CI/CD', category: 'DevOps', description: 'CI/CD integrado en GitLab con pipelines y runners.', website: 'https://docs.gitlab.com/ee/ci/', logo: '🦊', placeholder: 'gitlab_ci_...', docsUrl: 'https://docs.gitlab.com/ee/ci/' },
  { id: 'supabase-realtime', name: 'Supabase Realtime', category: 'Comunicación', description: 'Websockets y broadcast para sincronización en tiempo real.', website: 'https://supabase.com/realtime', logo: '⚡', placeholder: 'supabase_rt_...', docsUrl: 'https://supabase.com/docs/guides/realtime' },
  { id: 'ably-api', name: 'Ably Realtime', category: 'Comunicación', description: 'Mensajería pub/sub en tiempo real con garantía de entrega.', website: 'https://ably.com', logo: '🔴', placeholder: 'ably_...', docsUrl: 'https://ably.com/docs' },
  { id: 'n8n-api', name: 'n8n', category: 'Productividad', description: 'Automatización de workflows open-source con nodos visuales.', website: 'https://n8n.io', logo: '🔄', placeholder: 'n8n_...', docsUrl: 'https://docs.n8n.io' },
  { id: 'pipedream-api', name: 'Pipedream', category: 'Productividad', description: 'Plataforma de integración con código y 1000+ conectores.', website: 'https://pipedream.com', logo: '🔧', placeholder: 'pipedream_...', docsUrl: 'https://pipedream.com/docs' },
  { id: 'render-api', name: 'Render', category: 'Cloud', description: 'Cloud moderno con despliegue automático desde Git.', website: 'https://render.com', logo: '🟢', placeholder: 'render_...', docsUrl: 'https://render.com/docs' },
  { id: 'coolify-api', name: 'Coolify', category: 'Cloud', description: 'PaaS self-hosted open-source alternativa a Heroku y Vercel.', website: 'https://coolify.io', logo: '❄️', placeholder: 'coolify_...', docsUrl: 'https://coolify.io/docs' },
  { id: 'dokku-api', name: 'Dokku', category: 'Cloud', description: 'PaaS minimalista self-hosted basado en Docker.', website: 'https://dokku.com', logo: '🐳', placeholder: 'dokku_...', docsUrl: 'https://dokku.com/docs/getting-started/installation/' },
  { id: 'servicenow-api', name: 'ServiceNow', category: 'Enterprise', description: 'Plataforma ITSM con workflows, CMDB y automatización.', website: 'https://www.servicenow.com', logo: '🏢', placeholder: 'servicenow_...', docsUrl: 'https://developer.servicenow.com' },
  { id: 'sap-api', name: 'SAP Business Technology', category: 'Enterprise', description: 'ERP y plataforma empresarial con APIs de integración.', website: 'https://www.sap.com', logo: '🔷', placeholder: 'sap_...', docsUrl: 'https://api.sap.com' },
  { id: 'salesforce-platform', name: 'Salesforce Platform', category: 'Enterprise', description: 'Plataforma de desarrollo con Apex, Lightning y APIs.', website: 'https://www.salesforce.com/platform/', logo: '☁️', placeholder: 'salesforce_plt_...', docsUrl: 'https://developer.salesforce.com/docs' },
  { id: 'oracle-erp-api', name: 'Oracle ERP Cloud', category: 'Enterprise', description: 'ERP en la nube con finanzas, compras y proyectos.', website: 'https://www.oracle.com/erp/', logo: '🔴', placeholder: 'oracle_erp_...', docsUrl: 'https://docs.oracle.com/en/cloud/saas/financials/' },
  { id: 'dynamics365-api', name: 'Dynamics 365', category: 'Enterprise', description: 'ERP y CRM de Microsoft con módulos de finanzas y ventas.', website: 'https://dynamics.microsoft.com', logo: '🪟', placeholder: 'dynamics_...', docsUrl: 'https://learn.microsoft.com/dynamics365/' },
  { id: 'netsuite-api', name: 'NetSuite', category: 'Enterprise', description: 'ERP cloud de Oracle para medianas y grandes empresas.', website: 'https://www.netsuite.com', logo: '🟠', placeholder: 'netsuite_...', docsUrl: 'https://docs.oracle.com/en/cloud/saas/netsuite/' },
  { id: 'workday-fin-api', name: 'Workday', category: 'Enterprise', description: 'HRIS y finanzas empresariales con planificación y analytics.', website: 'https://www.workday.com', logo: '📊', placeholder: 'workday_fin_...', docsUrl: 'https://community.workday.com/sites/default/files/file-hosting/restapi/' },
  { id: 'zuora-api', name: 'Zuora', category: 'Enterprise', description: 'Gestión de suscripciones y revenue recognition para empresas.', website: 'https://www.zuora.com', logo: '💰', placeholder: 'zuora_...', docsUrl: 'https://developer.zuora.com' },
  { id: 'coupa-api', name: 'Coupa', category: 'Enterprise', description: 'Gestión de gastos y procurement con automatización.', website: 'https://www.coupa.com', logo: '📋', placeholder: 'coupa_...', docsUrl: 'https://compass.coupa.com/en-us/products/product-documentation/integration-technical-documentation' },
  { id: 'anaplan-api', name: 'Anaplan', category: 'Enterprise', description: 'Planificación empresarial conectada con modelos y forecasting.', website: 'https://www.anaplan.com', logo: '📈', placeholder: 'anaplan_...', docsUrl: 'https://help.anaplan.com/integration-api' },
  { id: 'odoo-api', name: 'Odoo', category: 'Enterprise', description: 'ERP open-source con módulos de ventas, inventario y contabilidad.', website: 'https://www.odoo.com', logo: '🟣', placeholder: 'odoo_...', docsUrl: 'https://www.odoo.com/documentation/' },
  { id: 'erpnext-api', name: 'ERPNext', category: 'Enterprise', description: 'ERP open-source con fabricación, CRM y RRHH.', website: 'https://erpnext.com', logo: '📦', placeholder: 'erpnext_...', docsUrl: 'https://docs.erpnext.com' },
  { id: 'telnyx-voice', name: 'Telnyx Voice', category: 'Telecom', description: 'VoIP y SIP trunking con control de llamadas programable.', website: 'https://telnyx.com', logo: '📞', placeholder: 'telnyx_voice_...', docsUrl: 'https://developers.telnyx.com' },
  { id: 'twilio-voice', name: 'Twilio Voice', category: 'Telecom', description: 'Llamadas de voz programables con IVR y grabación.', website: 'https://www.twilio.com/voice', logo: '📱', placeholder: 'twilio_voice_...', docsUrl: 'https://www.twilio.com/docs/voice' },
  { id: 'signalwire-api', name: 'SignalWire', category: 'Telecom', description: 'APIs de voz, video y messaging sobre FreeSWITCH.', website: 'https://signalwire.com', logo: '📡', placeholder: 'signalwire_...', docsUrl: 'https://developer.signalwire.com' },
  { id: 'kaleyra-api', name: 'Kaleyra', category: 'Telecom', description: 'CPaaS con voz, SMS y video para comunicaciones empresariales.', website: 'https://www.kaleyra.com', logo: '📲', placeholder: 'kaleyra_...', docsUrl: 'https://developers.kaleyra.com' },
  { id: 'flowroute-api', name: 'Flowroute', category: 'Telecom', description: 'Números de teléfono, SMS y SIP con API carrier-grade.', website: 'https://www.flowroute.com', logo: '🔀', placeholder: 'flowroute_...', docsUrl: 'https://developer.flowroute.com' },
  { id: 'voximplant-api', name: 'Voximplant', category: 'Telecom', description: 'Plataforma serverless de voz y video con SDK JavaScript.', website: 'https://voximplant.com', logo: '☎️', placeholder: 'voximplant_...', docsUrl: 'https://voximplant.com/docs/' },
  { id: 'climatiq-api', name: 'Climatiq', category: 'Sustainability', description: 'API de emisiones de CO2 para cálculo de huella de carbono.', website: 'https://www.climatiq.io', logo: '🌱', placeholder: 'climatiq_...', docsUrl: 'https://www.climatiq.io/docs' },
  { id: 'carboninterface-api', name: 'Carbon Interface', category: 'Sustainability', description: 'Estimación de emisiones para vuelos, electricidad y envíos.', website: 'https://www.carboninterface.com', logo: '🌍', placeholder: 'carbon_...', docsUrl: 'https://docs.carboninterface.com' },
  { id: 'watershed-api', name: 'Watershed', category: 'Sustainability', description: 'Plataforma de clima empresarial para medir y reducir emisiones.', website: 'https://watershed.com', logo: '💧', placeholder: 'watershed_...', docsUrl: 'https://developer.watershed.com' },
  { id: 'sinai-api', name: 'Sinai Technologies', category: 'Sustainability', description: 'Gestión de carbono con analítica de descarbonización.', website: 'https://www.sinaitechnologies.com', logo: '🏔️', placeholder: 'sinai_...', docsUrl: 'https://docs.sinaitechnologies.com' },
  { id: 'patch-api', name: 'Patch (Stripe)', category: 'Sustainability', description: 'API para comprar créditos de carbono y offsets verificados.', website: 'https://www.patch.io', logo: '🌿', placeholder: 'patch_...', docsUrl: 'https://docs.patch.io' },
  { id: 'axe-core-api', name: 'axe DevTools', category: 'Accessibility', description: 'Testing de accesibilidad WCAG automatizado para webs y apps.', website: 'https://www.deque.com/axe/', logo: '♿', placeholder: 'axe_...', docsUrl: 'https://docs.deque.com' },
  { id: 'accessibe-api', name: 'accessiBe', category: 'Accessibility', description: 'Solución de accesibilidad web con IA y compliance WCAG.', website: 'https://accessibe.com', logo: '🔵', placeholder: 'accessibe_...', docsUrl: 'https://accessibe.com/support' },
  { id: 'userway-api', name: 'UserWay', category: 'Accessibility', description: 'Widget de accesibilidad web con auditoría y remediación.', website: 'https://userway.org', logo: '👁️', placeholder: 'userway_...', docsUrl: 'https://userway.org/developers' },
  { id: 'wave-api-webaim', name: 'WAVE (WebAIM)', category: 'Accessibility', description: 'Evaluador de accesibilidad web con API de escaneo.', website: 'https://wave.webaim.org', logo: '🌊', placeholder: 'wave_...', docsUrl: 'https://wave.webaim.org/api/' },
  { id: 'shodan-api', name: 'Shodan', category: 'Cybersecurity', description: 'Motor de búsqueda de dispositivos conectados a internet.', website: 'https://www.shodan.io', logo: '🔍', placeholder: 'shodan_...', docsUrl: 'https://developer.shodan.io/api' },
  { id: 'virustotal-api', name: 'VirusTotal', category: 'Cybersecurity', description: 'Análisis de archivos y URLs con +70 motores antivirus.', website: 'https://www.virustotal.com', logo: '🦠', placeholder: 'virustotal_...', docsUrl: 'https://docs.virustotal.com' },
  { id: 'abuseipdb-api', name: 'AbuseIPDB', category: 'Cybersecurity', description: 'Base de datos colaborativa de IPs maliciosas y spam.', website: 'https://www.abuseipdb.com', logo: '🚫', placeholder: 'abuseipdb_...', docsUrl: 'https://docs.abuseipdb.com' },
  { id: 'haveibeenpwned-api', name: 'Have I Been Pwned', category: 'Cybersecurity', description: 'Verificación de emails y contraseñas en brechas de datos.', website: 'https://haveibeenpwned.com', logo: '🔓', placeholder: 'hibp_...', docsUrl: 'https://haveibeenpwned.com/API/v3' },
  { id: 'censys-api', name: 'Censys', category: 'Cybersecurity', description: 'Escaneo de internet con datos de certificados y hosts.', website: 'https://censys.io', logo: '🔬', placeholder: 'censys_...', docsUrl: 'https://censys.io/api' },
  { id: 'securitytrails-api', name: 'SecurityTrails', category: 'Cybersecurity', description: 'DNS histórico y datos de infraestructura para threat intel.', website: 'https://securitytrails.com', logo: '🕵️', placeholder: 'securitytrails_...', docsUrl: 'https://docs.securitytrails.com' },
  { id: 'google-vision-api', name: 'Google Cloud Vision', category: 'AI & ML', description: 'OCR, detección de objetos y clasificación de imágenes.', website: 'https://cloud.google.com/vision', logo: '👁️', placeholder: 'gcv_...', docsUrl: 'https://cloud.google.com/vision/docs' },
  { id: 'aws-textract', name: 'AWS Textract', category: 'AI & ML', description: 'Extracción de texto y datos de documentos con ML.', website: 'https://aws.amazon.com/textract/', logo: '📄', placeholder: 'textract_...', docsUrl: 'https://docs.aws.amazon.com/textract/' },
  { id: 'azure-form-recognizer', name: 'Azure Document Intelligence', category: 'AI & ML', description: 'Extracción de datos de formularios y documentos con IA.', website: 'https://azure.microsoft.com/products/ai-services/ai-document-intelligence', logo: '📋', placeholder: 'azure_doc_...', docsUrl: 'https://learn.microsoft.com/azure/ai-services/document-intelligence/' },
  { id: 'mindee-api', name: 'Mindee', category: 'AI & ML', description: 'OCR de facturas, recibos y documentos con modelos custom.', website: 'https://mindee.com', logo: '🧠', placeholder: 'mindee_...', docsUrl: 'https://developers.mindee.com' },
  { id: 'nanonets-api', name: 'Nanonets', category: 'AI & ML', description: 'Automatización de documentos con OCR e IA sin código.', website: 'https://nanonets.com', logo: '🔬', placeholder: 'nanonets_...', docsUrl: 'https://nanonets.com/documentation' },
  { id: 'intercom-api', name: 'Intercom', category: 'Customer Support', description: 'Plataforma de engagement con chat, bots y help center.', website: 'https://www.intercom.com', logo: '💬', placeholder: 'intercom_...', docsUrl: 'https://developers.intercom.com' },
  { id: 'drift-api', name: 'Drift', category: 'Customer Support', description: 'Marketing conversacional con chatbots y ABM.', website: 'https://www.drift.com', logo: '🌊', placeholder: 'drift_...', docsUrl: 'https://devdocs.drift.com' },
  { id: 'chatwoot-api', name: 'Chatwoot', category: 'Customer Support', description: 'Soporte al cliente open-source con chat y omnichannel.', website: 'https://www.chatwoot.com', logo: '💬', placeholder: 'chatwoot_...', docsUrl: 'https://www.chatwoot.com/developers/api/' },
  { id: 'tap-payments-api', name: 'Tap Payments', category: 'Pagos', description: 'Gateway de pagos para Oriente Medio con tarjetas y wallets.', website: 'https://www.tap.company', logo: '🕌', placeholder: 'tap_...', docsUrl: 'https://developers.tap.company' },
  { id: 'paytr-api', name: 'PayTR', category: 'Pagos', description: 'Pasarela de pagos para Turquía con transferencias y tarjetas.', website: 'https://www.paytr.com', logo: '🇹🇷', placeholder: 'paytr_...', docsUrl: 'https://dev.paytr.com' },
  { id: 'iyzico-api', name: 'iyzico', category: 'Pagos', description: 'Pagos online y marketplace para Turquía y MENA.', website: 'https://www.iyzico.com', logo: '🔵', placeholder: 'iyzico_...', docsUrl: 'https://dev.iyzipay.com' },
  { id: 'pesapal-api', name: 'Pesapal', category: 'Pagos', description: 'Pagos online para África con M-Pesa y tarjetas.', website: 'https://www.pesapal.com', logo: '🌍', placeholder: 'pesapal_...', docsUrl: 'https://developer.pesapal.com' },
  { id: 'instamojo-api', name: 'Instamojo', category: 'Pagos', description: 'Pagos y e-commerce simplificado para India.', website: 'https://www.instamojo.com', logo: '🇮🇳', placeholder: 'instamojo_...', docsUrl: 'https://docs.instamojo.com' },
  { id: 'epayco-api', name: 'ePayco', category: 'Pagos', description: 'Pasarela de pagos colombiana con PSE y tarjetas.', website: 'https://epayco.com', logo: '🇨🇴', placeholder: 'epayco_...', docsUrl: 'https://docs.epayco.co' },
  { id: 'transbank-api', name: 'Transbank', category: 'Pagos', description: 'Pagos con tarjeta y Webpay en Chile.', website: 'https://www.transbankdevelopers.cl', logo: '🇨🇱', placeholder: 'transbank_...', docsUrl: 'https://www.transbankdevelopers.cl/documentacion/' },
  { id: 'culqi-api', name: 'Culqi', category: 'Pagos', description: 'Procesador de pagos online para Perú con tarjetas y Yape.', website: 'https://www.culqi.com', logo: '🇵🇪', placeholder: 'culqi_...', docsUrl: 'https://docs.culqi.com' },
  { id: 'launchdarkly-api', name: 'LaunchDarkly', category: 'Feature Flags', description: 'Feature flags y feature management para deployment progresivo.', website: 'https://launchdarkly.com', logo: '🚀', placeholder: 'ld_...', docsUrl: 'https://docs.launchdarkly.com' },
  { id: 'splitio-api', name: 'Split.io', category: 'Feature Flags', description: 'Feature flags con experimentación A/B y métricas.', website: 'https://www.split.io', logo: '🔀', placeholder: 'split_...', docsUrl: 'https://docs.split.io' },
  { id: 'flagsmith-api', name: 'Flagsmith', category: 'Feature Flags', description: 'Feature flags open-source con remote config y segmentos.', website: 'https://flagsmith.com', logo: '🏳️', placeholder: 'flagsmith_...', docsUrl: 'https://docs.flagsmith.com' },
  { id: 'unleash-api', name: 'Unleash', category: 'Feature Flags', description: 'Feature toggles open-source con estrategias y métricas.', website: 'https://www.getunleash.io', logo: '🔓', placeholder: 'unleash_...', docsUrl: 'https://docs.getunleash.io' },
  { id: 'growthbook-api', name: 'GrowthBook', category: 'Feature Flags', description: 'Feature flags y experimentación A/B open-source.', website: 'https://www.growthbook.io', logo: '📈', placeholder: 'growthbook_...', docsUrl: 'https://docs.growthbook.io' },
  { id: 'configcat-api', name: 'ConfigCat', category: 'Feature Flags', description: 'Feature flags con targeting y rollout progresivo.', website: 'https://configcat.com', logo: '🐱', placeholder: 'configcat_...', docsUrl: 'https://configcat.com/docs/' },
  { id: 'sentry-api', name: 'Sentry', category: 'Error Tracking', description: 'Monitoreo de errores con stack traces y performance.', website: 'https://sentry.io', logo: '🐛', placeholder: 'sentry_...', docsUrl: 'https://docs.sentry.io' },
  { id: 'bugsnag-api', name: 'Bugsnag', category: 'Error Tracking', description: 'Estabilidad de apps con detección de errores y releases.', website: 'https://www.bugsnag.com', logo: '🪲', placeholder: 'bugsnag_...', docsUrl: 'https://docs.bugsnag.com' },
  { id: 'rollbar-api', name: 'Rollbar', category: 'Error Tracking', description: 'Error tracking en tiempo real con agrupación inteligente.', website: 'https://rollbar.com', logo: '🔴', placeholder: 'rollbar_...', docsUrl: 'https://docs.rollbar.com' },
  { id: 'raygun-api', name: 'Raygun', category: 'Error Tracking', description: 'Crash reporting y APM para web, mobile y backend.', website: 'https://raygun.com', logo: '🔫', placeholder: 'raygun_...', docsUrl: 'https://raygun.com/documentation' },
  { id: 'airbrake-api', name: 'Airbrake', category: 'Error Tracking', description: 'Notificador de errores con deploys tracking y performance.', website: 'https://airbrake.io', logo: '🛑', placeholder: 'airbrake_...', docsUrl: 'https://airbrake.io/docs/' },
  { id: 'twitch-drops', name: 'Twitch Drops', category: 'Gaming', description: 'Sistema de recompensas in-game vinculadas a ver streams.', website: 'https://dev.twitch.tv/docs/drops', logo: '🎁', placeholder: 'twitch_drops_...', docsUrl: 'https://dev.twitch.tv/docs/drops' },
  { id: 'discord-bot-api', name: 'Discord Bot', category: 'Gaming', description: 'Bots de Discord con slash commands y gateway events.', website: 'https://discord.com/developers', logo: '🎮', placeholder: 'discord_bot_...', docsUrl: 'https://discord.com/developers/docs' },
  { id: 'mapillary-api', name: 'Mapillary', category: 'Mapas', description: 'Street-level imagery abierto con datos de segmentación.', website: 'https://www.mapillary.com', logo: '📷', placeholder: 'mapillary_...', docsUrl: 'https://www.mapillary.com/developer/api-documentation' },
  { id: 'overpass-api', name: 'Overpass (OSM)', category: 'Mapas', description: 'Consultas avanzadas sobre datos de OpenStreetMap.', website: 'https://overpass-turbo.eu', logo: '🗺️', placeholder: 'overpass_...', docsUrl: 'https://wiki.openstreetmap.org/wiki/Overpass_API' },
  { id: 'notion-api', name: 'Notion API', category: 'Productividad', description: 'Base de datos, páginas y bloques con API REST oficial.', website: 'https://developers.notion.com', logo: '📝', placeholder: 'notion_...', docsUrl: 'https://developers.notion.com/reference' },
  { id: 'slack-api', name: 'Slack API', category: 'Productividad', description: 'Bots, apps y webhooks para automatizar Slack.', website: 'https://api.slack.com', logo: '💬', placeholder: 'xoxb-...', docsUrl: 'https://api.slack.com/docs' },
  { id: 'replicate-api', name: 'Replicate', category: 'AI & ML', description: 'Ejecutar modelos de ML open-source con API simple.', website: 'https://replicate.com', logo: '🔄', placeholder: 'r8_...', docsUrl: 'https://replicate.com/docs' },
  { id: 'hume-api', name: 'Hume AI', category: 'AI & ML', description: 'IA emocional con análisis de voz, rostro y lenguaje.', website: 'https://www.hume.ai', logo: '😊', placeholder: 'hume_...', docsUrl: 'https://dev.hume.ai' },
  { id: 'cohere-embed', name: 'Cohere Embed', category: 'AI & ML', description: 'Embeddings multilingües para búsqueda semántica y RAG.', website: 'https://cohere.com', logo: '🔮', placeholder: 'cohere_embed_...', docsUrl: 'https://docs.cohere.com/reference/embed' },
  { id: 'mistral-platform', name: 'Mistral Platform', category: 'AI & ML', description: 'Modelos open-weight europeos con API de chat y embeddings.', website: 'https://mistral.ai', logo: '🌬️', placeholder: 'mistral_...', docsUrl: 'https://docs.mistral.ai' },
  { id: 'sentry-crons', name: 'Sentry Crons', category: 'Monitoring', description: 'Monitoreo de cron jobs y tareas programadas con alertas.', website: 'https://sentry.io/for/crons/', logo: '⏰', placeholder: 'sentry_cron_...', docsUrl: 'https://docs.sentry.io/product/crons/' },
  { id: 'incident-io-api', name: 'incident.io', category: 'Monitoring', description: 'Gestión de incidentes con workflows y post-mortems.', website: 'https://incident.io', logo: '🚨', placeholder: 'incident_...', docsUrl: 'https://api-docs.incident.io' },
  { id: 'rootly-api', name: 'Rootly', category: 'Monitoring', description: 'Respuesta a incidentes automatizada con Slack y Jira.', website: 'https://rootly.com', logo: '🌳', placeholder: 'rootly_...', docsUrl: 'https://rootly.com/docs/api' },
  { id: 'firehydrant-api', name: 'FireHydrant', category: 'Monitoring', description: 'Gestión de incidentes con runbooks y retrospectivas.', website: 'https://firehydrant.com', logo: '🧯', placeholder: 'firehydrant_...', docsUrl: 'https://docs.firehydrant.io' },
  { id: 'vercel-analytics', name: 'Vercel Analytics', category: 'Analytics', description: 'Web analytics y Web Vitals para apps en Vercel.', website: 'https://vercel.com/analytics', logo: '▲', placeholder: 'vercel_analytics_...', docsUrl: 'https://vercel.com/docs/analytics' },
  { id: 'tinybird-api', name: 'Tinybird', category: 'Analytics', description: 'Analytics en tiempo real con SQL y endpoints API.', website: 'https://www.tinybird.co', logo: '🐦', placeholder: 'tinybird_...', docsUrl: 'https://www.tinybird.co/docs' },
  { id: 'cloudflare-workers', name: 'Cloudflare Workers', category: 'Cloud', description: 'Edge computing serverless con V8 isolates y KV storage.', website: 'https://workers.cloudflare.com', logo: '🟠', placeholder: 'cf_workers_...', docsUrl: 'https://developers.cloudflare.com/workers/' },
  { id: 'deno-deploy', name: 'Deno Deploy', category: 'Cloud', description: 'Hosting serverless para Deno con deploy desde GitHub.', website: 'https://deno.com/deploy', logo: '🦕', placeholder: 'deno_...', docsUrl: 'https://docs.deno.com/deploy/' },
  { id: 'bun-cloud', name: 'Bun Cloud', category: 'Cloud', description: 'Runtime JavaScript/TypeScript rápido con deploy nativo.', website: 'https://bun.sh', logo: '🍞', placeholder: 'bun_...', docsUrl: 'https://bun.sh/docs' },
  { id: 'veeam-api', name: 'Veeam', category: 'Backup', description: 'Backup y recuperación de VMs, cloud y SaaS.', website: 'https://www.veeam.com', logo: '💾', placeholder: 'veeam_...', docsUrl: 'https://helpcenter.veeam.com/docs/backup/rest/overview.html' },
  { id: 'acronis-api', name: 'Acronis', category: 'Backup', description: 'Ciberprotección con backup, anti-malware y DR.', website: 'https://www.acronis.com', logo: '🛡️', placeholder: 'acronis_...', docsUrl: 'https://developer.acronis.com' },
  { id: 'duplicati-api', name: 'Duplicati', category: 'Backup', description: 'Backup encriptado open-source a múltiples destinos cloud.', website: 'https://www.duplicati.com', logo: '📁', placeholder: 'duplicati_...', docsUrl: 'https://duplicati.readthedocs.io' },
  { id: 'restic-api', name: 'Restic', category: 'Backup', description: 'Backup rápido y seguro con deduplicación y cifrado.', website: 'https://restic.net', logo: '🔒', placeholder: 'restic_...', docsUrl: 'https://restic.readthedocs.io' },
  { id: 'tailscale-api', name: 'Tailscale', category: 'Network', description: 'VPN mesh basada en WireGuard con zero-config.', website: 'https://tailscale.com', logo: '🔗', placeholder: 'tskey-...', docsUrl: 'https://tailscale.com/api' },
  { id: 'zerotier-api', name: 'ZeroTier', category: 'Network', description: 'SDN y VPN P2P para conectar dispositivos de forma segura.', website: 'https://www.zerotier.com', logo: '🌐', placeholder: 'zerotier_...', docsUrl: 'https://docs.zerotier.com' },
  { id: 'ngrok-api', name: 'ngrok', category: 'Network', description: 'Túneles seguros para exponer servicios locales a internet.', website: 'https://ngrok.com', logo: '🔀', placeholder: 'ngrok_...', docsUrl: 'https://ngrok.com/docs/api/' },
  { id: 'cloudflare-tunnel', name: 'Cloudflare Tunnel', category: 'Network', description: 'Túneles seguros sin abrir puertos para exponer servicios.', website: 'https://www.cloudflare.com/products/tunnel/', logo: '🟠', placeholder: 'cf_tunnel_...', docsUrl: 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/' },
  { id: 'ghcr-api', name: 'GitHub Container Registry', category: 'DevOps', description: 'Registro de contenedores integrado con GitHub.', website: 'https://ghcr.io', logo: '📦', placeholder: 'ghcr_...', docsUrl: 'https://docs.github.com/packages/working-with-a-github-packages-registry/working-with-the-container-registry' },
  { id: 'quay-io-api', name: 'Quay.io (Red Hat)', category: 'DevOps', description: 'Registro de contenedores con escaneo de seguridad y builds.', website: 'https://quay.io', logo: '🐳', placeholder: 'quay_...', docsUrl: 'https://docs.quay.io/api/' },
  { id: 'harbor-api', name: 'Harbor', category: 'DevOps', description: 'Registro de contenedores open-source con RBAC y escaneo.', website: 'https://goharbor.io', logo: '⚓', placeholder: 'harbor_...', docsUrl: 'https://goharbor.io/docs/' },
  { id: 'aws-ecr', name: 'AWS ECR', category: 'DevOps', description: 'Registro de contenedores Docker gestionado de Amazon.', website: 'https://aws.amazon.com/ecr/', logo: '📦', placeholder: 'ecr_...', docsUrl: 'https://docs.aws.amazon.com/ecr/' },
  { id: 'vitess-api', name: 'Vitess (PlanetScale)', category: 'Base de datos', description: 'Sharding de MySQL horizontal para escala masiva.', website: 'https://vitess.io', logo: '🔋', placeholder: 'vitess_...', docsUrl: 'https://vitess.io/docs/' },
  { id: 'dgraph-api', name: 'Dgraph', category: 'Base de datos', description: 'Base de datos de grafos distribuida con GraphQL nativo.', website: 'https://dgraph.io', logo: '🔷', placeholder: 'dgraph_...', docsUrl: 'https://dgraph.io/docs/' },
  { id: 'neo4j-api', name: 'Neo4j', category: 'Base de datos', description: 'Base de datos de grafos líder con Cypher y GDS.', website: 'https://neo4j.com', logo: '🔴', placeholder: 'neo4j_...', docsUrl: 'https://neo4j.com/docs/' },
  { id: 'arangodb-api', name: 'ArangoDB', category: 'Base de datos', description: 'Base multi-modelo con grafos, documentos y key-value.', website: 'https://www.arangodb.com', logo: '🥑', placeholder: 'arango_...', docsUrl: 'https://www.arangodb.com/docs/stable/' },
  { id: 'couchbase-api', name: 'Couchbase', category: 'Base de datos', description: 'Base NoSQL distribuida con SQL++, FTS y analytics.', website: 'https://www.couchbase.com', logo: '🔴', placeholder: 'couchbase_...', docsUrl: 'https://docs.couchbase.com' },
  { id: 'convertkit-api', name: 'ConvertKit (Kit)', category: 'CRM & Marketing', description: 'Email marketing para creadores con landing pages y automaciones.', website: 'https://convertkit.com', logo: '✉️', placeholder: 'convertkit_...', docsUrl: 'https://developers.convertkit.com' },
  { id: 'lemlist-api', name: 'Lemlist', category: 'CRM & Marketing', description: 'Cold email con personalización de imágenes y secuencias.', website: 'https://www.lemlist.com', logo: '📧', placeholder: 'lemlist_...', docsUrl: 'https://developer.lemlist.com' },
  { id: 'instantly-api', name: 'Instantly', category: 'CRM & Marketing', description: 'Outreach de email en frío a escala con warmup automático.', website: 'https://instantly.ai', logo: '⚡', placeholder: 'instantly_...', docsUrl: 'https://developer.instantly.ai' },
  { id: 'vault-secrets', name: 'HashiCorp Vault Secrets', category: 'Seguridad', description: 'Gestión centralizada de secretos SaaS con rotación automática.', website: 'https://www.hashicorp.com/products/vault', logo: '🔐', placeholder: 'hvs_...', docsUrl: 'https://developer.hashicorp.com/hcp/docs/vault-secrets' },
  { id: 'doppler-api', name: 'Doppler', category: 'Seguridad', description: 'Gestor de secretos y variables de entorno para equipos.', website: 'https://www.doppler.com', logo: '🟣', placeholder: 'dp_...', docsUrl: 'https://docs.doppler.com' },
  { id: 'infisical-api', name: 'Infisical', category: 'Seguridad', description: 'Gestor de secretos open-source para equipos de desarrollo.', website: 'https://infisical.com', logo: '♾️', placeholder: 'infisical_...', docsUrl: 'https://infisical.com/docs/api-reference/overview' },
  { id: 'mangopay-api', name: 'Mangopay', category: 'Fintech', description: 'Pagos para marketplaces con e-wallet y KYC.', website: 'https://www.mangopay.com', logo: '🥭', placeholder: 'mangopay_...', docsUrl: 'https://docs.mangopay.com' },
  { id: 'lendflow-api', name: 'Lendflow', category: 'Fintech', description: 'API de decisiones de crédito para originación de préstamos.', website: 'https://www.lendflow.io', logo: '💸', placeholder: 'lendflow_...', docsUrl: 'https://docs.lendflow.io' },
  { id: 'unit-api', name: 'Unit', category: 'Fintech', description: 'Banking as a Service con cuentas, tarjetas y pagos.', website: 'https://www.unit.co', logo: '🏦', placeholder: 'unit_...', docsUrl: 'https://docs.unit.co' },
  { id: 'synapse-api', name: 'Synapse', category: 'Fintech', description: 'Infraestructura bancaria embebida con cuentas y ACH.', website: 'https://synapsefi.com', logo: '🔗', placeholder: 'synapse_...', docsUrl: 'https://docs.synapsefi.com' },
  { id: 'apple-healthkit', name: 'Apple HealthKit', category: 'Healthcare', description: 'Datos de salud y fitness de dispositivos Apple.', website: 'https://developer.apple.com/health-fitness/', logo: '❤️', placeholder: 'healthkit_...', docsUrl: 'https://developer.apple.com/documentation/healthkit' },
  { id: 'google-health-connect', name: 'Google Health Connect', category: 'Healthcare', description: 'API unificada de salud para apps Android.', website: 'https://developer.android.com/health-and-fitness/health-connect', logo: '💚', placeholder: 'health_connect_...', docsUrl: 'https://developer.android.com/guide/health-and-fitness/health-connect' },
  { id: 'withings-api', name: 'Withings', category: 'Healthcare', description: 'Dispositivos de salud conectados con datos de peso, sueño y presión.', website: 'https://developer.withings.com', logo: '⚕️', placeholder: 'withings_...', docsUrl: 'https://developer.withings.com/api-reference' },
  { id: 'flightstats-api', name: 'FlightStats', category: 'Travel', description: 'Datos de vuelos en tiempo real con retrasos y puertas.', website: 'https://www.flightstats.com', logo: '✈️', placeholder: 'flightstats_...', docsUrl: 'https://developer.flightstats.com' },
  { id: 'flightaware-api', name: 'FlightAware', category: 'Travel', description: 'Tracking de vuelos con datos ADS-B y predicciones.', website: 'https://www.flightaware.com', logo: '🛩️', placeholder: 'flightaware_...', docsUrl: 'https://www.flightaware.com/commercial/aeroapi/' },
  { id: 'legalzoom-api', name: 'LegalZoom', category: 'Legal', description: 'Servicios legales online para constitución y registro de marcas.', website: 'https://www.legalzoom.com', logo: '⚖️', placeholder: 'legalzoom_...', docsUrl: 'https://www.legalzoom.com/business/business-formation/' },
  { id: 'notarize-api', name: 'Notarize', category: 'Legal', description: 'Notarización online de documentos con video verificación.', website: 'https://www.notarize.com', logo: '📜', placeholder: 'notarize_...', docsUrl: 'https://developer.notarize.com' },
  { id: 'thinkific-api', name: 'Thinkific', category: 'Education', description: 'Plataforma de cursos online con LMS y marketing.', website: 'https://www.thinkific.com', logo: '📚', placeholder: 'thinkific_...', docsUrl: 'https://developers.thinkific.com' },
  { id: 'teachable-api', name: 'Teachable', category: 'Education', description: 'Creación y venta de cursos online con branding custom.', website: 'https://teachable.com', logo: '🎓', placeholder: 'teachable_...', docsUrl: 'https://docs.teachable.com' },
  { id: 'podia-api', name: 'Podia', category: 'Education', description: 'Venta de cursos, membresías y descargas digitales.', website: 'https://www.podia.com', logo: '🎯', placeholder: 'podia_...', docsUrl: 'https://www.podia.com/developers' },
  { id: 'yelp-api', name: 'Yelp Fusion', category: 'Food & Delivery', description: 'Reseñas y búsqueda de restaurantes y negocios locales.', website: 'https://www.yelp.com', logo: '⭐', placeholder: 'yelp_...', docsUrl: 'https://docs.developer.yelp.com' },
  { id: 'spoonacular-api', name: 'Spoonacular', category: 'Food & Delivery', description: 'API de recetas, nutrición e ingredientes con 5000+ recetas.', website: 'https://spoonacular.com', logo: '🥄', placeholder: 'spoonacular_...', docsUrl: 'https://spoonacular.com/food-api/docs' },
  { id: 'edamam-api', name: 'Edamam', category: 'Food & Delivery', description: 'Datos nutricionales y recetas con análisis de dieta.', website: 'https://www.edamam.com', logo: '🥗', placeholder: 'edamam_...', docsUrl: 'https://developer.edamam.com' },
  { id: 'pisos-com-api', name: 'Pisos.com', category: 'Real Estate', description: 'Portal inmobiliario español con compra, venta y alquiler.', website: 'https://www.pisos.com', logo: '🏠', placeholder: 'pisos_...', docsUrl: 'https://www.pisos.com/desarrolladores/' },
  { id: 'habitaclia-api', name: 'Habitaclia', category: 'Real Estate', description: 'Portal de vivienda en España con enfoque en Cataluña.', website: 'https://www.habitaclia.com', logo: '🏡', placeholder: 'habitaclia_...', docsUrl: 'https://www.habitaclia.com/api/' },
  { id: 'vercel-kv', name: 'Vercel KV', category: 'Storage', description: 'Redis serverless en el edge para caché y sessions.', website: 'https://vercel.com/docs/storage/vercel-kv', logo: '▲', placeholder: 'vercel_kv_...', docsUrl: 'https://vercel.com/docs/storage/vercel-kv' },
  { id: 'neon-serverless', name: 'Neon Serverless', category: 'Base de datos', description: 'PostgreSQL serverless con branching y autoscaling a cero.', website: 'https://neon.tech', logo: '🐘', placeholder: 'neon_...', docsUrl: 'https://neon.tech/docs' },
  { id: 'turso-embedded', name: 'Turso', category: 'Base de datos', description: 'SQLite distribuido en el edge con replicación libSQL.', website: 'https://turso.tech', logo: '🟢', placeholder: 'turso_...', docsUrl: 'https://docs.turso.tech' },
  { id: 'val-town-api', name: 'Val Town', category: 'Cloud', description: 'Funciones serverless sociales con ejecución instantánea.', website: 'https://www.val.town', logo: '🏘️', placeholder: 'valtown_...', docsUrl: 'https://docs.val.town' },
  { id: 'modal-api', name: 'Modal', category: 'Cloud', description: 'Funciones serverless para ML con GPUs on-demand.', website: 'https://modal.com', logo: '🟡', placeholder: 'modal_...', docsUrl: 'https://modal.com/docs' },
  { id: 'beam-cloud', name: 'Beam', category: 'Cloud', description: 'Infraestructura serverless para pipelines de ML.', website: 'https://www.beam.cloud', logo: '💫', placeholder: 'beam_...', docsUrl: 'https://docs.beam.cloud' },
  { id: 'trigger-dev', name: 'Trigger.dev', category: 'DevOps', description: 'Jobs en background para aplicaciones con reintentos y logs.', website: 'https://trigger.dev', logo: '⚡', placeholder: 'trigger_...', docsUrl: 'https://trigger.dev/docs' },
  { id: 'inngest-api', name: 'Inngest', category: 'DevOps', description: 'Orquestación de funciones con reintentos y event-driven.', website: 'https://www.inngest.com', logo: '🔄', placeholder: 'inngest_...', docsUrl: 'https://www.inngest.com/docs' },
  { id: 'qstash-api', name: 'QStash (Upstash)', category: 'DevOps', description: 'Message queue serverless con HTTP y scheduling.', website: 'https://upstash.com/qstash', logo: '📨', placeholder: 'qstash_...', docsUrl: 'https://upstash.com/docs/qstash/' },
  { id: 'resend-email', name: 'Resend', category: 'Email', description: 'Email transaccional para developers con React Email.', website: 'https://resend.com', logo: '📧', placeholder: 'resend_...', docsUrl: 'https://resend.com/docs' },
  { id: 'plunk-api', name: 'Plunk', category: 'Email', description: 'Email transaccional open-source con UI de gestión.', website: 'https://www.useplunk.com', logo: '📬', placeholder: 'plunk_...', docsUrl: 'https://docs.useplunk.com' },
  { id: 'svix-api', name: 'Svix', category: 'DevOps', description: 'Webhooks como servicio con reintentos y monitoreo.', website: 'https://www.svix.com', logo: '🔔', placeholder: 'svix_...', docsUrl: 'https://docs.svix.com' },
  { id: 'hookdeck-api', name: 'Hookdeck', category: 'DevOps', description: 'Infraestructura de webhooks con queue y transformaciones.', website: 'https://hookdeck.com', logo: '🪝', placeholder: 'hookdeck_...', docsUrl: 'https://hookdeck.com/docs' },
  { id: 'lago-api', name: 'Lago', category: 'Fintech', description: 'Billing open-source con usage-based pricing y métricas.', website: 'https://www.getlago.com', logo: '🌊', placeholder: 'lago_...', docsUrl: 'https://docs.getlago.com' },
  { id: 'stigg-api', name: 'Stigg', category: 'Fintech', description: 'Gestión de pricing y entitlements para SaaS.', website: 'https://www.stigg.io', logo: '💎', placeholder: 'stigg_...', docsUrl: 'https://docs.stigg.io' },
  { id: 'orb-api', name: 'Orb', category: 'Fintech', description: 'Billing basado en uso con medición y facturación.', website: 'https://www.withorb.com', logo: '🔵', placeholder: 'orb_...', docsUrl: 'https://docs.withorb.com' },
  { id: 'polar-billing', name: 'Polar', category: 'Fintech', description: 'Monetización para developers open-source con suscripciones.', website: 'https://polar.sh', logo: '❄️', placeholder: 'polar_sh_...', docsUrl: 'https://docs.polar.sh' },
  { id: 'crisp-chat', name: 'Crisp', category: 'Customer Support', description: 'Chat multicanal con chatbot, CRM y knowledge base.', website: 'https://crisp.chat', logo: '💬', placeholder: 'crisp_...', docsUrl: 'https://docs.crisp.chat' },
  { id: 'papercups-api', name: 'Papercups', category: 'Customer Support', description: 'Chat de soporte open-source con inbox compartido.', website: 'https://papercups.io', logo: '☕', placeholder: 'papercups_...', docsUrl: 'https://docs.papercups.io' },
  { id: 'posthog-api', name: 'PostHog', category: 'Analytics', description: 'Analytics de producto open-source con feature flags y replays.', website: 'https://posthog.com', logo: '🦔', placeholder: 'posthog_...', docsUrl: 'https://posthog.com/docs/api' },
  { id: 'mixpanel-api', name: 'Mixpanel', category: 'Analytics', description: 'Analytics de producto con funnels, retención y cohortes.', website: 'https://mixpanel.com', logo: '📊', placeholder: 'mixpanel_...', docsUrl: 'https://developer.mixpanel.com' },
  { id: 'clerk-api', name: 'Clerk', category: 'Auth', description: 'Autenticación con UI lista para usar y gestión de usuarios.', website: 'https://clerk.com', logo: '🔐', placeholder: 'clerk_...', docsUrl: 'https://clerk.com/docs' },
  { id: 'lucia-auth', name: 'Lucia Auth', category: 'Auth', description: 'Librería de autenticación ligera para TypeScript.', website: 'https://lucia-auth.com', logo: '🔑', placeholder: 'lucia_...', docsUrl: 'https://lucia-auth.com/getting-started' },
  { id: 'better-auth', name: 'Better Auth', category: 'Auth', description: 'Framework de auth open-source con plugins y adaptadores.', website: 'https://www.better-auth.com', logo: '✅', placeholder: 'better_auth_...', docsUrl: 'https://www.better-auth.com/docs' },
  { id: 'drizzle-orm', name: 'Drizzle ORM', category: 'Base de datos', description: 'ORM TypeScript-first con queries SQL type-safe.', website: 'https://orm.drizzle.team', logo: '💧', placeholder: 'drizzle_...', docsUrl: 'https://orm.drizzle.team/docs/overview' },
  { id: 'prisma-api', name: 'Prisma', category: 'Base de datos', description: 'ORM y query builder TypeScript con migraciones y studio.', website: 'https://www.prisma.io', logo: '🔺', placeholder: 'prisma_...', docsUrl: 'https://www.prisma.io/docs' },
  { id: 'supabase-edge', name: 'Supabase Edge Functions', category: 'Cloud', description: 'Funciones serverless en Deno con acceso a PostgreSQL.', website: 'https://supabase.com/edge-functions', logo: '⚡', placeholder: 'supabase_edge_...', docsUrl: 'https://supabase.com/docs/guides/functions' },
  { id: 'railway-api', name: 'Railway', category: 'Cloud', description: 'Despliegue instantáneo de apps con PostgreSQL y Redis.', website: 'https://railway.app', logo: '🚂', placeholder: 'railway_...', docsUrl: 'https://docs.railway.app' },

// ── Batch 1: Nuevos 500 tokens (1001–1100) ──

  // AI & ML (más)
  { id: 'together-ai-v2', name: 'Together AI', category: 'AI & ML', description: 'Inferencia y fine-tuning de modelos open-source a escala.', website: 'https://together.ai', logo: '🤝', placeholder: 'tog_...', docsUrl: 'https://docs.together.ai' },
  { id: 'anyscale-v2', name: 'Anyscale', category: 'AI & ML', description: 'Plataforma de Ray para escalar workloads de ML en la nube.', website: 'https://anyscale.com', logo: '🔆', placeholder: 'anyscale_...', docsUrl: 'https://docs.anyscale.com' },
  { id: 'baseten-v2', name: 'Baseten', category: 'AI & ML', description: 'Deploy de modelos ML con GPUs optimizadas y autoescalado.', website: 'https://baseten.co', logo: '🧱', placeholder: 'bst_...', docsUrl: 'https://docs.baseten.co' },
  { id: 'modal-ai', name: 'Modal', category: 'AI & ML', description: 'Serverless para ML: GPUs on-demand, jobs y endpoints.', website: 'https://modal.com', logo: '⚙️', placeholder: 'modal_...', docsUrl: 'https://modal.com/docs' },
  { id: 'fireworks-ai-v2', name: 'Fireworks AI', category: 'AI & ML', description: 'Inferencia rápida y económica para LLMs y modelos generativos.', website: 'https://fireworks.ai', logo: '🎆', placeholder: 'fw_...', docsUrl: 'https://docs.fireworks.ai' },
  { id: 'lepton-ai', name: 'Lepton AI', category: 'AI & ML', description: 'Plataforma para ejecutar modelos de IA con APIs simples.', website: 'https://lepton.ai', logo: '⚛️', placeholder: 'lepton_...', docsUrl: 'https://www.lepton.ai/docs' },
  { id: 'deepinfra', name: 'DeepInfra', category: 'AI & ML', description: 'Inferencia serverless de modelos ML populares con baja latencia.', website: 'https://deepinfra.com', logo: '🧬', placeholder: 'di_...', docsUrl: 'https://deepinfra.com/docs' },
  { id: 'octoai', name: 'OctoAI', category: 'AI & ML', description: 'Endpoints optimizados para Llama, Stable Diffusion y más.', website: 'https://octoai.cloud', logo: '🐙', placeholder: 'octo_...', docsUrl: 'https://docs.octoai.cloud' },
  { id: 'vllm-cloud', name: 'vLLM Cloud', category: 'AI & ML', description: 'Serving eficiente de LLMs con PagedAttention.', website: 'https://vllm.ai', logo: '🚀', placeholder: 'vllm_...', docsUrl: 'https://docs.vllm.ai' },
  { id: 'cerebras-api-v2', name: 'Cerebras', category: 'AI & ML', description: 'Hardware de IA con el chip más grande del mundo para inferencia.', website: 'https://cerebras.ai', logo: '🧠', placeholder: 'cbr_...', docsUrl: 'https://docs.cerebras.ai' },
  { id: 'ai21-labs', name: 'AI21 Labs', category: 'AI & ML', description: 'Modelos Jamba y APIs de NLP para texto empresarial.', website: 'https://ai21.com', logo: '📝', placeholder: 'ai21_...', docsUrl: 'https://docs.ai21.com' },
  { id: 'writer-ai', name: 'Writer', category: 'AI & ML', description: 'IA generativa empresarial para contenido y workflows.', website: 'https://writer.com', logo: '✍️', placeholder: 'wrt_...', docsUrl: 'https://dev.writer.com/docs' },

  // Cloud (más)
  { id: 'hetzner-api', name: 'Hetzner Cloud', category: 'Cloud', description: 'Cloud europeo con servidores dedicados y VPS económicos.', website: 'https://hetzner.cloud', logo: '🏗️', placeholder: 'htzn_...', docsUrl: 'https://docs.hetzner.cloud' },
  { id: 'vultr-api-v2', name: 'Vultr', category: 'Cloud', description: 'Cloud global con compute, storage y Kubernetes gestionado.', website: 'https://vultr.com', logo: '🌐', placeholder: 'vultr_...', docsUrl: 'https://www.vultr.com/api' },
  { id: 'linode-api-v2', name: 'Linode (Akamai)', category: 'Cloud', description: 'Cloud simplificado con Linux, Kubernetes y bases de datos.', website: 'https://linode.com', logo: '🟢', placeholder: 'linode_...', docsUrl: 'https://www.linode.com/docs/api' },
  { id: 'scaleway-api-v2', name: 'Scaleway', category: 'Cloud', description: 'Cloud europeo con bare metal, Kubernetes y serverless.', website: 'https://scaleway.com', logo: '🔲', placeholder: 'scw_...', docsUrl: 'https://www.scaleway.com/en/developers/api' },
  { id: 'oracle-cloud', name: 'Oracle Cloud', category: 'Cloud', description: 'OCI con compute, DB autónoma y AI infrastructure.', website: 'https://cloud.oracle.com', logo: '🔴', placeholder: 'oci_...', docsUrl: 'https://docs.oracle.com/en-us/iaas/api' },
  { id: 'ibm-cloud-v2', name: 'IBM Cloud', category: 'Cloud', description: 'Cloud híbrido con Watson AI, Kubernetes y bare metal.', website: 'https://cloud.ibm.com', logo: '🔵', placeholder: 'ibm_...', docsUrl: 'https://cloud.ibm.com/docs' },
  { id: 'upstash-api', name: 'Upstash', category: 'Cloud', description: 'Redis y Kafka serverless con pricing por request.', website: 'https://upstash.com', logo: '🟩', placeholder: 'upstash_...', docsUrl: 'https://upstash.com/docs' },
  { id: 'deno-deploy-v2', name: 'Deno Deploy', category: 'Cloud', description: 'Serverless en el edge con Deno runtime y KV store.', website: 'https://deno.com/deploy', logo: '🦕', placeholder: 'deno_...', docsUrl: 'https://docs.deno.com/deploy/manual' },

  // Pagos (más)
  { id: 'adyen-api', name: 'Adyen', category: 'Pagos', description: 'Plataforma de pagos empresarial unificada global.', website: 'https://adyen.com', logo: '💵', placeholder: 'adyen_...', docsUrl: 'https://docs.adyen.com' },
  { id: 'braintree-api', name: 'Braintree', category: 'Pagos', description: 'Pagos de PayPal para apps: tarjetas, Venmo, wallets.', website: 'https://braintreepayments.com', logo: '🌳', placeholder: 'braintree_...', docsUrl: 'https://developer.paypal.com/braintree/docs' },
  { id: 'klarna-api', name: 'Klarna', category: 'Pagos', description: 'Compra ahora, paga después. Checkout y financiación.', website: 'https://klarna.com', logo: '🩷', placeholder: 'klarna_...', docsUrl: 'https://docs.klarna.com' },
  { id: 'mollie-api', name: 'Mollie', category: 'Pagos', description: 'Pagos europeos: iDEAL, SEPA, tarjetas y más métodos.', website: 'https://mollie.com', logo: '🐟', placeholder: 'live_...', docsUrl: 'https://docs.mollie.com' },
  { id: 'razorpay-api', name: 'Razorpay', category: 'Pagos', description: 'Suite de pagos para India: UPI, cards, netbanking.', website: 'https://razorpay.com', logo: '🇮🇳', placeholder: 'rzp_...', docsUrl: 'https://razorpay.com/docs/api' },
  { id: 'gocardless-api', name: 'GoCardless', category: 'Pagos', description: 'Cobros recurrentes por débito directo bancario global.', website: 'https://gocardless.com', logo: '🏦', placeholder: 'live_...', docsUrl: 'https://developer.gocardless.com' },
  { id: 'wise-api', name: 'Wise (TransferWise)', category: 'Pagos', description: 'Transferencias internacionales y cuentas multi-divisa.', website: 'https://wise.com', logo: '💱', placeholder: 'wise_...', docsUrl: 'https://docs.wise.com' },
  { id: 'payoneer-api-v2', name: 'Payoneer', category: 'Pagos', description: 'Pagos globales para freelancers y marketplace.', website: 'https://payoneer.com', logo: '🌍', placeholder: 'payoneer_...', docsUrl: 'https://developers.payoneer.com' },

  // E-commerce (más)
  { id: 'bigcommerce-api', name: 'BigCommerce', category: 'E-commerce', description: 'Plataforma headless de e-commerce para empresas.', website: 'https://bigcommerce.com', logo: '🛍️', placeholder: 'bigc_...', docsUrl: 'https://developer.bigcommerce.com' },
  { id: 'magento-api', name: 'Magento (Adobe Commerce)', category: 'E-commerce', description: 'E-commerce enterprise open-source de Adobe.', website: 'https://business.adobe.com/products/magento', logo: '🟧', placeholder: 'magento_...', docsUrl: 'https://developer.adobe.com/commerce' },
  { id: 'snipcart-api', name: 'Snipcart', category: 'E-commerce', description: 'Carrito de compras JavaScript para cualquier web.', website: 'https://snipcart.com', logo: '🛒', placeholder: 'snip_...', docsUrl: 'https://docs.snipcart.com' },
  { id: 'medusa-api', name: 'Medusa', category: 'E-commerce', description: 'Backend headless open-source para e-commerce.', website: 'https://medusajs.com', logo: '🟣', placeholder: 'medusa_...', docsUrl: 'https://docs.medusajs.com' },
  { id: 'saleor-api', name: 'Saleor', category: 'E-commerce', description: 'E-commerce headless GraphQL-first con dashboard.', website: 'https://saleor.io', logo: '🏬', placeholder: 'saleor_...', docsUrl: 'https://docs.saleor.io' },
  { id: 'printful-api', name: 'Printful', category: 'E-commerce', description: 'Print-on-demand: camisetas, tazas y más bajo demanda.', website: 'https://printful.com', logo: '👕', placeholder: 'printful_...', docsUrl: 'https://developers.printful.com' },

  // CRM & Marketing (más)
  { id: 'pipedrive-api-v2', name: 'Pipedrive', category: 'CRM & Marketing', description: 'CRM de ventas visual con pipelines personalizables.', website: 'https://pipedrive.com', logo: '🔋', placeholder: 'pipedrive_...', docsUrl: 'https://developers.pipedrive.com' },
  { id: 'zoho-crm-api', name: 'Zoho CRM', category: 'CRM & Marketing', description: 'CRM completo con automatización y analytics integrado.', website: 'https://zoho.com/crm', logo: '📋', placeholder: 'zoho_...', docsUrl: 'https://www.zoho.com/crm/developer/docs/api' },
  { id: 'close-crm-api', name: 'Close CRM', category: 'CRM & Marketing', description: 'CRM para equipos de ventas con llamadas y email integrado.', website: 'https://close.com', logo: '📞', placeholder: 'close_...', docsUrl: 'https://developer.close.com' },
  { id: 'freshsales-api', name: 'Freshsales', category: 'CRM & Marketing', description: 'CRM con AI scoring, teléfono y email built-in.', website: 'https://freshworks.com/freshsales-crm', logo: '🍊', placeholder: 'freshsales_...', docsUrl: 'https://developers.freshworks.com/crm' },
  { id: 'drip-api-v2', name: 'Drip', category: 'CRM & Marketing', description: 'Email marketing automation para e-commerce.', website: 'https://drip.com', logo: '💧', placeholder: 'drip_...', docsUrl: 'https://developer.drip.com' },
  { id: 'convertkit-api-v2', name: 'ConvertKit (Kit)', category: 'CRM & Marketing', description: 'Email marketing para creadores de contenido.', website: 'https://convertkit.com', logo: '📩', placeholder: 'ck_...', docsUrl: 'https://developers.convertkit.com' },
  { id: 'lemlist-api-v2', name: 'Lemlist', category: 'CRM & Marketing', description: 'Cold email y outreach con personalización avanzada.', website: 'https://lemlist.com', logo: '🍋', placeholder: 'lemlist_...', docsUrl: 'https://developer.lemlist.com' },
  { id: 'instantly-api-v2', name: 'Instantly', category: 'CRM & Marketing', description: 'Plataforma de cold email con warmup y analytics.', website: 'https://instantly.ai', logo: '⚡', placeholder: 'instantly_...', docsUrl: 'https://developer.instantly.ai' },

  // Comunicación (más)
  { id: 'messagebird-api', name: 'MessageBird', category: 'Comunicación', description: 'SMS, WhatsApp, voz y chat omnichannel para empresas.', website: 'https://messagebird.com', logo: '🐦', placeholder: 'mb_...', docsUrl: 'https://developers.messagebird.com' },
  { id: 'sendbird-api', name: 'Sendbird', category: 'Comunicación', description: 'Chat in-app, mensajería y llamadas para aplicaciones.', website: 'https://sendbird.com', logo: '💬', placeholder: 'sendbird_...', docsUrl: 'https://sendbird.com/docs' },
  { id: 'stream-chat-api', name: 'Stream Chat', category: 'Comunicación', description: 'SDK de chat y actividad con feeds en tiempo real.', website: 'https://getstream.io', logo: '🌊', placeholder: 'stream_...', docsUrl: 'https://getstream.io/chat/docs' },
  { id: 'telnyx-api', name: 'Telnyx', category: 'Comunicación', description: 'SIP trunking, SMS, voz y verificación por API.', website: 'https://telnyx.com', logo: '📡', placeholder: 'telnyx_...', docsUrl: 'https://developers.telnyx.com' },
  { id: 'bandwidth-api', name: 'Bandwidth', category: 'Comunicación', description: 'APIs de comunicación: voz, SMS y autenticación.', website: 'https://bandwidth.com', logo: '📶', placeholder: 'bw_...', docsUrl: 'https://dev.bandwidth.com' },
  { id: 'infobip-api', name: 'Infobip', category: 'Comunicación', description: 'Omnichannel messaging: SMS, WhatsApp, email, voz.', website: 'https://infobip.com', logo: '📨', placeholder: 'infobip_...', docsUrl: 'https://www.infobip.com/docs/api' },

  // Storage (más)
  { id: 'backblaze-b2-v2', name: 'Backblaze B2', category: 'Storage', description: 'Object storage S3-compatible muy económico.', website: 'https://backblaze.com/b2', logo: '🔴', placeholder: 'b2_...', docsUrl: 'https://www.backblaze.com/docs' },
  { id: 'wasabi-api-v2', name: 'Wasabi', category: 'Storage', description: 'Hot cloud storage sin egress fees ni cargos por API.', website: 'https://wasabi.com', logo: '🟢', placeholder: 'wasabi_...', docsUrl: 'https://docs.wasabi.com' },
  { id: 'minio-api-v2', name: 'MinIO', category: 'Storage', description: 'Object storage open-source compatible con S3.', website: 'https://min.io', logo: '🔶', placeholder: 'minio_...', docsUrl: 'https://min.io/docs/minio/linux/developers/minio-drivers.html' },
  { id: 'imagekit-api', name: 'ImageKit', category: 'Storage', description: 'CDN de imágenes con optimización y transformación en tiempo real.', website: 'https://imagekit.io', logo: '🖼️', placeholder: 'imgkit_...', docsUrl: 'https://docs.imagekit.io' },
  { id: 'bunny-cdn-api', name: 'Bunny CDN', category: 'Storage', description: 'CDN global rápido con storage y stream de video.', website: 'https://bunny.net', logo: '🐰', placeholder: 'bunny_...', docsUrl: 'https://docs.bunny.net' },

  // Base de datos (más)
  { id: 'cockroachdb-api', name: 'CockroachDB', category: 'Base de datos', description: 'SQL distribuido con alta disponibilidad y consistencia.', website: 'https://cockroachlabs.com', logo: '🪳', placeholder: 'crdb_...', docsUrl: 'https://www.cockroachlabs.com/docs' },
  { id: 'fauna-api-v2', name: 'Fauna', category: 'Base de datos', description: 'Base de datos serverless con transacciones ACID globales.', website: 'https://fauna.com', logo: '🦎', placeholder: 'fnAE...', docsUrl: 'https://docs.fauna.com' },
  { id: 'surrealdb-api', name: 'SurrealDB', category: 'Base de datos', description: 'Base de datos multi-modelo: document, graph y relacional.', website: 'https://surrealdb.com', logo: '🟣', placeholder: 'surreal_...', docsUrl: 'https://surrealdb.com/docs' },
  { id: 'xata-api-v2', name: 'Xata', category: 'Base de datos', description: 'Base de datos serverless con búsqueda y analytics.', website: 'https://xata.io', logo: '🐝', placeholder: 'xata_...', docsUrl: 'https://xata.io/docs' },
  { id: 'tigris-api-v2', name: 'Tigris Data', category: 'Base de datos', description: 'Base de datos NoSQL con búsqueda integrada y serverless.', website: 'https://tigrisdata.com', logo: '🐯', placeholder: 'tigris_...', docsUrl: 'https://docs.tigrisdata.com' },

  // Seguridad (más)
  { id: 'crowdstrike-api-v2', name: 'CrowdStrike', category: 'Seguridad', description: 'Endpoint protection y threat intelligence con IA.', website: 'https://crowdstrike.com', logo: '🦅', placeholder: 'cs_...', docsUrl: 'https://developer.crowdstrike.com' },
  { id: 'snyk-api', name: 'Snyk', category: 'Seguridad', description: 'Seguridad para código, dependencias, containers e IaC.', website: 'https://snyk.io', logo: '🛡️', placeholder: 'snyk_...', docsUrl: 'https://docs.snyk.io/snyk-api' },
  { id: 'hashicorp-vault-v2', name: 'HashiCorp Vault', category: 'Seguridad', description: 'Gestión de secretos, encriptación y acceso privilegiado.', website: 'https://vaultproject.io', logo: '🔐', placeholder: 'hvs.', docsUrl: 'https://developer.hashicorp.com/vault/docs' },
  { id: 'doppler-api-v2', name: 'Doppler', category: 'Seguridad', description: 'Gestión de secretos y variables de entorno para equipos.', website: 'https://doppler.com', logo: '🔒', placeholder: 'dp.', docsUrl: 'https://docs.doppler.com' },
  { id: 'threatstack-api', name: 'Threat Stack', category: 'Seguridad', description: 'Detección de intrusiones cloud y cumplimiento normativo.', website: 'https://threatstack.com', logo: '🛡️', placeholder: 'ts_...', docsUrl: 'https://apidocs.threatstack.com' },

  // DevOps (más)
  { id: 'circleci-api-v2', name: 'CircleCI', category: 'DevOps', description: 'CI/CD cloud con pipelines y orbs reutilizables.', website: 'https://circleci.com', logo: '⭕', placeholder: 'cc_...', docsUrl: 'https://circleci.com/docs/api/v2' },
  { id: 'buildkite-api', name: 'Buildkite', category: 'DevOps', description: 'CI/CD híbrido con runners propios y pipelines como código.', website: 'https://buildkite.com', logo: '🟢', placeholder: 'bk_...', docsUrl: 'https://buildkite.com/docs/apis' },
  { id: 'travis-ci-api', name: 'Travis CI', category: 'DevOps', description: 'CI/CD cloud con integración nativa de GitHub.', website: 'https://travis-ci.com', logo: '👷', placeholder: 'travis_...', docsUrl: 'https://developer.travis-ci.com' },
  { id: 'pulumi-api', name: 'Pulumi', category: 'DevOps', description: 'Infrastructure as Code con lenguajes de programación reales.', website: 'https://pulumi.com', logo: '🟧', placeholder: 'pul_...', docsUrl: 'https://www.pulumi.com/docs' },
  { id: 'spacelift-api', name: 'Spacelift', category: 'DevOps', description: 'Gestión de IaC con Terraform, Pulumi y CloudFormation.', website: 'https://spacelift.io', logo: '🚀', placeholder: 'spacelift_...', docsUrl: 'https://docs.spacelift.io' },
  // Analytics (más)
  { id: 'heap-api', name: 'Heap', category: 'Analytics', description: 'Analítica de producto auto-captura sin instrumentación manual.', website: 'https://heap.io', logo: '📊', placeholder: 'heap_...', docsUrl: 'https://developers.heap.io' },
  { id: 'pendo-api', name: 'Pendo', category: 'Analytics', description: 'Product analytics con guías in-app y feedback.', website: 'https://pendo.io', logo: '📐', placeholder: 'pendo_...', docsUrl: 'https://developers.pendo.io' },
  { id: 'fullstory-api-v2', name: 'FullStory', category: 'Analytics', description: 'Session replay y analytics de experiencia digital.', website: 'https://fullstory.com', logo: '🎬', placeholder: 'fs_...', docsUrl: 'https://developer.fullstory.com' },
  { id: 'hotjar-api-v2', name: 'Hotjar', category: 'Analytics', description: 'Heatmaps, recordings y encuestas para entender usuarios.', website: 'https://hotjar.com', logo: '🔥', placeholder: 'hotjar_...', docsUrl: 'https://developer.hotjar.com' },
  { id: 'clarity-api', name: 'Microsoft Clarity', category: 'Analytics', description: 'Analytics gratuito con heatmaps y session recordings.', website: 'https://clarity.microsoft.com', logo: '🔍', placeholder: 'clarity_...', docsUrl: 'https://learn.microsoft.com/en-us/clarity' },
  { id: 'matomo-api', name: 'Matomo', category: 'Analytics', description: 'Web analytics open-source con privacidad GDPR.', website: 'https://matomo.org', logo: '📈', placeholder: 'matomo_...', docsUrl: 'https://developer.matomo.org' },
  { id: 'fathom-api', name: 'Fathom Analytics', category: 'Analytics', description: 'Analytics simple y privado sin cookies ni tracking invasivo.', website: 'https://usefathom.com', logo: '🌊', placeholder: 'fathom_...', docsUrl: 'https://usefathom.com/api' },
  { id: 'pirsch-api', name: 'Pirsch', category: 'Analytics', description: 'Analytics de privacidad con dashboards en tiempo real.', website: 'https://pirsch.io', logo: '🦌', placeholder: 'pirsch_...', docsUrl: 'https://docs.pirsch.io/api-sdks/api' },

  // Productividad (más)
  { id: 'notion-api2', name: 'Notion', category: 'Productividad', description: 'API de workspaces, databases, pages y bloques de Notion.', website: 'https://notion.so', logo: '📓', placeholder: 'ntn_...', docsUrl: 'https://developers.notion.com' },
  { id: 'clickup-api-v2', name: 'ClickUp', category: 'Productividad', description: 'Gestión de proyectos todo-en-uno con tareas y docs.', website: 'https://clickup.com', logo: '🟣', placeholder: 'pk_...', docsUrl: 'https://clickup.com/api' },
  { id: 'monday-api', name: 'Monday.com', category: 'Productividad', description: 'Work OS con tableros visuales y automatizaciones.', website: 'https://monday.com', logo: '🟠', placeholder: 'monday_...', docsUrl: 'https://developer.monday.com' },
  { id: 'basecamp-api-v2', name: 'Basecamp', category: 'Productividad', description: 'Gestión de proyectos con campfires, to-dos y hill charts.', website: 'https://basecamp.com', logo: '⛺', placeholder: 'basecamp_...', docsUrl: 'https://github.com/basecamp/bc3-api' },
  { id: 'todoist-api2', name: 'Todoist', category: 'Productividad', description: 'API de gestión de tareas con proyectos y etiquetas.', website: 'https://todoist.com', logo: '✅', placeholder: 'todoist_...', docsUrl: 'https://developer.todoist.com' },
  { id: 'height-api', name: 'Height', category: 'Productividad', description: 'Gestión de proyectos autónoma con IA integrada.', website: 'https://height.app', logo: '🗻', placeholder: 'height_...', docsUrl: 'https://height.notion.site/API' },
  { id: 'coda-api-v2', name: 'Coda', category: 'Productividad', description: 'Documentos interactivos con tablas, botones y automatizaciones.', website: 'https://coda.io', logo: '📄', placeholder: 'coda_...', docsUrl: 'https://coda.io/developers/apis/v1' },
  { id: 'fibery-api', name: 'Fibery', category: 'Productividad', description: 'Work management conectado con bases de datos relacionales.', website: 'https://fibery.io', logo: '🧩', placeholder: 'fibery_...', docsUrl: 'https://api.fibery.io' },

  // Mapas (más)
  { id: 'here-maps-api', name: 'HERE Maps', category: 'Mapas', description: 'Mapas, geocoding, routing y traffic data global.', website: 'https://developer.here.com', logo: '🗺️', placeholder: 'here_...', docsUrl: 'https://developer.here.com/documentation' },
  { id: 'tomtom-api', name: 'TomTom', category: 'Mapas', description: 'Mapas, navigation, search y traffic APIs.', website: 'https://developer.tomtom.com', logo: '🧭', placeholder: 'tomtom_...', docsUrl: 'https://developer.tomtom.com/knowledgebase' },
  { id: 'openroute-api', name: 'OpenRouteService', category: 'Mapas', description: 'Routing, geocoding e isochrones con OpenStreetMap.', website: 'https://openrouteservice.org', logo: '🛤️', placeholder: 'ors_...', docsUrl: 'https://openrouteservice.org/dev/#/api-docs' },
  { id: 'what3words-api-v2', name: 'what3words', category: 'Mapas', description: 'Direcciones de 3 palabras para cualquier ubicación del mundo.', website: 'https://what3words.com', logo: '///️', placeholder: 'w3w_...', docsUrl: 'https://developer.what3words.com/public-api' },
  { id: 'geoapify-api-v2', name: 'Geoapify', category: 'Mapas', description: 'Geocoding, mapas, routing y datos de lugares.', website: 'https://geoapify.com', logo: '📍', placeholder: 'geoapify_...', docsUrl: 'https://apidocs.geoapify.com' },

  // Auth (más)
  { id: 'stytch-api', name: 'Stytch', category: 'Auth', description: 'Passwordless auth: magic links, OTP, OAuth y biometrics.', website: 'https://stytch.com', logo: '🔑', placeholder: 'stytch_...', docsUrl: 'https://stytch.com/docs' },
  { id: 'descope-api-v2', name: 'Descope', category: 'Auth', description: 'Auth sin código con flujos drag-and-drop y CIAM.', website: 'https://descope.com', logo: '🛂', placeholder: 'descope_...', docsUrl: 'https://docs.descope.com' },
  { id: 'frontegg-api-v2', name: 'Frontegg', category: 'Auth', description: 'User management SaaS: SSO, RBAC, MFA y audit logs.', website: 'https://frontegg.com', logo: '🥚', placeholder: 'frontegg_...', docsUrl: 'https://docs.frontegg.com' },
  { id: 'workos-api', name: 'WorkOS', category: 'Auth', description: 'SSO empresarial, directory sync y admin portal.', website: 'https://workos.com', logo: '🏢', placeholder: 'sk_...', docsUrl: 'https://workos.com/docs' },
  { id: 'propelauth-api-v2', name: 'PropelAuth', category: 'Auth', description: 'Auth B2B con multi-tenancy, roles y organizaciones.', website: 'https://propelauth.com', logo: '🚀', placeholder: 'propel_...', docsUrl: 'https://docs.propelauth.com' },

  // IoT (más)
  { id: 'particle-api', name: 'Particle', category: 'IoT', description: 'Plataforma IoT con hardware, cloud y device management.', website: 'https://particle.io', logo: '💡', placeholder: 'particle_...', docsUrl: 'https://docs.particle.io/reference/cloud-apis/api' },
  { id: 'balena-api-v2', name: 'Balena', category: 'IoT', description: 'Deploy y gestión de flotas de dispositivos IoT con containers.', website: 'https://balena.io', logo: '🐳', placeholder: 'balena_...', docsUrl: 'https://www.balena.io/docs/reference/api/overview' },
  { id: 'thingsboard-api', name: 'ThingsBoard', category: 'IoT', description: 'Plataforma IoT open-source con dashboard y reglas.', website: 'https://thingsboard.io', logo: '📟', placeholder: 'tb_...', docsUrl: 'https://thingsboard.io/docs/api' },
  { id: 'tuya-api', name: 'Tuya', category: 'IoT', description: 'Plataforma IoT para smart home y dispositivos conectados.', website: 'https://developer.tuya.com', logo: '🏠', placeholder: 'tuya_...', docsUrl: 'https://developer.tuya.com/en/docs' },
  { id: 'blynk-api', name: 'Blynk', category: 'IoT', description: 'Plataforma IoT no-code para prototipos y productos.', website: 'https://blynk.io', logo: '⚡', placeholder: 'blynk_...', docsUrl: 'https://docs.blynk.io' },

  // Fintech (más)
  { id: 'plaid-api2', name: 'Plaid', category: 'Fintech', description: 'Conexión bancaria: cuentas, transacciones y verificación.', website: 'https://plaid.com', logo: '🏛️', placeholder: 'access-...', docsUrl: 'https://plaid.com/docs' },
  { id: 'tink-api', name: 'Tink', category: 'Fintech', description: 'Open banking europeo: aggregación y pagos.', website: 'https://tink.com', logo: '🔗', placeholder: 'tink_...', docsUrl: 'https://docs.tink.com' },
  { id: 'yapily-api-v2', name: 'Yapily', category: 'Fintech', description: 'Open banking API para conexión con bancos europeos.', website: 'https://yapily.com', logo: '🏦', placeholder: 'yapily_...', docsUrl: 'https://docs.yapily.com' },
  { id: 'belvo-api-v2', name: 'Belvo', category: 'Fintech', description: 'Open finance para Latinoamérica: datos bancarios y fiscales.', website: 'https://belvo.com', logo: '🦜', placeholder: 'belvo_...', docsUrl: 'https://developers.belvo.com' },
  { id: 'synapse-api-v2', name: 'Synapse', category: 'Fintech', description: 'Banking-as-a-service: cuentas, tarjetas y transferencias.', website: 'https://synapsefi.com', logo: '💳', placeholder: 'synapse_...', docsUrl: 'https://docs.synapsefi.com' },
  { id: 'unit-api-v2', name: 'Unit', category: 'Fintech', description: 'Embedded banking: cuentas, tarjetas, pagos y lending.', website: 'https://unit.co', logo: '🏧', placeholder: 'unit_...', docsUrl: 'https://docs.unit.co' },
  // Blockchain (más)
  { id: 'alchemy-api2', name: 'Alchemy', category: 'Blockchain', description: 'Infraestructura Web3: nodos, NFTs, webhooks y account kit.', website: 'https://alchemy.com', logo: '⚗️', placeholder: 'alchemy_...', docsUrl: 'https://docs.alchemy.com' },
  { id: 'quicknode-api', name: 'QuickNode', category: 'Blockchain', description: 'Nodos blockchain multi-chain con APIs y analytics.', website: 'https://quicknode.com', logo: '⚡', placeholder: 'qn_...', docsUrl: 'https://www.quicknode.com/docs' },
  { id: 'thirdweb-api', name: 'Thirdweb', category: 'Blockchain', description: 'SDK Web3 para smart contracts, wallets y pagos crypto.', website: 'https://thirdweb.com', logo: '🔮', placeholder: 'thirdweb_...', docsUrl: 'https://portal.thirdweb.com' },
  { id: 'crossmint-api', name: 'Crossmint', category: 'Blockchain', description: 'NFT APIs para minting, wallets y pagos con tarjeta.', website: 'https://crossmint.com', logo: '🍃', placeholder: 'crossmint_...', docsUrl: 'https://docs.crossmint.com' },
  { id: 'circle-api', name: 'Circle', category: 'Blockchain', description: 'APIs de USDC: pagos, payouts y wallets programmables.', website: 'https://circle.com', logo: '⭕', placeholder: 'circle_...', docsUrl: 'https://developers.circle.com' },

  // Testing (más)
  { id: 'browserstack-api2', name: 'BrowserStack', category: 'Testing', description: 'Testing cross-browser en dispositivos reales en la nube.', website: 'https://browserstack.com', logo: '🌐', placeholder: 'bs_...', docsUrl: 'https://www.browserstack.com/docs' },
  { id: 'saucelabs-api', name: 'Sauce Labs', category: 'Testing', description: 'Testing automatizado en miles de browsers y dispositivos.', website: 'https://saucelabs.com', logo: '🍝', placeholder: 'sauce_...', docsUrl: 'https://docs.saucelabs.com' },
  { id: 'lambdatest-api', name: 'LambdaTest', category: 'Testing', description: 'Cloud testing con Selenium, Cypress y Playwright.', website: 'https://lambdatest.com', logo: '🧪', placeholder: 'lt_...', docsUrl: 'https://www.lambdatest.com/support/docs/api-doc' },
  { id: 'checkly-api-v2', name: 'Checkly', category: 'Testing', description: 'Monitoring y testing de APIs y browser checks.', website: 'https://checklyhq.com', logo: '✅', placeholder: 'cu_...', docsUrl: 'https://www.checklyhq.com/docs/api-checks' },
  { id: 'k6-cloud-api', name: 'k6 Cloud', category: 'Testing', description: 'Load testing en la nube con scripts de k6.', website: 'https://k6.io', logo: '📊', placeholder: 'k6_...', docsUrl: 'https://k6.io/docs/cloud' },

  // Search (más)
  { id: 'typesense-api', name: 'Typesense', category: 'Search', description: 'Motor de búsqueda open-source rápido y typo-tolerant.', website: 'https://typesense.org', logo: '🔎', placeholder: 'typesense_...', docsUrl: 'https://typesense.org/docs' },
  { id: 'meilisearch-api2', name: 'Meilisearch', category: 'Search', description: 'Motor de búsqueda open-source con relevancia instantánea.', website: 'https://meilisearch.com', logo: '🔍', placeholder: 'meili_...', docsUrl: 'https://www.meilisearch.com/docs' },
  { id: 'orama-api-v2', name: 'Orama', category: 'Search', description: 'Search engine full-text en el edge con AI integration.', website: 'https://orama.com', logo: '🔮', placeholder: 'orama_...', docsUrl: 'https://docs.orama.com' },
  { id: 'elastic-cloud-api', name: 'Elastic Cloud', category: 'Search', description: 'Elasticsearch y Kibana gestionados en la nube.', website: 'https://elastic.co/cloud', logo: '🟡', placeholder: 'elastic_...', docsUrl: 'https://www.elastic.co/guide/en/cloud/current' },
  { id: 'pinecone-api2', name: 'Pinecone', category: 'Search', description: 'Base de datos vectorial para búsqueda semántica con IA.', website: 'https://pinecone.io', logo: '🌲', placeholder: 'pcn_...', docsUrl: 'https://docs.pinecone.io' },

  // Logistics (más)
  { id: 'shippo-api-v2', name: 'Shippo', category: 'Logistics', description: 'API de envío multi-carrier con tracking y labels.', website: 'https://goshippo.com', logo: '📦', placeholder: 'shippo_...', docsUrl: 'https://goshippo.com/docs' },
  { id: 'easypost-api2', name: 'EasyPost', category: 'Logistics', description: 'API de envío para etiquetas, tracking y verificación.', website: 'https://easypost.com', logo: '📮', placeholder: 'EZA...', docsUrl: 'https://www.easypost.com/docs/api' },
  { id: 'shipengine-api-v2', name: 'ShipEngine', category: 'Logistics', description: 'API de shipping con rates, labels y tracking.', website: 'https://shipengine.com', logo: '🚢', placeholder: 'se_...', docsUrl: 'https://www.shipengine.com/docs' },
  { id: 'fleetio-api', name: 'Fleetio', category: 'Logistics', description: 'Gestión de flotas de vehículos con mantenimiento y fuel.', website: 'https://fleetio.com', logo: '🚚', placeholder: 'fleetio_...', docsUrl: 'https://developer.fleetio.com' },
  { id: 'onfleet-api', name: 'Onfleet', category: 'Logistics', description: 'Gestión de delivery con optimización de rutas y tracking.', website: 'https://onfleet.com', logo: '🗓️', placeholder: 'onfleet_...', docsUrl: 'https://docs.onfleet.com' },

  // Healthcare (más)
  { id: 'healthgorilla-api', name: 'Health Gorilla', category: 'Healthcare', description: 'Interoperabilidad médica: labs, prescriptions y records.', website: 'https://healthgorilla.com', logo: '🦍', placeholder: 'hg_...', docsUrl: 'https://developer.healthgorilla.com' },
  { id: 'canvas-medical', name: 'Canvas Medical', category: 'Healthcare', description: 'EHR programmable para clínicas con API-first.', website: 'https://canvasmedical.com', logo: '🏥', placeholder: 'canvas_...', docsUrl: 'https://docs.canvasmedical.com' },
  { id: 'redox-api-v2', name: 'Redox', category: 'Healthcare', description: 'Integración EHR universal con HL7 FHIR y API unificada.', website: 'https://redoxengine.com', logo: '🔴', placeholder: 'redox_...', docsUrl: 'https://developer.redoxengine.com' },
  { id: 'elation-api-v2', name: 'Elation Health', category: 'Healthcare', description: 'EHR para atención primaria con API clínica completa.', website: 'https://elationhealth.com', logo: '💊', placeholder: 'elation_...', docsUrl: 'https://developer.elationhealth.com' },
  { id: 'truepill-api', name: 'Truepill', category: 'Healthcare', description: 'Pharmacy-as-a-service: prescripciones, dispensing y delivery.', website: 'https://truepill.com', logo: '💉', placeholder: 'truepill_...', docsUrl: 'https://docs.truepill.com' },

  // Education (más)
  { id: 'canvas-lms-api-v2', name: 'Canvas LMS', category: 'Education', description: 'Learning management system con API REST completa.', website: 'https://instructure.com', logo: '🎓', placeholder: 'canvas_lms_...', docsUrl: 'https://canvas.instructure.com/doc/api' },
  { id: 'moodle-api', name: 'Moodle', category: 'Education', description: 'LMS open-source con web services y plugins.', website: 'https://moodle.org', logo: '📚', placeholder: 'moodle_...', docsUrl: 'https://docs.moodle.org/dev/Web_services' },
  { id: 'teachable-api-v2', name: 'Teachable', category: 'Education', description: 'Plataforma de cursos online con API de estudiantes y ventas.', website: 'https://teachable.com', logo: '📖', placeholder: 'teachable_...', docsUrl: 'https://docs.teachable.com' },
  { id: 'thinkific-api-v2', name: 'Thinkific', category: 'Education', description: 'Crea y vende cursos online con tu marca.', website: 'https://thinkific.com', logo: '🎓', placeholder: 'thinkific_...', docsUrl: 'https://developers.thinkific.com' },
  { id: 'edx-api', name: 'edX', category: 'Education', description: 'Plataforma MOOC con API de cursos y certificaciones.', website: 'https://edx.org', logo: '🏛️', placeholder: 'edx_...', docsUrl: 'https://course-catalog-api-guide.readthedocs.io' },

  // Legal (más)
  { id: 'ironclad-api', name: 'Ironclad', category: 'Legal', description: 'CLM: gestión de contratos con workflows y firma.', website: 'https://ironcladapp.com', logo: '⚔️', placeholder: 'ironclad_...', docsUrl: 'https://developer.ironcladapp.com' },
  { id: 'juro-api-v2', name: 'Juro', category: 'Legal', description: 'Contratos inteligentes con negociación y firma integrada.', website: 'https://juro.com', logo: '📜', placeholder: 'juro_...', docsUrl: 'https://docs.juro.com/api' },
  { id: 'clio-api', name: 'Clio', category: 'Legal', description: 'Software de gestión para bufetes: casos, tiempo y facturación.', website: 'https://clio.com', logo: '⚖️', placeholder: 'clio_...', docsUrl: 'https://app.clio.com/api/v4/documentation' },
  { id: 'legalzoom-api-v2', name: 'LegalZoom', category: 'Legal', description: 'Servicios legales online para empresas y particulares.', website: 'https://legalzoom.com', logo: '🏛️', placeholder: 'lz_...', docsUrl: 'https://developers.legalzoom.com' },
  { id: 'clausebase-api', name: 'ClauseBase', category: 'Legal', description: 'Automatización de documentos legales con cláusulas inteligentes.', website: 'https://clausebase.com', logo: '📋', placeholder: 'clausebase_...', docsUrl: 'https://help.clausebase.com/api' },

  // HR (más)
  { id: 'personio-api', name: 'Personio', category: 'HR', description: 'Software HR europeo: nóminas, ausencias y recruiting.', website: 'https://personio.com', logo: '👥', placeholder: 'personio_...', docsUrl: 'https://developer.personio.de' },
  { id: 'bamboohr-api2', name: 'BambooHR', category: 'HR', description: 'HRIS para PYMEs: empleados, onboarding y time-off.', website: 'https://bamboohr.com', logo: '🎋', placeholder: 'bamboo_...', docsUrl: 'https://documentation.bamboohr.com/reference' },
  { id: 'deel-api', name: 'Deel', category: 'HR', description: 'Contratación y pagos globales para equipos remotos.', website: 'https://deel.com', logo: '🌐', placeholder: 'deel_...', docsUrl: 'https://developer.deel.com' },
  { id: 'remote-api', name: 'Remote.com', category: 'HR', description: 'Employer of record global: nóminas, beneficios y compliance.', website: 'https://remote.com', logo: '🌏', placeholder: 'remote_...', docsUrl: 'https://remote.com/resources/api' },
  { id: 'greenhouse-api', name: 'Greenhouse', category: 'HR', description: 'ATS para recruiting: candidatos, entrevistas y ofertas.', website: 'https://greenhouse.io', logo: '🌿', placeholder: 'greenhouse_...', docsUrl: 'https://developers.greenhouse.io' },
  { id: 'lever-api', name: 'Lever', category: 'HR', description: 'ATS y CRM para recruiting con analytics avanzado.', website: 'https://lever.co', logo: '🔧', placeholder: 'lever_...', docsUrl: 'https://hire.lever.co/developer/documentation' },
  // Real Estate (más)
  { id: 'zillow-api2', name: 'Zillow', category: 'Real Estate', description: 'Datos inmobiliarios de EE.UU.: precios, valuaciones y listados.', website: 'https://zillow.com', logo: '🏠', placeholder: 'zillow_...', docsUrl: 'https://www.zillow.com/howto/api/APIOverview.htm' },
  { id: 'realtor-api', name: 'Realtor.com', category: 'Real Estate', description: 'Listados de propiedades y datos del mercado inmobiliario.', website: 'https://realtor.com', logo: '🏡', placeholder: 'realtor_...', docsUrl: 'https://rapidapi.com/apidojo/api/realtor' },
  { id: 'idealista-api-v2', name: 'Idealista', category: 'Real Estate', description: 'Portal inmobiliario líder en España, Italia y Portugal.', website: 'https://idealista.com', logo: '🏘️', placeholder: 'idealista_...', docsUrl: 'https://developers.idealista.com' },
  { id: 'rentcast-api', name: 'RentCast', category: 'Real Estate', description: 'Datos de alquileres: estimaciones de renta y análisis.', website: 'https://rentcast.io', logo: '🔑', placeholder: 'rentcast_...', docsUrl: 'https://developers.rentcast.io' },
  { id: 'attom-api', name: 'ATTOM', category: 'Real Estate', description: 'Big data inmobiliario: propiedades, ventas y demographics.', website: 'https://attomdata.com', logo: '🗂️', placeholder: 'attom_...', docsUrl: 'https://api.gateway.attomdata.com/propertyapi' },

  // Food & Delivery (más)
  { id: 'uber-eats-api', name: 'Uber Eats', category: 'Food & Delivery', description: 'API de delivery: pedidos, menús y tracking en tiempo real.', website: 'https://developer.uber.com', logo: '🍔', placeholder: 'uber_...', docsUrl: 'https://developer.uber.com/docs/eats' },
  { id: 'doordash-api', name: 'DoorDash', category: 'Food & Delivery', description: 'Drive API para delivery on-demand de tu negocio.', website: 'https://doordash.com', logo: '🚗', placeholder: 'doordash_...', docsUrl: 'https://developer.doordash.com' },
  { id: 'glovo-api', name: 'Glovo', category: 'Food & Delivery', description: 'API de delivery multi-categoría en Europa y LATAM.', website: 'https://glovoapp.com', logo: '🟡', placeholder: 'glovo_...', docsUrl: 'https://developers.glovoapp.com' },
  { id: 'spoonacular-api2', name: 'Spoonacular', category: 'Food & Delivery', description: 'API de recetas, nutrición e ingredientes alimenticios.', website: 'https://spoonacular.com', logo: '🥄', placeholder: 'spoon_...', docsUrl: 'https://spoonacular.com/food-api/docs' },
  { id: 'yelp-fusion-api', name: 'Yelp Fusion', category: 'Food & Delivery', description: 'Buscar negocios locales: restaurantes, ratings y reviews.', website: 'https://yelp.com/developers', logo: '⭐', placeholder: 'yelp_...', docsUrl: 'https://docs.developer.yelp.com' },

  // Travel (más)
  { id: 'booking-api', name: 'Booking.com', category: 'Travel', description: 'API de alojamiento: hoteles, apartamentos y disponibilidad.', website: 'https://booking.com', logo: '🏨', placeholder: 'booking_...', docsUrl: 'https://developers.booking.com' },
  { id: 'skyscanner-api', name: 'Skyscanner', category: 'Travel', description: 'Búsqueda de vuelos, hoteles y coches de alquiler.', website: 'https://skyscanner.com', logo: '✈️', placeholder: 'sky_...', docsUrl: 'https://developers.skyscanner.net' },
  { id: 'tripadvisor-api', name: 'TripAdvisor', category: 'Travel', description: 'Reviews, fotos y datos de atracciones turísticas globales.', website: 'https://tripadvisor.com', logo: '🦉', placeholder: 'tripadvisor_...', docsUrl: 'https://developer-tripadvisor.com' },
  { id: 'kiwi-api-v2', name: 'Kiwi.com', category: 'Travel', description: 'Meta-buscador de vuelos con combinaciones inteligentes.', website: 'https://kiwi.com', logo: '🥝', placeholder: 'kiwi_...', docsUrl: 'https://docs.kiwi.com' },
  { id: 'kayak-api-v2', name: 'KAYAK', category: 'Travel', description: 'Comparador de vuelos, hoteles y alquiler de coches.', website: 'https://kayak.com', logo: '🛶', placeholder: 'kayak_...', docsUrl: 'https://developer.kayak.com' },

  // Gaming (más)
  { id: 'unity-api-v2', name: 'Unity Services', category: 'Gaming', description: 'Cloud services para juegos: analytics, multiplayer y ads.', website: 'https://unity.com', logo: '🎮', placeholder: 'unity_...', docsUrl: 'https://docs.unity.com/ugs' },
  { id: 'playfab-api', name: 'PlayFab (Microsoft)', category: 'Gaming', description: 'Backend para juegos: players, leaderboards y economy.', website: 'https://playfab.com', logo: '🎲', placeholder: 'playfab_...', docsUrl: 'https://learn.microsoft.com/en-us/gaming/playfab' },
  { id: 'photon-api', name: 'Photon Engine', category: 'Gaming', description: 'Multiplayer en tiempo real para juegos y apps.', website: 'https://photonengine.com', logo: '💫', placeholder: 'photon_...', docsUrl: 'https://doc.photonengine.com' },
  { id: 'nakama-api', name: 'Nakama', category: 'Gaming', description: 'Game server open-source: auth, matchmaking y leaderboards.', website: 'https://heroiclabs.com', logo: '🏰', placeholder: 'nakama_...', docsUrl: 'https://heroiclabs.com/docs/nakama' },
  { id: 'lootlocker-api', name: 'LootLocker', category: 'Gaming', description: 'Backend para juegos cross-platform: inventario y IAP.', website: 'https://lootlocker.com', logo: '🗝️', placeholder: 'loot_...', docsUrl: 'https://docs.lootlocker.com' },

  // Government (más)
  { id: 'usps-api', name: 'USPS', category: 'Government', description: 'Correo postal de EE.UU.: tracking, address validation y precios.', website: 'https://usps.com', logo: '📫', placeholder: 'usps_...', docsUrl: 'https://www.usps.com/business/web-tools-apis' },
  { id: 'datos-gob-es-v2', name: 'Datos.gob.es', category: 'Government', description: 'Portal de datos abiertos del gobierno de España.', website: 'https://datos.gob.es', logo: '🇪🇸', placeholder: 'datos_gob_...', docsUrl: 'https://datos.gob.es/es/apidata' },
  { id: 'eu-open-data', name: 'EU Open Data', category: 'Government', description: 'Portal de datos abiertos de la Unión Europea.', website: 'https://data.europa.eu', logo: '🇪🇺', placeholder: 'eudata_...', docsUrl: 'https://data.europa.eu/en/about/api' },
  { id: 'census-api', name: 'US Census', category: 'Government', description: 'Datos demográficos y económicos del censo de EE.UU.', website: 'https://census.gov', logo: '📊', placeholder: 'census_...', docsUrl: 'https://www.census.gov/data/developers.html' },

  // Weather (más)
  { id: 'tomorrow-api', name: 'Tomorrow.io', category: 'Weather', description: 'API meteorológica con datos hiper-locales y alertas.', website: 'https://tomorrow.io', logo: '⛈️', placeholder: 'tomorrow_...', docsUrl: 'https://docs.tomorrow.io' },
  { id: 'visual-crossing-api', name: 'Visual Crossing', category: 'Weather', description: 'Datos meteorológicos históricos y pronósticos globales.', website: 'https://visualcrossing.com', logo: '🌤️', placeholder: 'vc_...', docsUrl: 'https://www.visualcrossing.com/resources/documentation' },
  { id: 'weatherbit-api', name: 'Weatherbit', category: 'Weather', description: 'Pronósticos, datos actuales e históricos meteorológicos.', website: 'https://weatherbit.io', logo: '🌦️', placeholder: 'weatherbit_...', docsUrl: 'https://www.weatherbit.io/api' },
  { id: 'climacell-api-v2', name: 'ClimaCell', category: 'Weather', description: 'Micro-weather API con datos a nivel de calle.', website: 'https://tomorrow.io', logo: '🌡️', placeholder: 'climacell_...', docsUrl: 'https://docs.tomorrow.io' },

  // SMS (más)
  { id: 'sinch-api', name: 'Sinch', category: 'SMS', description: 'SMS, voz, video y verificación omnichannel.', website: 'https://sinch.com', logo: '📲', placeholder: 'sinch_...', docsUrl: 'https://developers.sinch.com' },
  { id: 'plivo-api2', name: 'Plivo', category: 'SMS', description: 'SMS y voz cloud para empresas con cobertura global.', website: 'https://plivo.com', logo: '📱', placeholder: 'plivo_...', docsUrl: 'https://www.plivo.com/docs' },
  { id: 'textmagic-api-v2', name: 'TextMagic', category: 'SMS', description: 'SMS marketing y notificaciones para empresas.', website: 'https://textmagic.com', logo: '✨', placeholder: 'textmagic_...', docsUrl: 'https://www.textmagic.com/docs/api' },
  { id: 'clicksend-api', name: 'ClickSend', category: 'SMS', description: 'SMS, MMS, email, voz y correo postal por API.', website: 'https://clicksend.com', logo: '📨', placeholder: 'clicksend_...', docsUrl: 'https://developers.clicksend.com' },

  // Video (más)
  { id: 'mux-api2', name: 'Mux', category: 'Video', description: 'Infraestructura de video: streaming, encoding y analytics.', website: 'https://mux.com', logo: '🎬', placeholder: 'mux_...', docsUrl: 'https://docs.mux.com' },
  { id: 'cloudflare-stream-v2', name: 'Cloudflare Stream', category: 'Video', description: 'Video hosting y streaming con CDN global de Cloudflare.', website: 'https://cloudflare.com/products/stream', logo: '📹', placeholder: 'cf_stream_...', docsUrl: 'https://developers.cloudflare.com/stream' },
  { id: 'api-video-v2', name: 'api.video', category: 'Video', description: 'API de video: upload, transcoding, live y player.', website: 'https://api.video', logo: '🎥', placeholder: 'apivideo_...', docsUrl: 'https://docs.api.video' },
  { id: 'wistia-api-v2', name: 'Wistia', category: 'Video', description: 'Video hosting para marketing con analytics y SEO.', website: 'https://wistia.com', logo: '📽️', placeholder: 'wistia_...', docsUrl: 'https://wistia.com/support/developers' },
  { id: 'loom-api', name: 'Loom', category: 'Video', description: 'Grabación de pantalla y video messaging con API.', website: 'https://loom.com', logo: '🎞️', placeholder: 'loom_...', docsUrl: 'https://dev.loom.com' },

  // DNS & Domain (más)
  { id: 'godaddy-api-v2', name: 'GoDaddy', category: 'DNS & Domain', description: 'Registro de dominios, DNS y hosting web.', website: 'https://godaddy.com', logo: '🌐', placeholder: 'godaddy_...', docsUrl: 'https://developer.godaddy.com' },
  { id: 'namecheap-api', name: 'Namecheap', category: 'DNS & Domain', description: 'Dominios, SSL y DNS con API de gestión.', website: 'https://namecheap.com', logo: '💻', placeholder: 'namecheap_...', docsUrl: 'https://www.namecheap.com/support/api' },
  { id: 'dnsimple-api', name: 'DNSimple', category: 'DNS & Domain', description: 'DNS hosting y registro de dominios con API REST.', website: 'https://dnsimple.com', logo: '🔗', placeholder: 'dnsimple_...', docsUrl: 'https://developer.dnsimple.com' },
  { id: 'route53-api-v2', name: 'Route 53 (AWS)', category: 'DNS & Domain', description: 'DNS de AWS con routing inteligente y health checks.', website: 'https://aws.amazon.com/route53', logo: '☁️', placeholder: 'route53_...', docsUrl: 'https://docs.aws.amazon.com/Route53/latest/APIReference' },
  // Design (más)
  { id: 'canva-api', name: 'Canva', category: 'Design', description: 'Plataforma de diseño con API de templates y exports.', website: 'https://canva.com', logo: '🎨', placeholder: 'canva_...', docsUrl: 'https://www.canva.dev/docs' },
  { id: 'figma-api2', name: 'Figma', category: 'Design', description: 'API de diseño: archivos, componentes y variables.', website: 'https://figma.com', logo: '🖌️', placeholder: 'figma_...', docsUrl: 'https://www.figma.com/developers/api' },
  { id: 'adobe-api', name: 'Adobe Creative Cloud', category: 'Design', description: 'APIs de Photoshop, Lightroom e Illustrator en la nube.', website: 'https://developer.adobe.com', logo: '🅰️', placeholder: 'adobe_...', docsUrl: 'https://developer.adobe.com/apis' },
  { id: 'pexels-api-v2', name: 'Pexels', category: 'Design', description: 'API de fotos y videos stock gratuitos de alta calidad.', website: 'https://pexels.com', logo: '📷', placeholder: 'pexels_...', docsUrl: 'https://www.pexels.com/api/documentation' },
  { id: 'unsplash-api2', name: 'Unsplash', category: 'Design', description: 'API de fotos de alta resolución libres de derechos.', website: 'https://unsplash.com', logo: '📸', placeholder: 'unsplash_...', docsUrl: 'https://unsplash.com/documentation' },

  // Accounting (más)
  { id: 'quickbooks-api2', name: 'QuickBooks', category: 'Accounting', description: 'Software contable: facturas, gastos y reporting.', website: 'https://quickbooks.intuit.com', logo: '📒', placeholder: 'qb_...', docsUrl: 'https://developer.intuit.com/app/developer/qbo/docs' },
  { id: 'xero-api2', name: 'Xero', category: 'Accounting', description: 'Contabilidad cloud: facturas, pagos y bank feeds.', website: 'https://xero.com', logo: '💙', placeholder: 'xero_...', docsUrl: 'https://developer.xero.com/documentation' },
  { id: 'freshbooks-api-v2', name: 'FreshBooks', category: 'Accounting', description: 'Facturación y contabilidad para freelancers y PYMEs.', website: 'https://freshbooks.com', logo: '📗', placeholder: 'freshbooks_...', docsUrl: 'https://www.freshbooks.com/api' },
  { id: 'holded-api-v2', name: 'Holded', category: 'Accounting', description: 'ERP y contabilidad para PYMEs españolas con facturación.', website: 'https://holded.com', logo: '📊', placeholder: 'holded_...', docsUrl: 'https://developers.holded.com' },
  { id: 'sage-api-v2', name: 'Sage', category: 'Accounting', description: 'Software de contabilidad empresarial con API REST.', website: 'https://sage.com', logo: '🌿', placeholder: 'sage_...', docsUrl: 'https://developer.sage.com' },

  // Customer Support (más)
  { id: 'zendesk-api2', name: 'Zendesk', category: 'Customer Support', description: 'Help desk y soporte al cliente omnichannel.', website: 'https://zendesk.com', logo: '🎫', placeholder: 'zendesk_...', docsUrl: 'https://developer.zendesk.com' },
  { id: 'freshdesk-api2', name: 'Freshdesk', category: 'Customer Support', description: 'Help desk con tickets, automatización y base de conocimiento.', website: 'https://freshdesk.com', logo: '🆘', placeholder: 'freshdesk_...', docsUrl: 'https://developers.freshdesk.com' },
  { id: 'helpscout-api-v2', name: 'Help Scout', category: 'Customer Support', description: 'Help desk humano con mailbox compartido y docs.', website: 'https://helpscout.com', logo: '🦮', placeholder: 'helpscout_...', docsUrl: 'https://developer.helpscout.com' },
  { id: 'front-api-v2', name: 'Front', category: 'Customer Support', description: 'Inbox compartido para equipos con workflows y analytics.', website: 'https://front.com', logo: '📥', placeholder: 'front_...', docsUrl: 'https://dev.frontapp.com' },
  { id: 'kayako-api-v2', name: 'Kayako', category: 'Customer Support', description: 'Customer service con live chat, tickets y self-service.', website: 'https://kayako.com', logo: '🛟', placeholder: 'kayako_...', docsUrl: 'https://developer.kayako.com' },

  // Monitoring (más)
  { id: 'grafana-api', name: 'Grafana Cloud', category: 'Monitoring', description: 'Dashboards, alertas y observabilidad con Prometheus y Loki.', website: 'https://grafana.com', logo: '📊', placeholder: 'grafana_...', docsUrl: 'https://grafana.com/docs/grafana-cloud/api-reference' },
  { id: 'prometheus-api-v2', name: 'Prometheus', category: 'Monitoring', description: 'Monitoring open-source con métricas y alertas.', website: 'https://prometheus.io', logo: '🔥', placeholder: 'prom_...', docsUrl: 'https://prometheus.io/docs/prometheus/latest/querying/api' },
  { id: 'pagerduty-api2', name: 'PagerDuty', category: 'Monitoring', description: 'Gestión de incidentes y on-call scheduling.', website: 'https://pagerduty.com', logo: '🚨', placeholder: 'pagerduty_...', docsUrl: 'https://developer.pagerduty.com' },
  { id: 'opsgenie-api2', name: 'OpsGenie', category: 'Monitoring', description: 'Alertas y gestión de incidentes de Atlassian.', website: 'https://opsgenie.com', logo: '🔔', placeholder: 'opsgenie_...', docsUrl: 'https://docs.opsgenie.com/docs/api-overview' },
  { id: 'uptime-robot-api', name: 'UptimeRobot', category: 'Monitoring', description: 'Monitoreo de uptime y status pages gratuito.', website: 'https://uptimerobot.com', logo: '🤖', placeholder: 'ur_...', docsUrl: 'https://uptimerobot.com/api' },

  // Translation (más)
  { id: 'lokalise-api-v2', name: 'Lokalise', category: 'Translation', description: 'Plataforma de localización para apps y sitios web.', website: 'https://lokalise.com', logo: '🌍', placeholder: 'lokalise_...', docsUrl: 'https://developers.lokalise.com' },
  { id: 'crowdin-api-v2', name: 'Crowdin', category: 'Translation', description: 'Gestión de traducciones colaborativa con integraciones.', website: 'https://crowdin.com', logo: '🔠', placeholder: 'crowdin_...', docsUrl: 'https://developer.crowdin.com' },
  { id: 'phrase-api-v2', name: 'Phrase (Memsource)', category: 'Translation', description: 'TMS empresarial con traducción asistida por IA.', website: 'https://phrase.com', logo: '💬', placeholder: 'phrase_...', docsUrl: 'https://developers.phrase.com' },
  { id: 'transifex-api-v2', name: 'Transifex', category: 'Translation', description: 'Plataforma de localización para software y contenido.', website: 'https://transifex.com', logo: '🌐', placeholder: 'transifex_...', docsUrl: 'https://developers.transifex.com' },
  { id: 'smartling-api-v2', name: 'Smartling', category: 'Translation', description: 'Traducción empresarial con workflows y memoria de traducción.', website: 'https://smartling.com', logo: '📖', placeholder: 'smartling_...', docsUrl: 'https://api-reference.smartling.com' },

  // Forms (más)
  { id: 'typeform-api2', name: 'Typeform', category: 'Forms', description: 'Formularios interactivos con lógica condicional y diseño.', website: 'https://typeform.com', logo: '📝', placeholder: 'typeform_...', docsUrl: 'https://developer.typeform.com' },
  { id: 'jotform-api-v2', name: 'JotForm', category: 'Forms', description: 'Constructor de formularios con plantillas y widgets.', website: 'https://jotform.com', logo: '📋', placeholder: 'jotform_...', docsUrl: 'https://api.jotform.com/docs' },
  { id: 'tally-api', name: 'Tally', category: 'Forms', description: 'Formularios simples y gratuitos tipo Notion.', website: 'https://tally.so', logo: '📊', placeholder: 'tally_...', docsUrl: 'https://tally.so/help/webhooks' },
  { id: 'paperform-api-v2', name: 'Paperform', category: 'Forms', description: 'Formularios con pagos, booking y ecommerce integrado.', website: 'https://paperform.co', logo: '📄', placeholder: 'paperform_...', docsUrl: 'https://paperform.co/help/articles/developer-api' },

  // Events (más)
  { id: 'eventbrite-api2', name: 'Eventbrite', category: 'Events', description: 'Gestión de eventos: venta de entradas y promoción.', website: 'https://eventbrite.com', logo: '🎪', placeholder: 'eventbrite_...', docsUrl: 'https://www.eventbrite.com/platform/api' },
  { id: 'luma-api-v2', name: 'Luma', category: 'Events', description: 'Eventos online y presenciales con registro y streaming.', website: 'https://lu.ma', logo: '✨', placeholder: 'luma_...', docsUrl: 'https://docs.lu.ma/reference' },
  { id: 'meetup-api-v2', name: 'Meetup', category: 'Events', description: 'API de grupos y eventos locales de Meetup.', website: 'https://meetup.com', logo: '🤝', placeholder: 'meetup_...', docsUrl: 'https://www.meetup.com/api' },
  { id: 'splash-api', name: 'Splash', category: 'Events', description: 'Plataforma de eventos corporativos y experiencias.', website: 'https://splashthat.com', logo: '💦', placeholder: 'splash_...', docsUrl: 'https://developer.splashthat.com' },

  // Automotive (más)
  { id: 'smartcar-api2', name: 'Smartcar', category: 'Automotive', description: 'API para leer datos de vehículos conectados multi-marca.', website: 'https://smartcar.com', logo: '🚙', placeholder: 'smartcar_...', docsUrl: 'https://smartcar.com/docs' },
  { id: 'otonomo-api', name: 'Otonomo', category: 'Automotive', description: 'Datos de vehículos conectados y movilidad.', website: 'https://otonomo.io', logo: '🚗', placeholder: 'otonomo_...', docsUrl: 'https://developer.otonomo.io' },
  { id: 'carmd-api-v2', name: 'CarMD', category: 'Automotive', description: 'Diagnóstico de vehículos OBD-II y datos técnicos.', website: 'https://carmd.com', logo: '🔧', placeholder: 'carmd_...', docsUrl: 'https://api.carmd.com/member/docs' },
  { id: 'vin-decoder-api', name: 'VIN Decoder', category: 'Automotive', description: 'Decodificación de número de bastidor (VIN) de vehículos.', website: 'https://vpic.nhtsa.dot.gov', logo: '🏷️', placeholder: 'vin_...', docsUrl: 'https://vpic.nhtsa.dot.gov/api' },

  // Energy (más)
  { id: 'octopus-energy-api-v2', name: 'Octopus Energy', category: 'Energy', description: 'API de energía: consumo, tarifas y smart meters.', website: 'https://octopus.energy', logo: '🐙', placeholder: 'octopus_...', docsUrl: 'https://developer.octopus.energy' },
  { id: 'solaredge-api-v2', name: 'SolarEdge', category: 'Energy', description: 'Monitoreo de instalaciones solares fotovoltaicas.', website: 'https://solaredge.com', logo: '☀️', placeholder: 'solaredge_...', docsUrl: 'https://monitoring.solaredge.com/solaredge-web/p/api' },
  { id: 'enphase-api-v2', name: 'Enphase', category: 'Energy', description: 'Microinversores y monitoreo solar residencial.', website: 'https://enphase.com', logo: '🔋', placeholder: 'enphase_...', docsUrl: 'https://developer-v4.enphase.com' },
  { id: 'tibber-api-v2', name: 'Tibber', category: 'Energy', description: 'Energía inteligente: precios en tiempo real y smart home.', website: 'https://tibber.com', logo: '⚡', placeholder: 'tibber_...', docsUrl: 'https://developer.tibber.com' },

  // Insurance (más)
  { id: 'lemonade-api-v2', name: 'Lemonade', category: 'Insurance', description: 'Seguros digitales: hogar, auto, mascotas y vida.', website: 'https://lemonade.com', logo: '🍋', placeholder: 'lemonade_...', docsUrl: 'https://developers.lemonade.com' },
  { id: 'root-insurance-api-v2', name: 'Root Insurance', category: 'Insurance', description: 'Seguros de auto basados en telemática y conducción.', website: 'https://root.com', logo: '🌳', placeholder: 'root_...', docsUrl: 'https://developer.root.com' },
  { id: 'oscar-health-api', name: 'Oscar Health', category: 'Insurance', description: 'Seguros de salud tecnológicos con telemedicina.', website: 'https://hioscar.com', logo: '🏥', placeholder: 'oscar_...', docsUrl: 'https://developer.hioscar.com' },

  // Music (más)
  { id: 'spotify-api2', name: 'Spotify', category: 'Music', description: 'API de Spotify: tracks, playlists, recommendations.', website: 'https://spotify.com', logo: '🎵', placeholder: 'spotify_...', docsUrl: 'https://developer.spotify.com/documentation/web-api' },
  { id: 'soundcloud-api-v2', name: 'SoundCloud', category: 'Music', description: 'API de streaming de música: tracks, users y playlists.', website: 'https://soundcloud.com', logo: '☁️', placeholder: 'soundcloud_...', docsUrl: 'https://developers.soundcloud.com' },
  { id: 'genius-api-v2', name: 'Genius', category: 'Music', description: 'Letras de canciones, artistas y annotations.', website: 'https://genius.com', logo: '🎤', placeholder: 'genius_...', docsUrl: 'https://docs.genius.com' },
  { id: 'musixmatch-api-v2', name: 'Musixmatch', category: 'Music', description: 'Base de datos de letras de canciones más grande del mundo.', website: 'https://musixmatch.com', logo: '🎶', placeholder: 'musixmatch_...', docsUrl: 'https://developer.musixmatch.com' },

  // Data Enrichment (más)
  { id: 'clearbit-api2', name: 'Clearbit', category: 'Data Enrichment', description: 'Enriquecimiento de datos empresariales: logos, emails y más.', website: 'https://clearbit.com', logo: '🔮', placeholder: 'clearbit_...', docsUrl: 'https://clearbit.com/docs' },
  { id: 'hunter-api2', name: 'Hunter.io', category: 'Data Enrichment', description: 'Buscador de emails profesionales y verificación.', website: 'https://hunter.io', logo: '🎯', placeholder: 'hunter_...', docsUrl: 'https://hunter.io/api-documentation' },
  { id: 'apollo-api', name: 'Apollo.io', category: 'Data Enrichment', description: 'Base de datos B2B con contactos y secuencias de ventas.', website: 'https://apollo.io', logo: '🚀', placeholder: 'apollo_...', docsUrl: 'https://apolloio.github.io/apollo-api-docs' },
  { id: 'zoominfo-api-v2', name: 'ZoomInfo', category: 'Data Enrichment', description: 'Intelligence B2B: contactos, empresas e intent data.', website: 'https://zoominfo.com', logo: '🔍', placeholder: 'zoominfo_...', docsUrl: 'https://api-docs.zoominfo.com' },
  { id: 'lusha-api', name: 'Lusha', category: 'Data Enrichment', description: 'Datos de contacto B2B: teléfonos y emails verificados.', website: 'https://lusha.com', logo: '📇', placeholder: 'lusha_...', docsUrl: 'https://www.lusha.com/docs' },

  // PDF & Documents (más)
  { id: 'docusign-api-v2', name: 'DocuSign', category: 'PDF & Documents', description: 'Firma electrónica y gestión de documentos contractuales.', website: 'https://docusign.com', logo: '✍️', placeholder: 'docusign_...', docsUrl: 'https://developers.docusign.com' },
  { id: 'pandadoc-api', name: 'PandaDoc', category: 'PDF & Documents', description: 'Propuestas, contratos y firma electrónica.', website: 'https://pandadoc.com', logo: '🐼', placeholder: 'pandadoc_...', docsUrl: 'https://developers.pandadoc.com' },
  { id: 'pdfmonkey-api', name: 'PDFMonkey', category: 'PDF & Documents', description: 'Generación automática de PDFs desde templates.', website: 'https://pdfmonkey.io', logo: '🐒', placeholder: 'pdfmonkey_...', docsUrl: 'https://docs.pdfmonkey.io' },
  { id: 'gotenberg-api-v2', name: 'Gotenberg', category: 'PDF & Documents', description: 'Conversión de HTML, Markdown y Office a PDF via API.', website: 'https://gotenberg.dev', logo: '📑', placeholder: 'gotenberg_...', docsUrl: 'https://gotenberg.dev/docs' },
  { id: 'ilovepdf-api-v2', name: 'iLovePDF', category: 'PDF & Documents', description: 'Herramientas PDF: merge, split, compress y convert.', website: 'https://ilovepdf.com', logo: '❤️', placeholder: 'ilovepdf_...', docsUrl: 'https://developer.ilovepdf.com' },

  // Scheduling (más)
  { id: 'calendly-api2', name: 'Calendly', category: 'Scheduling', description: 'Programación de reuniones sin fricción.', website: 'https://calendly.com', logo: '📅', placeholder: 'calendly_...', docsUrl: 'https://developer.calendly.com' },
  { id: 'cal-api', name: 'Cal.com', category: 'Scheduling', description: 'Scheduling open-source con integraciones y API completa.', website: 'https://cal.com', logo: '📆', placeholder: 'cal_...', docsUrl: 'https://cal.com/docs/enterprise-features/api' },
  { id: 'acuity-api2', name: 'Acuity Scheduling', category: 'Scheduling', description: 'Reserva de citas online con pagos y formularios.', website: 'https://acuityscheduling.com', logo: '🗓️', placeholder: 'acuity_...', docsUrl: 'https://developers.acuityscheduling.com' },
  { id: 'savvycal-api-v2', name: 'SavvyCal', category: 'Scheduling', description: 'Scheduling con overlay de calendarios y personalización.', website: 'https://savvycal.com', logo: '📋', placeholder: 'savvycal_...', docsUrl: 'https://savvycal.com/docs' },

  // Notifications (más)
  { id: 'novu-api', name: 'Novu', category: 'Notifications', description: 'Infraestructura de notificaciones open-source multi-canal.', website: 'https://novu.co', logo: '🔔', placeholder: 'novu_...', docsUrl: 'https://docs.novu.co' },
  { id: 'courier-api-v2', name: 'Courier', category: 'Notifications', description: 'Notificaciones multi-canal: email, push, SMS e in-app.', website: 'https://courier.com', logo: '📬', placeholder: 'courier_...', docsUrl: 'https://www.courier.com/docs' },
  { id: 'knock-api', name: 'Knock', category: 'Notifications', description: 'Infraestructura de notificaciones con workflows y preferences.', website: 'https://knock.app', logo: '🚪', placeholder: 'knock_...', docsUrl: 'https://docs.knock.app' },
  { id: 'onesignal-api2', name: 'OneSignal', category: 'Notifications', description: 'Push notifications, email, SMS e in-app messaging.', website: 'https://onesignal.com', logo: '🔊', placeholder: 'onesignal_...', docsUrl: 'https://documentation.onesignal.com' },

  // eSignature (más)
  { id: 'hellosign-api-v2', name: 'Dropbox Sign (HelloSign)', category: 'eSignature', description: 'Firma electrónica con API y embeddable signing.', website: 'https://sign.dropbox.com', logo: '✏️', placeholder: 'hellosign_...', docsUrl: 'https://developers.hellosign.com' },
  { id: 'signnow-api', name: 'SignNow', category: 'eSignature', description: 'eSignature para empresas con templates y roles.', website: 'https://signnow.com', logo: '📝', placeholder: 'signnow_...', docsUrl: 'https://docs.signnow.com' },
  { id: 'yousign-api-v2', name: 'Yousign', category: 'eSignature', description: 'Firma electrónica europea con validez legal eIDAS.', website: 'https://yousign.com', logo: '✅', placeholder: 'yousign_...', docsUrl: 'https://developers.yousign.com' },

  // Feature Flags (más)
  { id: 'launchdarkly-api2', name: 'LaunchDarkly', category: 'Feature Flags', description: 'Feature management con targeting y experimentación.', website: 'https://launchdarkly.com', logo: '🚩', placeholder: 'ld_...', docsUrl: 'https://docs.launchdarkly.com' },
  { id: 'flagsmith-api-v2', name: 'Flagsmith', category: 'Feature Flags', description: 'Feature flags open-source con remote config.', website: 'https://flagsmith.com', logo: '🏁', placeholder: 'flagsmith_...', docsUrl: 'https://docs.flagsmith.com' },
  { id: 'unleash-api-v2', name: 'Unleash', category: 'Feature Flags', description: 'Feature toggles open-source para despliegues graduales.', website: 'https://getunleash.io', logo: '🔓', placeholder: 'unleash_...', docsUrl: 'https://docs.getunleash.io' },
  { id: 'split-api', name: 'Split', category: 'Feature Flags', description: 'Feature delivery con métricas y experimentación.', website: 'https://split.io', logo: '✂️', placeholder: 'split_...', docsUrl: 'https://docs.split.io' },

  // Error Tracking (más)
  { id: 'bugsnag-api-v2', name: 'Bugsnag', category: 'Error Tracking', description: 'Error monitoring con stability scoring y release tracking.', website: 'https://bugsnag.com', logo: '🐛', placeholder: 'bugsnag_...', docsUrl: 'https://bugsnagapiv2.docs.apiary.io' },
  { id: 'rollbar-api-v2', name: 'Rollbar', category: 'Error Tracking', description: 'Error tracking en tiempo real con agrupación inteligente.', website: 'https://rollbar.com', logo: '📊', placeholder: 'rollbar_...', docsUrl: 'https://docs.rollbar.com' },
  { id: 'raygun-api-v2', name: 'Raygun', category: 'Error Tracking', description: 'Error y crash reporting con real user monitoring.', website: 'https://raygun.com', logo: '🔫', placeholder: 'raygun_...', docsUrl: 'https://raygun.com/documentation' },
  { id: 'airbrake-api-v2', name: 'Airbrake', category: 'Error Tracking', description: 'Error monitoring con deploy tracking y performance.', website: 'https://airbrake.io', logo: '🛑', placeholder: 'airbrake_...', docsUrl: 'https://airbrake.io/docs/api' },

  // Cybersecurity (más)
  { id: 'virustotal-api-v2', name: 'VirusTotal', category: 'Cybersecurity', description: 'Análisis de archivos y URLs con 70+ motores antivirus.', website: 'https://virustotal.com', logo: '🦠', placeholder: 'vt_...', docsUrl: 'https://docs.virustotal.com' },
  { id: 'shodan-api2', name: 'Shodan', category: 'Cybersecurity', description: 'Motor de búsqueda de dispositivos conectados a internet.', website: 'https://shodan.io', logo: '👁️', placeholder: 'shodan_...', docsUrl: 'https://developer.shodan.io' },
  { id: 'haveibeenpwned-api-v2', name: 'Have I Been Pwned', category: 'Cybersecurity', description: 'Verificar si emails o passwords están en data breaches.', website: 'https://haveibeenpwned.com', logo: '🔐', placeholder: 'hibp_...', docsUrl: 'https://haveibeenpwned.com/API/v3' },
  { id: 'securitytrails-api-v2', name: 'SecurityTrails', category: 'Cybersecurity', description: 'DNS history, subdomains y datos de infraestructura.', website: 'https://securitytrails.com', logo: '🕵️', placeholder: 'st_...', docsUrl: 'https://docs.securitytrails.com' },

  // Sports & Fitness (más)
  { id: 'strava-api2', name: 'Strava', category: 'Sports & Fitness', description: 'API de actividades deportivas: running, cycling y más.', website: 'https://strava.com', logo: '🏃', placeholder: 'strava_...', docsUrl: 'https://developers.strava.com' },
  { id: 'fitbit-api-v2', name: 'Fitbit', category: 'Sports & Fitness', description: 'Datos de salud y fitness: pasos, sueño y heart rate.', website: 'https://fitbit.com', logo: '⌚', placeholder: 'fitbit_...', docsUrl: 'https://dev.fitbit.com/build/reference/web-api' },
  { id: 'sportradar-api-v2', name: 'Sportradar', category: 'Sports & Fitness', description: 'Datos deportivos en vivo: scores, stats y odds.', website: 'https://sportradar.com', logo: '⚽', placeholder: 'sr_...', docsUrl: 'https://developer.sportradar.com' },
  { id: 'opta-api', name: 'Opta (Stats Perform)', category: 'Sports & Fitness', description: 'Estadísticas deportivas detalladas para fútbol y más.', website: 'https://statsperform.com', logo: '📈', placeholder: 'opta_...', docsUrl: 'https://www.statsperform.com/opta' },

  // Sustainability (más)
  { id: 'climatiq-api2', name: 'Climatiq', category: 'Sustainability', description: 'API de huella de carbono con factores de emisión globales.', website: 'https://climatiq.io', logo: '🌱', placeholder: 'climatiq_...', docsUrl: 'https://www.climatiq.io/docs' },
  { id: 'patch-api-v2', name: 'Patch', category: 'Sustainability', description: 'API para compensación de carbono y créditos climáticos.', website: 'https://patch.io', logo: '🌍', placeholder: 'patch_...', docsUrl: 'https://docs.patch.io' },
  { id: 'cloverly-api', name: 'Cloverly', category: 'Sustainability', description: 'Offsets de carbono en tiempo real para transacciones.', website: 'https://cloverly.com', logo: '🍀', placeholder: 'cloverly_...', docsUrl: 'https://docs.cloverly.com' },
  // ── Batch 6: tokens 276–400 ──

  // Compliance (más)
  { id: 'vanta-api-v2', name: 'Vanta', category: 'Compliance', description: 'Automatización de cumplimiento SOC 2, HIPAA e ISO 27001.', website: 'https://vanta.com', logo: '🛡️', placeholder: 'vanta_...', docsUrl: 'https://developer.vanta.com' },
  { id: 'drata-api-v2', name: 'Drata', category: 'Compliance', description: 'Compliance automation: SOC 2, ISO, GDPR y más.', website: 'https://drata.com', logo: '✅', placeholder: 'drata_...', docsUrl: 'https://developers.drata.com' },
  { id: 'secureframe-api', name: 'Secureframe', category: 'Compliance', description: 'Cumplimiento continuo con monitoreo automático.', website: 'https://secureframe.com', logo: '🔒', placeholder: 'sf_...', docsUrl: 'https://secureframe.com/api-docs' },
  { id: 'thoropass-api', name: 'Thoropass', category: 'Compliance', description: 'Auditorías de compliance streamlined con automation.', website: 'https://thoropass.com', logo: '📋', placeholder: 'thoropass_...', docsUrl: 'https://developers.thoropass.com' },

  // Enterprise (más)
  { id: 'servicenow-api-v2', name: 'ServiceNow', category: 'Enterprise', description: 'ITSM, workflows y automatización empresarial.', website: 'https://servicenow.com', logo: '🏢', placeholder: 'sn_...', docsUrl: 'https://developer.servicenow.com' },
  { id: 'sap-api-v2', name: 'SAP', category: 'Enterprise', description: 'ERP empresarial con APIs para finanzas, HR y supply chain.', website: 'https://sap.com', logo: '🔷', placeholder: 'sap_...', docsUrl: 'https://api.sap.com' },
  { id: 'workday-api-v2', name: 'Workday', category: 'Enterprise', description: 'HCM y finance cloud para grandes empresas.', website: 'https://workday.com', logo: '🌤️', placeholder: 'workday_...', docsUrl: 'https://community.workday.com/api' },
  { id: 'dynamics365-api-v2', name: 'Dynamics 365', category: 'Enterprise', description: 'ERP y CRM de Microsoft con Dataverse API.', website: 'https://dynamics.microsoft.com', logo: '💎', placeholder: 'd365_...', docsUrl: 'https://learn.microsoft.com/en-us/dynamics365' },
  { id: 'netsuite-api-v2', name: 'NetSuite', category: 'Enterprise', description: 'ERP cloud de Oracle: finanzas, inventario y CRM.', website: 'https://netsuite.com', logo: '📊', placeholder: 'netsuite_...', docsUrl: 'https://docs.oracle.com/en/cloud/saas/netsuite' },
  { id: 'snowflake-api', name: 'Snowflake', category: 'Enterprise', description: 'Data warehouse cloud con sharing y marketplace.', website: 'https://snowflake.com', logo: '❄️', placeholder: 'snowflake_...', docsUrl: 'https://docs.snowflake.com' },

  // Telecom (más)
  { id: 'twilio-verify', name: 'Twilio Verify', category: 'Telecom', description: 'Verificación de teléfono con SMS, voice y TOTP.', website: 'https://twilio.com/verify', logo: '✅', placeholder: 'twilio_v_...', docsUrl: 'https://www.twilio.com/docs/verify/api' },
  { id: 'zipwhip-api', name: 'Zipwhip', category: 'Telecom', description: 'Texting empresarial desde líneas fijas existentes.', website: 'https://zipwhip.com', logo: '📱', placeholder: 'zipwhip_...', docsUrl: 'https://developer.zipwhip.com' },
  { id: 'ringcentral-api-v2', name: 'RingCentral', category: 'Telecom', description: 'UCaaS: voz, video, SMS y fax cloud para empresas.', website: 'https://ringcentral.com', logo: '📞', placeholder: 'rc_...', docsUrl: 'https://developers.ringcentral.com' },
  { id: 'dialpad-api', name: 'Dialpad', category: 'Telecom', description: 'Comunicaciones empresariales con AI transcription.', website: 'https://dialpad.com', logo: '☎️', placeholder: 'dialpad_...', docsUrl: 'https://developers.dialpad.com' },

  // Backup (más)
  { id: 'veeam-api-v2', name: 'Veeam', category: 'Backup', description: 'Backup y disaster recovery para VMs y cloud.', website: 'https://veeam.com', logo: '💾', placeholder: 'veeam_...', docsUrl: 'https://helpcenter.veeam.com/docs/backup/rest' },
  { id: 'acronis-api2', name: 'Acronis', category: 'Backup', description: 'Backup, disaster recovery y cyber protection cloud.', website: 'https://acronis.com', logo: '🛡️', placeholder: 'acronis_...', docsUrl: 'https://developer.acronis.com' },
  { id: 'druva-api', name: 'Druva', category: 'Backup', description: 'Data protection SaaS para endpoints y cloud workloads.', website: 'https://druva.com', logo: '☁️', placeholder: 'druva_...', docsUrl: 'https://developer.druva.com' },
  { id: 'commvault-api', name: 'Commvault', category: 'Backup', description: 'Data protection enterprise: backup, archive y DR.', website: 'https://commvault.com', logo: '📀', placeholder: 'commvault_...', docsUrl: 'https://documentation.commvault.com/rest-api' },

  // Accessibility (más)
  { id: 'accessibe-api2', name: 'accessiBe', category: 'Accessibility', description: 'Accesibilidad web automática con AI y compliance WCAG.', website: 'https://accessibe.com', logo: '♿', placeholder: 'accessibe_...', docsUrl: 'https://accessibe.com/support' },
  { id: 'userway-api-v2', name: 'UserWay', category: 'Accessibility', description: 'Widget de accesibilidad web con AI remediation.', website: 'https://userway.org', logo: '🌐', placeholder: 'userway_...', docsUrl: 'https://userway.org/docs' },
  { id: 'audioeye-api', name: 'AudioEye', category: 'Accessibility', description: 'Accesibilidad digital con testing y remediación automática.', website: 'https://audioeye.com', logo: '👂', placeholder: 'audioeye_...', docsUrl: 'https://developer.audioeye.com' },
  { id: 'equalweb-api', name: 'EqualWeb', category: 'Accessibility', description: 'Accesibilidad web con personalización y compliance.', website: 'https://equalweb.com', logo: '⚖️', placeholder: 'equalweb_...', docsUrl: 'https://equalweb.com/api-docs' },

  // Network (más)
  { id: 'kentik-api', name: 'Kentik', category: 'Network', description: 'Observabilidad de red con traffic analytics y DDoS detection.', website: 'https://kentik.com', logo: '🌐', placeholder: 'kentik_...', docsUrl: 'https://kb.kentik.com/v0/Api.htm' },
  { id: 'thousandeyes-api', name: 'ThousandEyes', category: 'Network', description: 'Monitoreo de red global con synthetic testing.', website: 'https://thousandeyes.com', logo: '👁️', placeholder: 'te_...', docsUrl: 'https://developer.thousandeyes.com' },
  { id: 'netbox-api', name: 'NetBox', category: 'Network', description: 'IPAM y DCIM open-source para infraestructura de red.', website: 'https://netbox.dev', logo: '📡', placeholder: 'netbox_...', docsUrl: 'https://demo.netbox.dev/api/docs' },
  { id: 'meraki-api', name: 'Cisco Meraki', category: 'Network', description: 'Gestión cloud de redes, switches y access points.', website: 'https://meraki.io', logo: '🔌', placeholder: 'meraki_...', docsUrl: 'https://developer.cisco.com/meraki/api-v1' },

  // Podcast & Audio (más)
  { id: 'transistor-api-v2', name: 'Transistor.fm', category: 'Podcast & Audio', description: 'Hosting de podcast con analytics y sitio web incluido.', website: 'https://transistor.fm', logo: '🎙️', placeholder: 'transistor_...', docsUrl: 'https://developers.transistor.fm' },
  { id: 'buzzsprout-api-v2', name: 'Buzzsprout', category: 'Podcast & Audio', description: 'Hosting de podcast con distribución a todas las plataformas.', website: 'https://buzzsprout.com', logo: '🐝', placeholder: 'buzzsprout_...', docsUrl: 'https://github.com/Buzzsprout/buzzsprout-api' },
  { id: 'anchor-api-v2', name: 'Anchor (Spotify)', category: 'Podcast & Audio', description: 'Creación y distribución de podcasts gratuita.', website: 'https://anchor.fm', logo: '⚓', placeholder: 'anchor_...', docsUrl: 'https://anchor.fm/dashboard' },
  { id: 'descript-api', name: 'Descript', category: 'Podcast & Audio', description: 'Edición de audio y video con transcripción AI.', website: 'https://descript.com', logo: '🎧', placeholder: 'descript_...', docsUrl: 'https://developers.descript.com' },
  { id: 'assemblyai-api2', name: 'AssemblyAI', category: 'Podcast & Audio', description: 'Transcripción de audio con AI: speaker diarization y summarization.', website: 'https://assemblyai.com', logo: '📝', placeholder: 'assemblyai_...', docsUrl: 'https://www.assemblyai.com/docs' },

  // AR/VR (más)
  { id: 'niantic-api', name: 'Niantic Lightship', category: 'AR/VR', description: 'AR platform para experiencias de realidad aumentada.', website: 'https://lightship.dev', logo: '🌍', placeholder: 'niantic_...', docsUrl: 'https://lightship.dev/docs' },
  { id: 'vuforia-api-v2', name: 'Vuforia', category: 'AR/VR', description: 'SDK de realidad aumentada para apps industriales.', website: 'https://developer.vuforia.com', logo: '🔮', placeholder: 'vuforia_...', docsUrl: 'https://developer.vuforia.com/library' },
  { id: 'meta-quest-api-v2', name: 'Meta Quest', category: 'AR/VR', description: 'SDK para desarrollo de apps VR en Meta Quest.', website: 'https://developer.oculus.com', logo: '🥽', placeholder: 'meta_quest_...', docsUrl: 'https://developer.oculus.com/documentation' },
  { id: 'snap-ar-api', name: 'Snap AR (Lens Studio)', category: 'AR/VR', description: 'Creación de AR lenses para Snapchat y Spectacles.', website: 'https://ar.snap.com', logo: '👻', placeholder: 'snap_ar_...', docsUrl: 'https://docs.snap.com/lens-studio' },

  // News & Data (más)
  { id: 'newsapi2', name: 'NewsAPI', category: 'News & Data', description: 'Agregador de noticias globales con búsqueda y filtros.', website: 'https://newsapi.org', logo: '📰', placeholder: 'newsapi_...', docsUrl: 'https://newsapi.org/docs' },
  { id: 'gnews-api-v2', name: 'GNews', category: 'News & Data', description: 'API de noticias con artículos de 60.000+ fuentes.', website: 'https://gnews.io', logo: '📰', placeholder: 'gnews_...', docsUrl: 'https://gnews.io/docs' },
  { id: 'mediastack-api-v2', name: 'Mediastack', category: 'News & Data', description: 'Noticias en tiempo real de 7.500+ fuentes globales.', website: 'https://mediastack.com', logo: '📡', placeholder: 'mediastack_...', docsUrl: 'https://mediastack.com/documentation' },
  { id: 'worldnewsapi', name: 'World News API', category: 'News & Data', description: 'API de noticias mundiales con análisis de sentimiento.', website: 'https://worldnewsapi.com', logo: '🌎', placeholder: 'worldnews_...', docsUrl: 'https://worldnewsapi.com/docs' },

  // Agriculture (más)
  { id: 'agromonitoring-api', name: 'Agromonitoring', category: 'Agriculture', description: 'Datos satelitales para agricultura: NDVI, clima y suelo.', website: 'https://agromonitoring.com', logo: '🌾', placeholder: 'agro_...', docsUrl: 'https://agromonitoring.com/api' },
  { id: 'cropwise-api', name: 'Cropwise', category: 'Agriculture', description: 'Plataforma agrícola digital de Syngenta.', website: 'https://cropwise.com', logo: '🌿', placeholder: 'cropwise_...', docsUrl: 'https://developer.cropwise.com' },
  { id: 'farmhack-api', name: 'FarmHack', category: 'Agriculture', description: 'Datos agronómicos open para agricultura de precisión.', website: 'https://farmhack.org', logo: '🚜', placeholder: 'farmhack_...', docsUrl: 'https://farmhack.org/tools' },
  { id: 'agworld-api-v2', name: 'Agworld', category: 'Agriculture', description: 'Gestión de fincas: planificación, registro y presupuestos.', website: 'https://agworld.com', logo: '🌻', placeholder: 'agworld_...', docsUrl: 'https://developer.agworld.com' },

  // Construction (más)
  { id: 'procore-api-v2', name: 'Procore', category: 'Construction', description: 'Gestión de proyectos de construcción en la nube.', website: 'https://procore.com', logo: '🏗️', placeholder: 'procore_...', docsUrl: 'https://developers.procore.com' },
  { id: 'plangrid-api-v2', name: 'PlanGrid (Autodesk)', category: 'Construction', description: 'Gestión de planos y documentos de construcción.', website: 'https://plangrid.com', logo: '📐', placeholder: 'plangrid_...', docsUrl: 'https://developer.plangrid.com' },
  { id: 'buildertrend-api-v2', name: 'Buildertrend', category: 'Construction', description: 'Software para constructores: presupuestos, scheduling y CRM.', website: 'https://buildertrend.com', logo: '🔨', placeholder: 'buildertrend_...', docsUrl: 'https://developers.buildertrend.com' },
  { id: 'fieldwire-api-v2', name: 'Fieldwire', category: 'Construction', description: 'Gestión de tareas de campo para construcción.', website: 'https://fieldwire.com', logo: '👷', placeholder: 'fieldwire_...', docsUrl: 'https://developers.fieldwire.com' },

  // Identity (más)
  { id: 'onfido-api-v2', name: 'Onfido', category: 'Identity', description: 'Verificación de identidad con AI: documentos y biometrics.', website: 'https://onfido.com', logo: '🪪', placeholder: 'onfido_...', docsUrl: 'https://documentation.onfido.com' },
  { id: 'jumio-api-v2', name: 'Jumio', category: 'Identity', description: 'KYC y verificación de identidad con document verification.', website: 'https://jumio.com', logo: '🆔', placeholder: 'jumio_...', docsUrl: 'https://github.com/Jumio/implementation-guides' },
  { id: 'persona-api-v2', name: 'Persona', category: 'Identity', description: 'Identity verification y KYC con flujos configurables.', website: 'https://withpersona.com', logo: '👤', placeholder: 'persona_...', docsUrl: 'https://docs.withpersona.com' },
  { id: 'sumsub-api-v2', name: 'Sumsub', category: 'Identity', description: 'KYC/AML verification con document y face check.', website: 'https://sumsub.com', logo: '✔️', placeholder: 'sumsub_...', docsUrl: 'https://developers.sumsub.com' },
  { id: 'veriff-api-v2', name: 'Veriff', category: 'Identity', description: 'Identity verification global con AI y document checks.', website: 'https://veriff.com', logo: '🔍', placeholder: 'veriff_...', docsUrl: 'https://developers.veriff.com' },
  // ── Batch 7: tokens 328–500 ──

  // AI & ML (especializados)
  { id: 'langchain-api-v2', name: 'LangChain', category: 'AI & ML', description: 'Framework para construir apps con LLMs: chains, agents y RAG.', website: 'https://langchain.com', logo: '🦜', placeholder: 'langchain_...', docsUrl: 'https://docs.langchain.com' },
  { id: 'llamaindex-api-v2', name: 'LlamaIndex', category: 'AI & ML', description: 'Framework de datos para LLMs: indexación, RAG y agents.', website: 'https://llamaindex.ai', logo: '🦙', placeholder: 'llama_...', docsUrl: 'https://docs.llamaindex.ai' },
  { id: 'weights-biases-api', name: 'Weights & Biases', category: 'AI & ML', description: 'MLOps: experiment tracking, model registry y datasets.', website: 'https://wandb.ai', logo: '📊', placeholder: 'wandb_...', docsUrl: 'https://docs.wandb.ai' },
  { id: 'comet-ml-api', name: 'Comet ML', category: 'AI & ML', description: 'Experiment tracking y model monitoring para equipos ML.', website: 'https://comet.com', logo: '☄️', placeholder: 'comet_...', docsUrl: 'https://www.comet.com/docs/v2/api-and-sdk' },
  { id: 'labelbox-api-v2', name: 'Labelbox', category: 'AI & ML', description: 'Plataforma de etiquetado de datos para entrenar modelos.', website: 'https://labelbox.com', logo: '🏷️', placeholder: 'labelbox_...', docsUrl: 'https://docs.labelbox.com' },
  { id: 'scale-ai-api', name: 'Scale AI', category: 'AI & ML', description: 'Data labeling y evaluación de modelos de IA a escala.', website: 'https://scale.com', logo: '⚖️', placeholder: 'scale_...', docsUrl: 'https://docs.scale.com' },
  { id: 'roboflow-api', name: 'Roboflow', category: 'AI & ML', description: 'Computer vision: datasets, training y deploy de modelos.', website: 'https://roboflow.com', logo: '👁️', placeholder: 'roboflow_...', docsUrl: 'https://docs.roboflow.com' },
  { id: 'runway-api-v2', name: 'Runway ML', category: 'AI & ML', description: 'Generación de video con IA: Gen-2, inpainting y más.', website: 'https://runwayml.com', logo: '🎬', placeholder: 'runway_...', docsUrl: 'https://docs.runwayml.com' },
  { id: 'midjourney-api-v2', name: 'Midjourney', category: 'AI & ML', description: 'Generación de imágenes artísticas con IA.', website: 'https://midjourney.com', logo: '🎨', placeholder: 'mj_...', docsUrl: 'https://docs.midjourney.com' },
  { id: 'playground-ai-api', name: 'Playground AI', category: 'AI & ML', description: 'Generación y edición de imágenes con modelos de IA.', website: 'https://playground.ai', logo: '🖼️', placeholder: 'playground_...', docsUrl: 'https://docs.playground.ai' },
  { id: 'unstructured-api', name: 'Unstructured', category: 'AI & ML', description: 'ETL para datos no estructurados: PDFs, imágenes y docs.', website: 'https://unstructured.io', logo: '📄', placeholder: 'unstructured_...', docsUrl: 'https://docs.unstructured.io' },
  { id: 'vectorize-api', name: 'Vectorize', category: 'AI & ML', description: 'Pipeline de RAG automático: ingestion, chunking y vectorización.', website: 'https://vectorize.io', logo: '🔢', placeholder: 'vectorize_...', docsUrl: 'https://docs.vectorize.io' },

  // Cloud (especializados)
  { id: 'supabase-realtime-v2', name: 'Supabase Realtime', category: 'Cloud', description: 'Suscripciones en tiempo real sobre PostgreSQL changes.', website: 'https://supabase.com/realtime', logo: '⚡', placeholder: 'supabase_rt_...', docsUrl: 'https://supabase.com/docs/guides/realtime' },
  { id: 'convex-api-v2', name: 'Convex', category: 'Cloud', description: 'Backend reactivo: funciones, database y file storage.', website: 'https://convex.dev', logo: '🔺', placeholder: 'convex_...', docsUrl: 'https://docs.convex.dev' },
  { id: 'val-town-api-v2', name: 'Val Town', category: 'Cloud', description: 'Serverless functions sociales: escribe, comparte y ejecuta código.', website: 'https://val.town', logo: '🏘️', placeholder: 'vt_...', docsUrl: 'https://docs.val.town' },
  { id: 'inngest-api-v2', name: 'Inngest', category: 'Cloud', description: 'Event-driven functions con queues, scheduling y retries.', website: 'https://inngest.com', logo: '🔄', placeholder: 'inngest_...', docsUrl: 'https://www.inngest.com/docs' },
  { id: 'trigger-dev-api', name: 'Trigger.dev', category: 'Cloud', description: 'Background jobs y workflows para aplicaciones serverless.', website: 'https://trigger.dev', logo: '⚡', placeholder: 'trigger_...', docsUrl: 'https://trigger.dev/docs' },
  { id: 'qstash-api-v2', name: 'QStash', category: 'Cloud', description: 'Message queue HTTP para funciones serverless de Upstash.', website: 'https://upstash.com/qstash', logo: '📨', placeholder: 'qstash_...', docsUrl: 'https://upstash.com/docs/qstash' },

  // Pagos (especializados)
  { id: 'redsys-api', name: 'Redsys', category: 'Pagos', description: 'Pasarela de pago líder en España para comercio electrónico.', website: 'https://redsys.es', logo: '🇪🇸', placeholder: 'redsys_...', docsUrl: 'https://pagosonline.redsys.es/desarrolladores.html' },
  { id: 'bizum-api-v2', name: 'Bizum', category: 'Pagos', description: 'Pagos instantáneos por móvil en España.', website: 'https://bizum.es', logo: '📲', placeholder: 'bizum_...', docsUrl: 'https://bizum.es/info/desarrolladores' },
  { id: 'paddle-api', name: 'Paddle', category: 'Pagos', description: 'MoR para SaaS: pagos, impuestos y suscripciones.', website: 'https://paddle.com', logo: '🏓', placeholder: 'paddle_...', docsUrl: 'https://developer.paddle.com' },
  { id: 'lemon-squeezy-api', name: 'Lemon Squeezy', category: 'Pagos', description: 'MoR para software: pagos, impuestos y license keys.', website: 'https://lemonsqueezy.com', logo: '🍋', placeholder: 'lmsq_...', docsUrl: 'https://docs.lemonsqueezy.com/api' },
  { id: 'chargebee-api', name: 'Chargebee', category: 'Pagos', description: 'Gestión de suscripciones y facturación recurrente.', website: 'https://chargebee.com', logo: '🐝', placeholder: 'chargebee_...', docsUrl: 'https://apidocs.chargebee.com' },
  { id: 'recurly-api', name: 'Recurly', category: 'Pagos', description: 'Billing de suscripciones con recuperación de revenue.', website: 'https://recurly.com', logo: '🔄', placeholder: 'recurly_...', docsUrl: 'https://developers.recurly.com' },

  // Social (especializados)
  { id: 'mastodon-api-v2', name: 'Mastodon', category: 'Social', description: 'API de la red social descentralizada federada.', website: 'https://joinmastodon.org', logo: '🐘', placeholder: 'mastodon_...', docsUrl: 'https://docs.joinmastodon.org/api' },
  { id: 'bluesky-api-v2', name: 'Bluesky', category: 'Social', description: 'Red social descentralizada con protocolo AT.', website: 'https://bsky.social', logo: '🦋', placeholder: 'bsky_...', docsUrl: 'https://docs.bsky.app' },
  { id: 'threads-api-v2', name: 'Threads (Meta)', category: 'Social', description: 'API de Threads para publicar y leer contenido.', website: 'https://threads.net', logo: '🧵', placeholder: 'threads_...', docsUrl: 'https://developers.facebook.com/docs/threads' },
  { id: 'snapchat-api', name: 'Snapchat', category: 'Social', description: 'API de Snap: login social, Bitmoji y marketing.', website: 'https://snapchat.com', logo: '👻', placeholder: 'snap_...', docsUrl: 'https://developers.snap.com' },
  { id: 'twitch-api2', name: 'Twitch', category: 'Social', description: 'API de streaming: channels, chat, clips y analytics.', website: 'https://twitch.tv', logo: '🟣', placeholder: 'twitch_...', docsUrl: 'https://dev.twitch.tv/docs/api' },

  // Media (especializados)
  { id: 'cloudinary-api2', name: 'Cloudinary', category: 'Media', description: 'Gestión de imágenes y video: upload, transform y CDN.', website: 'https://cloudinary.com', logo: '☁️', placeholder: 'cloudinary_...', docsUrl: 'https://cloudinary.com/documentation' },
  { id: 'imgix-api', name: 'imgix', category: 'Media', description: 'CDN de imágenes con transformación en tiempo real.', website: 'https://imgix.com', logo: '🖼️', placeholder: 'imgix_...', docsUrl: 'https://docs.imgix.com' },
  { id: 'transloadit-api', name: 'Transloadit', category: 'Media', description: 'Procesamiento de archivos: encoding, resize y OCR.', website: 'https://transloadit.com', logo: '⚙️', placeholder: 'transloadit_...', docsUrl: 'https://transloadit.com/docs/api' },
  { id: 'bannerbear-api', name: 'Bannerbear', category: 'Media', description: 'Generación automática de imágenes y videos desde templates.', website: 'https://bannerbear.com', logo: '🐻', placeholder: 'bannerbear_...', docsUrl: 'https://developers.bannerbear.com' },
  { id: 'remove-bg-api', name: 'Remove.bg', category: 'Media', description: 'Eliminar fondo de imágenes automáticamente con AI.', website: 'https://remove.bg', logo: '✂️', placeholder: 'removebg_...', docsUrl: 'https://www.remove.bg/api' },

  // CDN & Performance (más)
  { id: 'fastly-api-v2', name: 'Fastly', category: 'CDN & Performance', description: 'Edge cloud: CDN, WAF, compute y observabilidad.', website: 'https://fastly.com', logo: '⚡', placeholder: 'fastly_...', docsUrl: 'https://developer.fastly.com' },
  { id: 'akamai-api-v2', name: 'Akamai', category: 'CDN & Performance', description: 'CDN empresarial con seguridad y edge computing.', website: 'https://akamai.com', logo: '🌐', placeholder: 'akamai_...', docsUrl: 'https://techdocs.akamai.com' },
  { id: 'keycdn-api', name: 'KeyCDN', category: 'CDN & Performance', description: 'CDN simple y económico con push y pull zones.', website: 'https://keycdn.com', logo: '🔑', placeholder: 'keycdn_...', docsUrl: 'https://www.keycdn.com/api' },
  { id: 'stackpath-api', name: 'StackPath', category: 'CDN & Performance', description: 'Edge computing, CDN y WAF para aplicaciones.', website: 'https://stackpath.com', logo: '📡', placeholder: 'stackpath_...', docsUrl: 'https://stackpath.dev/docs' },

  // Workflow & Automation
  { id: 'zapier-api', name: 'Zapier', category: 'Productividad', description: 'Automatización de workflows conectando 6000+ apps.', website: 'https://zapier.com', logo: '⚡', placeholder: 'zapier_...', docsUrl: 'https://platform.zapier.com/docs/api' },
  { id: 'make-api', name: 'Make (Integromat)', category: 'Productividad', description: 'Automatización visual con escenarios y módulos.', website: 'https://make.com', logo: '🔄', placeholder: 'make_...', docsUrl: 'https://www.make.com/en/api-documentation' },
  { id: 'n8n-api-v2', name: 'n8n', category: 'Productividad', description: 'Workflow automation open-source con self-hosting.', website: 'https://n8n.io', logo: '🔗', placeholder: 'n8n_...', docsUrl: 'https://docs.n8n.io' },
  { id: 'pipedream-api-v2', name: 'Pipedream', category: 'Productividad', description: 'Integration platform para developers con código.', website: 'https://pipedream.com', logo: '🔧', placeholder: 'pd_...', docsUrl: 'https://pipedream.com/docs' },
  { id: 'temporal-api', name: 'Temporal', category: 'Productividad', description: 'Durable execution: workflows distribuidos y resilientes.', website: 'https://temporal.io', logo: '⏱️', placeholder: 'temporal_...', docsUrl: 'https://docs.temporal.io' },

  // Email (especializados)
  { id: 'loops-api', name: 'Loops', category: 'Email', description: 'Email para SaaS: transaccional y marketing simplificado.', website: 'https://loops.so', logo: '🔁', placeholder: 'loops_...', docsUrl: 'https://loops.so/docs/api-reference' },
  { id: 'mailpace-api-v2', name: 'MailPace', category: 'Email', description: 'Email transaccional rápido y privado con API REST.', website: 'https://mailpace.com', logo: '📧', placeholder: 'mailpace_...', docsUrl: 'https://docs.mailpace.com' },
  { id: 'mailtrap-api-v2', name: 'Mailtrap', category: 'Email', description: 'Email testing y sending con sandbox y deliverability.', website: 'https://mailtrap.io', logo: '🪤', placeholder: 'mailtrap_...', docsUrl: 'https://api-docs.mailtrap.io' },
  { id: 'sparkpost-api', name: 'SparkPost', category: 'Email', description: 'Email infrastructure con deliverability analytics.', website: 'https://sparkpost.com', logo: '✨', placeholder: 'sparkpost_...', docsUrl: 'https://developers.sparkpost.com' },

  // DevOps (especializados)
  { id: 'terraform-cloud-api', name: 'Terraform Cloud', category: 'DevOps', description: 'IaC gestionado: remote state, plans y applies.', website: 'https://app.terraform.io', logo: '🟣', placeholder: 'tfc_...', docsUrl: 'https://developer.hashicorp.com/terraform/cloud-docs' },
  { id: 'argocd-api', name: 'Argo CD', category: 'DevOps', description: 'GitOps continuous delivery para Kubernetes.', website: 'https://argoproj.github.io/cd', logo: '🐙', placeholder: 'argocd_...', docsUrl: 'https://argo-cd.readthedocs.io/en/stable' },
  { id: 'harbor-api-v2', name: 'Harbor', category: 'DevOps', description: 'Registry de containers open-source con scanning y RBAC.', website: 'https://goharbor.io', logo: '⚓', placeholder: 'harbor_...', docsUrl: 'https://goharbor.io/docs' },
  { id: 'sonarqube-api-v2', name: 'SonarQube', category: 'DevOps', description: 'Análisis de calidad de código: bugs, vulnerabilidades y smells.', website: 'https://sonarqube.org', logo: '📐', placeholder: 'sonar_...', docsUrl: 'https://docs.sonarqube.org/latest/extension-guide/web-api' },
  { id: 'snyk-container', name: 'Snyk Container', category: 'DevOps', description: 'Scanning de vulnerabilidades en imágenes de containers.', website: 'https://snyk.io/product/container-vulnerability-management', logo: '🐋', placeholder: 'snyk_c_...', docsUrl: 'https://docs.snyk.io/scan-using-snyk/snyk-container' },
  { id: 'octopus-deploy-api', name: 'Octopus Deploy', category: 'DevOps', description: 'Deployment automation para servers, Kubernetes y cloud.', website: 'https://octopus.com', logo: '🐙', placeholder: 'octopus_...', docsUrl: 'https://octopus.com/docs/octopus-rest-api' },
  { id: 'codefresh-api-v2', name: 'Codefresh', category: 'DevOps', description: 'CI/CD para Kubernetes con GitOps y Argo.', website: 'https://codefresh.io', logo: '🔵', placeholder: 'codefresh_...', docsUrl: 'https://codefresh.io/docs/docs/integrations/codefresh-api' },

  // Base de datos (especializados)
  { id: 'weaviate-api', name: 'Weaviate', category: 'Base de datos', description: 'Base de datos vectorial open-source para AI y búsqueda semántica.', website: 'https://weaviate.io', logo: '🟢', placeholder: 'weaviate_...', docsUrl: 'https://weaviate.io/developers/weaviate' },
  { id: 'qdrant-api', name: 'Qdrant', category: 'Base de datos', description: 'Motor de búsqueda vectorial de alto rendimiento.', website: 'https://qdrant.tech', logo: '🔷', placeholder: 'qdrant_...', docsUrl: 'https://qdrant.tech/documentation' },
  { id: 'chromadb-api', name: 'ChromaDB', category: 'Base de datos', description: 'Base de datos de embeddings open-source para AI apps.', website: 'https://trychroma.com', logo: '🎨', placeholder: 'chroma_...', docsUrl: 'https://docs.trychroma.com' },
  { id: 'timescale-api', name: 'TimescaleDB', category: 'Base de datos', description: 'PostgreSQL con extensiones para series temporales.', website: 'https://timescale.com', logo: '⏰', placeholder: 'timescale_...', docsUrl: 'https://docs.timescale.com' },
  { id: 'influxdb-api', name: 'InfluxDB', category: 'Base de datos', description: 'Base de datos de series temporales para métricas y eventos.', website: 'https://influxdata.com', logo: '📈', placeholder: 'influxdb_...', docsUrl: 'https://docs.influxdata.com' },
  { id: 'couchbase-api-v2', name: 'Couchbase', category: 'Base de datos', description: 'NoSQL distribuido con N1QL, full-text search y mobile sync.', website: 'https://couchbase.com', logo: '🛋️', placeholder: 'couchbase_...', docsUrl: 'https://docs.couchbase.com' },
  { id: 'arangodb-api-v2', name: 'ArangoDB', category: 'Base de datos', description: 'Base de datos multi-modelo: document, graph y key-value.', website: 'https://arangodb.com', logo: '🥑', placeholder: 'arangodb_...', docsUrl: 'https://arangodb.com/docs' },
  { id: 'neo4j-api-v2', name: 'Neo4j', category: 'Base de datos', description: 'Base de datos de grafos líder con Cypher query language.', website: 'https://neo4j.com', logo: '🔵', placeholder: 'neo4j_...', docsUrl: 'https://neo4j.com/docs' },

  // Seguridad (especializados)
  { id: 'auth0-m2m', name: 'Auth0 M2M', category: 'Seguridad', description: 'Machine-to-machine auth con OAuth 2.0 client credentials.', website: 'https://auth0.com', logo: '🤖', placeholder: 'auth0_m2m_...', docsUrl: 'https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-credentials-flow' },
  { id: 'onepassword-api', name: '1Password Connect', category: 'Seguridad', description: 'Acceso programático a secretos de 1Password vaults.', website: 'https://1password.com', logo: '🔑', placeholder: 'op_...', docsUrl: 'https://developer.1password.com/docs/connect' },
  { id: 'bitwarden-api', name: 'Bitwarden', category: 'Seguridad', description: 'Password manager open-source con API y CLI.', website: 'https://bitwarden.com', logo: '🔒', placeholder: 'bitwarden_...', docsUrl: 'https://bitwarden.com/help/api' },
  { id: 'infisical-api-v2', name: 'Infisical', category: 'Seguridad', description: 'Gestión de secretos open-source para equipos de desarrollo.', website: 'https://infisical.com', logo: '🔐', placeholder: 'infisical_...', docsUrl: 'https://infisical.com/docs/api-reference' },

  // Mapas (especializados)
  { id: 'mapbox-api2', name: 'Mapbox', category: 'Mapas', description: 'Mapas personalizables, geocoding, routing y navigation.', website: 'https://mapbox.com', logo: '🗺️', placeholder: 'pk.', docsUrl: 'https://docs.mapbox.com' },
  { id: 'maptiler-api', name: 'MapTiler', category: 'Mapas', description: 'Mapas vectoriales, geocoding y hosting de tiles.', website: 'https://maptiler.com', logo: '🌍', placeholder: 'maptiler_...', docsUrl: 'https://docs.maptiler.com' },
  { id: 'radar-api', name: 'Radar', category: 'Mapas', description: 'Geofencing, geocoding y mapas para apps móviles.', website: 'https://radar.com', logo: '📍', placeholder: 'radar_...', docsUrl: 'https://radar.com/documentation' },
  { id: 'positionstack-api-v2', name: 'PositionStack', category: 'Mapas', description: 'Geocoding forward y reverse con cobertura global.', website: 'https://positionstack.com', logo: '📌', placeholder: 'positionstack_...', docsUrl: 'https://positionstack.com/documentation' },

  // Fintech (especializados)
  { id: 'stripe-connect-api', name: 'Stripe Connect', category: 'Fintech', description: 'Marketplace payments: split payments y onboarding.', website: 'https://stripe.com/connect', logo: '🔗', placeholder: 'sk_connect_...', docsUrl: 'https://stripe.com/docs/connect' },
  { id: 'marqeta-api', name: 'Marqeta', category: 'Fintech', description: 'Card issuing platform: tarjetas virtuales y físicas.', website: 'https://marqeta.com', logo: '💳', placeholder: 'marqeta_...', docsUrl: 'https://www.marqeta.com/docs/developer-guides' },
  { id: 'lithic-api', name: 'Lithic', category: 'Fintech', description: 'Emisión de tarjetas virtuales con controls y webhooks.', website: 'https://lithic.com', logo: '🪨', placeholder: 'lithic_...', docsUrl: 'https://docs.lithic.com' },
  { id: 'modern-treasury-api', name: 'Modern Treasury', category: 'Fintech', description: 'Payment operations: ledger, reconciliation y workflows.', website: 'https://moderntreasury.com', logo: '🏦', placeholder: 'mt_...', docsUrl: 'https://docs.moderntreasury.com' },
  { id: 'increase-api', name: 'Increase', category: 'Fintech', description: 'Banking infrastructure: ACH, wire y check por API.', website: 'https://increase.com', logo: '📈', placeholder: 'increase_...', docsUrl: 'https://increase.com/documentation' },

  // IoT (especializados)
  { id: 'arduino-cloud-api', name: 'Arduino Cloud', category: 'IoT', description: 'Plataforma IoT con dashboards, OTA y dispositivos Arduino.', website: 'https://cloud.arduino.cc', logo: '🔌', placeholder: 'arduino_...', docsUrl: 'https://docs.arduino.cc/arduino-cloud' },
  { id: 'losant-api-v2', name: 'Losant', category: 'IoT', description: 'Enterprise IoT platform con visual workflow engine.', website: 'https://losant.com', logo: '📟', placeholder: 'losant_...', docsUrl: 'https://docs.losant.com/rest-api/overview' },
  { id: 'hologram-api', name: 'Hologram', category: 'IoT', description: 'Conectividad celular global para dispositivos IoT.', website: 'https://hologram.io', logo: '📶', placeholder: 'hologram_...', docsUrl: 'https://www.hologram.io/references/http-api' },
  { id: 'chirpstack-api', name: 'ChirpStack', category: 'IoT', description: 'Network server open-source para redes LoRaWAN.', website: 'https://chirpstack.io', logo: '📡', placeholder: 'chirpstack_...', docsUrl: 'https://www.chirpstack.io/docs' },

  // Blockchain (especializados)
  { id: 'solana-api', name: 'Solana', category: 'Blockchain', description: 'Blockchain de alto rendimiento: DeFi, NFTs y dApps.', website: 'https://solana.com', logo: '◎', placeholder: 'solana_...', docsUrl: 'https://docs.solana.com' },
  { id: 'polygon-api', name: 'Polygon', category: 'Blockchain', description: 'Layer 2 de Ethereum: escalabilidad y bajos costes.', website: 'https://polygon.technology', logo: '🟣', placeholder: 'polygon_...', docsUrl: 'https://docs.polygon.technology' },
  { id: 'chainlink-api', name: 'Chainlink', category: 'Blockchain', description: 'Oracles descentralizados: price feeds, VRF y automation.', website: 'https://chain.link', logo: '🔗', placeholder: 'chainlink_...', docsUrl: 'https://docs.chain.link' },
  { id: 'the-graph-api', name: 'The Graph', category: 'Blockchain', description: 'Indexing de blockchains con subgraphs GraphQL.', website: 'https://thegraph.com', logo: '📊', placeholder: 'thegraph_...', docsUrl: 'https://thegraph.com/docs' },

  // Varios nuevos servicios populares
  { id: 'retool-api-v2', name: 'Retool', category: 'Productividad', description: 'Low-code para construir herramientas internas rápidamente.', website: 'https://retool.com', logo: '🔧', placeholder: 'retool_...', docsUrl: 'https://docs.retool.com' },
  { id: 'appsmith-api-v2', name: 'Appsmith', category: 'Productividad', description: 'Open-source low-code para apps internas y dashboards.', website: 'https://appsmith.com', logo: '📱', placeholder: 'appsmith_...', docsUrl: 'https://docs.appsmith.com' },
  { id: 'budibase-api-v2', name: 'Budibase', category: 'Productividad', description: 'Low-code open-source para apps de negocio.', website: 'https://budibase.com', logo: '🟦', placeholder: 'budibase_...', docsUrl: 'https://docs.budibase.com' },
  { id: 'nocodb-api', name: 'NocoDB', category: 'Productividad', description: 'Alternativa open-source a Airtable con API REST.', website: 'https://nocodb.com', logo: '📊', placeholder: 'nocodb_...', docsUrl: 'https://docs.nocodb.com' },
  { id: 'baserow-api', name: 'Baserow', category: 'Productividad', description: 'Base de datos no-code open-source tipo Airtable.', website: 'https://baserow.io', logo: '📋', placeholder: 'baserow_...', docsUrl: 'https://baserow.io/docs' },

  { id: 'webflow-api', name: 'Webflow', category: 'Design', description: 'Web design visual con CMS, hosting y API completa.', website: 'https://webflow.com', logo: '🌊', placeholder: 'webflow_...', docsUrl: 'https://developers.webflow.com' },
  { id: 'framer-api-v2', name: 'Framer', category: 'Design', description: 'Web builder con animations, CMS y componentes React.', website: 'https://framer.com', logo: '🖤', placeholder: 'framer_...', docsUrl: 'https://www.framer.com/developers' },
  { id: 'lottie-api', name: 'LottieFiles', category: 'Design', description: 'Animaciones Lottie: crear, editar y alojar JSON animations.', website: 'https://lottiefiles.com', logo: '🎞️', placeholder: 'lottie_...', docsUrl: 'https://developers.lottiefiles.com' },
  { id: 'iconify-api-v2', name: 'Iconify', category: 'Design', description: 'API de iconos: 200k+ iconos de 150+ colecciones.', website: 'https://iconify.design', logo: '🎯', placeholder: 'iconify_...', docsUrl: 'https://iconify.design/docs/api' },

  { id: 'ghost-api', name: 'Ghost CMS', category: 'Productividad', description: 'CMS headless open-source para publicaciones y newsletters.', website: 'https://ghost.org', logo: '👻', placeholder: 'ghost_...', docsUrl: 'https://ghost.org/docs/content-api' },
  { id: 'strapi-api-v2', name: 'Strapi', category: 'Productividad', description: 'Headless CMS open-source con API REST y GraphQL.', website: 'https://strapi.io', logo: '🚀', placeholder: 'strapi_...', docsUrl: 'https://docs.strapi.io' },
  { id: 'sanity-api-v2', name: 'Sanity', category: 'Productividad', description: 'CMS headless con GROQ query language y real-time.', website: 'https://sanity.io', logo: '📝', placeholder: 'sanity_...', docsUrl: 'https://www.sanity.io/docs' },
  { id: 'contentful-api-v2', name: 'Contentful', category: 'Productividad', description: 'CMS headless enterprise con CDN y webhooks.', website: 'https://contentful.com', logo: '📦', placeholder: 'contentful_...', docsUrl: 'https://www.contentful.com/developers/docs' },
  { id: 'prismic-api', name: 'Prismic', category: 'Productividad', description: 'CMS headless con slice machine y preview en vivo.', website: 'https://prismic.io', logo: '🔺', placeholder: 'prismic_...', docsUrl: 'https://prismic.io/docs' },
  { id: 'datocms-api', name: 'DatoCMS', category: 'Productividad', description: 'CMS headless con GraphQL API y gestión de assets.', website: 'https://datocms.com', logo: '📋', placeholder: 'datocms_...', docsUrl: 'https://www.datocms.com/docs' },

  { id: 'vercel-ai-sdk', name: 'Vercel AI SDK', category: 'AI & ML', description: 'SDK para construir interfaces de IA con streaming y tools.', website: 'https://sdk.vercel.ai', logo: '▲', placeholder: 'vercel_ai_...', docsUrl: 'https://sdk.vercel.ai/docs' },
  { id: 'openrouter-api', name: 'OpenRouter', category: 'AI & ML', description: 'Gateway unificado a todos los LLMs: OpenAI, Anthropic y más.', website: 'https://openrouter.ai', logo: '🔀', placeholder: 'sk-or-...', docsUrl: 'https://openrouter.ai/docs' },
  { id: 'helicone-api', name: 'Helicone', category: 'AI & ML', description: 'Observabilidad para LLMs: logging, caching y rate limiting.', website: 'https://helicone.ai', logo: '☀️', placeholder: 'helicone_...', docsUrl: 'https://docs.helicone.ai' },
  { id: 'portkey-api', name: 'Portkey', category: 'AI & ML', description: 'AI gateway con fallbacks, caching y observabilidad.', website: 'https://portkey.ai', logo: '🔑', placeholder: 'portkey_...', docsUrl: 'https://docs.portkey.ai' },

  { id: 'axiom-api', name: 'Axiom', category: 'Monitoring', description: 'Ingest, store y query logs y events sin límites.', website: 'https://axiom.co', logo: '📊', placeholder: 'axiom_...', docsUrl: 'https://axiom.co/docs' },
  { id: 'betterstack-api', name: 'Better Stack', category: 'Monitoring', description: 'Uptime monitoring, logs y status pages unificados.', website: 'https://betterstack.com', logo: '📡', placeholder: 'betterstack_...', docsUrl: 'https://betterstack.com/docs' },
  { id: 'highlight-api', name: 'Highlight.io', category: 'Monitoring', description: 'Full-stack monitoring: session replay, errors y logs.', website: 'https://highlight.io', logo: '💡', placeholder: 'highlight_...', docsUrl: 'https://www.highlight.io/docs' },
  { id: 'baselime-api', name: 'Baselime', category: 'Monitoring', description: 'Observabilidad para serverless con queries naturales.', website: 'https://baselime.io', logo: '🍋', placeholder: 'baselime_...', docsUrl: 'https://baselime.io/docs' },

  { id: 'resemble-ai-api', name: 'Resemble AI', category: 'AI & ML', description: 'Clonación de voz y síntesis de speech con IA.', website: 'https://resemble.ai', logo: '🎤', placeholder: 'resemble_...', docsUrl: 'https://docs.resemble.ai' },
  { id: 'play-ht-api', name: 'Play.ht', category: 'AI & ML', description: 'Text-to-speech con voces realistas y clonación de voz.', website: 'https://play.ht', logo: '🔊', placeholder: 'playht_...', docsUrl: 'https://docs.play.ht' },
  { id: 'whisper-api', name: 'Whisper (OpenAI)', category: 'AI & ML', description: 'Speech-to-text de OpenAI con soporte multi-idioma.', website: 'https://openai.com/research/whisper', logo: '🎧', placeholder: 'whisper_...', docsUrl: 'https://platform.openai.com/docs/guides/speech-to-text' },
  { id: 'gladia-api', name: 'Gladia', category: 'AI & ML', description: 'Transcripción de audio con AI: fast, accurate y multi-lang.', website: 'https://gladia.io', logo: '📝', placeholder: 'gladia_...', docsUrl: 'https://docs.gladia.io' },
  // ── Batch 8: tokens 438–500 (63 restantes) ──

  // Testing (especializados)
  { id: 'cypress-cloud-api', name: 'Cypress Cloud', category: 'Testing', description: 'Dashboard para tests de Cypress con parallelization.', website: 'https://cloud.cypress.io', logo: '🌲', placeholder: 'cypress_...', docsUrl: 'https://docs.cypress.io/guides/cloud/introduction' },
  { id: 'playwright-api', name: 'Playwright', category: 'Testing', description: 'Browser automation y testing end-to-end de Microsoft.', website: 'https://playwright.dev', logo: '🎭', placeholder: 'playwright_...', docsUrl: 'https://playwright.dev/docs/api/class-playwright' },
  { id: 'mabl-api-v2', name: 'Mabl', category: 'Testing', description: 'Testing inteligente con AI para apps web.', website: 'https://mabl.com', logo: '🤖', placeholder: 'mabl_...', docsUrl: 'https://api.mabl.com' },

  // Search (especializados)
  { id: 'algolia-api2', name: 'Algolia', category: 'Search', description: 'Search-as-a-service con AI re-ranking y recommendations.', website: 'https://algolia.com', logo: '🔎', placeholder: 'algolia_...', docsUrl: 'https://www.algolia.com/doc' },
  { id: 'coveo-api', name: 'Coveo', category: 'Search', description: 'Search enterprise con AI relevance y recommendations.', website: 'https://coveo.com', logo: '🔮', placeholder: 'coveo_...', docsUrl: 'https://docs.coveo.com' },

  // Logistics (especializados)
  { id: 'project44-api', name: 'project44', category: 'Logistics', description: 'Visibilidad de supply chain en tiempo real.', website: 'https://project44.com', logo: '🚛', placeholder: 'p44_...', docsUrl: 'https://developers.project44.com' },
  { id: 'flexport-api-v2', name: 'Flexport', category: 'Logistics', description: 'Freight forwarding digital con tracking global.', website: 'https://flexport.com', logo: '📦', placeholder: 'flexport_...', docsUrl: 'https://apidocs.flexport.com' },
  { id: 'routific-api', name: 'Routific', category: 'Logistics', description: 'Optimización de rutas de entrega para flotas.', website: 'https://routific.com', logo: '🗺️', placeholder: 'routific_...', docsUrl: 'https://docs.routific.com' },

  // Healthcare (especializados)
  { id: 'athenahealth-api', name: 'Athenahealth', category: 'Healthcare', description: 'EHR, practice management y patient engagement.', website: 'https://athenahealth.com', logo: '🏥', placeholder: 'athena_...', docsUrl: 'https://docs.athenahealth.com' },
  { id: 'epic-fhir-api', name: 'Epic FHIR', category: 'Healthcare', description: 'Interoperabilidad FHIR con el EHR más usado de EE.UU.', website: 'https://open.epic.com', logo: '⚕️', placeholder: 'epic_...', docsUrl: 'https://open.epic.com/Documentation' },

  // Education (especializados)
  { id: 'coursera-api', name: 'Coursera', category: 'Education', description: 'API de cursos y programas de universidades globales.', website: 'https://coursera.org', logo: '🎒', placeholder: 'coursera_...', docsUrl: 'https://build.coursera.org/app-platform/catalog' },
  { id: 'udemy-api', name: 'Udemy', category: 'Education', description: 'API de cursos online y contenido educativo.', website: 'https://udemy.com', logo: '📚', placeholder: 'udemy_...', docsUrl: 'https://www.udemy.com/developers' },

  // Food & Delivery (especializados)
  { id: 'rappi-api-v2', name: 'Rappi', category: 'Food & Delivery', description: 'Super app de delivery en Latinoamérica.', website: 'https://rappi.com', logo: '🧡', placeholder: 'rappi_...', docsUrl: 'https://developers.rappi.com' },
  { id: 'just-eat-api', name: 'Just Eat', category: 'Food & Delivery', description: 'API de delivery de comida en Europa.', website: 'https://justeat.com', logo: '🍕', placeholder: 'justeat_...', docsUrl: 'https://developers.just-eat.com' },

  // Travel (especializados)
  { id: 'amadeus-api2', name: 'Amadeus', category: 'Travel', description: 'GDS líder: vuelos, hoteles, coches y actividades.', website: 'https://amadeus.com', logo: '✈️', placeholder: 'amadeus_...', docsUrl: 'https://developers.amadeus.com' },
  { id: 'sabre-api', name: 'Sabre', category: 'Travel', description: 'GDS con APIs de vuelos, hoteles y gestión de viajes.', website: 'https://sabre.com', logo: '🌐', placeholder: 'sabre_...', docsUrl: 'https://developer.sabre.com' },

  // Gaming (especializados)
  { id: 'steam-api', name: 'Steam Web API', category: 'Gaming', description: 'API de Steam: jugadores, juegos, logros y stats.', website: 'https://store.steampowered.com', logo: '🎮', placeholder: 'steam_...', docsUrl: 'https://developer.valvesoftware.com/wiki/Steam_Web_API' },
  { id: 'epic-games-api', name: 'Epic Games Store', category: 'Gaming', description: 'Epic Online Services: auth, matchmaking y achievements.', website: 'https://store.epicgames.com', logo: '🎯', placeholder: 'epic_games_...', docsUrl: 'https://dev.epicgames.com/docs' },

  // Government (especializados)
  { id: 'ine-api', name: 'INE España', category: 'Government', description: 'Datos estadísticos del Instituto Nacional de Estadística.', website: 'https://ine.es', logo: '🇪🇸', placeholder: 'ine_...', docsUrl: 'https://www.ine.es/dyngs/DataLab' },
  { id: 'boe-api', name: 'BOE', category: 'Government', description: 'Boletín Oficial del Estado: legislación y anuncios.', website: 'https://boe.es', logo: '📜', placeholder: 'boe_...', docsUrl: 'https://www.boe.es/datosabiertos' },

  // Weather (especializados)
  { id: 'aemet-api2', name: 'AEMET', category: 'Weather', description: 'Agencia Estatal de Meteorología de España: pronósticos y datos.', website: 'https://aemet.es', logo: '🌤️', placeholder: 'aemet_...', docsUrl: 'https://opendata.aemet.es/opendata/api' },
  { id: 'stormglass-api-v2', name: 'Storm Glass', category: 'Weather', description: 'API meteorológica marina: olas, viento y mareas.', website: 'https://stormglass.io', logo: '🌊', placeholder: 'stormglass_...', docsUrl: 'https://docs.stormglass.io' },

  // SMS (especializados)
  { id: 'messagebird-sms', name: 'MessageBird SMS', category: 'SMS', description: 'SMS global con alta deliverability y routing inteligente.', website: 'https://messagebird.com', logo: '📲', placeholder: 'mb_sms_...', docsUrl: 'https://developers.messagebird.com/api/sms-messaging' },
  { id: 'bulksms-api', name: 'BulkSMS', category: 'SMS', description: 'SMS masivo internacional con API y webhooks.', website: 'https://bulksms.com', logo: '📨', placeholder: 'bulksms_...', docsUrl: 'https://www.bulksms.com/developer/json/message' },

  // Varios especializados finales
  { id: 'cal-video-api', name: 'Cal Video', category: 'Comunicación', description: 'Video conferencing open-source integrado con Cal.com.', website: 'https://cal.com', logo: '📹', placeholder: 'cal_video_...', docsUrl: 'https://cal.com/docs' },
  { id: 'daily-api', name: 'Daily.co', category: 'Comunicación', description: 'Video y audio real-time APIs para apps web y móvil.', website: 'https://daily.co', logo: '📞', placeholder: 'daily_...', docsUrl: 'https://docs.daily.co' },
  { id: 'livekit-api-v2', name: 'LiveKit', category: 'Comunicación', description: 'Infraestructura open-source de audio y video en tiempo real.', website: 'https://livekit.io', logo: '🎙️', placeholder: 'livekit_...', docsUrl: 'https://docs.livekit.io' },
  { id: 'agora-api2', name: 'Agora', category: 'Comunicación', description: 'Video y voice calling SDK para apps con baja latencia.', website: 'https://agora.io', logo: '📡', placeholder: 'agora_...', docsUrl: 'https://docs.agora.io' },
  { id: 'dyte-api', name: 'Dyte', category: 'Comunicación', description: 'SDK de video meeting embeddable con plugins y AI.', website: 'https://dyte.io', logo: '🔵', placeholder: 'dyte_...', docsUrl: 'https://docs.dyte.io' },

  { id: 'ably-api2', name: 'Ably', category: 'Comunicación', description: 'Realtime messaging infrastructure: pub/sub, presence y history.', website: 'https://ably.com', logo: '⚡', placeholder: 'ably_...', docsUrl: 'https://ably.com/docs' },
  { id: 'centrifugo-api', name: 'Centrifugo', category: 'Comunicación', description: 'Servidor WebSocket y SSE escalable para real-time.', website: 'https://centrifugal.dev', logo: '🌀', placeholder: 'centrifugo_...', docsUrl: 'https://centrifugal.dev/docs' },
  { id: 'soketi-api', name: 'Soketi', category: 'Comunicación', description: 'Servidor WebSocket open-source compatible con Pusher.', website: 'https://soketi.app', logo: '🔌', placeholder: 'soketi_...', docsUrl: 'https://docs.soketi.app' },

  { id: 'neon-serverless-v2', name: 'Neon Serverless Driver', category: 'Base de datos', description: 'Driver PostgreSQL HTTP y WebSocket para serverless.', website: 'https://neon.tech', logo: '💚', placeholder: 'neon_ws_...', docsUrl: 'https://neon.tech/docs/serverless/serverless-driver' },
  { id: 'turso-embedded-v2', name: 'Turso Embedded Replicas', category: 'Base de datos', description: 'SQLite con réplicas embebidas para latencia cercana a cero.', website: 'https://turso.tech', logo: '🐢', placeholder: 'turso_emb_...', docsUrl: 'https://docs.turso.tech/features/embedded-replicas' },
  { id: 'duckdb-api', name: 'DuckDB', category: 'Base de datos', description: 'Base de datos analítica in-process tipo SQLite para OLAP.', website: 'https://duckdb.org', logo: '🦆', placeholder: 'duckdb_...', docsUrl: 'https://duckdb.org/docs' },

  { id: 'tinybird-api-v2', name: 'Tinybird', category: 'Analytics', description: 'Real-time analytics: ingest, transform y API endpoints.', website: 'https://tinybird.co', logo: '🐦', placeholder: 'tinybird_...', docsUrl: 'https://www.tinybird.co/docs' },
  { id: 'cube-api', name: 'Cube', category: 'Analytics', description: 'Semantic layer para data apps: cache, API y pre-aggregations.', website: 'https://cube.dev', logo: '🧊', placeholder: 'cube_...', docsUrl: 'https://cube.dev/docs' },
  { id: 'jitsu-api', name: 'Jitsu', category: 'Analytics', description: 'Data collection open-source para analytics pipelines.', website: 'https://jitsu.com', logo: '🔄', placeholder: 'jitsu_...', docsUrl: 'https://jitsu.com/docs' },

  { id: 'qovery-api', name: 'Qovery', category: 'Cloud', description: 'PaaS que abstrae Kubernetes para deploy de apps.', website: 'https://qovery.com', logo: '🟣', placeholder: 'qovery_...', docsUrl: 'https://hub.qovery.com/docs' },
  { id: 'coolify-api-v2', name: 'Coolify', category: 'Cloud', description: 'Self-hosted PaaS open-source alternativa a Heroku.', website: 'https://coolify.io', logo: '❄️', placeholder: 'coolify_...', docsUrl: 'https://coolify.io/docs' },
  { id: 'caprover-api', name: 'CapRover', category: 'Cloud', description: 'PaaS self-hosted con one-click deploys y Let\'s Encrypt.', website: 'https://caprover.com', logo: '🧑‍✈️', placeholder: 'caprover_...', docsUrl: 'https://caprover.com/docs' },

  { id: 'posthog-api2', name: 'PostHog', category: 'Feature Flags', description: 'Feature flags con experiments, analytics y session replay.', website: 'https://posthog.com', logo: '🦔', placeholder: 'posthog_ff_...', docsUrl: 'https://posthog.com/docs/feature-flags' },
  { id: 'statsig-api', name: 'Statsig', category: 'Feature Flags', description: 'Feature gates y experiments con datos estadísticos.', website: 'https://statsig.com', logo: '📊', placeholder: 'statsig_...', docsUrl: 'https://docs.statsig.com' },
  { id: 'growthbook-api-v2', name: 'GrowthBook', category: 'Feature Flags', description: 'Feature flags y A/B testing open-source.', website: 'https://growthbook.io', logo: '🌱', placeholder: 'growthbook_...', docsUrl: 'https://docs.growthbook.io' },

  { id: 'rudderstack-api-v2', name: 'RudderStack', category: 'Analytics', description: 'Customer data platform open-source: collect y route.', website: 'https://rudderstack.com', logo: '🔀', placeholder: 'rudderstack_...', docsUrl: 'https://www.rudderstack.com/docs' },
  { id: 'freshpaint-api', name: 'Freshpaint', category: 'Analytics', description: 'Healthcare CDP con HIPAA compliance y data governance.', website: 'https://freshpaint.io', logo: '🎨', placeholder: 'freshpaint_...', docsUrl: 'https://documentation.freshpaint.io' },
  // ── últimos 17 tokens ──
  { id: 'hookdeck-api-v2', name: 'Hookdeck', category: 'DevOps', description: 'Webhook infrastructure: ingestion, routing y retry.', website: 'https://hookdeck.com', logo: '🪝', placeholder: 'hookdeck_...', docsUrl: 'https://hookdeck.com/docs' },
  { id: 'svix-api-v2', name: 'Svix', category: 'DevOps', description: 'Webhooks as a service: envío, retry y portal.', website: 'https://svix.com', logo: '📨', placeholder: 'svix_...', docsUrl: 'https://docs.svix.com' },
  { id: 'zitadel-api', name: 'Zitadel', category: 'Auth', description: 'Identity management open-source con multi-tenancy.', website: 'https://zitadel.com', logo: '🔑', placeholder: 'zitadel_...', docsUrl: 'https://zitadel.com/docs' },
  { id: 'keycloak-api-v2', name: 'Keycloak', category: 'Auth', description: 'Identity y access management open-source de Red Hat.', website: 'https://keycloak.org', logo: '🔐', placeholder: 'keycloak_...', docsUrl: 'https://www.keycloak.org/documentation' },
  { id: 'logto-api', name: 'Logto', category: 'Auth', description: 'Auth open-source con management console y webhooks.', website: 'https://logto.io', logo: '🛂', placeholder: 'logto_...', docsUrl: 'https://docs.logto.io' },
  { id: 'partykit-api', name: 'PartyKit', category: 'Cloud', description: 'Plataforma para apps colaborativas y multiplayer.', website: 'https://partykit.io', logo: '🎉', placeholder: 'partykit_...', docsUrl: 'https://docs.partykit.io' },
  { id: 'hono-api', name: 'Hono', category: 'Cloud', description: 'Web framework ultraligero para edge runtimes.', website: 'https://hono.dev', logo: '🔥', placeholder: 'hono_...', docsUrl: 'https://hono.dev/docs' },
  { id: 'grafbase-api', name: 'Grafbase', category: 'Base de datos', description: 'GraphQL backend con edge caching y serverless.', website: 'https://grafbase.com', logo: '📊', placeholder: 'grafbase_...', docsUrl: 'https://grafbase.com/docs' },
  { id: 'planetscale-vitess', name: 'PlanetScale Vitess', category: 'Base de datos', description: 'MySQL horizontal scaling con Vitess open-source.', website: 'https://planetscale.com', logo: '🪐', placeholder: 'ps_vitess_...', docsUrl: 'https://planetscale.com/docs' },
  { id: 'expo-api', name: 'Expo', category: 'Cloud', description: 'Platform para apps React Native: builds, updates y más.', website: 'https://expo.dev', logo: '📱', placeholder: 'expo_...', docsUrl: 'https://docs.expo.dev' },
  { id: 'capacitor-api', name: 'Capacitor', category: 'Cloud', description: 'Runtime de apps nativas cross-platform con web tech.', website: 'https://capacitorjs.com', logo: '⚡', placeholder: 'capacitor_...', docsUrl: 'https://capacitorjs.com/docs' },
  { id: 'tauri-api', name: 'Tauri', category: 'Cloud', description: 'Framework para apps desktop con web frontend.', website: 'https://tauri.app', logo: '🦀', placeholder: 'tauri_...', docsUrl: 'https://tauri.app/v1/api' },
  { id: 'electron-api', name: 'Electron', category: 'Cloud', description: 'Apps desktop cross-platform con JavaScript y Node.js.', website: 'https://electronjs.org', logo: '💻', placeholder: 'electron_...', docsUrl: 'https://www.electronjs.org/docs' },
  { id: 'cronofy-api', name: 'Cronofy', category: 'Scheduling', description: 'Calendar API unificada: Google, Outlook, iCloud y más.', website: 'https://cronofy.com', logo: '📅', placeholder: 'cronofy_...', docsUrl: 'https://docs.cronofy.com' },
  { id: 'nylas-api2', name: 'Nylas', category: 'Scheduling', description: 'APIs de email, calendar y contacts unificadas.', website: 'https://nylas.com', logo: '📧', placeholder: 'nylas_...', docsUrl: 'https://developer.nylas.com' },
  { id: 'plunk-api-v2', name: 'Plunk', category: 'Email', description: 'Email open-source para SaaS: transaccional y marketing.', website: 'https://useplunk.com', logo: '📤', placeholder: 'plunk_...', docsUrl: 'https://docs.useplunk.com' },
  { id: 'react-email-api', name: 'React Email', category: 'Email', description: 'Componentes React para construir emails responsive.', website: 'https://react.email', logo: '⚛️', placeholder: 'react_email_...', docsUrl: 'https://react.email/docs/introduction' },
];

// ── Component ──

interface TokensTabProps {
  isDark: boolean;
  t: (key: string) => string;
}

export function TokensTab({ isDark }: TokensTabProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Todas');
  const [selectedToken, setSelectedToken] = useState<TokenDef | null>(null);
  const [savedTokens, setSavedTokens] = useState<Record<string, { configured: boolean; masked: string }>>({});
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    agentApi.getTokens().then((data) => {
      setSavedTokens(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = TOKENS;
    if (category !== 'Todas') list = list.filter((t) => t.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.id.includes(q),
      );
    }
    return list;
  }, [search, category]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Todas: TOKENS.length };
    for (const t of TOKENS) counts[t.category] = (counts[t.category] || 0) + 1;
    return counts;
  }, []);

  const handleSave = async (token: TokenDef) => {
    if (!inputValue.trim()) return;
    setSaving(true);
    try {
      const res = await agentApi.setToken(token.id, inputValue.trim());
      setSavedTokens((prev) => ({ ...prev, [token.id]: { configured: res.configured, masked: res.masked } }));
      setInputValue('');
      setShowValue(false);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleRemove = async (token: TokenDef) => {
    try {
      await agentApi.removeToken(token.id);
      setSavedTokens((prev) => {
        const next = { ...prev };
        delete next[token.id];
        return next;
      });
      setInputValue('');
    } catch { /* ignore */ }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // ── Profile view ──
  if (selectedToken) {
    const info = savedTokens[selectedToken.id];
    return (
      <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-200">
        {/* Header */}
        <button
          onClick={() => { setSelectedToken(null); setInputValue(''); setShowValue(false); }}
          className={cn(
            'flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors shrink-0',
            isDark ? 'text-zinc-400 hover:text-zinc-200' : 'text-gray-500 hover:text-gray-700',
          )}
        >
          <ChevronLeft className="size-3.5" />
          Volver al catálogo
        </button>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Profile card */}
          <div className={cn(
            'rounded-xl p-4 mb-4 border',
            isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-gray-50 border-gray-200',
          )}>
            <div className="flex items-start gap-3">
              <div className={cn(
                'size-12 rounded-xl flex items-center justify-center text-2xl shrink-0',
                isDark ? 'bg-zinc-800' : 'bg-white shadow-sm',
              )}>
                {selectedToken.logo}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={cn('text-sm font-bold', isDark ? 'text-zinc-100' : 'text-gray-900')}>
                  {selectedToken.name}
                </h3>
                <span className={cn(
                  'inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full mt-1',
                  isDark ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-100 text-violet-600',
                )}>
                  {selectedToken.category}
                </span>
              </div>
              {info?.configured && (
                <div className={cn(
                  'flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg',
                  isDark ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600',
                )}>
                  <CheckCircle2 className="size-3" />
                  Configurado
                </div>
              )}
            </div>

            <p className={cn('text-xs mt-3 leading-relaxed', isDark ? 'text-zinc-400' : 'text-gray-600')}>
              {selectedToken.description}
            </p>

            {/* Links */}
            <div className="flex items-center gap-3 mt-3">
              <a
                href={selectedToken.website}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-1 text-[10px] font-medium transition-colors',
                  isDark ? 'text-sky-400 hover:text-sky-300' : 'text-sky-600 hover:text-sky-500',
                )}
              >
                <ExternalLink className="size-3" />
                Sitio web
              </a>
              <a
                href={selectedToken.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-1 text-[10px] font-medium transition-colors',
                  isDark ? 'text-violet-400 hover:text-violet-300' : 'text-violet-600 hover:text-violet-500',
                )}
              >
                <ExternalLink className="size-3" />
                Documentación
              </a>
            </div>
          </div>

          {/* Token value section */}
          <div className={cn(
            'rounded-xl p-4 border',
            isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-gray-50 border-gray-200',
          )}>
            <div className="flex items-center gap-2 mb-3">
              <Key className={cn('size-3.5', isDark ? 'text-amber-400' : 'text-amber-500')} />
              <h4 className={cn('text-xs font-bold', isDark ? 'text-zinc-200' : 'text-gray-800')}>
                API Key / Token
              </h4>
            </div>

            {info?.configured && !inputValue ? (
              <div className="space-y-3">
                <div className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs',
                  isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-500',
                )}>
                  <Shield className="size-3 shrink-0 text-emerald-400" />
                  <span className="flex-1 truncate">{info.masked}</span>
                  <button
                    onClick={() => handleCopy(info.masked)}
                    className={cn('shrink-0 transition-colors', isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}
                  >
                    {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setInputValue('')}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium py-2 rounded-lg transition-colors',
                      isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                    )}
                    onClickCapture={() => setInputValue(' ')}
                  >
                    <Key className="size-3" />
                    Cambiar clave
                  </button>
                  <button
                    onClick={() => handleRemove(selectedToken)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 text-[11px] font-medium py-2 px-3 rounded-lg transition-colors',
                      isDark ? 'text-red-400 hover:bg-red-950/40' : 'text-red-500 hover:bg-red-50',
                    )}
                  >
                    <Trash2 className="size-3" />
                    Eliminar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type={showValue ? 'text' : 'password'}
                    value={inputValue === ' ' ? '' : inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={selectedToken.placeholder}
                    className={cn(
                      'w-full pr-8 pl-3 py-2 rounded-lg text-xs font-mono outline-none transition-colors border',
                      isDark
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500'
                        : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-violet-500',
                    )}
                    autoFocus
                  />
                  <button
                    onClick={() => setShowValue(!showValue)}
                    className={cn('absolute right-2 top-1/2 -translate-y-1/2', isDark ? 'text-zinc-500' : 'text-gray-400')}
                  >
                    {showValue ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSave(selectedToken)}
                    disabled={saving || !inputValue.trim() || inputValue === ' '}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold py-2 rounded-lg transition-all',
                      saving || !inputValue.trim() || inputValue === ' '
                        ? isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-100 text-gray-400'
                        : 'bg-violet-600 hover:bg-violet-500 text-white',
                    )}
                  >
                    {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                    Guardar
                  </button>
                  {info?.configured && (
                    <button
                      onClick={() => { setInputValue(''); setShowValue(false); }}
                      className={cn(
                        'px-3 py-2 rounded-lg text-[11px] font-medium transition-colors',
                        isDark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                      )}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick info */}
          <div className={cn('mt-4 rounded-xl p-3 border', isDark ? 'bg-zinc-900/30 border-zinc-800/60' : 'bg-gray-50/50 border-gray-100')}>
            <p className={cn('text-[10px] leading-relaxed', isDark ? 'text-zinc-500' : 'text-gray-400')}>
              🔒 Las claves se almacenan cifradas en el servidor. Solo se muestra una versión enmascarada.
              Visita la documentación para obtener tu clave API.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Catalog view ──
  return (
    <div className="flex flex-col h-full -mx-4 -my-3">
      {/* Search */}
      <div className={cn('px-3 py-2 border-b shrink-0', isDark ? 'border-zinc-800' : 'border-gray-200')}>
        <div className={cn(
          'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors',
          isDark ? 'bg-zinc-900 border-zinc-800 focus-within:border-violet-500' : 'bg-gray-50 border-gray-200 focus-within:border-violet-500',
        )}>
          <Search className={cn('size-3.5 shrink-0', isDark ? 'text-zinc-500' : 'text-gray-400')} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tokens, APIs, servicios..."
            className={cn(
              'flex-1 text-xs bg-transparent outline-none',
              isDark ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-900 placeholder:text-gray-400',
            )}
          />
          {search && (
            <button onClick={() => setSearch('')} className={cn(isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}>
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Category filter */}
      <div className={cn(
        'flex gap-1 px-3 py-2 overflow-x-auto scrollbar-none border-b shrink-0',
        isDark ? 'border-zinc-800' : 'border-gray-200',
      )}>
        {CATEGORIES.map((cat) => {
          const count = categoryCounts[cat] || 0;
          const isActive = category === cat;
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors',
                isActive
                  ? isDark ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-100 text-violet-600'
                  : isDark ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
              )}
            >
              {cat}
              <span className={cn(
                'text-[8px] px-1 rounded',
                isActive
                  ? isDark ? 'bg-violet-500/20 text-violet-300' : 'bg-violet-200 text-violet-700'
                  : isDark ? 'bg-zinc-800 text-zinc-600' : 'bg-gray-200 text-gray-500',
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Token list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className={cn('size-5 animate-spin', isDark ? 'text-violet-400' : 'text-violet-500')} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Search className={cn('size-6', isDark ? 'text-zinc-700' : 'text-gray-300')} />
            <p className={cn('text-xs', isDark ? 'text-zinc-500' : 'text-gray-400')}>
              No se encontraron tokens
            </p>
          </div>
        ) : (
          <div className="py-1 px-2 space-y-0.5">
            {filtered.map((token) => {
              const info = savedTokens[token.id];
              return (
                <button
                  key={token.id}
                  onClick={() => { setSelectedToken(token); setInputValue(''); setShowValue(false); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left group',
                    isDark ? 'hover:bg-zinc-800/60' : 'hover:bg-gray-50',
                  )}
                >
                  <div className={cn(
                    'size-8 rounded-lg flex items-center justify-center text-base shrink-0 transition-transform group-hover:scale-110',
                    isDark ? 'bg-zinc-800/80' : 'bg-gray-100',
                  )}>
                    {token.logo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('text-xs font-semibold truncate', isDark ? 'text-zinc-200' : 'text-gray-800')}>
                        {token.name}
                      </span>
                      {info?.configured && (
                        <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <p className={cn('text-[10px] truncate', isDark ? 'text-zinc-500' : 'text-gray-400')}>
                      {token.description}
                    </p>
                  </div>
                  <ChevronLeft className={cn(
                    'size-3 shrink-0 rotate-180 opacity-0 group-hover:opacity-100 transition-opacity',
                    isDark ? 'text-zinc-600' : 'text-gray-400',
                  )} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer counter */}
      <div className={cn(
        'flex items-center justify-between px-3 py-1.5 border-t shrink-0 text-[10px]',
        isDark ? 'border-zinc-800 text-zinc-600' : 'border-gray-200 text-gray-400',
      )}>
        <span>{filtered.length} de {TOKENS.length} servicios</span>
        <span>{Object.keys(savedTokens).length} configurados</span>
      </div>
    </div>
  );
}
