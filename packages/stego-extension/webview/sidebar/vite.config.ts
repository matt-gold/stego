import * as path from 'path';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  root: path.resolve(__dirname),
  resolve: {
    alias: {
      '@sidebar-protocol': path.resolve(__dirname, '../../src/features/sidebar/protocol')
    }
  },
  build: {
    target: 'es2022',
    outDir: path.resolve(__dirname, '../../out/webview/sidebar'),
    emptyOutDir: false,
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/main.tsx'),
      output: {
        format: 'es',
        entryFileNames: 'sidebar-app.js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'sidebar-app.css';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx']
  }
});
