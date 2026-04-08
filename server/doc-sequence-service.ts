import { Pool } from '@neondatabase/serverless';

const DWG_PAD = 4;
const PROJECT_PAD = 3;
const CHILD_PAD = 4;

export async function getNextProjectSeq(fyCode: string, client: Pool | any): Promise<string> {
  const result = await client.query(
    `INSERT INTO doc_sequences (doc_type, fy_code, project_id, next_seq)
     VALUES ('PROJECT', $1, NULL, 1)
     ON CONFLICT (doc_type, fy_code) WHERE project_id IS NULL
     DO UPDATE SET next_seq = doc_sequences.next_seq + 1
     RETURNING next_seq`,
    [fyCode]
  );
  const seq = result.rows[0].next_seq;
  return String(seq).padStart(PROJECT_PAD, '0');
}

export async function getNextDocSeq(docType: string, projectId: number, client: Pool | any): Promise<string> {
  const result = await client.query(
    `INSERT INTO doc_sequences (doc_type, fy_code, project_id, next_seq)
     VALUES ($1, NULL, $2, 1)
     ON CONFLICT (doc_type, project_id) WHERE project_id IS NOT NULL
     DO UPDATE SET next_seq = doc_sequences.next_seq + 1
     RETURNING next_seq`,
    [docType, projectId]
  );
  const seq = result.rows[0].next_seq;
  const pad = docType === 'DWG' ? DWG_PAD : CHILD_PAD;
  return String(seq).padStart(pad, '0');
}
