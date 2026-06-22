import type { PushProvider, PushSubscription, PushPayload } from './push-provider';

function base64urlToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function createVapidJwt(
  privateKey: string,
  audience: string,
  subject: string,
): Promise<string> {
  const encoder = new TextEncoder();

  const keyBytes = base64urlToUint8Array(privateKey);

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const header = uint8ArrayToBase64(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 12 * 60 * 60;
  const payload = uint8ArrayToBase64(encoder.encode(JSON.stringify({ aud: audience, exp, sub: subject })))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    encoder.encode(signInput),
  );

  const sigBase64 = uint8ArrayToBase64(new Uint8Array(signature))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${signInput}.${sigBase64}`;
}

async function encryptPayload(
  payload: string,
  p256dh: string,
  auth: string,
): Promise<{ encrypted: Uint8Array; salt: string; serverPublicKey: string }> {
  const encoder = new TextEncoder();

  const subscriberKeyBytes = base64urlToUint8Array(p256dh);
  const subscriberKey = await crypto.subtle.importKey(
    'raw',
    subscriberKeyBytes.buffer as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const authBytes = base64urlToUint8Array(auth);

  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  ) as CryptoKeyPair;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberKey } as any,
    ephemeralKeyPair.privateKey,
    256,
  );

  const rawEphemeralPublicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey) as ArrayBuffer,
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const ikm = concatUint8Arrays(new Uint8Array(sharedSecret), authBytes);

  const prkKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const prk = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('Content-Encoding: aes128gcm\0') },
      prkKey,
      256,
    ),
  );

  const context = buildContext(rawEphemeralPublicKey);

  const cekKey = await crypto.subtle.importKey('raw', prk, 'HKDF', false, ['deriveBits']);
  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: concatUint8Arrays(encoder.encode('Content-Encoding: aes128gcm\0'), context) },
      cekKey,
      256,
    ),
  );

  const nonceKey = await crypto.subtle.importKey('raw', prk, 'HKDF', false, ['deriveBits']);
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: concatUint8Arrays(encoder.encode('Content-Encoding: nonce\0'), context) },
      nonceKey,
      96,
    ),
  );

  const plaintext = concatUint8Arrays(encoder.encode(payload), new Uint8Array([2]));

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext),
  );

  return {
    encrypted,
    salt: uint8ArrayToBase64(salt).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    serverPublicKey: uint8ArrayToBase64(rawEphemeralPublicKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  };
}

function buildContext(clientPublicKey: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const label = encoder.encode('P-256\0');
  const lenBuf = new Uint8Array(2);
  new DataView(lenBuf.buffer).setUint16(0, clientPublicKey.length);
  return concatUint8Arrays(label, lenBuf, clientPublicKey);
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

export class WebPushProvider implements PushProvider {
  readonly name = 'web-push';

  constructor(
    private vapidPublicKey: string,
    private vapidPrivateKey: string,
    private vapidSubject: string = 'mailto:cfs-app@example.com',
  ) {}

  async send(sub: PushSubscription, payload: PushPayload): Promise<boolean> {
    try {
      const audience = new URL(sub.endpoint).origin;
      const jwt = await createVapidJwt(this.vapidPrivateKey, audience, this.vapidSubject);

      const payloadStr = JSON.stringify(payload);
      const { encrypted, salt, serverPublicKey } = await encryptPayload(
        payloadStr,
        sub.p256dh,
        sub.auth,
      );

      const response = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Encoding': 'aes128gcm',
          'TTL': '86400',
          'Authorization': `vapid t=${jwt}, k=${this.vapidPublicKey}`,
          'Crypto-Key': `dh=${serverPublicKey}`,
        },
        body: encrypted,
      });

      return response.status >= 200 && response.status <= 299;
    } catch (err) {
      console.error('WebPush send failed:', err);
      return false;
    }
  }
}
