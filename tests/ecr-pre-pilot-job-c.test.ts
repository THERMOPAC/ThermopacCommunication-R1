import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  JOB_C_COMPONENT_ORDER,
  JOB_C_PRELIMINARY_SENSITIVITY_BASIS,
  jobCResultHash,
} from '../server/ecr-pre-pilot/job-c';

describe('ECR pre-pilot Job C governed numerical basis', () => {
  it('pins component order, sensitivity values, and numerical-only height bounds', () => {
    expect(JOB_C_COMPONENT_ORDER).toEqual(
      ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
    );
    expect(JOB_C_PRELIMINARY_SENSITIVITY_BASIS).toMatchObject({
      axialDispersionContinuousM2S: { nominal: 0.010, minimum: 0.003, maximum: 0.030 },
      axialDispersionDispersedM2S: { nominal: 0.0010, minimum: 0.0003, maximum: 0.0030 },
      activeHeightSearchM: { minimum: 2, maximum: 20, use: 'NUMERICAL_SEARCH_ONLY' },
    });
  });

  it('produces deterministic hashes and excludes its own result field', () => {
    const body = { status: 'CALCULATED_PRELIMINARY_JOB_C', value: 2.0 };
    const hash = jobCResultHash(body);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(jobCResultHash({ ...body, resultSha256: 'ignored' })).toBe(hash);
    expect(jobCResultHash({ ...body, value: 2.1 })).not.toBe(hash);
  });

  it('pins the candidate equations and exact Job-B fail-closed qualification', () => {
    const candidate = readFileSync(
      'server/ecr-pre-pilot/job-c/candidate_interface.py', 'utf8',
    );
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    expect(candidate).toContain('raw_c=self.kcct*(xb_c-xi_c)');
    expect(candidate).toContain('jc=raw_c-xi_c*self.np.sum(raw_c)');
    expect(candidate).toContain('self.np.r_[mu,delta[:6]/self.scale[:6]]');
    expect(candidate).toContain('CANDIDATE_ONLY_NO_STABILITY_CLAIM');
    expect(candidate).toContain('"WARM_FAST_PATH"');
    expect(candidate).toContain('self.fallback_count+=1');
    expect(candidate).toContain('"fallbackCount":self.fallback_count');
    expect(worker).toContain('BLOCKED_EXACT_QUALIFICATION_FAILED');
    expect(worker).toContain('method="anderson"');
    expect(worker).toContain('fullResponseSha256');
    expect(worker).toContain('EXACT_JOB_B_{len(cells)}_OF_{len(cells)}_QUALIFIED');
    expect(worker).toContain('balance_tolerance/aV');
  });

  it('solves and qualifies the exact height reported after bisection', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    expect(worker).toContain('final_height=(lo+hi)/2');
    expect(worker).toContain('selected=solve_height(final_height,accepted_by_height[nearest])');
    expect(worker).toContain('"profileSolvedHeightM":selected["height"]');
    expect(worker).toContain('selected.get("profileSolvedHeightM") != height');
    expect(worker).toContain('"profileStateSha256":digest([selected["state"][0],selected["state"][1]])');
    expect(worker).toContain('digest(qualified_state) != selected.get("profileStateSha256")');
    expect(worker).toContain('dz=height/r["compartments"]');
  });
});