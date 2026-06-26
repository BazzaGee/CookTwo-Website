import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

const today = new Date().toISOString().split('T')[0];

export default defineConfig({
  site: 'https://cooktwo.com',
  integrations: [
    mdx(),
    sitemap({
      serialize(item) {
        item.lastmod = today;
        item.changefreq = 'weekly';
        item.priority = item.url === 'https://cooktwo.com/' ? 1.0 : 0.8;
        return item;
      }
    })
  ],
  output: 'static'
});
