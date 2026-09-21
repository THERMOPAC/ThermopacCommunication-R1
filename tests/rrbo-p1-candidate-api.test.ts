import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ start: vi.fn(), list: vi.fn(), basis: vi.fn(), auth: vi.fn() }));
vi.mock('../server/auth-middleware', () => ({ ensureAuthenticated: mocks.auth }));
vi.mock('../server/ecr-pre-pilot/p1-candidate-service', () => ({
  startP1Candidate: mocks.start, getP1Candidates: mocks.list, getP1CandidateBasis: mocks.basis,
}));
import { setupP1CandidateRoutes } from '../server/ecr-pre-pilot/p1-candidate-routes';
const root = '/api/ecr-pre-pilot/designs/:id/stage3-p1-candidates';
let handlers: Map<string, any[]>;
beforeEach(() => {
  vi.resetAllMocks();
  handlers = new Map();
  setupP1CandidateRoutes({
    get: (path: string, ...middleware: any[]) => handlers.set(`GET ${path}`, middleware),
    post: (path: string, ...middleware: any[]) => handlers.set(`POST ${path}`, middleware),
  } as any);
});
async function invoke(method: string, suffix = '', request: any = {}) {
  const middleware = handlers.get(`${method} ${root}${suffix}`)!;
  expect(middleware[0]).toBe(mocks.auth);
  const res: any = { statusCode: 200, status: vi.fn(function (code) { res.statusCode = code; return res; }), json: vi.fn(value => { res.body = value; return res; }) };
  await middleware[1]({ params: { id: '12', candidateId: suffix === '/:candidateId' ? 'candidate' : undefined }, user: { id: 7 }, body: {}, ...request }, res);
  return res;
}
describe('actual P1 HTTP handlers with mocked storage service', () => {
  it('dispatches explicit candidate requests asynchronously and forwards the authenticated owner', async () => {
    mocks.start.mockResolvedValue({ id: 'candidate', status: 'running', candidateOnly: true });
    const body = { sourceSnapshotHash: 'source' };
    const res = await invoke('POST', '', { body });
    expect(res.statusCode).toBe(202);
    expect(mocks.start).toHaveBeenCalledWith(7, 12, body);
    expect(res.body.candidateOnly).toBe(true);
  });
  it('restores persisted list and complete detail without recalculating', async () => {
    const row = { id: 'candidate', status: 'completed', result: { status: 'NO_SECOND_DIAMETER', scenarios: [1, 2, 3, 4, 5, 6] } };
    mocks.list.mockResolvedValue([row]);
    expect((await invoke('GET')).body).toEqual([{ id: 'candidate', status: 'completed', resultStatus: 'NO_SECOND_DIAMETER' }]);
    expect((await invoke('GET', '/:candidateId')).body).toEqual(row);
    expect(mocks.list).toHaveBeenLastCalledWith(7, 12, 'candidate');
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it('returns not-found for cross-design/missing candidate and rejects invalid design IDs', async () => {
    mocks.list.mockResolvedValue([]);
    expect((await invoke('GET', '/:candidateId')).statusCode).toBe(404);
    mocks.start.mockRejectedValue(new Error('ECR_PRE_PILOT_DESIGN_NOT_FOUND'));
    expect((await invoke('POST')).statusCode).toBe(404);
    mocks.start.mockClear();
    expect((await invoke('POST', '', { params: { id: '-1' } })).statusCode).toBe(400);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it('returns 409 for nonblocking submission-lock contention', async () => {
    mocks.start.mockRejectedValue(new Error('P1_CANDIDATE_ALREADY_RUNNING'));
    expect((await invoke('POST')).statusCode).toBe(409);
  });
});