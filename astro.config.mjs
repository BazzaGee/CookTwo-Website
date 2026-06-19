import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://cooktwo.com',
  integrations: [sitemap()],
  output: 'static'
});
