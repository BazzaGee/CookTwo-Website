import type { Env } from '../env';
import type { GeneratedMeal } from './ai';

const SYNC_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const ASYNC_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image-generation/generation';
const TASK_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/tasks';
const MODEL = 'wan2.6-t2i';

function buildImagePrompt(meal: GeneratedMeal): string {
  const { name, description, plating, ingredients } = meal;

  const mainDish = ingredients.map(i => i.quantity ? `${i.quantity} ${i.name}` : i.name).join(', ');

  if (plating && plating.length >= 2) {
    const [p1, p2] = [plating[0]!, plating[1]!];
    return `Professional food photography of "${name}" - ${description}. Two ceramic dinner plates placed side by side on a rustic wooden table, top-down overhead flat lay view. Left plate labeled "${p1.partnerName}'s portion" arranged as: ${p1.plate}. Right plate labeled "${p2.partnerName}'s portion" arranged as: ${p2.plate}. Beautiful natural lighting from the side, vibrant fresh ingredients, restaurant-quality food styling, steam rising from the warm food, colorful garnishes, clean white plates, perfect composition, 4K ultra realistic, food magazine style.`;
  }

  return `Professional food photography of "${name}" - ${description}. Single ceramic dinner plate on a rustic wooden table, top-down overhead flat lay view. Plated dish featuring: ${mainDish}. Beautiful natural lighting, vibrant fresh ingredients, restaurant-quality food styling, steam rising from the warm food, colorful garnishes, clean white plate, perfect composition, 4K ultra realistic, food magazine style.`;
}

async function callSync(
  apiKey: string,
  prompt: string,
): Promise<string | null> {
  const res = await fetch(SYNC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
      },
      parameters: {
        size: '1280*1280',
        n: 1,
        prompt_extend: false,
        watermark: false,
        negative_prompt: 'Low resolution, low quality, distorted food, unappetizing, blurry, oversaturated, artificial looking',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    console.error(`[ImageGen] Sync API error ${res.status}: ${errText}`);
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const output = data.output as Record<string, unknown> | undefined;
  const choices = output?.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content as Array<Record<string, unknown>> | undefined;
  const image = content?.[0]?.image as string | undefined;
  return image ?? null;
}

async function callAsync(
  apiKey: string,
  prompt: string,
): Promise<string | null> {
  const res = await fetch(ASYNC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: MODEL,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
      },
      parameters: {
        size: '1280*1280',
        n: 1,
        prompt_extend: false,
        watermark: false,
        negative_prompt: 'Low resolution, low quality, distorted food, unappetizing, blurry, oversaturated, artificial looking',
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    console.error(`[ImageGen] Async submit error ${res.status}: ${errText}`);
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const output = data.output as Record<string, unknown> | undefined;
  const taskId = output?.task_id as string | undefined;

  if (!taskId) {
    console.error('[ImageGen] No task_id from async submit');
    return null;
  }

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(`${TASK_URL}/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!statusRes.ok) break;

    const statusData = (await statusRes.json()) as Record<string, unknown>;
    const statusOutput = statusData.output as Record<string, unknown> | undefined;
    const taskStatus = statusOutput?.task_status as string | undefined;

    if (taskStatus === 'SUCCEEDED') {
      const results = statusOutput?.results as Array<{ url?: string }> | undefined;
      if (results?.[0]?.url) return results[0].url;
      const choices = statusOutput?.choices as Array<Record<string, unknown>> | undefined;
      const message = choices?.[0]?.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      const image = content?.[0]?.image as string | undefined;
      return image ?? null;
    }

    if (taskStatus === 'FAILED') {
      console.error('[ImageGen] Task failed:', statusOutput);
      return null;
    }
  }

  return null;
}

export async function generateMealImage(
  env: Env,
  meal: GeneratedMeal,
): Promise<string | null> {
  const apiKey = env.ALIBABA_KEY;
  if (!apiKey) {
    console.error('[ImageGen] ALIBABA_KEY not configured');
    return null;
  }

  const prompt = buildImagePrompt(meal);
  console.log('[ImageGen] Prompt:', prompt);

  const syncResult = await callSync(apiKey, prompt);
  if (syncResult) return syncResult;

  console.log('[ImageGen] Sync failed, trying async mode...');
  return callAsync(apiKey, prompt);
}
