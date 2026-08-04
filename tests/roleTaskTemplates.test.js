import { describe, expect, it } from 'vitest';
import {
  getRoleTaskBundle,
  getRoleTaskTemplates,
  listRoleTaskBundles,
} from '../src/app/lib/roleTaskTemplates.ts';

describe('roleTaskTemplates', () => {
  it('define tareas para Reparto (delivery)', () => {
    const tasks = getRoleTaskTemplates('Reparto', 'delivery');
    expect(tasks.length).toBeGreaterThanOrEqual(4);
    expect(tasks.some((t) => /pedido/i.test(t.title))).toBe(true);
    expect(tasks.some((t) => /repart/i.test(t.title))).toBe(true);
    expect(tasks.every((t) => t.key && t.title && t.priority)).toBe(true);
  });

  it('define tareas para Encargado (delivery)', () => {
    const bundle = getRoleTaskBundle('Encargado', 'delivery');
    expect(bundle).toBeTruthy();
    expect(bundle.tasks.some((t) => /caja/i.test(t.title))).toBe(true);
    expect(bundle.tasks.some((t) => /pedido/i.test(t.title))).toBe(true);
    expect(bundle.tasks.some((t) => /equipo/i.test(t.title))).toBe(true);
  });

  it('lista bundles delivery con Reparto y Encargado', () => {
    const list = listRoleTaskBundles('delivery');
    const ids = list.map((b) => b.roleId);
    expect(ids).toContain('Reparto');
    expect(ids).toContain('Encargado');
    expect(ids).toContain('Mostrador / Atención');
  });

  it('restaurant no incluye Reparto', () => {
    const ids = listRoleTaskBundles('restaurant').map((b) => b.roleId);
    expect(ids).not.toContain('Reparto');
    expect(ids).toContain('Encargado');
  });

  it('alias Admin → Administrador', () => {
    const bundle = getRoleTaskBundle('Admin', 'delivery');
    expect(bundle?.roleId).toBe('Administrador');
    expect(getRoleTaskTemplates('Admin', 'delivery').length).toBeGreaterThanOrEqual(3);
  });
});
