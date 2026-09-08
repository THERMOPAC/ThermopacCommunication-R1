"""Diagnostic continuation of the ORIGINAL coupled FV/interface equations.

Zero-active and signed roots are diagnostics, never operating states. No source,
feed, equation, or engineering acceptance tolerance is altered here.
"""
VERSION = "ECR_JOB_C_BRANCH_CONTINUATION_V1"


def dispersed_cell1_balance(np, ev, dispersed_ct, dax, area, dz, uncertainty=None):
    d = ev["d"]
    cd = d / d.sum(axis=1)[:, None] * dispersed_ct
    i = 5  # NMP; cell 1 is the dispersed outlet, not its feed.
    left_convection = -float(d[0, i])
    right_convection = -float((d[0, i] + d[1, i]) / 2)
    left_backmixing = 0.0  # prescribed zero-gradient outlet face
    right_backmixing = -dax * area * float(cd[1, i] - cd[0, i]) / dz
    convection = left_convection - right_convection
    backmixing = left_backmixing - right_backmixing
    transfer = float(ev["tr"][0, i])
    residual = convection + backmixing + transfer
    roundoff = 16 * np.finfo(float).eps * (
        abs(left_convection) + abs(right_convection)
        + abs(right_backmixing) + abs(transfer))
    return {
        "phase": "dispersed", "component": "NMP", "numericalCell": 1,
        "flowMolS": float(d[0, i]),
        "neighborCell2FlowMolS": float(d[1, i]),
        "convectionMolS": convection,
        "axialBackmixingMolS": backmixing,
        "interphaseTransferMolS": transfer,
        "residualMolS": residual,
        "originalFvResidualMolS": float(ev["rd"][0, i]),
        "decompositionDifferenceMolS": residual - float(ev["rd"][0, i]),
        "signedFaces": {
            "leftConvectionMolS": left_convection,
            "rightConvectionMolS": right_convection,
            "leftBackmixingMolS": left_backmixing,
            "rightBackmixingMolS": right_backmixing,
        },
        "equation": "fd_conv[0]-fd_conv[1]+fd_ax[0]-fd_ax[1]+lambda*Nc*a*A*dz=0",
        "numericalUncertainty": {
            "residualRoundoffEstimateMolS": float(roundoff),
            **(uncertainty or {}),
        },
    }


class BranchContinuation:
    """Dense fixed-lambda corrector with a zero-active boundary diagnostic."""
    def __init__(self, np, scipy, residual, metrics, scales, lower, upper,
                 m, balance, progress, check_budget, arclength=None, sparsity=None):
        self.np, self.scipy = np, scipy
        self.residual, self.metrics = residual, metrics
        self.scales, self.lower, self.upper = scales, lower, upper
        self.m, self.flow_count = m, 14 * m
        self.active = 7 * m + 5
        self.balance, self.progress = balance, progress
        self.check_budget, self.arclength = check_budget, arclength
        self.sparsity = sparsity
        self.tight = 1e-11  # diagnostic precision ONLY; existing gates unchanged
        self.trace = []

    def jacobian(self, fun, y, step=1e-6, mask=None):
        self.check_budget()
        # Explicit absolute FD size remains defined at an exactly zero flow.
        sizes = step * self.np.maximum(self.np.abs(y), 1e-3)
        jac = self.scipy.optimize._numdiff.approx_derivative(
            fun, y, method="3-point", abs_step=sizes,
            sparsity=self.sparsity if mask is None else mask)
        return jac.toarray() if hasattr(jac, "toarray") else jac

    def correct(self, fun, start, domain, step=1e-6, iterations=18, mask=None):
        """Damped Newton; reject inadmissible trials, never clip coordinates."""
        np = self.np
        y = np.asarray(start).copy()
        evaluations = 0
        for iteration in range(iterations):
            self.check_budget()
            r = fun(y)
            norm = float(np.max(np.abs(r)))
            if norm <= self.tight:
                break
            jac = self.jacobian(fun, y, step, mask)
            delta = np.linalg.solve(jac, -r)
            accepted = False
            for power in range(32):
                trial = y + (0.5 ** power) * delta
                if not domain(trial):
                    continue
                rt = fun(trial)
                evaluations += 1
                if np.all(np.isfinite(rt)) and np.max(np.abs(rt)) < norm:
                    y = trial
                    accepted = True
                    break
            if not accepted:
                break
        r = fun(y)
        return y, {
            "iterations": iteration + 1, "lineSearchEvaluations": evaluations,
            "maximumEquationResidual": float(np.max(np.abs(r))),
            "tightDiagnosticClosure": bool(np.max(np.abs(r)) <= self.tight),
            "diagnosticTarget": self.tight,
        }

    def domain(self, y, allow_active_negative=False):
        np = self.np
        x = y * self.scales
        if not np.all(np.isfinite(x)) or np.any(x >= self.upper):
            return False
        flows = x[:self.flow_count]
        if allow_active_negative:
            # Algebraic extension of ALL flow coordinates. Several inventories
            # can become active together; no signed state is ever accepted.
            positive = (np.all(flows > -1e-2 * self.scales[:self.flow_count])
                        and np.all(flows.reshape(2, self.m, 7).sum(axis=2) > 0))
        else:
            positive = np.all(flows > 0)
        return bool(positive and np.all(x[self.flow_count:] > self.lower[self.flow_count:]))

    def uncertainty(self, state, lam):
        """A posteriori local estimates, explicitly NOT certified intervals."""
        np = self.np
        y = state / self.scales
        fun = lambda q: self.residual(q * self.scales, lam)
        r = fun(y)
        corrections, derivatives, rows = [], [], []
        delta_lambda = max(abs(lam) * 1e-5, 1e-10)
        rlambda = (fun_lambda(self, y, lam + delta_lambda)
                   - fun_lambda(self, y, lam - delta_lambda)) / (2 * delta_lambda)
        for step in (2e-6, 1e-6):
            jac = self.jacobian(fun, y, step)
            inv_row = np.linalg.solve(jac.T, np.eye(len(y))[self.active])
            correction = self.scales * np.linalg.solve(jac, -r)
            derivative = self.scales * np.linalg.solve(jac, -rlambda)
            roundoff = (32 * np.finfo(float).eps
                        * max(1.0, float(np.max(np.abs(y)))))
            flow_roundoff = float(self.scales[self.active] * np.sum(np.abs(inv_row)) * roundoff)
            corrections.append(correction)
            derivatives.append(derivative)
            rows.append({
                "finiteDifferenceStep": step,
                "flowCorrectionMolS": float(correction[self.active]),
                "flowRoundoffEstimateMolS": flow_roundoff,
                "dFlowDlambda": float(derivative[self.active]),
                "maximumStateCorrectionScaled": float(np.max(np.abs(correction / self.scales))),
            })
        spread = float(abs(corrections[0][self.active] - corrections[1][self.active]))
        estimate = 10 * (max(abs(row["flowCorrectionMolS"]) + row["flowRoundoffEstimateMolS"]
                             for row in rows) + spread)
        return {
            "method": "TWO_FD_JACOBIANS_RESIDUAL_CORRECTION_PLUS_ROUNDOFF_X10_LOCAL_ESTIMATE",
            "certifiedInterval": False,
            "flowAbsoluteEstimateMolS": estimate,
            "signResolved": bool(abs(state[self.active]) > estimate),
            "positiveMarginResolved": bool(state[self.active] > estimate),
            "finiteDifferenceCorrectionSpreadMolS": spread,
            "finiteDifferenceChecks": rows,
        }, derivatives[-1]

    def fixed(self, start, lam, allow_active_negative=False):
        np = self.np
        fun = lambda y: self.residual(y * self.scales, lam)
        y, solver = self.correct(
            fun, start / self.scales,
            lambda q: self.domain(q, allow_active_negative))
        state = y * self.scales
        ev, gates = self.metrics(state, lam)
        return state, {"lambda": float(lam), **solver, **gates,
                       "cell1NmpBalance": self.balance(ev),
                       "operatingStateEligible": bool(gates["accepted"]
                           and not allow_active_negative)}

    def two_start_fixed(self, start, lam, diagnostic_signed=False):
        np = self.np
        second = start.copy()
        # Perturb positive inventories multiplicatively, not absent feeds.
        second[:self.flow_count] *= np.where(np.arange(self.flow_count) % 2, 1.005, .995)
        second[self.flow_count:] += np.where(np.arange(13 * self.m) % 2, .005, -.005)
        states, rows = [], []
        for seed in (start, second):
            state, row = self.fixed(seed, lam, diagnostic_signed)
            states.append(state)
            rows.append(row)
        difference = float(np.max(np.abs(states[0] - states[1]) / self.scales))
        separation = float(np.max(np.abs(start - second) / self.scales))
        reproduced = bool(separation >= 2e-3 and difference <= 1e-3
                          and all(row["tightDiagnosticClosure"] for row in rows))
        report = {"lambda": float(lam), "attempts": rows,
                  "initialScaledSeparation": separation,
                  "maximumScaledStateDifferenceAcrossStarts": difference,
                  "independentlyConfirmed": reproduced,
                  "signedDiagnosticOnly": diagnostic_signed,
                  "accepted": bool(reproduced and not diagnostic_signed
                                   and all(row["accepted"] for row in rows))}
        self.trace.append(report)
        return states[0], report

    def active_boundary(self, seed, seed_lambda):
        np = self.np
        index = self.active
        lambda_scale = max(seed_lambda, 1e-5)
        mask = None
        if self.sparsity is not None:
            structure = self.sparsity.toarray() if hasattr(self.sparsity, "toarray") else self.sparsity
            mask = np.column_stack((np.delete(structure, index, axis=1), np.ones(len(seed))))
        def reconstruct(q):
            return np.insert(q[:-1], index, 0.0) * self.scales, float(q[-1] * lambda_scale)
        def fun(q):
            state, lam = reconstruct(q)
            return self.residual(state, lam)
        def domain(q):
            state, lam = reconstruct(q)
            flows = state[:self.flow_count]
            return bool(-lambda_scale < lam <= 1
                        and np.all(flows > -1e-2 * self.scales[:self.flow_count])
                        and np.all(flows.reshape(2, self.m, 7).sum(axis=2) > 0)
                        and np.all(state < self.upper)
                        and np.all(state[self.flow_count:] > self.lower[self.flow_count:]))
        q0 = np.r_[np.delete(seed / self.scales, index), seed_lambda / lambda_scale]
        q1 = q0.copy()
        q1[:-1] += np.where(np.arange(len(q1)-1) % 2, .002, -.002) * np.maximum(np.abs(q1[:-1]), 1e-10)
        q1[-1] *= .995
        solutions, rows, lambda_errors = [], [], []
        for start, step in ((q0, 2e-6), (q1, 1e-6)):
            q, solve = self.correct(fun, start, domain, step, mask=mask)
            state, lam = reconstruct(q)
            ev, gates = self.metrics(state, lam)
            jac = self.jacobian(fun, q, step, mask)
            correction = np.linalg.solve(jac, -fun(q))
            inv_row = np.linalg.solve(jac.T, np.eye(len(q))[-1])
            roundoff = float(32*np.finfo(float).eps*max(1.0,float(np.max(np.abs(q))))
                             * np.sum(np.abs(inv_row)) * lambda_scale)
            lambda_errors.append(abs(float(correction[-1] * lambda_scale)) + roundoff)
            solutions.append((state, lam))
            rows.append({"lambda": lam, **solve, **gates,
                         "acceptedAsOperatingState": False,
                         "minimumOtherFlowMolS": float(np.min(np.delete(state[:self.flow_count], index))),
                         "residualCorrectionLambda": float(correction[-1] * lambda_scale),
                         "lambdaRoundoffEstimate": roundoff})
        state, lam = solutions[0]
        uncertainty, derivative = self.uncertainty(state, lam)
        lambda_error = 10 * (max(lambda_errors) + abs(solutions[0][1] - solutions[1][1]))
        checks = uncertainty["finiteDifferenceChecks"]
        near_origin = bool(abs(lam) <= lambda_error)
        reproduced_root = bool(all(row["tightDiagnosticClosure"] for row in rows)
                        and abs(solutions[0][1] - solutions[1][1]) <= lambda_error
                        and all(row["dFlowDlambda"] < 0 for row in checks))
        resolved = bool(reproduced_root and
                        all(row["minimumOtherFlowMolS"] > uncertainty["flowAbsoluteEstimateMolS"]
                            for row in rows))
        component_names = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
        nonpositive = []
        for position in np.flatnonzero(state[:self.flow_count] <= 0):
            phase, remainder = divmod(int(position), 7*self.m)
            cell, component = divmod(remainder, 7)
            nonpositive.append({"phase": "continuous" if phase == 0 else "dispersed",
                                "numericalCell": cell+1, "component": component_names[component],
                                "flowMolS": float(state[position]),
                                "dFlowDlambda": float(derivative[position])})
        return state, lam, {
            "lambda": lam, "activeFlowMolS": 0.0,
            "activeConstraintResolved": resolved,
            "includesLambdaZeroWithinEstimatedUncertainty": near_origin,
            "signedNearOriginRootReproduced": bool(reproduced_root and near_origin),
            "nonpositiveFlowCoordinates": nonpositive,
            "uniquePhysicalLimiterResolved": resolved,
            "acceptedAsOperatingState": False,
            "qualification": "LOCAL_ZERO_ACTIVE_BOUNDARY_NOT_GLOBAL_INFEASIBILITY",
            "attempts": rows,
            "cell1NmpBalance": self.balance(self.metrics(state, lam)[0], uncertainty),
            "numericalUncertainty": {
                "method": "TWO_START_TWO_FD_REDUCED_ROOT_CORRECTION_PLUS_ROUNDOFF_X10",
                "certifiedInterval": False, "lambdaAbsoluteEstimate": lambda_error,
                "flowAbsoluteEstimateMolS": uncertainty["flowAbsoluteEstimateMolS"],
                "dFlowDlambda": float(derivative[index]),
                "lambdaRootSpread": abs(solutions[0][1]-solutions[1][1]),
            },
        }, derivative

    def gate_bracket(self, start, lower_lam, upper_lam):
        """Bracket numerical gate usability, never mistake it for inventory."""
        np = self.np
        fixed_jac = self.jacobian(lambda y: self.residual(y*self.scales, lower_lam),
                                  start/self.scales)
        lower = self.lower/self.scales
        lower[:self.flow_count] = 0.0
        upper = self.upper/self.scales
        rows = []
        def probe(lam, seed):
            starts = [seed.copy(), seed.copy()]
            starts[1][:self.flow_count] *= np.where(np.arange(self.flow_count)%2, 1.005, .995)
            starts[1][self.flow_count:] += np.where(np.arange(13*self.m)%2, .005, -.005)
            solutions, attempts = [], []
            for initial in starts:
                fit = self.scipy.optimize.least_squares(
                    lambda y: self.residual(y*self.scales, lam), initial/self.scales,
                    jac=lambda y: fixed_jac, bounds=(lower, upper),
                    method="trf", tr_solver="exact", x_scale="jac", max_nfev=12,
                    xtol=1e-13, ftol=1e-13, gtol=1e-13)
                state = fit.x*self.scales
                ev, gates = self.metrics(state, lam)
                solutions.append(state)
                attempts.append({**gates, "functionEvaluations": int(fit.nfev),
                                 "optimizerStatus": int(fit.status),
                                 "evaluationLimitReached": bool(fit.status == 0),
                                 "cell1NmpBalance": self.balance(ev)})
            separation = float(np.max(np.abs(starts[0]-starts[1])/self.scales))
            agreement = float(np.max(np.abs(solutions[0]-solutions[1])/self.scales))
            accepted = bool(all(row["accepted"] for row in attempts)
                            and separation >= 2e-3 and agreement <= 1e-3)
            row = {"lambda": float(lam), "accepted": accepted,
                   "originalGateAcceptedStartCount": sum(int(a["accepted"]) for a in attempts),
                   "initialScaledSeparation": separation,
                   "maximumScaledStateDifferenceAcrossStarts": agreement, "attempts": attempts}
            rows.append(row)
            return solutions[0], row
        state = start.copy()
        _, low_check = probe(lower_lam, state)
        rejected, high_check = probe(upper_lam, state)
        for _ in range(12):
            if not high_check["accepted"] or upper_lam >= 1:
                break
            state, lower_lam = rejected, upper_lam
            upper_lam = min(1.0, upper_lam*1.25)
            rejected, high_check = probe(upper_lam, state)
        for _ in range(20):
            if high_check["accepted"] or upper_lam-lower_lam <= 1e-9:
                break
            middle = (lower_lam+upper_lam)/2
            candidate, check = probe(middle, state)
            if check["accepted"]:
                state, lower_lam = candidate, middle
                low_check = check
            else:
                rejected, upper_lam, high_check = candidate, middle, check
        low_u, _ = self.uncertainty(state, lower_lam)
        high_u, _ = self.uncertainty(rejected, upper_lam)
        return {"lower": float(lower_lam), "upper": float(upper_lam),
                "width": float(upper_lam-lower_lam),
                "resolved": bool(low_check["accepted"]
                    and high_check["originalGateAcceptedStartCount"] == 0
                    and not any(row["evaluationLimitReached"] for row in high_check["attempts"])
                    and upper_lam-lower_lam <= 1e-9),
                "lowerEndpointConfirmedByBracketSolver": low_check["accepted"],
                "upperOriginalGateAcceptedStartCount": high_check["originalGateAcceptedStartCount"],
                "upperEvaluationLimitReached": any(row["evaluationLimitReached"]
                                                   for row in high_check["attempts"]),
                "qualification": "TWO_START_CONFIRMATION_INTERVAL_NOT_PHYSICAL_BOUNDARY",
                "solver": "BOUNDED_DENSE_FIXED_JACOBIAN_ORIGINAL_RESIDUALS",
                "attempts": rows,
                "lastAcceptedCell1NmpBalance": self.balance(self.metrics(state, lower_lam)[0], low_u),
                "firstRejectedCell1NmpBalance": self.balance(self.metrics(rejected, upper_lam)[0], high_u)}

    def run(self, start, lam, previous=None):
        np = self.np
        start_ev, gates = self.metrics(start, lam)
        pending_uncertainty = {
            "method": "RESIDUAL_CORRECTION_NOT_YET_COMPUTED",
            "flowAbsoluteEstimateMolS": None, "signResolved": False,
            "positiveMarginResolved": False, "certifiedInterval": False,
        }
        initial_balance = self.balance(start_ev, pending_uncertainty)
        report = {
            "version": VERSION, "startingLambda": float(lam),
            "previousGateAcceptedLambda": float(lam),
            "startingGateMetrics": gates,
            "startingState": [float(v) for v in start],
            "startingCell1NmpBalance": initial_balance,
            "cell1NmpBalance": initial_balance,
            "unchangedAcceptanceTolerance": 1e-7,
            "diagnosticClosureTarget": self.tight,
            "lastAcceptedLambda": float(lam), "firstRejectedLambda": None,
            "lastAcceptedQualification": "EXISTING_GATES_ONLY_POSITIVE_MARGIN_UNRESOLVED",
            "terminalBracket": {"lower": float(lam), "upper": None,
                                "width": None, "resolved": False},
            "limiting": {"phase": "dispersed", "component": "NMP", "numericalCell": 1},
            "physicalInfeasibilityClaimed": False,
            "fullCouplingAccepted": False, "attempts": self.trace,
        }
        self.latest_report = report
        uncertainty, _ = self.uncertainty(start, lam)
        report["startingCell1NmpBalance"] = self.balance(start_ev, uncertainty)
        report["cell1NmpBalance"] = report["startingCell1NmpBalance"]
        self.progress("resolving cell-1 NMP balance")
        state, confirmation = self.two_start_fixed(start, lam)
        # Try forward even when tight polishing of the old tolerance-level point fails.
        target = min(1.0, lam + max(1e-8, lam * .1))
        forward, forward_report = self.two_start_fixed(state, target)
        if not forward_report["accepted"]:
            report["firstRejectedLambda"] = target
        if confirmation["accepted"]:
            u, _ = self.uncertainty(state, lam)
            if u["positiveMarginResolved"]:
                report["lastAcceptedLambda"] = float(lam)
        if forward_report["accepted"]:
            state, lam = forward, target
        if not forward_report["accepted"]:
            # Signed extension is local diagnosis only, never fed into an accepted run.
            signed, signed_report = self.two_start_fixed(start, float(report["startingLambda"]), True)
            report["signedStartingRootDiagnostic"] = signed_report
            boundary, boundary_lam, physical, tangent = self.active_boundary(
                start, float(report["startingLambda"]))
            report["physicalBoundary"] = physical
            if physical["signedNearOriginRootReproduced"]:
                report["status"] = "LOCAL_SIGNED_MULTI_INVENTORY_ROOT_NEAR_ZERO_COUPLING"
                report["cell1NmpBalance"] = physical["cell1NmpBalance"]
                report["limiting"]["qualification"] = "CELL1_NMP_DIAGNOSTIC_NOT_UNIQUE_PHYSICAL_LIMITER"
                report["positiveIntervalExistenceClaimed"] = False
                # Retain the tolerance-accepted lambda separately from this
                # zero-active diagnostic: neither is a finite inventory margin.
                report["lastAcceptedLambda"] = report["previousGateAcceptedLambda"]
                bracket = self.gate_bracket(start, report["previousGateAcceptedLambda"], target)
                report["terminalBracket"] = bracket
                report["lastAcceptedLambda"] = bracket["lower"]
                report["firstRejectedLambda"] = bracket["upper"]
                report["firstRejectedLambdaMeaning"] = "FAILED_INDEPENDENT_CONFIRMATION_NOT_PROVEN_ORIGINAL_GATE_REJECTION"
                report["lastAcceptedCell1NmpBalance"] = bracket["lastAcceptedCell1NmpBalance"]
                report["firstRejectedCell1NmpBalance"] = bracket["firstRejectedCell1NmpBalance"]
                return None, report
            if physical["activeConstraintResolved"]:
                margin = max(1e-10, 20 * physical["numericalUncertainty"]["lambdaAbsoluteEstimate"])
                lower_lam = max(boundary_lam - margin, boundary_lam * .5)
                upper_lam = boundary_lam + margin
                # Boundary state itself is not accepted; predictor has no clipping.
                lower_seed = boundary + (lower_lam-boundary_lam) * tangent
                lower_state, lower_row = self.two_start_fixed(lower_seed, lower_lam)
                upper_state, upper_row = self.two_start_fixed(
                    lower_state, upper_lam, True)
                low_u, _ = self.uncertainty(lower_state, lower_lam)
                upper_u, _ = self.uncertainty(upper_state, upper_lam)
                lower_ev, _ = self.metrics(lower_state, lower_lam)
                upper_ev, _ = self.metrics(upper_state, upper_lam)
                report["lastAcceptedCell1NmpBalance"] = self.balance(lower_ev, low_u)
                report["firstRejectedCell1NmpBalance"] = self.balance(upper_ev, upper_u)
                bracket_resolved = bool(lower_row["accepted"] and low_u["positiveMarginResolved"]
                    and upper_row["independentlyConfirmed"] and upper_state[self.active] < 0
                    and upper_u["signResolved"])
                report["terminalBracket"] = {"lower": lower_lam, "upper": upper_lam,
                    "width": upper_lam-lower_lam, "resolved": bracket_resolved,
                    "qualification": "LOCAL_SIGN_CROSSING_BRACKET_NOT_GLOBAL_NONEXISTENCE"}
                if bracket_resolved:
                    report.update(lastAcceptedLambda=lower_lam, firstRejectedLambda=upper_lam)
                    report["lastAcceptedQualification"] = "TIGHT_TWO_START_CLOSURE_WITH_RESOLVED_POSITIVE_MARGIN"
                    report["status"] = "LOCAL_ACTIVE_NMP_BOUNDARY_RESOLVED_BEFORE_FULL_COUPLING"
                    report["cell1NmpBalance"] = physical["cell1NmpBalance"]
                    return None, report
            report["status"] = "NUMERICAL_BOUNDARY_UNRESOLVED_WITH_QUANTIFIED_BALANCES"
            report["cell1NmpBalance"] = physical["cell1NmpBalance"]
            return None, report

        # A tightly closed positive forward state exists: follow it to full coupling.
        step = max(lam * .25, 1e-8)
        for _ in range(180):
            self.check_budget()
            report["lastAcceptedLambda"] = float(lam)
            report["cell1NmpBalance"] = self.balance(self.metrics(state, lam)[0],
                                                   self.uncertainty(state, lam)[0])
            if lam == 1.0:
                report.update(status="INDEPENDENTLY_CONFIRMED_FULL_COUPLING",
                              fullCouplingAccepted=True, firstRejectedLambda=None)
                return state, report
            target = min(1.0, lam + step)
            self.progress(f"resolved branch continuation lambda {target:.10g}")
            candidate, check = self.two_start_fixed(state, target)
            if check["accepted"]:
                state, lam = candidate, target
                step *= 1.5
                continue
            report["firstRejectedLambda"] = target
            if self.arclength and step > 1e-10:
                arc_state, arc_report = self.arclength(state, lam, target, state)
                report["lastPseudoArclengthAttempt"] = arc_report
                if arc_state is not None:
                    candidate, check = self.two_start_fixed(arc_state, arc_report["acceptedLambda"])
                    if check["accepted"]:
                        state, lam = candidate, arc_report["acceptedLambda"]
                        continue
            step *= .5
            if step < max(1e-10, abs(lam)*1e-8):
                # Re-enter boundary resolution from the last actual positive state.
                return self.run(state, lam, previous)
        report["status"] = "CONTINUATION_LIMIT_WITH_QUANTIFIED_BALANCE"
        report["terminalBracket"] = {"lower": lam, "upper": target, "width": target-lam,
                                    "resolved": False}
        return None, report


def fun_lambda(driver, y, lam):
    return driver.residual(y * driver.scales, lam)