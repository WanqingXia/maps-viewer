import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.ts',
      formats: ['iife'],
      name: 'MapsViewerWebview',
      fileName: () => 'webview.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (info) => {
          if (info.name && info.name.endsWith('.css')) return 'webview.css';
          return '[name][extname]';
        },
      },
    },
  },
});
