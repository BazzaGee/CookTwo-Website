// Cloudflare Pages Function — proxies /api/waitlist/* to the couples-food-system-api Worker.
// Lives in the project-root `functions/` folder (Cloudflare Pages convention for static sites).

const WORKER_BASE = 'https://couples-food-system-api.byte-digital.workers.dev';

function buildTarget(path, search) {
  const pathAfter = Array.isArray(path) ? path.join('/') : (path || '');
  const tail = pathAfter ? '/' + pathAfter : '';
  return WORKER_BASE + '/api/waitlist' + tail + (search || '');
}

async function proxy(context) {
  const { request, params, waitUntil } = context;
  const url = new URL(request.url);
  const target = buildTarget(params.path, url.search);

  const headers = new Headers(request.headers);
  headers.set('host', new URL(WORKER_BASE).host);
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ipcountry');
  headers.delete('cf-ray');
  headers.delete('cf-visitor');

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  let res;
  try {
    res = await fetch(target, init);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Upstream worker unreachable' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  const responseHeaders = new Headers(res.headers);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
        'access-control-allow-headers': 'content-type, authorization, x-timezone',
        'access-control-max-age': '86400',
      },
    });
  }
  return proxy(context);
}
