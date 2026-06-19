import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://cooktwo.app',
  integrations: [sitemap()],
  output: 'static'
});
