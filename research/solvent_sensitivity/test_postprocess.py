import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from research.solvent_sensitivity import postprocess as p


def mono_search():
    row = {
        "minimum": 0.0, "replayMinimum": 0.0,
        "composition": [0.05, 0.6, 0.05, 0.05, 0.05, 0.15, 0.05],
        "optimizerSuccess": True, "replayOptimizerSuccess": True,
        "replayMaximumCompositionDifference": 0.0,
    }
    return {
        "seedCount": 3, "historicalFalseBasinSeedIncluded": True,
        "allRequiredSearchesAccepted": True,
        "searches": [copy.deepcopy(row) for _ in range(3)],
    }


def completed_worker_trial_fixture():
    stages = []
    r = [1.0, 0.1, 0.1, 0.1, 0.05, 0.01, 0.01]
    e = [0.1, 0.1, 0.1, 0.1, 0.05, 1.0, 0.1]
    for ordinal in range(1, 11):
        search = {
            "minimum": 0.0, "allRefinementsAccepted": True,
            "gridDenominator": 4, "gridPointCount": 210,
            "refinementSeedCount": 2,
            "refinements": [
                {"success": True, "value": 0.0, "gradientInfinityNorm": 0.0},
                {"success": True, "value": 0.0, "gradientInfinityNorm": 0.0},
            ],
            "explicitMonoRichBasinSearch": mono_search(),
        }
        stages.append({
            "stageFromFeedEnd": ordinal,
            "maximumComponentBalanceResidualMol": 1e-9,
            "isoactivityLogResidual": 1e-6,
            "maximumCompositionSeparation": 1e-3,
            "stageGibbsReduction": 1e-8,
            "localPostSplitStability": {
                phase: {"minimumEigenvalue": 0.0, "stepSizeConverged": True}
                for phase in ("raffinate", "extract")
            },
            "postSplitTpdSearch": {
                "raffinate": copy.deepcopy(search), "extract": copy.deepcopy(search)
            },
            "raffinateLeaving": {"componentMoles": r},
            "extractLeaving": {"componentMoles": e},
        })
    return {
        "maximumScaledEquationResidual": 1e-9,
        "secondaryMaximumScaledEquationResidual": 1e-9,
        "maximumOverallComponentBalanceResidualMol": 1e-9,
        "overallComponentBalanceResidualMol": [1e-9] + [0.0] * 6,
        "branchProductRelativeDifference": 1e-7,
        "branchReproduced": True, "numericalAcceptancePassed": True,
        "physicalLleClassification": "PHYSICAL_LLE", "accepted": True,
        "stages": stages,
    }


class PostprocessTests(unittest.TestCase):
    def test_archived_baseline_and_sulfur_bases(self):
        _, trial = p.parent_basis()
        case = p.baseline_case(trial)
        self.assertAlmostEqual(
            case["metrics"]["totalAromaticsWtPctHydrocarbonBasis"],
            7.503622077459239, places=11)
        self.assertAlmostEqual(
            case["metrics"]["hydrocarbonRecoveryPct"],
            88.70607405041983, places=11)
        self.assertAlmostEqual(
            case["sulfur"]["feedBasisProxyPpmPerOriginalHydrocarbonFeedMass"],
            1163.2028153208428, places=9)
        self.assertAlmostEqual(
            case["sulfur"]["hydrocarbonProductConditionalPpm"],
            1311.3001, places=4)
        self.assertNotEqual(
            case["sulfur"]["hydrocarbonProductConditionalPpm"],
            case["sulfur"]["fullWetRaffinateConditionalPpm"])
        self.assertEqual(case["sulfur"]["targetDecision"],
                         "NOT_EVALUATED_BOTH_CONDITIONAL_BASES_REPORTED")

    def test_invalid_record_fails_closed(self):
        _, trial = p.parent_basis()
        invalid = copy.deepcopy(trial)
        invalid["sulfurPrediction"]["componentMassBasis"]["finalRaffinate"]["PA"] = -1
        with self.assertRaises(p.EvidenceError):
            p.baseline_case(invalid)

    def test_pending_records_contain_no_metrics(self):
        parent, _ = p.parent_basis()
        pending = p.managed_case("so-0.75", 0.75, parent)
        if pending.get("state") == "PENDING":
            self.assertNotIn("metrics", pending)
            self.assertNotIn("sulfur", pending)

    def test_gate_boundaries_are_protocol_bounded(self):
        trial = completed_worker_trial_fixture()
        self.assertTrue(p.stage_gates(trial)["numericalPhaseQualification"])
        trial["stages"][0]["localPostSplitStability"]["raffinate"][
            "minimumEigenvalue"] = -5e-7
        self.assertTrue(p.stage_gates(trial)["localCurvature"])
        trial["stages"][0]["maximumComponentBalanceResidualMol"] = 1e6
        self.assertFalse(p.stage_gates(trial)["rawResidualClosure"])
        trial = completed_worker_trial_fixture()
        trial["stages"][0]["maximumCompositionSeparation"] = 1e-12
        self.assertFalse(p.stage_gates(trial)["phaseSeparation"])
        trial = completed_worker_trial_fixture()
        trial["maximumScaledEquationResidual"] = 2e-8
        trial["branchProductRelativeDifference"] = None
        trial["branchReproduced"] = False
        gates = p.stage_gates(trial)
        self.assertFalse(gates["endpointRawResidualNorms"])
        self.assertEqual(gates["branchProductDifference"],
                         "NOT_EVALUATED_ENDPOINT_CLOSURE_FAILED")

    def test_corrected_pa_inclusive_check_can_fail_legacy_acceptance(self):
        feed = {name: value for name, value in
                zip(p.COMPONENTS, [85, 7, 4, 2, 2, 0, 0])}
        # Legacy MONO+DI+POLY is 4.9%, but adding PA makes the governing value 5.1%.
        raff = {name: value for name, value in
                zip(p.COMPONENTS, [94.9, 2.0, 1.9, 1.0, 0.2, 1.0, 0.1])}
        metrics = p.calculate_metrics(feed, raff)
        legacy_worker_accepted = True
        self.assertTrue(legacy_worker_accepted)
        self.assertLess(100 * (raff["MONO"] + raff["DI"] + raff["POLY"])
                        / sum(raff[x] for x in p.HC), 5)
        self.assertEqual(p.checks(metrics)[
            "totalAromaticsWtPctHydrocarbonBasis"]["status"], "FAIL")
        gates = p.stage_gates(completed_worker_trial_fixture())
        qualification = p.nonpromoting_qualification(gates, p.checks(metrics))
        self.assertTrue(qualification["frozenWorkerAcceptanceRaw"])
        self.assertTrue(qualification["numericalPhaseQualification"])
        self.assertFalse(qualification["accepted"])
        self.assertEqual(qualification["overallSulfurAcceptance"],
                         "UNRESOLVED_UNSPECIFIED_PRODUCT_MASS_BASIS")

    def test_unspecified_sulfur_never_becomes_species_pass(self):
        feed = {name: value for name, value in
                zip(p.COMPONENTS, [85, 7, 4, 2, 2, 0, 0])}
        raff = {name: value for name, value in
                zip(p.COMPONENTS, [84, 6, 3, 1, 1, 1, 0.1])}
        sulfur = p.sulfur_metrics(feed, raff)
        self.assertFalse(sulfur["speciesResolvedSulfurQualification"])
        self.assertEqual(sulfur["targetDecision"],
                         "NOT_EVALUATED_BOTH_CONDITIONAL_BASES_REPORTED")

    def test_hash_tampering_request_raw_and_checkpoint_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            request = root / "request.json"
            request.write_text('{"fixed":true}\n')
            digest = p.sha(request)
            request.write_text('{"fixed":false}\n')
            with self.assertRaises(p.EvidenceError):
                p.require_sha(request, digest, "REQUEST_TAMPER")

            raw = root / "raw-output.json"
            raw.write_text("{}")
            status = {"stdoutSha256": p.sha(raw)}
            raw.write_text('{"tampered":true}')
            with self.assertRaises(p.EvidenceError):
                p.verify_runner_hash(raw, status, "stdoutSha256", "RAW_TAMPER")

            run = root / "run"
            checkpoint_dir = run / "checkpoints"
            checkpoint_dir.mkdir(parents=True)
            trial_text = p.canonical({"stageCount": 10})
            payload = {
                "protocol": "ACK_V3_ENGINE_CONTRACT",
                "engineContractVersion": "7C-1.5.0",
                "componentOrder": list(p.COMPONENTS),
                "continuationState": {},
                "continuationStageCount": 0,
                "trialCanonical": trial_text,
                "trialHash": hashlib.sha256(trial_text.encode()).hexdigest(),
            }
            payload_text = p.canonical(payload)
            payload_hash = hashlib.sha256(payload_text.encode()).hexdigest()
            checkpoint = checkpoint_dir / f"stage-10-{payload_hash}.json"
            checkpoint.write_text(payload_text + " ")
            with self.assertRaises(p.EvidenceError):
                p.checkpoint_provenance(run)

    def test_timeout_does_not_hide_legitimate_other_case(self):
        timeout = {
            "caseId": "so-0.75", "solventOilMassRatio": 0.75,
            "state": "TERMINAL_PARTIAL_TIMEOUT", "blockedReason": "deadline",
        }
        legitimate_metrics = {
            "totalAromaticsWtPctHydrocarbonBasis": 1.0,
            "polarAromaticsWtPctHydrocarbonBasis": 0.1,
            "hydrocarbonRecoveryPct": 90.0,
            "saturatesWtPctHydrocarbonBasis": 99.0,
            "nmpWtPctFullWetRaffinateBasis": 1.0,
        }
        legitimate = {
            "caseId": "so-1.0", "solventOilMassRatio": 1.0,
            "state": "COMPLETED", "metrics": legitimate_metrics,
            "targetChecks": p.checks(legitimate_metrics),
        }
        dispositions = [
            {"verifiedTerminal": True, "state": "TERMINAL_PARTIAL_TIMEOUT"},
            {"verifiedTerminal": True, "state": "COMPLETED"},
        ]
        with mock.patch.object(p, "execution_disposition",
                               side_effect=dispositions), mock.patch.object(
                                   p, "managed_case", side_effect=[timeout, legitimate]):
            data = p.build_comparison(allow_pending=False)
        self.assertEqual(data["cases"][1]["state"], "TERMINAL_PARTIAL_TIMEOUT")
        self.assertEqual(data["cases"][2]["metrics"], legitimate_metrics)
        rendered = p.report_html(data)
        self.assertIn("Timed out; no completed trial or outlet prediction.",
                      rendered)
        self.assertNotIn("so-0.75</th><td colspan='4'>Pending", rendered)

    def test_malformed_completed_case_isolated(self):
        completed_error = p.EvidenceError("COMPLETED_HASH_BAD")
        legitimate = {
            "caseId": "so-1.0", "solventOilMassRatio": 1.0,
            "state": "COMPLETED", "metrics": {"preserved": True},
        }
        dispositions = [
            {"verifiedTerminal": True, "state": "COMPLETED"},
            {"verifiedTerminal": True, "state": "COMPLETED"},
        ]
        with mock.patch.object(p, "execution_disposition",
                               side_effect=dispositions), mock.patch.object(
                                   p, "managed_case",
                                   side_effect=[completed_error, legitimate]):
            data = p.build_comparison(allow_pending=False)
        self.assertEqual(data["cases"][1]["state"], "INVALID_EVIDENCE")
        self.assertNotIn("metrics", data["cases"][1])
        self.assertTrue(data["cases"][2]["metrics"]["preserved"])

    def test_invalid_evidence_does_not_bypass_nonterminal_finalization(self):
        invalid = p.EvidenceError("REQUEST_HASH_BAD")
        invalid_case = {
            "caseId": "so-0.75", "state": "INVALID_EVIDENCE",
            "executionDisposition": {"verifiedTerminal": False, "state": "RUNNING"},
        }
        running_case = {
            "caseId": "so-1.0", "state": "PENDING",
            "executionDisposition": {"verifiedTerminal": False, "state": "RUNNING"},
        }
        dispositions = [
            invalid_case["executionDisposition"],
            running_case["executionDisposition"],
        ]
        with mock.patch.object(p, "execution_disposition",
                               side_effect=dispositions), mock.patch.object(
                                   p, "managed_case", side_effect=[invalid, running_case]):
            with self.assertRaisesRegex(
                    p.EvidenceError, "BOTH_MANAGED_CASES_MUST_BE_TERMINAL"):
                p.build_comparison(allow_pending=False)

    def test_invalid_completed_plus_running_still_blocks_finalization(self):
        invalid = p.EvidenceError("COMPLETED_OUTPUT_BAD")
        running_case = {
            "caseId": "so-1.0", "state": "PENDING",
            "executionDisposition": {"verifiedTerminal": False, "state": "RUNNING"},
        }
        dispositions = [
            {"verifiedTerminal": True, "state": "COMPLETED"},
            running_case["executionDisposition"],
        ]
        with mock.patch.object(p, "execution_disposition",
                               side_effect=dispositions), mock.patch.object(
                                   p, "managed_case", side_effect=[invalid, running_case]):
            with self.assertRaisesRegex(
                    p.EvidenceError, "BOTH_MANAGED_CASES_MUST_BE_TERMINAL"):
                p.build_comparison(allow_pending=False)

    def test_managed_case_end_to_end_actual_worker_result_shape(self):
        parent, _ = p.parent_basis()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in ("so-0.75-request.json", "so-0.75-input.json",
                         "run-case.mjs"):
                source = p.RUN_ROOT / name
                (root / name).write_bytes(source.read_bytes())
            files = {}
            for name in ("so-0.75-request.json", "so-0.75-input.json",
                         "run-case.mjs"):
                path = root / name
                files[name] = {"sha256": p.sha(path), "bytes": path.stat().st_size}
            manifest = {
                "schemaVersion": "OFFLINE_SOLVENT_SENSITIVITY_MANAGED_LAUNCH_V2",
                "engineHash": p.ENGINE_HASH, "modelHash": p.MODEL_HASH,
                "noResume": True, "files": files,
            }
            manifest_path = root / "managed-v2-manifest.json"
            manifest_path.write_text(json.dumps(manifest))

            feed_mass = [85.0, 7.0, 4.0, 2.0, 2.0, 0.0, 0.0]
            raff_mass = [80.0, 2.0, 1.0, 0.5, 0.2, 1.0, 0.1]

            def stream(masses):
                moles = [masses[i] / p.MW[i] for i in range(7)]
                return {"componentMass": masses, "componentMoles": moles}

            feed = {name: feed_mass[i] for i, name in enumerate(p.COMPONENTS)}
            raff = {name: raff_mass[i] for i, name in enumerate(p.COMPONENTS)}
            metrics = p.calculate_metrics(feed, raff)
            trial = completed_worker_trial_fixture()
            trial.update({
                "stageCount": 10, "equationVariableCount": 140,
                "equationResidualCount": 140,
                "boundaryStreams": {
                    "oilFeed": stream(feed_mass),
                    "finalRaffinate": stream(raff_mass),
                },
                "productMetrics": {
                    "nmpFreeHydrocarbonRecoveryPct":
                        metrics["hydrocarbonRecoveryPct"],
                    "raffinateSaturatesWtNmpFree":
                        metrics["saturatesWtPctHydrocarbonBasis"],
                    "raffinateTotalAromaticsWtNmpFree":
                        metrics["totalAromaticsWtPctHydrocarbonBasis"]
                        - metrics["polarAromaticsWtPctHydrocarbonBasis"],
                    "raffinatePolarAromaticsWtNmpFree":
                        metrics["polarAromaticsWtPctHydrocarbonBasis"],
                    "nmpInTotalRaffinateWt":
                        metrics["nmpWtPctFullWetRaffinateBasis"],
                    "h2oInTotalRaffinateWt":
                        metrics["waterWtPctFullWetRaffinateBasis"],
                },
                "releaseEligible": False,
            })
            sulfur = p.sulfur_metrics(feed, raff)
            trial["sulfurPrediction"] = {
                "allocationFractions": p.ALLOCATIONS,
                "feedSulfurPpm": 3500,
                "targetRaffinateSulfurPpm": 1000,
                "componentMassBasis": {
                    "oilFeed": {name: feed[name] for name in p.HC},
                    "finalRaffinate": {name: raff[name] for name in p.HC},
                },
                "predictedRaffinateSulfurPpm":
                    sulfur["feedBasisProxyPpmPerOriginalHydrocarbonFeedMass"],
            }
            result = {
                "schemaVersion": "ECR_PRE_PILOT_PREDICTIVE_NT_RESULT_V1",
                "engineContractVersion": "7C-1.5.0",
                "engine": {
                    "engineHash": p.ENGINE_HASH,
                    "engineContractVersion": "7C-1.5.0",
                },
                "ntTested": 10, "componentOrder": list(p.COMPONENTS),
                "wetSolventConstruction": {"solventOilMassRatio": 0.75},
                "thermodynamicCondition": {
                    "temperatureC": 25, "temperatureK": 298.15,
                },
                "releaseEligible": False, "trials": [trial],
            }
            run = root / "so-0.75-run"
            checkpoint_dir = run / "checkpoints"
            checkpoint_dir.mkdir(parents=True)
            raw = run / "raw-output.json"
            raw.write_text(json.dumps(result))
            stderr = run / "stderr.log"
            stderr.write_text("")
            trial_text = p.canonical(trial)
            payload = {
                "protocol": "ACK_V3_ENGINE_CONTRACT",
                "engineContractVersion": "7C-1.5.0",
                "componentOrder": list(p.COMPONENTS),
                "continuationState": {},
                "continuationStageCount": 0,
                "trialCanonical": trial_text,
                "trialHash": hashlib.sha256(trial_text.encode()).hexdigest(),
            }
            payload_text = p.canonical(payload)
            payload_hash = hashlib.sha256(payload_text.encode()).hexdigest()
            (checkpoint_dir / f"stage-10-{payload_hash}.json").write_text(payload_text)
            strict = {
                key: True for key in (
                    "jsonParsed", "engineContractMatches", "engineHashMatches",
                    "ntTestedMatches", "wetSolventRatioMatches",
                    "componentOrderMatches", "exactlyOneCheckpoint",
                )
            }
            status = {
                "schemaVersion": "OFFLINE_SOLVENT_SENSITIVITY_MANAGED_STATUS_V1",
                "caseId": "so-0.75", "state": "COMPLETED",
                "deadlineSeconds": 2400, "checkpointCount": 1,
                "terminationReason": None, "stdoutSha256": p.sha(raw),
                "stderrSha256": p.sha(stderr), "strictOutputReport": strict,
            }
            (run / "status.json").write_text(json.dumps(status))
            with mock.patch.object(p, "RUN_ROOT", root), mock.patch.object(
                    p, "MANIFEST_SHA256", p.sha(manifest_path)):
                case = p.managed_case("so-0.75", 0.75, parent)
            self.assertTrue(case["frozenWorkerAcceptanceRaw"])
            self.assertTrue(case["numericalPhaseQualification"])
            self.assertFalse(case["accepted"])
            self.assertNotIn("worker", result["engine"])


if __name__ == "__main__":
    unittest.main()