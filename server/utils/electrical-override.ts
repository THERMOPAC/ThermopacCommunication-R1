/**
 * Electrical Standards Override Utility
 * ──────────────────────────────────────
 * Applies project-level electrical standards (voltage / frequency / phase) to
 * buy-list line technical_attributes when lines are seeded from package templates.
 *
 * SCOPE — only these three subgroup codes are ever modified:
 *   non_flameproof  → voltage, frequency, speed (proportional cascade)
 *   flameproof      → voltage, frequency, speed (proportional cascade)
 *   panels          → voltage via controlled mapping only
 *
 * All other subgroups pass through unchanged. Cabling `voltage` (insulation
 * rating) and valve `service_phase` (process fluid phase) are never touched.
 */

export interface ProjectElectricalStandards {
  electricalVoltage:   string | null | undefined;
  electricalFrequency: string | null | undefined;
  electricalPhase:     string | null | undefined;
}

const OVERRIDE_SUBGROUPS = new Set(['non_flameproof', 'flameproof', 'panels']);

// ─── Motor voltage options (must match MotorAttrsForm MOTOR_OPTS.voltage) ────
const MOTOR_VOLTAGE_MAP: Record<string, string> = {
  '380': '380 V',
  '400': '400 V',
  '415': '415 V',
  '440': '440 V',
  '690': '690 V',
};

// ─── Motor frequency options ──────────────────────────────────────────────────
const MOTOR_FREQUENCY_MAP: Record<string, string> = {
  '50': '50 Hz',
  '60': '60 Hz',
};

// ─── Proportional speed mapping when frequency changes ───────────────────────
const SPEED_MAP_50_TO_60: Record<string, string> = {
  '3000': '3600',
  '1500': '1800',
  '1000': '1200',
  '750':  '900',
};
const SPEED_MAP_60_TO_50: Record<string, string> = {
  '3600': '3000',
  '1800': '1500',
  '1200': '1000',
  '900':  '750',
};

// ─── Panel controlled voltage mapping ────────────────────────────────────────
// Must match entries in PANEL_OPTS.voltage in electrical-attrs-forms.tsx
const PANEL_VOLTAGE_MAP: Record<string, string> = {
  '380_3Ph': '380V AC (3Ph)',
  '415_3Ph': '415V AC (3Ph)',
  '440_3Ph': '440V AC (3Ph)',
  '480_3Ph': '480V AC (3Ph)',
  '690_3Ph': '690V AC (3Ph)',
  '240_1Ph': '240V AC (1Ph)',
  '110_1Ph': '110V AC (1Ph)',
};

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * Applies project electrical standards to a single line's technical_attributes.
 *
 * @param subgroupCode  - The buy_subgroup code for this line (e.g. 'non_flameproof')
 * @param attrs         - Existing technical_attributes object (treated as immutable)
 * @param standards     - Project electrical standards from the projects table
 * @returns Modified attrs object + `_electrical_overrides` array listing changed keys.
 *          Returns the original attrs object unchanged for out-of-scope subgroups.
 */
export function applyProjectElectricalStandards(
  subgroupCode: string,
  attrs: Record<string, unknown>,
  standards: ProjectElectricalStandards,
): Record<string, unknown> {
  // Guard: only act on approved subgroups
  if (!OVERRIDE_SUBGROUPS.has(subgroupCode)) return attrs;

  // If project has no electrical standards at all, no-op
  const { electricalVoltage, electricalFrequency, electricalPhase } = standards;
  if (!electricalVoltage && !electricalFrequency) return attrs;

  if (subgroupCode === 'non_flameproof' || subgroupCode === 'flameproof') {
    return applyMotorOverride(attrs, electricalVoltage, electricalFrequency);
  }

  if (subgroupCode === 'panels') {
    return applyPanelOverride(attrs, electricalVoltage, electricalPhase);
  }

  return attrs;
}

// ─── Motor override ───────────────────────────────────────────────────────────
function applyMotorOverride(
  attrs: Record<string, unknown>,
  projVoltage: string | null | undefined,
  projFrequency: string | null | undefined,
): Record<string, unknown> {
  const result = { ...attrs };
  const overrides: string[] = [];

  // Voltage
  if (projVoltage) {
    const motorVoltage = MOTOR_VOLTAGE_MAP[projVoltage.trim()];
    if (motorVoltage && motorVoltage !== result.voltage) {
      result.voltage = motorVoltage;
      overrides.push('voltage');
    }
  }

  // Frequency + proportional speed cascade
  if (projFrequency) {
    const motorFrequency = MOTOR_FREQUENCY_MAP[projFrequency.trim()];
    if (motorFrequency && motorFrequency !== result.frequency) {
      const oldFreq = result.frequency as string | undefined;
      result.frequency = motorFrequency;
      overrides.push('frequency');

      // Cascade speed proportionally
      const currentSpeed = (result.speed as string | undefined)?.trim() ?? '';
      if (currentSpeed) {
        let newSpeed: string | undefined;
        if (oldFreq === '50 Hz' && motorFrequency === '60 Hz') {
          newSpeed = SPEED_MAP_50_TO_60[currentSpeed];
        } else if (oldFreq === '60 Hz' && motorFrequency === '50 Hz') {
          newSpeed = SPEED_MAP_60_TO_50[currentSpeed];
        }
        if (newSpeed !== undefined) {
          result.speed = newSpeed;
          overrides.push('speed');
        } else if (currentSpeed) {
          // No proportional match — clear speed so user must re-select
          result.speed = '';
          overrides.push('speed');
        }
      }
    }
  }

  if (overrides.length > 0) {
    result._electrical_overrides = overrides;
  }
  return result;
}

// ─── Panel override ───────────────────────────────────────────────────────────
function applyPanelOverride(
  attrs: Record<string, unknown>,
  projVoltage: string | null | undefined,
  projPhase: string | null | undefined,
): Record<string, unknown> {
  // Phase is required for panels — ambiguous without it
  if (!projVoltage || !projPhase) return attrs;

  const mapKey = `${projVoltage.trim()}_${projPhase.trim()}`;
  const panelVoltage = PANEL_VOLTAGE_MAP[mapKey];

  // Only override if we have a known mapping and the value would change
  if (!panelVoltage || panelVoltage === attrs.voltage) return attrs;

  return {
    ...attrs,
    voltage: panelVoltage,
    _electrical_overrides: ['voltage'],
  };
}

/**
 * Strip the UI-only _electrical_overrides key before persisting to DB.
 * Call this on the attrs object just before any INSERT / UPDATE.
 */
export function stripElectricalOverridesMeta(
  attrs: Record<string, unknown>,
): Record<string, unknown> {
  if (!('_electrical_overrides' in attrs)) return attrs;
  const { _electrical_overrides: _removed, ...clean } = attrs;
  return clean;
}
