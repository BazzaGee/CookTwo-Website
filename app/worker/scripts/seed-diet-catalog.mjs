#!/usr/bin/env node
/**
 * Parses all 05_App_Encoding_Spec.md (and 12_App_Encoding_Spec.md for healthy-eating)
 * and generates a seed SQL file for the diet_catalog table.
 *
 * Usage:
 *   node scripts/seed-diet-catalog.mjs > migrations/0010_diet_catalog_seed.sql
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RESEARCH_DIR = 'C:\\Users\\barry\\OneDrive\\Desktop\\Cupla\\Diet Research';

const DIET_FOLDERS = {
  '01_Mediterranean': { slug: 'mediterranean', articlePrefix: 'diets/mediterranean' },
  '02_DASH': { slug: 'dash', articlePrefix: 'diets/dash' },
  '03_Intermittent_Fasting': { slug: 'intermittent-fasting', articlePrefix: 'diets/intermittent-fasting' },
  '04_Keto_LowCarb': { slug: 'keto', articlePrefix: 'diets/keto' },
  '05_High_Protein': { slug: 'high-protein', articlePrefix: 'diets/high-protein' },
  '06_Plant_Based_Vegan_Vegetarian': { slug: 'plant-based', articlePrefix: 'diets/plant-based' },
  '07_Flexitarian': { slug: 'flexitarian', articlePrefix: 'diets/flexitarian' },
  '08_Paleo': { slug: 'paleo', articlePrefix: 'diets/paleo' },
  '09_Whole30': { slug: 'whole30', articlePrefix: 'diets/whole30' },
  '10_Low_FODMAP': { slug: 'low-fodmap', articlePrefix: 'diets/low-fodmap' },
  '11_MIND': { slug: 'mind', articlePrefix: 'diets/mind' },
  '12_Pritikin': { slug: 'pritikin', articlePrefix: 'diets/pritikin' },
  '13_Carnivore': { slug: 'carnivore', articlePrefix: 'diets/carnivore' },
  '14_McDougall_Starch_Solution': { slug: 'mcdougall', articlePrefix: 'diets/mcdougall' },
  '15_Macrobiotic': { slug: 'macrobiotic', articlePrefix: 'diets/macrobiotic' },
  '16_Volumetrics': { slug: 'volumetrics', articlePrefix: 'diets/volumetrics' },
  '17_HCLF_80_10_10': { slug: 'hclf-811', articlePrefix: 'diets/hclf-811' },
};

// ─── YAML / Markdown extraction helpers ──────────────────────────────────────

/** Extract a fenced code block following a given header. */
function extractCodeBlock(md, headerPattern) {
  // Find the header
  const headerMatch = md.match(headerPattern);
  if (!headerMatch) return null;

  const afterHeader = md.slice(headerMatch.index + headerMatch[0].length);

  // Find the next fenced block
  const fenceMatch = afterHeader.match(/```[a-z]*\n([\s\S]*?)```/);
  if (!fenceMatch) return null;

  return fenceMatch[1].trim();
}

/** Extract a plain-text code block (non-YAML) following a header. */
function extractTextBlock(md, headerPattern) {
  const headerMatch = md.match(headerPattern);
  if (!headerMatch) return '';

  const afterHeader = md.slice(headerMatch.index + headerMatch[0].length);

  // Find the next fenced block (any language or plain)
  const fenceMatch = afterHeader.match(/```\n([\s\S]*?)```/);
  if (!fenceMatch) return '';

  return fenceMatch[1].trim();
}

/** Parse simple YAML key: "value" patterns from a metadata block. */
function parseYamlMetadata(yaml) {
  const result = {};
  for (const line of yaml.split('\n')) {
    const m = line.match(/^\s*(\w+):\s*"?(.*?)"?\s*(?:#.*)?$/);
    if (m) {
      result[m[1]] = m[2].replace(/['"]/g, '');
    }
  }
  return result;
}

/** Parse a YAML array (list of "- value" items), optionally with comments. */
function parseYamlArray(yaml, keyName) {
  const result = [];
  let inSection = false;

  for (const line of yaml.split('\n')) {
    // Detect section header like "allowed_food_groups:"
    if (keyName && line.match(new RegExp(`^${keyName}:`))) {
      inSection = true;
      continue;
    }
    // Stop if we hit another section at same indent level
    if (inSection && line.match(/^\S/) && !line.match(/^\s*-\s/) && !line.match(/^\s*#/)) {
      break;
    }
    if (inSection || !keyName) {
      const m = line.match(/^\s*-\s+"([^"]+)"/);
      if (m) result.push(m[1]);
    }
  }
  return result;
}

/** Parse classifier mappings YAML: "ingredient": "food-group" */
function parseClassifierMappings(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*"([^"]+)":\s*"([^"]+)"/);
    if (m) {
      result[m[1].toLowerCase()] = m[2];
    }
  }
  return result;
}

/** Parse couple compatibility from YAML. */
function parseCompatibility(yaml) {
  const easy = [];
  const adaptable = {};
  const hardConflict = {};

  let currentSection = null;

  for (const line of yaml.split('\n')) {
    if (/easy_match\s*:/.test(line)) currentSection = 'easy';
    else if (/adaptable_match\s*:/.test(line) || /adaptable_with_fat/.test(line)) currentSection = 'adaptable';
    else if (/hard_conflict\s*:/.test(line)) currentSection = 'hard';

    if (currentSection === 'easy') {
      const m = line.match(/^\s*-\s+(\S+)/);
      if (m && !m[1].includes(':')) easy.push(m[1].replace(/['"]/g, ''));
      else if (m && m[1].includes(':')) {
        const m2 = line.match(/^\s*-\s+(\S+):\s*"?(.*?)"?\s*$/);
        if (m2) adaptable[m2[1]] = (m2[2] || '').replace(/['"]/g, '');
      }
    } else if (currentSection === 'adaptable') {
      const m = line.match(/^\s*-\s+(\S+):\s*"?(.*?)"?\s*$/);
      if (m) adaptable[m[1]] = (m[2] || '').replace(/['"]/g, '');
      else {
        const m2 = line.match(/^\s*-\s+(\S+)/);
        if (m2 && !m2[1].includes(':')) {
          // simple list item in adaptable section
          if (!adaptable[m2[1]]) adaptable[m2[1]] = '';
        }
      }
    } else if (currentSection === 'hard') {
      const m = line.match(/^\s*-\s+(\S+):\s*"?(.*?)"?\s*$/);
      if (m) hardConflict[m[1]] = (m[2] || '').replace(/['"]/g, '');
      else {
        const m2 = line.match(/^\s*-\s+(\S+)/);
        if (m2 && !m2[1].includes(':')) {
          if (!hardConflict[m2[1]]) hardConflict[m2[1]] = '';
        }
      }
    }
  }
  return { easy, adaptable, hardConflict };
}

/** Escape a string for SQL single-quoted literal. */
function sqlStr(str) {
  if (!str) return "''";
  return "'" + str.replace(/'/g, "''") + "'";
}

/** Escape and JSON-stringify for SQL. */
function sqlJson(obj) {
  return sqlStr(JSON.stringify(obj));
}

// ─── Article metadata ─────────────────────────────────────────────────────────

const ARTICLE_TITLES = {
  '01_overview': 'Overview',
  '02_science_and_evidence': 'Science & Evidence',
  '03_food_framework': 'Food Framework',
  '04_health_outcomes': 'Health Outcomes',
  '05_app_encoding_spec': 'Encoding Spec',
  // Healthy eating articles:
  '00_readme': 'Introduction',
  '01_macronutrients_overview': 'Macronutrients Overview',
  '02_carbohydrates_deep_dive': 'Carbohydrates Deep Dive',
  '03_protein_deep_dive': 'Protein Deep Dive',
  '04_dietary_fat_deep_dive': 'Dietary Fat Deep Dive',
  '05_global_dietary_patterns': 'Global Dietary Patterns',
  '06_food_quality_vs_restriction': 'Food Quality vs Restriction',
  '07_micronutrients_and_nutrient_density': 'Micronutrients & Nutrient Density',
  '08_balanced_eating_consensus': 'Balanced Eating Consensus',
  '09_myth_debunking': 'Myth Debunking',
  '10_diet_culture_vs_sustainable_eating': 'Diet Culture vs Sustainable Eating',
  '11_practical_framework': 'Practical Framework',
  '12_app_encoding_spec': 'Encoding Spec',
};

// ─── Parse a single encoding spec ────────────────────────────────────────────

async function parseEncodingSpec(filePath) {
  const md = await readFile(filePath, 'utf-8');

  // Extract metadata YAML block
  const metaYaml = extractCodeBlock(md, /^##\s*Diet\s*Metadata/im) || '';
  const meta = parseYamlMetadata(metaYaml);

  // Extract AI Prompt Instructions (plain text block)
  const aiRules = extractTextBlock(md, /^##\s*AI\s*Prompt\s*Instructions/im) || '';

  // Extract allowed food groups
  const foodGroupsYaml = extractCodeBlock(md, /^###\s*Allowed\s*Food\s*Groups?/im) || '';
  const allowedGroups = parseYamlArray(foodGroupsYaml);

  // Extract restricted food groups
  const restrictedYaml = extractCodeBlock(md, /^###\s*Restricted\s*Food\s*Groups?/im) || '';
  const restrictedGroups = parseYamlArray(restrictedYaml);

  // Extract classifier mappings
  const classifierYaml = extractCodeBlock(md, /^##\s*Ingredient\s*Classifier/im) || '';
  const classifierTerms = parseClassifierMappings(classifierYaml);

  // Extract couple compatibility
  const compatYaml = extractCodeBlock(md, /^##\s*Couple\s*Compatibility/im) || '';
  const compat = parseCompatibility(compatYaml);

  return {
    dietKey: meta.diet_key || '',
    displayLabel: meta.display_label || meta.diet_key || '',
    category: meta.category || 'lifestyle',
    emoji: meta.emoji || '',
    shortDesc: meta.short_description || '',
    evidenceGrade: meta.evidence_grade || 'B',
    restrictiveness: parseInt(meta.restrictiveness) || 3,
    isTimingPattern: meta.is_timing_pattern === 'true' ? 1 : 0,
    aiRules,
    allowedGroups,
    restrictedGroups,
    classifierTerms,
    easyMatches: compat.easy,
    adaptableMatches: compat.adaptable,
    hardConflicts: compat.hardConflict,
  };
}

// ─── Also parse healthy-eating encoding spec ─────────────────────────────────

async function parseHealthyEatingSpec(filePath) {
  const md = await readFile(filePath, 'utf-8');

  // The healthy-eating spec has a slightly different structure
  // Section 1: metadata
  const metaYaml = extractCodeBlock(md, /^##\s*1\.\s*Diet\s*metadata/im) || '';
  const meta = parseYamlMetadata(metaYaml);

  // AI prompt instructions (section 5)
  const aiBlock = extractCodeBlock(md, /^##\s*5\.\s*AI\s*prompt\s*instructions/im) || '';
  // The AI rules are inside the yaml block, under core_directives
  // Extract the directives as plain text
  let aiRules = '';
  if (aiBlock) {
    const directives = [];
    for (const line of aiBlock.split('\n')) {
      const m = line.match(/^\s*-\s*>(.*)$/);
      if (m) {
        const text = m[1].trim().replace(/^["']|["']$/g, '');
        directives.push(text);
      }
    }
    aiRules = directives.join('\n');
  }

  // Allowed/restricted groups
  const restrictedYaml = extractCodeBlock(md, /^##\s*2\.\s*Restricted\s*food\s*groups/im) || '';

  // Compatibility (section 7)
  const compatYaml = extractCodeBlock(md, /^##\s*7\.\s*Couple\s*compatibility/im) || '';
  const compat = parseCompatibility(compatYaml);

  return {
    dietKey: 'healthy-eating',
    displayLabel: 'Healthy Eating',
    category: 'balanced',
    emoji: meta.emoji || '\u{1F96D}',
    shortDesc: meta.short_description || meta.description || 'Balanced, whole-food eating — no restrictions',
    evidenceGrade: 'A',
    restrictiveness: 1,
    isTimingPattern: 0,
    aiRules,
    allowedGroups: [], // everything allowed
    restrictedGroups: [],
    classifierTerms: {},
    easyMatches: [],
    adaptableMatches: {},
    hardConflicts: {},
  };
}

// ─── Legacy diet entries (backward compat) ────────────────────────────────────

const LEGACY_DIETS = [
  {
    dietKey: 'omnivore',
    displayLabel: 'No restrictions',
    category: 'balanced',
    emoji: '',
    shortDesc: 'Eat everything — no dietary restrictions',
    evidenceGrade: 'A',
    restrictiveness: 1,
    isTimingPattern: 0,
    aiRules: 'No specific dietary restrictions. All food groups are allowed.',
    allowedGroups: [],
    restrictedGroups: [],
    classifierTerms: {},
    easyMatches: [],
    adaptableMatches: {},
    hardConflicts: {},
  },
  {
    dietKey: 'vegetarian',
    displayLabel: 'Vegetarian',
    category: 'plantBased',
    emoji: '',
    shortDesc: 'No meat or fish — eggs and dairy OK',
    evidenceGrade: 'A',
    restrictiveness: 2,
    isTimingPattern: 0,
    aiRules: 'VEGETARIAN DIET RULES:\n1. No meat, poultry, fish, or seafood.\n2. Eggs and dairy are allowed.\n3. Plant-based proteins (legumes, tofu, tempeh) should feature regularly.\n4. Include a variety of vegetables, fruits, whole grains, and nuts.',
    allowedGroups: ['legumes', 'eggs', 'dairy', 'vegetables', 'fruits', 'whole-grains', 'nuts', 'seeds'],
    restrictedGroups: ['red-meat', 'poultry', 'fish', 'seafood', 'processed-meat'],
    classifierTerms: {
      'chicken': 'poultry', 'beef': 'red-meat', 'pork': 'red-meat', 'lamb': 'red-meat',
      'turkey': 'poultry', 'duck': 'poultry', 'bacon': 'processed-meat', 'sausage': 'processed-meat',
      'salmon': 'fish', 'tuna': 'fish', 'cod': 'fish', 'shrimp': 'seafood',
    },
    easyMatches: ['vegan', 'plant-based', 'mediterranean', 'flexitarian'],
    adaptableMatches: { 'keto': 'Use eggs and cheese as shared protein base', 'paleo': 'Focus on vegetables, nuts, eggs' },
    hardConflicts: { 'carnivore': 'Fundamental conflict — no shared protein source' },
  },
  {
    dietKey: 'vegan',
    displayLabel: 'Vegan',
    category: 'plantBased',
    emoji: '',
    shortDesc: 'No animal products — plant-based only',
    evidenceGrade: 'A',
    restrictiveness: 3,
    isTimingPattern: 0,
    aiRules: 'VEGAN DIET RULES:\n1. No meat, poultry, fish, seafood, eggs, dairy, or honey.\n2. All protein must come from plant sources (legumes, tofu, tempeh, seitan, nuts, seeds).\n3. Include fortified foods or supplements for B12, vitamin D, and omega-3 (algae-based).\n4. Emphasize variety of vegetables, fruits, whole grains, legumes, nuts, and seeds.',
    allowedGroups: ['legumes', 'vegetables', 'fruits', 'whole-grains', 'nuts', 'seeds', 'tofu', 'tempeh'],
    restrictedGroups: ['red-meat', 'poultry', 'fish', 'seafood', 'eggs', 'dairy', 'honey', 'processed-meat'],
    classifierTerms: {
      'chicken': 'poultry', 'beef': 'red-meat', 'pork': 'red-meat', 'lamb': 'red-meat',
      'salmon': 'fish', 'tuna': 'fish', 'shrimp': 'seafood',
      'eggs': 'eggs', 'cheese': 'dairy', 'milk': 'dairy', 'butter': 'dairy', 'yogurt': 'dairy',
      'cream': 'dairy', 'whey': 'dairy', 'honey': 'honey',
    },
    easyMatches: ['vegetarian', 'plant-based', 'flexitarian'],
    adaptableMatches: { 'mediterranean': 'Make base plant-based, add fish separately for non-vegan partner' },
    hardConflicts: { 'carnivore': 'Fundamental conflict — no shared foods', 'keto': 'Very difficult — almost no shared protein sources' },
  },
  {
    dietKey: 'pescatarian',
    displayLabel: 'Pescatarian',
    category: 'plantBased',
    emoji: '',
    shortDesc: 'No meat — fish and seafood OK',
    evidenceGrade: 'A',
    restrictiveness: 2,
    isTimingPattern: 0,
    aiRules: 'PESCATARIAN DIET RULES:\n1. No red meat or poultry.\n2. Fish and seafood are allowed and encouraged.\n3. Eggs and dairy are allowed.\n4. Include fatty fish (salmon, sardines, mackerel) 1-2x per week for omega-3.',
    allowedGroups: ['fish', 'seafood', 'eggs', 'dairy', 'vegetables', 'fruits', 'whole-grains', 'legumes', 'nuts', 'seeds'],
    restrictedGroups: ['red-meat', 'poultry', 'processed-meat'],
    classifierTerms: {
      'chicken': 'poultry', 'beef': 'red-meat', 'pork': 'red-meat', 'lamb': 'red-meat',
      'turkey': 'poultry', 'bacon': 'processed-meat',
    },
    easyMatches: ['vegetarian', 'mediterranean', 'plant-based', 'flexitarian'],
    adaptableMatches: { 'keto': 'Use fish + low-carb vegetables as shared base' },
    hardConflicts: { 'carnivore': 'Fundamental conflict' },
  },
];

// ─── Generate SQL ─────────────────────────────────────────────────────────────

function generateDietInsert(d) {
  const isDefault = d.dietKey === 'healthy-eating' || d.dietKey === 'omnivore' ? 1 : 0;

  return `INSERT INTO diet_catalog (
    diet_key, display_label, category, emoji, short_desc,
    evidence_grade, restrictiveness, is_timing_pattern, is_default,
    ai_rules, allowed_groups, restricted_groups, classifier_terms,
    easy_matches, adaptable_matches, hard_conflicts
  ) VALUES (
    ${sqlStr(d.dietKey)}, ${sqlStr(d.displayLabel)}, ${sqlStr(d.category)}, ${sqlStr(d.emoji)}, ${sqlStr(d.shortDesc)},
    ${sqlStr(d.evidenceGrade)}, ${d.restrictiveness}, ${d.isTimingPattern}, ${isDefault},
    ${sqlStr(d.aiRules)}, ${sqlJson(d.allowedGroups)}, ${sqlJson(d.restrictedGroups)}, ${sqlJson(d.classifierTerms)},
    ${sqlJson(d.easyMatches)}, ${sqlJson(d.adaptableMatches)}, ${sqlJson(d.hardConflicts)}
  );`;
}

function generateArticleInserts(dietKey, articlePrefix, fileSlugs) {
  return fileSlugs.map((slug, i) => {
    const title = ARTICLE_TITLES[slug] || slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return `INSERT INTO diet_articles (diet_key, file_slug, title, r2_key, sort_order) VALUES (
  ${sqlStr(dietKey)}, ${sqlStr(slug)}, ${sqlStr(title)}, ${sqlStr(`${articlePrefix}/${slug}.md`)}, ${i}
);`;
  }).join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const diets = [];
  const errors = [];

  // Parse all diet encoding specs
  for (const [folder, info] of Object.entries(DIET_FOLDERS)) {
    const specPath = join(RESEARCH_DIR, 'diets', folder, '05_App_Encoding_Spec.md');
    try {
      const parsed = await parseEncodingSpec(specPath);
      if (!parsed.dietKey) {
        errors.push(`${folder}: no diet_key found`);
        continue;
      }
      diets.push(parsed);
      console.error(`  ✓ ${folder} → ${parsed.dietKey} (${parsed.displayLabel})`);
    } catch (err) {
      errors.push(`${folder}: ${err.message}`);
      console.error(`  ✗ ${folder}: ${err.message}`);
    }
  }

  // Parse healthy-eating spec
  try {
    const heParsed = await parseHealthyEatingSpec(
      join(RESEARCH_DIR, '00_Healthy_Eating_General', '12_App_Encoding_Spec.md'),
    );
    diets.push(heParsed);
    console.error(`  ✓ healthy-eating → ${heParsed.dietKey}`);
  } catch (err) {
    errors.push(`healthy-eating: ${err.message}`);
    console.error(`  ✗ healthy-eating: ${err.message}`);
  }

  // Add legacy diets
  for (const d of LEGACY_DIETS) {
    diets.push(d);
    console.error(`  ✓ legacy → ${d.dietKey}`);
  }

  console.error(`\n  Parsed ${diets.length} diets, ${errors.length} errors.\n`);

  // Generate article file slug lists
  const dietArticleSlugs = ['01_overview', '02_science_and_evidence', '03_food_framework', '04_health_outcomes', '05_app_encoding_spec'];
  const healthyArticleSlugs = [
    '00_readme', '01_macronutrients_overview', '02_carbohydrates_deep_dive', '03_protein_deep_dive',
    '04_dietary_fat_deep_dive', '05_global_dietary_patterns', '06_food_quality_vs_restriction',
    '07_micronutrients_and_nutrient_density', '08_balanced_eating_consensus', '09_myth_debunking',
    '10_diet_culture_vs_sustainable_eating', '11_practical_framework', '12_app_encoding_spec',
  ];

  // Output SQL
  const lines = [];
  lines.push('-- Auto-generated by scripts/seed-diet-catalog.mjs');
  lines.push('-- Do not edit manually. Re-generate from encoding specs.');
  lines.push('');
  lines.push('-- ═══ Diet Catalog ═══════════════════════════════════════════════');
  lines.push('');

  for (const d of diets) {
    lines.push(generateDietInsert(d));
  }

  lines.push('');
  lines.push('-- ═══ Diet Articles Index ═════════════════════════════════════════');
  lines.push('');

  for (const [folder, info] of Object.entries(DIET_FOLDERS)) {
    lines.push(generateArticleInserts(info.slug, info.articlePrefix, dietArticleSlugs));
    lines.push('');
  }

  // Healthy-eating articles
  lines.push(generateArticleInserts('healthy-eating', 'healthy-eating', healthyArticleSlugs));
  lines.push('');

  console.log(lines.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
