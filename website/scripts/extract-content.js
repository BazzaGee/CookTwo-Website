import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

function getAllFiles(dir, extensions) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, extensions));
    } else if (extensions.includes(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function readJSON(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function stripAstroContent(content) {
  let text = content;
  text = text.replace(/^---[\s\S]*?---/, '');
  text = text.replace(/import\s+.*?from\s+['"][^'"]*['"];?\n?/g, '');
  text = text.replace(/export\s+interface\s+[\s\S]*?\n}/g, '');
  text = text.replace(/export\s+const\s+.*?=\s*[\s\S]*?;\n/g, '');
  text = text.replace(/<script[\s\S]*?<\/script>/g, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/g, ' ');
  text = text.replace(/<[^>]*>/g, ' ');
  text = text.replace(/\{[^}]*\}/g, ' ');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function extractPageMeta(content) {
  const meta = { title: '', description: '' };
  const layoutMatch = content.match(/<BaseLayout\s+([^>]*)>/);
  if (layoutMatch) {
    const attrs = layoutMatch[1];
    const titleMatch = attrs.match(/title\s*=\s*\{?"?([^"}]+)"?\}?/);
    const descMatch = attrs.match(/description\s*=\s*\{"?([\s\S]+?)"?\}/);
    if (titleMatch) meta.title = titleMatch[1].trim();
    if (descMatch) meta.description = descMatch[1].trim();
  }
  const fmTitle = content.match(/^---[\s\S]*?title:\s*['"]?([^'"\n]+)['"]?[\s\S]*?---/m);
  if (!meta.title && fmTitle) meta.title = fmTitle[1].trim();
  return meta;
}

function extractAstroPage(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const meta = extractPageMeta(content);
  const text = stripAstroContent(content);
  const rel = filePath.split(join(rootDir, 'src', 'pages'))[1].replace(/\\/g, '/').replace(/^\//, '');
  const slug = rel.replace(/\.astro$/, '').replace(/\/?index$/, '') || '/';
  return {
    slug,
    title: meta.title || slug,
    description: meta.description,
    content: text.substring(0, 3000),
  };
}

console.log('Extracting CookTwo site content for chatbot knowledge base...');

const dataDir = join(rootDir, 'src', 'data');

const faqRaw = readJSON(join(dataDir, 'faq.json'), { faq: [] });
const featuresRaw = readJSON(join(dataDir, 'features.json'), { features: [], steps: [] });
const comparisonRaw = readJSON(join(dataDir, 'comparison.json'), { comparison: { categories: [], competitors: [] } });
const navigationRaw = readJSON(join(dataDir, 'navigation.json'), { navigation: {} });

const faq = [];
for (const cat of faqRaw.faq || []) {
  for (const item of (cat.questions || [])) {
    faq.push({ category: cat.category, question: item.q, answer: item.a });
  }
}

const features = (featuresRaw.features || []).map((f) => ({
  id: f.id,
  title: f.title,
  badge: f.badge,
  description: f.description,
  highlights: f.highlights || [],
  href: f.href,
}));

const steps = (featuresRaw.steps || []).map((s) => ({
  number: s.number,
  title: s.title,
  description: s.description,
  detail: s.detail,
}));

const comparison = {
  categories: comparisonRaw.comparison?.categories || [],
  competitors: comparisonRaw.comparison?.competitors || [],
};

const pageFiles = getAllFiles(join(rootDir, 'src', 'pages'), ['.astro']);
const pages = pageFiles
  .filter((f) => !f.includes(`${join('src', 'pages', '404.astro')}`))
  .map((f) => extractAstroPage(f));

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  const data = {};
  const yaml = match[1];
  const lines = yaml.split('\n');
  let currentKey = null;
  let currentArray = null;
  for (const line of lines) {
    const arrayItem = line.match(/^\s*-\s+(.*)$/);
    if (arrayItem && currentArray) {
      currentArray.push(arrayItem[1].replace(/^['"]|['"]$/g, '').trim());
      continue;
    }
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      let val = kv[2].trim();
      if (val === '') {
        currentArray = [];
        data[key] = currentArray;
        currentKey = key;
        continue;
      }
      if (/^['"].*['"]$/.test(val)) val = val.slice(1, -1);
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (/^\d{4}-\d{2}-\d{2}/.test(val)) val = val;
      data[key] = val;
      currentKey = null;
      currentArray = null;
    }
  }
  return { data, body: match[2] };
}

function extractContentFile(filePath, type) {
  const content = readFileSync(filePath, 'utf-8');
  const { data, body } = parseFrontmatter(content);
  const rel = filePath.split(join(rootDir, 'src', 'content'))[1].replace(/\\/g, '/').replace(/^\//, '');
  const slug = rel.replace(/\.(md|mdx)$/, '').replace(/\/index$/, '');
  const text = body
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/import\s+.*?from\s+['"][^'"]*['"];?\n?/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    type,
    slug,
    title: data.title || slug,
    description: data.description || '',
    pubDate: data.pubDate || null,
    pillar: data.pillar || null,
    seoMode: data.seoMode || null,
    targetKeyword: data.targetKeyword || null,
    tags: data.tags || [],
    draft: data.draft === true,
    content: text.substring(0, 5000)
  };
}

const blogFiles = getAllFiles(join(rootDir, 'src', 'content', 'blog'), ['.md', '.mdx']);
const pageContentFiles = getAllFiles(join(rootDir, 'src', 'content', 'pages'), ['.md', '.mdx']);
const blogPosts = blogFiles.map((f) => extractContentFile(f, 'post'));
const pillarPages = pageContentFiles.map((f) => extractContentFile(f, 'page'));

const whatIs = faq.find((q) => /what is cooktwo/i.test(q.question));
const business = {
  name: 'CookTwo',
  url: 'https://cooktwo.com',
  pwaUrl: 'https://cooktwo.app',
  description:
    whatIs?.answer ||
    'CookTwo is a collaborative adaptive nutrition app for couples — a shared kitchen operating system with one grocery list, one pantry, one meal plan, but personalised portions for each partner.',
};

const siteContent = {
  business,
  faq,
  features,
  steps,
  comparison,
  pages,
  blogPosts,
  pillarPages,
  navigation: navigationRaw.navigation || {},
  generatedAt: new Date().toISOString(),
};

const outputDir = join(rootDir, 'public', 'data');
mkdirSync(outputDir, { recursive: true });

const outputPath = join(outputDir, 'site-content.json');
writeFileSync(outputPath, JSON.stringify(siteContent, null, 2));

const size = (JSON.stringify(siteContent).length / 1024).toFixed(1);
console.log(`Content extracted: ${size}KB written to ${outputPath}`);
console.log(`  FAQ items: ${faq.length}`);
console.log(`  Features: ${features.length}`);
console.log(`  Onboarding steps: ${steps.length}`);
console.log(`  Competitors compared: ${comparison.competitors.length}`);
console.log(`  Pages: ${pages.length}`);
console.log(`  Blog posts: ${blogPosts.length}`);
console.log(`  Pillar pages: ${pillarPages.length}`);
console.log('Done!');
