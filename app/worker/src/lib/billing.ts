import type { Env } from '../env';

export class StripeNotConfiguredError extends Error {
  constructor() {
    super('Stripe not configured');
    this.name = 'StripeNotConfiguredError';
  }
}

export function isStripeConfigured(env: Env): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY &&
    env.STRIPE_PRICE_ID_MONTHLY &&
    env.STRIPE_PRICE_ID_YEARLY,
  );
}

function stripeApi(env: Env, path: string, method = 'GET', body?: unknown): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) throw new StripeNotConfiguredError();
  return fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body as Record<string, string>) : undefined,
  });
}

export async function createCheckoutSession(
  env: Env,
  householdId: string,
  plan: 'monthly' | 'yearly',
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string }> {
  if (!isStripeConfigured(env)) throw new StripeNotConfiguredError();

  let customerId: string | null = null;
  if (env.STRIPE_CUSTOMER_ID) {
    customerId = env.STRIPE_CUSTOMER_ID;
  }

  const priceId = plan === 'monthly' ? env.STRIPE_PRICE_ID_MONTHLY! : env.STRIPE_PRICE_ID_YEARLY!;

  const params: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'client_reference_id': householdId,
    'metadata[household_id]': householdId,
  };

  if (customerId) {
    params.customer = customerId;
  }

  const res = await stripeApi(env, '/checkout/sessions', 'POST', params);
  const data = (await res.json()) as { url?: string; error?: { message: string } };

  if (!res.ok || !data.url) {
    throw new Error(data.error?.message ?? 'Failed to create checkout session');
  }

  return { url: data.url };
}

export async function createPortalSession(
  env: Env,
  customerId: string,
  returnUrl: string,
): Promise<{ url: string }> {
  if (!isStripeConfigured(env)) throw new StripeNotConfiguredError();

  const res = await stripeApi(env, '/billing_portal/sessions', 'POST', {
    customer: customerId,
    return_url: returnUrl,
  });
  const data = (await res.json()) as { url?: string; error?: { message: string } };

  if (!res.ok || !data.url) {
    throw new Error(data.error?.message ?? 'Failed to create portal session');
  }

  return { url: data.url };
}

export async function verifyAndParseWebhook(
  env: Env,
  rawBody: string,
  signature: string,
): Promise<{ type: string; data: Record<string, unknown> }> {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new StripeNotConfiguredError();

  const tolerance = Math.floor(Date.now() / 1000) - 300;
  const expectedSig = env.STRIPE_WEBHOOK_SECRET;

  const parts = signature.split(',');
  let timestamp = 0;
  let sigHex = '';
  for (const part of parts) {
    const [key, value] = part.split('=') as [string, string];
    if (key === 't') timestamp = parseInt(value, 10);
    if (key === 'v1') sigHex = value;
  }

  if (!timestamp || !sigHex) {
    throw new Error('Webhook signature missing t or v1');
  }

  if (timestamp < tolerance) {
    throw new Error('Webhook timestamp is too old');
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(expectedSig);
  const payloadData = encoder.encode(signedPayload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const valid = await crypto.subtle.verify('HMAC', cryptoKey, hexToBytes(sigHex), payloadData);
  if (!valid) {
    throw new Error('Webhook signature mismatch');
  }

  return JSON.parse(rawBody) as { type: string; data: Record<string, unknown> };
}

export async function updateStripeCustomerId(
  db: D1Database,
  householdId: string,
  customerId: string,
): Promise<void> {
  await db.prepare(
    `UPDATE household_subscriptions SET stripe_customer_id = ?, updated_at = ? WHERE household_id = ?`,
  )
    .bind(customerId, Date.now(), householdId)
    .run();
}

export async function applyWebhookEvent(
  env: Env,
  db: D1Database,
  event: { type: string; data: { object?: Record<string, unknown> } },
): Promise<void> {
  const obj = event.data.object || {};
  const now = Date.now();

  switch (event.type) {
    case 'checkout.session.completed': {
      const meta = obj.metadata as Record<string, unknown> | undefined;
      const householdId = (obj.client_reference_id || meta?.household_id) as string | undefined;
      const customerId = obj.customer as string | undefined;
      const subscriptionId = obj.subscription as string | undefined;
      const mode = obj.mode as string;

      if (!householdId || mode !== 'subscription') return;

      const subRes = await stripeApi(
        env,
        `/subscriptions/${subscriptionId}`,
        'GET',
      );

      let planPeriod: 'monthly' | 'yearly' = 'monthly';
      let periodEnd = 0;
      if (subRes.ok) {
        const subData = (await subRes.json()) as {
          items?: { data?: Array<{ price?: { recurring?: { interval?: string } } }> };
          current_period_end?: number;
        };
        const interval = subData.items?.data?.[0]?.price?.recurring?.interval;
        if (interval === 'year') planPeriod = 'yearly';
        periodEnd = (subData.current_period_end ?? 0) * 1000;
      }

      await db.prepare(
        `INSERT INTO household_subscriptions
            (household_id, tier, plan_period, timezone, last_reset_date,
             used_today, daily_quota, images_used_today, daily_image_quota,
             stripe_customer_id, stripe_subscription_id, current_period_end,
             cancel_at_period_end, status, created_at, updated_at)
         VALUES (?, 'premium', ?, 'UTC', NULL, 0, 70, 0, 3, ?, ?, ?, 0, 'active', ?, ?)
         ON CONFLICT(household_id) DO UPDATE SET
             tier = 'premium',
             daily_quota = 70,
             daily_image_quota = 3,
             used_today = 0,
             images_used_today = 0,
             stripe_customer_id = excluded.stripe_customer_id,
             stripe_subscription_id = excluded.stripe_subscription_id,
             plan_period = excluded.plan_period,
             current_period_end = excluded.current_period_end,
             status = 'active',
             updated_at = excluded.updated_at`,
      )
        .bind(householdId, planPeriod, customerId, subscriptionId, periodEnd, now, now)
        .run();
      break;
    }

    case 'customer.subscription.updated': {
      const subscriptionId = obj.id as string | undefined;
      const status = obj.status as string | undefined;
      const cancelAtPeriodEnd = (obj.cancel_at_period_end as boolean) ? 1 : 0;
      const periodEnd = (obj.current_period_end as number ?? 0) * 1000;

      if (!subscriptionId) return;

      await db.prepare(
        `UPDATE household_subscriptions
            SET status = ?,
                cancel_at_period_end = ?,
                current_period_end = ?,
                updated_at = ?
          WHERE stripe_subscription_id = ?`,
      )
        .bind(status ?? 'active', cancelAtPeriodEnd, periodEnd, now, subscriptionId)
        .run();
      break;
    }

    case 'customer.subscription.deleted': {
      const deletedSubId = obj.id as string | undefined;
      if (!deletedSubId) return;

      await db.prepare(
        `UPDATE household_subscriptions
            SET tier = 'free',
                daily_quota = 10,
                daily_image_quota = 0,
                stripe_subscription_id = NULL,
                status = 'canceled',
                updated_at = ?
          WHERE stripe_subscription_id = ?`,
      )
        .bind(now, deletedSubId)
        .run();
      break;
    }

    case 'invoice.payment_failed': {
      const subDetails = obj.subscription_details as Record<string, unknown> | undefined;
      const failedSubId = (obj.subscription as string) || (subDetails?.subscription as string) || undefined;
      if (!failedSubId) return;

      await db.prepare(
        `UPDATE household_subscriptions
            SET status = 'past_due',
                updated_at = ?
          WHERE stripe_subscription_id = ?`,
      )
        .bind(now, failedSubId)
        .run();
      break;
    }
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
