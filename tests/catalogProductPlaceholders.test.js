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
    expect(resolveCatalogProductPlaceholderKind({ name: 'Carbonara', category: 'Pizzas' })).toBe('carbonara');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Carbonara al Guanciale', category: 'Especialidad' })).toBe(
      '/catalog-placeholders/photos/pizza-carbonara.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Bacon', category: 'Pizzas' })).toBe('bacon');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Bacon', category: 'Pizzas' })).toBe(
      '/catalog-placeholders/photos/pizza-bacon.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Bacon Cheeseburger', category: 'Burger' })).toBe('burger');
    expect(resolveCatalogProductPlaceholderKind({ name: 'Menú familiar', category: 'Combos', itemType: 'combo' })).toBe(
      'combo',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Patatas deluxe', category: 'Complementos' })).toBe('side');
  });

  it('asigna limón y naranja distintos en refrescos', () => {
    expect(resolveCatalogProductPlaceholderKind({ name: 'Fanta Limón 33cl', category: 'Bebidas' })).toBe('fantaLemon');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Fanta Limón 33cl', category: 'Bebidas' })).toBe(
      '/catalog-placeholders/photos/fanta-lemon-can.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Fanta Limón 2L', category: 'Bebidas' })).toBe('fantaLemon2l');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Fanta Limón 2 litros', category: 'Bebidas' })).toBe(
      '/catalog-placeholders/photos/fanta-lemon-2l.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Fanta Naranja 33cl', category: 'Bebidas' })).toBe('orange');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Fanta Naranja', category: 'Bebidas' })).toBe(
      '/catalog-placeholders/photos/orange-soda.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Aquarius Limón 50cl', category: 'Bebidas' })).toBe(
      'aquariusLemon',
    );
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Aquarius Limón lata', category: 'Bebidas' })).toBe(
      '/catalog-placeholders/photos/aquarius-lemon-can.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Zumo de naranja natural', category: 'Bebidas' })).toBe(
      'juice',
    );
  });

  it('Crispy Chicken es burger; menú solo en combo', () => {
    expect(resolveCatalogProductPlaceholderKind({ name: 'Crispy Chicken', category: 'Burger' })).toBe('burger');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Crispy Chicken', category: 'Burger' })).toBe(
      '/catalog-placeholders/photos/burger-lite.webp',
    );
    expect(
      resolveCatalogProductPlaceholderUrl({ name: 'Individual', category: 'Combos', itemType: 'combo' }),
    ).toBe('/catalog-placeholders/photos/combo.webp');
  });

  it('alitas y Aquarius naranja tienen foto propia', () => {
    expect(resolveCatalogProductPlaceholderKind({ name: 'Alitas BBQ', category: 'Complementos' })).toBe('wings');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Alitas de pollo', category: 'Complementos' })).toBe(
      '/catalog-placeholders/photos/wings.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Aquarius Naranja', category: 'Bebidas' })).toBe('aquarius');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Aquarius Naranja 50cl', category: 'Bebidas' })).toBe(
      '/catalog-placeholders/photos/aquarius.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Aquarius Limón 50cl', category: 'Bebidas' })).toBe(
      'aquariusLemon',
    );
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Aquarius Limón', category: 'Bebidas' })).toBe(
      '/catalog-placeholders/photos/aquarius-lemon-can.webp',
    );
  });

  it('Desperados usa foto de botella Desperados', () => {
    expect(resolveCatalogProductPlaceholderKind({ name: 'Desperados', category: 'Bebidas' })).toBe('desperados');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Desperados 33cl', category: 'Bebidas' })).toBe(
      '/catalog-placeholders/photos/desperados.webp',
    );
  });

  it('vino blanco y negro usan botellas distintas (no food.webp)', () => {
    expect(resolveCatalogProductPlaceholderKind({ name: 'Vino Blanco', category: 'Vinos' })).toBe('wine');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Vino Blanco', category: 'Vinos' })).toBe(
      '/catalog-placeholders/photos/wine.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Vino Negro', category: 'Vinos' })).toBe('wineRed');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Vino Negro', category: 'Vinos' })).toBe(
      '/catalog-placeholders/photos/wine-red.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Nina Barbuda', category: 'Vinos' })).toBe('wineRed');
    // Porcavacca no es cava/vino
    expect(resolveCatalogProductPlaceholderKind({ name: 'Porcavacca', category: 'Pizzas' })).toBe('pizza');
  });

  it('Americana / Pepperoni no salen como cerveza', () => {
    expect(resolveCatalogProductPlaceholderKind({ name: 'Americana', category: 'Burger' })).toBe('burger');
    expect(resolveCatalogProductPlaceholderUrl({ name: 'Americana', category: 'Burger' })).toBe(
      '/catalog-placeholders/photos/burger-lite.webp',
    );
    expect(resolveCatalogProductPlaceholderKind({ name: 'Pepperoni', category: 'Pizzas' })).toBe('pizza');
    // beer.webp guardado no bloquea el recalculo de placeholder Vertial
    expect(
      resolveCatalogProductImage({
        name: 'Americana',
        category: 'Burger',
        image: '/catalog-placeholders/photos/beer.webp',
      }),
    ).toBe('/catalog-placeholders/photos/burger-lite.webp');
  });

  it('asigna agua y cerveza', () => {
    expect(resolveCatalogProductPlaceholderKind({ name: 'Agua 50cl', category: 'Bebidas' })).toBe('water');
    expect(resolveCatalogProductPlaceholderKind({ name: 'Cerveza Estrella', category: 'Bebidas' })).toBe('beer');
    expect(resolveCatalogProductPlaceholderKind({ name: 'Peroni', category: 'Bebidas' })).toBe('beer');
    expect(resolveCatalogProductPlaceholderKind({ name: 'Caña', category: 'Bebidas' })).toBe('beer');
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
