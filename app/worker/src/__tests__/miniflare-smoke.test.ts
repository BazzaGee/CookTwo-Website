import { Miniflare, Log, LogLevel } from 'miniflare';

let mf: Miniflare;

beforeAll(async () => {
  mf = new Miniflare({
    log: new Log(LogLevel.ERROR),
    workers: [
      {
        name: 'test',
        modules: true,
        script: 'export default { fetch() { return new Response("ok"); } }',
        d1Databases: { DB: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      },
    ],
  });
});

afterAll(async () => {
  await mf?.dispose();
});

describe('Miniflare smoke', () => {
  it('boots and responds', async () => {
    const res = await mf.dispatchFetch('http://localhost');
    expect(await res.text()).toBe('ok');
    expect(res.status).toBe(200);
  });

  it('D1 binding is available', async () => {
    const res = await mf.dispatchFetch('http://localhost/d1-test', {
      headers: { 'X-Test': 'd1' },
    });
    expect(res.status).toBe(200);
  });
});
