// One-off: create CPS Knowledge Engine tables in dev and seed confirmed values.
import { pool } from '../server/db';

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cps_knowledge_parameters (
      id SERIAL PRIMARY KEY,
      category VARCHAR(40) NOT NULL,
      parameter_name VARCHAR(200) NOT NULL,
      parameter_code VARCHAR(60) NOT NULL,
      symbol VARCHAR(40),
      parameter_type VARCHAR(30) NOT NULL,
      value NUMERIC,
      unit VARCHAR(40),
      description TEXT,
      engineering_notes TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_by INTEGER NOT NULL REFERENCES users(id),
      CONSTRAINT cps_kparams_category_chk CHECK (category IN ('media_column', 'material_properties', 'heating_cooling', 'process_cutoff', 'process_times', 'regeneration_recovery', 'standard_equipment', 'regen_offgas_tox', 'sulphur_breakthrough_model')),
      CONSTRAINT cps_kparams_type_chk CHECK (parameter_type IN ('performance', 'physical_constant', 'process_threshold', 'process_time', 'equipment_standard', 'calibrated_model_constant'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS cps_kparams_code_uniq ON cps_knowledge_parameters (parameter_code);
    CREATE INDEX IF NOT EXISTS cps_kparams_category_idx ON cps_knowledge_parameters (category);

    CREATE TABLE IF NOT EXISTS cps_knowledge_parameter_history (
      id SERIAL PRIMARY KEY,
      parameter_id INTEGER NOT NULL REFERENCES cps_knowledge_parameters(id),
      parameter_code VARCHAR(60) NOT NULL,
      old_value NUMERIC,
      new_value NUMERIC,
      changed_by INTEGER NOT NULL REFERENCES users(id),
      changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
      reason TEXT,
      reference TEXT,
      previous_basis TEXT
    );
    CREATE INDEX IF NOT EXISTS cps_kparam_hist_param_idx ON cps_knowledge_parameter_history (parameter_id);
  `);
  console.log('Tables created.');

  // Seed under the first Superuser account
  const su = await pool.query(`SELECT id, username FROM users WHERE role = 'Superuser' ORDER BY id ASC LIMIT 1`);
  if (su.rows.length === 0) throw new Error('No Superuser user found for seeding');
  const uid = su.rows[0].id;
  console.log('Seeding as user:', su.rows[0].username);

  // [category, name, code, symbol, type, value(null = not yet defined), unit, description, notes, order]
  const P: Array<[string, string, string, string | null, string, number | null, string | null, string, string | null, number]> = [
    // 1. Media & Column — all plant-specific, not yet confirmed → NULL
    ['media_column', 'Media weight per column', 'MEDIA_WT_PER_COL', 'm_media', 'physical_constant', null, 'kg', 'Adsorbent media charge per column.', 'Current Thermopac CPS engineering basis. Superuser-controlled and may be refined later using validated engineering or operating data.', 10],
    ['media_column', 'Column internal volume', 'COL_INTERNAL_VOL', 'V_col', 'physical_constant', null, 'L', 'Internal volume of one column.', 'Current Thermopac CPS engineering basis. Superuser-controlled and may be refined later using validated engineering or operating data.', 20],
    ['media_column', 'Media void fraction', 'MEDIA_VOID_FRACTION', 'ε', 'physical_constant', null, '—', 'Void fraction of the packed media bed.', 'Current Thermopac CPS engineering basis. Superuser-controlled and may be refined later using validated engineering or operating data.', 30],
    ['media_column', 'Column steel weight', 'COL_STEEL_WT', 'm_steel', 'physical_constant', null, 'kg', 'Steel weight of one column shell and internals.', 'Current Thermopac CPS engineering basis. Superuser-controlled and may be refined later using validated engineering or operating data.', 40],
    ['media_column', 'Column surface area', 'COL_SURFACE_AREA', 'A_col', 'physical_constant', null, 'm²', 'External surface area of one column (heat-loss basis).', 'Current Thermopac CPS engineering basis. Superuser-controlled and may be refined later using validated engineering or operating data.', 50],
    ['media_column', 'Flow per column', 'FLOW_PER_COL', 'Q_col', 'performance', null, 'L/h', 'Design oil flow through one column.', 'Current Thermopac CPS engineering basis. Superuser-controlled and may be refined later using validated engineering or operating data.', 60],
    ['media_column', 'Sulphur absorption factor', 'SULPHUR_ABS_FACTOR', 'f_S', 'performance', null, '—', 'Normalized sulphur absorption capacity factor per column.', 'Under development — to be refined by Superuser. Never substitute a placeholder.', 70],
    ['media_column', 'Colour absorption factor', 'COLOUR_ABS_FACTOR', 'f_C', 'performance', null, '—', 'Normalized colour absorption capacity factor per column.', 'Under development — to be refined by Superuser. Never substitute a placeholder.', 80],
    ['media_column', 'Columns per modular skid', 'COLUMNS_PER_MODULE', 'N_mod', 'equipment_standard', 20, 'columns', 'Standard Thermopac column skid module size.', 'Thermopac modular standard: columns are installed in modules of 20.', 90],
    // 2. Material Properties
    ['material_properties', 'Base oil specific gravity', 'BASE_OIL_SG', 'SG_oil', 'physical_constant', null, '—', 'Specific gravity of the base oil processed in CPS.', '0.85 is the current Thermopac CPS engineering/design basis for base-oil specific gravity. This parameter may be refined for a project where the actual oil property is known.', 10],
    ['material_properties', 'Base oil specific heat', 'BASE_OIL_CP', 'Cp_oil', 'physical_constant', null, 'kJ/kg·K', 'Specific heat of the base oil.', 'Project-fluid specific — not yet defined.', 20],
    ['material_properties', 'Media specific heat', 'MEDIA_CP', 'Cp_media', 'physical_constant', null, 'kJ/kg·K', 'Specific heat of the adsorbent media.', 'Media-specific — not yet defined.', 30],
    ['material_properties', 'Steel specific heat', 'STEEL_CP', 'Cp_steel', 'physical_constant', 0.49, 'kJ/kg·K', 'Specific heat of carbon steel (column shell).', 'Standard textbook value for carbon steel (~0.49 kJ/kg·K).', 40],
    ['material_properties', 'Air specific heat', 'AIR_CP', 'Cp_air', 'physical_constant', 1.005, 'kJ/kg·K', 'Specific heat of air at constant pressure, ambient conditions.', 'Standard textbook value at ~25 °C, 1 atm.', 50],
    // 3. Heating & Cooling
    ['heating_cooling', 'Ambient temperature', 'AMBIENT_TEMP', 'T_amb', 'physical_constant', null, '°C', 'Design ambient temperature.', 'Current CPS design-basis ambient temperature. This is a default engineering basis and may be refined for project-specific site conditions.', 10],
    ['heating_cooling', 'Polishing temperature', 'POLISHING_TEMP', 'T_pol', 'process_threshold', null, '°C', 'Oil temperature during polishing operation.', 'Current Thermopac CPS engineering/design basis. Superuser-controlled and may be refined later using validated engineering or operating data.', 20],
    ['heating_cooling', 'Regeneration temperature', 'REGEN_TEMP', 'T_regen', 'process_threshold', null, '°C', 'Column temperature during media regeneration.', 'Current Thermopac CPS engineering/design basis. Superuser-controlled and may be refined later using validated engineering or operating data.', 30],
    ['heating_cooling', 'Column surface temperature', 'COL_SURFACE_TEMP', 'T_surf', 'process_threshold', null, '°C', 'Column outer-surface temperature for heat-loss estimation.', 'Current Thermopac CPS engineering/design basis. Superuser-controlled and may be refined later using validated engineering or operating data.', 40],
    ['heating_cooling', 'Regeneration cooling endpoint', 'REGEN_COOL_ENDPOINT', 'T_cool_end', 'process_threshold', null, '°C', 'Column temperature at which regeneration cooling is complete.', 'Current Thermopac CPS engineering/design basis. Superuser-controlled and may be refined later using validated engineering or operating data.', 50],
    ['heating_cooling', 'Exhaust gas temperature', 'EXHAUST_GAS_TEMP', 'T_exh', 'process_threshold', null, '°C', 'Regeneration exhaust gas temperature.', 'Current Thermopac CPS engineering/design basis. Superuser-controlled and may be refined later using validated engineering or operating data.', 60],
    ['heating_cooling', 'Cooling water inlet temperature', 'CW_INLET_TEMP', 'T_cw_in', 'physical_constant', null, '°C', 'Cooling water supply temperature.', 'Current CPS design-basis cooling-water inlet temperature. This is a default engineering basis and may be refined for project-specific cooling-water conditions.', 70],
    ['heating_cooling', 'Cooling water temperature rise', 'CW_TEMP_RISE', 'ΔT_cw', 'process_threshold', null, '°C', 'Allowable cooling water temperature rise.', 'Current Thermopac CPS engineering/design basis. Superuser-controlled and may be refined later using validated engineering or operating data.', 80],
    ['heating_cooling', 'Surface heat-loss basis', 'SURFACE_HEAT_LOSS', 'q_loss', 'physical_constant', null, 'W/m²', 'Heat-loss flux basis from hot column surfaces.', 'Not yet defined.', 90],
    ['heating_cooling', 'Combustion air requirement', 'COMBUSTION_AIR_REQ', 'AFR', 'physical_constant', null, 'kg air/kg fuel', 'Combustion air required per unit of fuel burned during regeneration.', 'Current Thermopac CPS combustion-air engineering basis. Actual requirement may be refined if the regeneration fuel composition or combustion basis changes.', 100],
    ['heating_cooling', 'Oxygen fraction in air', 'O2_FRACTION_AIR', 'y_O2', 'physical_constant', 0.21, '—', 'Mole fraction of oxygen in ambient air.', 'Standard engineering oxygen mass fraction in dry atmospheric air. The stored value 0.2313 kg O₂/kg air is a mass-fraction basis and must not be confused with the approximately 20.9 vol.% oxygen concentration in dry air.', 110],
    // 4. Process Cut-Off / Quality Thresholds
    ['process_cutoff', 'Initial regenerated-column outlet colour', 'COLOUR_INITIAL_OUTLET', 'C_0', 'process_threshold', null, 'ASTM', 'Outlet colour immediately after a column is freshly regenerated (near water-white).', 'Qualitatively "near water-white"; numeric value not yet formally defined.', 10],
    ['process_cutoff', 'Finished-product colour cut margin', 'COLOUR_CUT_MARGIN', 'ΔC_cut', 'process_threshold', 0.5, 'ASTM', 'Finished oil continues until instantaneous outlet colour reaches Customer Target + this margin; beyond it oil is routed to the semi-finished tank.', 'Current operating philosophy: Customer Target + 0.5 ASTM.', 20],
    ['process_cutoff', 'Colour cycle-end difference from inlet', 'COLOUR_CYCLE_END_DIFF', 'ΔC_end', 'process_threshold', 1.0, 'ASTM', 'Processing continues until outlet colour is within this difference of inlet colour; then regeneration starts. Semi-finished oil is recycled into the next CPS batch.', 'Current operating philosophy: within 1.0 ASTM of inlet.', 30],
    ['process_cutoff', 'Initial regenerated-column sulphur', 'SULPHUR_INITIAL_OUTLET', 'S_0', 'process_threshold', null, 'ppm', 'Outlet sulphur immediately after a column is freshly regenerated.', 'Not yet formally defined.', 40],
    ['process_cutoff', 'Finished-product sulphur diversion factor', 'SULPHUR_DIVERSION_FACTOR', 'f_S_div', 'process_threshold', null, '—', 'Normalized threshold/factor at which finished oil is diverted to semi-finished on sulphur breakthrough.', 'Under development — to be refined by Superuser; follows the same philosophy as colour.', 50],
    ['process_cutoff', 'Sulphur cycle-end factor', 'SULPHUR_CYCLE_END_FACTOR', 'f_S_end', 'process_threshold', null, '—', 'Normalized threshold/factor at which the sulphur cycle ends and regeneration starts.', 'Under development — to be refined by Superuser.', 60],
    // 5. Process Times
    ['process_times', 'Vacuum drain time', 'TIME_VACUUM_DRAIN', 't_drain', 'process_time', null, 'h', 'Time for vacuum oil drain-down of a column before regeneration.', 'Current Thermopac CPS engineering/design time basis. Superuser-controlled and may later be refined using demonstrated operating data.', 10],
    ['process_times', 'Heat-up time', 'TIME_HEATUP', 't_heat', 'process_time', null, 'h', 'Column heat-up time to regeneration temperature.', 'Current Thermopac CPS engineering/design time basis. Superuser-controlled and may later be refined using demonstrated operating data.', 20],
    ['process_times', 'Regeneration time', 'TIME_REGEN', 't_regen', 'process_time', null, 'h', 'Media regeneration (burn-off) time.', 'Current Thermopac CPS engineering/design time basis. Superuser-controlled and may later be refined using demonstrated operating data.', 30],
    ['process_times', 'Cooling time', 'TIME_COOLING', 't_cool', 'process_time', null, 'h', 'Column cooling time after regeneration.', 'Current Thermopac CPS engineering/design time basis. Superuser-controlled and may later be refined using demonstrated operating data.', 40],
    ['process_times', 'Switching / settling time', 'TIME_SWITCHING', 't_switch', 'process_time', null, 'h', 'Valve switching and settling time between cycle steps.', 'Not yet defined. Finished/semi-finished production times are NOT stored as constants — they may later be calculated from the CPS performance model.', 50],
    ['process_times', 'Semi-finished oil / media saturation time', 'TIME_MEDIA_SATURATION', 't_sat', 'process_time', '10', 'h', 'Time during which CPS outlet is routed to the semi-finished oil tank after the finished-oil cutoff, allowing continued loading/saturation of the media until the colour or sulphur cycle-end criterion is reached.', '10 h is the current Thermopac CPS engineering/design basis. This value is Superuser-controlled and may later be refined using demonstrated operating data.', 60],
    // 6. Regeneration & Recovery
    ['regeneration_recovery', 'Oil retained per column', 'OIL_RETAINED_PER_COL', 'V_ret', 'performance', null, 'kg', 'Oil held up in one column at drain start.', 'Current Thermopac CPS engineering basis per column per regeneration. Superuser-controlled and may later be refined using validated operating data.', 10],
    ['regeneration_recovery', 'Oil recovered by vacuum drain', 'OIL_RECOVERED_VACUUM', 'V_vac', 'performance', null, 'kg', 'Oil recovered from a column by vacuum drain.', 'Current Thermopac CPS engineering basis per column per regeneration. Superuser-controlled and may later be refined using validated operating data.', 20],
    ['regeneration_recovery', 'Good oil recovered during regeneration', 'OIL_RECOVERED_REGEN', 'V_good', 'performance', null, 'kg', 'Good oil recovered during the regeneration step.', 'Current Thermopac CPS engineering basis per column per regeneration. Superuser-controlled and may later be refined using validated operating data.', 30],
    ['regeneration_recovery', 'Black oil generated per column', 'BLACK_OIL_PER_COL', 'V_black', 'performance', null, 'kg', 'Black oil generated per column per regeneration cycle.', 'Current Thermopac CPS engineering basis per column per regeneration. Superuser-controlled and may later be refined using validated operating data.', 40],
    ['regeneration_recovery', 'Oil burned during regeneration', 'OIL_BURNED_REGEN', 'V_burn', 'performance', null, 'kg', 'Oil consumed/burned during media regeneration.', 'Current Thermopac CPS engineering basis per column per regeneration. Superuser-controlled and may later be refined using validated operating data.', 50],
    ['regeneration_recovery', 'Other process losses', 'OTHER_PROCESS_LOSSES', 'V_loss', 'performance', null, 'kg', 'Other miscellaneous process losses per cycle, if required.', 'Current Thermopac CPS engineering basis per column per regeneration. Superuser-controlled and may later be refined using validated operating data.', 60],
    // 7. Standard Equipment
    ['standard_equipment', 'Standard column module size', 'SKID_MODULE_SIZE', null, 'equipment_standard', 20, 'columns', 'Column skid module = 20 columns. Required columns are rounded up to a multiple of this.', 'Thermopac modular equipment standard.', 10],
    ['standard_equipment', 'Rotating equipment skid CPS-60 capacity', 'SKID_CAP_CPS_060', null, 'equipment_standard', 60, 'columns', 'Maximum installed columns supported by the CPS-60 rotating equipment skid.', 'Thermopac standard rotating equipment skid.', 20],
    ['standard_equipment', 'Rotating equipment skid CPS-120 capacity', 'SKID_CAP_CPS_120', null, 'equipment_standard', 120, 'columns', 'Maximum installed columns supported by the CPS-120 rotating equipment skid.', 'Thermopac standard rotating equipment skid.', 30],
    ['standard_equipment', 'Rotating equipment skid CPS-180 capacity', 'SKID_CAP_CPS_180', null, 'equipment_standard', 180, 'columns', 'Maximum installed columns supported by the CPS-180 rotating equipment skid.', 'Thermopac standard rotating equipment skid.', 40],
    ['standard_equipment', 'Rotating equipment skid CPS-200 capacity', 'SKID_CAP_CPS_200', null, 'equipment_standard', 200, 'columns', 'Maximum installed columns supported by the CPS-200 rotating equipment skid.', 'Thermopac standard rotating equipment skid.', 50],
    ['standard_equipment', 'Rotating equipment skid CPS-240 capacity', 'SKID_CAP_CPS_240', null, 'equipment_standard', 240, 'columns', 'Maximum installed columns supported by the CPS-240 rotating equipment skid.', 'Thermopac standard rotating equipment skid.', 60],
    // Regeneration Off-Gas / TOX Basis — reference test metadata + TOX design parameters (undefined until Superuser approval)
    ['regen_offgas_tox', 'Regeneration reference test column count', 'REGEN_TEST_COLUMN_COUNT', 'N_test', 'performance', 40, 'columns', 'Number of CPS columns represented by the measured pilot regeneration test data.', 'Demonstrated reference basis consisting of 2 × 20-column CPS skids. This is test metadata, not a standard equipment capacity. Test basis: measurement point Oxidizer stack; operating mode CPS media regeneration; source AVISTA OIL Deutschland GmbH pilot plant / öko-control Project 2-26-1-047; test dates 17-Mar-2026 and 20-Mar-2026.', 10],
    ['regen_offgas_tox', 'Regeneration reference test skid count', 'REGEN_TEST_SKID_COUNT', 'N_skid_test', 'performance', 2, 'skids', 'Number of CPS column skids represented by the measured pilot regeneration test data.', 'Each test skid contains 20 CPS columns. This is measured-test metadata, not an equipment-standard parameter. Test basis: measurement point Oxidizer stack; operating mode CPS media regeneration; source AVISTA OIL Deutschland GmbH pilot plant / öko-control Project 2-26-1-047; test dates 17-Mar-2026 and 20-Mar-2026.', 20],
    ['regen_offgas_tox', 'Regeneration off-gas flow', 'REGEN_OFFGAS_FLOW', 'Q_regen_gas', 'performance', null, 'Nm³/h', 'Raw CPS regeneration off-gas volumetric flow entering the Thermal Oxidizer.', 'Not yet approved — must remain NULL until set by Superuser. Do not infer from oxidizer-stack concentration measurements.', 30],
    ['regen_offgas_tox', 'Regeneration off-gas TOX inlet temperature', 'REGEN_OFFGAS_TEMP', 'T_regen_gas', 'performance', null, '°C', 'Temperature of raw CPS regeneration off-gas entering the Thermal Oxidizer.', 'Not yet approved — must remain NULL until set by Superuser. Do not infer from oxidizer-stack measurements.', 40],
    ['regen_offgas_tox', 'Regeneration VOC mass load', 'REGEN_VOC_MASS_LOAD', 'm_dot_VOC', 'performance', null, 'kg/h', 'Total combustible VOC mass flow from CPS regeneration entering the Thermal Oxidizer.', 'Not yet approved — must remain NULL until set by Superuser. Future basis: Mass Flow = Concentration × Gas Flow, established before any per-column/per-skid normalization.', 50],
    ['regen_offgas_tox', 'Regeneration sulphur mass load', 'REGEN_SULPHUR_MASS_LOAD', 'm_dot_S', 'performance', null, 'kg/h', 'Sulphur-bearing mass flow from CPS regeneration entering the Thermal Oxidizer.', 'Not yet approved — must remain NULL until set by Superuser. Do not derive from SO₂/H₂S stack concentrations without an approved gas-flow basis.', 60],
    ['regen_offgas_tox', 'Peak regeneration off-gas duration', 'REGEN_OFFGAS_PEAK_DURATION', 't_peak', 'process_time', null, 'h', 'Duration of the peak regeneration off-gas loading period used later for TOX sizing.', 'Not yet approved — must remain NULL until set by Superuser.', 70],
    ['regen_offgas_tox', 'Regeneration off-gas peak-to-average factor', 'REGEN_OFFGAS_PEAK_FACTOR', 'F_peak', 'performance', null, 'dimensionless', 'Ratio of peak regeneration off-gas load to average regeneration off-gas load.', 'Not yet approved — must remain NULL until set by Superuser.', 80],
  ];

  let inserted = 0;
  for (const [category, name, code, symbol, ptype, value, unit, desc, notes, order] of P) {
    const r = await pool.query(
      `INSERT INTO cps_knowledge_parameters
         (category, parameter_name, parameter_code, symbol, parameter_type, value, unit, description, engineering_notes, display_order, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
       ON CONFLICT (parameter_code) DO NOTHING`,
      [category, name, code, symbol, ptype, value, unit, desc, notes, order, uid],
    );
    inserted += r.rowCount ?? 0;
  }
  console.log(`Seeded ${inserted} parameters (of ${P.length}).`);
  const counts = await pool.query(`SELECT category, COUNT(*) n, COUNT(value) defined FROM cps_knowledge_parameters GROUP BY category ORDER BY category`);
  console.table(counts.rows);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
