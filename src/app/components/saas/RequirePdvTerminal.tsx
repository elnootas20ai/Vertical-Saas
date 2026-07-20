/**
 * Antes mostraba un banner si faltaba horario de apertura (métricas/alertas).
 * Ese aviso no estaba cableado de verdad a alertas; se retira de momento.
 * Las rutas siguen envolviendo con este componente por si se reactiva.
 * `TpvRegisterGate` gestiona el caso "sin PDV".
 */
export function RequirePdvTerminal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
