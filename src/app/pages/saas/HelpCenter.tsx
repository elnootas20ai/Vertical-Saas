import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BookOpen,
  Bot,
  Bug,
  Building2,
  Car,
  CheckCircle2,
  CircleHelp,
  CreditCard,
  FileText,
  LifeBuoy,
  Mail,
  MessageSquareText,
  Rocket,
  Settings2,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { BugReportForm } from '../../components/saas/BugReportModal';

type Accent = {
  badge: string;
  border: string;
  iconBg: string;
  iconText: string;
  softBg: string;
};

type SupportCard = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  icon: LucideIcon;
  accent: Accent;
};

type QuickLink = {
  label: string;
  href: string;
};

type Guide = {
  id: string;
  title: string;
  description: string;
  route: string;
  routeLabel: string;
  icon: LucideIcon;
  accent: Accent;
  steps: string[];
  tips: string[];
};

const ACCENTS = {
  blue: {
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    border: 'border-l-blue-500',
    iconBg: 'bg-blue-100',
    iconText: 'text-blue-700',
    softBg: 'bg-blue-50',
  },
  emerald: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    border: 'border-l-emerald-500',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-700',
    softBg: 'bg-emerald-50',
  },
  amber: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    border: 'border-l-amber-500',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    softBg: 'bg-amber-50',
  },
  violet: {
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    border: 'border-l-violet-500',
    iconBg: 'bg-violet-100',
    iconText: 'text-violet-700',
    softBg: 'bg-violet-50',
  },
  rose: {
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    border: 'border-l-rose-500',
    iconBg: 'bg-rose-100',
    iconText: 'text-rose-700',
    softBg: 'bg-rose-50',
  },
  slate: {
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    border: 'border-l-slate-500',
    iconBg: 'bg-slate-200',
    iconText: 'text-slate-700',
    softBg: 'bg-slate-100',
  },
} satisfies Record<string, Accent>;

const supportCards: SupportCard[] = [
  {
    id: 'faq',
    title: 'Centro de ayuda y FAQ',
    description: 'Resuelve dudas frecuentes sobre el uso de Vertial, los flujos operativos y la configuracion del entorno.',
    actionLabel: 'Ir a preguntas frecuentes',
    href: '/saas/help#faq',
    icon: CircleHelp,
    accent: ACCENTS.blue,
  },
  {
    id: 'soporte',
    title: 'Chat de soporte',
    description: 'Accede al circuito de ayuda operativa, recomendaciones de uso y pautas para escalar una incidencia correctamente.',
    actionLabel: 'Ver soporte operativo',
    href: '/saas/help#soporte',
    icon: MessageSquareText,
    accent: ACCENTS.emerald,
  },
  {
    id: 'contacto',
    title: 'Contacto por email',
    description: 'Encuentra el canal de contacto, que informacion enviar y como acelerar la resolucion con un contexto claro.',
    actionLabel: 'Ver contacto',
    href: '/saas/help#contacto',
    icon: Mail,
    accent: ACCENTS.violet,
  },
  {
    id: 'reporte',
    title: 'Reportar a Vertial',
    description: 'Envia bugs, errores o pantallas rotas con captura. El equipo recibe un aviso instantaneo por correo.',
    actionLabel: 'Enviar reporte',
    href: '/saas/help#reporte',
    icon: Bug,
    accent: ACCENTS.amber,
  },
];

const quickLinks: QuickLink[] = [
  { label: 'Primeros pasos', href: '/saas/help#primeros-pasos' },
  { label: 'Gestion de vehiculos', href: '/saas/help#vehiculos' },
  { label: 'Crear una operacion', href: '/saas/help#operaciones' },
  { label: 'Documentos y plantillas', href: '/saas/help#documentos' },
  { label: 'Integracion ANCOVE', href: '/saas/help#ancove' },
  { label: 'Facturacion', href: '/saas/help#facturacion' },
];

const platformFlow = [
  {
    title: 'Configura tu operativa',
    description: 'Define usuarios, roles, ubicaciones, plantillas y parametros de negocio desde configuracion para adaptar la plataforma a tu proceso real.',
    icon: Settings2,
    accent: ACCENTS.blue,
  },
  {
    title: 'Centraliza tu stock',
    description: 'Gestiona vehiculos, estados, reservas, ubicaciones y seguimiento del stock desde una unica vista compartida con tu equipo.',
    icon: Car,
    accent: ACCENTS.emerald,
  },
  {
    title: 'Ejecuta cada operacion',
    description: 'Coordina tareas, responsables, incidencias, documentacion y control comercial para que cada compra o venta avance sin fricciones.',
    icon: Workflow,
    accent: ACCENTS.amber,
  },
  {
    title: 'Cierra con trazabilidad',
    description: 'Apoya la venta con documentos, integraciones y control de suscripcion para mantener una operativa profesional y auditada.',
    icon: ShieldCheck,
    accent: ACCENTS.slate,
  },
];

const guides: Guide[] = [
  {
    id: 'primeros-pasos',
    title: 'Primeros pasos',
    description: 'La mejor forma de empezar es dejar preparada la estructura de trabajo antes de cargar vehiculos o crear operaciones.',
    route: '/saas/settings',
    routeLabel: 'Abrir configuracion',
    icon: Rocket,
    accent: ACCENTS.blue,
    steps: [
      'Revisa la informacion de empresa, usuarios y roles para que cada perfil vea solo lo necesario.',
      'Configura ubicaciones, plantillas de documentos e integraciones que vayas a utilizar desde el arranque.',
      'Valida el plan y los datos de facturacion para evitar bloqueos operativos mas adelante.',
    ],
    tips: [
      'Empieza con un flujo simple: stock, operacion, documentacion y seguimiento.',
      'Define responsables por area antes de incorporar a todo el equipo.',
    ],
  },
  {
    id: 'vehiculos',
    title: 'Gestion de vehiculos',
    description: 'El modulo de vehiculos es la base del inventario. Desde aqui controlas stock, estado comercial y ubicacion de cada unidad.',
    route: '/saas/vehicles',
    routeLabel: 'Ir a vehiculos',
    icon: Car,
    accent: ACCENTS.emerald,
    steps: [
      'Da de alta cada vehiculo con sus datos clave: matricula, marca, modelo, kilometraje, precio y ubicacion.',
      'Utiliza estados y filtros para distinguir disponibles, reservados, en preparacion o vendidos.',
      'Mantén los datos actualizados para que ventas, operaciones y documentacion trabajen sobre la misma informacion.',
    ],
    tips: [
      'Una ficha completa evita errores comerciales y duplicidad de tareas.',
      'Usa las ubicaciones para coordinar campa, taller, exposicion o entrega.',
    ],
  },
  {
    id: 'operaciones',
    title: 'Crear una operacion',
    description: 'Las operaciones permiten ordenar todo el trabajo que acompana una compra o una venta, con responsables, etapas y seguimiento.',
    route: '/saas/operations',
    routeLabel: 'Ir a operaciones',
    icon: Workflow,
    accent: ACCENTS.amber,
    steps: [
      'Crea la operacion cuando un vehiculo entra en un proceso real de compra, venta, preparacion o entrega.',
      'Asigna cliente, responsable, etapa y estado para que el equipo sepa quien actua y en que punto esta cada caso.',
      'Utiliza tareas, gastos e incidencias para mantener el control operativo y economico del expediente.',
    ],
    tips: [
      'No esperes al final: una operacion creada a tiempo reduce olvidos y cuellos de botella.',
      'Revisa el historial para entender cambios y decisiones del equipo.',
    ],
  },
  {
    id: 'documentos',
    title: 'Documentos y plantillas',
    description: 'Vertial centraliza la generacion, envio y seguimiento de documentos para reducir trabajo manual y mejorar la consistencia.',
    route: '/saas/documents',
    routeLabel: 'Ir a documentos',
    icon: FileText,
    accent: ACCENTS.violet,
    steps: [
      'Gestiona contratos, reservas, entregas o facturas desde un repositorio unico y trazable.',
      'Crea plantillas reutilizables desde configuracion para acelerar documentos recurrentes.',
      'Asegurate de revisar variables, alcance de cada plantilla y estado del documento antes de compartirlo.',
    ],
    tips: [
      'Estandarizar plantillas mejora la imagen corporativa y reduce errores.',
      'Relaciona siempre el documento con la operacion o el flujo correcto.',
    ],
  },
  {
    id: 'ancove',
    title: 'Integracion ANCOVE',
    description: 'El espacio ANCOVE reune informacion sectorial, comunicados y recursos de apoyo para la toma de decisiones comerciales.',
    route: '/saas/ancove',
    routeLabel: 'Ir a ANCOVE',
    icon: Building2,
    accent: ACCENTS.rose,
    steps: [
      'Consulta comunicados y avisos del sector para mantener a tu equipo alineado con el contexto regulatorio y comercial.',
      'Utiliza las ventajas y recursos disponibles para reforzar procesos de compraventa y seguimiento.',
      'Revisa periodicamente novedades de mercado y actualizaciones para anticipar impactos en tu actividad.',
    ],
    tips: [
      'Convierte la informacion sectorial en acciones concretas para ventas, stock y documentacion.',
      'Utiliza este modulo como apoyo, no como sustituto del control operativo interno.',
    ],
  },
  {
    id: 'facturacion',
    title: 'Facturacion',
    description: 'La facturacion de la cuenta se gestiona desde configuracion, donde puedes revisar el plan, el metodo de pago y los documentos asociados.',
    route: '/saas/settings/facturacion',
    routeLabel: 'Abrir facturacion',
    icon: CreditCard,
    accent: ACCENTS.slate,
    steps: [
      'Consulta el estado de la suscripcion y valida si la cuenta esta en prueba, activa o con incidencia de pago.',
      'Actualiza la tarjeta o metodo de pago cuando cambie la informacion bancaria o detectes un error de cobro.',
      'Revisa historico de facturas y datos de plan para mantener continuidad del servicio.',
    ],
    tips: [
      'Resuelve las incidencias de pago con rapidez para evitar restricciones de acceso.',
      'Si necesitas ayuda, indica siempre el email de la cuenta y el motivo del cobro.',
    ],
  },
];

const faqs = [
  {
    question: '¿Que parte de la plataforma debo configurar primero?',
    answer:
      'Empieza por configuracion: empresa, usuarios, roles, ubicaciones y plantillas. Esa base asegura que el resto de modulos funcione con orden y permisos correctos.',
  },
  {
    question: '¿Cuando conviene crear una operacion?',
    answer:
      'En cuanto exista un proceso real que requiera seguimiento: compra, venta, preparacion, reserva, financiacion, documentacion o entrega. Crear la operacion desde el inicio mejora la trazabilidad.',
  },
  {
    question: '¿Como organizo mejor el stock de vehiculos?',
    answer:
      'Manteniendo cada ficha completa, usando estados coherentes y asignando ubicaciones reales. El stock debe reflejar la operativa diaria para que ventas, operaciones y taller trabajen sincronizados.',
  },
  {
    question: '¿Para que sirven las plantillas de documentos?',
    answer:
      'Sirven para estandarizar contratos, reservas, facturas y otros documentos frecuentes. Reducen trabajo manual, aceleran la emision y protegen la consistencia documental de la empresa.',
  },
  {
    question: '¿Que utilidad tiene el modulo ANCOVE dentro de Vertial?',
    answer:
      'Aporta contexto sectorial, comunicados y recursos de apoyo que ayudan a tomar mejores decisiones comerciales y operativas dentro del negocio de vehiculo de ocasion.',
  },
  {
    question: '¿Donde reviso la facturacion de mi cuenta?',
    answer:
      'Desde Configuracion, en la pestana de facturacion. Ahí puedes comprobar el plan activo, metodo de pago, estado de la suscripcion y facturas emitidas.',
  },
  {
    question: '¿Que debo enviar al soporte para recibir ayuda mas rapido?',
    answer:
      'Incluye una descripcion breve del problema, el modulo afectado, el identificador relacionado si existe, capturas si ayudan a contextualizar y el impacto operativo que esta generando.',
  },
  {
    question: '¿Puedo usar la ayuda aunque tenga una incidencia de pago?',
    answer:
      'Si. El centro de ayuda permanece disponible para que puedas revisar instrucciones, preguntas frecuentes y los canales de contacto aunque la cuenta necesite regularizacion.',
  },
];

const supportChecklist = [
  'Describe que estabas intentando hacer y en que modulo ocurrio.',
  'Indica la matricula, ID de operacion o documento afectado si aplica.',
  'Adjunta una captura o explica el mensaje que ves en pantalla.',
  'Aclara si se trata de una duda funcional o de una incidencia bloqueante.',
];

export function HelpCenter() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    const sectionId = decodeURIComponent(location.hash.slice(1));
    const timeout = window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);

    return () => window.clearTimeout(timeout);
  }, [location.hash]);

  return (
    <Layout
      title="Centro de ayuda"
      subtitle="Guias operativas, preguntas frecuentes y soporte para sacar el maximo partido a Vertial"
    >
      <div className="space-y-8">
        <section className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 text-white shadow-sm">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-100">
              <LifeBuoy className="h-3.5 w-3.5" />
              Soporte y conocimiento
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              La ayuda de Vertial pensada para una operativa profesional.
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
              Este centro de ayuda centraliza la explicacion de la plataforma, guias practicas por modulo y
              recomendaciones para resolver dudas operativas con criterio. La idea es que cualquier usuario entienda
              que hacer, donde hacerlo y como pedir soporte con el contexto adecuado.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <a
                href="#primeros-pasos"
                className="inline-flex items-center gap-2 rounded-xl bg-white dark:bg-gray-800 px-4 py-3 font-semibold text-slate-900 transition-colors hover:bg-slate-100"
              >
                Empezar por la guia principal
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#contacto"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 font-semibold text-white transition-colors hover:bg-white/10"
              >
                Ver canales de contacto
              </a>
            </div>
          </div>
        </section>

        <section id="soporte" className="scroll-mt-28 space-y-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Opciones de soporte</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Elige la ayuda que necesitas en cada momento</h3>
            </div>
            <p className="max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              El soporte no solo resuelve incidencias: tambien te ayuda a implantar mejor la plataforma y a ordenar la
              operativa diaria.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {supportCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.id}
                  to={card.href}
                  className={`rounded-2xl border border-gray-200 dark:border-gray-700 border-l-4 bg-white dark:bg-gray-800 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${card.accent.border}`}
                >
                  <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${card.accent.iconBg}`}>
                    <Icon className={`h-6 w-6 ${card.accent.iconText}`} />
                  </div>
                  <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">{card.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{card.description}</p>
                  <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {card.actionLabel}
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Guias rapidas</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Accesos directos a los temas mas consultados</h3>
            </div>
            <p className="max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              Los enlaces del popup de ayuda apuntan a estas secciones para que cualquier usuario llegue exactamente al
              contenido que necesita.
            </p>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {quickLinks.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-4 text-sm font-semibold text-gray-700 dark:text-gray-300 transition-all hover:border-gray-300 dark:hover:border-gray-600 hover:bg-white hover:text-gray-900"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Como funciona la plataforma</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Una vision clara del flujo de trabajo en Vertial</h3>
          </div>
          <div className="grid gap-4 xl:grid-cols-4">
            {platformFlow.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                  <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${item.accent.iconBg}`}>
                    <Icon className={`h-5 w-5 ${item.accent.iconText}`} />
                  </div>
                  <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">{item.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{item.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Ayuda por modulo</p>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Respuestas practicas para el trabajo diario</h3>
          </div>

          {guides.map((guide) => {
            const Icon = guide.icon;
            return (
              <article
                key={guide.id}
                id={guide.id}
                className={`scroll-mt-28 rounded-3xl border border-gray-200 dark:border-gray-700 border-l-4 bg-white dark:bg-gray-800 p-6 ${guide.accent.border}`}
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${guide.accent.badge}`}>
                      <Icon className="h-3.5 w-3.5" />
                      Guia operativa
                    </div>
                    <h4 className="mt-3 text-2xl font-bold text-gray-900 dark:text-gray-100">{guide.title}</h4>
                    <p className="mt-2 text-sm leading-7 text-gray-600 dark:text-gray-400">{guide.description}</p>
                  </div>
                  <Link
                    to={guide.route}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
                  >
                    {guide.routeLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-5">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <BookOpen className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      Que debes hacer
                    </div>
                    <div className="space-y-3">
                      {guide.steps.map((step) => (
                        <div key={step} className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                          <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`rounded-2xl p-5 ${guide.accent.softBg}`}>
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <Sparkles className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      Recomendaciones
                    </div>
                    <div className="space-y-3">
                      {guide.tips.map((tip) => (
                        <div key={tip} className="flex items-start gap-3">
                          <Bot className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                          <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section id="faq" className="scroll-mt-28 space-y-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">FAQ</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Preguntas frecuentes</h3>
            </div>
            <p className="max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              Estas respuestas resumen las dudas mas habituales de implantacion, uso diario y soporte.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">{faq.question}</h4>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="reporte" className="scroll-mt-28 rounded-3xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-800 p-6">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Reporte a Vertial</p>
            <h3 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
              Detecta bugs y errores con captura incluida
            </h3>
            <p className="mt-3 text-sm leading-7 text-gray-600 dark:text-gray-400">
              Usa este formulario cuando veas un fallo, un mensaje de error o un comportamiento raro.
              El reporte llega al equipo de Vertial al instante por correo, con la pagina, la empresa y la captura que adjuntes.
            </p>
          </div>
          <div className="mt-6 max-w-3xl">
            <BugReportForm />
          </div>
        </section>

        <section id="contacto" className="scroll-mt-28 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Contacto</p>
            <h3 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">Cuando necesites ayuda directa, este es el canal recomendado</h3>
            <p className="mt-3 text-sm leading-7 text-gray-600 dark:text-gray-400">
              Para dudas funcionales, incidencias o necesidades de acompanamiento, escribe a{" "}
              <a className="font-semibold text-gray-900 dark:text-gray-100 underline decoration-gray-300 underline-offset-4" href="mailto:soporte@vertial.com">
                soporte@vertial.com
              </a>
              . Cuanto mejor expliques el contexto, mas facil sera orientar la respuesta y priorizar correctamente.
            </p>
            <a
              href="mailto:soporte@vertial.com"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
            >
              Escribir a soporte
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div className="rounded-3xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">Para agilizar la resolucion</p>
            <h3 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">Incluye esta informacion en tu solicitud</h3>
            <div className="mt-5 space-y-3">
              {supportChecklist.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                  <p className="text-sm leading-6 text-gray-700 dark:text-gray-300">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
