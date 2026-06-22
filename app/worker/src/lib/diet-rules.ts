import type { DietCatalogEntry } from '../routes/diet-info';

export interface DietRules {
  dietKey: string;
  displayLabel: string;
  aiRules: string;
  restrictedGroups: string[];
  classifierTerms: Record<string, string>;
  easyMatches: string[];
  adaptableMatches: Record<string, string>;
  hardConflicts: Record<string, string>;
}

export interface CoupleDietRules {
  partner1: DietRules | null;
  partner2: DietRules | null;
  combinedClassifierTerms: Record<string, string>;
  combinedRestrictedGroups: Set<string>;
  promptBlock: string;
  conflictNote: string | null;
}

interface DietRow {
  diet_key: string;
  display_label: string;
  ai_rules: string;
  restricted_groups: string;
  classifier_terms: string;
  easy_matches: string;
  adaptable_matches: string;
  hard_conflicts: string;
}

function rowToRules(row: DietRow): DietRules {
  return {
    dietKey: row.diet_key,
    displayLabel: row.display_label,
    aiRules: row.ai_rules || '',
    restrictedGroups: safeJsonArray(row.restricted_groups),
    classifierTerms: safeJsonObject(row.classifier_terms),
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

const RULE_COLS = `diet_key, display_label, ai_rules, restricted_groups,
  classifier_terms, easy_matches, adaptable_matches, hard_conflicts`;

export async function getDietRules(db: D1Database, dietKey: string): Promise<DietRules | null> {
  const row = await db.prepare(
    `SELECT ${RULE_COLS} FROM diet_catalog WHERE diet_key = ?`,
  ).bind(dietKey).first<DietRow>();

  if (!row) return null;
  return rowToRules(row);
}

export async function getCoupleDietRules(
  db: D1Database,
  diet1: string,
  diet2: string,
  fastingMode1?: string | null,
  fastingMode2?: string | null,
): Promise<CoupleDietRules> {
  const partner1 = await getDietRules(db, diet1);
  const partner2 = diet1 === diet2 ? partner1 : await getDietRules(db, diet2);

  const combinedClassifierTerms: Record<string, string> = {};
  const combinedRestrictedGroups = new Set<string>();

  for (const rules of [partner1, partner2]) {
    if (!rules) continue;
    for (const group of rules.restrictedGroups) {
      combinedRestrictedGroups.add(group);
    }
    for (const [term, group] of Object.entries(rules.classifierTerms)) {
      combinedClassifierTerms[term] = group;
    }
  }

  let promptBlock = buildPromptBlock(partner1, partner2);
  let conflictNote = detectConflict(partner1, partner2);

  if (fastingMode1 || fastingMode2) {
    const ifRules = await getDietRules(db, 'intermittent-fasting');
    if (ifRules?.aiRules) {
      const fastingDesc = [
        fastingMode1 ? `Partner 1 fasts: ${fastingMode1}` : null,
        fastingMode2 ? `Partner 2 fasts: ${fastingMode2}` : null,
      ].filter(Boolean).join('\n');
      const ifSection = `INTERMITTENT FASTING — TIMING RULES\n${fastingDesc}\n\n${ifRules.aiRules}`;
      promptBlock = promptBlock ? `${promptBlock}\n\n${ifSection}` : ifSection;
    }
  }

  return {
    partner1,
    partner2,
    combinedClassifierTerms,
    combinedRestrictedGroups,
    promptBlock,
    conflictNote,
  };
}

function buildPromptBlock(p1: DietRules | null, p2: DietRules | null): string {
  const parts: string[] = [];

  if (p1?.aiRules) {
    parts.push(`Partner 1 diet (${p1.displayLabel}):\n${p1.aiRules}`);
  }
  if (p2?.aiRules && (!p1 || p2.dietKey !== p1.dietKey)) {
    parts.push(`Partner 2 diet (${p2.displayLabel}):\n${p2.aiRules}`);
  }

  const conflict = detectConflict(p1, p2);
  if (conflict) {
    parts.push(`COUPLE CONFLICT NOTE: ${conflict}`);
  }

  return parts.join('\n\n');
}

function detectConflict(p1: DietRules | null, p2: DietRules | null): string | null {
  if (!p1 || !p2 || p1.dietKey === p2.dietKey) return null;

  const conflict12 = p1.hardConflicts[p2.dietKey];
  const conflict21 = p2.hardConflicts[p1.dietKey];

  if (conflict12) return `${p1.displayLabel} + ${p2.displayLabel}: ${conflict12}`;
  if (conflict21) return `${p2.displayLabel} + ${p1.displayLabel}: ${conflict21}`;

  return null;
}
