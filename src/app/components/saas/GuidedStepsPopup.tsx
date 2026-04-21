import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, CheckCircle2, Circle, ChevronRight, Lightbulb } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface GuideStep {
  label: string;
  detail?: string;
}

interface GuideConfig {
  title: string;
  subtitle: string;
  steps: GuideStep[];
  tip?: string;
}

const GUIDES: Record<string, GuideConfig> = {
  vehicle: {
    title: 'Crear tu primer registro',
    subtitle: 'Producto o servicio',
    steps: [
      { label: 'Pulsa el botón "Añadir" o "+" en la parte superior', detail: 'Busca el botón de acción principal de la página' },
      { label: 'Rellena los datos básicos: nombre, categoría y precio', detail: 'Solo los campos obligatorios, el resto puedes completarlo después' },
      { label: 'Añade una imagen o descripción (opcional)', detail: 'Mejora la ficha para que tu equipo lo identifique fácilmente' },
      { label: 'Guarda el registro', detail: 'Pulsa "Guardar" para crear tu primer producto o servicio' },
    ],
    tip: 'También puedes importar muchos registros a la vez desde un archivo CSV o Excel.',
  },
  locations: {
    title: 'Configurar ubicaciones',
    subtitle: 'Zonas y plazas',
    steps: [
      { label: 'Crea tu primera zona', detail: 'Por ejemplo: "Planta baja", "Almacén principal", "Exposición"' },
      { label: 'Añade plazas dentro de la zona', detail: 'Las plazas son los espacios individuales: estantes, puestos, parkings…' },
      { label: 'Personaliza nombres y capacidades', detail: 'Define cuántos elementos cabe en cada plaza si aplica' },
      { label: 'Asigna productos o registros a las plazas', detail: 'Arrastra o selecciona para organizar tu inventario físico' },
    ],
    tip: 'Las ubicaciones te permiten saber dónde está cada cosa en todo momento.',
  },
  client: {
    title: 'Crear primer lead/cliente',
    subtitle: 'Contactos y CRM',
    steps: [
      { label: 'Pulsa "Nuevo lead" o "Nuevo cliente"', detail: 'Un lead es un contacto potencial; un cliente ya ha comprado' },
      { label: 'Rellena nombre, teléfono y email', detail: 'Con estos datos básicos ya puedes empezar a trabajar' },
      { label: 'Asigna una etiqueta o responsable (opcional)', detail: 'Organiza tus contactos por categorías o asigna seguimiento' },
      { label: 'Guarda el contacto', detail: 'Ya aparecerá en tu lista y en el pipeline de ventas' },
    ],
    tip: 'Puedes importar todos tus contactos desde un CSV si ya tienes una base de datos.',
  },
  document: {
    title: 'Subir primer documento',
    subtitle: 'Plantillas y documentos',
    steps: [
      { label: 'Selecciona "Nueva plantilla" o "Subir documento"', detail: 'Elige si quieres crear desde cero o subir uno existente' },
      { label: 'Sube tu archivo o usa el editor', detail: 'Formatos compatibles: PDF, Word, imágenes' },
      { label: 'Personaliza los campos variables', detail: 'Añade campos dinámicos como nombre del cliente, fecha, etc.' },
      { label: 'Guarda y previsualiza', detail: 'Revisa cómo quedará el documento final' },
    ],
    tip: 'Las plantillas te ahorran tiempo al generar documentos repetitivos automáticamente.',
  },
};

export function GuidedStepsPopup() {
  const location = useLocation();
  const navigate = useNavigate();
  const [guideId, setGuideId] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const state = location.state as { guidedStep?: string } | null;
    if (state?.guidedStep && GUIDES[state.guidedStep]) {
      setGuideId(state.guidedStep);
      setCompletedSteps(new Set());
      requestAnimationFrame(() => setIsVisible(true));

      window.history.replaceState(
        { ...state, guidedStep: undefined },
        '',
      );
    }
  }, [location.state]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      setGuideId(null);
      setCompletedSteps(new Set());
    }, 300);
  }, []);

  useModalClose(guideId !== null, handleClose);

  const toggleStep = useCallback((index: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  if (!guideId) return null;

  const guide = GUIDES[guideId];
  if (!guide) return null;

  const doneCount = completedSteps.size;
  const totalCount = guide.steps.length;
  const allDone = doneCount === totalCount;

  return (
    <div className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end p-4 sm:p-6 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={handleClose}
      />

      <div className={`relative w-full sm:w-[420px] max-h-[85vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 transition-all duration-300 ${isVisible ? 'translate-y-0 sm:translate-x-0 scale-100' : 'translate-y-8 sm:translate-y-0 sm:translate-x-8 scale-95'}`}>
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-5 pt-5 pb-4 z-10">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>

          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
            Guía paso a paso
          </p>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 pr-8">
            {guide.title}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {guide.subtitle}
          </p>

          {/* Mini progress */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-400 tabular-nums">
              {doneCount}/{totalCount}
            </span>
          </div>
        </div>

        {/* Steps */}
        <div className="px-5 py-4 space-y-2">
          {guide.steps.map((step, i) => {
            const isDone = completedSteps.has(i);
            return (
              <button
                key={i}
                onClick={() => toggleStep(i)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all duration-200 group ${
                  isDone
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                }`}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center group-hover:border-amber-400 transition-colors">
                      <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 group-hover:text-amber-500 transition-colors">
                        {i + 1}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium leading-tight ${
                    isDone
                      ? 'text-emerald-700 dark:text-emerald-400 line-through'
                      : 'text-gray-800 dark:text-gray-200'
                  }`}>
                    {step.label}
                  </p>
                  {step.detail && !isDone && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-relaxed">
                      {step.detail}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Tip */}
        {guide.tip && (
          <div className="mx-5 mb-4 flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
            <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              {guide.tip}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-5 py-4">
          {allDone ? (
            <button
              onClick={handleClose}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Completado — cerrar guía
            </button>
          ) : (
            <button
              onClick={handleClose}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              Entendido, cerrar guía
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
