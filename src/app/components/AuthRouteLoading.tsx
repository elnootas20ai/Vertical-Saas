import { VertialLoadingState } from './VertialLoadingState';

export function AuthRouteLoading({ label = 'Cargando…' }: { label?: string }) {
  return <VertialLoadingState label={label} variant="fullscreen" />;
}
