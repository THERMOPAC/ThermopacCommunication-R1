export const GCS_LABEL_VOCABULARY = {
  ECR: [
    'change-request-form',
    'supporting-analysis',
    'affected-drawing',
    'impact-assessment',
    'cost-estimate',
    'schedule-impact',
  ],
  ECN: [
    'change-notice',
    'revised-drawing',
    'updated-spec',
    'implementation-record',
    'close-out-report',
  ],
  DSP: [
    'dispatch-note',
    'packing-list',
    'gate-pass',
    'lorry-receipt',
    'e-way-bill',
    'quality-release',
    'delivery-challan',
  ],
  INS: [
    'inspection-report',
    'test-certificate',
    'witness-record',
    'third-party-report',
    'ndt-certificate',
    'hardness-test',
    'dimensional-report',
    'material-traceability',
  ],
  CO: [
    'letter-of-intent',
    'purchase-order',
    'advance-payment-proof',
    'scope-of-supply',
    'technical-specification',
    'payment-terms',
    'amendment',
  ],
  QTN: [
    'quotation-document',
    'bill-of-quantities',
    'commercial-terms',
    'technical-offer',
    'deviation-list',
    'clarification',
  ],
  QTN_PRE: [
    'quotation-document',
    'bill-of-quantities',
    'commercial-terms',
    'technical-offer',
    'deviation-list',
    'clarification',
    'revised-offer',
  ],
  TEMPLATE: [
    'quotation-template',
    'technical-submittal',
    'cover-letter',
    'bill-of-quantities',
    'transmittal-template',
  ],
  EPC_GENERAL: [
    'design-calc',
    'datasheet',
    'material-cert',
    'test-report',
    'vendor-doc',
    'method-statement',
    'approval-drawing',
    'schedule',
    'meeting-minutes',
    'transmittal',
    'site-instruction',
    'weld-map',
    'ndt-report',
    'pressure-test',
    'hydro-test',
  ],
} as const;

export type LabelFamily = keyof typeof GCS_LABEL_VOCABULARY;

export const GCS_LABEL_DISPLAY: Record<string, string> = {
  'change-request-form': 'Change Request Form',
  'supporting-analysis': 'Supporting Analysis',
  'affected-drawing': 'Affected Drawing Reference',
  'impact-assessment': 'Impact Assessment',
  'cost-estimate': 'Cost Estimate',
  'schedule-impact': 'Schedule Impact',
  'change-notice': 'Change Notice',
  'revised-drawing': 'Revised Drawing Reference',
  'updated-spec': 'Updated Specification',
  'implementation-record': 'Implementation Record',
  'close-out-report': 'Close-Out Report',
  'dispatch-note': 'Dispatch Note',
  'packing-list': 'Packing List',
  'gate-pass': 'Gate Pass',
  'lorry-receipt': 'Lorry Receipt',
  'e-way-bill': 'E-Way Bill',
  'quality-release': 'Quality Release Certificate',
  'delivery-challan': 'Delivery Challan',
  'inspection-report': 'Inspection Report',
  'test-certificate': 'Test Certificate',
  'witness-record': 'Witness Record',
  'third-party-report': 'Third Party Report',
  'ndt-certificate': 'NDT Certificate',
  'hardness-test': 'Hardness Test Record',
  'dimensional-report': 'Dimensional Inspection Report',
  'material-traceability': 'Material Traceability Record',
  'letter-of-intent': 'Letter of Intent',
  'purchase-order': 'Purchase Order',
  'advance-payment-proof': 'Advance Payment Proof',
  'scope-of-supply': 'Scope of Supply',
  'technical-specification': 'Technical Specification',
  'payment-terms': 'Payment Terms',
  'amendment': 'Order Amendment',
  'quotation-document': 'Quotation Document',
  'bill-of-quantities': 'Bill of Quantities',
  'commercial-terms': 'Commercial Terms',
  'technical-offer': 'Technical Offer',
  'deviation-list': 'Deviation List',
  'clarification': 'Clarification Note',
  'revised-offer': 'Revised Offer',
  'quotation-template': 'Quotation Template',
  'technical-submittal': 'Technical Submittal Template',
  'cover-letter': 'Cover Letter Template',
  'transmittal-template': 'Transmittal Template',
  'design-calc': 'Design Calculation',
  'datasheet': 'Datasheet',
  'material-cert': 'Material Certificate',
  'test-report': 'Test Report',
  'vendor-doc': 'Vendor Document',
  'method-statement': 'Method Statement',
  'approval-drawing': 'Approval Drawing',
  'schedule': 'Schedule',
  'meeting-minutes': 'Meeting Minutes',
  'transmittal': 'Transmittal',
  'site-instruction': 'Site Instruction',
  'weld-map': 'Weld Map',
  'ndt-report': 'NDT Report',
  'pressure-test': 'Pressure Test Record',
  'hydro-test': 'Hydrostatic Test Record',
};

export function validateLabel(family: LabelFamily, label: string): boolean {
  const vocab = GCS_LABEL_VOCABULARY[family] as readonly string[];
  return vocab.includes(label);
}

export function getLabelOptions(family: LabelFamily): Array<{ value: string; label: string }> {
  const vocab = GCS_LABEL_VOCABULARY[family] as readonly string[];
  return vocab.map((v) => ({ value: v, label: GCS_LABEL_DISPLAY[v] || v }));
}

export function getDocTypeLabelFamily(docType: string): LabelFamily {
  const upper = docType.toUpperCase();
  if (upper === 'ECR') return 'ECR';
  if (upper === 'ECN') return 'ECN';
  if (upper === 'DSP') return 'DSP';
  if (upper === 'INS') return 'INS';
  if (upper === 'CO') return 'CO';
  if (upper === 'QTN') return 'QTN';
  return 'EPC_GENERAL';
}
