#!/usr/bin/env python3
"""7C-1.2.0 direct extension of the frozen simultaneous 6C cascade.

The frozen 7C-1.1 engine is imported only to construct the pinned thermodynamic
model and to provide its exhaustive TPD implementation for explicit escalation.
Routine cascade work uses the denominator-four search and the unchanged 6C
simultaneous material-balance/isoactivity equation structure extended to H2O.
"""
from __future__ import annotations

import importlib.util
import itertools
import json
import math
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
FROZEN_7C = ROOT / "server/research/ecr-pre-pilot-seven-component-h2o-profile/run_qualification.py"
PROTOCOL_PATH = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/protocol.json"
FAMILIES = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
ENGINE_VERSION = "7C-1.2.0"
FLOOR = 1e-12


def load_frozen_7c():
    spec = importlib.util.spec_from_file_location("frozen_7c_1_1_reference", FROZEN_7C)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def protocol():
    return json.loads(PROTOCOL_PATH.read_text())


def normalize(np, value):
    value = np.maximum(np.asarray(value, dtype=float), FLOOR)
    return value / value.sum()


def lattice(np, denominator=4, dimensions=7):
    """Exact weak-composition lattice: C(denominator+n-1,n-1)=210."""
    for cuts in itertools.combinations(
        range(denominator + dimensions - 1), dimensions - 1
    ):
        marks = (-1,) + cuts + (denominator + dimensions - 1,)
        yield np.asarray(
            [marks[index + 1] - marks[index] - 1 for index in range(dimensions)],
            dtype=float,
        ) / denominator


class SevenComponentEngine:
    def __init__(self, np, scipy, model, exhaustive_tpd=None):
        self.np = np
        self.scipy = scipy
        self.model = model
        self.exhaustive_tpd = exhaustive_tpd
        self.gates = protocol()["numericalAcceptance"]
        self.metrics = {
            "routineTpdCalls": 0,
            "routineLatticeEvaluations": 0,
            "postSplitTpdCalls": 0,
            "exhaustiveEscalations": 0,
        }

    def lngamma(self, x, temperature_k):
        return self.model.wet_lngamma(
            self.np, temperature_k, normalize(self.np, x)
        )

    def mu(self, x, temperature_k):
        x = normalize(self.np, x)
        return self.np.log(x) + self.lngamma(x, temperature_k)

    def phase_g(self, x, temperature_k):
        x = normalize(self.np, x)
        return float(x @ self.mu(x, temperature_k))

    def routine_tpd(
        self, reference, temperature_k, *,
        include_local_seeds=True, refine_best_global_and_local=False,
        allow_escalation=True,
    ):
        """Frozen-6C-proportionate starts over the exact 210-point 7C lattice."""
        np = self.np
        scipy = self.scipy
        reference = normalize(np, reference)
        reference_mu = self.mu(reference, temperature_k)

        def objective(w):
            w = normalize(np, w)
            return float(w @ (self.mu(w, temperature_k) - reference_mu))

        def softmax(y):
            y = np.r_[y, 0.0]
            y -= np.max(y)
            exp = np.exp(y)
            return exp / exp.sum()

        grid = list(lattice(np))
        if len(grid) != 210:
            raise RuntimeError("SEVEN_COMPONENT_ROUTINE_LATTICE_INVALID")
        coarse = sorted(
            ((objective(w), normalize(np, w)) for w in grid),
            key=lambda row: (row[0], tuple(row[1].tolist())),
        )
        global_seeds = [
            ("GLOBAL_SIMPLEX", composition) for _, composition in coarse[:6]
        ] + [("REFERENCE_PHASE", reference)]
        local_seeds = []
        if include_local_seeds:
            logits = np.log(reference[:-1] / reference[-1])
            for direction in np.eye(6):
                local_seeds.extend((
                    ("PHASE_LOCAL_LOG_RATIO_PERTURBATION", softmax(logits + 1e-3 * direction)),
                    ("PHASE_LOCAL_LOG_RATIO_PERTURBATION", softmax(logits - 1e-3 * direction)),
                ))
        seeds = global_seeds + local_seeds
        evaluations = [{
            "seedClass": label,
            "value": objective(seed),
            "composition": seed.tolist(),
        } for label, seed in seeds]
        ordered = sorted(
            evaluations,
            key=lambda row: (row["value"], row["seedClass"], tuple(row["composition"])),
        )
        refinements = ordered
        if refine_best_global_and_local:
            refinements = [
                min(
                    (row for row in evaluations if row["seedClass"] == label),
                    key=lambda row: (row["value"], tuple(row["composition"])),
                )
                for label in (
                    "GLOBAL_SIMPLEX",
                    "PHASE_LOCAL_LOG_RATIO_PERTURBATION",
                )
            ]
        refined = []
        for row in refinements:
            seed = normalize(np, row["composition"])
            solution = scipy.optimize.minimize(
                lambda y: objective(softmax(y)),
                np.log(seed[:-1] / seed[-1]),
                method="BFGS",
                options={"gtol": 1e-8, "maxiter": 500},
            )
            composition = softmax(solution.x)
            gradient = float(np.max(np.abs(
                solution.jac if solution.jac is not None else np.asarray([math.inf])
            )))
            refined.append({
                "seedClass": row["seedClass"],
                "value": objective(composition),
                "composition": composition.tolist(),
                "success": bool(solution.success or gradient <= 5e-6),
                "gradientInfinityNorm": gradient,
            })
        best = min(
            evaluations + refined,
            key=lambda row: (row["value"], tuple(row["composition"])),
        )
        threshold = self.gates["negativeTpdThreshold"]
        refinement_failure = not all(row["success"] for row in refined)
        near_threshold = (
            best["value"] < threshold / 10.0
            and abs(best["value"] - threshold) <= 2e-7
        )
        class_minima = {
            label: min(
                (row["value"] for row in refined if row["seedClass"] == label),
                default=math.inf,
            )
            for label in (
                "GLOBAL_SIMPLEX",
                "PHASE_LOCAL_LOG_RATIO_PERTURBATION",
            )
        }
        disagreement = (
            all(math.isfinite(value) for value in class_minima.values())
            and (
                (class_minima["GLOBAL_SIMPLEX"] < threshold)
                != (class_minima["PHASE_LOCAL_LOG_RATIO_PERTURBATION"] < threshold)
            )
        )
        ambiguity = refinement_failure or near_threshold or disagreement
        escalation = None
        if ambiguity and allow_escalation and self.exhaustive_tpd is not None:
            self.metrics["exhaustiveEscalations"] += 1
            escalation = self.exhaustive_tpd(reference)
        self.metrics["routineTpdCalls"] += 1
        self.metrics["routineLatticeEvaluations"] += len(grid)
        minimum = (
            float(escalation["minimum"])
            if escalation is not None else float(best["value"])
        )
        classification = (
            "EXHAUSTIVE_ESCALATION_CONFIRMED_NEGATIVE"
            if escalation is not None and minimum < threshold
            else "EXHAUSTIVE_ESCALATION_STABLE"
            if escalation is not None
            else "ROUTINE_REFINEMENT_AMBIGUOUS"
            if ambiguity
            else "ROUTINE_NEGATIVE_TPD"
            if minimum < threshold
            else "ROUTINE_STABLE"
        )
        return {
            "minimum": minimum,
            "minimizingComposition": (
                escalation["minimizingComposition"]
                if escalation is not None else best["composition"]
            ),
            "gridDenominator": 4,
            "gridPointCount": 210,
            "coarseMinimum": float(coarse[0][0]),
            "seedCount": len(seeds),
            "refinementSeedCount": len(refinements),
            "allRefinementsAccepted": not refinement_failure,
            "ambiguityTriggered": ambiguity,
            "classification": classification,
            "escalationUsed": escalation is not None,
            "escalationEngineContract": "7C-1.1.0" if escalation is not None else None,
            "seedEvaluations": evaluations,
            "refinements": refined,
            "exhaustiveAudit": escalation,
        }

    def local_stability(self, composition, temperature_k):
        """Six-dimensional log-ratio Hessian with deterministic step check."""
        np = self.np
        z = normalize(np, composition)
        y0 = np.log(z[:-1] / z[-1])

        def softmax(y):
            y = np.r_[y, 0.0]
            y -= np.max(y)
            exp = np.exp(y)
            return exp / exp.sum()

        reference_mu = self.mu(z, temperature_k)

        def value(y):
            x = softmax(y)
            return float(x @ (self.mu(x, temperature_k) - reference_mu))

        spectra = []
        for step in (5e-4, 2.5e-4):
            hessian = np.zeros((6, 6))
            center = value(y0)
            for i in range(6):
                di = np.eye(6)[i] * step
                hessian[i, i] = (value(y0 + di) - 2 * center + value(y0 - di)) / step**2
                for j in range(i):
                    dj = np.eye(6)[j] * step
                    hessian[i, j] = hessian[j, i] = (
                        value(y0 + di + dj) - value(y0 + di - dj)
                        - value(y0 - di + dj) + value(y0 - di - dj)
                    ) / (4 * step**2)
            spectra.append(np.linalg.eigvalsh(hessian))
        allowed = self.gates["hessianEigenvalueAbsoluteTolerance"] + (
            self.gates["hessianEigenvalueRelativeTolerance"]
            * np.maximum(np.abs(spectra[0]), np.abs(spectra[1]))
        )
        return {
            "dimension": 6,
            "coordinate": "six independent log mole-fraction ratios ln(x_i/x_H2O)",
            "minimumEigenvalue": float(spectra[1][0]),
            "eigenvalues": spectra[1].tolist(),
            "stepSizeConverged": bool(np.all(np.abs(spectra[0] - spectra[1]) <= allowed)),
        }

    def flash(self, total, temperature_k):
        """Deterministic 7C split seed; exhaustive search is ambiguity-only."""
        np = self.np
        scipy = self.scipy
        z = normalize(np, total)
        tpd = self.routine_tpd(z, temperature_k)
        w = normalize(np, tpd["minimizingComposition"])
        eps = 1e-10

        def objective(ne):
            beta = float(ne.sum())
            nr = z - ne
            if beta <= eps or beta >= 1 - eps:
                return 1e4
            return (
                beta * self.phase_g(ne / beta, temperature_k)
                + (1 - beta) * self.phase_g(nr / (1 - beta), temperature_k)
            )

        starts = [
            np.clip(fraction * w, eps, z - eps)
            for fraction in (0.5, 0.25, 0.75)
        ] + [np.clip(0.5 * z, eps, z - eps)]
        solutions = [
            scipy.optimize.minimize(
                objective, start, method="L-BFGS-B",
                bounds=[(eps, float(value - eps)) for value in z],
                options={"ftol": 1e-14, "gtol": 1e-9, "maxiter": 1000, "maxls": 40},
            )
            for start in starts
        ]
        best = min(solutions, key=lambda solution: (solution.fun, tuple(solution.x)))
        beta = float(best.x.sum())
        r0 = normalize(np, (z - best.x) / (1 - beta))
        e0 = normalize(np, best.x / beta)

        def softmax(y):
            y = np.r_[y, 0.0]
            y -= np.max(y)
            exp = np.exp(y)
            return exp / exp.sum()

        def unpack(v):
            return softmax(v[:6]), softmax(v[6:12]), 1 / (1 + np.exp(-v[12]))

        def residual(v):
            r, e, b = unpack(v)
            return np.r_[
                self.mu(r, temperature_k) - self.mu(e, temperature_k),
                ((1 - b) * r + b * e - z)[:6],
            ]

        polish = scipy.optimize.least_squares(
            residual,
            np.r_[np.log(r0[:-1] / r0[-1]), np.log(e0[:-1] / e0[-1]),
                  math.log(beta / (1 - beta))],
            xtol=1e-13, ftol=1e-13, gtol=1e-13, max_nfev=5000,
        )
        r, e, beta = unpack(polish.x)
        if r[5] > e[5]:
            r, e, beta = e, r, 1 - beta
        return {
            "raffinate": r, "extract": e, "beta": beta,
            "tpd": tpd,
            "isoactivityLogResidual": float(np.max(np.abs(
                self.mu(r, temperature_k) - self.mu(e, temperature_k)
            ))),
            "materialBalanceResidual": float(np.max(np.abs(
                z - ((1 - beta) * r + beta * e)
            ))),
            "optimizerSuccess": bool(best.success and polish.success),
        }

    def solve_cascade(self, stage_count, temperature_k, feed, solvent, previous=None):
        """Solve the exact 14*N balance + isoactivity equation system twice."""
        np = self.np
        scipy = self.scipy
        feed = np.asarray(feed, dtype=float)
        solvent = np.asarray(solvent, dtype=float)
        total = float((feed + solvent).sum())
        seed = self.flash(feed + solvent, temperature_k)
        post_split_tpd_start = self.metrics["postSplitTpdCalls"]

        def unpack(vector):
            streams = np.exp(vector.reshape(stage_count, 14))
            return streams[:, :7], streams[:, 7:]

        def residual(vector):
            r, e = unpack(vector)
            equations = []
            for stage in range(stage_count):
                r_in = feed if stage == 0 else r[stage - 1]
                e_in = solvent if stage == stage_count - 1 else e[stage + 1]
                equations.extend((r_in + e_in - r[stage] - e[stage]) / total)
                equations.extend(
                    self.mu(r[stage], temperature_k)
                    - self.mu(e[stage], temperature_k)
                )
            return np.asarray(equations)

        if previous is None:
            r0 = total * (1 - seed["beta"]) * seed["raffinate"]
            e0 = total * seed["beta"] * seed["extract"]
            base = np.log(np.tile(np.r_[r0, e0], stage_count))
        else:
            old_r, old_e = previous
            mapped = []
            for stage in range(stage_count):
                coordinate = stage / max(stage_count - 1, 1) * max(len(old_r) - 1, 0)
                lower = int(math.floor(coordinate))
                upper = min(lower + 1, len(old_r) - 1)
                fraction = coordinate - lower
                mapped.extend((1 - fraction) * old_r[lower] + fraction * old_r[upper])
                mapped.extend((1 - fraction) * old_e[lower] + fraction * old_e[upper])
            base = np.log(np.maximum(mapped, FLOOR))
        starts = [
            base,
            base + np.tile(np.linspace(-0.015, 0.015, 14), stage_count),
        ]
        bounds = (math.log(FLOOR), math.log(10 * total))
        solutions = [
            scipy.optimize.least_squares(
                residual, start, bounds=bounds, xtol=1e-11, ftol=1e-11,
                gtol=1e-11, max_nfev=750,
            )
            for start in starts
        ]
        endpoints = [unpack(solution.x) for solution in solutions]
        residuals = [float(np.max(np.abs(solution.fun))) for solution in solutions]
        product_difference = max(
            float(np.max(np.abs(endpoints[0][0][-1] - endpoints[1][0][-1]))
                  / max(endpoints[0][0][-1].sum(), 1e-30)),
            float(np.max(np.abs(endpoints[0][1][0] - endpoints[1][1][0]))
                  / max(endpoints[0][1][0].sum(), 1e-30)),
        )
        r, e = endpoints[0]
        stages = []
        for stage in range(stage_count):
            r_in = feed if stage == 0 else r[stage - 1]
            e_in = solvent if stage == stage_count - 1 else e[stage + 1]
            x, y = normalize(np, r[stage]), normalize(np, e[stage])
            # Exactly two post-split searches per solved stage.
            self.metrics["postSplitTpdCalls"] += 1
            post_r = self.routine_tpd(
                x, temperature_k, refine_best_global_and_local=True
            )
            self.metrics["postSplitTpdCalls"] += 1
            post_e = self.routine_tpd(
                y, temperature_k, refine_best_global_and_local=True
            )
            balance = r_in + e_in - r[stage] - e[stage]
            mixed = normalize(np, r_in + e_in)
            split_g = (
                r[stage].sum() * self.phase_g(x, temperature_k)
                + e[stage].sum() * self.phase_g(y, temperature_k)
            ) / (r[stage].sum() + e[stage].sum())
            gibbs_reduction = self.phase_g(mixed, temperature_k) - split_g
            stability_r = self.local_stability(x, temperature_k)
            stability_e = self.local_stability(y, temperature_k)
            stages.append({
                "stageFromFeedEnd": stage + 1,
                "maximumComponentBalanceResidualMol": float(np.max(np.abs(balance))),
                "isoactivityLogResidual": float(np.max(np.abs(
                    self.mu(x, temperature_k) - self.mu(y, temperature_k)
                ))),
                "maximumCompositionSeparation": float(np.max(np.abs(x - y))),
                "stageGibbsReduction": gibbs_reduction,
                "localPostSplitStability": {
                    "raffinate": stability_r,
                    "extract": stability_e,
                },
                "postSplitTpdSearch": {"raffinate": post_r, "extract": post_e},
                "raffinateComponentMoles": r[stage].tolist(),
                "extractComponentMoles": e[stage].tolist(),
            })
        closed = all(value <= self.gates["maximumScaledEquationResidual"] for value in residuals)
        reproduced = product_difference <= self.gates["multistartProductRelativeTolerance"]
        stage_acceptance = [
            row["maximumComponentBalanceResidualMol"]
            <= self.gates["maximumOverallComponentBalanceResidualMol"]
            and row["isoactivityLogResidual"]
            <= self.gates["maximumIsoactivityLogResidual"]
            and row["maximumCompositionSeparation"]
            >= self.gates["minimumPhaseCompositionSeparation"]
            and row["stageGibbsReduction"]
            >= self.gates["minimumStageGibbsReduction"]
            and all(
                row["localPostSplitStability"][phase]["minimumEigenvalue"]
                >= self.gates["minimumLocalStabilityCurvature"]
                and row["localPostSplitStability"][phase]["stepSizeConverged"]
                for phase in ("raffinate", "extract")
            )
            and all(
                row["postSplitTpdSearch"][phase]["minimum"]
                >= self.gates["postSplitTpdThreshold"]
                and row["postSplitTpdSearch"][phase]["allRefinementsAccepted"]
                for phase in ("raffinate", "extract")
            )
            and normalize(np, row["extractComponentMoles"])[5]
            > normalize(np, row["raffinateComponentMoles"])[5]
            for row in stages
        ]
        return {
            "stageCount": stage_count,
            "equationVariableCount": 14 * stage_count,
            "equationResidualCount": 14 * stage_count,
            "primaryMaximumScaledEquationResidual": residuals[0],
            "secondaryMaximumScaledEquationResidual": residuals[1],
            "bothEndpointsClosed": closed,
            "branchProductRelativeDifference": product_difference if closed else None,
            "branchReproduced": bool(closed and reproduced),
            "postSplitTpdSearchCount": (
                self.metrics["postSplitTpdCalls"] - post_split_tpd_start
            ),
            "stages": stages,
            "raffinateComponentMoles": r.tolist(),
            "extractComponentMoles": e.tolist(),
            "accepted": bool(closed and reproduced and all(stage_acceptance)),
        }


def build_engine(temperature_k, water_wt_pct):
    frozen = load_frozen_7c()
    temporary, np, scipy, model, integrity, runtime = frozen.build_model()
    _, exhaustive_tpd, _ = frozen.engine(
        np, scipy, model, temperature_k, water_wt_pct
    )
    return temporary, SevenComponentEngine(
        np, scipy, model, exhaustive_tpd=exhaustive_tpd
    ), integrity, runtime