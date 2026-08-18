/**
 * Tareas predefinidas de «Mi trabajo» por función (rol) y vertical.
 * Se siembran al aceptar la invitación y, si faltan, al abrir Mi trabajo.
 * IDs de rol = inviteFunctionRoles (Administrador, Encargado, Reparto…).
 */

export type RoleTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type RoleTaskTemplateItem = {
  /** Clave estable → id Couch `wtask:…:tpl:{key}` (idempotente). */
  key: string;
  title: string;
  description: string;
  priority: RoleTaskPriority;
};

export type RoleTaskTemplateBundle = {
  roleId: string;
  /** Etiqueta corta para UI Equipo / Mi trabajo */
  roleLabel: string;
  summary: string;
  tasks: RoleTaskTemplateItem[];
};

/** Admin = nivel creador de cuenta (sin «Mi trabajo»). */
function deliveryAccountAdmin(): RoleTaskTemplateBundle {
  return {
    roleId: 'Admin',
    roleLabel: 'Admin',
    summary: 'Como el creador de la cuenta: acceso total al negocio.',
    tasks: [],
  };
}

/** Administrador = lleva el SaaS (sin «Mi trabajo»). */
function deliveryAdministrador(): RoleTaskTemplateBundle {
  return {
    roleId: 'Administrador',
    roleLabel: 'Administrador',
    summary: 'Lleva el SaaS del negocio: operación y panel de administración.',
    tasks: [],
  };
}

function deliveryGestor(): RoleTaskTemplateBundle {
  return {
    roleId: 'Gestor',
    roleLabel: 'Gestor RRHH',
    summary: 'Equipo, altas, horarios y nóminas.',
    tasks: [
      {
        key: 'gestor-altas',
        title: 'Revisar altas e invitaciones pendientes',
        description: 'Confirma que los nuevos tengan tienda, horario y rol correctos.',
        priority: 'high',
      },
      {
        key: 'gestor-horarios',
        title: 'Comprobar horarios y fichajes de la semana',
        description: 'Cuadrar turnos, ausencias y solicitudes RRHH pendientes.',
        priority: 'medium',
      },
      {
        key: 'gestor-nomina',
        title: 'Preparar datos de nómina / incidencias de personal',
        description: 'Horas, extras y notas que deba ver nómina o el administrador.',
        priority: 'medium',
      },
    ],
  };
}

function deliveryEncargado(): RoleTaskTemplateBundle {
  return {
    roleId: 'Encargado',
    roleLabel: 'Encargado',
    summary: 'Coordina el día: pedidos, equipo, caja y que el local funcione.',
    tasks: [
      {
        key: 'enc-abrir-tienda',
        title: 'Abrir el local y preparar el turno',
        description: 'Luces, TPV, cocina/mostrador listos y briefing breve al equipo.',
        priority: 'high',
      },
      {
        key: 'enc-coger-pedidos',
        title: 'Coger y revisar pedidos bien (TPV / teléfono)',
        description: 'Datos correctos, dirección, alergias/notas y totales. Evitar errores antes de cocina.',
        priority: 'urgent',
      },
      {
        key: 'enc-equipo',
        title: 'Coordinar al equipo (mostrador, cocina y reparto)',
        description: 'Asignar carga, cubrir huecos y resolver incidencias del personal.',
        priority: 'high',
      },
      {
        key: 'enc-caja',
        title: 'Hacer y controlar la caja del turno',
        description: 'Apertura, movimientos y cierre. Cuadra efectivo/tarjeta y anota diferencias.',
        priority: 'high',
      },
      {
        key: 'enc-reparto-ok',
        title: 'Asegurar que los pedidos salen a tiempo al reparto',
        description: 'Montaje correcto, ticket y que el repartidor tenga ruta clara.',
        priority: 'medium',
      },
    ],
  };
}

function deliveryMostrador(): RoleTaskTemplateBundle {
  return {
    roleId: 'Mostrador / Atención',
    roleLabel: 'Mostrador',
    summary: 'Atención al cliente, pedidos en TPV y apoyo en caja.',
    tasks: [
      {
        key: 'mos-atencion',
        title: 'Atender clientes en mostrador / teléfono',
        description: 'Saludo, toma de pedido clara y confirmación de totales al cliente.',
        priority: 'high',
      },
      {
        key: 'mos-tpv',
        title: 'Introducir pedidos correctamente en el TPV',
        description: 'Productos, extras, notas y canal (local / delivery) sin errores.',
        priority: 'urgent',
      },
      {
        key: 'mos-caja',
        title: 'Cobrar y apoyar en caja',
        description: 'Cobros en efectivo/tarjeta, tickets y dejar la caja ordenada.',
        priority: 'high',
      },
      {
        key: 'mos-entrega-local',
        title: 'Entregar pedidos de recogida en local',
        description: 'Comprobar ticket, productos y que el cliente se lleve lo correcto.',
        priority: 'medium',
      },
    ],
  };
}

function deliveryCocina(): RoleTaskTemplateBundle {
  return {
    roleId: 'Cocina',
    roleLabel: 'Cocina',
    summary: 'Preparar pedidos bien y a tiempo para mostrador o reparto.',
    tasks: [
      {
        key: 'coc-mise',
        title: 'Preparar estación y mise en place',
        description: 'Ingredientes, utensilios y limpieza antes del pico de pedidos.',
        priority: 'high',
      },
      {
        key: 'coc-pedidos',
        title: 'Preparar pedidos según ticket (sin errores)',
        description: 'Seguir el ticket: extras, sin ingredientes y tiempos de cocina.',
        priority: 'urgent',
      },
      {
        key: 'coc-montaje',
        title: 'Montar pedidos listos para mostrador o reparto',
        description: 'Embolsar/empaquetar con ticket visible y avisar cuando esté listo.',
        priority: 'high',
      },
      {
        key: 'coc-limpieza',
        title: 'Mantener cocina limpia y segura durante el turno',
        description: 'Zonas de trabajo, residuos y cierre básico de estación.',
        priority: 'medium',
      },
    ],
  };
}

function deliveryReparto(): RoleTaskTemplateBundle {
  return {
    roleId: 'Reparto',
    roleLabel: 'Repartidor',
    summary: 'Coger pedidos bien, cobrar si toca y entregar a domicilio.',
    tasks: [
      {
        key: 'rep-fichar',
        title: 'Fichar y confirmar disponibilidad para rutas',
        description: 'Entra en turno y avisa al encargado de que puedes salir a repartir.',
        priority: 'high',
      },
      {
        key: 'rep-coger-pedido',
        title: 'Coger el pedido bien (ticket + bolsa completa)',
        description: 'Comprueba productos, ticket, dirección y forma de pago antes de salir.',
        priority: 'urgent',
      },
      {
        key: 'rep-caja-cobro',
        title: 'Gestionar cobros en ruta (si el pedido va a pagar)',
        description: 'Efectivo o datáfono: entrega el cambio correcto y anota incidencias.',
        priority: 'high',
      },
      {
        key: 'rep-entregar',
        title: 'Repartir y entregar al cliente',
        description: 'Ruta ordenada, llegada a tiempo, confirmar entrega y estado del pedido.',
        priority: 'urgent',
      },
      {
        key: 'rep-volver',
        title: 'Volver al local y reportar incidencias',
        description: 'Devolver efectivo/tickets, avisar retrasos, direcciones mal o pedidos incompletos.',
        priority: 'medium',
      },
    ],
  };
}

function restaurantEncargado(): RoleTaskTemplateBundle {
  return {
    roleId: 'Encargado',
    roleLabel: 'Encargado',
    summary: 'Coordina sala, barra, cocina y caja del servicio.',
    tasks: [
      {
        key: 'renc-abrir',
        title: 'Abrir el servicio (sala / barra)',
        description: 'Mesas, TPV sala, briefing al equipo de sala y cocina.',
        priority: 'high',
      },
      {
        key: 'renc-comandas',
        title: 'Supervisar comandas y ritmo de servicio',
        description: 'Que las comandas lleguen bien a cocina y se sirvan a tiempo.',
        priority: 'urgent',
      },
      {
        key: 'renc-equipo',
        title: 'Coordinar al personal del turno',
        description: 'Asignar zonas, cubrir picos y resolver incidencias del equipo.',
        priority: 'high',
      },
      {
        key: 'renc-caja',
        title: 'Controlar caja y cierres de turno',
        description: 'Arqueo, propinas e incidencias de cobro.',
        priority: 'high',
      },
    ],
  };
}

function restaurantMostrador(): RoleTaskTemplateBundle {
  return {
    roleId: 'Mostrador / Atención',
    roleLabel: 'Sala / barra',
    summary: 'Atención en sala o barra y comandas correctas.',
    tasks: [
      {
        key: 'rsala-atencion',
        title: 'Atender mesas / barra',
        description: 'Acogida, pedidos claros y seguimiento del servicio.',
        priority: 'high',
      },
      {
        key: 'rsala-comanda',
        title: 'Pasar comandas bien al TPV / cocina',
        description: 'Sin errores de plato, modificaciones ni mesa.',
        priority: 'urgent',
      },
      {
        key: 'rsala-cobro',
        title: 'Cobrar cuentas correctamente',
        description: 'Ticket, forma de pago y cierre de mesa.',
        priority: 'high',
      },
    ],
  };
}

const DELIVERY_BUNDLES: RoleTaskTemplateBundle[] = [
  deliveryAccountAdmin(),
  deliveryAdministrador(),
  deliveryGestor(),
  deliveryEncargado(),
  deliveryMostrador(),
  deliveryCocina(),
  deliveryReparto(),
];

const RESTAURANT_BUNDLES: RoleTaskTemplateBundle[] = [
  deliveryAccountAdmin(),
  deliveryAdministrador(),
  deliveryGestor(),
  restaurantEncargado(),
  restaurantMostrador(),
  {
    ...deliveryCocina(),
    summary: 'Preparar comandas de sala y cocina a tiempo.',
  },
];

const BUTCHER_BUNDLES: RoleTaskTemplateBundle[] = [
  deliveryAccountAdmin(),
  deliveryAdministrador(),
  deliveryGestor(),
  {
    roleId: 'Encargado',
    roleLabel: 'Encargado',
    summary: 'Coordina mostrador, obrador, encargos y caja.',
    tasks: [
      {
        key: 'bt-enc-abrir',
        title: 'Abrir el local y preparar el turno',
        description: 'Vitrinas, TPV, báscula, temperaturas y briefing al equipo.',
        priority: 'high',
      },
      {
        key: 'bt-enc-encargos',
        title: 'Revisar encargos del día',
        description: 'Priorizar preparación, avisos a clientes y cobros pendientes.',
        priority: 'urgent',
      },
      {
        key: 'bt-enc-equipo',
        title: 'Coordinar mostrador y obrador',
        description: 'Repartir carga, cubrir picos y resolver incidencias.',
        priority: 'high',
      },
      {
        key: 'bt-enc-caja',
        title: 'Controlar caja del turno',
        description: 'Apertura, movimientos y cierre. Anotar diferencias.',
        priority: 'high',
      },
    ],
  },
  {
    roleId: 'Mostrador / Atención',
    roleLabel: 'Mostrador',
    summary: 'Atención al cliente, pesaje, TPV y encargos.',
    tasks: [
      {
        key: 'bt-mos-vitrina',
        title: 'Preparar mostrador y vitrina',
        description: 'Producto visible, precios actualizados y zona limpia.',
        priority: 'high',
      },
      {
        key: 'bt-mos-tpv',
        title: 'Atender y cobrar en TPV',
        description: 'Pesar bien, ticket correcto y cliente identificado si es habitual.',
        priority: 'urgent',
      },
      {
        key: 'bt-mos-encargos',
        title: 'Gestionar encargos y recogidas',
        description: 'Avisar cuando esté listo y cobrar al entregar.',
        priority: 'high',
      },
    ],
  },
  {
    roleId: 'Obrador / Corte',
    roleLabel: 'Obrador / Corte',
    summary: 'Despiece, elaborados, lotes y merma.',
    tasks: [
      {
        key: 'bt-obr-despiece',
        title: 'Preparar cortes y encargos del obrador',
        description: 'Según pedidos y demanda del mostrador; etiquetar lote y caducidad.',
        priority: 'urgent',
      },
      {
        key: 'bt-obr-lotes',
        title: 'Controlar lotes y caducidades',
        description: 'FEFO: usar primero lo que caduca antes; avisar si hay riesgo.',
        priority: 'high',
      },
      {
        key: 'bt-obr-merma',
        title: 'Registrar merma del turno',
        description: 'Hueso, grasa, recortes o caducado — con peso y motivo.',
        priority: 'medium',
      },
    ],
  },
  {
    roleId: 'Reparto',
    roleLabel: 'Reparto',
    summary: 'Entrega a domicilio de encargos de carnicería.',
    tasks: [
      {
        key: 'bt-rep-ruta',
        title: 'Revisar encargos asignados a reparto',
        description: 'Dirección, franja, cobro en ruta y producto correcto.',
        priority: 'urgent',
      },
      {
        key: 'bt-rep-entrega',
        title: 'Entregar y confirmar en la app',
        description: 'Marcar entregado, cobrar si toca e informar incidencias.',
        priority: 'high',
      },
    ],
  },
];

const REAL_ESTATE_BUNDLES: RoleTaskTemplateBundle[] = [
  deliveryAccountAdmin(),
  deliveryAdministrador(),
  deliveryGestor(),
  {
    roleId: 'Encargado',
    roleLabel: 'Encargado',
    summary: 'Coordina comerciales, visitas del día y captación.',
    tasks: [
      {
        key: 're-enc-agenda',
        title: 'Coordinar agenda de visitas del día',
        description: 'Asignar comerciales, horarios e inmuebles a mostrar.',
        priority: 'urgent',
      },
      {
        key: 're-enc-captacion',
        title: 'Supervisar captación y seguimiento',
        description: 'Que cada comercial avance leads y cierre pendientes.',
        priority: 'high',
      },
    ],
  },
  {
    roleId: 'Comercial',
    roleLabel: 'Comercial',
    summary: 'Visitas, captación, clientes y seguimiento comercial.',
    tasks: [
      {
        key: 're-com-visitas',
        title: 'Preparar y realizar visitas del día',
        description: 'Confirmar cita, revisar ficha del inmueble y dejar notas tras la visita.',
        priority: 'urgent',
      },
      {
        key: 're-com-seguimiento',
        title: 'Seguimiento de clientes y leads',
        description: 'Llamar o escribir a interesados pendientes de respuesta.',
        priority: 'high',
      },
      {
        key: 're-com-captacion',
        title: 'Avanzar captación de inmuebles',
        description: 'Contactar propietarios y actualizar estado comercial.',
        priority: 'medium',
      },
    ],
  },
];

const EVENTS_BUNDLES: RoleTaskTemplateBundle[] = [
  deliveryAccountAdmin(),
  {
    roleId: 'Administrador',
    roleLabel: 'Administrador',
    summary: 'Lleva el SaaS de eventos: contrataciones, cobros, equipo y panel.',
    /** Sin tareas de «Mi trabajo»: entra al SaaS admin, no al backoffice worker. */
    tasks: [],
  },
  deliveryGestor(),
  {
    roleId: 'Encargado',
    roleLabel: 'Encargado',
    summary: 'Coordina logística, catering y personal del evento.',
    tasks: [
      {
        key: 'ev-enc-briefing',
        title: 'Briefing del evento al equipo',
        description: 'Horarios, proveedores y puntos críticos del día.',
        priority: 'high',
      },
      {
        key: 'ev-enc-logistica',
        title: 'Supervisar logística y montaje',
        description: 'Que todo llegue y se monte según plan.',
        priority: 'urgent',
      },
    ],
  },
  {
    roleId: 'Comercial',
    roleLabel: 'Comercial',
    summary: 'Presupuestos, clientes y cierre de contratos.',
    tasks: [
      {
        key: 'ev-com-seguimiento',
        title: 'Seguimiento de presupuestos abiertos',
        description: 'Llamar/escribir a clientes pendientes de cierre.',
        priority: 'high',
      },
      {
        key: 'ev-com-contrato',
        title: 'Cerrar contrato y datos del evento',
        description: 'Fecha, menú/servicios, cobros y notas internas.',
        priority: 'urgent',
      },
    ],
  },
  {
    roleId: 'Operaciones',
    roleLabel: 'Operaciones',
    summary: 'Plan del día del evento e invitados.',
    tasks: [
      {
        key: 'ev-ops-plan',
        title: 'Preparar plan operativo del día',
        description: 'Timeline, proveedores y checklist de montaje.',
        priority: 'high',
      },
      {
        key: 'ev-ops-invitados',
        title: 'Gestionar lista de invitados / accesos',
        description: 'Confirmaciones e incidencias en puerta.',
        priority: 'medium',
      },
    ],
  },
];

function bundlesForBusinessType(businessType?: string | null): RoleTaskTemplateBundle[] {
  const t = String(businessType || '').trim().toLowerCase();
  if (t === 'events') return EVENTS_BUNDLES;
  if (t === 'realestate') return REAL_ESTATE_BUNDLES;
  if (t === 'restaurant' || t === 'bar' || t === 'cafe') return RESTAURANT_BUNDLES;
  if (t === 'butchershop') return BUTCHER_BUNDLES;
  return DELIVERY_BUNDLES;
}

/** Roles legacy / sinónimos → id de plantilla (inviteFunctionRoles). */
function normalizeRoleForTasks(roleId: string): string {
  const id = String(roleId || '').trim();
  if (!id) return '';
  const lower = id.toLowerCase();
  const aliases: Record<string, string> = {
    // Admin es rol propio (como creador); no fusionar con Administrador.
    administrador: 'Administrador',
    gerente: 'Encargado',
    encargado: 'Encargado',
    gestor: 'Gestor',
    'gestor rrhh': 'Gestor',
    cocina: 'Cocina',
    cocinero: 'Cocina',
    'cocinero/a': 'Cocina',
    reparto: 'Reparto',
    repartidor: 'Reparto',
    'repartidor/a': 'Reparto',
    delivery: 'Reparto',
    mostrador: 'Mostrador / Atención',
    'mostrador / atención': 'Mostrador / Atención',
    'mostrador/atención': 'Mostrador / Atención',
    atención: 'Mostrador / Atención',
    atencion: 'Mostrador / Atención',
    'obrador / corte': 'Obrador / Corte',
    obrador: 'Obrador / Corte',
    corte: 'Obrador / Corte',
    carnicero: 'Obrador / Corte',
    'carnicero/a': 'Obrador / Corte',
    comercial: 'Comercial',
    operaciones: 'Operaciones',
  };
  return aliases[lower] || id;
}

export function getRoleTaskBundle(
  roleId: string | null | undefined,
  businessType?: string | null,
): RoleTaskTemplateBundle | null {
  const id = normalizeRoleForTasks(String(roleId || ''));
  if (!id) return null;
  const bundles = bundlesForBusinessType(businessType);
  return bundles.find((b) => b.roleId === id) || null;
}

export function listRoleTaskBundles(businessType?: string | null): RoleTaskTemplateBundle[] {
  return bundlesForBusinessType(businessType);
}

export function getRoleTaskTemplates(
  roleId: string | null | undefined,
  businessType?: string | null,
): RoleTaskTemplateItem[] {
  return getRoleTaskBundle(roleId, businessType)?.tasks || [];
}

/** Etiquetas legibles de permisos de módulo a partir de la matriz (para cards de Equipo). */
export function formatMatrixPermissionLabels(
  matrix: Record<string, { view?: boolean; edit?: boolean }> | null | undefined,
  labelByKey: (key: string) => string,
): string {
  if (!matrix || typeof matrix !== 'object') return 'Sin permisos base';
  const keys = Object.keys(matrix).filter((k) => matrix[k]?.view || matrix[k]?.edit);
  if (keys.length === 0) return 'Sin permisos base';
  if (keys.length >= 8) return 'Acceso amplio al negocio';
  return keys.map((k) => labelByKey(k)).join(', ');
}
