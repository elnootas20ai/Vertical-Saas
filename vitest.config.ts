import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Igual que la app (plugin React de Vite): JSX runtime automático.
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{js,ts}'],
  },
});
