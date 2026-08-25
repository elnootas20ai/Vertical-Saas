/**
 * Demo UI del vertical Legal — solo cuenta uriel@admin.com.
 * No se persiste; rellena listas vacías para previsualizar el centro operativo.
 */
import { isVertialSuperAdminEmail } from './superAdmin';
import type { VerticalEntity } from './verticalApiFactory';

export function isLawyerDemoViewer(email: string | null | undefined): boolean {
  return isVertialSuperAdminEmail(email);
}

export function isLawyerDemoId(id: string | null | undefined): boolean {
  return String(id || '').startsWith('demo-law-');
}

function isoDays(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function entityBase(userId: string, type: string, id: string): Pick<
  VerticalEntity,
  '_id' | 'type' | 'user_id' | 'createdAt' | 'updatedAt'
> {
  const now = new Date().toISOString();
  return {
    _id: id,
    type,
    user_id: userId,
    createdAt: now,
    updatedAt: now,
  };
}

export type LawyerDemoLead = VerticalEntity & {
  nombre: string;
  telefono: string;
  email: string;
  canal: string;
  tipoAsunto: string;
  urgencia: string;
  consultaTipo: string;
  fechaConsulta: string;
  estado: string;
  notas: string;
};

export type LawyerDemoCase = VerticalEntity & {
  expediente: string;
  tipo: string;
  cliente: string;
  fechaApertura: string;
  estado: string;
  abogado: string;
  juzgado: string;
  urgencia?: string;
  notas?: string;
  fechaCierre?: string;
  resultado?: string;
  /** Años de conservación previstos */
  retencionAnios?: number;
  /** Fecha estimada de revisión RGPD / posible borrado */
  revisionRgpd?: string;
};

export type LawyerDemoDeadline = VerticalEntity & {
  caso: string;
  tipoPlazo: string;
  fechaLimite: string;
  diasRestantes: number;
  prioridad: string;
  responsable: string;
  estado: string;
  descripcion: string;
};

export type LawyerDemoHearing = VerticalEntity & {
  caso: string;
  cliente: string;
  juzgado: string;
  fecha: string;
  hora: string;
  tipo: string;
  sala: string;
  estado: string;
};

export type LawyerDemoInvoice = VerticalEntity & {
  numero: string;
  cliente: string;
  caso: string;
  concepto: string;
  horas: number;
  tarifaHora: number;
  importe: number;
  estado: string;
  /** horas | iguala | exito */
  modalidad?: string;
  fecha?: string;
};

export type LawyerDemoTimeEntry = {
  id: string;
  fecha: string;
  abogado: string;
  caso: string;
  cliente: string;
  descripcion: string;
  minutos: number;
  facturable: boolean;
  tarifaHora: number;
};

export type LawyerDemoDespacho = {
  _id: string;
  name: string;
  active: boolean;
};

export type LawyerDemoBundle = {
  leads: LawyerDemoLead[];
  cases: LawyerDemoCase[];
  deadlines: LawyerDemoDeadline[];
  hearings: LawyerDemoHearing[];
  invoices: LawyerDemoInvoice[];
  timeEntries: LawyerDemoTimeEntry[];
  despachos: LawyerDemoDespacho[];
};

export function buildLawyerDemoBundle(userId: string): LawyerDemoBundle {
  const uid = userId || 'demo';

  const leads: LawyerDemoLead[] = [
    {
      ...entityBase(uid, 'law_lead', 'demo-law-lead-1'),
      nombre: 'Marina López',
      telefono: '612 445 880',
      email: 'marina.lopez@email.com',
      canal: 'web',
      tipoAsunto: 'laboral',
      urgencia: 'alta',
      consultaTipo: 'gratuita',
      fechaConsulta: isoDays(1),
      estado: 'nuevo',
      notas: 'Despido improcedente · quiere consulta esta semana',
    },
    {
      ...entityBase(uid, 'law_lead', 'demo-law-lead-2'),
      nombre: 'Grupo Norte SL',
      telefono: '934 112 200',
      email: 'legal@gruponorte.es',
      canal: 'referido',
      tipoAsunto: 'mercantil',
      urgencia: 'media',
      consultaTipo: 'pago',
      fechaConsulta: isoDays(3),
      estado: 'consulta_agendada',
      notas: 'Conflicto societario entre socios',
    },
    {
      ...entityBase(uid, 'law_lead', 'demo-law-lead-3'),
      nombre: 'Pablo Ruiz',
      telefono: '655 901 334',
      email: 'pablo.ruiz@email.com',
      canal: 'llamada',
      tipoAsunto: 'familia',
      urgencia: 'media',
      consultaTipo: 'gratuita',
      fechaConsulta: isoDays(5),
      estado: 'contactado',
      notas: 'Divorcio de mutuo acuerdo',
    },
    {
      ...entityBase(uid, 'law_lead', 'demo-law-lead-4'),
      nombre: 'Elena Vargas',
      telefono: '677 220 119',
      email: 'elena.vargas@email.com',
      canal: 'email',
      tipoAsunto: 'civil',
      urgencia: 'alta',
      consultaTipo: 'pago',
      fechaConsulta: isoDays(0),
      estado: 'nuevo',
      notas: 'Reclamación de cantidad · contrato de alquiler',
    },
  ];

  const cases: LawyerDemoCase[] = [
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-1'),
      expediente: 'EXP-2026/0142',
      tipo: 'laboral',
      cliente: 'Marina López',
      fechaApertura: isoDays(-40),
      estado: 'vista_oral',
      abogado: 'Lcda. Ana Beltrán',
      juzgado: 'Juzgado de lo Social nº5',
      urgencia: 'alta',
      notas: 'Señalada vista oral',
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-2'),
      expediente: 'EXP-2026/0098',
      tipo: 'mercantil',
      cliente: 'Grupo Norte SL',
      fechaApertura: isoDays(-90),
      estado: 'en_tramite',
      abogado: 'Lcdo. Carlos Mendoza',
      juzgado: 'Juzgado Mercantil nº1',
      urgencia: 'media',
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-3'),
      expediente: 'EXP-2026/0110',
      tipo: 'civil',
      cliente: 'Elena Vargas',
      fechaApertura: isoDays(-18),
      estado: 'abierto',
      abogado: 'Lcdo. Javier Ramos',
      juzgado: 'Juzgado 1ª Instancia nº3',
      urgencia: 'alta',
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-4'),
      expediente: 'EXP-2025/0881',
      tipo: 'penal',
      cliente: 'Andrés Molina',
      fechaApertura: isoDays(-200),
      estado: 'en_tramite',
      abogado: 'Lcda. Patricia Solís',
      juzgado: 'Juzgado Penal nº2',
      urgencia: 'media',
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-5'),
      expediente: 'EXP-2025/0402',
      tipo: 'familia',
      cliente: 'Laura Gómez',
      fechaApertura: isoDays(-320),
      estado: 'cerrado',
      abogado: 'Lcda. Ana Beltrán',
      juzgado: 'Juzgado 1ª Instancia nº3',
      fechaCierre: isoDays(-50),
      resultado: 'Convenio homologado',
      retencionAnios: 5,
      revisionRgpd: isoDays(365 * 5 - 50),
      notas: 'Sentencia firme · custodia compartida',
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-6'),
      expediente: 'EXP-2024/1201',
      tipo: 'administrativo',
      cliente: 'Ayuntamiento de Tiana',
      fechaApertura: isoDays(-500),
      estado: 'archivado',
      abogado: 'Lcdo. Carlos Mendoza',
      juzgado: 'Juzgado Contencioso nº1',
      fechaCierre: isoDays(-200),
      resultado: 'Estimación parcial',
      retencionAnios: 10,
      revisionRgpd: isoDays(365 * 10 - 200),
      notas: 'Expediente administrativo archivado',
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-7'),
      expediente: 'EXP-2024/0888',
      tipo: 'laboral',
      cliente: 'Sergio Navarro',
      fechaApertura: isoDays(-420),
      estado: 'cerrado',
      abogado: 'Lcda. Ana Beltrán',
      juzgado: 'Juzgado de lo Social nº2',
      fechaCierre: isoDays(-90),
      resultado: 'Conciliación · indemnización',
      retencionAnios: 5,
      revisionRgpd: isoDays(365 * 5 - 90),
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-8'),
      expediente: 'EXP-2023/0551',
      tipo: 'civil',
      cliente: 'Promociones Delta SL',
      fechaApertura: isoDays(-700),
      estado: 'archivado',
      abogado: 'Lcdo. Javier Ramos',
      juzgado: 'Juzgado 1ª Instancia nº5',
      fechaCierre: isoDays(-280),
      resultado: 'Desistimiento',
      retencionAnios: 5,
      revisionRgpd: isoDays(365 * 5 - 280),
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-9'),
      expediente: 'EXP-2023/0310',
      tipo: 'mercantil',
      cliente: 'Inversiones Sur SA',
      fechaApertura: isoDays(-800),
      estado: 'cerrado',
      abogado: 'Lcdo. Carlos Mendoza',
      juzgado: 'Juzgado Mercantil nº2',
      fechaCierre: isoDays(-150),
      resultado: 'Acuerdo extrajudicial',
      retencionAnios: 6,
      revisionRgpd: isoDays(365 * 6 - 150),
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-10'),
      expediente: 'EXP-2022/0199',
      tipo: 'penal',
      cliente: 'Héctor Blanco',
      fechaApertura: isoDays(-1100),
      estado: 'archivado',
      abogado: 'Lcda. Patricia Solís',
      juzgado: 'Juzgado Penal nº1',
      fechaCierre: isoDays(-400),
      resultado: 'Sobreseimiento libre',
      retencionAnios: 10,
      revisionRgpd: isoDays(365 * 10 - 400),
      notas: 'Datos sensibles · retención reforzada',
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-11'),
      expediente: 'EXP-2024/2010',
      tipo: 'familia',
      cliente: 'Nuria Soler',
      fechaApertura: isoDays(-380),
      estado: 'cerrado',
      abogado: 'Lcda. Ana Beltrán',
      juzgado: 'Juzgado 1ª Instancia nº7',
      fechaCierre: isoDays(-30),
      resultado: 'Modificación de medidas',
      retencionAnios: 5,
      revisionRgpd: isoDays(365 * 5 - 30),
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-12'),
      expediente: 'EXP-2021/0044',
      tipo: 'administrativo',
      cliente: 'Comunidad de Propietarios Les Corts',
      fechaApertura: isoDays(-1400),
      estado: 'archivado',
      abogado: 'Lcdo. Carlos Mendoza',
      juzgado: 'Juzgado Contencioso nº3',
      fechaCierre: isoDays(-600),
      resultado: 'Desestimación',
      retencionAnios: 10,
      revisionRgpd: isoDays(90),
      notas: 'Próxima revisión RGPD · valorar borrado',
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-13'),
      expediente: 'EXP-2025/0712',
      tipo: 'laboral',
      cliente: 'Clara Puig',
      fechaApertura: isoDays(-250),
      estado: 'cerrado',
      abogado: 'Lcdo. Javier Ramos',
      juzgado: 'Juzgado de lo Social nº5',
      fechaCierre: isoDays(-15),
      resultado: 'Sentencia favorable',
      retencionAnios: 5,
      revisionRgpd: isoDays(365 * 5 - 15),
    },
    {
      ...entityBase(uid, 'law_case', 'demo-law-case-14'),
      expediente: 'EXP-2020/0901',
      tipo: 'civil',
      cliente: 'Banco Mediterráneo',
      fechaApertura: isoDays(-1800),
      estado: 'archivado',
      abogado: 'Lcda. Patricia Solís',
      juzgado: 'Audiencia Provincial Sala 1ª',
      fechaCierre: isoDays(-700),
      resultado: 'Confirmación en apelación',
      retencionAnios: 5,
      revisionRgpd: isoDays(-30),
      notas: 'Retención vencida · pendiente de borrado RGPD',
    },
  ];

  const deadlines: LawyerDemoDeadline[] = [
    {
      ...entityBase(uid, 'law_deadline', 'demo-law-dead-1'),
      caso: 'EXP-2026/0142',
      tipoPlazo: 'procesal',
      fechaLimite: isoDays(-2),
      diasRestantes: -2,
      prioridad: 'alta',
      responsable: 'Lcda. Ana Beltrán',
      estado: 'vencido',
      descripcion: 'Presentación de escrito de conclusiones',
    },
    {
      ...entityBase(uid, 'law_deadline', 'demo-law-dead-2'),
      caso: 'EXP-2026/0110',
      tipoPlazo: 'presentacion',
      fechaLimite: isoDays(0),
      diasRestantes: 0,
      prioridad: 'alta',
      responsable: 'Lcdo. Javier Ramos',
      estado: 'pendiente',
      descripcion: 'Demanda de reclamación de cantidad',
    },
    {
      ...entityBase(uid, 'law_deadline', 'demo-law-dead-3'),
      caso: 'EXP-2026/0098',
      tipoPlazo: 'recurso',
      fechaLimite: isoDays(3),
      diasRestantes: 3,
      prioridad: 'alta',
      responsable: 'Lcdo. Carlos Mendoza',
      estado: 'pendiente',
      descripcion: 'Recurso de reposición',
    },
    {
      ...entityBase(uid, 'law_deadline', 'demo-law-dead-4'),
      caso: 'EXP-2025/0881',
      tipoPlazo: 'procesal',
      fechaLimite: isoDays(9),
      diasRestantes: 9,
      prioridad: 'media',
      responsable: 'Lcda. Patricia Solís',
      estado: 'pendiente',
      descripcion: 'Aportación de prueba documental',
    },
    {
      ...entityBase(uid, 'law_deadline', 'demo-law-dead-5'),
      caso: 'EXP-2026/0142',
      tipoPlazo: 'prescripcion',
      fechaLimite: isoDays(21),
      diasRestantes: 21,
      prioridad: 'baja',
      responsable: 'Lcda. Ana Beltrán',
      estado: 'pendiente',
      descripcion: 'Control de plazo de caducidad',
    },
  ];

  const hearings: LawyerDemoHearing[] = [
    {
      ...entityBase(uid, 'law_hearing', 'demo-law-hear-1'),
      caso: 'EXP-2026/0142',
      cliente: 'Marina López',
      juzgado: 'Juzgado de lo Social nº5',
      fecha: isoDays(0),
      hora: '10:30',
      tipo: 'vista_oral',
      sala: 'Sala 2',
      estado: 'programada',
    },
    {
      ...entityBase(uid, 'law_hearing', 'demo-law-hear-2'),
      caso: 'EXP-2026/0098',
      cliente: 'Grupo Norte SL',
      juzgado: 'Juzgado Mercantil nº1',
      fecha: isoDays(2),
      hora: '12:00',
      tipo: 'conciliacion',
      sala: 'Sala de mediación A',
      estado: 'programada',
    },
    {
      ...entityBase(uid, 'law_hearing', 'demo-law-hear-3'),
      caso: 'EXP-2025/0881',
      cliente: 'Andrés Molina',
      juzgado: 'Juzgado Penal nº2',
      fecha: isoDays(8),
      hora: '09:15',
      tipo: 'declaracion',
      sala: 'Sala 1',
      estado: 'programada',
    },
    {
      ...entityBase(uid, 'law_hearing', 'demo-law-hear-4'),
      caso: 'EXP-2026/0110',
      cliente: 'Elena Vargas',
      juzgado: 'Juzgado 1ª Instancia nº3',
      fecha: isoDays(12),
      hora: '11:45',
      tipo: 'mediacion',
      sala: 'Sala de mediación B',
      estado: 'programada',
    },
  ];

  const invoices: LawyerDemoInvoice[] = [
    {
      ...entityBase(uid, 'law_invoice', 'demo-law-inv-1'),
      numero: 'FAC-2026-031',
      cliente: 'Grupo Norte SL',
      caso: 'EXP-2026/0098',
      concepto: 'Honorarios fase contestación',
      horas: 12,
      tarifaHora: 140,
      importe: 1680,
      estado: 'enviada',
      modalidad: 'horas',
      fecha: isoDays(-6),
    },
    {
      ...entityBase(uid, 'law_invoice', 'demo-law-inv-2'),
      numero: 'FAC-2026-028',
      cliente: 'Elena Vargas',
      caso: 'EXP-2026/0110',
      concepto: 'Provisión de fondos',
      horas: 5,
      tarifaHora: 120,
      importe: 600,
      estado: 'impagada',
      modalidad: 'horas',
      fecha: isoDays(-12),
    },
    {
      ...entityBase(uid, 'law_invoice', 'demo-law-inv-3'),
      numero: 'FAC-2026-019',
      cliente: 'Marina López',
      caso: 'EXP-2026/0142',
      concepto: 'Preparación vista oral',
      horas: 8,
      tarifaHora: 130,
      importe: 1040,
      estado: 'enviada',
      modalidad: 'horas',
      fecha: isoDays(-3),
    },
    {
      ...entityBase(uid, 'law_invoice', 'demo-law-inv-4'),
      numero: 'FAC-2025-112',
      cliente: 'Laura Gómez',
      caso: 'EXP-2025/0402',
      concepto: 'Cierre de expediente',
      horas: 4,
      tarifaHora: 120,
      importe: 480,
      estado: 'cobrada',
      modalidad: 'horas',
      fecha: isoDays(-45),
    },
    {
      ...entityBase(uid, 'law_invoice', 'demo-law-inv-5'),
      numero: 'FAC-2026-033',
      cliente: 'Grupo Norte SL',
      caso: 'EXP-2026/0098',
      concepto: 'Iguala mensual · marzo 2026',
      horas: 0,
      tarifaHora: 0,
      importe: 950,
      estado: 'cobrada',
      modalidad: 'iguala',
      fecha: isoDays(-10),
    },
    {
      ...entityBase(uid, 'law_invoice', 'demo-law-inv-6'),
      numero: 'FAC-2026-034',
      cliente: 'TechMed SL',
      caso: 'EXP-2026/0155',
      concepto: 'Iguala asesoría laboral',
      horas: 0,
      tarifaHora: 0,
      importe: 750,
      estado: 'enviada',
      modalidad: 'iguala',
      fecha: isoDays(-2),
    },
    {
      ...entityBase(uid, 'law_invoice', 'demo-law-inv-7'),
      numero: 'FAC-2026-022',
      cliente: 'Andrés Molina',
      caso: 'EXP-2025/0881',
      concepto: 'Honorarios por éxito · absolución parcial',
      horas: 0,
      tarifaHora: 0,
      importe: 2500,
      estado: 'borrador',
      modalidad: 'exito',
      fecha: isoDays(-1),
    },
    {
      ...entityBase(uid, 'law_invoice', 'demo-law-inv-8'),
      numero: 'FAC-2026-030',
      cliente: 'Marina López',
      caso: 'EXP-2026/0142',
      concepto: 'Parte de horas · revisión documental',
      horas: 3.5,
      tarifaHora: 130,
      importe: 455,
      estado: 'cobrada',
      modalidad: 'horas',
      fecha: isoDays(-8),
    },
    {
      ...entityBase(uid, 'law_invoice', 'demo-law-inv-9'),
      numero: 'FAC-2026-029',
      cliente: 'Pablo Ruiz',
      caso: 'EXP-2026/0160',
      concepto: 'Consulta inicial + borrador convenio',
      horas: 2,
      tarifaHora: 110,
      importe: 220,
      estado: 'borrador',
      modalidad: 'horas',
      fecha: isoDays(0),
    },
    {
      ...entityBase(uid, 'law_invoice', 'demo-law-inv-10'),
      numero: 'FAC-2026-027',
      cliente: 'Elena Vargas',
      caso: 'EXP-2026/0110',
      concepto: 'Interposición de demanda',
      horas: 6,
      tarifaHora: 120,
      importe: 720,
      estado: 'cobrada',
      modalidad: 'horas',
      fecha: isoDays(-20),
    },
    {
      ...entityBase(uid, 'law_invoice', 'demo-law-inv-11'),
      numero: 'FAC-2026-025',
      cliente: 'Inmobiliaria Costa SA',
      caso: 'EXP-2026/0088',
      concepto: 'Iguala mercantil · febrero',
      horas: 0,
      tarifaHora: 0,
      importe: 1100,
      estado: 'impagada',
      modalidad: 'iguala',
      fecha: isoDays(-28),
    },
    {
      ...entityBase(uid, 'law_invoice', 'demo-law-inv-12'),
      numero: 'FAC-2026-021',
      cliente: 'Laura Gómez',
      caso: 'EXP-2025/0402',
      concepto: 'Éxito · homologación de convenio',
      horas: 0,
      tarifaHora: 0,
      importe: 1800,
      estado: 'cobrada',
      modalidad: 'exito',
      fecha: isoDays(-50),
    },
  ];

  const timeEntries: LawyerDemoTimeEntry[] = [
    {
      id: 'demo-law-te-1',
      fecha: isoDays(0),
      abogado: 'Lcda. Ana Beltrán',
      caso: 'EXP-2026/0142',
      cliente: 'Marina López',
      descripcion: 'Preparación interrogatorio testigos',
      minutos: 90,
      facturable: true,
      tarifaHora: 130,
    },
    {
      id: 'demo-law-te-2',
      fecha: isoDays(0),
      abogado: 'Lcdo. Carlos Mendoza',
      caso: 'EXP-2026/0098',
      cliente: 'Grupo Norte SL',
      descripcion: 'Revisión de estatutos y pactos parasociales',
      minutos: 120,
      facturable: true,
      tarifaHora: 140,
    },
    {
      id: 'demo-law-te-3',
      fecha: isoDays(-1),
      abogado: 'Lcdo. Javier Ramos',
      caso: 'EXP-2026/0110',
      cliente: 'Elena Vargas',
      descripcion: 'Llamada con cliente + envío documentación',
      minutos: 45,
      facturable: true,
      tarifaHora: 120,
    },
    {
      id: 'demo-law-te-4',
      fecha: isoDays(-1),
      abogado: 'Lcda. Patricia Solís',
      caso: 'EXP-2025/0881',
      cliente: 'Andrés Molina',
      descripcion: 'Estudio de jurisprudencia (interno)',
      minutos: 60,
      facturable: false,
      tarifaHora: 130,
    },
    {
      id: 'demo-law-te-5',
      fecha: isoDays(-2),
      abogado: 'Lcda. Ana Beltrán',
      caso: 'EXP-2026/0142',
      cliente: 'Marina López',
      descripcion: 'Redacción de conclusiones',
      minutos: 150,
      facturable: true,
      tarifaHora: 130,
    },
    {
      id: 'demo-law-te-6',
      fecha: isoDays(-2),
      abogado: 'Lcdo. Carlos Mendoza',
      caso: 'EXP-2026/0098',
      cliente: 'Grupo Norte SL',
      descripcion: 'Reunión socios · acta interna',
      minutos: 75,
      facturable: true,
      tarifaHora: 140,
    },
    {
      id: 'demo-law-te-7',
      fecha: isoDays(-3),
      abogado: 'Lcdo. Javier Ramos',
      caso: 'EXP-2026/0160',
      cliente: 'Pablo Ruiz',
      descripcion: 'Borrador convenio regulador',
      minutos: 110,
      facturable: true,
      tarifaHora: 110,
    },
    {
      id: 'demo-law-te-8',
      fecha: isoDays(-4),
      abogado: 'Lcda. Patricia Solís',
      caso: 'EXP-2025/0881',
      cliente: 'Andrés Molina',
      descripcion: 'Comparecencia en juzgado',
      minutos: 180,
      facturable: true,
      tarifaHora: 130,
    },
  ];

  const despachos: LawyerDemoDespacho[] = [
    { _id: 'demo-law-desp-1', name: 'Despacho Barcelona · Eixample', active: true },
    { _id: 'demo-law-desp-2', name: 'Despacho Badalona', active: true },
  ];

  return { leads, cases, deadlines, hearings, invoices, timeEntries, despachos };
}

/** Si la cuenta es uriel@admin.com y la lista API está vacía → demo. */
export function withLawyerDemoList<T>(
  list: T[],
  demo: T[],
  email: string | null | undefined,
): T[] {
  if (!isLawyerDemoViewer(email)) return list;
  if (Array.isArray(list) && list.length > 0) return list;
  return demo;
}
