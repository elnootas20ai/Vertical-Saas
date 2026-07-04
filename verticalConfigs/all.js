/**
 * Vertical configurations for the generic CRUD factory.
 * Each config defines entities with their CouchDB document type,
 * ID prefix, fields, and required fields.
 */

export const taxiConfig = {
  name: 'taxi', dbSuffix: 'taxi',
  entities: {
    vehicles:    { type: 'taxi_vehicle',     idPrefix: 'txv', fields: ['numLicencia','matricula','marcaModelo','anio','km','estado','conductorAsignado','ultimaItv','proximaRevision'], required: ['matricula','marcaModelo'] },
    drivers:     { type: 'taxi_driver',      idPrefix: 'txd', fields: ['nombre','dni','telefono','email','numLicenciaTaxi','vehiculoAsignado','turno','estado','antiguedad','valoracion'], required: ['nombre','dni'] },
    trips:       { type: 'taxi_trip',        idPrefix: 'txt', fields: ['numServicio','conductor','vehiculo','origen','destino','fechaHora','kmRecorridos','importe','formaPago','tipo'], required: ['conductor','origen','destino'] },
    shifts:      { type: 'taxi_shift',       idPrefix: 'txs', fields: ['conductor','vehiculo','turno','dia','estado','kmTurno','recaudacionTurno'], required: ['conductor','dia'] },
    maintenance: { type: 'taxi_maintenance', idPrefix: 'txm', fields: ['vehiculo','tipo','fecha','km','taller','coste','estado','proximoMantenimiento'], required: ['vehiculo','tipo'] },
    billing:     { type: 'taxi_billing',     idPrefix: 'txb', fields: ['conductor','periodo','carrerasRealizadas','kmTotales','recaudacionBruta','comisionEmpresaPct','importeEmpresa','importeConductor','estado'], required: ['conductor','periodo'] },
  },
};

export const pharmacyConfig = {
  name: 'pharmacy', dbSuffix: 'pharmacy',
  entities: {
    prescriptions: { type: 'pharm_prescription', idPrefix: 'prx', fields: ['paciente','medico','medicamento','dosis','fecha','estado'], required: ['paciente','medicamento'] },
    inventory:     { type: 'pharm_medication',    idPrefix: 'pmd', fields: ['nombre','laboratorio','categoria','stock','stockMinimo','precio','caducidad'], required: ['nombre'] },
    patients:      { type: 'pharm_patient',       idPrefix: 'ppt', fields: ['nombre','dni','telefono','email','seguro','alergias','ultimaVisita','altaMes'], required: ['nombre'] },
    sales:         { type: 'pharm_sale',          idPrefix: 'psl', fields: ['ticket','fecha','cliente','articulos','total','pago','estado'], required: ['fecha'] },
    suppliers:     { type: 'pharm_supplier',      idPrefix: 'psp', fields: ['nombre','tipo','contacto','telefono','email','ultimoPedido','pedidosPendientes'], required: ['nombre'] },
    guardShifts:   { type: 'pharm_guard',         idPrefix: 'pgd', fields: ['fecha','turno','farmaceutico','tipo','estado'], required: ['fecha','farmaceutico'] },
  },
};

export const carWashConfig = {
  name: 'carwash', dbSuffix: 'carwash',
  entities: {
    services:    { type: 'cw_service',    idPrefix: 'cws', fields: ['nombre','tipo','duracionMin','precio','descripcion','activo','reservasMes'], required: ['nombre'] },
    bookings:    { type: 'cw_booking',    idPrefix: 'cwb', fields: ['numero','cliente','matricula','tipoServicio','fechaHora','estado','empleado','importe'], required: ['cliente','fechaHora'] },
    vehicles:    { type: 'cw_vehicle',    idPrefix: 'cwv', fields: ['matricula','marcaModelo','color','cliente','totalLavados','lavadosEsteMes','ultimoLavado','puntosFidelidad','nuevoEsteMes','recurrente'], required: ['matricula'] },
    products:    { type: 'cw_product',    idPrefix: 'cwp', fields: ['nombre','tipo','stockLitros','stockMinimo','precioPorLitro','proveedor','gastoMensualRef'], required: ['nombre'] },
    staff:       { type: 'cw_staff',      idPrefix: 'cwt', fields: ['nombre','rol','telefono','email','turno','estado','fechaAlta','enTurnoHoy','rendimiento'], required: ['nombre'] },
    memberships: { type: 'cw_membership', idPrefix: 'cwm', fields: ['nombrePlan','tipo','precio','lavadosIncluidos','suscriptoresActivos','activo','renovacionesEsteMes','ingresoRecurrenteRef'], required: ['nombrePlan'] },
  },
};

export const vetConfig = {
  name: 'vet', dbSuffix: 'vet',
  entities: {
    patients:     { type: 'vet_patient',     idPrefix: 'vpt', fields: ['nombre','especie','raza','edadAnios','pesoKg','propietario','telefono','chip','estado'], required: ['nombre','especie'] },
    appointments: { type: 'vet_appointment', idPrefix: 'vap', fields: ['fecha','hora','paciente','propietario','veterinario','tipo','estado','notas'], required: ['fecha','paciente'] },
    history:      { type: 'vet_record',      idPrefix: 'vrc', fields: ['fecha','paciente','veterinario','diagnostico','tratamiento','medicacion','proximaVisita','adjuntos'], required: ['fecha','paciente'] },
    vaccinations: { type: 'vet_vaccination', idPrefix: 'vvc', fields: ['fecha','paciente','especie','vacuna','lote','proximaDosis','veterinario','estado'], required: ['fecha','paciente','vacuna'] },
    inventory:    { type: 'vet_product',     idPrefix: 'vpd', fields: ['nombre','categoria','stock','stockMinimo','precio','proveedor','caducidad'], required: ['nombre'] },
    billing:      { type: 'vet_invoice',     idPrefix: 'vin', fields: ['numero','fecha','propietario','paciente','servicios','total','metodoPago','estado'], required: ['fecha','propietario'] },
  },
};

export const nightclubConfig = {
  name: 'nightclub', dbSuffix: 'nightclub',
  entities: {
    events:    { type: 'nc_event',    idPrefix: 'nce', fields: ['nombre','fecha','artista','tipo','aforoPrevisto','entradasVendidas','precioEntrada','estado'], required: ['nombre','fecha'] },
    vip:       { type: 'nc_vip',      idPrefix: 'ncv', fields: ['cliente','evento','zona','personas','consumicionMinima','importe','estado'], required: ['cliente','evento'] },
    promoters: { type: 'nc_promoter', idPrefix: 'ncp', fields: ['nombre','telefono','email','invitacionesUsadas','clientesTraidos','comisionPct','ingresosGenerados','valoracion','activo'], required: ['nombre'] },
    guestlist: { type: 'nc_guest',    idPrefix: 'ncg', fields: ['nombre','promotor','evento','tipo','horaLlegada','estado'], required: ['nombre','evento'] },
    inventory: { type: 'nc_product',  idPrefix: 'nci', fields: ['producto','categoria','stock','precioCoste','precioVenta','stockMinimo'], required: ['producto'] },
    artists:   { type: 'nc_artist',   idPrefix: 'nca', fields: ['nombre','genero','cache','contacto','proximaActuacion','valoracionPublico','instagram','web'], required: ['nombre'] },
  },
};

export const academyConfig = {
  name: 'academy', dbSuffix: 'academy',
  entities: {
    students:    { type: 'ac_student',    idPrefix: 'acs', fields: ['nombre','dni','email','telefono','curso','fechaMatricula','estado','pagosAlDia'], required: ['nombre'] },
    courses:     { type: 'ac_course',     idPrefix: 'acc', fields: ['nombre','categoria','profesor','duracion','horario','plazas','inscritos','precio','estado'], required: ['nombre'] },
    teachers:    { type: 'ac_teacher',    idPrefix: 'act', fields: ['nombre','especialidad','email','telefono','cursosAsignados','horasSemanales','valoracion'], required: ['nombre'] },
    enrollments: { type: 'ac_enrollment', idPrefix: 'ace', fields: ['alumno','curso','fechaMatricula','importe','formaPago','estado','descuento'], required: ['alumno','curso'] },
    grades:      { type: 'ac_grade',      idPrefix: 'acg', fields: ['alumno','curso','examen','nota','fecha','profesor','observaciones'], required: ['alumno','curso'] },
    schedule:    { type: 'ac_schedule',   idPrefix: 'ach', fields: ['aula','curso','profesor','dia','horaInicio','horaFin','capacidad'], required: ['curso','dia'] },
  },
};

export const realEstateConfig = {
  name: 'realestate', dbSuffix: 'realestate',
  entities: {
    properties: { type: 're_property',  idPrefix: 'rep', fields: ['referencia','tipo','direccion','m2','habitaciones','precio','operacion','estado'], required: ['direccion'] },
    visits:     { type: 're_visit',     idPrefix: 'rev', fields: ['propiedad','cliente','fecha','hora','agente','resultado','notas'], required: ['propiedad','fecha'] },
    contracts:  { type: 're_contract',  idPrefix: 'rec', fields: ['referencia','propiedad','cliente','tipo','fechaInicio','fechaFin','importeMensual','importeTotal','estado'], required: ['propiedad','cliente'] },
    owners:     { type: 're_owner',     idPrefix: 'reo', fields: ['nombre','dniCif','telefono','email','propiedades','comision','ingresosGenerados'], required: ['nombre'] },
    tenants:    { type: 're_tenant',    idPrefix: 'ret', fields: ['nombre','dni','telefono','email','propiedad','contrato','rentaMensual','estadoPagos','fechaFinContrato'], required: ['nombre'] },
    appraisals: { type: 're_appraisal', idPrefix: 'rea', fields: ['propiedad','solicitante','fecha','tasador','valorTasado','metodo','estado'], required: ['propiedad','fecha'] },
  },
};

export const lawyerConfig = {
  name: 'lawyer', dbSuffix: 'lawyer',
  entities: {
    cases:     { type: 'law_case',     idPrefix: 'lwc', fields: ['expediente','tipo','cliente','fechaApertura','estado','abogado','juzgado'], required: ['expediente','cliente'] },
    clients:   { type: 'law_client',   idPrefix: 'lwl', fields: ['nombre','dni','tipo','telefono','email','casosActivos','fechaAlta','saldoPendiente'], required: ['nombre'] },
    hearings:  { type: 'law_hearing',  idPrefix: 'lwh', fields: ['caso','cliente','juzgado','fecha','hora','tipo','sala','estado'], required: ['caso','fecha'] },
    documents: { type: 'law_document', idPrefix: 'lwd', fields: ['nombre','caso','tipo','fecha','autor','estado'], required: ['nombre','caso'] },
    billing:   { type: 'law_invoice',  idPrefix: 'lwi', fields: ['numero','cliente','caso','concepto','horas','tarifaHora','importe','estado'], required: ['cliente'] },
    deadlines: { type: 'law_deadline', idPrefix: 'lwz', fields: ['caso','tipoPlazo','fechaLimite','diasRestantes','prioridad','responsable','estado','descripcion'], required: ['caso','fechaLimite'] },
  },
};

export const hotelConfig = {
  name: 'hotel', dbSuffix: 'hotel',
  entities: {
    reservations:  { type: 'htl_reservation',   idPrefix: 'htr', fields: ['guest','room','checkIn','checkOut','nights','status','channel','amount'], required: ['guest','room'] },
    rooms:         { type: 'htl_room',           idPrefix: 'hto', fields: ['number','floor','tipo','pricePerNight','status','amenities'], required: ['number'] },
    guests:        { type: 'htl_guest',          idPrefix: 'htg', fields: ['name','document','nationality','phone','email','previousStays','preferences','vip'], required: ['name'] },
    checkins:      { type: 'htl_checkin',        idPrefix: 'htc', fields: ['guest','room','date','nights','documentation','processed'], required: ['guest','room'] },
    housekeeping:  { type: 'htl_housekeeping',   idPrefix: 'hth', fields: ['room','status','assignedTo','priority','assignedAt','notes'], required: ['room'] },
    roomService:   { type: 'htl_room_service',   idPrefix: 'hts', fields: ['room','guest','items','time','status','amount'], required: ['room'] },
  },
};

export const gymConfig = {
  name: 'gym', dbSuffix: 'gym',
  entities: {
    members:     { type: 'gym_member',     idPrefix: 'gmm', fields: ['nombre','email','telefono','plan','estado','fechaAlta'], required: ['nombre'] },
    classes:     { type: 'gym_class',      idPrefix: 'gmc', fields: ['nombre','instructor','horario','dia','capacidad','inscritos','sala','tipo'], required: ['nombre'] },
    trainers:    { type: 'gym_trainer',    idPrefix: 'gmt', fields: ['nombre','especialidad','telefono','email','clientesAsignados','horario','certificaciones','valoracion'], required: ['nombre'] },
    memberships: { type: 'gym_membership', idPrefix: 'gmp', fields: ['nombre','precioMensual','precioAnual','beneficios','sociosActivos','color','destacado'], required: ['nombre'] },
    routines:    { type: 'gym_routine',    idPrefix: 'gmr', fields: ['nombre','tipo','duracion','nivel','ejercicios','asignados'], required: ['nombre'] },
    accessLogs:  { type: 'gym_access',     idPrefix: 'gma', fields: ['miembro','horaEntrada','horaSalida','metodo','foto'], required: ['miembro'] },
  },
};

export const clinicConfig = {
  name: 'clinic', dbSuffix: 'clinic',
  entities: {
    patients:      { type: 'cl_patient',      idPrefix: 'clp', fields: ['nombre','dni','fechaNacimiento','telefono','email','grupoSanguineo','alergias','ultimaVisita'], required: ['nombre'] },
    appointments:  { type: 'cl_appointment',  idPrefix: 'cla', fields: ['paciente','doctor','fecha','hora','tipo','estado','consultorio'], required: ['paciente','fecha'] },
    history:       { type: 'cl_record',       idPrefix: 'clr', fields: ['paciente','fecha','diagnostico','doctor','tipo','notas'], required: ['paciente','fecha'] },
    treatments:    { type: 'cl_treatment',    idPrefix: 'clt', fields: ['nombre','categoria','duracion','precio','descripcion','activo'], required: ['nombre'] },
    prescriptions: { type: 'cl_prescription', idPrefix: 'clx', fields: ['paciente','doctor','fecha','medicamentos','estado'], required: ['paciente','fecha'] },
    rooms:         { type: 'cl_room',         idPrefix: 'clo', fields: ['nombre','tipo','equipamiento','doctorAsignado','estado'], required: ['nombre'] },
  },
};

export const eventsConfig = {
  name: 'events', dbSuffix: 'events',
  entities: {
    events:    { type: 'ev_event',    idPrefix: 'eve', fields: ['nombre','tipo','fecha','lugar','cliente','invitados','presupuesto','estado'], required: ['nombre','fecha'] },
    vendors:   { type: 'ev_vendor',   idPrefix: 'evv', fields: ['empresa','tipoServicio','contacto','telefono','email','valoracion','eventosRealizados','tarifaBase'], required: ['empresa'] },
    guests:    { type: 'ev_guest',    idPrefix: 'evg', fields: ['nombre','evento','email','telefono','mesa','confirmacion','menu','acompanantes'], required: ['nombre','evento'] },
    venues:    { type: 'ev_venue',    idPrefix: 'evn', fields: ['nombre','tipo','direccion','capacidad','precio','servicios','disponibilidad','valoracion'], required: ['nombre'] },
    catering:  { type: 'ev_catering', idPrefix: 'evc', fields: ['evento','menu','tipo','comensales','precioPorPersona','total','alergiasDietas','proveedor','estado'], required: ['evento'] },
    logistics: { type: 'ev_task',     idPrefix: 'evl', fields: ['evento','tarea','responsable','fechaLimite','estado','prioridad','categoria'], required: ['evento','tarea'] },
  },
};

export const hairSalonConfig = {
  name: 'salon', dbSuffix: 'salon',
  entities: {
    appointments:  { type: 'sal_appointment', idPrefix: 'sla', fields: ['cliente','servicio','estilista','fecha','hora','duracion','estado','importe'], required: ['cliente','fecha'] },
    services:      { type: 'sal_service',     idPrefix: 'sls', fields: ['nombre','categoria','duracion','precio','descripcion','popular'], required: ['nombre'] },
    stylists:      { type: 'sal_stylist',     idPrefix: 'slt', fields: ['nombre','especialidad','telefono','email','citasHoy','valoracion','comision','clientesFijos'], required: ['nombre'] },
    products:      { type: 'sal_product',     idPrefix: 'slp', fields: ['nombre','marca','categoria','stock','stockMinimo','precioCompra','precioVenta'], required: ['nombre'] },
    loyalty:       { type: 'sal_loyalty',     idPrefix: 'sll', fields: ['cliente','puntos','nivel','ultimaVisita','canjeDisponible','historialPuntos'], required: ['cliente'] },
    clientHistory: { type: 'sal_visit',       idPrefix: 'slv', fields: ['cliente','fechaVisita','servicio','estilista','productoUsado','notasTecnicas','importe','fotosAntes','fotosDespues'], required: ['cliente','fechaVisita'] },
  },
};

export const sparePartsConfig = {
  name: 'spareparts', dbSuffix: 'spareparts',
  entities: {
    catalog:       { type: 'sp_catalog',       idPrefix: 'spc', fields: ['referencia','nombre','marca','categoria','precioPVP','precioCoste','referenciaOE','foto'], required: ['nombre'] },
    stock:         { type: 'sp_stock',         idPrefix: 'sps', fields: ['referencia','nombre','ubicacion','stockActual','stockMinimo','stockMaximo','ultimoMovimiento','proveedorPrincipal','estado'], required: ['referencia'] },
    orders:        { type: 'sp_order',         idPrefix: 'spo', fields: ['numPedido','cliente','tipoCliente','fecha','articulos','importeTotal','estado','urgencia'], required: ['cliente'] },
    suppliers:     { type: 'sp_supplier',      idPrefix: 'spv', fields: ['empresa','cif','contacto','telefono','email','marcas','plazoEntrega','condicionesPago','descuento','valoracion'], required: ['empresa'] },
    compatibility: { type: 'sp_compatibility', idPrefix: 'spx', fields: ['referenciaPieza','nombrePieza','marcaVehiculo','modelo','anioDesde','anioHasta','motorizacion','referenciaOE','notas'], required: ['referenciaPieza','marcaVehiculo'] },
    counterTickets:{ type: 'sp_ticket',        idPrefix: 'spt', fields: ['numTicket','hora','cliente','articulos','total','formaPago','vendedor'], required: [] },
  },
};

export const tobaccoConfig = {
  name: 'tobacco', dbSuffix: 'tobacco',
  entities: {
    sales:       { type: 'tob_sale',       idPrefix: 'tbs', fields: ['ticket','fecha','cliente','articulos','categoria','total','pago','estado'], required: ['fecha'] },
    inventory:   { type: 'tob_product',    idPrefix: 'tbp', fields: ['ref','nombre','categoria','stock','stockMinimo','precioVenta','proveedor','ultimaEntrada'], required: ['nombre'] },
    lottery:     { type: 'tob_lottery',    idPrefix: 'tbl', fields: ['numero','sorteo','fecha','serie','fraccion','precioVenta','estado','premio'], required: ['numero','sorteo'] },
    suppliers:   { type: 'tob_supplier',   idPrefix: 'tbv', fields: ['nombre','cif','contacto','telefono','email','tipo','direccion','notas'], required: ['nombre'] },
    salespoints: { type: 'tob_salespoint', idPrefix: 'tbx', fields: ['codigo','nombre','direccion','ciudad','telefono','responsable','horario','estado','numeroExpendeduria','fechaAlta'], required: ['nombre'] },
    regulatory:  { type: 'tob_regulatory', idPrefix: 'tbr', fields: ['titulo','tipo','expedidoPor','fechaEmision','fechaVencimiento','referencia','notas'], required: ['titulo'] },
  },
};

export const scrapyardOpsConfig = {
  name: 'scrapyard-ops', dbSuffix: 'scrapyard-ops',
  entities: {
    expeditions:     { type: 'sy_expedition',     idPrefix: 'sye', fields: ['numPedido','cliente','telefono','piezas','cantidadPiezas','fechaVenta','fechaPreparacion','fechaExpedicion','responsable','metodoEnvio','numSeguimiento','direccionEnvio','estadoExpedicion','estadoCobro','incidencia','notas'], required: ['cliente'] },
    inventory:       { type: 'sy_inventory',      idPrefix: 'syi', fields: ['referencia','nombre','categoria','vehiculoOrigen','vehiculoMatricula','ubicacion','zona','estanteria','precio','coste','estado','fechaAlta','fechaReserva','fechaVenta','fotos','notas','compatibilidades','historial','garantiaMeses','peso','clienteReserva'], required: ['nombre'] },
    deregistrations: { type: 'sy_deregistration', idPrefix: 'syd', fields: ['matricula','marcaModelo','titular','fechaBaja','tipoBaja','estadoTramite','centroItv','documentacion'], required: ['matricula'] },
    environment:     { type: 'sy_waste',          idPrefix: 'syw', fields: ['tipoResiduo','cantidad','unidad','gestorAutorizado','numDocumento','fechaRecogida','estado'], required: ['tipoResiduo'] },
    workers:         { type: 'sy_worker',         idPrefix: 'syp', fields: ['nombre','avatar','rol','email','telefono','zona','turno','horario','costeHora','estado','horaEntrada','permisos','especializaciones','documentos','piezasDesmontadas','piezasCatalogadas','ventasAtendidas','ingresosHoy','expedicionesHoy','horasTrabajadas','tareasCompletadas','tareasPendientes','tareasEnCurso','incidencias','productividadHora','tendencia'], required: ['nombre'] },
    sales:           { type: 'sy_sale',           idPrefix: 'sys', fields: ['numVenta','cliente','telefono','email','piezas','importeTotal','metodoPago','estado','fecha','notas'], required: ['cliente'] },
  },
};

export const butcherOpsConfig = {
  name: 'butcher-ops', dbSuffix: 'butcher-ops',
  entities: {
    suppliers:    { type: 'bt_supplier',    idPrefix: 'bts', fields: ['nombre','cif','telefono','email','direccion','tipoProducto','diasEntrega','valoracion','activo'], required: ['nombre'] },
    traceability: { type: 'bt_lote',        idPrefix: 'btl', fields: ['codigoLote','proveedorId','proveedorNombre','tipoAnimal','origen','matadero','nGuiaSanitaria','fechaEntrada','fechaCaducidad','fechaSacrificio','kgRecibidos','kgDisponibles','costePorKg','tiendaAlmacenId','tiendaAlmacenNombre','temperatura','estado','motivoBloqueo','fechaBloqueo','observaciones','ventasAsociadas','creadoPor','fechaCreacion'], required: ['codigoLote'] },
    inventory:    { type: 'bt_stock_entry', idPrefix: 'bti', fields: ['producto','lote','zona','cantidad','unidad','fechaEntrada','fechaCaducidad','temperatura'], required: ['producto'] },
    products:     { type: 'bt_product',     idPrefix: 'btp', fields: ['ref','nombre','categoria','precioKg','stock','stockMinimo','conservacion','origen'], required: ['nombre'] },
    catalog:      { type: 'bt_catalog',     idPrefix: 'btc', fields: ['nombre','categoria','precioKg','precioUnidad','stock','stockMinimo','unidadVenta','bloqueado','motivoBloqueo','fechaCaducidad','lote','precioActualizado'], required: ['nombre'] },
    tickets:      { type: 'bt_ticket',      idPrefix: 'btt', fields: ['ticketNo','lines','subtotal','descuentoTotal','total','method','entregado','cambio','clienteId','clienteNombre','workerId','workerName','time'], required: [] },
  },
};

export const restaurantConfig = {
  name: 'restaurant', dbSuffix: 'restaurant',
  entities: {
    waitlist: {
      type: 'rst_waitlist',
      idPrefix: 'rsw',
      fields: ['guestName', 'partySize', 'phone', 'estimatedWait', 'status', 'notes', 'zone', 'clientId'],
      required: ['guestName'],
    },
    reservations: {
      type: 'rst_reservation',
      idPrefix: 'rsr',
      fields: [
        'guestName', 'phone', 'email', 'date', 'time', 'partySize',
        'preferredZone', 'tableId', 'tableName', 'tableNumber', 'notes',
        'status', 'history', 'orderId',
      ],
      required: ['guestName', 'date', 'time'],
    },
  },
};

export const allVerticalConfigs = [
  taxiConfig, pharmacyConfig, carWashConfig, vetConfig, nightclubConfig,
  academyConfig, realEstateConfig, lawyerConfig, hotelConfig, gymConfig,
  clinicConfig, eventsConfig, hairSalonConfig, sparePartsConfig, tobaccoConfig,
  scrapyardOpsConfig, butcherOpsConfig, restaurantConfig,
];
