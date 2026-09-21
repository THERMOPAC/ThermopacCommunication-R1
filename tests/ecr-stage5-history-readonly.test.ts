import { afterAll, describe, expect, it, vi } from 'vitest';

// Explicitly opt-in: real read-only database service, isolated route handlers.
// Production authentication is not changed; this test injects a session only.
vi.mock('../server/auth-middleware', () => ({
  ensureAuthenticated: (req: any, res: any, next: () => void) =>
    req.user ? next() : res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' }),
}));

describe.skipIf(process.env.STAGE5_REAL_READONLY !== '1')('actual design 269 history', () => {
  let pool: any;
  afterAll(async () => { await pool?.end(); });
  it('serves lean metadata through the exact summary route with owner enforcement', async () => {
    pool = (await import('../server/db')).pool;
    const { setupStage5GeometryRoutes } = await import('../server/ecr-pre-pilot/stage5-geometry-routes');
    const routes: { path: string; handlers: any[] }[] = [];
    setupStage5GeometryRoutes({
      get: (path: string, ...handlers: any[]) => routes.push({ path, handlers }),
      post: () => {},
    } as any);
    const url = new URL('http://test/api/ecr-pre-pilot/designs/269/stage5/revisions?payload=summary');
    const route = routes.find(row => row.path.replace(':id', '269') === url.pathname)!;
    expect(route).toBeDefined();
    const request = async (user: any, design = '269') => {
      const res: any = { statusCode: 200, setHeader: () => {} };
      res.status = (status: number) => { res.statusCode = status; return res; };
      res.json = (body: any) => { res.body = body; return res; };
      const req = { user, params: { id: design }, query: Object.fromEntries(url.searchParams) };
      await route.handlers[0](req, res, () => route.handlers[1](req, res));
      return res;
    };
    const start = performance.now();
    const response = await request({ id: 3 });
    const elapsedMs = Math.round(performance.now() - start);
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveLength(5);
    const bytes = Buffer.byteLength(JSON.stringify(response.body));
    expect(bytes).toBeLessThan(10000);
    expect(elapsedMs).toBeLessThan(5000);
    for (const row of response.body) {
      expect(row.integrity).toBe('NOT_VERIFIED_METADATA_ONLY');
      expect(row).not.toHaveProperty('sourceStage3');
      expect(row).not.toHaveProperty('drawings');
      expect(row).not.toHaveProperty('currentness');
    }
    expect((await request(null)).statusCode).toBe(401);
    expect((await request({ id: 2147483647 })).statusCode).toBe(404);
    expect((await request({ id: 3 }, '2147483647')).statusCode).toBe(404);
    console.info(JSON.stringify({ designId: 269, revisions: response.body.length, bytes, elapsedMs }));
  }, 30000);
});