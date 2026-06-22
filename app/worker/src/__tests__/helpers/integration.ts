import { Miniflare, Log, LogLevel } from 'miniflare';
import app from '../../index';

export type { Env } from '../../env';

const BINDINGS = {
  AI_PROVIDER: 'deepseek',
  VAPID_PUBLIC_KEY: 'test-vapid-public',
  VAPID_PRIVATE_KEY: 'test-vapid-private',
  SITE_URL: 'http://localhost',
  PWA_URL: 'http://localhost/PWA',
  RESEND_FROM: 'test@test.com',
  DEEPSEEK_KEY: '',
};

export async function createTestMf(
  d1Persist?: string,
): Promise<{ mf: Miniflare; app: typeof app; env: Record<string, unknown> }> {
  const mf = new Miniflare({
    log: new Log(LogLevel.ERROR),
    workers: [
      {
        name: 'cfs-test',
        modules: true,
        script: `import app from './test-helper-bridge.ts'; export default app;`,
        modulesRules: [{ type: 'ESModule', include: ['**/*.ts'] }],
        bindings: BINDINGS,
        d1Databases: { DB: {} },
        durableObjects: {
          HOUSEHOLD_SYNC: { className: 'HouseholdSync' },
          INVITE_STORE: { className: 'InviteStore' },
        },
        compatibilityDate: '2025-01-01',
        compatibilityFlags: ['nodejs_compat'],
      },
    ],
  });

  await mf.ready;

  return { mf, app, env: {} as Record<string, unknown> };
}
