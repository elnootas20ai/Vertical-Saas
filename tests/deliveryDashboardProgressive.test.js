// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeliveryProgressiveSection } from '../src/app/verticals/delivery/DeliveryProgressiveSection.tsx';

let observerCallback;
let root;
let container;

function panel(props) {
  return React.createElement(
    DeliveryProgressiveSection,
    props,
    React.createElement('p', null, 'Detalle Delivery'),
  );
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  observerCallback = null;
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
});

describe('dashboard Delivery progresivo', () => {
  it('muestra el bloque sin controles de acordeón y reserva su altura', () => {
    act(() => {
      root.render(panel({
        title: 'Tiempos de entrega',
        hint: 'Preparación y reparto',
        ready: false,
        minHeight: 260,
      }));
    });

    expect(container.textContent).toContain('Tiempos de entrega');
    expect(container.textContent).not.toContain('Detalle Delivery');
    expect(container.textContent).not.toMatch(/Abrir|Ocultar/);
    expect(container.firstElementChild.style.minHeight).toBe('260px');
  });

  it('monta el contenido solo al acercarse y estar lista la ola', () => {
    act(() => root.render(panel({ title: 'Marcas', ready: true })));
    expect(container.textContent).not.toContain('Detalle Delivery');

    act(() => observerCallback([{ isIntersecting: true }]));
    expect(container.textContent).toContain('Detalle Delivery');
  });
});
