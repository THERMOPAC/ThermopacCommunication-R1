import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { P1CandidateResults, P1CandidatePanel } from '../client/src/components/ecr-pre-pilot/p1-candidate-panel';
import { KuhniHydrodynamicsCard } from '../client/src/components/ecr-pre-pilot/kuhni-hydrodynamics-card';

describe('P1 candidate display independently of selection', () => {
  it('renders exactly one Run Stage 3 action across the full card hierarchy', () => {
    const html = renderToStaticMarkup(React.createElement(KuhniHydrodynamicsCard, {
      designId: null, thermodynamicDependency: null, thermodynamicDependencyReady: false,
    }));
    expect(html.match(/Run Stage 3/g)).toHaveLength(1);
    expect(html).not.toContain('Run current optimizer');
    expect(html).not.toContain('Run Stage 3/4 optimizer');
    expect(html).not.toContain('Calculate P1 candidate');
    expect(html).toContain('Frozen historical authority');
  });
  it('shows feasible diameters, fixed geometry, RPM, six scenarios and rejection diagnostics without a selected geometry', () => {
    const scenarios = [0.36, 0.42, 0.43].flatMap(coefficient => ['BARRY_PARLANGE_MOBILE', 'SCHILLER_NAUMANN_IMMOBILE'].map(interfaceScenario => ({
      coefficient, interfaceScenario, operatingHoldup: .05, floodHoldup: .2, interfacialAreaM2M3: 30, loading: .6,
    })));
    const html = renderToStaticMarkup(React.createElement(P1CandidateResults, { run: {
      id: 'candidate', phaseConfiguration: 'rrbo-continuous-nmp-dispersed', sourceSnapshotHash: 'saved-source', propertyTemperatureC: 40, candidateOnly: true,
      result: { status: 'NO_SECOND_DIAMETER', selectedGeometry: null, blockers: ['INSUFFICIENT_ACCEPTED_ADEQUATE_DIAMETERS'],
        orientationComparison: [{ orientation: 'rrbo-continuous-nmp-dispersed', geometryGrid: [
          { geometry: { columnDiameterM: .8, compartmentHeightM: .24, hcToColumn: .3, rotorDiameterM: .264, rotorToColumn: .33, freeArea: .3 },
            operatingWindow: { rpmMin: 30, rpmMax: 35, widthRpm: 5 },
            trials: [{ rpm: 30, status: 'FEASIBLE', reasons: [], hydraulicMethod: { scenarios } }, { rpm: 40, status: 'REJECTED', reasons: ['LOADING_EXCEEDED'] }] },
        ] }],
      },
    } }));
    expect(html).toContain('Legacy engine selected no geometry');
    expect(html).toContain('0.264');
    expect(html).toContain('LOADING_EXCEEDED');
    expect(html).toContain('φ operating');
    expect(html).toContain('φ flood');
    expect(html.match(/<td class="p-1">BARRY_PARLANGE_MOBILE/g)).toHaveLength(3);
    expect(html.match(/<td class="p-1">SCHILLER_NAUMANN_IMMOBILE/g)).toHaveLength(3);
  });
  it('uses saved Stage 1 phase and displays candidate-only qualifications', () => {
    const html = renderToStaticMarkup(React.createElement(P1CandidatePanel, { designId: null, refreshToken: 0 }));
    expect(html).not.toContain('Choose candidate phase');
    expect(html).toContain('Phase and properties come only from Saved Stage 1');
    expect(html.match(/Run Stage 3/g)).toHaveLength(1);
    expect(html).toContain('waiting for an explicit, valid saved phase');
    expect(html).toContain('UNKNOWN');
    expect(html).toContain('disabled');
  });
});