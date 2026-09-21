/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * GitHub Pages serves a project site from a sub-path, so the bundle has to be
 * built with that prefix or every asset request resolves against the domain
 * root and 404s. BASE_PATH overrides it for hosts that serve from the root,
 * such as Netlify or Vercel, where it should simply be "/".
 */
const REPOSITORY_BASE = '/coffee-origin-explorer/'

export default defineConfig(({ command, isPreview }) => ({
  /*
   * `vite preview` runs with command === 'serve', so keying only on the command
   * would serve the built site from the root while its HTML asked for the
   * sub-path, and every request would fall through to index.html. Preview has
   * to match the build, or it stops reproducing production — which is the one
   * thing it is for.
   */
  base: process.env.BASE_PATH ?? (command === 'build' || isPreview ? REPOSITORY_BASE : '/'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
}))
