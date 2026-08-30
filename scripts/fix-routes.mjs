/**
 * The Cloudflare Pages plugin emits a catch-all _routes.json, which sends EVERY
 * request (including the SPA shell) through the worker and 404s the app.
 * The worker only owns /api/*; everything else must be served as a static asset
 * with Pages' built-in SPA fallback to index.html.
 */
import { writeFileSync } from 'node:fs'
writeFileSync(
  'dist/_routes.json',
  JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }, null, 2) + '\n'
)
console.log('_routes.json → worker handles /api/* only')
