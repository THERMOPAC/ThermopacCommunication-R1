import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { buildStage4MixingAudit } from '../server/ecr-pre-pilot/stage4-mixing-audit';
import Panel from '../client/src/components/ecr-pre-pilot/stage4-pre-pilot-sizing-panel';

const state = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => [
    state.index < state.values.length ? state.values[state.index++] : initial, vi.fn(),
  ] };
});

it('renders the current mixing dependency and distinguishes an Ed assumption from physical sizing', () => {
  const mixingAudit = buildStage4MixingAudit({
    selected: { columnDiameterM: 1, rotorDiameterM: 0.5, rpm: 30, d32M: 0.003 },
    operating: { operatingHoldup: 0.1, continuousSuperficialVelocityMS: 0.001, dispersedSuperficialVelocityMS: 0.002 },
  });
  state.index = 0;
  state.values = [{
    status: 'DEPENDENCY_BLOCKED', mixingAudit,
    overallEfficiency: { status: 'DEPENDENCY_BLOCKED', value: null },
    mainOutputs: { diameterM: 1, overallEfficiency: null, physicalCompartments: null, activeHeightM: null },
  }, null, false];
  const html = renderToStaticMarkup(React.createElement(Panel, { designId: 269 }));
  expect(html).toContain('stage4-mixing-audit');
  expect(html).toContain('STAGE4_CONTINUOUS_MIXING_PROPERTIES_REQUIRED');
  expect(html).toContain('Kumar–Hartland continuous-phase axial-dispersion expression');
  expect(html).toContain('Dispersed E_d (screening assumption)');
  expect(html).toContain('No transfer solution or physical sizing is claimed');
  expect(html).toContain('PRE-PILOT PREDICTIVE / SCREENING');
  expect(html).not.toContain('NaN');
});