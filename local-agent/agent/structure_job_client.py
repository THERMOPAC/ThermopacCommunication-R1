"""
structure_job_client.py — HTTP client for Drawing Structurer job queue.

Endpoints (structurer-specific):
  GET  /api/epc-structure-jobs/pending          — poll for pending jobs
  POST /api/epc-structure-jobs/:id/claim        — claim a job
  POST /api/epc-structure-jobs/:id/complete     — submit success result
  POST /api/epc-structure-jobs/:id/fail         — report failure

Auth: same x-node-id + x-node-token headers as the extraction agent.
"""

from __future__ import annotations
import json
from typing import Optional
import requests

from agent.job_client import _AuthError, _ConflictError, _ValidationError

STRUCTURER_VERSION = "1.0.1"


class StructureJobClient:
    def __init__(self, api_url: str, node_id: str, node_token: str, logger):
        self._base   = api_url.rstrip("/")
        self._logger = logger
        self._headers = {
            "x-node-id":    node_id,
            "x-node-token": node_token,
            "Content-Type": "application/json",
            "User-Agent":   f"ThermopacStructurer/{STRUCTURER_VERSION}",
        }

    # ── Poll ──────────────────────────────────────────────────────────────────

    def get_pending_jobs(self) -> list[dict]:
        """GET /api/epc-structure-jobs/pending"""
        try:
            r = self._get("/api/epc-structure-jobs/pending", timeout=15)
            return r.get("jobs", [])
        except Exception as e:
            self._logger.warning(f"[StructClient] poll error: {e}")
            return []

    # ── Claim ─────────────────────────────────────────────────────────────────

    def claim_job(self, job_id: int) -> Optional[dict]:
        """
        POST /api/epc-structure-jobs/:id/claim
        Returns full job payload dict on success, None on 409 or error.
        """
        import socket
        body = {
            "agent_version": AGENT_VERSION,
            "machine_name":  socket.gethostname(),
        }
        try:
            return self._post(
                f"/api/epc-structure-jobs/{job_id}/claim", body, timeout=20
            )
        except _ConflictError:
            self._logger.info(f"[StructClient] Job {job_id} already claimed (409)")
            return None
        except Exception as e:
            self._logger.warning(f"[StructClient] claim error job {job_id}: {e}")
            return None

    # ── Complete ──────────────────────────────────────────────────────────────

    def complete_job(self, job_id: int, result: dict) -> bool:
        """POST /api/epc-structure-jobs/:id/complete"""
        try:
            self._post(
                f"/api/epc-structure-jobs/{job_id}/complete",
                {"result": result},
                timeout=30,
            )
            return True
        except _ValidationError as e:
            self._logger.error(f"[StructClient] complete rejected (422): {e}")
            return False
        except Exception as e:
            self._logger.error(f"[StructClient] complete error job {job_id}: {e}")
            return False

    # ── Fail ──────────────────────────────────────────────────────────────────

    def fail_job(self, job_id: int, reason: str) -> None:
        """POST /api/epc-structure-jobs/:id/fail — best effort."""
        try:
            self._post(
                f"/api/epc-structure-jobs/{job_id}/fail",
                {"reason": reason[:1000]},
                timeout=15,
            )
        except Exception as e:
            self._logger.warning(f"[StructClient] fail report error job {job_id}: {e}")

    # ── Connectivity test ─────────────────────────────────────────────────────

    def test_connection(self) -> bool:
        try:
            self._get("/api/epc-structure-jobs/pending", timeout=10)
            return True
        except _AuthError:
            self._logger.error(
                "[StructClient] Authentication failed — check node_id and node_token"
            )
            return False
        except Exception as e:
            self._logger.error(f"[StructClient] Connection test failed: {e}")
            return False

    # ── Internal ──────────────────────────────────────────────────────────────

    def _get(self, path: str, timeout: int = 15) -> dict:
        url = self._base + path
        r   = requests.get(url, headers=self._headers, timeout=timeout)
        return self._handle(r)

    def _post(self, path: str, body: dict, timeout: int = 30) -> dict:
        url = self._base + path
        r   = requests.post(
            url, headers=self._headers,
            data=json.dumps(body, ensure_ascii=False), timeout=timeout,
        )
        return self._handle(r)

    @staticmethod
    def _handle(r: requests.Response) -> dict:
        if r.status_code == 401:
            raise _AuthError(f"401 Unauthorized from {r.url}")
        if r.status_code == 409:
            raise _ConflictError("409 Conflict")
        if r.status_code == 422:
            raise _ValidationError(r.text[:500])
        r.raise_for_status()
        if r.content:
            return r.json()
        return {}
