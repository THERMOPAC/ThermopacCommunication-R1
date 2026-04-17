/**
 * DVS Step 4 — Build Verification Evidence Script
 *
 * Run: npx tsx server/scripts/test-dvs-step4-evidence.ts
 */

import CFB from 'cfb';
import { createHash } from 'crypto';
import { Client } from 'pg';
import gcsClient, { bucketName } from '../utils/storage-config';
import { EXTRACTION_ENGINE_VERSION } from '../utils/ole-extractor';
import { RULE_ENGINE_VERSION } from '../utils/rule-engine';
import { AGENT_VERSION } from '../utils/agent-reviewer';

const BASE = 'http://localhost:5000';
const SEP  = '═'.repeat(72);

// ─── OLE builder ─────────────────────────────────────────────────────────────

function padTo4(n: number) { return Math.ceil(n / 4) * 4; }
function propLpstr(s: string): Buffer {
  const raw = Buffer.from(s + '\0', 'latin1');
  const buf = Buffer.alloc(4 + 4 + padTo4(raw.length), 0);
  buf.writeUInt32LE(0x001E, 0); buf.writeUInt32LE(raw.length, 4); raw.copy(buf, 8);
  return buf;
}
function buildPropSection(entries: Array<{ id: number; value: Buffer }>): Buffer {
  const hSize = 8 + entries.length * 8;
  let offset = hSize;
  const offsets = entries.map(e => { const o = offset; offset += e.value.length; return o; });
  const buf = Buffer.alloc(offset, 0);
  buf.writeUInt32LE(offset, 0); buf.writeUInt32LE(entries.length, 4);
  entries.forEach((e, i) => { buf.writeUInt32LE(e.id, 8+i*8); buf.writeUInt32LE(offsets[i], 8+i*8+4); });
  let pos = hSize;
  for (const e of entries) { e.value.copy(buf, pos); pos += e.value.length; }
  return buf;
}
function buildHeader1(fmtidHex: string, sectionOffset: number): Buffer {
  const h = Buffer.alloc(48, 0);
  h.writeUInt16LE(0xFFFE,0); h.writeUInt32LE(0x00020006,4); h.writeUInt32LE(1,24);
  Buffer.from(fmtidHex,'hex').copy(h,28); h.writeUInt32LE(sectionOffset,44);
  return h;
}
function buildHeader2(f0: string, o0: number, f1: string, o1: number): Buffer {
  const h = Buffer.alloc(68, 0);
  h.writeUInt16LE(0xFFFE,0); h.writeUInt32LE(0x00020006,4); h.writeUInt32LE(2,24);
  Buffer.from(f0,'hex').copy(h,28); h.writeUInt32LE(o0,44);
  Buffer.from(f1,'hex').copy(h,48); h.writeUInt32LE(o1,64);
  return h;
}
function buildDictionary(nameMap: Record<number, string>): Buffer {
  const entries = Object.entries(nameMap).map(([pid, name]) => ({ pid: +pid, name }));
  let size = 4;
  for (const e of entries) size += 4 + 4 + padTo4(Buffer.byteLength(e.name+'\0','latin1'));
  const buf = Buffer.alloc(size, 0);
  buf.writeUInt32LE(entries.length, 0);
  let pos = 4;
  for (const e of entries) {
    const nb = Buffer.from(e.name+'\0','latin1');
    buf.writeUInt32LE(e.pid,pos); buf.writeUInt32LE(nb.length,pos+4); nb.copy(buf,pos+8);
    pos += 4+4+padTo4(nb.length);
  }
  return buf;
}
const SI='e0859ff2f94f6810ab9108002b27b3d9', D0='02d5cdd59c2e1b10939708002b2cf9ae', D1='05d5cdd59c2e1b10939708002b2cf9ae';
function buildSlddrw(o:{drawingNumber:string;revision:string;title:string;author:string;scale?:string;sheetSize?:string;description?:string}):Buffer{
  const{drawingNumber,revision,title,author,scale='1:10',sheetSize='A3',description=''}=o;
  const siSec=buildPropSection([{id:2,value:propLpstr(title)},{id:4,value:propLpstr(author)},{id:8,value:propLpstr(author)},{id:9,value:propLpstr(revision)},{id:18,value:propLpstr('SOLIDWORKS')}]);
  const siStream=Buffer.concat([buildHeader1(SI,48),siSec]);
  const dsi0=buildPropSection([{id:15,value:propLpstr('THERMOPAC')}]);
  const dict=buildDictionary({2:'DrawingNumber',3:'Revision',4:'DrawnBy',5:'Scale',6:'SheetSize',7:'Description'});
  const dsi1=buildPropSection([{id:0,value:dict},{id:2,value:propLpstr(drawingNumber)},{id:3,value:propLpstr(revision)},{id:4,value:propLpstr(author)},{id:5,value:propLpstr(scale)},{id:6,value:propLpstr(sheetSize)},{id:7,value:propLpstr(description)}]);
  const dsiStream=Buffer.concat([buildHeader2(D0,68,D1,68+dsi0.length),dsi0,dsi1]);
  const cfb=CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb,'/\x05SummaryInformation',siStream);
  CFB.utils.cfb_add(cfb,'/\x05DocumentSummaryInformation',dsiStream);
  return Buffer.from(CFB.write(cfb,{type:'buffer'})as Uint8Array);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function login():Promise<string>{
  const r=await fetch(`${BASE}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'dvs_test_user',password:'TestPass@DVS1'}),redirect:'manual'});
  const cookie=(r.headers.getSetCookie?.()??[]).map(c=>c.split(';')[0]).join('; ');
  if(!cookie)throw new Error(`Login failed HTTP ${r.status}`);
  return cookie;
}
async function uploadRevision(pg:Client,opts:{projectId:number;projectCode:string;drawingNumber:string;revision:string;title:string;fileBuffer:Buffer}):Promise<number>{
  const{projectId,projectCode,drawingNumber,revision,title,fileBuffer}=opts;
  const checksum=createHash('sha256').update(fileBuffer).digest('hex');
  const filename=`${drawingNumber}-rev${revision}.slddrw`;
  const gcsPath=`TPEL/STAGING/DRAWINGS/${projectCode}/${drawingNumber}/rev-${revision}/original/${filename}`;
  await gcsClient.bucket(bucketName).file(gcsPath).save(fileBuffer,{metadata:{contentType:'application/octet-stream'}});
  const res=await pg.query(`INSERT INTO drawing_revisions(project_id,project_code,drawing_number,revision,title,item_code,discipline,file_type,checksum,storage_zone,uploaded_by,uploaded_at,original_filename,gcs_staging_path,file_size_bytes,status)VALUES($1,$2,$3,$4,$5,NULL,NULL,'slddrw',$6,'STAGING','evidence-script',NOW(),$7,$8,$9,'uploaded')RETURNING id`,[projectId,projectCode,drawingNumber,revision,title,checksum,filename,gcsPath,fileBuffer.length]);
  return res.rows[0].id;
}
async function api(cookie:string,method:string,path:string):Promise<{status:number;body:any}>{
  const r=await fetch(`${BASE}${path}`,{method,headers:{Cookie:cookie}});
  const body=await r.json().catch(()=>({}));
  return{status:r.status,body};
}
let pass=0,fail=0;
function assert(label:string,ok:boolean,detail?:any){
  if(ok){console.log(`  ✅  ${label}`);pass++;}
  else{console.log(`  ❌  ${label}${detail!==undefined?' — '+JSON.stringify(detail):''}`);fail++;}
}
function print(label:string,value:any){
  console.log(`  ${label.padEnd(38)} ${JSON.stringify(value)??'(null)'}`);
}

const ids:number[]=[];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(){
  console.log(SEP);
  console.log('DVS STEP 4 — AGENT LAYER BUILD VERIFICATION');
  console.log(`  Agent version          : ${AGENT_VERSION}`);
  console.log(`  Rule Engine version    : ${RULE_ENGINE_VERSION}`);
  console.log(`  Extraction version     : ${EXTRACTION_ENGINE_VERSION}`);
  console.log(SEP+'\n');

  const pg=new Client({connectionString:process.env.DATABASE_URL});
  await pg.connect();
  const cookie=await login();
  console.log('Authenticated as dvs_test_user ✅\n');

  const PID=30,CODE='2627-013';

  // Setup: two drawings — one PASS, one FAIL
  const filePass=buildSlddrw({drawingNumber:'TPEL-2627-013-ME-030',revision:'A',title:'Nozzle Flange',author:'V. Joshi',scale:'1:5',sheetSize:'A2',description:'Nozzle flange detail'});
  const fileFail=buildSlddrw({drawingNumber:'TPEL-WRONG-888',revision:'Z',title:'Bad Drawing',author:'V. Joshi',scale:'1:5',sheetSize:'A2',description:'Intentional mismatch'});

  const revPass=await uploadRevision(pg,{projectId:PID,projectCode:CODE,drawingNumber:'TPEL-2627-013-ME-030',revision:'A',title:'Nozzle Flange',fileBuffer:filePass});
  const revFail=await uploadRevision(pg,{projectId:PID,projectCode:CODE,drawingNumber:'TPEL-2627-013-ME-031',revision:'A',title:'Bad Drawing',fileBuffer:fileFail});
  ids.push(revPass,revFail);
  console.log(`  Test revisions: revPass=${revPass}, revFail=${revFail}\n`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST A: Trigger guard — status 'uploaded' rejected
  // ──────────────────────────────────────────────────────────────────────────
  console.log(SEP);
  console.log('TEST A: Trigger guard — status "uploaded" rejected before agent review');
  console.log(SEP);
  const guardA=await api(cookie,'POST',`/api/drawing-revisions/${revPass}/agent-review`);
  print('HTTP status', guardA.status);
  print('error',       guardA.body.error);
  print('reason',      guardA.body.reason);
  assert('HTTP 422',                          guardA.status===422);
  assert('error = TRIGGER_GUARD_FAILED',      guardA.body.error==='TRIGGER_GUARD_FAILED');
  assert('reason = status_not_eligible',      guardA.body.reason==='status_not_eligible');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST B: Trigger guard — no evaluation record
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n'+SEP);
  console.log('TEST B: Trigger guard — "evaluated" status but no rule_evaluations row');
  console.log(SEP);
  await pg.query(`UPDATE drawing_revisions SET status='evaluated' WHERE id=$1`,[revPass]);
  const guardB=await api(cookie,'POST',`/api/drawing-revisions/${revPass}/agent-review`);
  print('HTTP status', guardB.status);
  print('error',       guardB.body.error);
  print('reason',      guardB.body.reason);
  assert('HTTP 422',                     guardB.status===422);
  assert('error = NO_EVALUATION',        guardB.body.error==='NO_EVALUATION');
  assert('reason = evaluation_required', guardB.body.reason==='evaluation_required');
  await pg.query(`UPDATE drawing_revisions SET status='uploaded' WHERE id=$1`,[revPass]);

  // ──────────────────────────────────────────────────────────────────────────
  // Extract + Evaluate both revisions to get them to 'evaluated' status
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n  Extracting and evaluating both revisions...');
  await api(cookie,'POST',`/api/drawing-revisions/${revPass}/extract`);
  await api(cookie,'POST',`/api/drawing-revisions/${revPass}/evaluate`);
  await api(cookie,'POST',`/api/drawing-revisions/${revFail}/extract`);
  await api(cookie,'POST',`/api/drawing-revisions/${revFail}/evaluate`);
  const statusCheck=await pg.query('SELECT id,status FROM drawing_revisions WHERE id=ANY($1)',[ids]);
  for(const r of statusCheck.rows) console.log(`  revision ${r.id}: status=${r.status}`);
  console.log('');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST C: Full agent review — PASS verdict
  // ──────────────────────────────────────────────────────────────────────────
  console.log(SEP);
  console.log('TEST C: Full agent review — PASS drawing');
  console.log(SEP);
  const agentC=await api(cookie,'POST',`/api/drawing-revisions/${revPass}/agent-review`);
  print('\nHTTP status',        agentC.status);
  print('id',                   agentC.body.id);
  print('drawing_revision_id',  agentC.body.drawingRevisionId);
  print('rule_evaluation_id',   agentC.body.ruleEvaluationId);
  print('agent_version',        agentC.body.agentVersion);
  print('generated_by',         agentC.body.generatedBy);
  print('overall_assessment',   agentC.body.overallAssessment);
  print('summary (truncated)',   agentC.body.summary?.slice(0,80)+'…');
  print('critical_failures',    agentC.body.criticalFailures);
  print('warnings',             agentC.body.warnings);
  print('recommendations (trunc)', agentC.body.recommendations?.slice(0,80)+'…');
  print('raw_response length',  agentC.body.rawResponse?.length);
  print('_note',                agentC.body._note);

  const statusC=await pg.query('SELECT status FROM drawing_revisions WHERE id=$1',[revPass]);
  assert('\nHTTP 200',                                     agentC.status===200);
  assert('overall_assessment = PASS_SUMMARY',              agentC.body.overallAssessment==='PASS_SUMMARY');
  assert('agent_version = '+AGENT_VERSION,                 agentC.body.agentVersion===AGENT_VERSION);
  assert('generated_by = dvs_test_user',                   agentC.body.generatedBy==='dvs_test_user');
  assert('summary present and ≤ 300 chars',                typeof agentC.body.summary==='string'&&agentC.body.summary.length<=300);
  assert('critical_failures is []',                        JSON.stringify(agentC.body.criticalFailures)==='[]');
  assert('warnings is []',                                 JSON.stringify(agentC.body.warnings)==='[]');
  assert('recommendations present and ≤ 500 chars',        typeof agentC.body.recommendations==='string'&&agentC.body.recommendations.length<=500);
  assert('raw_response ≤ 2000 chars',                      typeof agentC.body.rawResponse==='string'&&agentC.body.rawResponse.length<=2000);
  assert('no _note (fresh generation)',                     !agentC.body._note);
  assert('status advanced to agent_reviewed',              statusC.rows[0].status==='agent_reviewed');
  const evalRowC=await pg.query('SELECT id FROM rule_evaluations WHERE drawing_revision_id=$1',[revPass]);
  assert('ruleEvaluationId matches current evaluation',    agentC.body.ruleEvaluationId===evalRowC.rows[0].id);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST D: Idempotency — cached response
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n'+SEP);
  console.log('TEST D: Idempotency — cached response');
  console.log(SEP);
  const agentD=await api(cookie,'POST',`/api/drawing-revisions/${revPass}/agent-review`);
  print('\n_note',                agentD.body._note);
  print('id (same)',             agentD.body.id);
  print('overall_assessment',   agentD.body.overallAssessment);
  assert('HTTP 200',             agentD.status===200);
  assert('_note = cached',       agentD.body._note==='cached');
  assert('id identical to TEST C', agentD.body.id===agentC.body.id);
  assert('overall_assessment unchanged', agentD.body.overallAssessment==='PASS_SUMMARY');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST E: Auto-regen on stale agent_version
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n'+SEP);
  console.log('TEST E: Auto-regen — stored agent_version is stale');
  console.log(SEP);
  await pg.query(`UPDATE agent_reports SET agent_version='0.5.0', generated_by='old-run' WHERE drawing_revision_id=$1`,[revPass]);
  const agentE=await api(cookie,'POST',`/api/drawing-revisions/${revPass}/agent-review`);
  print('\n_note',           agentE.body._note??'(absent — auto-regen)');
  print('agent_version',    agentE.body.agentVersion);
  print('generated_by',     agentE.body.generatedBy);
  assert('HTTP 200',                            agentE.status===200);
  assert('no _note (auto-regen)',               !agentE.body._note);
  assert('agent_version updated to '+AGENT_VERSION, agentE.body.agentVersion===AGENT_VERSION);
  assert('generated_by = dvs_test_user (caller)', agentE.body.generatedBy==='dvs_test_user');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST F: Auto-regen on stale rule_evaluation_id
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n'+SEP);
  console.log('TEST F: Auto-regen — stored rule_evaluation_id is stale');
  console.log(SEP);
  // Simulate a different (stale) evaluation ID by forcing a re-evaluation which changes nothing,
  // then backdating the stored rule_evaluation_id to the evaluation row's id - 1 (if it exists),
  // or to a fresh re-evaluate to get a current id and backdating the report's pointer.
  const currentEvalRow=await pg.query('SELECT id FROM rule_evaluations WHERE drawing_revision_id=$1',[revPass]);
  const currentEvalId=currentEvalRow.rows[0].id;
  // Backdate report's rule_evaluation_id using the fail revision's eval id (a valid FK, just wrong)
  const otherEvalRow=await pg.query('SELECT id FROM rule_evaluations WHERE drawing_revision_id=$1',[revFail]);
  if(otherEvalRow.rows.length>0){
    const otherEvalId=otherEvalRow.rows[0].id;
    await pg.query(`UPDATE agent_reports SET rule_evaluation_id=$1 WHERE drawing_revision_id=$2`,[otherEvalId,revPass]);
    const agentF=await api(cookie,'POST',`/api/drawing-revisions/${revPass}/agent-review`);
    print('\n_note',                agentF.body._note??'(absent — auto-regen)');
    print('rule_evaluation_id',    agentF.body.ruleEvaluationId);
    print('generated_by',          agentF.body.generatedBy);
    assert('HTTP 200',                                                        agentF.status===200);
    assert('no _note (auto-regen on eval id change)',                         !agentF.body._note);
    assert('ruleEvaluationId updated to current eval id',                     agentF.body.ruleEvaluationId===currentEvalId,agentF.body.ruleEvaluationId);
    assert('generated_by = dvs_test_user (caller)',                           agentF.body.generatedBy==='dvs_test_user');
  } else {
    console.log('  ⚠️  Skipped (no other eval row available for FK swap)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST G: force=true — always regenerates
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n'+SEP);
  console.log('TEST G: ?force=true — regenerates even when fresh');
  console.log(SEP);
  // Confirm it's currently cached
  const preG=await api(cookie,'POST',`/api/drawing-revisions/${revPass}/agent-review`);
  assert('pre-condition: cached',  preG.body._note==='cached');
  const agentG=await api(cookie,'POST',`/api/drawing-revisions/${revPass}/agent-review?force=true`);
  print('\n_note',            agentG.body._note??'(absent — forced)');
  print('generated_by',      agentG.body.generatedBy);
  print('overall_assessment',agentG.body.overallAssessment);
  assert('HTTP 200',                                    agentG.status===200);
  assert('no _note (forced)',                           !agentG.body._note);
  assert('generated_by = dvs_test_user',                agentG.body.generatedBy==='dvs_test_user');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST H: FAIL verdict — critical_failures populated
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n'+SEP);
  console.log('TEST H: FAIL verdict — agent reviews a FAIL drawing');
  console.log(SEP);
  const agentH=await api(cookie,'POST',`/api/drawing-revisions/${revFail}/agent-review`);
  print('\nHTTP status',       agentH.status);
  print('overall_assessment', agentH.body.overallAssessment);
  print('critical_failures',  agentH.body.criticalFailures);
  print('warnings',           agentH.body.warnings);
  print('summary (trunc)',    agentH.body.summary?.slice(0,80)+'…');
  assert('HTTP 200',                                               agentH.status===200);
  assert('overall_assessment = FAIL_SUMMARY',                      agentH.body.overallAssessment==='FAIL_SUMMARY');
  assert('critical_failures is non-empty array',                   Array.isArray(agentH.body.criticalFailures)&&agentH.body.criticalFailures.length>0);
  assert('each critical_failure has rule_id and explanation',
    agentH.body.criticalFailures.every((f:any)=>typeof f.rule_id==='string'&&typeof f.explanation==='string'));
  assert('summary ≤ 300 chars',  agentH.body.summary?.length<=300);
  assert('recommendations ≤ 500 chars', agentH.body.recommendations?.length<=500);
  const failStatusH=await pg.query('SELECT status FROM drawing_revisions WHERE id=$1',[revFail]);
  assert('status advanced to agent_reviewed', failStatusH.rows[0].status==='agent_reviewed');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST I: GET /:id/agent-report — success and 404
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n'+SEP);
  console.log('TEST I: GET /:id/agent-report — 200 with record, 404 without');
  console.log(SEP);

  // Create a fresh revision that has never been agent-reviewed
  const fileC=buildSlddrw({drawingNumber:'TPEL-2627-013-ME-032',revision:'A',title:'Cover Plate',author:'S. Nair',scale:'1:2',sheetSize:'A4',description:'Cover plate detail'});
  const revC=await uploadRevision(pg,{projectId:PID,projectCode:CODE,drawingNumber:'TPEL-2627-013-ME-032',revision:'A',title:'Cover Plate',fileBuffer:fileC});
  ids.push(revC);

  const getOk=await api(cookie,'GET',`/api/drawing-revisions/${revPass}/agent-report`);
  const get404=await api(cookie,'GET',`/api/drawing-revisions/${revC}/agent-report`);

  print('\nGET existing — HTTP status', getOk.status);
  print('overall_assessment',          getOk.body.overallAssessment);
  print('agent_version',               getOk.body.agentVersion);
  print('rule_results absent',         !('ruleResults' in getOk.body));

  print('\nGET missing  — HTTP status', get404.status);
  print('error',                        get404.body.error);

  assert('GET existing: HTTP 200',             getOk.status===200);
  assert('GET existing: overallAssessment present', typeof getOk.body.overallAssessment==='string');
  assert('GET existing: agentVersion present',      getOk.body.agentVersion===AGENT_VERSION);
  assert('GET missing:  HTTP 404',             get404.status===404);
  assert('GET missing:  error message present', typeof get404.body.error==='string');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST J: Boundary — AI input contains only rule_results, extraction_gate, overall_verdict
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n'+SEP);
  console.log('TEST J: Boundary — agent-reviewer.ts imports and prompt content');
  console.log(SEP);
  const{readFileSync}=await import('fs');
  const src=readFileSync('server/utils/agent-reviewer.ts','utf-8');
  const importLines=src.split('\n').filter(l=>l.startsWith('import'));
  console.log('\n  Imports in agent-reviewer.ts:');
  for(const l of importLines) console.log(`    ${l}`);
  const hasGcs     =importLines.some(l=>l.includes('storage')||l.includes('gcs')||l.includes('bucket'));
  const hasFs      =importLines.some(l=>l.includes("'fs'") ||l.includes('"fs"'));
  const hasOle     =importLines.some(l=>l.includes('ole-extractor')||l.includes('extractDrawing'));
  const hasExtract =importLines.some(l=>l.includes('drawing_extractions')||l.includes('drawingExtractions'));
  console.log('');
  assert('no GCS / storage imports',      !hasGcs);
  assert('no fs imports',                 !hasFs);
  assert('no ole-extractor imports',      !hasOle);
  assert('no drawing_extractions imports',!hasExtract);

  const promptStart=src.indexOf('const SYSTEM_PROMPT');
  const promptEnd  =src.indexOf('`;',promptStart)+2;
  const prompt=src.slice(promptStart,promptEnd);
  const promptMentionsDrawingNumber=prompt.includes('drawing_number')||prompt.includes('DrawingNumber')||prompt.includes('drawingNumber');
  const promptMentionsTitle        =prompt.includes('title')&&!prompt.includes('rule_results');
  console.log('\n  SYSTEM_PROMPT snippet (first 120 chars):');
  console.log(`    ${prompt.slice(prompt.indexOf('`')+1,prompt.indexOf('`')+121)}...`);
  assert('prompt does not reference drawing identity fields', !promptMentionsDrawingNumber);

  const userContentSection=src.slice(src.indexOf('const userContent'),src.indexOf('const userContent')+400);
  console.log('\n  userContent fields built for AI:');
  console.log(`    ${userContentSection.replace(/\n/g,'\n    ').slice(0,300)}`);
  const hasOnlyAllowed=userContentSection.includes('overall_verdict')&&userContentSection.includes('extraction_gate')&&userContentSection.includes('rule_results');
  const hasDisallowed =userContentSection.includes('drawing_number')||userContentSection.includes('revision:')||userContentSection.includes('title:');
  assert('userContent contains overall_verdict, extraction_gate, rule_results', hasOnlyAllowed);
  assert('userContent contains no drawing identity fields',                     !hasDisallowed);

  // ──────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n'+SEP);
  console.log('Cleanup');
  console.log(SEP);
  for(const rid of ids){
    await pg.query('DELETE FROM agent_reports WHERE drawing_revision_id=$1',[rid]);
    await pg.query('DELETE FROM rule_evaluations WHERE drawing_revision_id=$1',[rid]);
    await pg.query('DELETE FROM drawing_extractions WHERE drawing_revision_id=$1',[rid]);
    const row=await pg.query('SELECT gcs_staging_path FROM drawing_revisions WHERE id=$1',[rid]);
    if(row.rows[0]) await gcsClient.bucket(bucketName).file(row.rows[0].gcs_staging_path).delete().catch(()=>{});
    await pg.query('DELETE FROM drawing_revisions WHERE id=$1',[rid]);
    console.log(`  Removed revision id=${rid}`);
  }
  await pg.end();

  // ──────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n'+SEP);
  console.log(`FINAL RESULT: ${pass} passed, ${fail} failed`);
  console.log(SEP);
  if(fail>0) process.exit(1);
}

main().catch(err=>{console.error('Fatal:',err);process.exit(1);});
