import copy
import importlib.util
import json
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "sizing_authority_v1", HERE / "sizing_authority_v1.py"
)
S = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(S)


class SizingAuthoritySyntheticFixturesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.basis = S.load_frozen_basis()

    def test_actual_basis_is_design269_and_only_in_range_is_selectable(self):
        self.assertEqual((self.basis["designId"], self.basis["projectNumber"]), (269, 236))
        self.assertTrue(all(x["rangeStatus"] == "CALCULATED_IN_RANGE"
                            for x in self.basis["selectableHydraulicCandidates"]))
        self.assertEqual(self.basis["theoreticalStageAuthority"]["value"], 7)
        self.assertTrue(self.basis["profileMetadataOnly"]["notPhysicalOrCalculatedStages"])
        audit = self.basis["recordedStage2DutyAuditOnly"]
        self.assertFalse(audit["accepted"])
        self.assertTrue(audit["configuredStagesAreNotPhysicalCompartments"])
        self.assertTrue(audit["sulfur"]["notIndependentSpeciesResolvedQualification"])
        self.assertAlmostEqual(
            audit["sourceComputedGoverningTotalAromaticsIncludingPaWtNmpFree"],
            7.50362207745924,
        )

    def test_mass_bases_and_unresolved_sulfur_fail_closed(self):
        result = S.evaluate_whole_column_outlet(
            self.basis, self.basis["currentFeed"]["dispersedMolS"]
        )
        self.assertAlmostEqual(result["values"]["nmpWtPctFullRaffinatePhaseBasis"], 0)
        self.assertAlmostEqual(result["values"]["hydrocarbonRecoveryPct"], 100)
        self.assertEqual(result["sulfur"]["status"], "NOT_CALCULABLE")
        self.assertFalse(result["allDutiesAccepted"])

    def synthetic_evidence(self, candidate, compartments):
        state = {
            "rpm": candidate["rpm"],
            "columnDiameterM": candidate["columnDiameterM"],
            "compartmentPitchM": candidate["compartmentPitchM"],
        }
        local = {
            "status": "QUALIFIED",
            "runId": "SYNTHETIC_TEST_RUN",
            "transportBasis": "CALCULATED_EFFECTIVE_RESISTANCE_ASSUMED_TRANSPORT",
            "candidateStateHash": S.sha256_value(state),
            "candidateSourceHash": candidate["candidateSourceHash"],
            "sourceBasisHash": self.basis["basisHash"],
            "fixtureClassification": "SYNTHETIC_TEST_ONLY_NOT_A_REAL_DESIGN",
        }
        local["qualificationHash"] = S.sha256_value(local)
        height = compartments * candidate["compartmentPitchM"]
        hardware = {
            "rpm": candidate["rpm"],
            "columnDiameterM": candidate["columnDiameterM"],
            "compartmentPitchM": candidate["compartmentPitchM"],
            "powerVolumeWM3": candidate["powerVolumeWM3"],
            "physicalCompartments": compartments,
            "quantizedHardwareHeightM": height,
        }
        return {
            "sourceBasisHash": self.basis["basisHash"],
            "candidateSourceHash": candidate["candidateSourceHash"],
            "candidateState": state,
            "candidateStateHash": S.sha256_value(state),
            "localQualification": local,
            "quantizedHardwareHeightM": height,
            "rerunAtQuantizedHardwareHeight": True,
            "acceptedPhysicalHeightSolution": True,
            "physicalCompartments": compartments,
            "quantizedHardwareState": hardware,
            "quantizedHardwareStateHash": S.sha256_value(hardware),
            "exactHeightRunHash": "SYNTHETIC_PLACEHOLDER_NOT_CONTENT_ADDRESSED",
            "localQualificationHash": local["qualificationHash"],
            "fullQualificationHash": "SYNTHETIC_PLACEHOLDER_NOT_CONTENT_ADDRESSED",
            "runId": "SYNTHETIC_TEST_RUN",
            "columnDiameterM": candidate["columnDiameterM"],
            "wholeColumnEvidence": {
                "numericalGridHash": "1" * 64,
                "dutyEvaluationHash": "2" * 64,
                "closureEvidenceHash": "3" * 64,
                "sourceBasisHash": self.basis["basisHash"],
                "candidateSourceHash": candidate["candidateSourceHash"],
                "candidateStateHash": S.sha256_value(state),
                "localQualificationHash": local["qualificationHash"],
                "sulfurQualificationStatus": "SPECIES_RESOLVED_CALCULATED",
                "gridComplete": True,
                "dutyAccepted": True,
                "materialBalanceClosed": True,
                "constitutiveClosureReevaluatedAtFinalState": True,
                "bothPhaseMixingConserved": True,
                "diffusiveMolarFluxZeroSum": True,
            },
        }

    @staticmethod
    def address(body):
        payload = copy.deepcopy(body)
        payload["contentHash"] = S.sha256_value(body)
        return payload

    def content_addressed_failed_duty_evidence(self, candidate):
        evidence = self.synthetic_evidence(candidate, 2)
        common = {
            "runId": evidence["runId"],
            "sourceBasisHash": self.basis["basisHash"],
            "candidateSourceHash": candidate["candidateSourceHash"],
            "candidateStateHash": evidence["candidateStateHash"],
            "quantizedHardwareStateHash": evidence["quantizedHardwareStateHash"],
            "localQualificationHash": evidence["localQualificationHash"],
        }
        exact = self.address({
            **common,
            "demonstratedRunAtExactQuantizedHardwareHeight": True,
            "physicalCompartments": 2,
            "quantizedHardwareHeightM": evidence["quantizedHardwareHeightM"],
        })
        evidence["exactHeightRun"] = exact
        evidence["exactHeightRunHash"] = exact["contentHash"]
        final_d = self.basis["currentFeed"]["dispersedMolS"]
        final_c = self.basis["currentFeed"]["continuousMolS"]
        grid = self.address({
            **common,
            "cells": [{
                "numericalCell": 1,
                "rawEquationResidualMolS": 0.0,
                "localMaterialBalanceResidualMolS": 0.0,
                "finalConstitutiveResidualMolS": 0.0,
            }],
            "finalDispersedOutletMolS": final_d,
            "finalContinuousOutletMolS": final_c,
        })
        sulfur = self.address({
            **common,
            "status": "CALCULATED_SPECIES_RESOLVED",
            "raffinatePpm": 900.0,
        })
        calculated = S.evaluate_whole_column_outlet(
            self.basis,
            final_d,
            {
                "status": "CALCULATED_SPECIES_RESOLVED",
                "raffinatePpm": 900.0,
                "sourceHash": sulfur["contentHash"],
            },
        )
        duty = self.address({
            **common,
            "finalDispersedOutletMolS": final_d,
            "finalContinuousOutletMolS": final_c,
            "calculatedEvaluation": calculated,
        })
        closure = self.address({
            **common,
            "toleranceMolS": 1e-9,
            "maximumRawEquationResidualMolS": 0.0,
            "maximumLocalMaterialBalanceResidualMolS": 0.0,
            "maximumGlobalMaterialBalanceResidualMolS": 0.0,
            "maximumFinalConstitutiveResidualMolS": 0.0,
            "maximumBothPhaseMixingConservationResidualMolS": 0.0,
            "maximumDiffusiveMolarFluxFrameResidualMolS": 0.0,
        })
        full = self.address({
            **common,
            "exactHeightRunHash": exact["contentHash"],
            "numericalGridHash": grid["contentHash"],
            "dutyEvidenceHash": duty["contentHash"],
            "closureEvidenceHash": closure["contentHash"],
            "sulfurPredictionHash": sulfur["contentHash"],
        })
        evidence.update({
            "numericalGrid": grid,
            "dutyEvidence": duty,
            "closureEvidence": closure,
            "sulfurPrediction": sulfur,
            "fullQualification": full,
            "fullQualificationHash": full["contentHash"],
        })
        return evidence

    def test_quantization_requires_rerun_not_ceiling(self):
        candidate = next(x for x in self.basis["selectableHydraulicCandidates"]
                         if x["hydraulicallyFeasible"])
        evidence = self.synthetic_evidence(candidate, 8)
        evidence["quantizedHardwareHeightM"] += candidate["compartmentPitchM"] / 4
        with self.assertRaisesRegex(S.AuthorityError, "HEIGHT_NOT_QUANTIZED"):
            S.physical_compartments_from_quantized_evidence(candidate, evidence)

    def test_placeholder_boolean_and_hash_evidence_cannot_admit_dimensions(self):
        candidate = next(x for x in self.basis["selectableHydraulicCandidates"]
                         if x["hydraulicallyFeasible"])
        evidence = self.synthetic_evidence(candidate, 2)
        with self.assertRaisesRegex(S.AuthorityError,
                                    "CONTENT_ADDRESSED_PAYLOAD_REQUIRED"):
            S.validate_qualified_design(self.basis, candidate, evidence)

    def test_stale_local_or_missing_grid_evidence_is_rejected(self):
        candidate = next(x for x in self.basis["selectableHydraulicCandidates"]
                         if x["hydraulicallyFeasible"])
        evidence = self.synthetic_evidence(candidate, 2)
        evidence["localQualification"]["candidateSourceHash"] = "0" * 64
        with self.assertRaisesRegex(S.AuthorityError, "LOCAL_QUALIFICATION"):
            S.validate_qualified_design(self.basis, candidate, evidence)

    def test_changed_height_and_count_pair_is_rejected_by_hardware_state_hash(self):
        candidate = next(x for x in self.basis["selectableHydraulicCandidates"]
                         if x["hydraulicallyFeasible"])
        evidence = self.synthetic_evidence(candidate, 2)
        evidence["physicalCompartments"] = 3
        evidence["quantizedHardwareHeightM"] = 3 * candidate["compartmentPitchM"]
        with self.assertRaisesRegex(S.AuthorityError, "HARDWARE_STATE_HASH"):
            S.physical_compartments_from_quantized_evidence(candidate, evidence)

    def test_modified_basis_candidate_and_power_are_rejected(self):
        candidate = next(x for x in self.basis["selectableHydraulicCandidates"]
                         if x["hydraulicallyFeasible"])
        evidence = self.synthetic_evidence(candidate, 2)
        changed_basis = copy.deepcopy(self.basis)
        changed_basis["outletTargets"]["sulfurMaxPpm"] = 999
        with self.assertRaisesRegex(S.AuthorityError, "IN_MEMORY_BASIS_MUTATION"):
            S.validate_qualified_design(changed_basis, candidate, evidence)
        changed_candidate = copy.deepcopy(candidate)
        changed_candidate["powerVolumeWM3"] += 1
        with self.assertRaisesRegex(S.AuthorityError, "EXACT_FROZEN_MEMBER"):
            S.validate_qualified_design(self.basis, changed_candidate, evidence)

    def test_pa_is_in_governing_total_and_nmp_uses_full_wet_phase_basis(self):
        masses = [
            92.49637792254077,
            7.349430690613482,
            0.0,
            0.0,
            0.1541913868457575,
            7.0,
            1.0,
        ]
        flows = [
            mass / mw for mass, mw in zip(
                masses, self.basis["componentContract"]["molecularWeightGMol"]
            )
        ]
        result = S.evaluate_whole_column_outlet(self.basis, flows)
        self.assertAlmostEqual(
            result["values"]["totalAromaticsWtPctHydrocarbonBasis"],
            7.50362207745924,
        )
        self.assertAlmostEqual(
            result["values"]["nmpWtPctFullRaffinatePhaseBasis"],
            100 * 7 / sum(masses),
        )
        self.assertFalse(result["checks"]["totalAromatics"])
        self.assertFalse(result["allDutiesAccepted"])

    def test_content_addressed_package_with_failed_actual_duties_is_rejected(self):
        candidate = next(x for x in self.basis["selectableHydraulicCandidates"]
                         if x["hydraulicallyFeasible"])
        evidence = self.content_addressed_failed_duty_evidence(candidate)
        with self.assertRaisesRegex(
            S.AuthorityError, "ACTUAL_WHOLE_COLUMN_DUTIES_NOT_ACCEPTED"
        ):
            S.validate_qualified_design(self.basis, candidate, evidence)


if __name__ == "__main__":
    unittest.main()