import { describe, expect, it } from 'vitest';
import {
  inferDeliveryLineKindFromBrandName,
  resolveBrandLogo,
  resolveBrandPlaceholderKind,
  resolveBrandPlaceholderUrl,
} from '../src/app/lib/brandPlaceholders.ts';

describe('brandPlaceholders', () => {
  it('asigna burger a línea burger_fastfood', () => {
    expect(resolveBrandPlaceholderKind({ deliveryLineKind: 'burger_fastfood' })).toBe('burger');
    expect(resolveBrandPlaceholderUrl({ deliveryLineKind: 'burger_fastfood' })).toBe(
      '/catalog-placeholders/photos/burger-lite.webp',
    );
  });

  it('asigna kebab y tapas por línea comercial', () => {
    expect(resolveBrandPlaceholderKind({ deliveryLineKind: 'kebab' })).toBe('kebab');
    expect(resolveBrandPlaceholderUrl({ deliveryLineKind: 'kebab' })).toBe(
      '/catalog-placeholders/photos/kebab.webp',
    );
    expect(resolveBrandPlaceholderKind({ deliveryLineKind: 'tapas_bar' })).toBe('tapas');
    expect(resolveBrandPlaceholderUrl({ deliveryLineKind: 'tapas_bar' })).toBe(
      '/catalog-placeholders/photos/tapas.webp',
    );
  });

  it('infiere kebab y bar por nombre', () => {
    expect(inferDeliveryLineKindFromBrandName('Kebab Express')).toBe('kebab');
    expect(inferDeliveryLineKindFromBrandName('Bar La Tapa')).toBe('tapas_bar');
    expect(resolveBrandPlaceholderKind({ name: 'Döner House' })).toBe('kebab');
    expect(resolveBrandPlaceholderKind({ name: 'Cervecería Central' })).toBe('tapas');
  });

  it('prioriza logo propio de la marca', () => {
    expect(
      resolveBrandLogo({
        name: 'Burger',
        deliveryLineKind: 'burger_fastfood',
        logo: 'https://cdn.example.com/logo.png',
      }),
    ).toBe('https://cdn.example.com/logo.png');
  });

  it('ignora placeholder antiguo y muestra pizza para marca pizza', () => {
    expect(
      resolveBrandLogo({
        name: 'pizza',
        deliveryLineKind: 'pizza',
        logo: '/catalog-placeholders/photos/generic-brand.webp',
      }),
    ).toBe('/catalog-placeholders/photos/pizza-lite.webp');
  });

  it('usa genérico si no hay línea ni pistas en el nombre', () => {
    expect(resolveBrandPlaceholderUrl({ name: 'Marca nueva' })).toBe(
      '/catalog-placeholders/photos/generic-brand.webp',
    );
  });
});
