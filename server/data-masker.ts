/**
 * Data Masking Engine for LLM Prompt Security
 * Automatically masks sensitive information before sending to LLM APIs
 */

export interface MaskingRule {
  field: string;
  type: 'name' | 'email' | 'phone' | 'salary' | 'address' | 'id' | 'custom';
  pattern?: RegExp;
  replacement: string;
  enabled: boolean;
}

export interface MaskingConfig {
  rules: MaskingRule[];
  preserveStructure: boolean;
  logMaskedFields: boolean;
}

export class DataMasker {
  private static defaultRules: MaskingRule[] = [
    // Personal Information
    {
      field: 'name',
      type: 'name',
      pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
      replacement: 'EMPLOYEE_NAME',
      enabled: true
    },
    {
      field: 'firstName',
      type: 'name',
      pattern: /\b[A-Z][a-z]+\b/g,
      replacement: 'FIRST_NAME',
      enabled: true
    },
    {
      field: 'lastName',
      type: 'name',
      pattern: /\b[A-Z][a-z]+\b/g,
      replacement: 'LAST_NAME',
      enabled: true
    },
    
    // Contact Information
    {
      field: 'email',
      type: 'email',
      pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      replacement: 'user@company.com',
      enabled: true
    },
    {
      field: 'phone',
      type: 'phone',
      pattern: /\+?\d{1,4}[\s-]?\(?\d{3,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/g,
      replacement: '+91-XXXX-XXXX',
      enabled: true
    },
    {
      field: 'mobileNumber',
      type: 'phone',
      pattern: /\d{10,}/g,
      replacement: 'XXXXXXXXXX',
      enabled: true
    },

    // Financial Information
    {
      field: 'salary',
      type: 'salary',
      pattern: /\$?\d{1,3}(,\d{3})*(\.\d{2})?/g,
      replacement: 'SALARY_AMOUNT',
      enabled: true
    },
    {
      field: 'amount',
      type: 'salary',
      pattern: /₹?\d{1,3}(,\d{3})*(\.\d{2})?/g,
      replacement: '₹XX,XXX',
      enabled: true
    },
    {
      field: 'basicSalary',
      type: 'salary',
      pattern: /\d+/g,
      replacement: 'BASIC_SALARY',
      enabled: true
    },

    // Address Information
    {
      field: 'address',
      type: 'address',
      pattern: /.+/g,
      replacement: 'EMPLOYEE_ADDRESS',
      enabled: true
    },

    // ID Numbers
    {
      field: 'employeeCode',
      type: 'id',
      pattern: /[A-Z0-9]+/g,
      replacement: 'EMP_ID',
      enabled: true
    },
    {
      field: 'epfNo',
      type: 'id',
      pattern: /.+/g,
      replacement: 'EPF_NUMBER',
      enabled: true
    },
    {
      field: 'esicNo',
      type: 'id',
      pattern: /.+/g,
      replacement: 'ESIC_NUMBER',
      enabled: true
    }
  ];

  private static moduleSpecificRules: Record<string, MaskingRule[]> = {
    'hr': [
      ...DataMasker.defaultRules,
      {
        field: 'performance',
        type: 'custom',
        pattern: /excellent|good|average|poor/gi,
        replacement: 'PERFORMANCE_RATING',
        enabled: true
      }
    ],
    'finance': [
      ...DataMasker.defaultRules,
      {
        field: 'accountNumber',
        type: 'id',
        pattern: /\d{8,}/g,
        replacement: 'ACCOUNT_NUMBER',
        enabled: true
      }
    ],
    'administration': DataMasker.defaultRules,
    'quality': DataMasker.defaultRules.filter(rule => 
      !['salary', 'phone', 'email'].includes(rule.type)
    ), // Less restrictive for quality data
  };

  /**
   * Apply masking rules to data based on prompt sensitivity and module
   */
  static maskData(
    data: any, 
    promptCategory: string = 'general', 
    isSensitive: boolean = false,
    customRules?: MaskingRule[]
  ): { maskedData: any, appliedRules: string[] } {
    if (!isSensitive && promptCategory === 'quality') {
      // Skip masking for non-sensitive quality prompts
      return { maskedData: data, appliedRules: [] };
    }

    const rules = customRules || 
                  DataMasker.moduleSpecificRules[promptCategory] || 
                  DataMasker.defaultRules;
    
    const appliedRules: string[] = [];
    let maskedData: any;

    try {
      // Handle different data types
      if (typeof data === 'string') {
        maskedData = DataMasker.maskString(data, rules, appliedRules);
      } else if (Array.isArray(data)) {
        maskedData = data.map(item => 
          DataMasker.maskData(item, promptCategory, isSensitive, customRules).maskedData
        );
      } else if (typeof data === 'object' && data !== null) {
        maskedData = DataMasker.maskObject(data, rules, appliedRules);
      } else {
        maskedData = data; // Primitive types that don't need masking
      }

      return { maskedData, appliedRules };
    } catch (error) {
      console.error('Error in data masking:', error);
      return { maskedData: '[MASKING_ERROR]', appliedRules: ['error'] };
    }
  }

  /**
   * Mask sensitive fields in an object
   */
  private static maskObject(
    obj: Record<string, any>, 
    rules: MaskingRule[], 
    appliedRules: string[]
  ): Record<string, any> {
    const masked: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const rule = rules.find(r => 
        r.enabled && (r.field === key || key.toLowerCase().includes(r.field.toLowerCase()))
      );

      if (rule) {
        if (typeof value === 'string' && rule.pattern) {
          masked[key] = value.replace(rule.pattern, rule.replacement);
          appliedRules.push(`${key}:${rule.type}`);
        } else {
          masked[key] = rule.replacement;
          appliedRules.push(`${key}:${rule.type}`);
        }
      } else if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          masked[key] = value.map(item => 
            typeof item === 'object' ? 
            DataMasker.maskObject(item, rules, appliedRules) : 
            item
          );
        } else {
          masked[key] = DataMasker.maskObject(value, rules, appliedRules);
        }
      } else {
        masked[key] = value; // Keep non-sensitive fields as-is
      }
    }

    return masked;
  }

  /**
   * Mask sensitive patterns in a string
   */
  private static maskString(
    text: string, 
    rules: MaskingRule[], 
    appliedRules: string[]
  ): string {
    let maskedText = text;

    for (const rule of rules) {
      if (rule.enabled && rule.pattern) {
        const originalText = maskedText;
        maskedText = maskedText.replace(rule.pattern, rule.replacement);
        
        if (originalText !== maskedText) {
          appliedRules.push(`text:${rule.type}`);
        }
      }
    }

    return maskedText;
  }

  /**
   * Create custom masking configuration for specific use cases
   */
  static createCustomConfig(
    enabledTypes: string[] = ['name', 'email', 'phone', 'salary']
  ): MaskingConfig {
    return {
      rules: DataMasker.defaultRules.map(rule => ({
        ...rule,
        enabled: enabledTypes.includes(rule.type)
      })),
      preserveStructure: true,
      logMaskedFields: true
    };
  }

  /**
   * Test masking rules with sample data
   */
  static testMasking(sampleData: any, category: string = 'general'): void {
    console.log('🔒 Testing Data Masking:');
    console.log('Original:', JSON.stringify(sampleData, null, 2));
    
    const result = DataMasker.maskData(sampleData, category, true);
    
    console.log('Masked:', JSON.stringify(result.maskedData, null, 2));
    console.log('Applied Rules:', result.appliedRules);
  }
}

export default DataMasker;