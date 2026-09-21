import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { P1CandidateResults } from '../client/src/components/ecr-pre-pilot/p1-candidate-panel';

it('shows automatic geometry prominently rather than treating the historical window failure as current', () => {
  const html = renderToStaticMarkup(React.createElement(P1CandidateResults, { run: {
    phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
    result: { status: 'NO_SECOND_ADEQUATE_DIAMETER' },
    automaticSelection: {
      status: 'AUTOMATIC_DISCRETE_KNEE_SELECTED', policy: { version: 'test-policy' },
      selected: { geometry: { columnDiameterM: .7, rotorDiameterM: .231, compartmentHeightM: .21, freeArea: .4 },
        trial: { rpm: 30 }, loading: .3877, minimumHoldupGap: .1, minimumInterfacialAreaM2M3: 30 },
      references: [],
    },
  } }));
  expect(html).toContain('Current automatic Stage 3 result');
  expect(html).toContain('Column D 0.7 m');
  expect(html).toContain('Stage 4 HETS uses this exact automatic geometry');
  expect(html).toContain('No manual selection or approval is required');
  expect(html.indexOf('Current automatic')).toBeLessThan(html.indexOf('Historical engine result'));
  expect(html).toContain('not downstream selection');
});