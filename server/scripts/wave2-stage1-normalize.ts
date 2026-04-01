import { db } from '../db';
import { sql } from 'drizzle-orm';

interface LegacyMetadata {
  sourceTable: string;
  sourceRecordId: number;
  legacyDrawingNumber: string;
  legacyDrawingTitle: string;
  legacyRevisionLabel: string;
  legacyGcsPath: string;
  legacyCategory?: string;
  legacyDiscipline?: string;
  migrationTimestamp: string;
  migrationPhase: 'stage1_normalization';
}

interface DrawingControlInsert {
  projectId: number;
  projectItemId: number | null;
  masterItemId: number | null;
  designDrawingId: number | null;
  dwgControlNumber: string;
  revisionCode: string;
  isCurrent: boolean;
  revisionStatus: string;
  supersedesId: number | null;
  drawingNumber: string | null;
  drawingTitle: string | null;
  drawingCategory: string | null;
  disciplineCode: string | null;
  drawingPurpose: string;
  status: string;
  notes: string;
  legacyMetadata: LegacyMetadata;
  createdBy: number;
}

async function stage1() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   WAVE 2 STAGE 1 — DRAWING CONTROL NORMALIZATION                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Step 1: Schema alterations
  console.log('--- Step 1: Schema alterations ---');
  
  try {
    await db.execute(sql`ALTER TABLE epc_drawing_controls ALTER COLUMN project_item_id DROP NOT NULL`);
    console.log('  project_item_id → nullable ✓');
  } catch (e: any) {
    if (e.message?.includes('already')) console.log('  project_item_id already nullable ✓');
    else console.log('  project_item_id alter: ' + e.message);
  }

  try {
    await db.execute(sql`ALTER TABLE epc_drawing_controls ALTER COLUMN master_item_id DROP NOT NULL`);
    console.log('  master_item_id → nullable ✓');
  } catch (e: any) {
    if (e.message?.includes('already')) console.log('  master_item_id already nullable ✓');
    else console.log('  master_item_id alter: ' + e.message);
  }

  const hasLegacyCol = await db.execute(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'epc_drawing_controls' AND column_name = 'legacy_metadata'
  `);
  if (hasLegacyCol.rows.length === 0) {
    await db.execute(sql`ALTER TABLE epc_drawing_controls ADD COLUMN legacy_metadata jsonb`);
    console.log('  legacy_metadata JSONB column added ✓');
  } else {
    console.log('  legacy_metadata column already exists ✓');
  }

  try {
    await db.execute(sql`ALTER TABLE epc_drawing_controls DROP CONSTRAINT epc_drawing_controls_dwg_control_number_key`);
    console.log('  Dropped unique(dwg_control_number) — revision chains share same doc number ✓');
  } catch (e: any) {
    if (e.message?.includes('does not exist')) console.log('  unique(dwg_control_number) already dropped ✓');
    else console.log('  Drop constraint: ' + e.message);
  }

  try {
    await db.execute(sql`ALTER TABLE epc_drawing_controls ALTER COLUMN discipline_code TYPE varchar(50)`);
    console.log('  discipline_code widened to varchar(50) ✓');
  } catch (e: any) {
    console.log('  discipline_code alter: ' + e.message);
  }
  console.log('');

  // Step 2: Gather data
  console.log('--- Step 2: Gathering legacy drawing data ---');

  const allVersions = await db.execute(sql`
    SELECT 
      dv.id as version_id, dv.drawing_id, dv.version, dv.revision, dv.file_path,
      dv.is_latest_version,
      dd.id as dd_id, dd.drawing_number, dd.drawing_title, dd.category,
      dd.discipline_code, dd.status as drawing_status,
      dp.project_id as proj_id,
      p.code as project_code, p.operational_code
    FROM drawing_versions dv
    JOIN design_drawings dd ON dv.drawing_id = dd.id
    LEFT JOIN design_projects dp ON dd.design_project_id = dp.id
    LEFT JOIN projects p ON dp.project_id = p.id
    ORDER BY dv.drawing_id, dv.version
  `);

  const allBasics = await db.execute(sql`
    SELECT 
      bd.id as basic_id, bd.project_id, bd.drawing_type, bd.file_path,
      bd.revision, bd.status, bd.discipline, bd.is_revision, bd.revision_of,
      p.code as project_code, p.operational_code
    FROM design_basic_drawings bd
    LEFT JOIN projects p ON bd.project_id = p.id
    ORDER BY bd.id
  `);

  // Group drawing_versions by drawing_id
  const versionsByDrawing = new Map<number, any[]>();
  for (const v of allVersions.rows as any[]) {
    if (!versionsByDrawing.has(v.drawing_id)) versionsByDrawing.set(v.drawing_id, []);
    versionsByDrawing.get(v.drawing_id)!.push(v);
  }

  // Get unique drawings (excluding bad data: drawing ID 41 with empty number)
  const uniqueDrawings = new Map<number, any>();
  for (const v of allVersions.rows as any[]) {
    if (!uniqueDrawings.has(v.drawing_id)) {
      uniqueDrawings.set(v.drawing_id, v);
    }
  }

  // Identify bad data
  const badDrawings: any[] = [];
  const goodDrawings: any[] = [];
  for (const [drawingId, d] of uniqueDrawings) {
    const versions = versionsByDrawing.get(drawingId) || [];
    const hasEmptyNumber = !d.drawing_number || d.drawing_number.trim() === '';
    const hasBrokenPath = versions.some((v: any) => !v.file_path || v.file_path.includes('//'));
    if (hasEmptyNumber || hasBrokenPath) {
      badDrawings.push({ ...d, versions });
    } else {
      goodDrawings.push({ ...d, versions });
    }
  }

  console.log('  Good design_drawings: ' + goodDrawings.length);
  console.log('  Bad design_drawings (excluded): ' + badDrawings.length);
  for (const bad of badDrawings) {
    console.log('    EXCLUDED: DD-' + bad.dd_id + ' "' + (bad.drawing_number || '') + '" — ' +
      (bad.versions.map((v: any) => 'DV-' + v.version_id + ': ' + v.file_path).join('; ')));
  }

  // Basic drawings: group BD-1/2/3 as one logical drawing
  const basicGroups = new Map<string, any[]>();
  for (const b of allBasics.rows as any[]) {
    const key = b.project_id + '::' + b.drawing_type;
    if (!basicGroups.has(key)) basicGroups.set(key, []);
    basicGroups.get(key)!.push(b);
  }
  console.log('  Basic drawing groups: ' + basicGroups.size);
  for (const [key, group] of basicGroups) {
    console.log('    Group "' + key + '": ' + group.length + ' revisions (BD-' + group.map((g: any) => g.basic_id).join(', BD-') + ')');
  }
  console.log('');

  // Step 3: Generate EPC document numbers
  console.log('--- Step 3: Generating EPC DWG document numbers ---');

  const opCodeSeqs = new Map<string, number>();

  // Check existing epc_drawing_controls for sequence collisions
  const existingControls = await db.execute(sql`
    SELECT dwg_control_number FROM epc_drawing_controls
  `);
  const existingNumbers = new Set((existingControls.rows as any[]).map(r => r.dwg_control_number));

  function nextDwgNumber(opCode: string): string {
    let seq = (opCodeSeqs.get(opCode) || 0) + 1;
    let candidate: string;
    do {
      candidate = opCode + '-DWG-' + String(seq).padStart(4, '0');
      seq++;
    } while (existingNumbers.has(candidate));
    opCodeSeqs.set(opCode, seq - 1);
    existingNumbers.add(candidate);
    return candidate;
  }

  // Build inserts for design_drawings
  const allInserts: DrawingControlInsert[][] = []; // grouped by drawing
  const revisionLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (const d of goodDrawings) {
    const versions = d.versions as any[];
    const opCode = d.operational_code;
    const dwgNumber = nextDwgNumber(opCode);
    const group: DrawingControlInsert[] = [];

    for (let i = 0; i < versions.length; i++) {
      const v = versions[i];
      const revCode = revisionLetters[i];
      const isCurrent = i === versions.length - 1;

      group.push({
        projectId: d.proj_id,
        projectItemId: null,
        masterItemId: null,
        designDrawingId: d.dd_id,
        dwgControlNumber: dwgNumber,
        revisionCode: revCode,
        isCurrent,
        revisionStatus: isCurrent ? 'approved' : 'superseded',
        supersedesId: null, // will be linked after insert
        drawingNumber: d.drawing_number,
        drawingTitle: d.drawing_title,
        drawingCategory: d.category,
        disciplineCode: d.discipline_code || null,
        drawingPurpose: 'general',
        status: isCurrent ? 'approved' : 'superseded',
        notes: 'Migration: Wave 2 Stage 1 normalization',
        legacyMetadata: {
          sourceTable: 'drawing_versions',
          sourceRecordId: v.version_id,
          legacyDrawingNumber: d.drawing_number,
          legacyDrawingTitle: d.drawing_title || '',
          legacyRevisionLabel: v.revision || 'R' + v.version,
          legacyGcsPath: v.file_path,
          legacyCategory: d.category,
          legacyDiscipline: d.discipline_code,
          migrationTimestamp: new Date().toISOString(),
          migrationPhase: 'stage1_normalization',
        },
        createdBy: 3, // system/superuser
      });
    }
    allInserts.push(group);
  }

  // Build inserts for basic drawing groups
  for (const [key, group] of basicGroups) {
    const sorted = group.sort((a: any, b: any) => a.basic_id - b.basic_id);
    const opCode = sorted[0].operational_code;
    const dwgNumber = nextDwgNumber(opCode);
    const inserts: DrawingControlInsert[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const b = sorted[i];
      const revCode = revisionLetters[i];
      const isCurrent = i === sorted.length - 1;

      inserts.push({
        projectId: b.project_id,
        projectItemId: null,
        masterItemId: null,
        designDrawingId: null,
        dwgControlNumber: dwgNumber,
        revisionCode: revCode,
        isCurrent,
        revisionStatus: isCurrent ? 'approved' : 'superseded',
        supersedesId: null,
        drawingNumber: null,
        drawingTitle: b.drawing_type,
        drawingCategory: 'Basic Drawing',
        disciplineCode: b.discipline || null,
        drawingPurpose: 'general',
        status: isCurrent ? 'approved' : 'superseded',
        notes: 'Migration: Wave 2 Stage 1 normalization',
        legacyMetadata: {
          sourceTable: 'design_basic_drawings',
          sourceRecordId: b.basic_id,
          legacyDrawingNumber: b.drawing_type,
          legacyDrawingTitle: b.drawing_type,
          legacyRevisionLabel: b.revision || 'R' + (i + 1),
          legacyGcsPath: b.file_path,
          legacyCategory: 'Basic Drawing',
          legacyDiscipline: b.discipline,
          migrationTimestamp: new Date().toISOString(),
          migrationPhase: 'stage1_normalization',
        },
        createdBy: 3,
      });
    }
    allInserts.push(inserts);
  }

  // Print proposed mapping
  console.log('');
  console.log('  ┌─────┬──────────────────────────────────────────────┬──────┬──────────┬────────────────────────────────┐');
  console.log('  │ #   │ EPC Document Number                         │ Rev  │ Current  │ Legacy Source                 │');
  console.log('  ├─────┼──────────────────────────────────────────────┼──────┼──────────┼────────────────────────────────┤');
  let rowNum = 0;
  for (const group of allInserts) {
    for (const ins of group) {
      rowNum++;
      const num = String(rowNum).padEnd(3);
      const epc = ins.dwgControlNumber.padEnd(44);
      const rev = ins.revisionCode.padEnd(4);
      const cur = (ins.isCurrent ? 'YES' : 'no').padEnd(8);
      const src = (ins.legacyMetadata.sourceTable.replace('drawing_versions', 'DV').replace('design_basic_drawings', 'BD') +
        '-' + ins.legacyMetadata.sourceRecordId + ' ' + ins.legacyMetadata.legacyRevisionLabel).padEnd(30);
      console.log('  │ ' + num + ' │ ' + epc + ' │ ' + rev + ' │ ' + cur + ' │ ' + src + ' │');
    }
  }
  console.log('  └─────┴──────────────────────────────────────────────┴──────┴──────────┴────────────────────────────────┘');
  console.log('  Total rows: ' + rowNum);
  console.log('');

  // Step 4: Execute inserts inside transaction
  console.log('--- Step 4: Inserting EPC Drawing Control records ---');

  let totalInserted = 0;
  let totalDrawings = 0;

  await db.transaction(async (tx) => {
    for (const group of allInserts) {
      totalDrawings++;
      let previousId: number | null = null;

      for (const ins of group) {
        const result = await tx.execute(sql`
          INSERT INTO epc_drawing_controls (
            project_id, project_item_id, master_item_id, design_drawing_id,
            dwg_control_number, revision_code, is_current, revision_status,
            supersedes_id, drawing_number, drawing_title, drawing_category,
            discipline_code, drawing_purpose, status, notes, legacy_metadata,
            created_by, created_at, updated_at
          ) VALUES (
            ${ins.projectId}, ${ins.projectItemId}, ${ins.masterItemId}, ${ins.designDrawingId},
            ${ins.dwgControlNumber}, ${ins.revisionCode}, ${ins.isCurrent}, ${ins.revisionStatus},
            ${previousId}, ${ins.drawingNumber}, ${ins.drawingTitle}, ${ins.drawingCategory},
            ${ins.disciplineCode}, ${ins.drawingPurpose}, ${ins.status}, ${ins.notes},
            ${JSON.stringify(ins.legacyMetadata)}::jsonb,
            ${ins.createdBy}, NOW(), NOW()
          ) RETURNING id
        `);

        const insertedId = (result.rows[0] as any).id;
        previousId = insertedId;
        totalInserted++;
        console.log('  Inserted EDC-' + insertedId + ': ' + ins.dwgControlNumber + ' rev-' + ins.revisionCode +
          ' (is_current=' + ins.isCurrent + ', supersedes=' + (ins.supersedesId || previousId === insertedId ? 'none' : 'EDC-' + (insertedId - 1)) + ')');
      }
    }
  });

  console.log('');
  console.log('  Total drawings: ' + totalDrawings);
  console.log('  Total rows inserted: ' + totalInserted);
  console.log('');

  // Step 5: Verify
  console.log('--- Step 5: Verification ---');

  const verifyCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM epc_drawing_controls`);
  console.log('  epc_drawing_controls total rows: ' + (verifyCount.rows[0] as any).cnt);

  const verifyByDoc = await db.execute(sql`
    SELECT dwg_control_number, COUNT(*) as rev_count, 
           SUM(CASE WHEN is_current THEN 1 ELSE 0 END) as current_count
    FROM epc_drawing_controls 
    GROUP BY dwg_control_number 
    ORDER BY dwg_control_number
  `);
  console.log('  Drawing controls by document number:');
  for (const r of verifyByDoc.rows as any[]) {
    const currentOk = parseInt(r.current_count) === 1;
    console.log('    ' + r.dwg_control_number + ': ' + r.rev_count + ' revisions, ' +
      r.current_count + ' current ' + (currentOk ? '✓' : '✗ ERROR'));
  }

  const verifyLegacy = await db.execute(sql`
    SELECT id, dwg_control_number, revision_code, is_current, legacy_metadata->>'sourceTable' as src_table,
           legacy_metadata->>'sourceRecordId' as src_id, legacy_metadata->>'legacyDrawingNumber' as legacy_num,
           legacy_metadata->>'legacyRevisionLabel' as legacy_rev, legacy_metadata->>'legacyGcsPath' as legacy_path
    FROM epc_drawing_controls
    WHERE legacy_metadata IS NOT NULL
    ORDER BY id
  `);
  console.log('');
  console.log('  Legacy traceability verification:');
  let traceOk = 0;
  for (const r of verifyLegacy.rows as any[]) {
    const hasAll = r.src_table && r.src_id && r.legacy_path;
    if (hasAll) traceOk++;
    console.log('    EDC-' + r.id + ' ' + r.dwg_control_number + ' rev-' + r.revision_code +
      ' ← ' + r.src_table + '-' + r.src_id + ' "' + (r.legacy_num || '') + '" ' + r.legacy_rev +
      ' [' + r.legacy_path + '] ' + (hasAll ? '✓' : '✗'));
  }

  const verifySupersedes = await db.execute(sql`
    SELECT id, dwg_control_number, revision_code, supersedes_id 
    FROM epc_drawing_controls
    WHERE legacy_metadata IS NOT NULL
    ORDER BY dwg_control_number, revision_code
  `);
  console.log('');
  console.log('  Supersedes chain verification:');
  let chainOk = true;
  const byDoc = new Map<string, any[]>();
  for (const r of verifySupersedes.rows as any[]) {
    if (!byDoc.has(r.dwg_control_number)) byDoc.set(r.dwg_control_number, []);
    byDoc.get(r.dwg_control_number)!.push(r);
  }
  for (const [docNum, revs] of byDoc) {
    if (revs.length === 1) {
      const ok = revs[0].supersedes_id === null;
      console.log('    ' + docNum + ': single rev, supersedes_id=null ' + (ok ? '✓' : '✗'));
      if (!ok) chainOk = false;
    } else {
      for (let i = 0; i < revs.length; i++) {
        const r = revs[i];
        if (i === 0) {
          const ok = r.supersedes_id === null;
          console.log('    ' + docNum + ' rev-' + r.revision_code + ': supersedes=null (first) ' + (ok ? '✓' : '✗'));
          if (!ok) chainOk = false;
        } else {
          const ok = r.supersedes_id === revs[i - 1].id;
          console.log('    ' + docNum + ' rev-' + r.revision_code + ': supersedes=EDC-' + r.supersedes_id +
            ' (expected EDC-' + revs[i - 1].id + ') ' + (ok ? '✓' : '✗'));
          if (!ok) chainOk = false;
        }
      }
    }
  }

  // Final summary
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║ STAGE 1 NORMALIZATION RESULT                                             ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════╣');
  console.log('║ Unique EPC DWG document numbers:   ' + String(totalDrawings).padEnd(5) + '                              ║');
  console.log('║ Total EPC Drawing Control rows:     ' + String(totalInserted).padEnd(5) + '                              ║');
  console.log('║ Excluded bad data:                  1     (DD-41 / DV-37)              ║');
  console.log('║ Legacy traceability:                ' + String(traceOk + '/' + totalInserted).padEnd(5) + ' rows have full metadata       ║');
  console.log('║ Supersedes chains:                  ' + (chainOk ? 'ALL VALID ✓' : 'ERRORS ✗  ').padEnd(15) + '                    ║');
  console.log('║ is_current = 1 per drawing:         ' + (verifyByDoc.rows.every((r: any) => parseInt(r.current_count) === 1) ? 'ALL VALID ✓' : 'ERRORS ✗  ').padEnd(15) + '                    ║');
  console.log('║                                                                          ║');
  console.log('║ Stage 2 (file copy) NOT started — awaiting approval.                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');

  process.exit(0);
}

stage1().catch(e => {
  console.error('STAGE 1 FAILED:', e);
  process.exit(1);
});
