import { describe, expect, it } from 'vitest';
import {
  resolveCatalogProductImage,
  resolveCatalogProductPlaceholderKind,
  resolveCatalogProductPlaceholderUrl,
} from '../src/app/lib/catalogProductPlaceholders.ts';

describe('catalogProductPlaceholders', () => {
  it('asigna cola genérica a Coca-Cola', () => {
    expect(resolveCatalogProductPlaceholderKind({ name: 'Coca-Cola 33cl', category: 'Bebidas' })).toBe('cola');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Coca-Cola', category: 'Refrescos' })).toBe(
      '/catalog-placeholders/photos/cola.webp',
    );
  });

  it('asigna café, bocata y pizza por nombre/categoría', () => {
    expect(resolveCatalogProductPlaceholderKind({ name: 'Café con leche', category: 'Cafés' })).toBe('cafe');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Café con leche', category: 'Cafés' })).toBe(
      '/catalog-placeholders/photos/cafe.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Bocata de jamón', category: 'Bocadillos' })).toBe('tapas');
    expect(resolveCatalogProductPlaceholderKind({ name: 'Margarita', category: 'Pizzas' })).toBe('pizza');
  });

  it('asigna pizza, combo y complemento', () => {
    expect(resolveCatalogProductPlaceholderKind({ name: 'Margarita', category: 'Pizzas' })).toBe('pizza');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Margarita', category: 'Pizzas' })).toBe(
      '/catalog-placeholders/photos/pizza-lite.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Menú familiar', category: 'Combos', itemType: 'combo' })).toBe(
      'combo',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Patatas deluxe', category: 'Complementos' })).toBe('side');
  });

  it('asigna agua y cerveza', () => {
    expect(resolveCatalogProductPlaceholderKind({ name: 'Agua 50cl', category: 'Bebidas' })).toBe('water');
    expect(resolveCatalogProductPlaceholderKind({ name: 'Cerveza Estrella', category: 'Bebidas' })).toBe('beer');
  });

  it('usa food como fallback genérico', () => {
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Producto raro', category: 'Otros' })).toBe(
      '/catalog-placeholders/photos/food.webp',
    );
  });

  it('prioriza imagen propia del producto', () => {
    expect(
      resolveCatalogProductImage({
        name: 'Coca-Cola',
        category: 'Bebidas',
        image: 'https://cdn.example.com/coke.jpg',
      }),
    ).toBe('https://cdn.example.com/coke.jpg');
  });
});
