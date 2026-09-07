"""Unqualified Job-C candidate interface equations; qualification stays in Job B."""
VERSION = "ECR_JOB_C_CANDIDATE_INTERFACE_V1"

class CandidateFailure(RuntimeError):
    pass

class CandidateInterfaceSolver:
    def __init__(self, engine, temperature, kc, kd, ctc, ctd, phase_config):
        self.engine, self.temperature = engine, temperature
        self.np, self.scipy = engine.np, engine.scipy
        self.kcct = self.np.asarray(kc) * ctc
        self.kdct = self.np.asarray(kd) * ctd
        self.scale = self.np.maximum(self.np.maximum(self.kcct, self.kdct), 1e-12)
        self.bound = float(2*self.np.sum(self.kcct+self.kdct))
        self.phase_config = phase_config
        self.warm = None
        self.fallback_count = 0
        self.last_boundary_assessments = []

    def softmax(self, z):
        y=self.np.r_[z,0.0]; y-=self.np.max(y); e=self.np.exp(y)
        return e/self.np.sum(e)

    def logits(self, x):
        safe=self.np.maximum(self.np.asarray(x),1e-14); safe/=self.np.sum(safe)
        return self.np.log(safe[:-1]/safe[-1])

    def transform(self, u):
        """Map 13 unconstrained coordinates to the exact Job-B unknowns."""
        u=self.np.asarray(u)
        return self.softmax(u[:6]),self.softmax(u[6:12]),self.bound*self.np.tanh(u[12])

    def inverse_transform(self, xi_c, xi_d, n):
        ratio=self.np.clip(float(n)/self.bound,-1+1e-14,1-1e-14)
        return self.np.r_[self.logits(xi_c),self.logits(xi_d),self.np.arctanh(ratio)]

    def residual(self, u, xb_c, xb_d):
        """The unchanged 7 isoactivity + 6 scaled two-film equations."""
        return self.equations(u,xb_c,xb_d)[0]

    def equations(self, u, xb_c, xb_d):
        xi_c,xi_d,n=self.transform(u)
        mu=self.engine.mu(xi_c,self.temperature)-self.engine.mu(xi_d,self.temperature)
        raw_c=self.kcct*(xb_c-xi_c); raw_d=self.kdct*(xi_d-xb_d)
        jc=raw_c-xi_c*self.np.sum(raw_c); jd=raw_d-xi_d*self.np.sum(raw_d)
        nc=jc+xi_c*n; nd=jd+xi_d*n; delta=nc-nd
        return (self.np.r_[mu,delta[:6]/self.scale[:6]],
                xi_c,xi_d,n,nc,nd,delta)

    def boundary_compatibility(self, xb_d, nc):
        """Gate exact-zero dispersed inventory using the physical tangent cone."""
        rows=[]
        for i,name in enumerate(("SAT","MONO","DI","POLY","PA","NMP","H2O")):
            if float(xb_d[i]) == 0.0:
                flux=float(nc[i])
                rows.append({"component":name,
                    "continuousToDispersedFluxMolM2S":flux,
                    "accepted":flux >= 0.0})
        return {"accepted":all(row["accepted"] for row in rows),
                "signConvention":
                    "POSITIVE_REMOVES_FROM_CONTINUOUS_AND_ADDS_TO_DISPERSED",
                "absentDispersedComponents":rows}

    def solve(self, xc, xd):
        xb_c,xb_d=self.np.asarray(xc),self.np.asarray(xd)
        self.last_boundary_assessments=[]
        def run(label,x0,maximum):
            fit=self.scipy.optimize.least_squares(
                lambda u:self.residual(u,xb_c,xb_d),x0,bounds=(lower,upper),
                method="trf",jac="2-point",max_nfev=maximum,xtol=1e-10,ftol=1e-10,
                gtol=1e-10,x_scale="jac")
            values=self.equations(fit.x,xb_c,xb_d)
            _,xi_c_try,xi_d_try,_,nc_try,_,delta_try=values
            mu_try=self.engine.mu(xi_c_try,self.temperature)-self.engine.mu(xi_d_try,self.temperature)
            scaled_try=float(self.np.max(self.np.abs(delta_try)/self.scale))
            numerical=(fit.success and float(self.np.max(self.np.abs(mu_try)))<=1e-7
                      and scaled_try<=1e-7)
            boundary=self.boundary_compatibility(xb_d,nc_try)
            self.last_boundary_assessments.append({
                "startClass":label,"numericalAccepted":bool(numerical),
                "boundaryCompatibility":boundary})
            return fit,values,numerical and boundary["accepted"]
        lower=self.np.full(13,-35.0)
        upper=self.np.full(13,35.0)
        if self.warm is not None:
            fit,values,accepted=run("WARM_CONTINUATION",self.warm,120)
            if accepted:
                best=(float(self.np.max(self.np.abs(values[0]))),
                      "WARM_FAST_PATH",fit,values)
                return self._response(best,xb_c,xb_d)
            self.fallback_count+=1
        seeds=[]
        nmp=self.np.asarray((.01,.01,.01,.005,.005,.88,.08))
        rrbo=self.np.asarray((.72,.12,.06,.025,.015,.05,.01))
        oriented=(nmp,rrbo) if self.phase_config=="nmp-continuous-rrbo-dispersed" else (rrbo,nmp)
        seeds.append(("ORIENTED_PHASE_TEMPLATE",
            self.inverse_transform(oriented[0],oriented[1],0.0)))
        seeds.append(("CURRENT_BULKS",self.np.r_[self.logits(xb_c),self.logits(xb_d),0.0]))
        best=None
        for label,x0 in seeds:
            fit,values,accepted=run(label,x0,500)
            metric=float(self.np.max(self.np.abs(values[0])))
            if best is None or metric<best[0]: best=(metric,label,fit,values)
            if accepted:
                best=(metric,label,fit,values)
                break
        return self._response(best,xb_c,xb_d)

    def _response(self, best, xb_c, xb_d):
        metric,label,fit,values=best
        _,xi_c,xi_d,n,nc,nd,delta=values
        mu=self.engine.mu(xi_c,self.temperature)-self.engine.mu(xi_d,self.temperature)
        scaled=float(self.np.max(self.np.abs(delta)/self.scale))
        if not fit.success or float(self.np.max(self.np.abs(mu)))>1e-7 or scaled>1e-7:
            raise CandidateFailure("JOB_C_CANDIDATE_INTERFACE_NONCONVERGENCE")
        boundary=self.boundary_compatibility(xb_d,nc)
        if not boundary["accepted"]:
            raise CandidateFailure(
                "JOB_C_CANDIDATE_INTERFACE_BOUNDARY_INCOMPATIBLE")
        self.warm=fit.x.copy()
        return {
            "version":VERSION,"qualification":"CANDIDATE_ONLY_NO_STABILITY_CLAIM",
            "unknowns":fit.x.tolist(),"interfaceContinuousMoleFractions":xi_c.tolist(),
            "interfaceDispersedMoleFractions":xi_d.tolist(),
            "continuousComponentFluxMolM2S":nc.tolist(),
            "dispersedComponentFluxMolM2S":nd.tolist(),
            "maximumEquationResidual":metric,
            "maximumIsoactivityResidual":float(self.np.max(self.np.abs(mu))),
            "maximumScaledFluxEqualityResidual":scaled,
            "dispersedInletBoundaryCompatibility":boundary,
            "functionEvaluations":int(fit.nfev),"startClass":label,
            "warmFastPathUsed":label=="WARM_FAST_PATH",
            "fallbackCount":self.fallback_count,
        }