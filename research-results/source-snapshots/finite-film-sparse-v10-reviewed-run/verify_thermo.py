#!/usr/bin/env python3
"""Bounded, no-solve qualification of the finite-film excess-force adapter."""
from __future__ import annotations
import hashlib, importlib.util, json, os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "research-results/finite-film-thermo-validation.json"
SNAPSHOT = ROOT / "research-results/job-c-final-continuation.json"
ARCHIVE = ROOT / "research-results/job-c-final-continuation.json.sources"
JOB_B = ROOT / "dist/job-b-interface-runtime"
STAGE4 = ROOT / "dist/stage4-seven-component-adapter-runtime"
BASE = ROOT / "dist/predictive-nt-runtime-7c-1-5"
# Match the isolated worker process: load numerical modules only from the
# manifest-pinned vendor tree before importing the adapter.
VENDOR = BASE / "server/research/ecr-pre-pilot-cosmosac/vendor/python"
sys.path.insert(0, str(VENDOR))
from thermo_adapter import (ConstantExcessAdapter, FiniteFilmThermoAdapter,
                            IdealExcessAdapter, ThermoAdapterError)
THRESH = {"muAgreementAbs": 2e-10, "derivativeStepRelative": 2e-3,
          "gibbsDuhemAbs": 2e-6, "tangentIntegrabilityAbs": 2e-5,
          "syntheticDerivativeAbs": 2e-10}

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def maximum(value): return float(np.max(np.abs(value)))
def basis(d):
    eye=np.eye(7)
    return np.asarray([eye[:,j]-eye[:,d] for j in range(7) if j != d]).T
def module(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    value=importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(value)
    return value

def load_pinned_adapter():
    """Construct only the manifest-pinned evaluator; never invoke a solver.

    Returns ``(adapter, engine, temporary, lineage)``.  The caller owns and
    must clean up ``temporary``.  Any manifest/runtime mismatch raises rather
    than falling back to a mutable or unpinned model.
    """
    os.environ.update({
      "JOB_B_INTERFACE_RUNTIME_ROOT":str(JOB_B),
      "STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT":str(STAGE4),
      "STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT":str(BASE),
      "JOB_B_INTERFACE_PROTOCOL":"ECR_JOB_B_INTERFACE_V1",
      "STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL":"ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1"})
    worker=module(JOB_B/"server/ecr-pre-pilot/job-b-interface/worker.py",
                  "finite_film_pinned_job_b")
    temporary,engine,integrity,runtime=worker.scientific.build_engine(298.15,0.0)
    adapter=FiniteFilmThermoAdapter(
      lambda x:engine.model.wet_lngamma(engine.np,298.15,x))
    lineage={
      "runtimeLoad":"PINNED_JOB_B_STAGE4_BASE_MANIFESTS_VERIFIED",
      "jobBManifestSha256":sha(JOB_B/"job-b-interface-manifest.json"),
      "stage4ManifestSha256":sha(STAGE4/"stage4-seven-component-adapter-manifest.json"),
      "baseManifestSha256":sha(BASE/"predictive-nt-runtime-manifest.json"),
      "engineIntegrity":integrity,"runtime":runtime}
    return adapter,engine,temporary,lineage

def archived_state():
    """Execute exactly the read-only audit prefix; it performs no root solve."""
    path=ROOT/"scripts/audit-job-c-axial-nmp.py"
    prefix=path.read_text().split('output = Path',1)[0]
    old=Path.cwd()
    try:
        os.chdir(ROOT)
        scope={"__name__":"finite_film_archived_state_prefix"}
        exec(compile(prefix,str(path),"exec"),scope)
    finally:
        os.chdir(old)
    c,d,u,solver=scope["c"],scope["d"],scope["u"],scope["solver"]
    xi_c,xi_d,total_flux=solver.transform(u[0])
    return {
      "cell1_continuous":c[0]/c[0].sum(),
      "cell1_dispersed":d[0]/d[0].sum(),
      "cell1_interface_continuous":xi_c,
      "cell1_interface_dispersed":xi_d,
      "literal_zero_dry_inlet":scope["feedd"]/scope["feedd"].sum(),
    },scope,float(total_flux)

def regular_solution(matrix):
    matrix=np.asarray(matrix,float)
    def excess(x):
        mx=matrix@x
        return mx-0.5*float(x@mx)*np.ones(7)
    def derivative(x,d):
        B=basis(d)
        return matrix@B-np.ones((7,1))@(x@matrix@B)[None,:]
    return excess,derivative

def synthetic_checks():
    matrix=np.diag(np.arange(1.,8.)/20)
    excess,exact=regular_solution(matrix)
    points={
      "interior":np.array([.12,.11,.10,.09,.08,.31,.19]),
      "tinyPositive":np.array([1e-14,.11,.10,.09,.08,.31,.31-1e-14]),
      "literalZero":np.array([0.,.11,.10,.09,.08,.31,.31]),
    }
    rows=[]
    for name,x in points.items():
        d=int(np.argmax(x)); adapter=FiniteFilmThermoAdapter(excess)
        calculated=adapter.excess_jacobian_full(x,d)@basis(d)
        error=maximum(calculated-exact(x,d))
        rows.append({"name":name,"status":"PASS" if error<=THRESH["syntheticDerivativeAbs"] else "FAIL",
                     "maximumAbsError":error,"derivativeDetails":adapter.last_derivative})
    ideal=IdealExcessAdapter()
    constant=ConstantExcessAdapter(np.arange(7.))
    x=points["interior"]
    refusals={}
    for name,bad,dep in [
      ("negative",np.array([-.01,.11,.10,.09,.08,.32,.31]),None),
      ("notNormalized",x*0.9,None),
      ("zeroDependent",points["literalZero"],0)]:
        try:
            ideal.excess_jacobian_full(bad,dep)
            refusals[name]=False
        except ThermoAdapterError:
            refusals[name]=True
    return {"regularSolution":rows,
      "idealZero":maximum(ideal.excess_jacobian_full(x))<=THRESH["syntheticDerivativeAbs"],
      "constantValue":maximum(constant.excess(x)-np.arange(7.))<=THRESH["syntheticDerivativeAbs"],
      "constantZero":maximum(constant.excess_jacobian_full(x))<=THRESH["syntheticDerivativeAbs"],
      "refusals":refusals}

def synthetic_passed(result):
    return (all(row["status"]=="PASS" for row in result["regularSolution"])
            and result["idealZero"] and result["constantValue"]
            and result["constantZero"] and all(result["refusals"].values()))

def forward_refinement(excess,x,d):
    """Diagnose one-sided directions without asserting an unfloored limit."""
    B=basis(d)
    grid=(2e-6,1e-6,5e-7)
    rows=[]; matrices=[]
    for h in grid:
        candidate=FiniteFilmThermoAdapter(excess,one_sided_step=h)
        gamma=candidate.excess_jacobian_full(x,d,step=2e-5)
        tangent=gamma@B
        schemes=candidate.last_derivative["schemes"]
        directions=[]
        basis_columns=[j for j in range(7) if j != d]
        for column,j in enumerate(basis_columns):
            if schemes[str(j)]["method"].startswith("second_order_forward"):
                directions.append({
                  "componentIndex":j,
                  "step":schemes[str(j)]["step"],
                  "derivativeVectorInfinityNorm":maximum(tangent[:,column]),
                  "gibbsDuhemAbs":abs(float(x@tangent[:,column]))})
        projected=B.T@gamma@B
        rows.append({"requestedForwardStep":h,"forwardDirections":directions,
          "unsymmetrizedGibbsDuhemAbs":maximum(x@tangent),
          "tangentIntegrabilityAbs":maximum(projected-projected.T)})
        matrices.append(tangent)
    convergence=[]
    for coarse,fine,left,right in zip(matrices,matrices[1:],grid,grid[1:]):
        per_direction=[]
        for column,j in enumerate([j for j in range(7) if j != d]):
            per_direction.append({"componentIndex":j,
              "relativeChange":maximum(coarse[:,column]-fine[:,column])/
                max(1.,maximum(fine[:,column]))})
        convergence.append({"coarseStep":left,"fineStep":right,
          "maximumRelativeChange":max(row["relativeChange"] for row in per_direction),
          "perDirection":per_direction})
    passed=(all(row["maximumRelativeChange"]<=THRESH["derivativeStepRelative"]
                for row in convergence)
      and all(row["unsymmetrizedGibbsDuhemAbs"]<=THRESH["gibbsDuhemAbs"]
              and row["tangentIntegrabilityAbs"]<=THRESH["tangentIntegrabilityAbs"]
              for row in rows))
    return {"purpose":"numerical refinement of clipped-engine directional evaluations; not evidence of true unfloored boundary physics",
      "status":"PASS_NUMERICAL_REFINEMENT" if passed else "FAIL_NUMERICAL_REFINEMENT",
      "grid":rows,"convergence":convergence}

def main():
    global np
    temporary=None
    load_error=None
    integrity=runtime=engine=None
    try:
        loaded_adapter,engine,temporary,lineage=load_pinned_adapter()
        integrity,runtime=lineage["engineIntegrity"],lineage["runtime"]
        np=engine.np
    except Exception as error:
        load_error=error
        # The report still has to be serializable without substituting another
        # thermodynamic model.  No numerical qualification follows this branch.
        import numpy as np
    synthetic=synthetic_checks()
    states,audit,total_flux=archived_state()
    dry=states["literal_zero_dry_inlet"]
    report={
      "schemaVersion":"FINITE_FILM_THERMO_VALIDATION_V1",
      "thresholds":THRESH,
      "interfaceContract":{
        "excess":"ndarray(7), dimensionless ln(gamma); stateful evaluator",
        "excessJacobianFull":"ndarray(7,7) directional extension; column dependentIndex is zero and column j is d/d(e_j-e_dependent)",
        "solverUse":"GammaFull @ xp is the simplex-tangent excess derivative when sum(xp)=0",
        "notAClaim":"the 7x7 extension is not an unconstrained Hessian; symmetry is tested on tangent coordinates",
        "idealTerm":"analytic ln(x) remains separate; no physical composition is floored",
        "pinnedLoader":"load_pinned_adapter() returns (adapter, engine, temporary, lineage); caller must cleanup temporary"},
      "sources":{
        "snapshot":str(SNAPSHOT.relative_to(ROOT)),"snapshotSha256":sha(SNAPSHOT),
        "sourceResponseSha256":audit["body"]["resultSha256"],
        "sourceInputSha256":audit["snapshot"]["inputSha256"],
        "sourceStateSha256":audit["digest"](audit["state"].tolist()),
        "auditPrefix":"scripts/audit-job-c-axial-nmp.py before output = Path",
        "auditSourceSha256":sha(ROOT/"scripts/audit-job-c-axial-nmp.py"),
        "jobBManifestSha256":sha(JOB_B/"job-b-interface-manifest.json"),
        "stage4ManifestSha256":sha(STAGE4/"stage4-seven-component-adapter-manifest.json"),
        "baseManifestSha256":sha(BASE/"predictive-nt-runtime-manifest.json"),
        "adapterSourceSha256":sha(ROOT/"research/finite_film/thermo_adapter.py"),
        "verifierSourceSha256":sha(ROOT/"research/finite_film/verify_thermo.py")},
      "savedState":{"cell1TotalMolarFluxMolM2S":total_flux,
        "compositionSource":"hashed continuation startingState; c/d normalized and u transformed without solve"},
      "synthetic":synthetic,"cases":[],"literalZeroBoundary":{
        "physicalComposition":dry.tolist(),"status":"FAIL_TRUE_LIMIT_UNQUALIFIED",
        "inspectedEvidence":"pinned assembled NativePlusRkModel.wet_lngamma applies maximum(x,1e-12) then normalizes",
        "distModelPath":"dist/predictive-nt-runtime-7c-1-5/server/research/ecr-pre-pilot-seven-component-rk-cascade/model.py",
        "distModelSha256":sha(BASE/"server/research/ecr-pre-pilot-seven-component-rk-cascade/model.py"),
        "numericalOneSidedResultIsQualificationEvidence":False,
        "trueBoundaryQualification":"FAIL_INDEPENDENT_OF_NUMERICAL_REFINEMENT"},
      "savedCellSolve":"STOPPED_DERIVATIVE_QUALIFICATION_FAILED",
      "productionJobsRun":[]}
    try:
        if load_error is not None:
            raise load_error
        report["sources"]["runtimeLoad"]=lineage["runtimeLoad"]
        report["sources"]["engineIntegrity"]=integrity
        report["sources"]["runtime"]=runtime
        adapter=loaded_adapter
        raw_excess=lambda x:engine.model.wet_lngamma(engine.np,298.15,x)
        for name,x in states.items():
            x=np.asarray(x,float); d=int(np.argmax(x)); B=basis(d)
            row={"name":name,"composition":x.tolist(),"dependentIndex":d,
                 "minimumFraction":float(x.min()),"steps":[2e-5,1e-5]}
            g1=adapter.excess_jacobian_full(x,d,step=2e-5)
            detail1=adapter.last_derivative
            g2=adapter.excess_jacobian_full(x,d,step=1e-5)
            row["derivativeDetails"]={"coarse":detail1,"fine":adapter.last_derivative}
            row["derivativeStepRelative"]=maximum((g1-g2)@B)/max(1.,maximum(g2@B))
            row["unsymmetrizedGibbsDuhemAbs"]=maximum(x@(g2@B))
            tangent=B.T@g2@B
            row["tangentIntegrabilityAbs"]=maximum(tangent-tangent.T)
            away=bool(np.all(x>1e-10))
            row["muAgreementAdmittedAwayFromEngineFloor"]=away
            if away:
                row["muMinusLnXAgreementAbs"]=maximum(
                  adapter.excess(x)-(np.asarray(engine.mu(x,298.15))-np.log(x)))
            else:
                row["muMinusLnXAgreementAbs"]=None
                row["limitation"]="composition at/below engine normalization floor; no clipped comparison counted as evidence"
            numerical=(row["derivativeStepRelative"]<=THRESH["derivativeStepRelative"]
              and row["unsymmetrizedGibbsDuhemAbs"]<=THRESH["gibbsDuhemAbs"]
              and row["tangentIntegrabilityAbs"]<=THRESH["tangentIntegrabilityAbs"]
              and (not away or row["muMinusLnXAgreementAbs"]<=THRESH["muAgreementAbs"]))
            row["numericalStatus"]="PASS" if numerical else "FAIL"
            row["qualificationStatus"]=(
              "PASS_POSITIVE_INTERIOR" if numerical and away else
              "DIAGNOSTIC_ONLY_ENGINE_FLOOR_DOMAIN" if numerical else "FAIL")
            if any(x[j] < 2e-5 for j in range(7) if j != d):
                row["secondOrderForwardRefinement"]=forward_refinement(
                  raw_excess,x,d)
                row["currentDerivativeNumericalStatus"]=row[
                  "secondOrderForwardRefinement"]["status"]
            else:
                row["currentDerivativeNumericalStatus"]=row["numericalStatus"]
            row["trueBoundaryQualification"]=(
              "NOT_APPLICABLE_POSITIVE_ADMITTED_INTERIOR" if away else
              "FAIL_OR_UNAVAILABLE_ENGINE_FLOOR_DOMAIN")
            report["cases"].append(row)
        positive=[r for r in report["cases"] if r["muAgreementAdmittedAwayFromEngineFloor"]]
        report["positiveInteriorStatus"]="PASS" if positive and all(
          r["numericalStatus"]=="PASS" for r in positive) else "FAIL"
        report["outcome"]="FAIL_BOUNDARY_DERIVATIVE_UNQUALIFIED"
        report["qualificationStatus"]="NOT_SAFE_FOR_SAVED_CELL_SOLVE"
        saved_bulk_failures=[r["name"] for r in report["cases"]
          if r["name"] in ("cell1_continuous","cell1_dispersed")
          and r["qualificationStatus"]!="PASS_POSITIVE_INTERIOR"]
        report["stopReasons"]=[
          "PINNED_WET_LNGAMMA_CLIPS_LITERAL_ZEROS_SO_TRUE_BOUNDARY_LIMIT_IS_UNQUALIFIED"]
        if saved_bulk_failures:
            report["outcome"]="FAIL_SAVED_CELL_DERIVATIVE_AND_BOUNDARY_LIMIT_UNQUALIFIED"
            report["stopReasons"].append(
              "SAVED_CELL_BULK_NOT_QUALIFIED:"+",".join(saved_bulk_failures))
        if not synthetic_passed(synthetic):
            report["outcome"]="FAIL_SYNTHETIC_DERIVATIVE_IMPLEMENTATION"
    except Exception as error:
        report["outcome"]="FAIL_PINNED_RUNTIME_OR_VALIDATION"
        report["qualificationStatus"]="NOT_SAFE_FOR_SAVED_CELL_SOLVE"
        report["error"]=f"{type(error).__name__}: {error}"
    finally:
        if temporary is not None: temporary.cleanup()
    OUT.write_text(json.dumps(report,sort_keys=True,indent=2,allow_nan=False)+"\n")

if __name__=="__main__":
    main()