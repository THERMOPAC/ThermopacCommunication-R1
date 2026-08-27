/**
 * Research-only Modified UNIFAC (Dortmund) LLE benchmark.
 * It deliberately has no imports from production thermodynamics or Stage 8.
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT = path.resolve('.agents/outputs/ecr-pre-pilot-dortmund-benchmark');
const TREF = 298.15, UX = .003, THREE_UX = .009, EPS = 1e-14;
const ISOACTIVITY_TOLERANCE = 1e-8, MASS_BALANCE_TOLERANCE = 1e-10;
const MIN_PHASE_FRACTION = 1e-3, MIN_PHASE_DISTANCE = 1e-5, GIBBS_STABILITY_TOLERANCE = 1e-10;
const TPD_TOLERANCE = 1e-8;
const SOURCE_PDF = path.resolve('.agents/evidence/ecr-pre-pilot-dortmund-2026/2026-Published-Parameters.pdf');
const SOURCE_SHA256 = 'cfd84d26444b20eb394afadaaf05b0f2a428a6600ab3ec2d5041f121b1781232';
type V = number[];
type Line = { x: V; y: V; order: number };
const xylene: Line[] = [
 [[.641,.131,.050,.020,.158],[.392,.142,.077,.038,.351],2], [[.651,.134,.047,.021,.147],[.320,.150,.081,.050,.399],5],
 [[.664,.136,.055,.035,.110],[.250,.162,.105,.095,.388],9], [[.725,.109,.037,.018,.111],[.252,.141,.080,.064,.463],10],
 [[.800,.092,.022,.008,.078],[.206,.113,.062,.036,.583],6], [[.813,.082,.020,.009,.076],[.190,.113,.063,.048,.586],11],
 [[.822,.085,.022,.006,.065],[.240,.124,.069,.017,.550],3], [[.857,.062,.015,.005,.061],[.181,.094,.057,.024,.644],7],
 [[.858,.067,.015,.005,.055],[.157,.098,.052,.026,.667],4], [[.860,.068,.018,.004,.050],[.158,.104,.058,.014,.666],1],
 [[.863,.058,.013,.005,.061],[.150,.085,.045,.033,.687],12], [[.877,.050,.011,.005,.057],[.174,.093,.038,.021,.674],8],
 [[.878,.048,.010,.004,.060],[.135,.073,.037,.027,.728],13],
].map(([x,y,order]) => ({x:x as V,y:y as V,order:order as number}));
const toluene: Line[] = [
 [[.645,.106,.048,.020,.181],[.397,.142,.072,.032,.357],14], [[.783,.080,.025,.007,.105],[.210,.113,.061,.028,.588],15],
 [[.861,.053,.016,.005,.065],[.177,.088,.049,.022,.664],16], [[.894,.032,.009,.003,.062],[.145,.054,.030,.013,.758],17],
].map(([x,y,order]) => ({x:x as V,y:y as V,order:order as number}));

// Frozen verbatim subset of the 2026 Published Parameters reviewed 2026-08-26.
const groups = {
  1:{main:1,R:.6325,Q:1.0608}, 2:{main:1,R:.6325,Q:.7081}, 9:{main:3,R:.3763,Q:.4321},
  10:{main:3,R:.3763,Q:.2113}, 11:{main:4,R:.91,Q:.949}, 78:{main:42,R:.7136,Q:.8635},
  86:{main:46,R:3.981,Q:3.2},
} as const;
const interactions: Record<string,[number,number,number]> = {
 '1>3':[114.2,.0933,0],'3>1':[16.07,-.2998,0],'1>4':[7.339,-.4538,0],'4>1':[47.2,.3575,0],
 '1>42':[-117.1,.5481,-.00098],'42>1':[170.9,-.8062,.001291],'1>46':[677.32,-2.0066,0],'46>1':[-249.85,1.7054,0],
 '3>4':[139.2,-.65,0],'4>3':[-45.33,.4223,0],'3>42':[134.6,-1.231,.001488],'42>3':[-2.619,1.094,-.001557],
 '3>46':[313.79,-1.1552,0],'46>3':[-258.12,1.4084,0],'4>42':[-107.1,.2564,0],'42>4':[191.5,-.5561,0],
 '4>46':[72.26,-.1919,0],'46>4':[763.57,-1.3961,0],'42>46':[298.46,-.6823,0],'46>42':[499.59,-.8158,0],
};
type Component = { name:string; cas:string; mw:number; nu: Record<number,number> };
const comps = (mono: 'xylene'|'toluene'): Component[] => [
 {name:'n-dodecane',cas:'112-40-3',mw:170.3348,nu:{1:2,2:10}},
 mono === 'xylene' ? {name:'1,4-xylene',cas:'106-42-3',mw:106.165,nu:{9:4,11:2}} : {name:'toluene',cas:'108-88-3',mw:92.1405,nu:{9:5,11:1}},
 {name:'1-methylnaphthalene',cas:'90-12-0',mw:142.1971,nu:{9:7,10:2,11:1}},
 {name:'pyrene',cas:'129-00-0',mw:202.2506,nu:{9:10,10:6}},
 {name:'NMP',cas:'872-50-4',mw:99.1311,nu:{78:3,86:1}},
];
const aljimazComponents:Component[]=[
 {name:'hexadecane',cas:'544-76-3',mw:226.4412,nu:{1:2,2:14}},
 {name:'1,3,5-trimethylbenzene',cas:'108-67-8',mw:120.1916,nu:{9:3,11:3}},
 {name:'NMP',cas:'872-50-4',mw:99.1311,nu:{78:3,86:1}},
];
const ANALOGUE_DATA_PATH=path.resolve('server/engine-framework/cel/data/multi-t-nmp-lle.json');
type AnalogueLine={source:string;T_K:number;raffinate:Record<string,number>;extract:Record<string,number>;components:Record<string,string>;u_x:number};
function canonical(o: unknown) { return JSON.stringify(o); }
const frozenSubset = { groups, interactions, assignments: { xylene: comps('xylene'), toluene: comps('toluene') } };
const subsetDigest = createHash('sha256').update(canonical(frozenSubset)).digest('hex');
/** Reviewed expected digest, intentionally independent of the runtime object. */
const EXPECTED_EMBEDDED_SUBSET_SHA256 = '570395a2cb12511466e17830c4714c9a9a1ae67fcd1a3ff2ada26e2393036292';
function closure() {
 if (!fs.existsSync(SOURCE_PDF)) throw Error('DORTMUND_PARAMETER_COVERAGE_MISSING: archived 2026 DDBST source PDF');
 if (createHash('sha256').update(fs.readFileSync(SOURCE_PDF)).digest('hex') !== SOURCE_SHA256) throw Error('DORTMUND_PARAMETER_COVERAGE_MISSING: archived DDBST PDF SHA-256 mismatch');
 const mains = [1,3,4,42,46];
 for (const g of Object.values(groups)) if (!Number.isFinite(g.R) || !Number.isFinite(g.Q)) throw Error('DORTMUND_PARAMETER_COVERAGE_MISSING: subgroup R/Q');
 for (const a of mains) for (const b of mains) if (a !== b && !interactions[`${a}>${b}`]) throw Error(`DORTMUND_PARAMETER_COVERAGE_MISSING: ${a}>${b}`);
 if (subsetDigest !== EXPECTED_EMBEDDED_SUBSET_SHA256) throw Error('DORTMUND_PARAMETER_COVERAGE_MISSING: embedded subset digest');
}
/** Floor first, then normalize by the post-floor total (never returns a non-unit phase). */
const norm = (a: readonly number[]) => { const floored=a.map(v=>Math.max(EPS,v)); const s=floored.reduce((p,v)=>p+v,0); return floored.map(v=>v/s); };
const dot = (a:readonly number[],b:readonly number[]) => a.reduce((s,v,i)=>s+v*b[i],0);
function psi(a:number,b:number,T:number) { if(a===b)return 1; const q=interactions[`${a}>${b}`]; if(!q)throw Error(`DORTMUND_PARAMETER_COVERAGE_MISSING: ${a}>${b}`); return Math.exp(-(q[0]+q[1]*T+q[2]*T*T)/T); }
function lnGamma(theta: Record<number,number>, k:number, T:number) {
 const mains=[1,3,4,42,46];
 const s=(j:number)=>mains.reduce((v,m)=>v+(theta[m]||0)*psi(m,j,T),0);
 return 1-Math.log(s(k))-mains.reduce((v,m)=>v+(theta[m]||0)*psi(k,m,T)/s(m),0);
}
function pureGroupSurfaceFractions(c: Component): Record<number,number> {
 const total=Object.entries(c.nu).reduce((s,[g,n])=>s+Number(n)*groups[Number(g) as keyof typeof groups].Q,0);
 const theta: Record<number,number>={};
 for(const [g,n] of Object.entries(c.nu)){const subgroup=groups[Number(g) as keyof typeof groups],m=subgroup.main;theta[m]=(theta[m]||0)+Number(n)*subgroup.Q/total;}
 return theta;
}
export function lnGammaDortmund(x0:readonly number[], components:Component[], T:number): V {
 const x=norm(x0), r=components.map(c=>Object.entries(c.nu).reduce((s,[g,n])=>s+Number(n)*groups[Number(g) as keyof typeof groups].R,0));
 const q=components.map(c=>Object.entries(c.nu).reduce((s,[g,n])=>s+Number(n)*groups[Number(g) as keyof typeof groups].Q,0));
 const sr=dot(x,r),sq=dot(x,q);
 // Dortmund combinatorial equation: 1-V'_i+ln(V'_i)-5q_i[1-V_i/F_i+ln(V_i/F_i)],
 // V'_i=r_i^(3/4)/sum(x r^(3/4)), V_i=r_i/sum(xr), F_i=q_i/sum(xq).
 const sr34=dot(x,r.map(v=>v**.75));
 const comb=x.map((_,i)=>{const Vp=r[i]**.75/sr34,V=r[i]/sr,F=q[i]/sq; return 1-Vp+Math.log(Vp)-5*q[i]*(1-V/F+Math.log(V/F));});
 const theta:Record<number,number>={}; for(const c of components) for(const [g,n] of Object.entries(c.nu)){const m=groups[Number(g) as keyof typeof groups].main;theta[m]=(theta[m]||0)+x[components.indexOf(c)]*Number(n)*groups[Number(g) as keyof typeof groups].Q/sq;}
 return components.map((c,i)=>{const pure=pureGroupSurfaceFractions(c);return comb[i]+Object.entries(c.nu).reduce((s,[g,n])=>{const gg=Number(g),m=groups[gg as keyof typeof groups].main;return s+Number(n)*groups[gg as keyof typeof groups].Q*(lnGamma(theta,m,T)-lnGamma(pure,m,T));},0);});
}
type Flash={converged:boolean;twoPhase:boolean;x:V;y:V;beta:number;iterations:number;muResidual:number};
type TpdResult={minimum:number;minimizingComposition:V;latticePoints:number;localStarts:number;tolerance:number;verdict:string};
type Diagnostics={gibbsHomogeneous:number;gibbsSplit:number;gibbsDelta:number;massBalanceMaxResidual:number;phaseDistance:number;homogeneousTpd:TpdResult;splitTpd:TpdResult;physicalStable:boolean};
function softmax(a:readonly number[]):V { const m=Math.max(...a),e=a.map(v=>Math.exp(v-m)); return norm(e); }
function simplexLattice(n:number,denominator:number):V[] {
 const out:V[]=[];
 const visit=(prefix:number[],remaining:number)=>{
  if(prefix.length===n-1){out.push([...prefix,remaining].map(v=>v/denominator));return;}
  for(let k=0;k<=remaining;k++)visit([...prefix,k],remaining-k);
 };
 visit([],denominator); return out;
}
/**
 * Deterministic TPD search, not a mathematical global-optimality proof:
 * full-simplex 0.1 lattice (including boundaries), boundary/pure starts, then
 * finite-difference local descent in softmax coordinates (strict positivity).
 */
function tpdSearch(mu:V,c:Component[],T:number, anchors:V[]=[]):TpdResult {
 const denominator=c.length===3?30:10, points=simplexLattice(c.length,denominator);
 const value=(w0:V)=>{const w=norm(w0),lg=lnGammaDortmund(w,c,T);return dot(w,w.map((v,i)=>Math.log(v)+lg[i]-mu[i]));};
 const ranked=points.map(p=>({p,v:value(p)})).sort((a,b)=>a.v-b.v);
 const starts=[...ranked.slice(0,16).map(q=>q.p),...Array.from({length:c.length},(_,i)=>Array.from({length:c.length},(_,j)=>i===j?1:0)),...anchors];
 let best=ranked[0];
 for(const start of starts){
  let u=start.map(v=>Math.log(Math.max(v,1e-6))), current=value(softmax(u)), step=.35;
  for(let it=0;it<36;it++){
   const h=1e-5, grad=u.map((_,j)=>{const plus=u.slice(),minus=u.slice();plus[j]+=h;minus[j]-=h;return (value(softmax(plus))-value(softmax(minus)))/(2*h);});
   const proposal=u.map((v,j)=>v-step*grad[j]), next=value(softmax(proposal));
   if(next<current){u=proposal;current=next;step=Math.min(.6,step*1.12);}else step*=.5;
   if(step<1e-7)break;
  }
  const p=softmax(u); if(current<best.v)best={p,v:current};
 }
 return {minimum:best.v,minimizingComposition:best.p,latticePoints:points.length,localStarts:starts.length,tolerance:TPD_TOLERANCE,verdict:best.v < -TPD_TOLERANCE?'NEGATIVE_TRIAL_FOUND':'TPD_MULTISTART_NO_NEGATIVE_TRIAL'};
}
function diagnostics(f:Flash,z0:readonly number[],c:Component[],T:number):Diagnostics {
 const z=norm(z0), g=(p:V)=>dot(p,p.map((v,i)=>Math.log(v)+lnGammaDortmund(p,c,T)[i]));
 const gh=g(z), gs=(1-f.beta)*g(f.x)+f.beta*g(f.y);
 const mb=Math.max(...f.x.map((v,i)=>Math.abs((1-f.beta)*v+f.beta*f.y[i]-z[i])));
 const distance=Math.sqrt(f.x.reduce((s,v,i)=>s+(v-f.y[i])**2,0));
 const finite=[gh,gs,mb,distance,f.muResidual,f.beta,...f.x,...f.y].every(Number.isFinite);
 const homogeneousTpd=tpdSearch(z.map((v,i)=>Math.log(v)+lnGammaDortmund(z,c,T)[i]),c,T,[z]);
 const splitMu=f.x.map((v,i)=>Math.log(v)+lnGammaDortmund(f.x,c,T)[i]);
 const splitTpd=tpdSearch(splitMu,c,T,[f.x,f.y]);
 const physicalStable=f.converged&&f.twoPhase&&finite&&f.beta>MIN_PHASE_FRACTION&&f.beta<1-MIN_PHASE_FRACTION&&distance>MIN_PHASE_DISTANCE&&f.muResidual<=ISOACTIVITY_TOLERANCE&&mb<=MASS_BALANCE_TOLERANCE&&gs-gh < -GIBBS_STABILITY_TOLERANCE&&homogeneousTpd.minimum < -TPD_TOLERANCE&&splitTpd.minimum >= -TPD_TOLERANCE;
 return {gibbsHomogeneous:gh,gibbsSplit:gs,gibbsDelta:gs-gh,massBalanceMaxResidual:mb,phaseDistance:distance,homogeneousTpd,splitTpd,physicalStable};
}
function flash(z0:readonly number[], c:Component[], T:number, seed:number):Flash {
 const z=norm(z0);
 // Fifteen deterministic, simplex-spanning starts: each component is used as
 // an anchor in both phases, in addition to hydrocarbon/NMP-biased starts.
 const n=z.length, xi=seed%n, yi=(seed*2+n-1)%n;
 const anchorX=z.map((_,i)=>i===xi?1:0), anchorY=z.map((_,i)=>i===yi?1:0);
 let x=norm(z.map((v,i)=>.55*v+.45*anchorX[i]+(seed===0?(i===0?.12:-.03):0)));
 let y=norm(z.map((v,i)=>.55*v+.45*anchorY[i]+(seed===0?(i===n-1?.12:-.12/(n-1)):0)));
 let K=y.map((v,i)=>v/x[i]), beta=.5;
 for(let it=1;it<=1800;it++){
  const rr=(b:number)=>z.reduce((s,zi,i)=>s+zi*(K[i]-1)/(1+b*(K[i]-1)),0);
  if(rr(EPS)*rr(1-EPS)>0) return {converged:true,twoPhase:false,x:z,y:z,beta:NaN,iterations:it,muResidual:0};
  let lo=EPS,hi=1-EPS;for(let j=0;j<100;j++){const m=(lo+hi)/2;if(rr(m)>0)lo=m;else hi=m;} beta=(lo+hi)/2;
  x=norm(z.map((zi,i)=>zi/(1+beta*(K[i]-1)))); y=norm(z.map((zi,i)=>K[i]*zi/(1+beta*(K[i]-1))));
  const lx=lnGammaDortmund(x,c,T),ly=lnGammaDortmund(y,c,T); let d=0;
  K=K.map((old,i)=>{const target=Math.exp(Math.max(-30,Math.min(30,lx[i]-ly[i])));d=Math.max(d,Math.abs(target-old)/Math.max(old,EPS));return .7*old+.3*target;});
  if(d<1e-10){const chemicalResidual=x.map((v,i)=>Math.abs(Math.log(v)+lnGammaDortmund(x,c,T)[i]-Math.log(y[i])-lnGammaDortmund(y,c,T)[i]));const active=chemicalResidual.filter((_,i)=>z[i]>1e-12),mu=Math.max(...active);if(Math.sqrt(x.reduce((s,v,i)=>s+(v-y[i])**2,0))<1e-5)return {converged:true,twoPhase:false,x:z,y:z,beta:NaN,iterations:it,muResidual:mu};if(x[0]<y[0]){[x,y]=[y,x];beta=1-beta;}return {converged:true,twoPhase:true,x,y,beta,iterations:it,muResidual:mu};}
 }
 return {converged:false,twoPhase:false,x,y,beta,iterations:1800,muResidual:Infinity};
}
function best(z:V,c:Component[],T:number){
 const candidates=Array.from({length:Math.max(15,c.length*3)},(_,s)=>flash(z,c,T,s));
 const g=(p:V)=>dot(p,p.map((v,i)=>Math.log(v)+lnGammaDortmund(p,c,T)[i]));
 // Test stationary candidates in increasing split Gibbs order. TPD is then
 // evaluated only as an acceptance gate (rather than needlessly for all starts).
 const ordered=candidates.filter(v=>v.converged&&v.twoPhase).sort((a,b)=>((1-a.beta)*g(a.x)+a.beta*g(a.y))-((1-b.beta)*g(b.x)+b.beta*g(b.y)));
 for(const candidate of ordered) if(diagnostics(candidate,z,c,T).physicalStable) return candidate;
 return ordered[0]||candidates[0];
}
function row(line:Line, family:string) {
 const z=line.x.map((v,i)=>(v+line.y[i])/2), c=comps(family as 'xylene'|'toluene'), f=best(z,c,TREF), d=diagnostics(f,z,c,TREF);
 const errors=f.x.flatMap((v,i)=>[Math.abs(v-line.x[i]),Math.abs(f.y[i]-line.y[i])]), rms=Math.sqrt(errors.reduce((s,v)=>s+v*v,0)/errors.length);
 const K=f.x.map((v,i)=>f.y[i]/v), selectivity=K.slice(1,4).map(k=>k/K[0]);
 const balance=f.x.map((v,i)=>(1-f.beta)*v+f.beta*f.y[i]-(line.x[i]+line.y[i])/2);
 return {id:`coto-2022-${family}-${line.order}`,tableOrder:line.order,syntheticMidpointZ:z,experimental:{raffinate:line.x,extract:line.y},phaseBehavior:d.physicalStable?'TWO_LIQUID_PHASES':'SINGLE_PHASE_OR_NONCONVERGED',phaseStability:d.physicalStable?'TPD_MULTISTART_NO_NEGATIVE_TRIAL':'STATIONARY_OR_TPD_REJECTED',converged:f.converged,predicted:{raffinate:f.x,extract:f.y,extractPhaseFraction:f.beta},iterations:f.iterations,componentAbsoluteErrors:errors,compositionRmsd:rms,maxAbsoluteError:Math.max(...errors),uncertaintyComparison:{uX:UX,threeUX:THREE_UX,valuesOverUX:errors.filter(v=>v>UX).length,valuesOver3UX:errors.filter(v=>v>THREE_UX).length},distributionCoefficientsExtractOverRaffinate:K,aromaticSelectivityRelativeToDodecane:selectivity,nmpInRaffinate:f.x[4],hydrocarbonInExtract:f.y.slice(0,4).reduce((s,v)=>s+v,0),isoactivityLogResidual:f.muResidual,massBalanceComponentResiduals:balance,massBalanceMaxResidual:d.massBalanceMaxResidual,gibbsHomogeneous:d.gibbsHomogeneous,gibbsSplit:d.gibbsSplit,gibbsDelta:d.gibbsDelta,phaseDistance:d.phaseDistance,homogeneousTpd:d.homogeneousTpd,splitTpd:d.splitTpd};
}
function analogueRow(line:AnalogueLine,index:number) {
 const ex=[line.extract.SAT,line.extract.MONO,line.extract.NMP],rx=[line.raffinate.SAT,line.raffinate.MONO,line.raffinate.NMP];
 const z=rx.map((v,i)=>(v+ex[i])/2),f=best(z,aljimazComponents,line.T_K),d=diagnostics(f,z,aljimazComponents,line.T_K);
 const errors=f.x.flatMap((v,i)=>[Math.abs(v-rx[i]),Math.abs(f.y[i]-ex[i])]),K=f.x.map((v,i)=>f.y[i]/v);
 return {id:`aljimaz-2006-${index+1}`,source:'aljimaz2006',temperatureK:line.T_K,sourceUncertaintyX:line.u_x,syntheticMidpointZ:z,experimental:{raffinate:rx,extract:ex},phaseBehavior:d.physicalStable?'TWO_LIQUID_PHASES':'STATIONARY_OR_TPD_REJECTED',phaseStability:d.physicalStable?'TPD_MULTISTART_NO_NEGATIVE_TRIAL':'STATIONARY_OR_TPD_REJECTED',converged:f.converged,predicted:{raffinate:f.x,extract:f.y,extractPhaseFraction:f.beta},iterations:f.iterations,componentAbsoluteErrors:errors,compositionRmsd:Math.sqrt(errors.reduce((s,v)=>s+v*v,0)/errors.length),maxAbsoluteError:Math.max(...errors),distributionCoefficientsExtractOverRaffinate:K,mesityleneSelectivityRelativeToHexadecane:K[1]/K[0],isoactivityLogResidual:f.muResidual,massBalanceMaxResidual:d.massBalanceMaxResidual,gibbsHomogeneous:d.gibbsHomogeneous,gibbsSplit:d.gibbsSplit,gibbsDelta:d.gibbsDelta,phaseDistance:d.phaseDistance,homogeneousTpd:d.homogeneousTpd,splitTpd:d.splitTpd};
}
function analogueBenchmark(){
 const source=JSON.parse(fs.readFileSync(ANALOGUE_DATA_PATH,'utf8')) as {citation:Record<string,string>;tieLines:AnalogueLine[]};
 const admitted=source.tieLines.filter(v=>v.source==='aljimaz2006'),rows=admitted.map(analogueRow),all=rows.flatMap(v=>v.componentAbsoluteErrors);
 const byTemperature=Array.from(new Set(rows.map(v=>v.temperatureK))).map(T=>{const rr=rows.filter(v=>v.temperatureK===T),ee=rr.flatMap(v=>v.componentAbsoluteErrors);return {temperatureK:T,rowCount:rr.length,acceptedTwoPhaseRows:rr.filter(v=>v.phaseBehavior==='TWO_LIQUID_PHASES').length,phaseRecall:rr.filter(v=>v.phaseBehavior==='TWO_LIQUID_PHASES').length/rr.length,compositionRmsd:Math.sqrt(ee.reduce((s,v)=>s+v*v,0)/ee.length),maxAbsoluteError:Math.max(...ee)};});
 return {citation:source.citation.aljimaz2006,components:aljimazComponents.map(v=>({name:v.name,cas:v.cas,groups:v.nu})),rows,aggregate:{rowCount:rows.length,temperatureCount:byTemperature.length,acceptedTwoPhaseRows:rows.filter(v=>v.phaseBehavior==='TWO_LIQUID_PHASES').length,phaseRecall:rows.filter(v=>v.phaseBehavior==='TWO_LIQUID_PHASES').length/rows.length,compositionRmsd:Math.sqrt(all.reduce((s,v)=>s+v*v,0)/all.length),maxAbsoluteError:Math.max(...all),byTemperature}};
}
function sn300() {
 // 1 kg oil: supported 0.98 kg; polar 0.02 kg remains explicitly unresolved.
 const c=comps('xylene'), oil=[.85,.07,.04,.02], moles=oil.map((m,i)=>m/c[i].mw); const nmp=.9*.995/c[4].mw;
 const z=norm([...moles,nmp]), f=best(z,c,323.15),d=diagnostics(f,z,c,323.15);
 return {classification:d.physicalStable?'EXTRAPOLATED':'NOT_CALCULABLE',reason:d.physicalStable?'Five-component Dortmund surrogate calculation converged and passed finite TPD multistart screening; 323.15 K is outside direct five-family evidence.':'DORTMUND_NONPHYSICAL_OR_NONCONVERGED',temperatureK:323.15,processBasis:{oilKg:1,sixComponentWt:{SAT:85,MONO:7,DI:4,POLY:2,POLAR_UNRESOLVED:2},supportedOilKg:.98,polarAromaticsKg:.02,polarTreatment:'EXCLUDED_FROM_FIVE_COMPONENT_FLASH; retained unresolved in six-component process basis',solventOilRatioKgPerKg:.9,solventChargedKg:.9,nmpPurityWt:.995,nmpPureKg:.8955,nmpWaterWt:.0005,nmpWaterKg:.00045,otherSolventImpurityKg:.00405,solventNonNmpTreatment:'Water and other impurity are outside the five-component basis and are not folded into NMP.'},supportedMoleFeedZ:z,phaseBehavior:d.physicalStable?'TWO_LIQUID_PHASES':'SINGLE_PHASE_OR_NONCONVERGED',phaseStability:d.physicalStable?'TPD_MULTISTART_NO_NEGATIVE_TRIAL':'STATIONARY_OR_TPD_REJECTED',converged:f.converged,predicted:{raffinate:f.x,extract:f.y,extractPhaseFraction:f.beta},iterations:f.iterations,isoactivityLogResidual:f.muResidual,massBalanceMaxResidual:d.massBalanceMaxResidual,gibbsHomogeneous:d.gibbsHomogeneous,gibbsSplit:d.gibbsSplit,gibbsDelta:d.gibbsDelta,phaseDistance:d.phaseDistance,homogeneousTpd:d.homogeneousTpd,splitTpd:d.splitTpd};
}
function main(){
 closure(); const rows=[...xylene.map(x=>row(x,'xylene')),...toluene.map(x=>row(x,'toluene'))];
 const all=rows.flatMap(r=>r.componentAbsoluteErrors), sn=sn300(), analogue=analogueBenchmark();
 const selectableTemperatureClassification=[25,30,40,50,60,70,80,90,100].map(temperatureC=>({temperatureC,fiveComponentPrediction:temperatureC===25?'PREDICTIVE/PRELIMINARY within direct five-component benchmark temperature':'EXTRAPOLATED prediction allowed when parameters and physical solve pass',evidence:temperatureC===25?'DIRECT_FIVE_COMPONENT_COTO_EVIDENCE_AT_298_15_K':temperatureC<=50?'DIRECT_TERNARY_ALJIMAZ_ANALOGUE_ONLY; FIVE_COMPONENT_EXTRAPOLATED':'NO_DIRECT_LOCAL_ANALOGUE; FIVE_COMPONENT_EXTRAPOLATED'}));
 const unsupportedAnalogueInventory=[
  {source:'fahim2005',rowCount:106,component:'propylbenzene',status:'NOT_CALCULABLE_MISSING_REQUIRED_DORTMUND_SUBGROUP',reason:'Propylbenzene requires an alkyl-aromatic subgroup outside the frozen reviewed subset; ACCH3 substitution is prohibited.'},
  {source:'fandary2006',rowCount:78,component:'pentylbenzene',status:'NOT_CALCULABLE_MISSING_REQUIRED_DORTMUND_SUBGROUP',reason:'Pentylbenzene requires an alkyl-aromatic subgroup outside the frozen reviewed subset; ACCH3 substitution is prohibited.'},
 ];
 const result={schemaVersion:'1.0.0',deterministic:true,package:{model:'Modified UNIFAC (Dortmund)',label:'2026 Published Parameters',publisher:'UNIFAC Consortium / DDBST',sourceUrl:'https://unifac.ddbst.com/files/unifac/Matrices/2026%20Published%20Parameters.pdf',retrieved:'2026-08-26',sourceSha256:SOURCE_SHA256,archivedSourcePdf:'.agents/evidence/ecr-pre-pilot-dortmund-2026/2026-Published-Parameters.pdf',archivedSourceSha256Verified:true,embeddedSubsetSha256:subsetDigest,subgroupCount:7,orderedInteractionCount:20,frozenSubset},benchmark:{citation:'Coto et al., Fluid Phase Equilibria 554 (2022) 113293, Table 3',temperatureK:TREF,rows,aggregate:{rowCount:rows.length,xyleneRows:13,tolueneRows:4,twoPhaseRows:rows.filter(r=>r.phaseBehavior==='TWO_LIQUID_PHASES').length,compositionRmsd:Math.sqrt(all.reduce((s,v)=>s+v*v,0)/all.length),maxAbsoluteError:Math.max(...all),valuesOver3UX:all.filter(v=>v>THREE_UX).length,totalComparedValues:all.length}},analogueBenchmark:analogue,unsupportedAnalogueInventory,applicability:{at298_15K:'PREDICTIVE_DIRECT_BENCHMARK_EVIDENCE',range25to100C:'Predictions permitted where covered and physical; evidence class is temperature-specific.',selectableTemperatureClassification},sn300At50C:sn,verdict:'PRELIMINARY: reproducible five-component predictive research only; benchmark accuracy is not release approval and does not block a physical supported-subset prediction.'};
 fs.mkdirSync(OUT,{recursive:true});const json=JSON.stringify(result,null,2)+'\n';fs.writeFileSync(path.join(OUT,'results.json'),json);
 const equationNote='\n## Numerical equation and stability gate\n\nDortmund combinatorial: `ln gamma^C_i = 1 - Vprime_i + ln(Vprime_i) - 5 q_i [1 - V_i/F_i + ln(V_i/F_i)]`, where `Vprime_i = r_i^(3/4)/sum(x r^(3/4))`, `V_i = r_i/sum(x r_i)`, and `F_i = q_i/sum(x q_i)`. The residual term uses the frozen Dortmund interaction polynomial. Multistart stationary splits are selected by minimum split Gibbs energy only when phases are positive/normalized/distinct, beta is nontrivial, isoactivity and mass balance close, and split Gibbs is lower than homogeneous Gibbs by more than the declared tolerance.\n';
 const md=`# ECR Pre-Pilot Dortmund Numerical LLE Benchmark\n\n**Verdict:** ${result.verdict}\n\n- Frozen subset digest: \`${subsetDigest}\`\n- Coto rows: ${rows.length} (13 xylene; 4 toluene); predicted two-phase: ${result.benchmark.aggregate.twoPhaseRows}\n- Composition RMSD: ${result.benchmark.aggregate.compositionRmsd.toFixed(6)}; maximum: ${result.benchmark.aggregate.maxAbsoluteError.toFixed(6)}; values > 3u(x): ${result.benchmark.aggregate.valuesOver3UX}/${all.length}\n- SN300 50 C: **${sn.classification}**; ${sn.phaseBehavior}; beta=${Number.isFinite(sn.predicted.extractPhaseFraction)?sn.predicted.extractPhaseFraction.toFixed(8):'n/a'}; isoactivity residual=${sn.isoactivityLogResidual.toExponential(3)}.\n\nPolar Aromatics (2 wt% of the documented six-component oil basis) is explicitly unresolved and excluded from this five-component flash, not folded into another family.\n\n## Per-row results\n\n| Row | Phase | RMSD | Max error | >3u |\n|---|---|---:|---:|---:|\n${rows.map(r=>`| ${r.id} | ${r.phaseBehavior} | ${r.compositionRmsd.toFixed(6)} | ${r.maxAbsoluteError.toFixed(6)} | ${r.uncertaintyComparison.valuesOver3UX} |`).join('\n')}\n\nThe JSON artifact contains complete phases, K/selectivity, isoactivity and material-balance residuals for each row.\n`;fs.writeFileSync(path.join(OUT,'report.md'),md);
 const analogueTable=analogue.aggregate.byTemperature.map(v=>`| ${v.temperatureK} | ${v.rowCount} | ${v.acceptedTwoPhaseRows} | ${v.compositionRmsd.toFixed(6)} | ${v.maxAbsoluteError.toFixed(6)} |`).join('\n');
 const temperatureTable=selectableTemperatureClassification.map(v=>`| ${v.temperatureC} | ${v.evidence} | ${v.fiveComponentPrediction} |`).join('\n');
 const snRows=comps('xylene').map((v,i)=>`| ${v.name} | ${sn.predicted.raffinate[i].toFixed(12)} | ${sn.predicted.extract[i].toFixed(12)} |`).join('\n');
 const supplement=`${equationNote}\nThis finite lattice/local-refinement TPD screen is deliberately described as multistart no-negative-trial, **not a mathematical proof of global optimality**. Tolerances: TPD ${TPD_TOLERANCE}, isoactivity ${ISOACTIVITY_TOLERANCE}, material balance ${MASS_BALANCE_TOLERANCE}, minimum phase fraction ${MIN_PHASE_FRACTION}, and minimum phase distance ${MIN_PHASE_DISTANCE}.\n\nSN300 homogeneous TPD minimum: ${sn.homogeneousTpd.minimum}; split common-tangent TPD minimum: ${sn.splitTpd.minimum}.\n\n## Aljimaz 2006 supported ternary benchmark\n\n| Temperature (K) | Rows | Accepted | RMSD | Max error |\n|---:|---:|---:|---:|---:|\n${analogueTable}\n\n## Unsupported analogue inventory\n\n- Fahim 2005 (106 rows, propylbenzene): **NOT_CALCULABLE_MISSING_REQUIRED_DORTMUND_SUBGROUP** — required alkyl-aromatic subgroup is outside the frozen subset.\n- Fandary 2006 (78 rows, pentylbenzene): **NOT_CALCULABLE_MISSING_REQUIRED_DORTMUND_SUBGROUP** — required alkyl-aromatic subgroup is outside the frozen subset.\n\n## Stage 1 selectable-temperature applicability\n\n| °C | Evidence | Prediction policy |\n|---:|---|---|\n${temperatureTable}\n\n## SN300 50 C predicted mole fractions\n\n| Component | Raffinate | Extract |\n|---|---:|---:|\n${snRows}\n`;
 fs.appendFileSync(path.join(OUT,'report.md'),supplement);
 console.log(`Wrote ${path.join(OUT,'results.json')} (${rows.length} rows); SN300=${sn.classification}`);
}
main();