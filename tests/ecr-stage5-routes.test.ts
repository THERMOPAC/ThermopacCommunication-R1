import { beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ auth: vi.fn(), basis: vi.fn(), revisions: vi.fn(), preview: vi.fn(), save: vi.fn(), pdf: vi.fn(), dataPdf: vi.fn() }));
vi.mock('../server/auth-middleware', () => ({ ensureAuthenticated: calls.auth }));
vi.mock('../server/ecr-pre-pilot/stage5-geometry-service', () => ({
  getStage5Basis: calls.basis, getStage5Revisions: calls.revisions, previewStage5: calls.preview,
  saveStage5Revision: calls.save, STAGE5_VIEWS: ['ga', 'section', 'compartment', 'rotor', 'stator'],
  Stage5Error: class extends Error { constructor(message: string, public status = 409) { super(message); } },
}));
vi.mock('../server/ecr-pre-pilot/stage5-geometry-report', () => ({ createStage5Pdf: calls.pdf }));
vi.mock('../server/ecr-pre-pilot/stage5-design-data-report', () => ({ createStage5DesignDataPdf: calls.dataPdf }));
import { setupStage5GeometryRoutes } from '../server/ecr-pre-pilot/stage5-geometry-routes';
import { Stage5Error } from '../server/ecr-pre-pilot/stage5-geometry-service';
let routes: { method: string; path: string; middleware: any[] }[];
beforeEach(() => {
  vi.clearAllMocks(); routes = [];
  const app = Object.fromEntries(['get', 'post'].map(method => [method, (path: string, ...middleware: any[]) => routes.push({ method, path, middleware })]));
  setupStage5GeometryRoutes(app as any);
});
async function request(suffix: string, method = 'get', overrides: any = {}) {
  const route = routes.find(r => r.path.endsWith(suffix) && r.method === method)!;
  const response: any = { statusCode: 200, headers: {} };
  response.status = (n: number) => { response.statusCode = n; return response; };
  response.json = response.send = (body: any) => { response.body = body; return response; };
  response.setHeader = (key: string, value: any) => { response.headers[key] = value; };
  response.type = (value: string) => { response.contentType = value; return response; };
  await route.middleware.at(-1)({ user: { id: 12 }, params: { id: '23', revisionId: '1' }, query: {}, body: {}, ...overrides }, response);
  return response;
}
describe('Stage 5 HTTP boundary', () => {
  it('protects all eight endpoints and exposes no mutation of existing revisions', () => {
    expect(routes).toHaveLength(8);
    expect(routes.every(r => r.middleware[0] === calls.auth)).toBe(true);
    expect(routes.filter(r => r.method === 'post').map(r => r.path.split('/').at(-1))).toEqual(['preview', 'revisions']);
  });
  it('rejects invalid identifiers and unauthenticated handler access', async () => {
    expect((await request('/basis', 'get', { user: null })).statusCode).toBe(401);
    expect((await request('/basis', 'get', { params: { id: '-1' } })).statusCode).toBe(400);
    expect(calls.basis).not.toHaveBeenCalled();
  });
  it('scopes PDF and SVG exports to owner and rejects missing ownership', async () => {
    calls.revisions.mockRejectedValue(new Stage5Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND', 404));
    expect((await request('/export.pdf')).statusCode).toBe(404);
    expect((await request('/export.svg')).statusCode).toBe(404);
    expect((await request('/design-data.pdf')).statusCode).toBe(404);
    expect(calls.revisions).toHaveBeenCalledWith(12, 23, '1');
    expect(calls.pdf).not.toHaveBeenCalled();
  });
  it('exports frozen SVG and dynamic currentness metadata', async () => {
    calls.revisions.mockResolvedValue([{ revision: 2, currentness: 'OUTDATED', drawings: { ga: '<svg>frozen</svg>' } }]);
    const result = await request('/export.svg');
    expect(result.body).toBe('<svg>frozen</svg>');
    expect(result.headers['X-Stage5-Currentness']).toBe('OUTDATED');
    expect(result.headers['Cache-Control']).toBe('private, no-store');
    expect(calls.preview).not.toHaveBeenCalled();
  });
  it('rejects unrecognized SVG view before any read', async () => {
    expect((await request('/export.svg', 'get', { query: { view: '../x' } })).statusCode).toBe(400);
    expect(calls.revisions).not.toHaveBeenCalled();
  });
  it('downloads owned saved Design Data with attachment metadata and no regeneration', async () => {
    const revision = { revision: 4, currentness: 'OUTDATED', geometry: { r1Model: {} } };
    calls.revisions.mockResolvedValue([revision]);
    calls.dataPdf.mockResolvedValue(Buffer.from('%PDF-fixture'));
    const result = await request('/design-data.pdf');
    expect(result.contentType).toBe('application/pdf');
    expect(result.headers['Content-Disposition']).toContain('stage5-r4-design-data.pdf');
    expect(result.headers['X-Stage5-Currentness']).toBe('OUTDATED');
    expect(calls.dataPdf).toHaveBeenCalledWith(revision, 23);
    expect(calls.preview).not.toHaveBeenCalled();
    expect(calls.save).not.toHaveBeenCalled();
  });
  it('does not invent R1 geometry for a legacy revision', async () => {
    calls.revisions.mockResolvedValue([{ geometry: {} }]);
    expect((await request('/design-data.pdf')).statusCode).toBe(409);
    expect(calls.dataPdf).not.toHaveBeenCalled();
  });
  it('rejects manual geometry and upstream overrides for preview and save', async () => {
    for (const body of [{ inputs: {} }, { basis: {} }, { shaftDiameterM: .1 }, { geometry: {} }]) {
      expect((await request('/preview', 'post', { body })).statusCode).toBe(400);
      expect((await request('/revisions', 'post', { body })).statusCode).toBe(400);
    }
    expect(calls.preview).not.toHaveBeenCalled();
    expect(calls.save).not.toHaveBeenCalled();
  });
  it('passes no engineering inputs for automatic preview and source-bound save', async () => {
    calls.preview.mockResolvedValue({ complete: true });
    await request('/preview', 'post', { body: {} });
    expect(calls.preview).toHaveBeenCalledWith(12, 23);
    await request('/revisions', 'post', { body: { expectedSourceHash: 'hash' } });
    expect(calls.save).toHaveBeenCalledWith(12, 23, undefined, 'hash', undefined);
  });
});