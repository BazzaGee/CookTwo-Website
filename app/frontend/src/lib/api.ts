const DEFAULT_API_URL = 'http://localhost:8787';

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL?.replace(/\/$/, '') || DEFAULT_API_URL;
}

export function getWsBaseUrl(): string {
  return import.meta.env.VITE_WS_URL || getApiBaseUrl().replace(/^http/, 'ws');
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  token?: string | null;
}

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, token, headers, ...rest } = options;
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  let tz: string;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    tz = 'UTC';
  }

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    'X-Timezone': tz,
    ...(headers as Record<string, string> | undefined),
  };
  if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (token) {
    finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const code =
      typeof parsed === 'object' && parsed && 'code' in parsed
        ? String((parsed as { code: unknown }).code)
        : undefined;
    const message =
      typeof parsed === 'object' && parsed && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : `Request failed: ${res.status}`;
    const err = new ApiError(res.status, parsed, message);
    if (code) (err as ApiError & { code?: string }).code = code;
    throw err;
  }

  return parsed as T;
}
