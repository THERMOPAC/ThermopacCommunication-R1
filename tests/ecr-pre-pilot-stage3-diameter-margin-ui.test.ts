import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ run: null as any, index: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (initial: unknown) => [state.index++ === 0 ? state.run : initial, vi.fn()],
    useEffect: vi.fn(),
  };
});

import { Stage3Stage4OptimizerPanel } from '../client/src/components/ecr-pre-pilot/stage3-stage4-optimizer-panel';

describe('Stage 3 diameter margin unavailable states', () => {
  it.each([null, 0.5])('does not render an unavailable selected diameter as zero (smallest=%s)', (smallest) => {
    state.index = 0;
    state.run = {
      status: 'NO_SECOND_ADEQUATE_DIAMETER',
      selectedGeometry: null,
      selectedRpm: null,
      selectionRationale: {
        diameterSelection: {
          SMALLEST_ACCEPTED_ADEQUATE_DIAMETER: smallest,
          SELECTED_NEXT_SMALLEST_ACCEPTED_DIAMETER: null,
          status: 'INSUFFICIENT_ACCEPTED_ADEQUATE_DIAMETERS',
        },
        usefulWindowPreference: { minimumWindowWidthRpm: 20, adequateGeometryCount: smallest ? 1 : 0 },
      },
    };
    const html = renderToStaticMarkup(React.createElement(Stage3Stage4OptimizerPanel, { designId: 269 }));
    expect(html).toContain('No selection: fewer than two distinct accepted adequate diameters');
    expect(html).toContain('Selected next-smallest accepted diameter');
    expect(html).toContain('— m');
    expect(html).not.toContain('0.000 m');
    if (smallest !== null) expect(html).toContain('0.500 m');
    expect(html).toContain('20.0 rpm minimum (fixed)');
    expect(html).not.toContain('<input');
  });
});