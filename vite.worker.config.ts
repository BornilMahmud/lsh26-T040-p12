import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'

// Worker build: Hono edge functions -> dist/_worker.js
// Runs AFTER the client build, so it must not empty dist/.
export default defineConfig({
  plugins: [
    build({ entry: 'src/worker/index.ts', outputDir: 'dist' }),
    devServer({ adapter, entry: 'src/worker/index.ts' })
  ],
  build: { emptyOutDir: false }
})
