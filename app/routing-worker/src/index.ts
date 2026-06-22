/**
 * CookTwo Routing Worker
 *
 * Sits in front of cooktwo.app and routes traffic:
 *   /PWA/*     → PWA Pages project (React app)
 *   /api/*     → API Worker (Hono backend)
 *   everything else → Astro Pages project (marketing site)
 *
 * The /PWA prefix is stripped before proxying so the PWA Pages
 * project serves from root while the browser sees /PWA paths.
 */

interface Env {
  ASTRO_PAGES_URL: string;
  PWA_PAGES_URL: string;
  API_WORKER_URL: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/PWA' || path.startsWith('/PWA/')) {
      return proxyTo(env.PWA_PAGES_URL, request, url, '/PWA');
    }

    if (path.startsWith('/api/')) {
      return proxyTo(env.API_WORKER_URL, request, url, '');
    }

    return proxyTo(env.ASTRO_PAGES_URL, request, url, '');
  },
};

async function proxyTo(
  targetBase: string,
  originalRequest: Request,
  originalUrl: URL,
  stripPrefix: string,
): Promise<Response> {
  let targetPath = originalUrl.pathname;

  if (stripPrefix && targetPath.startsWith(stripPrefix)) {
    targetPath = targetPath.slice(stripPrefix.length) || '/';
  }

  const targetUrl = `${targetBase}${targetPath}${originalUrl.search}`;

  const proxyReq = new Request(targetUrl, originalRequest);

  const response = await fetch(proxyReq);

  const newResponse = new Response(response.body, response);
  newResponse.headers.set('X-Proxied-By', 'cooktwo-router');
  return newResponse;
}
