import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const seoMode = z.enum(['keyword', 'intent', 'hybrid']);

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('CookTwo'),
    ogImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    pillar: z.string().optional(),
    seoMode: seoMode.default('hybrid'),
    targetKeyword: z.string().optional(),
    intentSummary: z.string().optional(),
    persona: z.string().optional(),
    draft: z.boolean().default(false)
  })
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('CookTwo'),
    ogImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    pillar: z.string().optional(),
    seoMode: seoMode.default('hybrid'),
    targetKeyword: z.string().optional(),
    intentSummary: z.string().optional(),
    persona: z.string().optional(),
    draft: z.boolean().default(false)
  })
});

export const collections = { blog, pages };
