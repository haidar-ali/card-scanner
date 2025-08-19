import { defineConfig } from 'vite';
import { resolve } from 'path';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        target: 'es2020',
      },
    }),
  ],
  build: {
    target: 'node18',
    rollupOptions: {
      external: ['electron', 'typeorm', 'sqlite3', 'reflect-metadata'],
      output: {
        format: 'cjs',
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});