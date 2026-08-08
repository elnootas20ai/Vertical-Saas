/** Tipos del flujo inmobiliaria v1 (visitas comerciales / captación). */

export type ReTipoVisita = 'programada' | 'captacion' | 'seguimiento';

export type ReSituacion =
  | 'pendiente'
  | 'nadie'
  | 'hablo'
  | 'interesado'
  | 'no_interesado'
  | 'segunda_visita'
  | 'pendiente_doc';

export type ReSiguienteAccion = '' | 'llamar' | 'segunda_visita' | 'descartar';

export type ReResultadoVisita = 'interesado' | 'oferta' | 'descartado' | 'pendiente';

export const RE_TIPO_VISITA_LABEL: Record<ReTipoVisita, string> = {
  programada: 'Programada',
  captacion: 'Captación',
  seguimiento: 'Seguimiento',
};

export const RE_SITUACION_LABEL: Record<ReSituacion, string> = {
  pendiente: 'Pendiente',
  nadie: 'Nadie en casa',
  hablo: 'Hablé',
  interesado: 'Interesado',
  no_interesado: 'No interesado',
  segunda_visita: 'Segunda visita',
  pendiente_doc: 'Pendiente documentación',
};

export const RE_SIGUIENTE_ACCION_LABEL: Record<Exclude<ReSiguienteAccion, ''>, string> = {
  llamar: 'Llamar',
  segunda_visita: 'Segunda visita',
  descartar: 'Descartar',
};

export function situacionToResultado(sit: ReSituacion): ReResultadoVisita {
  if (sit === 'interesado' || sit === 'segunda_visita' || sit === 'pendiente_doc') return 'interesado';
  if (sit === 'no_interesado') return 'descartado';
  return 'pendiente';
}
