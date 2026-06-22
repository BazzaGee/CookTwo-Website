import { SignJWT, jwtVerify } from 'jose';

export type PartnerSlot = 1 | 2;

export interface TokenClaims {
  householdId: string;
  partnerId: string;
  slot: PartnerSlot;
  displayName: string;
  inviteCode?: string;
}

const ALG = 'HS256';
const ISSUER = 'couples-food-system';
const AUDIENCE = 'couples-food-system';
const TTL_SECONDS = 60 * 60 * 24 * 30;

function getSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signToken(secret: string, claims: TokenClaims): Promise<string> {
  return new SignJWT({
    householdId: claims.householdId,
    partnerId: claims.partnerId,
    slot: claims.slot,
    displayName: claims.displayName,
    inviteCode: claims.inviteCode,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecret(secret));
}

export async function verifyToken(secret: string, token: string): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, getSecret(secret), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (
    typeof payload.householdId !== 'string' ||
    typeof payload.partnerId !== 'string' ||
    (payload.slot !== 1 && payload.slot !== 2) ||
    typeof payload.displayName !== 'string'
  ) {
    throw new Error('invalid token claims');
  }
  return {
    householdId: payload.householdId,
    partnerId: payload.partnerId,
    slot: payload.slot,
    displayName: payload.displayName,
    inviteCode: typeof payload.inviteCode === 'string' ? payload.inviteCode : undefined,
  };
}

export async function readBearer(secret: string, request: Request): Promise<TokenClaims | null> {
  const auth = request.headers.get('Authorization') ?? request.headers.get('authorization');
  if (!auth) return null;
  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    return await verifyToken(secret, token);
  } catch {
    return null;
  }
}
