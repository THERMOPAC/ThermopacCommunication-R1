// Read-only object probe. Input is private JSON on stdin; output is aggregates only.
// Never imports application startup, calls download routes, or writes DB/GCS data.
import { Storage } from '@google-cloud/storage';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const inventories = JSON.parse(input);
const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS || '{}');
const storage = new Storage({
  projectId: credentials.project_id,
  credentials: { client_email: credentials.client_email, private_key: credentials.private_key },
  retryOptions: { autoRetry: false },
  timeout: 20000,
});
const bucket = storage.bucket(process.env.GCS_BUCKET_NAME || 'thermopac_storage');
const increment = (map, key) => { map[key] = (map[key] || 0) + 1; };
const safeError = error => {
  const code = Number(error?.code);
  if ([400, 401, 403, 404, 408, 429, 500, 502, 503, 504].includes(code)) return `http_${code}`;
  // Categorize without disclosing error text, URLs, keys, or credential contents.
  if (/invalid_grant|Invalid JWT/i.test(String(error?.message))) return 'credential_rejected';
  if (/timeout|timed out|abort/i.test(String(error?.message))) return 'timeout';
  return 'other_error';
};
const cache = new Map();
async function probe(path) {
  const key = path.startsWith('/') ? path.slice(1) : path;
  if (cache.has(key)) return cache.get(key);
  const result = { metadata: 'not_tested', stream: 'not_tested', signed_get: 'not_tested' };
  const file = bucket.file(key);
  try {
    const [metadata] = await file.getMetadata();
    result.metadata = Number(metadata.size) > 0 ? 'nonempty' : 'empty';
  } catch (error) { result.metadata = safeError(error); }
  try {
    let length = 0;
    let head = Buffer.alloc(0);
    const stream = file.createReadStream();
    const timer = setTimeout(() => stream.destroy(new Error('timeout')), 30000);
    try {
      for await (const chunk of stream) {
        length += chunk.length;
        if (head.length < 5) head = Buffer.concat([head, chunk]).subarray(0, 5);
      }
    } finally { clearTimeout(timer); }
    result.stream = length && head.toString() === '%PDF-' ? 'complete_pdf' : 'not_pdf_or_empty';
  } catch (error) { result.stream = safeError(error); }
  try {
    const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 60000 });
    const response = await fetch(url, { headers: { Range: 'bytes=0-4' }, signal: AbortSignal.timeout(20000), redirect: 'error' });
    const reader = response.body?.getReader();
    let head = Buffer.alloc(0);
    try {
      while (reader && head.length < 5) {
        const chunk = await reader.read();
        if (chunk.done) break;
        head = Buffer.concat([head, Buffer.from(chunk.value)]).subarray(0, 5);
      }
    } finally { await reader?.cancel(); }
    result.signed_get = response.ok && head.toString() === '%PDF-' ? 'pdf_prefix_readable' : `http_${response.status}_or_non_pdf`;
  } catch (error) { result.signed_get = safeError(error); }
  cache.set(key, result);
  return result;
}
const report = {
  checked_at: new Date().toISOString(),
  scope: 'Production-replica and development WPQR effective keys; workspace explicit credentials, NOT deployed ADC. Full SDK streams; signed GET checks PDF prefix only.',
  environments: {},
};
for (const [environment, rows] of Object.entries(inventories)) {
  const summary = { records: rows.length, governed: rows.filter(r => r.governed).length, metadata: {}, stream: {}, signed_get: {} };
  for (const row of rows) {
    const result = await probe(row.path);
    for (const type of ['metadata', 'stream', 'signed_get']) increment(summary[type], result[type]);
  }
  report.environments[environment] = summary;
}
report.distinct_objects_probed = cache.size;
console.log(JSON.stringify(report, null, 2));