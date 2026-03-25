import type { EmployeeType } from './schema';

export type RuleValue = 'YES' | 'NO' | 'CONDITIONAL';
export type ApplicabilityStatus = 'RESOLVED' | 'UNRESOLVED';

export interface StatutoryRuleSet {
  pfRule: RuleValue;
  esicRule: RuleValue;
  ptRule: RuleValue;
  tdsRule: RuleValue;
}

export interface StatutoryApplicability {
  isPFApplicable: boolean | null;
  isESICApplicable: boolean | null;
  isPTApplicable: boolean | null;
  isTDSApplicable: boolean | null;
  status: ApplicabilityStatus;
  warnings: string[];
  basis: {
    pf: string;
    esic: string;
    pt: string;
    tds: string;
  };
}

export const STATUTORY_RULE_MATRIX: Record<EmployeeType, StatutoryRuleSet> = {
  PERMANENT: { pfRule: 'YES', esicRule: 'YES', ptRule: 'YES', tdsRule: 'YES' },
  TEMPORARY: { pfRule: 'YES', esicRule: 'YES', ptRule: 'YES', tdsRule: 'YES' },
  CONTRACT: { pfRule: 'NO', esicRule: 'NO', ptRule: 'NO', tdsRule: 'NO' },
  PROBATION: { pfRule: 'YES', esicRule: 'YES', ptRule: 'YES', tdsRule: 'YES' },
  INTERN: { pfRule: 'NO', esicRule: 'NO', ptRule: 'NO', tdsRule: 'CONDITIONAL' },
  PART_TIME: { pfRule: 'CONDITIONAL', esicRule: 'CONDITIONAL', ptRule: 'YES', tdsRule: 'YES' },
  DAILY_WAGE: { pfRule: 'CONDITIONAL', esicRule: 'CONDITIONAL', ptRule: 'YES', tdsRule: 'CONDITIONAL' },
  CONSULTANT: { pfRule: 'NO', esicRule: 'NO', ptRule: 'NO', tdsRule: 'YES' },
  APPRENTICE: { pfRule: 'NO', esicRule: 'NO', ptRule: 'NO', tdsRule: 'NO' },
};

export interface ResolverContext {
  employeeType: EmployeeType | null | undefined;
  grossEarnings?: number;
  hasEpfNumber?: boolean;
  hasPfConfigured?: boolean;
  role?: string;
  tdsCategory?: 'salary' | 'consultant' | 'stipend' | 'daily_wage';
}

export function resolveStatutoryApplicability(ctx: ResolverContext): StatutoryApplicability {
  const warnings: string[] = [];

  if (!ctx.employeeType) {
    return {
      isPFApplicable: null,
      isESICApplicable: null,
      isPTApplicable: null,
      isTDSApplicable: null,
      status: 'UNRESOLVED',
      warnings: ['Employee type not set — statutory deductions skipped until corrected'],
      basis: {
        pf: 'Unresolved: employee type missing',
        esic: 'Unresolved: employee type missing',
        pt: 'Unresolved: employee type missing',
        tds: 'Unresolved: employee type missing',
      },
    };
  }

  const rules = STATUTORY_RULE_MATRIX[ctx.employeeType];
  if (!rules) {
    return {
      isPFApplicable: null,
      isESICApplicable: null,
      isPTApplicable: null,
      isTDSApplicable: null,
      status: 'UNRESOLVED',
      warnings: [`Unknown employee type: ${ctx.employeeType}`],
      basis: {
        pf: `Unresolved: unknown employee type ${ctx.employeeType}`,
        esic: `Unresolved: unknown employee type ${ctx.employeeType}`,
        pt: `Unresolved: unknown employee type ${ctx.employeeType}`,
        tds: `Unresolved: unknown employee type ${ctx.employeeType}`,
      },
    };
  }

  const ESIC_CEILING = 21000;

  let isPFApplicable: boolean;
  let pfBasis: string;
  if (rules.pfRule === 'YES') {
    isPFApplicable = true;
    pfBasis = `Applicable: ${ctx.employeeType} employee — PF mandatory`;
  } else if (rules.pfRule === 'NO') {
    isPFApplicable = false;
    pfBasis = `Not applicable: ${ctx.employeeType} employee — PF excluded`;
  } else {
    if (ctx.hasEpfNumber || ctx.hasPfConfigured) {
      isPFApplicable = true;
      pfBasis = `Applicable: ${ctx.employeeType} employee — PF enabled via EPF registration/config`;
    } else {
      isPFApplicable = false;
      pfBasis = `Not applicable: ${ctx.employeeType} employee — no EPF registration or PF config found`;
      warnings.push(`PF conditional for ${ctx.employeeType}: no EPF number or PF config — PF skipped`);
    }
  }

  let isESICApplicable: boolean;
  let esicBasis: string;
  if (rules.esicRule === 'NO') {
    isESICApplicable = false;
    esicBasis = `Not applicable: ${ctx.employeeType} employee — ESIC excluded`;
  } else {
    if (ctx.grossEarnings !== undefined) {
      if (ctx.grossEarnings <= ESIC_CEILING) {
        isESICApplicable = true;
        esicBasis = `Applicable: ${ctx.employeeType} employee — gross ₹${ctx.grossEarnings.toFixed(0)} within ESIC ceiling ₹${ESIC_CEILING}`;
      } else {
        isESICApplicable = false;
        esicBasis = `Not applicable: gross ₹${ctx.grossEarnings.toFixed(0)} exceeds ESIC ceiling ₹${ESIC_CEILING}`;
      }
    } else {
      isESICApplicable = rules.esicRule === 'YES';
      esicBasis = rules.esicRule === 'YES'
        ? `Applicable: ${ctx.employeeType} employee — ESIC eligible (wage check pending)`
        : `Conditional: ${ctx.employeeType} employee — ESIC eligibility requires wage data`;
      if (rules.esicRule === 'CONDITIONAL') {
        warnings.push(`ESIC conditional for ${ctx.employeeType}: wage data not provided — defaulting to not applicable`);
        isESICApplicable = false;
      }
    }
  }

  let isPTApplicable: boolean;
  let ptBasis: string;
  if (rules.ptRule === 'YES') {
    isPTApplicable = true;
    ptBasis = `Applicable: ${ctx.employeeType} employee — PT mandatory`;
  } else {
    isPTApplicable = false;
    ptBasis = `Not applicable: ${ctx.employeeType} employee — PT excluded`;
  }

  let isTDSApplicable: boolean;
  let tdsBasis: string;
  if (rules.tdsRule === 'YES') {
    isTDSApplicable = true;
    if (ctx.employeeType === 'CONSULTANT') {
      tdsBasis = `Applicable: Consultant/Freelancer — TDS under Sec 194J/194C (not salary TDS)`;
    } else {
      tdsBasis = `Applicable: ${ctx.employeeType} employee — salary TDS`;
    }
  } else if (rules.tdsRule === 'NO') {
    isTDSApplicable = false;
    tdsBasis = `Not applicable: ${ctx.employeeType} employee — TDS excluded`;
  } else {
    if (ctx.tdsCategory === 'stipend') {
      isTDSApplicable = false;
      tdsBasis = `Not applicable: ${ctx.employeeType} — stipend below TDS threshold`;
      warnings.push(`TDS conditional for ${ctx.employeeType}: treated as stipend — TDS skipped`);
    } else {
      isTDSApplicable = true;
      tdsBasis = `Applicable: ${ctx.employeeType} employee — conditional TDS active`;
    }
  }

  return {
    isPFApplicable,
    isESICApplicable,
    isPTApplicable,
    isTDSApplicable,
    status: 'RESOLVED',
    warnings,
    basis: { pf: pfBasis, esic: esicBasis, pt: ptBasis, tds: tdsBasis },
  };
}
