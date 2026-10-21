import { defineConfig } from 'vite'

// Vite, not bun build: the app is a static site with a base path that has to
// work on GitHub Pages and on an IPFS gateway, plus CSS and files from public/.
// Vite rewrites those asset URLs and gives us a dev server. Bun stays the
// package manager and the test runner.
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
})
