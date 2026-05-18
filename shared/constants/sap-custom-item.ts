/**
 * SAP Custom Item Identity Constants
 * Baseline: project-item-sap-sync-and-custom-item-governance-baseline-v1
 *
 * These are enterprise business constants representing the fixed SAP catch-all
 * item master used for all EPC custom (non-catalogue) project items.
 *
 * Rules:
 * - These values must NEVER be derived, computed, or overridden at runtime.
 * - All SAP API calls for custom items must reference these constants by name.
 * - Inline string literals for these values are prohibited in application code.
 * - The unique EPC CodeBars (generated per item) must NOT replace SAP_CUSTOM_ITEM_BARCODE
 *   in SAP API calls — it is used exclusively for EPC/GCS identity.
 */

export const SAP_CUSTOM_ITEM_CODE = 'CUSTOMx-SPA-PAR-0000';
export const SAP_CUSTOM_ITEM_NAME = 'CUSTOM ITEM SPARES PARTS 000 AS PER PO';
export const SAP_CUSTOM_ITEM_BARCODE = '1920001001001000';
