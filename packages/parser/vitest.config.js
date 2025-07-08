import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{js,mjs,ts}'],
    exclude: ['tests/archive/**/*'],
    globals: true,
    environment: 'node'
  }
})