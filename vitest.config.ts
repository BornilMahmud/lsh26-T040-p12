import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(rootDir, './src/client') }
  },
  test: {
    environment: 'node',
    include: ['src/client/**/*.test.ts']
  }
})
