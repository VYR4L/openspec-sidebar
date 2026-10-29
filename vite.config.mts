import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'webview',
  plugins: [react()],
  resolve: {
    alias: {
      vscode: fileURLToPath(new URL('./webview/src/test/vscode.ts', import.meta.url))
    }
  },
  base: './',
  build: {
    outDir: '../dist/webview',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/dashboard.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith('.css')
            ? 'assets/dashboard.css'
            : 'assets/[name]-[hash][extname]'
      }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['../src/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: { reporter: ['text'] }
  }
});
