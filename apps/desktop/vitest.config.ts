import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// The svelte plugin compiles runes in `.svelte.ts` store files, so they can be tested.
export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ['browser'] },
  // e2e/ holds node:test scripts that drive the built app (npm run e2e), not Vitest tests.
  test: { exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'] }
})
