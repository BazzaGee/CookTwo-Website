import type { Context } from 'hono';
import type { Env } from '../env';

export interface DietCatalogEntry {
  dietKey: string;
  displayLabel: string;
  category: string;
  emoji: string;
  shortDesc: string;
  evidenceGrade: string;
  restrictiveness: number;
  isTimingPattern: boolean;
  isDefault: boolean;
  aiRules: string;
  allowedGroups: string[];
  restrictedGroups: string[];
  classifierTerms: Record<string, string>;
  macroTargets: Record<string, unknown>;
  easyMatches: string[];
  adaptableMatches: Record<string, string>;
  hardConflicts: Record<string, string>;
}

interface DietCatalogRow {
  diet_key: string;
  display_label: string;
  category: string;
  emoji: string;
  short_desc: string;
  evidence_grade: string;
  restrictiveness: number;
  is_timing_pattern: number;
  is_default: number;
  ai_rules: string;
  allowed_groups: string;
  restricted_groups: string;
  classifier_terms: string;
  macro_targets: string;
  easy_matches: string;
  adaptable_matches: string;
  hard_conflicts: string;
}

interface DietArticleRow {
  diet_key: string;
  file_slug: string;
  title: string;
  r2_key: string;
  sort_order: number;
}

function rowToEntry(row: DietCatalogRow): DietCatalogEntry {
  return {
    dietKey: row.diet_key,
    displayLabel: row.display_label,
    category: row.category,
    emoji: row.emoji,
    shortDesc: row.short_desc,
    evidenceGrade: row.evidence_grade,
    restrictiveness: row.restrictiveness,
    isTimingPattern: row.is_timing_pattern === 1,
    isDefault: row.is_default === 1,
    aiRules: row.ai_rules,
    allowedGroups: safeJsonArray(row.allowed_groups),
    restrictedGroups: safeJsonArray(row.restricted_groups),
    classifierTerms: safeJsonObject(row.classifier_terms),
    macroTargets: safeJsonObject(row.macro_targets),
    easyMatches: safeJsonArray(row.easy_matches),
    adaptableMatches: safeJsonObject(row.adaptable_matches),
    hardConflicts: safeJsonObject(row.hard_conflicts),
  };
}

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function safeJsonObject(s: string): Record<string, string> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

const SELECT_COLS = `diet_key, display_label, category, emoji, short_desc,
  evidence_grade, restrictiveness, is_timing_pattern, is_default,
  ai_rules, allowed_groups, restricted_groups, classifier_terms,
  macro_targets, easy_matches, adaptable_matches, hard_conflicts`;

export async function handleListDiets(c: Context<{ Bindings: Env }>) {
  const { results } = await c.env.DB.prepare(
    `SELECT ${SELECT_COLS} FROM diet_catalog ORDER BY is_default DESC, category ASC, restrictiveness ASC`,
  ).all<DietCatalogRow>();

  return c.json((results ?? []).map(rowToEntry));
}

export async function handleGetDiet(c: Context<{ Bindings: Env }>) {
  const dietKey = c.req.param('dietKey');

  const row = await c.env.DB.prepare(
    `SELECT ${SELECT_COLS} FROM diet_catalog WHERE diet_key = ?`,
  ).bind(dietKey).first<DietCatalogRow>();

  if (!row) return c.json({ error: 'diet_not_found' }, 404);

  return c.json(rowToEntry(row));
}

export async function handleListArticles(c: Context<{ Bindings: Env }>) {
  const dietKey = c.req.param('dietKey');

  const { results } = await c.env.DB.prepare(
    `SELECT diet_key, file_slug, title, r2_key, sort_order
     FROM diet_articles
     WHERE diet_key = ?
     ORDER BY sort_order ASC`,
  ).bind(dietKey).all<DietArticleRow>();

  return c.json((results ?? []).map((r) => ({
    dietKey: r.diet_key,
    fileSlug: r.file_slug,
    title: r.title,
    r2Key: r.r2_key,
    sortOrder: r.sort_order,
  })));
}

export async function handleGetArticle(c: Context<{ Bindings: Env }>) {
  const dietKey = c.req.param('dietKey');
  const fileSlug = c.req.param('fileSlug');

  const article = await c.env.DB.prepare(
    `SELECT diet_key, file_slug, title, r2_key, sort_order
     FROM diet_articles
     WHERE diet_key = ? AND file_slug = ?`,
  ).bind(dietKey, fileSlug).first<DietArticleRow>();

  if (!article) return c.json({ error: 'article_not_found' }, 404);

  const r2Key = article.r2_key;
  const obj = await c.env.DIET_RESEARCH.get(r2Key);

  if (!obj) return c.json({ error: 'content_not_found', r2Key }, 404);

  const content = await obj.text();

  return c.json({
    dietKey: article.diet_key,
    fileSlug: article.file_slug,
    title: article.title,
    content,
  });
}
