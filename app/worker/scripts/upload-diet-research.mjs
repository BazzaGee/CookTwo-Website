#!/usr/bin/env node
/**
 * Uploads all diet research markdown files to R2 bucket "cupla-diet-research".
 *
 * Usage:
 *   node scripts/upload-diet-research.mjs                # dry run (prints keys)
 *   node scripts/upload-diet-research.mjs --upload        # actually upload via wrangler
 *
 * Prerequisites:
 *   - R2 bucket "cupla-diet-research" must exist
 *   - wrangler must be authenticated with R2 read/write permissions
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_DIR = join(__dirname, '..');
const RESEARCH_DIR = 'C:\\Users\\barry\\OneDrive\\Desktop\\Cupla\\Diet Research';
const DO_UPLOAD = process.argv.includes('--upload');

// ─── Folder-name → slug mapping ──────────────────────────────────────────────

const DIET_SLUGS = {
  '01_Mediterranean': 'mediterranean',
  '02_DASH': 'dash',
  '03_Intermittent_Fasting': 'intermittent-fasting',
  '04_Keto_LowCarb': 'keto',
  '05_High_Protein': 'high-protein',
  '06_Plant_Based_Vegan_Vegetarian': 'plant-based',
  '07_Flexitarian': 'flexitarian',
  '08_Paleo': 'paleo',
  '09_Whole30': 'whole30',
  '10_Low_FODMAP': 'low-fodmap',
  '11_MIND': 'mind',
  '12_Pritikin': 'pritikin',
  '13_Carnivore': 'carnivore',
  '14_McDougall_Starch_Solution': 'mcdougall',
  '15_Macrobiotic': 'macrobiotic',
  '16_Volumetrics': 'volumetrics',
  '17_HCLF_80_10_10': 'hclf-811',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSnakeLower(name) {
  return name
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toLowerCase();
}

function cleanFileName(fileName) {
  // 01_Overview.md → 01_overview.md
  // 02_Science_and_Evidence.md → 02_science_and_evidence.md
  return fileName
    .replace(/([A-Z])/g, (m) => m.toLowerCase())
    .replace(/_/g, '_');
}

// ─── Scan and collect all files ─────────────────────────────────────────────

async function scanDir(dirPath, basePath = '') {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const sub = await scanDir(fullPath, basePath ? `${basePath}/${entry.name}` : entry.name);
      files.push(...sub);
    } else if (entry.name.endsWith('.md')) {
      files.push({
        absPath: fullPath,
        relPath: basePath ? `${basePath}/${entry.name}` : entry.name,
      });
    }
  }
  return files;
}

// ─── Map local file → R2 key ─────────────────────────────────────────────────

function mapToR2Key(relPath) {
  // Top-level files: "00_README.md" → "top-level/00_readme.md"
  if (!relPath.includes('/')) {
    return `top-level/${cleanFileName(relPath)}`;
  }

  const parts = relPath.split('/');

  // Healthy eating: "00_Healthy_Eating_General/00_README.md" → "healthy-eating/00_readme.md"
  if (parts[0] === '00_Healthy_Eating_General') {
    return `healthy-eating/${cleanFileName(parts[1])}`;
  }

  // Diet folders: "diets/01_Mediterranean/01_Overview.md" → "diets/mediterranean/01_overview.md"
  if (parts[0] === 'diets' && parts.length === 3) {
    const slug = DIET_SLUGS[parts[1]] || parts[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `diets/${slug}/${cleanFileName(parts[2])}`;
  }

  // Fallback
  return parts.map(cleanFileName).join('/');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n  Scanning: ${RESEARCH_DIR}\n`);

  if (!RESEARCH_DIR) {
    console.error('  RESEARCH_DIR not set!');
    process.exit(1);
  }

  const allFiles = await scanDir(RESEARCH_DIR);

  console.log(`  Found ${allFiles.length} markdown files.\n`);

  const uploads = allFiles.map((f) => ({
    ...f,
    r2Key: mapToR2Key(f.relPath),
  }));

  // Sort by R2 key for readability
  uploads.sort((a, b) => a.r2Key.localeCompare(b.r2Key));

  // Dry run summary
  console.log('  ┌─ R2 Key Mappings ──────────────────────────────────────────');
  for (const u of uploads) {
    console.log(`  │ ${u.r2Key.padEnd(55)} ← ${u.relPath}`);
  }
  console.log('  └────────────────────────────────────────────────────────────\n');

  const totalSize = await Promise.all(
    uploads.map(async (u) => (await stat(u.absPath)).size),
  );
  const sumBytes = totalSize.reduce((a, b) => a + b, 0);
  console.log(`  Total: ${uploads.length} files, ${(sumBytes / 1024).toFixed(1)} KB (${(sumBytes / 1024 / 1024).toFixed(2)} MB)\n`);

  if (!DO_UPLOAD) {
    console.log('  Dry run complete. Run with --upload to actually upload to R2.\n');
    return;
  }

  // Upload via wrangler
  console.log('  Uploading to R2 bucket "cupla-diet-research"...\n');
  let success = 0;
  let failed = 0;

  for (let i = 0; i < uploads.length; i++) {
    const u = uploads[i];
    const padded = `[${String(i + 1).padStart(3)}/${uploads.length}]`;
    try {
      execSync(
        `npx wrangler r2 object put cupla-diet-research/${u.r2Key} --file="${u.absPath}"`,
        { cwd: WORKER_DIR, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      console.log(`  ${padded} ✓ ${u.r2Key}`);
      success++;
    } catch (err) {
      console.error(`  ${padded} ✗ ${u.r2Key} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n  Done. ${success} uploaded, ${failed} failed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
