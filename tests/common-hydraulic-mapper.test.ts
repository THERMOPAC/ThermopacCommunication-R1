import { describe, expect, it } from 'vitest';

import { mapWorkspaceProcessDesignInputs } from '../server/llx-process-design-input-mapper';

describe('Common Hydraulic Design workspace adapter', () => {
  it('strips stale packing pressure-drop inputs for ECR-selected revisions', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      technology: 'ecr',
      pressureDropBasis: {
        packingSpecificSurface: {
          value: 250,
          sourceType: 'Literature',
          sourceReference: 'Stale packing basis',
        },
      },
      packing_specific_surface_value: '250',
      packing_specific_surface_source_type: 'Literature',
      packing_specific_surface_source_ref: 'Stale packing basis',
      packing_corrugation_angle_value: '45',
      packing_corrugation_angle_source_type: 'Literature',
      packing_corrugation_angle_source_ref: 'Stale angle basis',
      vendor_dp_value: '120',
      vendor_dp_source_type: 'Vendor',
      vendor_dp_source_ref: 'Stale vendor pressure drop',
    }, 'hydraulics_common');

    expect(mapped.pressureDropBasis).toBeUndefined();
    expect(mapped.packing_specific_surface_value).toBeUndefined();
    expect(mapped.packing_corrugation_angle_value).toBeUndefined();
    expect(mapped.vendor_dp_value).toBeUndefined();
  });

  it('keeps the generic packing pressure-drop option available when ECR is not selected', () => {
    const mapped = mapWorkspaceProcessDesignInputs({
      packing_specific_surface_value: '250',
      packing_specific_surface_source_type: 'Literature',
      packing_specific_surface_source_ref: 'Controlled packing basis',
      packing_corrugation_angle_value: '45',
      packing_corrugation_angle_source_type: 'Literature',
      packing_corrugation_angle_source_ref: 'Controlled angle basis',
    }, 'hydraulics_common');

    expect(mapped.pressureDropBasis).toMatchObject({
      packingSpecificSurface: {
        value: 250,
        sourceType: 'Literature',
        sourceReference: 'Controlled packing basis',
      },
    });
  });
});