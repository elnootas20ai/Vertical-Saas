/**
 * MARTE — Motor de Adaptación de Recursos y Términos por Empresa
 *
 * Define la terminología específica para cada sector del SaaS.
 * Cada sector puede tener sus propios términos que reemplazan los genéricos
 * usados en módulos como Presupuestos, Ventas, etc.
 *
 * Para añadir un nuevo sector:
 *   1. Asegúrate de que el `BusinessType` incluye el sector en businessApi.ts.
 *   2. Añade una entrada en `MARTE_SECTOR_TERMS` con los términos correspondientes.
 */

import type { BusinessType } from './businessApi';

// ── Estructura de términos por sector ─────────────────────────────────────────

export interface SectorTerms {
  /**
   * Término que sustituye a "Vehículo" en presupuestos y documentos relacionados.
   * Ej: "Expediente" en construcción, "Vehículo" en concesionarios.
   */
  MARTE: string;

  /** Versión plural del término MARTE. */
  MARTEPlural: string;

  /** Etiqueta para el campo de matrícula / identificador secundario del elemento. */
  plateLabel: string;

  /** Placeholder de búsqueda para el campo nombre del elemento. */
  namePlaceholder: string;
}

// ── Mapa de terminología por sector ──────────────────────────────────────────

const MARTE_SECTOR_TERMS: Partial<Record<BusinessType, SectorTerms>> = {
  // Compra-venta de coches / concesionario
  carDealership: {
    MARTE: 'Vehículo',
    MARTEPlural: 'Vehículos',
    plateLabel: 'Matrícula',
    namePlaceholder: 'Ej: Toyota Corolla 2022',
  },

  // Taller mecánico
  workshop: {
    MARTE: 'Vehículo',
    MARTEPlural: 'Vehículos',
    plateLabel: 'Matrícula',
    namePlaceholder: 'Ej: Ford Focus 2019',
  },

  // Construcción
  construction: {
    MARTE: 'Expediente',
    MARTEPlural: 'Expedientes',
    plateLabel: 'Referencia',
    namePlaceholder: 'Ej: Obra Calle Mayor 14',
  },

  // Inmobiliaria
  realEstate: {
    MARTE: 'Inmueble',
    MARTEPlural: 'Inmuebles',
    plateLabel: 'Referencia catastral',
    namePlaceholder: 'Ej: Piso C/ Gran Vía 5, 3ºA',
  },

  // Abogacía
  lawyer: {
    MARTE: 'Expediente',
    MARTEPlural: 'Expedientes',
    plateLabel: 'Nº expediente',
    namePlaceholder: 'Ej: Caso herencia 2024',
  },

  // Desguace
  scrapyard: {
    MARTE: 'Vehículo',
    MARTEPlural: 'Vehículos',
    plateLabel: 'Matrícula / Bastidor',
    namePlaceholder: 'Ej: Seat Ibiza 2010 (para desguace)',
  },

  // Taxi / flota
  taxi: {
    MARTE: 'Vehículo',
    MARTEPlural: 'Vehículos',
    plateLabel: 'Matrícula',
    namePlaceholder: 'Ej: Seat Alhambra 2020',
  },

  // Lavado de coches
  carWash: {
    MARTE: 'Vehículo',
    MARTEPlural: 'Vehículos',
    plateLabel: 'Matrícula',
    namePlaceholder: 'Ej: Audi A4 2021',
  },

  // Eventos
  events: {
    MARTE: 'Evento',
    MARTEPlural: 'Eventos',
    plateLabel: 'Referencia',
    namePlaceholder: 'Ej: Boda García-López 2025',
  },

  // Delivery / Restauración
  delivery: {
    MARTE: 'Pedido',
    MARTEPlural: 'Pedidos',
    plateLabel: 'Nº Pedido',
    namePlaceholder: 'Ej: Pedido catering 50 pax',
  },

  // Limpieza profesional
  cleaning: {
    MARTE: 'Servicio',
    MARTEPlural: 'Servicios',
    plateLabel: 'Referencia',
    namePlaceholder: 'Ej: Limpieza oficinas C/ Mayor',
  },

  // Peluquería / Estética
  hairSalon: {
    MARTE: 'Servicio',
    MARTEPlural: 'Servicios',
    plateLabel: 'Referencia',
    namePlaceholder: 'Ej: Tratamiento capilar completo',
  },

  // Gimnasio / Fitness
  gym: {
    MARTE: 'Servicio',
    MARTEPlural: 'Servicios',
    plateLabel: 'Referencia',
    namePlaceholder: 'Ej: Plan personal training 3 meses',
  },

  // Clínica / Salud
  clinic: {
    MARTE: 'Paciente',
    MARTEPlural: 'Pacientes',
    plateLabel: 'Nº Historia',
    namePlaceholder: 'Ej: Revisión completa Dr. García',
  },

  // Hotel / Alojamiento
  hotel: {
    MARTE: 'Reserva',
    MARTEPlural: 'Reservas',
    plateLabel: 'Nº Reserva',
    namePlaceholder: 'Ej: Hab. Doble 15-20 Jun',
  },

  // Academia / Formación
  academy: {
    MARTE: 'Curso',
    MARTEPlural: 'Cursos',
    plateLabel: 'Referencia',
    namePlaceholder: 'Ej: Inglés B2 - Grupo Mañana',
  },

  // Ocio nocturno
  nightclub: {
    MARTE: 'Evento',
    MARTEPlural: 'Eventos',
    plateLabel: 'Referencia',
    namePlaceholder: 'Ej: Reserva VIP Sábado 22',
  },

  // Recambios
  spareParts: {
    MARTE: 'Pieza',
    MARTEPlural: 'Piezas',
    plateLabel: 'Referencia',
    namePlaceholder: 'Ej: Pastillas freno BMW Serie 3',
  },

  // Farmacia
  pharmacy: {
    MARTE: 'Producto',
    MARTEPlural: 'Productos',
    plateLabel: 'Referencia',
    namePlaceholder: 'Ej: Encargo especial laboratorio',
  },

  // Veterinario
  vet: {
    MARTE: 'Mascota',
    MARTEPlural: 'Mascotas',
    plateLabel: 'Nº Chip',
    namePlaceholder: 'Ej: Luna (Golden Retriever)',
  },
};

// ── Términos por defecto (sector genérico) ────────────────────────────────────

const DEFAULT_TERMS: SectorTerms = {
  MARTE: 'Referencia',
  MARTEPlural: 'Referencias',
  plateLabel: 'Identificador',
  namePlaceholder: 'Ej: Descripción del elemento',
};

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Devuelve los términos específicos del sector indicado.
 * Si el sector no tiene términos definidos, devuelve los términos por defecto.
 *
 * @param businessType - Tipo de negocio obtenido desde `Business.businessType`
 * @returns Objeto `SectorTerms` con los términos adaptados al sector.
 *
 * @example
 * const terms = getSectorTerms('construction');
 * console.log(terms.MARTE); // "Expediente"
 *
 * const terms2 = getSectorTerms('carDealership');
 * console.log(terms2.MARTE); // "Vehículo"
 */
export function getSectorTerms(businessType?: BusinessType | null): SectorTerms {
  if (!businessType) return DEFAULT_TERMS;
  return MARTE_SECTOR_TERMS[businessType] ?? DEFAULT_TERMS;
}
