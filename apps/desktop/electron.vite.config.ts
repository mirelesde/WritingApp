import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// The main and preload builds leave npm dependencies as runtime requires.
// @writingapp/core ships TypeScript source, so it has to be bundled instead.
const externalizeDeps = { exclude: ['@writingapp/core'] }

export default defineConfig({
  main: { build: { externalizeDeps } },
  preload: { build: { externalizeDeps } },
  renderer: {
    plugins: [svelte()]
  }
})
