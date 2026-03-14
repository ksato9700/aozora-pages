import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// No Cloudflare adapter: `astro build` runs in plain Node.js, reading JSON files
// written by the py-aozora-data Python pipeline.
// The reader API is a Cloudflare Pages Function in functions/api/read.ts —
// deployed alongside the static output by Cloudflare Pages automatically.
export default defineConfig({
  output: 'static',
  integrations: [react()],
});
