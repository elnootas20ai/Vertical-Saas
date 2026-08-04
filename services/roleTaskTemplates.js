/**
 * Catálogo servidor de tareas «Mi trabajo» por rol (espejo de src/app/lib/roleTaskTemplates.ts).
 * Mantener alineado al cambiar textos o roles.
 */

function deliveryAdmin() {
  return {
    roleId: 'Administrador',
    roleLabel: 'Administrador',
    summary: 'Responsable del negocio: caja, equipo, pedidos y cierre del día.',
    tasks: [
      { key: 'admin-revisar-equipo', title: 'Revisar que el equipo esté fichado y en su puesto', description: 'Comprueba fichajes, horarios y que cada uno sepa su función del día.', priority: 'high' },
      { key: 'admin-caja-apertura', title: 'Supervisar apertura de caja del local', description: 'Fondo de caja, TPV listo y que el encargado o cajero confirmen el arqueo inicial.', priority: 'high' },
      { key: 'admin-pedidos-flujo', title: 'Revisar el flujo de pedidos (TPV → cocina → reparto)', description: 'Que no se acumulen pedidos mal tomados, retrasos en cocina o sin repartidor.', priority: 'medium' },
      { key: 'admin-caja-cierre', title: 'Cierre de caja y resumen del día', description: 'Arqueo, incidencias de cobro y dejar listo el informe para el siguiente turno.', priority: 'high' },
    ],
  };
}

function deliveryGestor() {
  return {
    roleId: 'Gestor',
    roleLabel: 'Gestor RRHH',
    summary: 'Equipo, altas, horarios y nóminas.',
    tasks: [
      { key: 'gestor-altas', title: 'Revisar altas e invitaciones pendientes', description: 'Confirma que los nuevos tengan tienda, horario y rol correctos.', priority: 'high' },
      { key: 'gestor-horarios', title: 'Comprobar horarios y fichajes de la semana', description: 'Cuadrar turnos, ausencias y solicitudes RRHH pendientes.', priority: 'medium' },
      { key: 'gestor-nomina', title: 'Preparar datos de nómina / incidencias de personal', description: 'Horas, extras y notas que deba ver nómina o el administrador.', priority: 'medium' },
    ],
  };
}

function deliveryEncargado() {
  return {
    roleId: 'Encargado',
    roleLabel: 'Encargado',
    summary: 'Coordina el día: pedidos, equipo, caja y que el local funcione.',
    tasks: [
      { key: 'enc-abrir-tienda', title: 'Abrir el local y preparar el turno', description: 'Luces, TPV, cocina/mostrador listos y briefing breve al equipo.', priority: 'high' },
      { key: 'enc-coger-pedidos', title: 'Coger y revisar pedidos bien (TPV / teléfono)', description: 'Datos correctos, dirección, alergias/notas y totales. Evitar errores antes de cocina.', priority: 'urgent' },
      { key: 'enc-equipo', title: 'Coordinar al equipo (mostrador, cocina y reparto)', description: 'Asignar carga, cubrir huecos y resolver incidencias del personal.', priority: 'high' },
      { key: 'enc-caja', title: 'Hacer y controlar la caja del turno', description: 'Apertura, movimientos y cierre. Cuadra efectivo/tarjeta y anota diferencias.', priority: 'high' },
      { key: 'enc-reparto-ok', title: 'Asegurar que los pedidos salen a tiempo al reparto', description: 'Montaje correcto, ticket y que el repartidor tenga ruta clara.', priority: 'medium' },
    ],
  };
}

function deliveryMostrador() {
  return {
    roleId: 'Mostrador / Atención',
    roleLabel: 'Mostrador',
    summary: 'Atención al cliente, pedidos en TPV y apoyo en caja.',
    tasks: [
      { key: 'mos-atencion', title: 'Atender clientes en mostrador / teléfono', description: 'Saludo, toma de pedido clara y confirmación de totales al cliente.', priority: 'high' },
      { key: 'mos-tpv', title: 'Introducir pedidos correctamente en el TPV', description: 'Productos, extras, notas y canal (local / delivery) sin errores.', priority: 'urgent' },
      { key: 'mos-caja', title: 'Cobrar y apoyar en caja', description: 'Cobros en efectivo/tarjeta, tickets y dejar la caja ordenada.', priority: 'high' },
      { key: 'mos-entrega-local', title: 'Entregar pedidos de recogida en local', description: 'Comprobar ticket, productos y que el cliente se lleve lo correcto.', priority: 'medium' },
    ],
  };
}

function deliveryCocina() {
  return {
    roleId: 'Cocina',
    roleLabel: 'Cocina',
    summary: 'Preparar pedidos bien y a tiempo para mostrador o reparto.',
    tasks: [
      { key: 'coc-mise', title: 'Preparar estación y mise en place', description: 'Ingredientes, utensilios y limpieza antes del pico de pedidos.', priority: 'high' },
      { key: 'coc-pedidos', title: 'Preparar pedidos según ticket (sin errores)', description: 'Seguir el ticket: extras, sin ingredientes y tiempos de cocina.', priority: 'urgent' },
      { key: 'coc-montaje', title: 'Montar pedidos listos para mostrador o reparto', description: 'Embolsar/empaquetar con ticket visible y avisar cuando esté listo.', priority: 'high' },
      { key: 'coc-limpieza', title: 'Mantener cocina limpia y segura durante el turno', description: 'Zonas de trabajo, residuos y cierre básico de estación.', priority: 'medium' },
    ],
  };
}

function deliveryReparto() {
  return {
    roleId: 'Reparto',
    roleLabel: 'Repartidor',
    summary: 'Coger pedidos bien, cobrar si toca y entregar a domicilio.',
    tasks: [
      { key: 'rep-fichar', title: 'Fichar y confirmar disponibilidad para rutas', description: 'Entra en turno y avisa al encargado de que puedes salir a repartir.', priority: 'high' },
      { key: 'rep-coger-pedido', title: 'Coger el pedido bien (ticket + bolsa completa)', description: 'Comprueba productos, ticket, dirección y forma de pago antes de salir.', priority: 'urgent' },
      { key: 'rep-caja-cobro', title: 'Gestionar cobros en ruta (si el pedido va a pagar)', description: 'Efectivo o datáfono: entrega el cambio correcto y anota incidencias.', priority: 'high' },
      { key: 'rep-entregar', title: 'Repartir y entregar al cliente', description: 'Ruta ordenada, llegada a tiempo, confirmar entrega y estado del pedido.', priority: 'urgent' },
      { key: 'rep-volver', title: 'Volver al local y reportar incidencias', description: 'Devolver efectivo/tickets, avisar retrasos, direcciones mal o pedidos incompletos.', priority: 'medium' },
    ],
  };
}

function restaurantEncargado() {
  return {
    roleId: 'Encargado',
    roleLabel: 'Encargado',
    summary: 'Coordina sala, barra, cocina y caja del servicio.',
    tasks: [
      { key: 'renc-abrir', title: 'Abrir el servicio (sala / barra)', description: 'Mesas, TPV sala, briefing al equipo de sala y cocina.', priority: 'high' },
      { key: 'renc-comandas', title: 'Supervisar comandas y ritmo de servicio', description: 'Que las comandas lleguen bien a cocina y se sirvan a tiempo.', priority: 'urgent' },
      { key: 'renc-equipo', title: 'Coordinar al personal del turno', description: 'Asignar zonas, cubrir picos y resolver incidencias del equipo.', priority: 'high' },
      { key: 'renc-caja', title: 'Controlar caja y cierres de turno', description: 'Arqueo, propinas e incidencias de cobro.', priority: 'high' },
    ],
  };
}

function restaurantMostrador() {
  return {
    roleId: 'Mostrador / Atención',
    roleLabel: 'Sala / barra',
    summary: 'Atención en sala o barra y comandas correctas.',
    tasks: [
      { key: 'rsala-atencion', title: 'Atender mesas / barra', description: 'Acogida, pedidos claros y seguimiento del servicio.', priority: 'high' },
      { key: 'rsala-comanda', title: 'Pasar comandas bien al TPV / cocina', description: 'Sin errores de plato, modificaciones ni mesa.', priority: 'urgent' },
      { key: 'rsala-cobro', title: 'Cobrar cuentas correctamente', description: 'Ticket, forma de pago y cierre de mesa.', priority: 'high' },
    ],
  };
}

const DELIVERY = [
  deliveryAdmin(),
  deliveryGestor(),
  deliveryEncargado(),
  deliveryMostrador(),
  deliveryCocina(),
  deliveryReparto(),
];

const RESTAURANT = [
  { ...deliveryAdmin(), summary: 'Responsable del bar o restaurante: equipo, caja y servicio.' },
  deliveryGestor(),
  restaurantEncargado(),
  restaurantMostrador(),
  { ...deliveryCocina(), summary: 'Preparar comandas de sala y cocina a tiempo.' },
];

const EVENTS = [
  {
    roleId: 'Administrador',
    roleLabel: 'Administrador',
    summary: 'Opera el negocio de eventos: equipo, contratos y día D.',
    tasks: [
      { key: 'ev-admin-equipo', title: 'Revisar equipo y roles del evento', description: 'Quién cubre comercial, operaciones y montaje.', priority: 'high' },
      { key: 'ev-admin-caja', title: 'Controlar cobros y cierre económico', description: 'Pagos de clientes, proveedores e incidencias.', priority: 'medium' },
    ],
  },
  deliveryGestor(),
  {
    roleId: 'Encargado',
    roleLabel: 'Encargado',
    summary: 'Coordina logística, catering y personal del evento.',
    tasks: [
      { key: 'ev-enc-briefing', title: 'Briefing del evento al equipo', description: 'Horarios, proveedores y puntos críticos del día.', priority: 'high' },
      { key: 'ev-enc-logistica', title: 'Supervisar logística y montaje', description: 'Que todo llegue y se monte según plan.', priority: 'urgent' },
    ],
  },
  {
    roleId: 'Comercial',
    roleLabel: 'Comercial',
    summary: 'Presupuestos, clientes y cierre de contratos.',
    tasks: [
      { key: 'ev-com-seguimiento', title: 'Seguimiento de presupuestos abiertos', description: 'Llamar/escribir a clientes pendientes de cierre.', priority: 'high' },
      { key: 'ev-com-contrato', title: 'Cerrar contrato y datos del evento', description: 'Fecha, menú/servicios, cobros y notas internas.', priority: 'urgent' },
    ],
  },
  {
    roleId: 'Operaciones',
    roleLabel: 'Operaciones',
    summary: 'Plan del día del evento e invitados.',
    tasks: [
      { key: 'ev-ops-plan', title: 'Preparar plan operativo del día', description: 'Timeline, proveedores y checklist de montaje.', priority: 'high' },
      { key: 'ev-ops-invitados', title: 'Gestionar lista de invitados / accesos', description: 'Confirmaciones e incidencias en puerta.', priority: 'medium' },
    ],
  },
];

function bundlesForBusinessType(businessType) {
  const t = String(businessType || '').trim().toLowerCase();
  if (t === 'events') return EVENTS;
  if (t === 'restaurant' || t === 'bar' || t === 'cafe') return RESTAURANT;
  return DELIVERY;
}

/** Roles legacy / sinónimos → id de plantilla. */
function normalizeRoleForTasks(roleId) {
  const id = String(roleId || '').trim();
  if (!id) return '';
  const lower = id.toLowerCase();
  const aliases = {
    admin: 'Administrador',
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
    comercial: 'Comercial',
    operaciones: 'Operaciones',
  };
  return aliases[lower] || id;
}

export function getRoleTaskBundle(roleId, businessType) {
  const id = normalizeRoleForTasks(roleId);
  if (!id) return null;
  return bundlesForBusinessType(businessType).find((b) => b.roleId === id) || null;
}

export function getRoleTaskTemplates(roleId, businessType) {
  return getRoleTaskBundle(roleId, businessType)?.tasks || [];
}
