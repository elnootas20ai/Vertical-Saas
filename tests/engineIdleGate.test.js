import test from 'node:test';
import assert from 'node:assert/strict';
import {
  markSystemActivity,
  hasRecentActivity,
  shouldRunBackgroundEngine,
  __resetIdleGateForTests,
} from '../services/engineIdleGate.js';

const HOUR = 3_600_000;

test('con actividad reciente los motores ejecutan su ciclo', () => {
  __resetIdleGateForTests({ lastActivityMs: Date.now() });
  assert.equal(shouldRunBackgroundEngine('test_engine_a'), true);
  assert.equal(hasRecentActivity(), true);
});

test('sin actividad, el motor se salta el ciclo', () => {
  __resetIdleGateForTests({
    lastActivityMs: Date.now() - 2 * HOUR,
    lastRuns: { test_engine_b: Date.now() - HOUR },
  });
  assert.equal(hasRecentActivity(), false);
  assert.equal(shouldRunBackgroundEngine('test_engine_b'), false);
  // Sigue pausado en ticks siguientes
  assert.equal(shouldRunBackgroundEngine('test_engine_b'), false);
});

test('barrido de seguridad: ejecuta aunque haya inactividad si pasó el máximo', () => {
  __resetIdleGateForTests({
    lastActivityMs: Date.now() - 24 * HOUR,
    lastRuns: { test_engine_c: Date.now() - 7 * HOUR },
  });
  assert.equal(shouldRunBackgroundEngine('test_engine_c'), true);
  // Tras el barrido vuelve a pausarse hasta el siguiente máximo
  assert.equal(shouldRunBackgroundEngine('test_engine_c'), false);
});

test('marcar actividad reanuda los motores pausados', () => {
  __resetIdleGateForTests({
    lastActivityMs: Date.now() - 2 * HOUR,
    lastRuns: { test_engine_d: Date.now() - HOUR },
  });
  assert.equal(shouldRunBackgroundEngine('test_engine_d'), false);
  markSystemActivity();
  assert.equal(shouldRunBackgroundEngine('test_engine_d'), true);
});

test('el primer ciclo tras arranque en frío no fuerza barrido inmediato', () => {
  __resetIdleGateForTests({ lastActivityMs: Date.now() - 2 * HOUR });
  // Sin lastRun registrado: se inicializa a "ahora" y se pausa (no dispara safety)
  assert.equal(shouldRunBackgroundEngine('test_engine_e'), false);
});
