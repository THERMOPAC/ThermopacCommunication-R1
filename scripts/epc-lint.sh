#!/bin/bash
set -euo pipefail

FAIL=0
CHECKED=0

echo "=== EPC Numbering & GCS Lint Scanner ==="
echo ""

check() {
  local label="$1"
  local pattern="$2"
  local glob_pattern="$3"
  shift 3
  local excludes=("$@")

  CHECKED=$((CHECKED + 1))

  local matches
  matches=$(grep -rn --include="$glob_pattern" -E "$pattern" server/ shared/ client/src/ 2>/dev/null || true)

  matches=$(echo "$matches" | grep -v 'epc-guardrails\.ts' || true)
  matches=$(echo "$matches" | grep -v 'epc-guardrails\.test\.ts' || true)
  matches=$(echo "$matches" | grep -v 'epc-lint\.sh' || true)
  matches=$(echo "$matches" | grep -v 'server/scripts/' || true)
  matches=$(echo "$matches" | grep -v '\.test\.ts' || true)
  matches=$(echo "$matches" | grep -v 'zero-trust-audit' || true)

  for exc in "${excludes[@]}"; do
    if [ -n "$exc" ]; then
      matches=$(echo "$matches" | grep -v "$exc" || true)
    fi
  done

  matches=$(echo "$matches" | sed '/^$/d')

  if [ -n "$matches" ]; then
    echo "❌ FAIL: $label"
    echo "$matches" | head -20
    echo ""
    FAIL=$((FAIL + 1))
  else
    echo "✅ PASS: $label"
  fi
}

check \
  "No 'operational_code' in active code" \
  "operational_code" \
  "*.ts"

check \
  "No 'operationalCode' in active code" \
  "operationalCode" \
  "*.ts"

check \
  "No legacy TP- project code construction" \
  "TP-\\\$\{|'TP-[A-Z]{2}-[A-Z]{2}'|\"TP-[A-Z]{2}-[A-Z]{2}\"" \
  "*.ts" \
  "test-procedures" \
  "TPEL_PATH_REGEX"

check \
  "No old WO-\${project format" \
  'WO-\$\{project' \
  "*.ts"

check \
  "No bare code.split without fyCode fallback" \
  'project\.code\.split|projectCodeParts = project\.code' \
  "*.ts" \
  "fyCode.*split\|projectSeq.*split"

echo ""
echo "=== SUMMARY ==="
echo "Checked: $CHECKED"
echo "Failed: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "❌ EPC lint check FAILED — $FAIL violation(s) found."
  exit 1
else
  echo "✅ EPC lint check PASSED — no violations found."
  exit 0
fi
