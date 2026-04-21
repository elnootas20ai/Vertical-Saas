/**
 * Configuración de catálogo por vertical (businessType).
 *
 * Cada vertical define:
 *  - itemLabel / itemLabelPlural  → cómo se llama un ítem en esa vertical
 *  - categories                   → categorías por defecto
 *  - units                        → unidades de medida disponibles
 *  - fields                       → campos visibles y sus metadatos
 *  - features                     → flags de funcionalidad (alérgenos, stock, etc.)
 *  - customFields                 → campos extra específicos de la vertical
 *
 * Cualquier vertical sin config explícita recibe DEFAULT_CATALOG_CONFIG.
 */

// ─── Definiciones de campos base ─────────────────────────────────────────────

const FIELD = {
  name:          { key: 'name',          label: 'Nombre',            type: 'text',     required: true  },
  description:   { key: 'description',   label: 'Descripción',       type: 'textarea', required: false },
  category:      { key: 'category',      label: 'Categoría',         type: 'select',   required: false },
  unitPrice:     { key: 'unitPrice',     label: 'Precio venta',      type: 'number',   required: false },
  costPrice:     { key: 'costPrice',     label: 'Precio coste',      type: 'number',   required: false },
  unit:          { key: 'unit',          label: 'Unidad de medida',  type: 'select',   required: false },
  stockQuantity: { key: 'stockQuantity', label: 'Stock',             type: 'number',   required: false },
  minStock:      { key: 'minStock',      label: 'Stock mínimo',      type: 'number',   required: false },
  supplier:      { key: 'supplier',      label: 'Proveedor',         type: 'relation', required: false },
  allergens:     { key: 'allergens',     label: 'Alérgenos',         type: 'multiselect', required: false },
  image:         { key: 'image',         label: 'Imagen',            type: 'image',    required: false },
  notes:         { key: 'notes',         label: 'Notas',             type: 'textarea', required: false },
  webVisible:    { key: 'webVisible',    label: 'Visible en web',    type: 'boolean',  required: false },
  available:     { key: 'available',     label: 'Disponible',        type: 'boolean',  required: false },
  salesPoint:    { key: 'salesPoint',    label: 'Punto de venta',    type: 'relation', required: false },
};

// ─── Config por defecto (fallback) ───────────────────────────────────────────

const DEFAULT_CATALOG_CONFIG = {
  itemLabel: 'Producto',
  itemLabelPlural: 'Productos',
  categories: ['general', 'servicio', 'accesorio', 'consumible', 'otros'],
  units: [
    { value: 'ud',   label: 'Unidad' },
    { value: 'kg',   label: 'Kilogramo' },
    { value: 'l',    label: 'Litro' },
    { value: 'm',    label: 'Metro' },
    { value: 'h',    label: 'Hora' },
    { value: 'caja', label: 'Caja' },
  ],
  fields: [
    FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
    FIELD.unitPrice, FIELD.costPrice, FIELD.supplier,
    FIELD.stockQuantity, FIELD.minStock,
    FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available, FIELD.salesPoint,
  ],
  features: {
    allergens: false,
    stock: true,
    supplier: true,
    webStore: true,
    salesPoints: true,
  },
  customFields: [],
};

// ─── Configuraciones por vertical ────────────────────────────────────────────

const VERTICAL_CATALOG_CONFIGS = {

  // ── Restauración / Delivery ──────────────────────────────────────────────
  delivery: {
    itemLabel: 'Plato',
    itemLabelPlural: 'Platos',
    categories: [
      'entrantes', 'ensaladas', 'sopas', 'carnes', 'pescados',
      'pastas', 'pizzas', 'hamburguesas', 'postres', 'bebidas',
      'cafetería', 'menú del día', 'infantil', 'vegano', 'otros',
    ],
    units: [
      { value: 'ud',     label: 'Unidad' },
      { value: 'ración', label: 'Ración' },
      { value: 'media',  label: 'Media ración' },
      { value: 'tapa',   label: 'Tapa' },
      { value: 'l',      label: 'Litro' },
      { value: 'cl',     label: 'Centilitro' },
      { value: 'kg',     label: 'Kilogramo' },
      { value: 'pack',   label: 'Pack' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice, FIELD.supplier,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.allergens,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available, FIELD.salesPoint,
    ],
    features: {
      allergens: true,
      stock: true,
      supplier: true,
      webStore: true,
      salesPoints: true,
    },
    customFields: [
      { key: 'ingredients',     label: 'Ingredientes',         type: 'textarea',    required: false },
      { key: 'preparationTime', label: 'Tiempo de preparación (min)', type: 'number', required: false },
      { key: 'spicy',           label: 'Nivel de picante',     type: 'select',      required: false, options: ['ninguno', 'suave', 'medio', 'fuerte', 'muy fuerte'] },
      { key: 'isVegan',         label: 'Vegano',               type: 'boolean',     required: false },
      { key: 'isGlutenFree',    label: 'Sin gluten',           type: 'boolean',     required: false },
    ],
  },

  // ── Peluquería / Salón ───────────────────────────────────────────────────
  hairSalon: {
    itemLabel: 'Servicio',
    itemLabelPlural: 'Servicios',
    categories: [
      'corte', 'color', 'mechas', 'peinado', 'tratamiento capilar',
      'barba', 'manicura', 'pedicura', 'depilación', 'maquillaje',
      'productos de venta', 'otros',
    ],
    units: [
      { value: 'sesión', label: 'Sesión' },
      { value: 'ud',     label: 'Unidad' },
      { value: 'h',      label: 'Hora' },
      { value: 'pack',   label: 'Pack' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: false,
      supplier: false,
      webStore: true,
      salesPoints: false,
    },
    customFields: [
      { key: 'duration',  label: 'Duración (min)', type: 'number',  required: false },
      { key: 'isService', label: 'Es un servicio', type: 'boolean', required: false, default: true },
    ],
  },

  // ── Gimnasio ──────────────────────────────────────────────────────────────
  gym: {
    itemLabel: 'Plan / Clase',
    itemLabelPlural: 'Planes y Clases',
    categories: [
      'membresía', 'clase grupal', 'entrenamiento personal', 'nutrición',
      'suplementos', 'merchandising', 'alquiler', 'otros',
    ],
    units: [
      { value: 'mes',    label: 'Mes' },
      { value: 'sesión', label: 'Sesión' },
      { value: 'ud',     label: 'Unidad' },
      { value: 'pack',   label: 'Pack' },
      { value: 'h',      label: 'Hora' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: true,
      supplier: false,
      webStore: true,
      salesPoints: false,
    },
    customFields: [
      { key: 'duration',    label: 'Duración (min)',        type: 'number',  required: false },
      { key: 'capacity',    label: 'Capacidad máxima',      type: 'number',  required: false },
      { key: 'instructor',  label: 'Instructor / Monitor',  type: 'text',    required: false },
      { key: 'recurrence',  label: 'Recurrencia',           type: 'select',  required: false, options: ['única', 'diaria', 'semanal', 'mensual', 'trimestral', 'anual'] },
    ],
  },

  // ── Clínica ───────────────────────────────────────────────────────────────
  clinic: {
    itemLabel: 'Tratamiento',
    itemLabelPlural: 'Tratamientos',
    categories: [
      'consulta', 'diagnóstico', 'tratamiento', 'cirugía menor',
      'rehabilitación', 'estética', 'análisis', 'vacunas',
      'material sanitario', 'otros',
    ],
    units: [
      { value: 'sesión', label: 'Sesión' },
      { value: 'ud',     label: 'Unidad' },
      { value: 'h',      label: 'Hora' },
      { value: 'pack',   label: 'Pack' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice, FIELD.supplier,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: true,
      supplier: true,
      webStore: true,
      salesPoints: false,
    },
    customFields: [
      { key: 'duration',        label: 'Duración estimada (min)', type: 'number',  required: false },
      { key: 'requiresBooking', label: 'Requiere cita previa',    type: 'boolean', required: false, default: true },
      { key: 'specialty',       label: 'Especialidad',            type: 'text',    required: false },
    ],
  },

  // ── Veterinaria ───────────────────────────────────────────────────────────
  vet: {
    itemLabel: 'Servicio / Producto',
    itemLabelPlural: 'Servicios y Productos',
    categories: [
      'consulta', 'vacunación', 'cirugía', 'diagnóstico', 'desparasitación',
      'peluquería animal', 'alimentación', 'farmacia', 'accesorios', 'otros',
    ],
    units: [
      { value: 'sesión', label: 'Sesión' },
      { value: 'ud',     label: 'Unidad' },
      { value: 'kg',     label: 'Kilogramo' },
      { value: 'dosis',  label: 'Dosis' },
      { value: 'pack',   label: 'Pack' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice, FIELD.supplier,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: true,
      supplier: true,
      webStore: true,
      salesPoints: false,
    },
    customFields: [
      { key: 'species',         label: 'Especie',              type: 'select',  required: false, options: ['perro', 'gato', 'ave', 'roedor', 'reptil', 'equino', 'otro'] },
      { key: 'requiresBooking', label: 'Requiere cita previa', type: 'boolean', required: false, default: true },
    ],
  },

  // ── Hotel ─────────────────────────────────────────────────────────────────
  hotel: {
    itemLabel: 'Servicio / Habitación',
    itemLabelPlural: 'Servicios y Habitaciones',
    categories: [
      'habitación individual', 'habitación doble', 'suite', 'apartamento',
      'spa', 'restaurante', 'minibar', 'lavandería', 'transfer',
      'excursión', 'extras', 'otros',
    ],
    units: [
      { value: 'noche',  label: 'Noche' },
      { value: 'sesión', label: 'Sesión' },
      { value: 'ud',     label: 'Unidad' },
      { value: 'h',      label: 'Hora' },
      { value: 'pack',   label: 'Pack' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice,
      FIELD.stockQuantity,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available, FIELD.salesPoint,
    ],
    features: {
      allergens: false,
      stock: true,
      supplier: false,
      webStore: true,
      salesPoints: true,
    },
    customFields: [
      { key: 'capacity',  label: 'Capacidad (personas)', type: 'number',  required: false },
      { key: 'amenities', label: 'Amenities',            type: 'textarea', required: false },
    ],
  },

  // ── Taller mecánico ───────────────────────────────────────────────────────
  workshop: {
    itemLabel: 'Repuesto / Servicio',
    itemLabelPlural: 'Repuestos y Servicios',
    categories: [
      'repuesto', 'accesorio', 'consumible', 'lubricante', 'neumático',
      'carrocería', 'electrónica', 'mano de obra', 'diagnóstico', 'ITV', 'otros',
    ],
    units: [
      { value: 'ud',  label: 'Unidad' },
      { value: 'l',   label: 'Litro' },
      { value: 'kg',  label: 'Kilogramo' },
      { value: 'h',   label: 'Hora' },
      { value: 'par', label: 'Par' },
      { value: 'set', label: 'Set / Juego' },
      { value: 'm',   label: 'Metro' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice, FIELD.supplier,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: true,
      supplier: true,
      webStore: true,
      salesPoints: false,
    },
    customFields: [
      { key: 'partNumber', label: 'Referencia / OEM',    type: 'text',   required: false },
      { key: 'brand',      label: 'Marca',               type: 'text',   required: false },
      { key: 'compatible', label: 'Vehículos compatibles', type: 'textarea', required: false },
    ],
  },

  // ── Concesionario ─────────────────────────────────────────────────────────
  carDealership: {
    itemLabel: 'Producto / Servicio',
    itemLabelPlural: 'Productos y Servicios',
    categories: [
      'accesorio', 'repuesto', 'servicio posventa', 'garantía extendida',
      'financiación', 'seguro', 'merchandising', 'otros',
    ],
    units: [
      { value: 'ud',  label: 'Unidad' },
      { value: 'h',   label: 'Hora' },
      { value: 'pack', label: 'Pack' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice, FIELD.supplier,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: true,
      supplier: true,
      webStore: true,
      salesPoints: false,
    },
    customFields: [
      { key: 'partNumber', label: 'Referencia', type: 'text', required: false },
      { key: 'brand',      label: 'Marca',      type: 'text', required: false },
    ],
  },

  // ── Limpieza ──────────────────────────────────────────────────────────────
  cleaning: {
    itemLabel: 'Servicio',
    itemLabelPlural: 'Servicios',
    categories: [
      'limpieza general', 'limpieza profunda', 'cristales',
      'desinfección', 'mantenimiento', 'productos', 'otros',
    ],
    units: [
      { value: 'sesión', label: 'Sesión' },
      { value: 'h',      label: 'Hora' },
      { value: 'm2',     label: 'Metro cuadrado' },
      { value: 'ud',     label: 'Unidad' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: true,
      supplier: false,
      webStore: true,
      salesPoints: false,
    },
    customFields: [
      { key: 'duration',     label: 'Duración estimada (min)', type: 'number',  required: false },
      { key: 'staffRequired', label: 'Personal necesario',     type: 'number',  required: false },
    ],
  },

  // ── Eventos ───────────────────────────────────────────────────────────────
  events: {
    itemLabel: 'Servicio / Paquete',
    itemLabelPlural: 'Servicios y Paquetes',
    categories: [
      'catering', 'decoración', 'audiovisual', 'fotografía',
      'entretenimiento', 'logística', 'alquiler de espacio',
      'paquete completo', 'extras', 'otros',
    ],
    units: [
      { value: 'evento',  label: 'Evento' },
      { value: 'sesión',  label: 'Sesión' },
      { value: 'h',       label: 'Hora' },
      { value: 'ud',      label: 'Unidad' },
      { value: 'pack',    label: 'Pack' },
      { value: 'persona', label: 'Persona' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice, FIELD.supplier,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: false,
      supplier: true,
      webStore: true,
      salesPoints: false,
    },
    customFields: [
      { key: 'minGuests', label: 'Mínimo de invitados', type: 'number', required: false },
      { key: 'maxGuests', label: 'Máximo de invitados', type: 'number', required: false },
      { key: 'duration',  label: 'Duración (h)',        type: 'number', required: false },
    ],
  },

  // ── Construcción ──────────────────────────────────────────────────────────
  construction: {
    itemLabel: 'Material / Servicio',
    itemLabelPlural: 'Materiales y Servicios',
    categories: [
      'obra civil', 'fontanería', 'electricidad', 'carpintería',
      'pintura', 'material de construcción', 'maquinaria',
      'mano de obra', 'transporte', 'otros',
    ],
    units: [
      { value: 'ud',   label: 'Unidad' },
      { value: 'kg',   label: 'Kilogramo' },
      { value: 'm',    label: 'Metro' },
      { value: 'm2',   label: 'Metro cuadrado' },
      { value: 'm3',   label: 'Metro cúbico' },
      { value: 'l',    label: 'Litro' },
      { value: 'h',    label: 'Hora' },
      { value: 'día',  label: 'Día' },
      { value: 'saco', label: 'Saco' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice, FIELD.supplier,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.image, FIELD.notes, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: true,
      supplier: true,
      webStore: false,
      salesPoints: false,
    },
    customFields: [
      { key: 'partNumber', label: 'Referencia',    type: 'text', required: false },
      { key: 'brand',      label: 'Marca / Fabricante', type: 'text', required: false },
    ],
  },

  // ── Academia / Formación ──────────────────────────────────────────────────
  academy: {
    itemLabel: 'Curso / Clase',
    itemLabelPlural: 'Cursos y Clases',
    categories: [
      'curso online', 'curso presencial', 'taller', 'clase particular',
      'material didáctico', 'certificación', 'tutorías', 'otros',
    ],
    units: [
      { value: 'curso',  label: 'Curso' },
      { value: 'sesión', label: 'Sesión' },
      { value: 'h',      label: 'Hora' },
      { value: 'mes',    label: 'Mes' },
      { value: 'ud',     label: 'Unidad' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: false,
      supplier: false,
      webStore: true,
      salesPoints: false,
    },
    customFields: [
      { key: 'duration',   label: 'Duración total (h)',  type: 'number',  required: false },
      { key: 'capacity',   label: 'Plazas disponibles',  type: 'number',  required: false },
      { key: 'instructor', label: 'Profesor / Instructor', type: 'text',  required: false },
      { key: 'modality',   label: 'Modalidad',           type: 'select',  required: false, options: ['presencial', 'online', 'híbrido'] },
    ],
  },

  // ── Inmobiliaria ──────────────────────────────────────────────────────────
  realEstate: {
    itemLabel: 'Servicio',
    itemLabelPlural: 'Servicios',
    categories: [
      'gestión de venta', 'gestión de alquiler', 'tasación', 'consultoría',
      'home staging', 'fotografía', 'reforma', 'otros',
    ],
    units: [
      { value: 'servicio', label: 'Servicio' },
      { value: 'ud',       label: 'Unidad' },
      { value: 'h',        label: 'Hora' },
      { value: '%',        label: 'Porcentaje' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: false,
      supplier: false,
      webStore: true,
      salesPoints: false,
    },
    customFields: [],
  },

  // ── Abogado ───────────────────────────────────────────────────────────────
  lawyer: {
    itemLabel: 'Servicio jurídico',
    itemLabelPlural: 'Servicios jurídicos',
    categories: [
      'consulta', 'asesoría', 'procedimiento judicial', 'mediación',
      'notaría', 'gestión administrativa', 'otros',
    ],
    units: [
      { value: 'consulta', label: 'Consulta' },
      { value: 'h',        label: 'Hora' },
      { value: 'expediente', label: 'Expediente' },
      { value: 'ud',       label: 'Unidad' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice,
      FIELD.notes, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: false,
      supplier: false,
      webStore: false,
      salesPoints: false,
    },
    customFields: [
      { key: 'specialty', label: 'Especialidad', type: 'text', required: false },
    ],
  },

  // ── Discoteca / Nightclub ─────────────────────────────────────────────────
  nightclub: {
    itemLabel: 'Producto / Servicio',
    itemLabelPlural: 'Productos y Servicios',
    categories: [
      'bebidas', 'cócteles', 'botellas', 'snacks', 'entrada',
      'reservado VIP', 'merchandising', 'otros',
    ],
    units: [
      { value: 'ud',   label: 'Unidad' },
      { value: 'copa', label: 'Copa' },
      { value: 'botella', label: 'Botella' },
      { value: 'pack', label: 'Pack' },
      { value: 'cl',   label: 'Centilitro' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice, FIELD.supplier,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.allergens,
      FIELD.image, FIELD.notes, FIELD.available, FIELD.salesPoint,
    ],
    features: {
      allergens: true,
      stock: true,
      supplier: true,
      webStore: false,
      salesPoints: true,
    },
    customFields: [],
  },

  // ── Desguace ──────────────────────────────────────────────────────────────
  scrapyard: {
    itemLabel: 'Pieza',
    itemLabelPlural: 'Piezas',
    categories: [
      'motor', 'carrocería', 'interior', 'electrónica', 'suspensión',
      'frenos', 'transmisión', 'escape', 'iluminación', 'otros',
    ],
    units: [
      { value: 'ud',  label: 'Unidad' },
      { value: 'par', label: 'Par' },
      { value: 'set', label: 'Set / Juego' },
      { value: 'kg',  label: 'Kilogramo' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: true,
      supplier: false,
      webStore: true,
      salesPoints: false,
    },
    customFields: [
      { key: 'partNumber',  label: 'Referencia / OEM',       type: 'text',   required: false },
      { key: 'brand',       label: 'Marca',                  type: 'text',   required: false },
      { key: 'compatible',  label: 'Vehículos compatibles',  type: 'textarea', required: false },
      { key: 'condition',   label: 'Estado',                 type: 'select', required: false, options: ['nuevo', 'como nuevo', 'buen estado', 'aceptable', 'para reparar'] },
    ],
  },

  // ── Recambios (spareParts) ────────────────────────────────────────────────
  spareParts: {
    itemLabel: 'Recambio',
    itemLabelPlural: 'Recambios',
    categories: [
      'motor', 'frenos', 'suspensión', 'transmisión', 'carrocería',
      'electrónica', 'iluminación', 'escape', 'aceites y filtros',
      'neumáticos', 'accesorios', 'otros',
    ],
    units: [
      { value: 'ud',  label: 'Unidad' },
      { value: 'par', label: 'Par' },
      { value: 'set', label: 'Set / Juego' },
      { value: 'l',   label: 'Litro' },
      { value: 'kg',  label: 'Kilogramo' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice, FIELD.supplier,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: true,
      supplier: true,
      webStore: true,
      salesPoints: false,
    },
    customFields: [
      { key: 'partNumber', label: 'Referencia / OEM',      type: 'text',     required: false },
      { key: 'brand',      label: 'Marca',                 type: 'text',     required: false },
      { key: 'compatible', label: 'Vehículos compatibles',  type: 'textarea', required: false },
    ],
  },

  // ── Taxi ──────────────────────────────────────────────────────────────────
  taxi: {
    itemLabel: 'Servicio',
    itemLabelPlural: 'Servicios',
    categories: [
      'traslado urbano', 'traslado aeropuerto', 'larga distancia',
      'paquetería', 'servicio premium', 'espera', 'otros',
    ],
    units: [
      { value: 'trayecto', label: 'Trayecto' },
      { value: 'km',       label: 'Kilómetro' },
      { value: 'h',        label: 'Hora' },
      { value: 'ud',       label: 'Unidad' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice,
      FIELD.notes, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: false,
      supplier: false,
      webStore: false,
      salesPoints: false,
    },
    customFields: [
      { key: 'estimatedDistance', label: 'Distancia estimada (km)', type: 'number', required: false },
      { key: 'estimatedTime',    label: 'Duración estimada (min)', type: 'number', required: false },
    ],
  },

  // ── Farmacia ──────────────────────────────────────────────────────────────
  pharmacy: {
    itemLabel: 'Producto',
    itemLabelPlural: 'Productos',
    categories: [
      'medicamento', 'OTC', 'parafarmacia', 'cosmética', 'dietética',
      'higiene', 'bebé', 'veterinaria', 'ortopedia', 'otros',
    ],
    units: [
      { value: 'ud',     label: 'Unidad' },
      { value: 'caja',   label: 'Caja' },
      { value: 'bote',   label: 'Bote' },
      { value: 'tubo',   label: 'Tubo' },
      { value: 'blíster', label: 'Blíster' },
      { value: 'pack',   label: 'Pack' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice, FIELD.supplier,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.image, FIELD.notes, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: true,
      supplier: true,
      webStore: false,
      salesPoints: false,
    },
    customFields: [
      { key: 'activeIngredient', label: 'Principio activo',           type: 'text',    required: false },
      { key: 'lab',              label: 'Laboratorio',                type: 'text',    required: false },
      { key: 'prescription',     label: 'Requiere receta',            type: 'boolean', required: false },
      { key: 'nationalCode',     label: 'Código Nacional',            type: 'text',    required: false },
    ],
  },

  // ── Lavado de coches ──────────────────────────────────────────────────────
  carWash: {
    itemLabel: 'Servicio',
    itemLabelPlural: 'Servicios',
    categories: [
      'lavado exterior', 'lavado completo', 'lavado premium',
      'limpieza interior', 'pulido', 'encerado', 'desinfección',
      'productos', 'otros',
    ],
    units: [
      { value: 'servicio', label: 'Servicio' },
      { value: 'ud',       label: 'Unidad' },
      { value: 'pack',     label: 'Pack' },
    ],
    fields: [
      FIELD.name, FIELD.description, FIELD.category, FIELD.unit,
      FIELD.unitPrice, FIELD.costPrice,
      FIELD.stockQuantity, FIELD.minStock,
      FIELD.image, FIELD.notes, FIELD.webVisible, FIELD.available,
    ],
    features: {
      allergens: false,
      stock: true,
      supplier: false,
      webStore: true,
      salesPoints: false,
    },
    customFields: [
      { key: 'duration', label: 'Duración (min)', type: 'number', required: false },
    ],
  },
};

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Devuelve la configuración de catálogo para una vertical concreta.
 * Si no existe config, devuelve DEFAULT_CATALOG_CONFIG.
 */
export function getVerticalCatalogConfig(businessType) {
  if (!businessType) return { ...DEFAULT_CATALOG_CONFIG };
  return VERTICAL_CATALOG_CONFIGS[businessType] || { ...DEFAULT_CATALOG_CONFIG };
}

/**
 * Devuelve todas las configuraciones indexadas por businessType.
 */
export function getAllVerticalCatalogConfigs() {
  return { ...VERTICAL_CATALOG_CONFIGS };
}

/**
 * Devuelve los campos personalizados permitidos para la vertical.
 * Útil para validar datos entrantes en el backend.
 */
export function getVerticalCustomFieldKeys(businessType) {
  const config = getVerticalCatalogConfig(businessType);
  return config.customFields.map((f) => f.key);
}

/**
 * Valida que los customFields recibidos correspondan a la vertical.
 * Descarta campos desconocidos y aplica defaults.
 */
export function sanitizeCustomFields(businessType, rawCustomFields = {}) {
  const config = getVerticalCatalogConfig(businessType);
  const clean = {};
  for (const fieldDef of config.customFields) {
    const val = rawCustomFields[fieldDef.key];
    if (val !== undefined && val !== null && val !== '') {
      clean[fieldDef.key] = val;
    } else if (fieldDef.default !== undefined) {
      clean[fieldDef.key] = fieldDef.default;
    }
  }
  return clean;
}

export { DEFAULT_CATALOG_CONFIG, FIELD };
