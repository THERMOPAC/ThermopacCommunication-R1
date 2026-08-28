import { pool } from "./db";
import {
  canonicalizeStage1Input,
  makeStage1Snapshot,
  type EcrPrePilotStage1Snapshot,
} from "./ecr-pre-pilot/stage1";

const COUNTER_ROW_ID = 1;
const MAX_ALLOCATION_ATTEMPTS = 3;
const ALLOCATION_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export type EcrPrePilotDesignAllocation = {
  id: number;
  projectNumber: number;
  status: string;
  existing: boolean;
  inputData: unknown;
};

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

function assertValidAllocationKey(allocationKey: string): void {
  if (!ALLOCATION_KEY_PATTERN.test(allocationKey)) {
    throw new Error("Idempotency-Key must contain 16–128 letters, numbers, underscores, or hyphens.");
  }
}

/**
 * Allocates one immutable ECR Pre-Pilot project number.
 *
 * The counter update, append-only allocation record, and draft record are one
 * transaction. A number is returned only after the transaction commits.
 */
export async function allocateEcrPrePilotDesign(
  userId: number,
  allocationKey: string,
): Promise<EcrPrePilotDesignAllocation> {
  if (!Number.isInteger(userId) || userId < 1) {
    throw new Error("Authenticated user is required.");
  }
  assertValidAllocationKey(allocationKey);

  for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existingAllocation = await client.query<{
        project_number: number;
      }>(
        `SELECT project_number
           FROM ecr_pre_pilot_number_allocations
          WHERE allocated_by = $1 AND allocation_key = $2
          FOR UPDATE`,
        [userId, allocationKey],
      );

      if (existingAllocation.rows[0]) {
        const existingDesign = await client.query<{ id: number; status: string; input_data: unknown }>(
          `SELECT id, status, input_data
             FROM ecr_pre_pilot_designs
            WHERE project_number = $1`,
          [existingAllocation.rows[0].project_number],
        );
        if (!existingDesign.rows[0]) {
          throw new Error("The existing project-number allocation has no design record.");
        }
        const existing = existingDesign.rows[0];
        await client.query("COMMIT");
        return {
          id: Number(existing.id),
          projectNumber: Number(existingAllocation.rows[0].project_number),
          status: existing.status,
          existing: true,
          inputData: existing.input_data,
        };
      }

      await client.query(
        `INSERT INTO ecr_pre_pilot_number_counters (id, next_number)
         VALUES ($1, 1)
         ON CONFLICT (id) DO NOTHING`,
        [COUNTER_ROW_ID],
      );

      const nextNumber = await client.query<{ project_number: number }>(
        `UPDATE ecr_pre_pilot_number_counters
            SET next_number = next_number + 1
          WHERE id = $1
      RETURNING next_number - 1 AS project_number`,
        [COUNTER_ROW_ID],
      );
      if (!nextNumber.rows[0]) {
        throw new Error("Project-number counter is unavailable.");
      }

      const projectNumber = Number(nextNumber.rows[0].project_number);
      await client.query(
        `INSERT INTO ecr_pre_pilot_number_allocations
          (project_number, allocation_key, allocated_by)
         VALUES ($1, $2, $3)`,
        [projectNumber, allocationKey, userId],
      );

      const design = await client.query<{ id: number; status: string }>(
        `INSERT INTO ecr_pre_pilot_designs
          (project_number, allocation_key, created_by, status, input_data)
         VALUES ($1, $2, $3, 'draft', '{}'::jsonb)
      RETURNING id, status`,
        [projectNumber, allocationKey, userId],
      );
      if (!design.rows[0]) {
        throw new Error("ECR Pre-Pilot design could not be created.");
      }

      await client.query("COMMIT");
      return {
        id: Number(design.rows[0].id),
        projectNumber,
        status: design.rows[0].status,
        existing: false,
        inputData: {},
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (isUniqueViolation(error) && attempt < MAX_ALLOCATION_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  throw new Error("Project-number allocation could not be completed.");
}

export async function saveEcrPrePilotStage1(
  userId: number,
  designId: number,
  rawInput: unknown,
): Promise<EcrPrePilotStage1Snapshot> {
  const design = await pool.query<{ project_number: number }>(
    `SELECT project_number
       FROM ecr_pre_pilot_designs
      WHERE id = $1 AND created_by = $2`,
    [designId, userId],
  );
  if (!design.rows[0]) throw new Error("ECR_PRE_PILOT_DESIGN_NOT_FOUND");
  const stage1 = canonicalizeStage1Input(rawInput, Number(design.rows[0].project_number));
  const snapshot = makeStage1Snapshot(stage1);
  const updated = await pool.query(
    `UPDATE ecr_pre_pilot_designs
        SET input_data = $3, updated_at = NOW()
      WHERE id = $1 AND created_by = $2
      RETURNING id`,
    [designId, userId, snapshot],
  );
  if (!updated.rows[0]) throw new Error("ECR_PRE_PILOT_DESIGN_NOT_FOUND");
  return snapshot;
}