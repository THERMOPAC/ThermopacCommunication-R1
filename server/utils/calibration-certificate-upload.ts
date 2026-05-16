import storage, { bucketName } from './storage-config';

/**
 * @deprecated uploadCalibrationCertificate() — REMOVED (Gap A, 2026-05-16).
 * All calibration certificate uploads now go through createRevision('Calibration')
 * in qms-file-governance.ts with CALIBRATION_CERT ruleId.
 * Last call site (standalone-routes.ts) was migrated to createRevision() in Gap A.
 * Path QMS/Instrument/{INST-XXXXX}.pdf is no longer written by any active route.
 * Legacy files at QMS/Instrument/ are retained as-is in GCS (no deletion).
 *
 * @deprecated certificate_file_path column — FORMALLY DEPRECATED (Gap A, 2026-05-16).
 * No active route writes certificate_file_path after Gap A.
 * All governed uploads write certificate_gcs_key exclusively.
 * Do NOT add new writers to certificate_file_path.
 * Column DROP is deferred — no current migration scope.
 */

/**
 * Generates a signed URL for a calibration certificate stored in GCS.
 * Still active: used by calibration-routes.ts GET /instruments/:id/certificate
 * for URL signing of both legacy (QMS/Instrument/) and governed (QMS/Calibration/) paths.
 */
export async function getCertificateUrl(filePath: string): Promise<string | null> {
  try {
    if (!filePath) return null;

    if (!filePath.startsWith('QMS/')) {
      console.log('Certificate path does not start with QMS/, might be a legacy path');
      return null;
    }

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);

    const [exists] = await file.exists();

    if (!exists) {
      console.error(`Certificate file not found in GCS at path: ${filePath}`);
      return null;
    }

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    return signedUrl;
  } catch (error) {
    console.error('Error generating certificate URL:', error);
    return null;
  }
}
