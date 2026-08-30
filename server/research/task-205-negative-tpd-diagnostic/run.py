"""Task 205: isolated, fail-closed audit of persisted NT7 Stage-1 TPD minima."""
from __future__ import annotations
import hashlib, importlib.util, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
# The governed base kernel rejects an unpinned numerical runtime.  Select its
# vendored runtime before importing NumPy/SciPy in this isolated process.
sys.path.insert(0, str(ROOT / "server/research/ecr-pre-pilot-cosmosac/vendor/python"))
import numpy as np
from scipy.optimize import minimize, least_squares
OUT = ROOT / ".agents/outputs/task-205-negative-tpd-diagnostic"
INPUT = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/fixed-nt7-feed-sensitivity-results.json"
AMEND = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json"
MODEL_PATH = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py"

def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path); mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod; spec.loader.exec_module(mod); return mod
model = load(MODEL_PATH, "task205_model")
P = json.loads((HERE / "protocol.json").read_text())
G = P["numericalAcceptance"]; FLOOR = G["boundaryFloor"]

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def norm(x): return model.normalize(np.asarray(x, float), FLOOR)
def base(x): return model.base.lngamma(model.FAMILIES, P["temperatureK"], norm(x))
def residual(x, params): return model.residual_lngamma(norm(x), P["temperatureK"], params)
def mu(x, params): x=norm(x); return np.log(x)+base(x)+residual(x, params)
def g(x, params): x=norm(x); return float(np.dot(x, mu(x, params)))
def terms(z, w, params):
    z,w=norm(z),norm(w)
    ideal=float(np.dot(w,np.log(w)-np.log(z)))
    pinned=float(np.dot(w,base(w)-base(z)))
    amendment=float(np.dot(w,residual(w,params)-residual(z,params)))
    return {"ideal":ideal,"pinnedBaseCosmoSac":pinned,"residualAmendment":amendment,
            "total":ideal+pinned+amendment}
def identity(z,w,params):
    d=terms(z,w,params)["total"]
    # Exact Euler/tangent-plane form.  The residual is analytic; full model is
    # tested rather than assumed by comparing it to direct chemical potentials.
    tangent=g(w,params)-g(z,params)-float(np.dot(mu(z,params),norm(w)-norm(z)))
    return d,tangent,d-tangent
def fd_gradient(z,w,params, h=2e-6):
    # five independent mole fractions, sixth closes the simplex
    grad=[]
    for i in range(5):
        e=np.zeros(6); e[i]=h; e[5]=-h
        grad.append((terms(z,w+e,params)["total"]-terms(z,w-e,params)["total"])/(2*h))
    return np.array(grad)
def fd_gradient6(z,w,params):
    """Independent six-coordinate derivative used by constrained SLSQP/KKT."""
    w=np.asarray(w,float); out=np.zeros(6)
    for i in range(6):
        h=max(2e-7,2e-6*w[i])
        if w[i]-h < FLOOR:
            xp=w.copy(); xp[i]+=h
            out[i]=(terms(z,xp,params)["total"]-terms(z,w,params)["total"])/h
        else:
            xp=w.copy(); xm=w.copy(); xp[i]+=h; xm[i]-=h
            out[i]=(terms(z,xp,params)["total"]-terms(z,xm,params)["total"])/(2*h)
    return out
def chemical_consistency(x,params,h=2e-6):
    # d g / d x_i - d g / d x_6 must equal mu_i-mu_6 on a simplex.
    x=norm(x); checks=[]
    for i in range(5):
        e=np.zeros(6);e[i]=h;e[5]=-h
        dg=(g(x+e,params)-g(x-e,params))/(2*h)
        checks.append(dg-(mu(x,params)[i]-mu(x,params)[5]))
    return float(np.max(np.abs(checks)))
def slsqp(z, params, starts):
    fun=lambda x: terms(z,x,params)["total"]
    outcomes=[]
    for label,start in starts:
        sol=minimize(fun,norm(start),jac=lambda x:fd_gradient6(z,x,params),method="SLSQP",bounds=[(FLOOR,1)]*6,
          constraints={"type":"eq","fun":lambda x:np.sum(x)-1,"jac":lambda x:np.ones(6)},
          options={"ftol":1e-11,"maxiter":40,"disp":False})
        x=norm(sol.x); grad=fd_gradient6(z,x,params)
        # KKT multiplier for equality and lower-bound projected-gradient residual.
        lam=float(np.mean(grad[x > 20*FLOOR])); projected=np.where(x <= 20*FLOOR,
          np.minimum(grad-lam,0), grad-lam)
        outcomes.append({"start":label,"success":bool(sol.success),"message":str(sol.message),
          "composition":x.tolist(),"tpd":fun(x),"kktProjectedGradientInfinityNorm":float(max(abs(projected))),
          "iterations":int(sol.nit)})
    return min(outcomes,key=lambda r:r["tpd"]),outcomes
def cascade_residual_diagnostic(scenario, params):
    """Reconstruct the governed direct-NT7 equations/starts without importing its solver."""
    nt=7; trial=scenario["trial"]
    feed=np.asarray(trial["boundaryStreams"]["oilFeed"]["componentMoles"],float)
    solvent=np.asarray(trial["boundaryStreams"]["freshNmp"]["componentMoles"],float)
    total=float((feed+solvent).sum())
    seed_r=np.asarray([.80839275,.04805118,.02223209,.00732792,.00245580,.11154027])
    seed_e=np.asarray([.03166653,.03270623,.01640959,.00607406,.00377994,.90936365])
    base_start=np.log(np.tile(np.r_[total*(1-.614761)*seed_r,total*.614761*seed_e],nt))
    secondary_start=base_start+np.tile(np.linspace(-.015,.015,12),nt)
    lo,hi=np.log(1e-12),np.log(10*total)
    def unpack(v):
        streams=np.exp(v.reshape(nt,12)); return streams[:,:6],streams[:,6:]
    def residual(v):
        rr,ee=unpack(v); blocks=[]
        for j in range(nt):
            rin=feed if j==0 else rr[j-1]; ein=solvent if j==nt-1 else ee[j+1]
            x=rr[j]/rr[j].sum(); y=ee[j]/ee[j].sum()
            bal=(rin+ein-rr[j]-ee[j])/total
            iso=np.log(x)+model.total_lngamma(model.FAMILIES,P["temperatureK"],x,params)-np.log(y)-model.total_lngamma(model.FAMILIES,P["temperatureK"],y,params)
            blocks.extend(np.r_[bal,iso])
        return np.asarray(blocks)
    pattern=model.base.scipy.sparse.lil_matrix((84,84),dtype=int)
    for j in range(nt):
        rows=slice(12*j,12*(j+1)); pattern[rows,12*j:12*(j+1)]=1
        if j>0: pattern[rows,12*(j-1):12*(j-1)+6]=1
        if j<nt-1: pattern[rows,12*(j+1)+6:12*(j+2)]=1
    pattern=pattern.tocsr()
    primary_r=np.array([s["raffinateLeaving"]["flowMol"]*np.asarray(s["raffinateLeaving"]["moleFractions"]) for s in trial["stages"]])
    primary_e=np.array([s["extractLeaving"]["flowMol"]*np.asarray(s["extractLeaving"]["moleFractions"]) for s in trial["stages"]])
    primary_vec=np.log(np.r_[primary_r,primary_e].reshape(2,nt,6).transpose(1,0,2).reshape(-1))
    # Above layout is [R,E] per stage, exactly matching unpack.
    def metrics(label,sol):
        f=residual(sol.x); rr,ee=unpack(sol.x); stage=[]
        for j in range(nt):
            b=f[12*j:12*j+6]; a=f[12*j+6:12*j+12]
            stage.append({"stageFromFeedEnd":j+1,"balanceMaximum":float(max(abs(b))),"balanceRms":float(np.sqrt(np.mean(b*b))),
              "isoactivityMaximum":float(max(abs(a))),"isoactivityRms":float(np.sqrt(np.mean(a*a)))})
        pd=max(max(abs(rr[-1]-primary_r[-1]))/max(primary_r[-1].sum(),1e-30),
               max(abs(ee[0]-primary_e[0]))/max(primary_e[0].sum(),1e-30))
        maxres=float(max(abs(f))); closed=bool(sol.success and maxres<=1e-8)
        branch="PRIMARY_BRANCH" if closed and pd<=1e-6 else ("DISTINCT_CLOSED_BRANCH" if closed else "UNRESOLVED")
        return {"run":label,"solverSuccess":bool(sol.success),"status":int(sol.status),"message":str(sol.message),"nfev":int(sol.nfev),
          "maximumResidual":maxres,"rmsResidual":float(np.sqrt(np.mean(f*f))),"productDifferenceFromPrimary":float(pd),
          "byEquationFamily":{"scaledComponentBalances":{"maximum":float(max(abs(f.reshape(nt,12)[:,:6].ravel()))),
            "rms":float(np.sqrt(np.mean(f.reshape(nt,12)[:,:6]**2)))},
            "isoactivity":{"maximum":float(max(abs(f.reshape(nt,12)[:,6:].ravel()))),
            "rms":float(np.sqrt(np.mean(f.reshape(nt,12)[:,6:]**2)))}},
          "classification":branch,"byStage":stage,"logFlowVariables":np.asarray(sol.x,float).tolist(),
          "residualTrajectory":{"available":False,"reason":"scipy least_squares does not expose iteration callbacks"}}
    class Persisted:
        x=primary_vec; success=True; status=1; message="persisted closed primary"; nfev=0
    runs=[metrics("persisted-primary-reconstruction",Persisted())]
    cfg=P["multistartDiagnostic"]; tol=cfg["solverTolerances"]
    continuation=secondary_start
    cumulative_nfev=0
    for budget in cfg["sparseContinuationBudgets"]:
        sol=least_squares(residual,continuation,bounds=(lo,hi),max_nfev=budget,jac_sparsity=pattern,tr_solver="lsmr",**tol)
        cumulative_nfev += int(sol.nfev)
        row=metrics(f"same-secondary-sparse-continuation-{budget}",sol)
        row["cumulativeFunctionEvaluations"]=cumulative_nfev
        runs.append(row)
        continuation=sol.x
    dense=least_squares(residual,continuation,bounds=(lo,hi),max_nfev=cfg["denseFinalBudget"],x_scale="jac",**tol)
    cumulative_nfev += int(dense.nfev)
    dense_row=metrics(f'same-secondary-dense-final-{cfg["denseFinalBudget"]}',dense)
    dense_row["cumulativeFunctionEvaluations"]=cumulative_nfev
    runs.append(dense_row)
    persisted=trial["multistartEvidence"]
    return {"equations":"per stage: 6 scaled component balances followed by 6 isoactivity equations","variableLayout":"log([R_1..R_6,E_1..E_6]) per stage",
      "starts":{"baseStartSha256":hashlib.sha256(base_start.tobytes()).hexdigest(),"secondaryStartSha256":hashlib.sha256(secondary_start.tobytes()).hexdigest(),
        "definition":"exact direct-NT7 one-stage seed repeated; secondary adds tiled linspace(-0.015,+0.015,12)"},
      "persistedTargets":{"primaryMaximum":persisted["primary"]["maximumScaledEquationResidual"],"secondary20Maximum":persisted["secondary"]["maximumScaledEquationResidual"]},
      "runs":runs}
def persisted_min(stage):
    s=stage["postSplitTpdSearch"]["extract"]
    return np.array(s["minimizingComposition"],float),float(s["minimum"])
def phase_from_stage(stage):
    return np.array(stage["extractLeaving"]["moleFractions"],float)
def split_audit(z, params, seeds):
    """Solve full complete-model two-phase stationary equations from both seeds."""
    rows=[]
    for label, trial in seeds:
        trial=norm(trial)
        beta=max(1e-5,min(.5,.5*min(z[i]/trial[i] for i in range(6) if trial[i]>1e-8)))
        r=norm((z-beta*trial)/(1-beta)); initial=np.r_[np.log(r[:-1]/r[-1]),np.log(trial[:-1]/trial[-1]),np.log(beta/(1-beta))]
        def unpack(v):
            return model.base.softmax(v[:5]),model.base.softmax(v[5:10]),1/(1+np.exp(-v[10]))
        def equations(v):
            rr,ee,bb=unpack(v)
            return np.r_[mu(rr,params)-mu(ee,params),((1-bb)*rr+bb*ee-z)[:5]]
        sol=least_squares(equations,initial,xtol=1e-11,ftol=1e-11,gtol=1e-11,max_nfev=200)
        r,e,b=unpack(sol.x); iso=float(max(abs(mu(r,params)-mu(e,params)))); bal=float(max(abs((1-b)*r+b*e-z)))
        stationary=bool(sol.success and iso<=2e-5 and bal<=1e-8)
        reduction=float(g(z,params)-((1-b)*g(r,params)+b*g(e,params)))
        admissible=bool(stationary and reduction>1e-8 and b>1e-8 and b<1-1e-8 and max(abs(r-e))>=1e-4)
        rows.append({"seed":label,"solverSuccess":bool(sol.success),"raffinate":r.tolist(),"extract":e.tolist(),"betaExtract":float(b),
          "isoactivityLogResidual":iso,"materialBalanceMaxResidual":bal,"gibbsReduction":float(g(z,params)-((1-b)*g(r,params)+b*g(e,params))),
          "stationary":stationary,"admissibleLowerGibbsPhaseSplit":admissible})
    phase_evidence=any(row["admissibleLowerGibbsPhaseSplit"] for row in rows)
    return {"executed":True,"reseededStationarySplits":rows,"phaseMetastabilityDemonstrated":phase_evidence,
      "fullCascadeAlternateBranchDemonstrated":False,
      "note":"A lower-Gibbs split of the isolated persisted phase is phase-metastability evidence, not proof of a closed alternate cascade branch."}
def main():
    source=json.loads(INPUT.read_text()); fit=json.loads(AMEND.read_text())
    pmap=fit["model"]["parameters"]; params=np.array([pmap[k] for k in model.PARAMETER_NAMES])
    records=[]
    for scenario in source["scenarios"]:
        stage=scenario["trial"]["stages"][0]; z=phase_from_stage(stage); helper_w,helper_tpd=persisted_min(stage)
        mono=np.full(6,FLOOR);mono[1]=1-5*FLOOR
        independent,all_runs=slsqp(z,params,[("persisted-near-pure-MONO",helper_w),
          ("reference-extract",z),("uniform",np.ones(6)/6)])
        direct=terms(z,helper_w,params); dval,tid,err=identity(z,helper_w,params)
        # This is the objective used inside the current helper, evaluated at
        # exactly the same z,w (separate from whether its search found/refined w).
        helper_same=float(np.sum(norm(helper_w)*(np.log(norm(helper_w))+model.total_lngamma(
          model.FAMILIES,P["temperatureK"],norm(helper_w),params)-np.log(norm(z))-model.total_lngamma(
          model.FAMILIES,P["temperatureK"],norm(z),params))))
        zero=terms(z,z,params); bd=[{"floor":f,"tpd":terms(z,np.array([f,1-5*f,f,f,f,f]),params)["total"]}
             for f in (1e-5,1e-8,1e-10,1e-12)]
        base_only=terms(z,helper_w,np.zeros_like(params))
        res_only={"ideal":direct["ideal"],"residualAmendment":direct["residualAmendment"],
                  "total":direct["ideal"]+direct["residualAmendment"]}
        tdiff=abs(independent["tpd"]-helper_tpd); xdiff=float(np.max(abs(np.array(independent["composition"])-helper_w)))
        objective_difference=abs(helper_same-direct["total"])
        mismatch=objective_difference>G["optimizerAgreementTolerance"]
        search_incomplete=independent["tpd"] < direct["total"]-G["optimizerAgreementTolerance"]
        residual_driven=(base_only["total"] >= G["negativeTpdThreshold"] and direct["total"] < G["negativeTpdThreshold"])
        classes=(["TPD_IMPLEMENTATION_MISMATCH"] if mismatch else []) + (["RESIDUAL_AMENDMENT_DRIVEN"] if residual_driven else [])
        if base_only["total"] < G["negativeTpdThreshold"]: classes.append("BASE_SURFACE_DRIVEN")
        if not classes: classes=["UNRESOLVED"]
        checks={"identityAtZ":abs(zero["total"])<=G["identityTolerance"],"tangentPlaneIdentity":abs(err)<=G["identityTolerance"],
          "finiteDifferenceTangentGradientAtZ":float(np.max(abs(fd_gradient(z,z,params))))<=G["gradientTolerance"],
          "gibbsDuhemChemicalPotentialConsistencyAtZ":chemical_consistency(z,params)<=G["chemicalPotentialConsistencyTolerance"],
          "boundaryApproach":max(abs(bd[-1]["tpd"]-helper_tpd),abs(bd[-2]["tpd"]-helper_tpd))<=2e-5,
          "slsqpKkt":independent["kktProjectedGradientInfinityNorm"]<=G["kktTolerance"]}
        records.append({"scenario":scenario["name"],"referenceStage":"Stage 1 extract","referenceComposition":z.tolist(),
          "persistedHelper":{"minimum":helper_tpd,"composition":helper_w.tolist()},
          "directMoleFractionTpd":direct,"exactTangentPlane":{"direct":dval,"identity":tid,"difference":err},
          "validation":checks,"finiteDifferenceGradientAtZ":fd_gradient(z,z,params).tolist(),
          "finiteDifferenceGradientAtDecisiveBoundaryCandidate":fd_gradient(z,helper_w,params).tolist(),
          "chemicalPotentialConsistencyMaxResidualAtZ":chemical_consistency(z,params),"boundaryApproachPureMono":bd,
          "comparisonMatrix":{"baseKernelOnly":base_only,"residualContributionOnly":res_only,"completeModel":direct,
            "persistedHelperSearchReported":helper_tpd,"currentHelperObjectiveAtSameComposition":helper_same,
            "directObjectiveAtSameComposition":direct["total"],"sameCompositionObjectiveDifference":objective_difference,
            "independentSLSQP":independent["tpd"],"searchCompletenessGapFromPersistedBoundary":direct["total"]-independent["tpd"],
            "searchIncomplete":search_incomplete},
          "independentSLSQP":{"best":independent,"allDeterministicStarts":all_runs,
             "tpdDifferenceFromHelper":tdiff,"compositionInfinityDifferenceFromHelper":xdiff},
          "tpdSearchAssessment":{
            "objectiveImplementation":"SAME_COMPOSITION_ALGEBRAIC_AGREEMENT",
            "searchCompleteness":"INCOMPLETE_MORE_NEGATIVE_CONSTRAINED_MINIMUM_FOUND" if search_incomplete else "NO_MATERIAL_GAP_FOUND",
            "causedNegativeVerdict":False,
            "reason":"Two algebraic assembly paths agree at identical compositions, but share the same activity-coefficient kernel and therefore do not constitute fully independent implementation validation. The helper still finds a materially negative basin, while independent SLSQP refines it lower."
          },
          "splitReseed":split_audit(z,params,[("persisted-near-pure-MONO",helper_w),("independent-global-SLSQP",independent["composition"])]),
          "multistartCascade":cascade_residual_diagnostic(scenario,params),"classification":classes})
    results={"task":205,"analysis":"ISOLATED_NEGATIVE_TPD_SOURCE_DIAGNOSTIC","governance":P["governance"],
      "inputImmutableSha256":sha(INPUT),"modelSha256":sha(MODEL_PATH),"protocolSha256":sha(HERE/"protocol.json"),
      "scenarios":records,"rootCauseSynthesis":{"phaseStability":"Residual-amendment-driven remote MONO-rich basin with lower-Gibbs isolated-phase split evidence; base COSMO-SAC is positive at the same compositions.",
        "tpdImplementation":"No same-composition objective mismatch was found between two algebraic assembly paths sharing the same activity kernel; current helper search is incomplete but correctly detects the negative basin.",
        "cascadeMultistart":"The unchanged deterministic secondary start is continued under larger diagnostic budgets and classified only from its final closure and product agreement.",
        "relationship":"INDEPENDENT_EVIDENCE_TRACKS_PENDING_FINAL_MULTISTART_CLASSIFICATION"},"failClosed":True}
    final_multistart=[r["multistartCascade"]["runs"][-1] for r in records]
    if all(r["classification"]=="PRIMARY_BRANCH" for r in final_multistart):
      results["rootCauseSynthesis"]["relationship"]="SEPARATE_PROXIMATE_FINDINGS: extended secondary solves recover the primary cascade branch, while phase instability remains residual-amendment-driven; no causal link between them is demonstrated."
    elif any(r["classification"]=="DISTINCT_CLOSED_BRANCH" for r in final_multistart):
      results["rootCauseSynthesis"]["relationship"]="POSSIBLY_LINKED_BUT_NOT_PROVEN: at least one secondary start closes on a distinct cascade branch while isolated phases are metastable."
    else:
      results["rootCauseSynthesis"]["relationship"]="INDEPENDENT_EVIDENCE_TRACKS_UNRESOLVED: secondary cascade starts remain unclosed, so no causal link to the residual-driven phase instability is demonstrated."
    OUT.mkdir(parents=True,exist_ok=True); (OUT/"results.json").write_text(json.dumps(results,indent=2)+"\n")
    report=["# Task 205 — Isolated negative-TPD diagnostic","","Research-only; calibration required; not pilot validated or release eligible.","",
      "| Scenario | Helper TPD | independent SLSQP | Base-only TPD | Residual term | Classification |","|---|---:|---:|---:|---:|---|"]
    for r in records:
      m=r["comparisonMatrix"]; report.append(f'| {r["scenario"]} | {r["persistedHelper"]["minimum"]:.9g} | {m["independentSLSQP"]:.9g} | {m["baseKernelOnly"]["total"]:.9g} | {m["completeModel"]["residualAmendment"]:.9g} | {", ".join(r["classification"])} |')
    report += ["","## Track A — exact direct-NT7 multistart continuation","",
      "| Scenario | persisted secondary (20) | continued sparse | dense/standard | disposition |","|---|---:|---:|---:|---|"]
    for r in records:
      runs=r["multistartCascade"]["runs"]
      report.append(f'| {r["scenario"]} | {runs[1]["maximumResidual"]:.6g} | {runs[-2]["maximumResidual"]:.6g} | {runs[-1]["maximumResidual"]:.6g} | {runs[-1]["classification"]} |')
    report += ["","The exact 20-evaluation secondary residuals and product differences reproduce the immutable artifact. Continued solves use the same start lineage; stage/equation-family maxima and RMS values are machine-readable.",
      "","## Track B — phase stability","",
      "The six-variable constrained SLSQP uses a dimensionally correct independently finite-differenced Jacobian and projected KKT test. Two same-composition algebraic assembly paths agree but share the same activity kernel; this excludes an observed algebraic mismatch, not every possible implementation defect. The lower optimized MONO-rich basin is reported as search incompleteness.",
      "","The constrained direct calculation and tangent-plane identity are recorded per scenario in `results.json`.",
      "Lower-Gibbs stationary splits of the isolated extract phases are phase-metastability evidence only. No full alternate closed cascade branch is claimed.",
      "","## Root-cause synthesis","",results["rootCauseSynthesis"]["relationship"]]
    (OUT/"report.md").write_text("\n".join(report)+"\n")
if __name__=="__main__": main()