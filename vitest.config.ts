import { configDefaults, defineConfig } from 'vitest/config';
import path from 'path';
import ts from 'typescript';

export default defineConfig({
  plugins: [{
    name: 'stage4-ui-test-tsx-transform',
    enforce: 'pre',
    transform(code, id) {
      // Vitest's Rolldown path does not apply the app's React plugin to every
      // transitive TSX import.  Keep the focused UI transform broad enough for
      // panels' local UI dependencies (Button, Card, and their peers).
      if (!id.includes('/client/src/') || !id.endsWith('.tsx')) return;
      return ts.transpileModule(code, {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: id,
      }).outputText;
    },
  }],
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      'tests/**/*.archive.test.ts',
      'tests/ecr-pre-pilot-six-component-gate.test.ts',
      'tests/stage4-seven-component-adapter.integration.test.ts',
    ],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
