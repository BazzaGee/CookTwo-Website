import type { Env } from '../env';
import type { GeneratedMeal } from './ai';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/images/generations';
const MODEL = 'black-forest-labs/flux.2-klein-4b';

function buildImagePrompt(meal: GeneratedMeal): string {
  const { name, description, plating, ingredients } = meal;

  if (plating && plating.length >= 2) {
    const [p1, p2] = [plating[0]!, plating[1]!];
    return `Professional food photography of "${name}" - ${description}. Two ceramic dinner plates placed side by side on a rustic wooden table, top-down overhead flat lay view. Left plate labeled "${p1.partnerName}'s portion" arranged as: ${p1.plate}. Right plate labeled "${p2.partnerName}'s portion" arranged as: ${p2.plate}. Beautiful natural lighting from the side, vibrant fresh ingredients, restaurant-quality food styling, steam rising from the warm food, colorful garnishes, clean white plates, perfect composition, 4K ultra realistic, food magazine style.`;
  }

  const mainDish = ingredients.map(i => i.quantity ? `${i.quantity} ${i.name}` : i.name).join(', ');
  return `Professional food photography of "${name}" - ${description}. Single ceramic dinner plate on a rustic wooden table, top-down overhead flat lay view. Plated dish featuring: ${mainDish}. Beautiful natural lighting, vibrant fresh ingredients, restaurant-quality food styling, steam rising from the warm food, colorful garnishes, clean white plate, perfect composition, 4K ultra realistic, food magazine style.`;
}

function ensureDataUri(value: string): string {
  if (value.startsWith('data:')) return value;
  const mime = value.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${value}`;
}

export async function generateMealImage(
  env: Env,
  meal: GeneratedMeal,
): Promise<string | null> {
  const apiKey = env.OPENROUTER_KEY;
  if (!apiKey) {
    console.error('[ImageGen] OPENROUTER_KEY not configured');
    return null;
  }

  const prompt = buildImagePrompt(meal);
  console.log('[ImageGen] Prompt:', prompt);

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://couples-food-system-api.byte-digital.workers.dev',
      'X-Title': 'Couples Food System',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      n: 1,
      size: '1024x1024',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    console.error(`[ImageGen] OpenRouter error ${res.status}: ${errText.substring(0, 300)}`);
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const resultData = data.data as Array<Record<string, unknown>> | undefined;
  const rawUrl = resultData?.[0]?.url as string | undefined;
  const b64 = resultData?.[0]?.b64_json as string | undefined;

  if (rawUrl) return ensureDataUri(rawUrl);
  if (b64) return ensureDataUri(b64);

  console.error('[ImageGen] No image in OpenRouter response:', JSON.stringify(data).substring(0, 200));
  return null;
}
