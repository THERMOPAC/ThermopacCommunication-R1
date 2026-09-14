import { defineConfig } from 'vitest/config';
import path from 'path';
import ts from 'typescript';

export default defineConfig({
  plugins: [{
    name: 'stage4-ui-test-tsx-transform',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/ecr-pre-pilot-design-stage-4-page.tsx')
        && !id.endsWith('/components/ecr-pre-pilot/predictive-nt-progress.tsx')
        && !id.endsWith('/components/ecr-pre-pilot/stage4-pre-pilot-sizing-panel.tsx')
        && !id.endsWith('/components/ecr-pre-pilot/stage4-interface-failure-diagnostics.tsx')
        && !id.endsWith('/components/ecr-pre-pilot/stage4-trial-progress.tsx')) return;
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
