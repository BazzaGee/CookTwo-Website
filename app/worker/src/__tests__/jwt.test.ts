import { describe, it, expect, beforeEach } from 'vitest';
import { signToken, verifyToken } from '../lib/jwt';

const SECRET = 'test-secret-key-12345';
const claims = {
  householdId: 'hh-1',
  partnerId: 'p-1',
  slot: 1 as const,
  displayName: 'Test User',
  inviteCode: '123456',
};

describe('JWT', () => {
  it('signs and verifies a token roundtrip', async () => {
    const token = await signToken(SECRET, claims);
    const decoded = await verifyToken(SECRET, token);
    expect(decoded.householdId).toBe('hh-1');
    expect(decoded.partnerId).toBe('p-1');
    expect(decoded.slot).toBe(1);
    expect(decoded.displayName).toBe('Test User');
    expect(decoded.inviteCode).toBe('123456');
  });

  it('rejects a tampered token', async () => {
    const token = await signToken(SECRET, claims);
    const parts = token.split('.');
    const tampered = parts[0] + '.' + parts[1] + '.invalidsignature';
    await expect(verifyToken(SECRET, tampered)).rejects.toThrow();
  });

  it('rejects token signed with wrong secret', async () => {
    const token = await signToken('other-secret', claims);
    await expect(verifyToken(SECRET, token)).rejects.toThrow();
  });

  it('rejects token with different householdId in WS verify', async () => {
    const token = await signToken(SECRET, { ...claims, householdId: 'hh-2' });
    const decoded = await verifyToken(SECRET, token);
    expect(decoded.householdId).toBe('hh-2');
  });

  it('returns claims for valid token with correct household', async () => {
    const token = await signToken(SECRET, claims);
    const decoded = await verifyToken(SECRET, token);
    expect(decoded.householdId).toBe(claims.householdId);
  });
});
