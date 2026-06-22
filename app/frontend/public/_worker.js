export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const response = await env.ASSETS.fetch(request);

    if (response.status !== 404) {
      return response;
    }

    if (request.method === 'GET' && (request.headers.get('Accept') || '').includes('text/html')) {
      return env.ASSETS.fetch(new URL('/index.html', request.url));
    }

    return response;
  },
};
