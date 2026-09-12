// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestaurantProgressiveSection } from '../src/app/verticals/restaurant/dashboard/RestaurantProgressiveSection.tsx';

let observerCallback;
let root;
let container;

function progressive(props, content = 'Contenido cargado') {
  return React.createElement(
    RestaurantProgressiveSection,
    props,
    React.createElement('p', null, content),
  );
}

beforeEach(() => {
  observerCallback = null;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.IntersectionObserver = class {
    constructor(callback) {
      observerCallback = callback;
    }
    observe() {}
    disconnect() {}
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('dashboard Restaurant progresivo', () => {
  it('enseña el título y reserva el bloque antes de montar contenido', () => {
    act(() => {
      root.render(progressive({
        title: 'Mermas',
        hint: 'Costes reales',
        ready: false,
        minHeight: 320,
      }));
    });

    expect(container.textContent).toContain('Mermas');
    expect(container.textContent).toContain('Costes reales');
    expect(container.textContent).not.toContain('Contenido cargado');
    expect(container.textContent).not.toMatch(/Abrir|Ocultar/);
    expect(container.firstElementChild.style.minHeight).toBe('320px');
  });

  it('monta automáticamente cuando la sección está cerca y la ola está lista', () => {
    act(() => {
      root.render(progressive({ title: 'Finanzas', ready: true }));
    });

    expect(container.textContent).not.toContain('Contenido cargado');
    act(() => observerCallback([{ isIntersecting: true }]));
    expect(container.textContent).toContain('Contenido cargado');
  });
});
