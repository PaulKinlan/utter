import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { resolve } from 'path';
import manifest from './src/manifest.json' with { type: 'json' };

export default defineConfig({
  root: 'src',
  plugins: [crx({ manifest })],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'esnext',
    minify: false,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      input: {
        'offscreen/offscreen': resolve(__dirname, 'src/offscreen/offscreen.html'),
      },
    },
  },
});
