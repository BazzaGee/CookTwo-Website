import type { Context } from 'hono';
import type { Env } from '../env';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleSubscribe(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const joinCode = typeof body.joinCode === 'string' && /^\d{6}$/.test(body.joinCode) ? body.joinCode : null;

  if (!email || !EMAIL_RE.test(email)) {
    return c.json({ error: 'Please enter a valid email address.' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT * FROM waitlist WHERE email = ?')
    .bind(email)
    .first<{ id: number; email: string; verified: number; verify_token: string | null; access_token: string | null; join_code: string | null }>();

  const verifyToken = crypto.randomUUID();
  const siteUrl = c.env.SITE_URL || 'https://cooktwo.app';

  if (existing) {
    if (existing.verified) {
      return c.json({ status: 'already_verified', message: "You're already verified! Check your inbox for the access link." });
    }
    if (joinCode && !existing.join_code) {
      await c.env.DB.prepare('UPDATE waitlist SET verify_token = ?, join_code = ? WHERE id = ?')
        .bind(verifyToken, joinCode, existing.id)
        .run();
    } else {
      await c.env.DB.prepare('UPDATE waitlist SET verify_token = ? WHERE id = ?')
        .bind(verifyToken, existing.id)
        .run();
    }
  } else {
    if (joinCode) {
      await c.env.DB.prepare(
        'INSERT INTO waitlist (email, verify_token, join_code) VALUES (?, ?, ?)',
      )
        .bind(email, verifyToken, joinCode)
        .run();
    } else {
      await c.env.DB.prepare(
        'INSERT INTO waitlist (email, verify_token) VALUES (?, ?)',
      )
        .bind(email, verifyToken)
        .run();
    }
  }

  const verifyUrl = `${siteUrl}/api/waitlist/verify?token=${verifyToken}`;

  try {
    await sendVerificationEmail(c.env, email, verifyUrl);
  } catch (err) {
    console.error('Resend send failed:', err);
    return c.json({ error: 'Could not send verification email. Please try again later.' }, 500);
  }

  return c.json({ status: 'success', message: 'Check your inbox to confirm your email!' });
}

export async function handleVerify(c: Context<{ Bindings: Env }>): Promise<Response> {
  const token = c.req.query('token');
  if (!token) {
    return htmlResponse('Missing verification token. Please use the link from your email.', 400);
  }

  const row = await c.env.DB.prepare('SELECT * FROM waitlist WHERE verify_token = ?')
    .bind(token)
    .first<{ id: number; email: string; verified: number; access_token: string | null; join_code: string | null }>();

  if (!row) {
    return htmlResponse('This verification link is invalid or has expired.', 404);
  }

  const siteUrl = c.env.SITE_URL || 'https://cooktwo.app';
  const pwaUrl = c.env.PWA_URL || `${siteUrl}/PWA`;
  const joinSuffix = row.join_code ? `&join=${row.join_code}` : '';

  if (!row.verified) {
    const accessToken = crypto.randomUUID();
    await c.env.DB.prepare(
      `UPDATE waitlist SET verified = 1, access_token = ?, verified_at = datetime('now') WHERE id = ?`,
    )
      .bind(accessToken, row.id)
      .run();

    c.executionCtx.waitUntil(
      fetch('https://api.resend.com/events/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: 'user.signed_up',
          email: row.email,
          ...(row.join_code ? { payload: { joinCode: row.join_code } } : {}),
        }),
      }).catch((err) => console.error('Resend event emit failed:', err)),
    );

    return Response.redirect(`${pwaUrl}?access=${accessToken}${joinSuffix}`, 302);
  }

  if (!row.access_token) {
    const accessToken = crypto.randomUUID();
    await c.env.DB.prepare('UPDATE waitlist SET access_token = ? WHERE id = ?')
      .bind(accessToken, row.id)
      .run();
    return Response.redirect(`${pwaUrl}?access=${accessToken}${joinSuffix}`, 302);
  }

  return Response.redirect(`${pwaUrl}?access=${row.access_token}${joinSuffix}`, 302);
}

export async function handleValidateAccess(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : '';

  if (!accessToken) {
    return c.json({ valid: false }, 400);
  }

  const row = await c.env.DB.prepare(
    'SELECT email, verified FROM waitlist WHERE access_token = ? AND verified = 1',
  )
    .bind(accessToken)
    .first<{ email: string; verified: number }>();

  if (!row) {
    return c.json({ valid: false }, 401);
  }

  return c.json({ valid: true, email: row.email });
}

async function sendVerificationEmail(env: Env, to: string, verifyUrl: string): Promise<void> {
  const from = env.RESEND_FROM || 'CookTwo <onboarding@resend.dev>';

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAF6EE;font-family:Inter,system-ui,-apple-system,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="text-align:center;margin-bottom:36px;">
    <h1 style="color:#2C3E2D;font-size:26px;font-weight:700;margin:0 0 4px;">CookTwo</h1>
    <p style="color:#6B7B6C;font-size:14px;margin:0;">One dinner. Two plates. Zero arguments.</p>
  </div>
  <div style="background:#fff;border-radius:16px;padding:40px 32px;border:1px solid #E5E1DA;">
    <h2 style="color:#2C3E2D;font-size:20px;margin:0 0 12px;">Confirm your email</h2>
    <p style="color:#6B7B6C;font-size:15px;line-height:1.6;margin:0 0 28px;">
      You're one click away from accessing CookTwo. Tap the button below to confirm your email address and unlock the app.
    </p>
    <a href="${verifyUrl}" style="display:inline-block;background:#7A9E7E;color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-size:16px;font-weight:600;">
      Confirm &amp; Get Access
    </a>
    <p style="color:#6B7B6C;font-size:13px;margin:24px 0 0;">
      Or copy this link into your browser:<br/>
      <span style="color:#7A9E7E;word-break:break-all;">${verifyUrl}</span>
    </p>
  </div>
  <p style="color:#6B7B6C;font-size:12px;text-align:center;margin-top:28px;">
    If you didn't sign up for CookTwo, you can safely ignore this email.
  </p>
</div>
</body></html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Confirm your access to CookTwo',
      html,
      tags: [{ name: 'category', value: 'verification' }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API ${res.status}: ${text}`);
  }
}

function htmlResponse(message: string, status: number): Response {
  return new Response(
    `<!doctype html><html><body style="margin:0;padding:0;background:#FAF6EE;font-family:Inter,system-ui,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:80px 20px;text-align:center;">
<h1 style="color:#2C3E2D;font-size:22px;margin-bottom:12px;">CookTwo</h1>
<p style="color:#6B7B6C;font-size:16px;">${message}</p>
</div></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
