# -*- coding: utf-8 -*-
"""Regenera tokens-batch2.txt: 200 tokens, categorías semánticas, cuotas 6×15 + 5×22."""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

CATEGORIES = [
    "AI & ML",
    "Analytics",
    "Auth",
    "Base de datos",
    "Blockchain",
    "CDN & Performance",
    "CRM & Marketing",
    "Cloud",
    "Comunicación",
    "DNS & Domain",
    "DevOps",
    "E-commerce",
    "Education",
    "Email",
    "Fintech",
    "Food & Delivery",
    "Gaming",
    "Government",
    "HR",
    "Healthcare",
    "IoT",
    "Legal",
    "Logistics",
    "Mapas",
    "Media",
    "Pagos",
    "Productividad",
    "Real Estate",
    "SMS",
    "Search",
    "Seguridad",
    "Social",
    "Storage",
    "Testing",
    "Travel",
    "Video",
    "Weather",
]


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "service"


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def R(cat: str, name: str, desc: str, site: str, logo: str, ph: str, docs: str):
    return (cat, name, desc, site, logo, ph, docs)


S: dict[str, list[tuple[str, str, str, str, str, str, str]]] = {
    "AI & ML": [
        R("AI & ML", "OpenAI", "Modelos de lenguaje, visión y herramientas para productos con IA.", "https://openai.com", "🤖", "OPENAI_API_", "https://platform.openai.com/docs"),
        R("AI & ML", "Anthropic", "Modelos Claude y API empresarial para asistentes seguros.", "https://www.anthropic.com", "🧬", "ANTHROPIC_", "https://docs.anthropic.com"),
        R("AI & ML", "Cohere", "Embeddings, clasificación y RAG para aplicaciones de NLP.", "https://cohere.com", "📎", "COHERE_", "https://docs.cohere.com"),
        R("AI & ML", "Mistral AI", "Modelos europeos de lenguaje con despliegue flexible.", "https://mistral.ai", "🌬️", "MISTRAL_", "https://docs.mistral.ai"),
        R("AI & ML", "AssemblyAI", "Transcripción, diarización y modelos de audio.", "https://www.assemblyai.com", "🎙️", "ASSEMBLYAI_", "https://www.assemblyai.com/docs"),
        R("AI & ML", "Hugging Face Inference", "Inferencia de modelos abiertos en la nube.", "https://huggingface.co", "🤗", "HF_INFER_", "https://huggingface.co/docs/api-inference"),
    ],
    "Analytics": [
        R("Analytics", "Datadog", "Métricas, logs, APM y RUM en una sola plataforma.", "https://www.datadoghq.com", "🐕", "DD_", "https://docs.datadoghq.com"),
        R("Analytics", "New Relic", "Observabilidad full-stack y telemetría para equipos.", "https://newrelic.com", "📟", "NEWRELIC_", "https://docs.newrelic.com"),
        R("Analytics", "Grafana Cloud", "Métricas, logs, alertas y dashboards gestionados.", "https://grafana.com/products/cloud/", "📊", "GRAFANA_", "https://grafana.com/docs/grafana-cloud/"),
        R("Analytics", "Mixpanel", "Analítica de producto, embudos y retención.", "https://mixpanel.com", "📈", "MIXPANEL_", "https://developer.mixpanel.com"),
        R("Analytics", "Amplitude", "Behavioral analytics y experimentación.", "https://amplitude.com", "📉", "AMPLITUDE_", "https://www.docs.developers.amplitude.com"),
        R("Analytics", "PostHog", "Product analytics open source con flags y grabaciones.", "https://posthog.com", "🦔", "POSTHOG_", "https://posthog.com/docs"),
    ],
    "Auth": [
        R("Auth", "Auth0", "Autenticación, MFA y federación para apps y APIs.", "https://auth0.com", "🔑", "AUTH0_", "https://auth0.com/docs"),
        R("Auth", "Okta", "IAM workforce y customer con políticas y SSO.", "https://www.okta.com", "🛡️", "OKTA_", "https://developer.okta.com"),
        R("Auth", "Clerk", "Componentes de usuario y sesiones para frontend moderno.", "https://clerk.com", "👤", "CLERK_", "https://clerk.com/docs"),
        R("Auth", "WorkOS", "SSO empresarial, SCIM y directorio para SaaS B2B.", "https://workos.com", "💼", "WORKOS_", "https://workos.com/docs"),
        R("Auth", "FusionAuth", "IdP completo con temas, registro y OAuth.", "https://fusionauth.io", "🔥", "FUSIONAUTH_", "https://fusionauth.io/docs"),
        R("Auth", "Stytch", "Passwordless, OTP y sesiones para desarrolladores.", "https://stytch.com", "✨", "STYTCH_", "https://stytch.com/docs"),
    ],
    "Base de datos": [
        R("Base de datos", "MongoDB Atlas", "MongoDB gestionado con búsqueda y triggers.", "https://www.mongodb.com/atlas", "🍃", "MDB_ATLAS_", "https://www.mongodb.com/docs/atlas/api/"),
        R("Base de datos", "PlanetScale", "MySQL serverless con ramas de esquema.", "https://planetscale.com", "🪐", "PLANETSCALE_", "https://planetscale.com/docs"),
        R("Base de datos", "Neon", "Postgres serverless con autoscaling y ramas.", "https://neon.tech", "💡", "NEON_", "https://neon.tech/docs/introduction"),
        R("Base de datos", "Redis Cloud", "Redis gestionado con módulos y HA.", "https://redis.io/cloud", "🔴", "REDIS_CLOUD_", "https://redis.io/docs/latest/operate/rc/"),
        R("Base de datos", "Turso", "SQLite replicado en el edge para apps globales.", "https://turso.tech", "🌐", "TURSO_", "https://docs.turso.tech"),
        R("Base de datos", "CockroachDB Serverless", "SQL distribuido elástico con multi-región.", "https://www.cockroachlabs.com/cloud/", "🪳", "CRDB_", "https://www.cockroachlabs.com/docs/stable/"),
    ],
    "Blockchain": [
        R("Blockchain", "Alchemy", "Nodos, webhooks y APIs para Ethereum y capas 2.", "https://www.alchemy.com", "⚗️", "ALCHEMY_", "https://docs.alchemy.com"),
        R("Blockchain", "Infura", "Infraestructura Ethereum e IPFS de Consensys.", "https://www.infura.io", "🌐", "INFURA_", "https://docs.infura.io"),
        R("Blockchain", "QuickNode", "Endpoints blockchain con analítica y streams.", "https://www.quicknode.com", "⚡", "QUICKNODE_", "https://www.quicknode.com/docs"),
        R("Blockchain", "Thirdweb", "SDKs y contratos para Web3 en múltiples cadenas.", "https://thirdweb.com", "🧱", "THIRDWEB_", "https://portal.thirdweb.com"),
        R("Blockchain", "Moralis", "API de datos on-chain, NFTs y streams.", "https://moralis.io", "🦊", "MORALIS_", "https://docs.moralis.io"),
        R("Blockchain", "Chainlink", "Oráculos y feeds de datos para contratos inteligentes.", "https://chain.link", "🔗", "CHAINLINK_", "https://docs.chain.link"),
    ],
    "CDN & Performance": [
        R("CDN & Performance", "Cloudflare", "CDN, WAF, DNS y Workers en el borde global.", "https://www.cloudflare.com", "☁️", "CF_", "https://developers.cloudflare.com"),
        R("CDN & Performance", "Fastly", "CDN programable con VCL y Compute@Edge.", "https://www.fastly.com", "🚀", "FASTLY_", "https://www.fastly.com/documentation"),
        R("CDN & Performance", "Bunny.net", "CDN económico con almacenamiento y transcodificación.", "https://bunny.net", "🐰", "BUNNY_", "https://docs.bunny.net"),
        R("CDN & Performance", "KeyCDN", "CDN con HTTP/3, TLS y API de purga.", "https://www.keycdn.com", "🔑", "KEYCDN_", "https://www.keycdn.com/documentation"),
        R("CDN & Performance", "ImageKit.io", "Optimización y transformación de imágenes en CDN.", "https://imagekit.io", "🖼️", "IMAGEKIT_", "https://docs.imagekit.io"),
        R("CDN & Performance", "imgproxy", "Servidor de redimensionado de imágenes bajo demanda.", "https://imgproxy.net", "🪄", "IMGPROXY_", "https://docs.imgproxy.net"),
    ],
    "CRM & Marketing": [
        R("CRM & Marketing", "HubSpot", "CRM, marketing y servicio con API REST y webhooks.", "https://www.hubspot.com", "🧲", "HUBSPOT_", "https://developers.hubspot.com"),
        R("CRM & Marketing", "Salesforce Marketing Cloud", "Journeys, email y datos unificados del cliente.", "https://www.salesforce.com/products/marketing-cloud/", "☁️", "SFMC_", "https://developer.salesforce.com/docs/marketing/marketing-cloud"),
        R("CRM & Marketing", "Intercom", "Mensajes, bots y centro de ayuda para SaaS.", "https://www.intercom.com", "💬", "INTERCOM_", "https://developers.intercom.com"),
        R("CRM & Marketing", "Zendesk", "Ticketing omnicanal y Sunshine Conversations.", "https://www.zendesk.com", "🎫", "ZENDESK_", "https://developer.zendesk.com"),
        R("CRM & Marketing", "Pipedrive", "CRM de ventas con pipeline y automatización.", "https://www.pipedrive.com", "🎯", "PIPEDRIVE_", "https://developers.pipedrive.com"),
        R("CRM & Marketing", "Klaviyo", "Email y SMS para e-commerce con segmentación.", "https://www.klaviyo.com", "📣", "KLAVIYO_", "https://developers.klaviyo.com"),
    ],
    "Cloud": [
        R("Cloud", "AWS Lambda", "Funciones serverless con integración a servicios AWS.", "https://aws.amazon.com/lambda/", "Λ", "LAMBDA_", "https://docs.aws.amazon.com/lambda/"),
        R("Cloud", "Google Cloud Run", "Contenedores serverless con escala a cero.", "https://cloud.google.com/run", "🏃", "CLOUD_RUN_", "https://cloud.google.com/run/docs"),
        R("Cloud", "Azure Container Apps", "Microservicios y jobs en contenedores gestionados.", "https://azure.microsoft.com/products/container-apps", "📦", "ACA_", "https://learn.microsoft.com/en-us/azure/container-apps/"),
        R("Cloud", "Fly.io", "Despliegue global de máquinas y bases Postgres.", "https://fly.io", "🪰", "FLY_", "https://fly.io/docs"),
        R("Cloud", "Railway", "PaaS con Postgres, Redis y despliegue desde Git.", "https://railway.app", "🚂", "RAILWAY_", "https://docs.railway.app"),
        R("Cloud", "Render", "Web, workers y bases gestionadas con SSL.", "https://render.com", "🎨", "RENDER_", "https://render.com/docs"),
    ],
    "Comunicación": [
        R("Comunicación", "Twilio", "Voz, SMS, WhatsApp y video programables.", "https://www.twilio.com", "📞", "TWILIO_", "https://www.twilio.com/docs"),
        R("Comunicación", "MessageBird", "SMS, voz y omnicanal para Europa y global.", "https://messagebird.com", "🐦", "MESSAGEBIRD_", "https://developers.messagebird.com"),
        R("Comunicación", "Infobip", "CPaaS con SMS, RCS y email transaccional.", "https://www.infobip.com", "📡", "INFOBIP_", "https://www.infobip.com/docs/api"),
        R("Comunicación", "Vonage Communications", "Voz, SMS y verificación con APIs unificadas.", "https://www.vonage.com", "📱", "VONAGE_", "https://developer.vonage.com"),
        R("Comunicación", "Plivo", "Voz y SMS de bajo costo con números globales.", "https://www.plivo.com", "🔊", "PLIVO_", "https://www.plivo.com/docs"),
        R("Comunicación", "Agora", "Voz, vídeo y streaming en tiempo real.", "https://www.agora.io", "🎥", "AGORA_", "https://docs.agora.io"),
    ],
    "DNS & Domain": [
        R("DNS & Domain", "Cloudflare DNS", "DNS rápido con API de registros y proxy.", "https://www.cloudflare.com/dns/", "🌐", "CF_DNS_", "https://developers.cloudflare.com/dns/"),
        R("DNS & Domain", "DNSimple", "Registro y DNS con automatización para devs.", "https://dnsimple.com", "✉️", "DNSIMPLE_", "https://developer.dnsimple.com"),
        R("DNS & Domain", "Namecheap API", "Dominios, DNS y SSL vía API para revendedores.", "https://www.namecheap.com", "🏷️", "NAMECHEAP_", "https://www.namecheap.com/support/api/"),
        R("DNS & Domain", "Porkbun API", "Dominios a precio bajo con DNS API.", "https://porkbun.com", "🐷", "PORKBUN_", "https://porkbun.com/api/json/v3/documentation"),
        R("DNS & Domain", "GoDaddy Developer", "Dominios, DNS y certificados para partners.", "https://developer.godaddy.com", "🟢", "GODADDY_", "https://developer.godaddy.com/doc"),
        R("DNS & Domain", "Gandi LiveDNS", "DNS y dominios con API y privacidad.", "https://www.gandi.net", "🐘", "GANDI_", "https://api.gandi.net/docs/"),
    ],
    "DevOps": [
        R("DevOps", "PagerDuty", "Alertas, escalado on-call y respuesta a incidentes.", "https://www.pagerduty.com", "🚨", "PAGERDUTY_", "https://developer.pagerduty.com"),
        R("DevOps", "Opsgenie", "Gestión de guardias e integración con Jira.", "https://www.atlassian.com/software/opsgenie", "📣", "OPSGENIE_", "https://docs.opsgenie.com"),
        R("DevOps", "CircleCI", "CI/CD en la nube con orbes y parches Docker.", "https://circleci.com", "⭕", "CIRCLECI_", "https://circleci.com/docs"),
        R("DevOps", "Buildkite", "Pipelines de CI en tu infra con agentes.", "https://buildkite.com", "🪜", "BUILDKITE_", "https://buildkite.com/docs/apis"),
        R("DevOps", "Harness", "CI/CD, feature flags y chaos engineering.", "https://www.harness.io", "🎯", "HARNESS_", "https://developer.harness.io"),
        R("DevOps", "Spacelift", "IaC para Terraform, Pulumi y Ansible.", "https://spacelift.io", "🛰️", "SPACELIFT_", "https://docs.spacelift.io"),
    ],
    "E-commerce": [
        R("E-commerce", "Shopify Admin API", "Productos, pedidos y tiendas para comercio online.", "https://www.shopify.com", "🛍️", "SHOPIFY_", "https://shopify.dev/docs/api/admin-rest"),
        R("E-commerce", "WooCommerce REST API", "Tiendas WordPress con productos y pedidos.", "https://woocommerce.com", "🛒", "WC_", "https://woocommerce.github.io/woocommerce-rest-api-docs/"),
        R("E-commerce", "BigCommerce", "API headless y canales multitienda.", "https://www.bigcommerce.com", "🏬", "BIGC_", "https://developer.bigcommerce.com"),
        R("E-commerce", "Adobe Commerce (Magento)", "Plataforma e-commerce empresarial con GraphQL.", "https://business.adobe.com/products/magento/magento-commerce.html", "🅰️", "MAGENTO_", "https://developer.adobe.com/commerce/webapi/rest/"),
        R("E-commerce", "Medusa", "Backend e-commerce open source modular.", "https://medusajs.com", "🏺", "MEDUSA_", "https://docs.medusajs.com"),
        R("E-commerce", "Saleor", "GraphQL commerce headless en Python.", "https://saleor.io", "🍇", "SALEOR_", "https://docs.saleor.io"),
    ],
    "Education": [
        R("Education", "Google Classroom API", "Cursos, tareas y rosters en Workspace.", "https://developers.google.com/classroom", "📚", "CLASSROOM_", "https://developers.google.com/classroom"),
        R("Education", "Instructure Canvas", "LMS con API para cursos y calificaciones.", "https://www.instructure.com/canvas", "🎓", "CANVAS_", "https://canvas.instructure.com/doc/api/"),
        R("Education", "Moodle Web Services", "LMS open source con protocolos API.", "https://moodle.org", "📝", "MOODLE_", "https://docs.moodle.org/dev/Web_services"),
        R("Education", "Blackboard Learn", "LMS empresarial con REST y LTI.", "https://www.anthology.com/products/blackboard-learn", "⬛", "BLACKBOARD_", "https://developer.anthology.com/portal/displayDOC"),
        R("Education", "Coursera for Business", "Contenido y reporting para formación corporativa.", "https://www.coursera.org/business", "🎓", "COURSERA_BIZ_", "https://building.coursera.com/"),
        R("Education", "Clever", "Rostering y SSO para distritos K-12 en EE. UU.", "https://www.clever.com", "🧮", "CLEVER_", "https://dev.clever.com/docs"),
    ],
    "Email": [
        R("Email", "Mailgun", "Email transaccional con analítica de entrega.", "https://www.mailgun.com", "📧", "MAILGUN_", "https://documentation.mailgun.com"),
        R("Email", "Postmark", "Correo transaccional rápido con plantillas.", "https://postmarkapp.com", "✉️", "POSTMARK_", "https://postmarkapp.com/developer"),
        R("Email", "SendGrid", "Email marketing y transaccional de Twilio.", "https://sendgrid.com", "📨", "SENDGRID_", "https://docs.sendgrid.com"),
        R("Email", "Mailjet", "Email y SMS con editor colaborativo.", "https://www.mailjet.com", "✈️", "MAILJET_", "https://dev.mailjet.com"),
        R("Email", "Resend", "API de email para desarrolladores con React Email.", "https://resend.com", "↩️", "RESEND_", "https://resend.com/docs"),
        R("Email", "SparkPost", "Entrega masiva y analítica para remitentes.", "https://www.sparkpost.com", "✨", "SPARKPOST_", "https://developers.sparkpost.com"),
    ],
    "Fintech": [
        R("Fintech", "Plaid", "Conexión bancaria y datos de cuentas para apps.", "https://plaid.com", "🏦", "PLAID_", "https://plaid.com/docs"),
        R("Fintech", "Tink", "Open banking europeo para agregación y pagos.", "https://tink.com", "🇸🇪", "TINK_", "https://docs.tink.com"),
        R("Fintech", "TrueLayer", "Pagos iniciados y datos financieros en UK/UE.", "https://truelayer.com", "✅", "TRUELAYER_", "https://docs.truelayer.com"),
        R("Fintech", "Marqeta", "Tarjetas virtuales y programas de pagos.", "https://www.marqeta.com", "💳", "MARQETA_", "https://www.marqeta.com/docs/core-api/"),
        R("Fintech", "Modern Treasury", "Pagos, ledger y conciliación para fintech.", "https://www.moderntreasury.com", "🏛️", "MT_", "https://docs.moderntreasury.com"),
        R("Fintech", "Column", "Banca como servicio y cuentas FBO en EE. UU.", "https://column.com", "📊", "COLUMN_", "https://column.com/docs"),
    ],
    "Food & Delivery": [
        R("Food & Delivery", "DoorDash Drive", "Entregas locales para comercios con flota DoorDash.", "https://developer.doordash.com", "🚗", "DD_DRIVE_", "https://developer.doordash.com"),
        R("Food & Delivery", "Uber Direct", "API de última milla con red Uber.", "https://developer.uber.com/docs/deliveries", "🅿️", "UBER_DIRECT_", "https://developer.uber.com/docs/deliveries"),
        R("Food & Delivery", "Toast Developer", "POS y pedidos para restaurantes.", "https://pos.toasttab.com", "🍞", "TOAST_", "https://doc.toasttab.com/openapi/"),
        R("Food & Delivery", "Deliveroo Partner API", "Integración de restaurantes con Deliveroo.", "https://developers.deliveroo.com", "🥡", "DELIVEROO_", "https://developers.deliveroo.com/docs"),
        R("Food & Delivery", "Just Eat Takeaway.com", "Pedidos y menús para partners en Europa.", "https://developers.justeattakeaway.com", "🍔", "JET_", "https://developers.justeattakeaway.com"),
    ],
    "Gaming": [
        R("Gaming", "Steam Web API", "Logros, jugadores y metadatos de juegos.", "https://steamcommunity.com/dev", "🎮", "STEAM_", "https://developer.valvesoftware.com/wiki/Steam_Web_API"),
        R("Gaming", "Twitch API", "Streams, clips y chat para creadores.", "https://dev.twitch.tv", "📺", "TWITCH_", "https://dev.twitch.tv/docs/api"),
        R("Gaming", "IGDB", "Base de datos de videojuegos para Twitch y partners.", "https://www.igdb.com", "🕹️", "IGDB_", "https://api-docs.igdb.com"),
        R("Gaming", "RAWG Video Games", "Metadatos y reseñas agregadas de juegos.", "https://rawg.io", "📀", "RAWG_", "https://api.rawg.io/docs"),
        R("Gaming", "PUBG Open API", "Estadísticas y partidas de PUBG.", "https://developer.pubg.com", "🪖", "PUBG_", "https://documentation.pubg.com"),
    ],
    "Government": [
        R("Government", "NASA Open APIs", "Datos espaciales, imágenes y Earth science.", "https://api.nasa.gov", "🚀", "NASA_", "https://api.nasa.gov"),
        R("Government", "European Union Open Data Portal", "Conjuntos abiertos de la UE y SPARQL.", "https://data.europa.eu", "🇪🇺", "EU_ODP_", "https://data.europa.eu/en/whats-new"),
        R("Government", "US Census Bureau API", "Datos demográficos y geográficos de EE. UU.", "https://www.census.gov/data/developers/data-sets.html", "🇺🇸", "CENSUS_", "https://www.census.gov/data/developers/guidance/api-user-guide.html"),
        R("Government", "FBI Crime Data API", "Incidentes y estadísticas criminales reportadas.", "https://cde.ucr.cjis.gov", "🚔", "FBI_CDE_", "https://api.data.gov/docs/fbi-cde/"),
        R("Government", "UK Police API", "Delitos locales y fuerzas en Reino Unido.", "https://data.police.uk/docs/", "🇬🇧", "UK_POLICE_", "https://data.police.uk/docs/"),
    ],
    "HR": [
        R("HR", "BambooHR", "RR. HH. con empleados, tiempo libre y reporting.", "https://www.bamboohr.com", "🎋", "BAMBOOHR_", "https://documentation.bamboohr.com"),
        R("HR", "Greenhouse Harvest", "ATS con candidatos, ofertas y webhooks.", "https://www.greenhouse.io", "🌱", "GREENHOUSE_", "https://developers.greenhouse.io"),
        R("HR", "Lever", "Reclutamiento con pipeline y automatización.", "https://www.lever.co", "⚙️", "LEVER_", "https://hire.lever.co/developer/documentation"),
        R("HR", "Ashby", "ATS moderno con API y analítica.", "https://www.ashbyhq.com", "🅰️", "ASHBY_", "https://developers.ashbyhq.com"),
        R("HR", "Deel", "Contratación global, nómina y cumplimiento.", "https://www.deel.com", "🌍", "DEEL_", "https://developer.deel.com"),
    ],
    "Healthcare": [
        R("Healthcare", "Epic FHIR", "Interoperabilidad clínica con FHIR R4.", "https://open.epic.com", "🏥", "EPIC_FHIR_", "https://open.epic.com/"),
        R("Healthcare", "Oracle Health FHIR", "APIs FHIR para historias clínicas Cerner.", "https://docs.oracle.com/en/industries/health/", "🔶", "OH_FHIR_", "https://docs.oracle.com/en/industries/health/millennium-apis/"),
        R("Healthcare", "athenahealth More API", "Citas, pacientes y facturación ambulatoria.", "https://www.athenahealth.com/solutions/api", "🩺", "ATHENA_", "https://docs.athenahealth.com/api"),
        R("Healthcare", "Health Gorilla", "Red de datos clínicos y laboratorio.", "https://www.healthgorilla.com", "🦍", "HG_", "https://developer.healthgorilla.com"),
        R("Healthcare", "Change Healthcare API", "Reclamaciones, elegibilidad y pagos sanitarios.", "https://www.changehealthcare.com", "💊", "CHC_", "https://developers.changehealthcare.com"),
    ],
    "IoT": [
        R("IoT", "Particle", "Dispositivos conectados y OTA en edge.", "https://www.particle.io", "⚛️", "PARTICLE_", "https://docs.particle.io"),
        R("IoT", "Losant", "Plataforma IoT empresarial con flujos.", "https://www.losant.com", "🌊", "LOSANT_", "https://docs.losant.com"),
        R("IoT", "ThingsBoard", "IoT open source con dashboards y reglas.", "https://thingsboard.io", "📟", "TB_", "https://thingsboard.io/docs"),
        R("IoT", "Adafruit IO", "Feeds y dashboards para makers.", "https://io.adafruit.com", "🔌", "ADAIO_", "https://io.adafruit.com/api/docs"),
        R("IoT", "Blynk", "Apps móviles y firmware para hardware.", "https://blynk.io", "📱", "BLYNK_", "https://docs.blynk.io"),
    ],
    "Legal": [
        R("Legal", "DocuSign eSignature", "Firma electrónica y flujos de acuerdos.", "https://www.docusign.com", "🖊️", "DOCUSIGN_", "https://developers.docusign.com"),
        R("Legal", "PandaDoc API", "Propuestas, contratos y cobros.", "https://www.pandadoc.com", "🐼", "PANDADOC_", "https://developers.pandadoc.com"),
        R("Legal", "Ironclad", "Gestión contractual y CLM para legal ops.", "https://ironcladapp.com", "⚖️", "IRONCLAD_", "https://developer.ironcladapp.com"),
        R("Legal", "Clio Manage", "Práctica legal en la nube con API.", "https://www.clio.com", "📁", "CLIO_", "https://docs.developers.clio.com"),
        R("Legal", "ContractPodAi", "IA para redacción y análisis de contratos.", "https://contractpodai.com", "📜", "CPAI_", "https://contractpodai.com/developers"),
    ],
    "Logistics": [
        R("Logistics", "EasyPost", "Multi-carrier shipping y etiquetas unificadas.", "https://www.easypost.com", "📮", "EASYPOST_", "https://docs.easypost.com"),
        R("Logistics", "Shippo", "Tarifas, etiquetas y seguimiento multitransportista.", "https://goshippo.com", "📦", "SHIPPO_", "https://docs.goshippo.com"),
        R("Logistics", "AfterShip", "Seguimiento post-compra y notificaciones.", "https://www.aftership.com", "🚚", "AFTERSHIP_", "https://www.aftership.com/docs/tracking"),
        R("Logistics", "ShipStation", "Cumplimiento e-commerce con inventario.", "https://www.shipstation.com", "🖥️", "SHIPSTATION_", "https://www.shipstation.com/docs/api"),
        R("Logistics", "project44", "Visibilidad de cadena de suministro y ETAs.", "https://www.project44.com", "🌐", "P44_", "https://developers.project44.com"),
    ],
    "Mapas": [
        R("Mapas", "Mapbox", "Mapas vectoriales, navegación y geocoding.", "https://www.mapbox.com", "🗺️", "MAPBOX_", "https://docs.mapbox.com"),
        R("Mapas", "TomTom Maps", "Rutas, tráfico y mapas para flotas.", "https://developer.tomtom.com", "🚗", "TOMTOM_", "https://developer.tomtom.com/documentation"),
        R("Mapas", "HERE Maps", "Location services para automoción y logística.", "https://www.here.com", "📍", "HERE_", "https://developer.here.com/documentation"),
        R("Mapas", "Mapillary", "Imágenes de calle y detección para mapas.", "https://www.mapillary.com", "📸", "MAPILLARY_", "https://www.mapillary.com/developer"),
        R("Mapas", "Radar", "Geofencing y ubicación para apps móviles.", "https://radar.com", "📡", "RADAR_", "https://radar.com/documentation"),
    ],
    "Media": [
        R("Media", "Cloudinary", "Imagen y vídeo con transformaciones y CDN.", "https://cloudinary.com", "☁️", "CLOUDINARY_", "https://cloudinary.com/documentation"),
        R("Media", "Mux", "Vídeo on-demand y live con API de encoding.", "https://www.mux.com", "🎬", "MUX_", "https://docs.mux.com"),
        R("Media", "Getty Images API", "Licencias y metadatos de fotografía editorial.", "https://www.gettyimages.com", "📷", "GETTY_", "https://developers.gettyimages.com"),
        R("Media", "Shutterstock API", "Búsqueda y licencias de stock creativo.", "https://www.shutterstock.com", "🖼️", "SHUTTER_", "https://api-reference.shutterstock.com"),
        R("Media", "Pexels API", "Fotos y vídeos libres con atribución simple.", "https://www.pexels.com", "🌄", "PEXELS_", "https://www.pexels.com/api/documentation"),
    ],
    "Pagos": [
        R("Pagos", "Stripe", "Pagos online, facturación y Connect para plataformas.", "https://stripe.com", "💠", "STRIPE_", "https://stripe.com/docs"),
        R("Pagos", "Mercado Pago", "Cobros en LATAM con métodos locales y POS.", "https://www.mercadopago.com", "💳", "MP_", "https://www.mercadopago.com/developers"),
        R("Pagos", "dLocal", "Pagos y FX en mercados emergentes.", "https://dlocal.com", "🌎", "DLOCAL_", "https://docs.dlocal.com"),
        R("Pagos", "Razorpay", "Gateway India con UPI, wallets y nómina.", "https://razorpay.com", "🇮🇳", "RAZORPAY_", "https://razorpay.com/docs"),
        R("Pagos", "Adyen", "Adquirencia omnicanal global.", "https://www.adyen.com", "🏦", "ADYEN_", "https://docs.adyen.com"),
    ],
    "Productividad": [
        R("Productividad", "Notion API", "Páginas, bases de datos y automatización.", "https://www.notion.so", "📝", "NOTION_", "https://developers.notion.com"),
        R("Productividad", "Linear", "Issues y roadmaps para equipos de producto.", "https://linear.app", "📐", "LINEAR_", "https://developers.linear.app"),
        R("Productividad", "Asana", "Tareas, proyectos y reporting.", "https://asana.com", "✅", "ASANA_", "https://developers.asana.com"),
        R("Productividad", "Monday.com", "Work OS con tableros y automatizaciones.", "https://monday.com", "🗓️", "MONDAY_", "https://developer.monday.com"),
        R("Productividad", "ClickUp", "Tareas, documentos y tiempo en un solo lugar.", "https://clickup.com", "⬆️", "CLICKUP_", "https://clickup.com/api"),
    ],
    "Real Estate": [
        R("Real Estate", "Zillow API", "Listados y estimaciones Zestimate en EE. UU.", "https://www.zillowgroup.com/developers/", "🏠", "ZILLOW_", "https://www.zillowgroup.com/developers/"),
        R("Real Estate", "RentCast", "Datos de alquiler y valoraciones.", "https://www.rentcast.io", "🔑", "RENTCAST_", "https://developers.rentcast.io"),
        R("Real Estate", "Estated", "Propiedades y valoraciones para analítica.", "https://estated.com", "📊", "ESTATED_", "https://estated.com/developers/docs"),
        R("Real Estate", "Realtor.com Bridge", "Listados MLS para partners autorizados.", "https://www.realtor.com", "🏘️", "REALTOR_", "https://developer.realtor.com"),
        R("Real Estate", "ATTOM Data", "Datos de propiedades y riesgos en EE. UU.", "https://www.attomdata.com", "🏢", "ATTOM_", "https://api.developer.attomdata.com/docs"),
    ],
    "SMS": [
        R("SMS", "Twilio Programmable SMS", "SMS y MMS globales con números locales.", "https://www.twilio.com/messaging", "📲", "TWILIO_SMS_", "https://www.twilio.com/docs/sms"),
        R("SMS", "Vonage Messages API", "SMS, MMS y RCS con una API.", "https://www.vonage.com", "💬", "VONAGE_MSG_", "https://developer.vonage.com/en/messaging/sms/overview"),
        R("SMS", "Plivo SMS", "Mensajería de bajo costo y números cortos.", "https://www.plivo.com", "📱", "PLIVO_SMS_", "https://www.plivo.com/docs/sms/"),
        R("SMS", "Telnyx", "SMS, voz y números con precios transparentes.", "https://telnyx.com", "🔷", "TELNYX_", "https://developers.telnyx.com/docs/api/v2/messaging"),
        R("SMS", "Bandwidth", "Mensajería y voz para operadores y empresas.", "https://www.bandwidth.com", "📶", "BANDWIDTH_", "https://dev.bandwidth.com/apis/messaging-apis"),
    ],
    "Search": [
        R("Search", "Algolia", "Búsqueda instantánea con typo-tolerance y facetas.", "https://www.algolia.com", "🔍", "ALGOLIA_", "https://www.algolia.com/doc"),
        R("Search", "Typesense Cloud", "Motor de búsqueda open source hospedado.", "https://typesense.org", "🅣", "TYPESENSE_", "https://typesense.org/docs/"),
        R("Search", "Meilisearch Cloud", "Búsqueda rápida con sinónimos y filtros.", "https://www.meilisearch.com", "⚡", "MEILI_", "https://www.meilisearch.com/docs"),
        R("Search", "Azure AI Search", "Búsqueda cognitiva e índices híbridos.", "https://azure.microsoft.com/products/ai-services/ai-search", "🔎", "AZ_SEARCH_", "https://learn.microsoft.com/en-us/azure/search/"),
        R("Search", "Elasticsearch Service", "Búsqueda y analítica sobre Elastic Cloud.", "https://www.elastic.co/cloud", "🐘", "ES_CLOUD_", "https://www.elastic.co/guide/en/elasticsearch/reference/current/rest-apis.html"),
    ],
    "Seguridad": [
        R("Seguridad", "VirusTotal", "Análisis de archivos y URLs con multitud de motores.", "https://www.virustotal.com", "🦠", "VT_", "https://developers.virustotal.com"),
        R("Seguridad", "Have I Been Pwned", "Filtraciones de cuentas y contraseñas expuestas.", "https://haveibeenpwned.com", "🔓", "HIBP_", "https://haveibeenpwned.com/API/v3"),
        R("Seguridad", "Google Safe Browsing", "URLs y amenazas conocidas para clientes.", "https://developers.google.com/safe-browsing", "🛡️", "SAFE_BROWSE_", "https://developers.google.com/safe-browsing/reference/rest"),
        R("Seguridad", "CrowdSec", "Detección colaborativa de IPs maliciosas.", "https://crowdsec.net", "👥", "CROWDSEC_", "https://doc.crowdsec.net"),
        R("Seguridad", "GreyNoise", "Inteligencia de ruido y escaneo en Internet.", "https://www.greynoise.io", "📡", "GREYNOISE_", "https://docs.greynoise.io"),
    ],
    "Social": [
        R("Social", "Meta Graph API", "Páginas, Instagram y anuncios en Meta.", "https://developers.facebook.com", "📘", "META_", "https://developers.facebook.com/docs/graph-api"),
        R("Social", "LinkedIn Marketing Developer Platform", "Anuncios, páginas y socios en LinkedIn.", "https://learn.microsoft.com/en-us/linkedin/", "💼", "LINKEDIN_", "https://learn.microsoft.com/en-us/linkedin/"),
        R("Social", "X API v2", "Tweets, usuarios y espacios en tiempo real.", "https://developer.twitter.com", "𝕏", "X_API_", "https://developer.twitter.com/en/docs/twitter-api"),
        R("Social", "Reddit API", "Posts, comentarios y moderación.", "https://www.reddit.com/dev/api", "🤖", "REDDIT_", "https://www.reddit.com/dev/api"),
        R("Social", "TikTok for Developers", "Login, compartir y contenido para apps.", "https://developers.tiktok.com", "🎵", "TIKTOK_", "https://developers.tiktok.com/doc"),
    ],
    "Storage": [
        R("Storage", "Box", "Contenido empresarial con cumplimiento y flujos.", "https://www.box.com", "📦", "BOX_", "https://developer.box.com"),
        R("Storage", "Dropbox Sign API", "Firma electrónica (HelloSign) integrada.", "https://www.hellosign.com/api", "✍️", "DROPBOX_SIGN_", "https://developers.hellosign.com"),
        R("Storage", "Google Drive API", "Archivos, permisos y búsqueda en Drive.", "https://developers.google.com/drive", "💾", "G_DRIVE_", "https://developers.google.com/drive/api/guides/about-sdk"),
        R("Storage", "Microsoft Graph OneDrive", "Archivos y carpetas en Microsoft 365.", "https://learn.microsoft.com/en-us/graph/onedrive-concept-overview", "☁️", "MS_ONEDRIVE_", "https://learn.microsoft.com/en-us/graph/api/resources/onedrive"),
        R("Storage", "Backblaze B2", "Object storage compatible S3 de bajo coste.", "https://www.backblaze.com/b2/", "🅱️", "B2_", "https://www.backblaze.com/b2/docs/"),
    ],
    "Testing": [
        R("Testing", "Sauce Labs", "Pruebas automatizadas en navegadores y dispositivos reales.", "https://saucelabs.com", "🥫", "SAUCE_", "https://docs.saucelabs.com/dev/api"),
        R("Testing", "BrowserStack", "Cross-browser y Appium en la nube.", "https://www.browserstack.com", "🌐", "BSTACK_", "https://www.browserstack.com/docs/"),
        R("Testing", "Applitools Eyes", "Pruebas visuales con IA.", "https://applitools.com", "👁️", "APPLITOOLS_", "https://applitools.com/docs/api"),
        R("Testing", "Percy", "Snapshots visuales en CI para frontends.", "https://percy.io", "📸", "PERCY_", "https://docs.percy.io/docs/api"),
        R("Testing", "Testim", "Tests resilientes con IA y CI.", "https://www.testim.io", "🧪", "TESTIM_", "https://help.testim.io/docs/the-testim-api"),
    ],
    "Travel": [
        R("Travel", "Amadeus Self-Service", "Vuelos, hoteles y destinos para desarrolladores.", "https://developers.amadeus.com", "✈️", "AMADEUS_", "https://developers.amadeus.com/self-service"),
        R("Travel", "Sabre Dev Studio", "Contenido aéreo y hotelero GDS.", "https://developer.sabre.com", "🛫", "SABRE_", "https://developer.sabre.com"),
        R("Travel", "Travelport Universal API", "Agencias y OTAs con inventario global.", "https://www.travelport.com", "🌍", "TRAVELPORT_", "https://support.travelport.com/webhelp/JSONAPIs/Content/Home.htm"),
        R("Travel", "Skyscanner Travel API", "Búsqueda de vuelos y referencias de mercado.", "https://developers.skyscanner.net", "🌤️", "SKYSCANNER_", "https://developers.skyscanner.net"),
        R("Travel", "Booking.com Connectivity APIs", "Disponibilidad y reservas para partners.", "https://developers.booking.com", "🏨", "BOOKING_", "https://developers.booking.com/connectivity/docs"),
    ],
    "Video": [
        R("Video", "Mux Video", "Encoding, almacenamiento y player analítico.", "https://www.mux.com", "🎥", "MUX_V_", "https://docs.mux.com"),
        R("Video", "api.video", "Live y VOD con CDN y analítica.", "https://api.video", "🎞️", "APIVIDEO_", "https://docs.api.video/reference/api"),
        R("Video", "Daily.co", "Videollamadas WebRTC con salas y grabación.", "https://www.daily.co", "📹", "DAILY_", "https://docs.daily.co"),
        R("Video", "100ms", "Live video y audio con SDKs móvil y web.", "https://www.100ms.live", "💯", "HMS_", "https://www.100ms.live/docs/server-side/v2/api-reference"),
        R("Video", "Vimeo API", "Hosting, privacidad y estadísticas de vídeo.", "https://developer.vimeo.com", "▶️", "VIMEO_", "https://developer.vimeo.com/api/guides/start"),
    ],
    "Weather": [
        R("Weather", "OpenWeatherMap", "Pronóstico actual, histórico y mapas meteorológicos.", "https://openweathermap.org", "🌤️", "OWM_", "https://openweathermap.org/api"),
        R("Weather", "Tomorrow.io", "Clima hyperlocal y capas para mapas.", "https://www.tomorrow.io", "🌩️", "TOMORROW_", "https://docs.tomorrow.io"),
        R("Weather", "Visual Crossing Weather", "Histórico y pronóstico por consulta económica.", "https://www.visualcrossing.com", "🌈", "VC_WEATHER_", "https://www.visualcrossing.com/resources/documentation/weather-api/"),
        R("Weather", "AerisWeather", "Datos y mapas para apps y broadcast.", "https://www.aerisweather.com", "🌪️", "AERIS_", "https://www.aerisweather.com/support/docs/api/"),
        R("Weather", "Open-Meteo", "API meteorológica open source sin clave.", "https://open-meteo.com", "🆓", "OPEN_METEO_", "https://open-meteo.com/en/docs"),
    ],
}

ROWS: list[tuple[str, str, str, str, str, str, str]] = []
for c in CATEGORIES:
    ROWS.extend(S[c])

assert len(ROWS) == 200
cnt = Counter(cat for cat, *_ in ROWS)
for i, c in enumerate(CATEGORIES):
    assert cnt[c] == (6 if i < 15 else 5), (c, cnt[c])

out_path = Path("/var/www/backend/tokens-batch2.txt")
seen: dict[str, int] = {}
lines: list[str] = []
for i, (cat, name, desc, site, logo, ph, docs) in enumerate(ROWS):
    base = "b2-" + slugify(name)
    uid = base
    n = 2
    while uid in seen:
        uid = f"{base}-{n}"
        n += 1
    seen[uid] = i
    line = (
        "  { id: '%s', name: '%s', category: '%s', description: '%s', website: '%s', logo: '%s', placeholder: '%s', docsUrl: '%s' },"
        % tuple(esc(x) for x in (uid, name, cat, desc, site, logo, ph, docs))
    )
    lines.append(line)

out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("OK", len(lines), "->", out_path)
