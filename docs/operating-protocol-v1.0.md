# Operating Protocol v1.0

## 0. Foundational Principle

The operating protocol is designed to prevent the agent from becoming the designer of the business. When authoritative business data, master data, folder structures, workflows, naming conventions, approval rules, or governance decisions are unavailable, the mandatory action is to stop and ask the owner. The absence of information is never permission to invent it.

Business decisions belong to the owner. The agent's responsibility is to implement approved business decisions — not create them.

---

## 1. Discussion Rules

1. **Short and precise.** Every prompt states exactly what is needed. No filler, no context padding.
2. **No ambiguity.** Every term, field name, and behavior must be unambiguous before discussion closes.
3. **Explicit scope.** What is in scope must be stated. Anything not stated is out of scope.
4. **Explicit exclusions.** What must not be changed must be stated explicitly.
5. **Implementation language only.** No prose explanation unless explicitly asked. Decisions expressed as rules, not reasoning.

---

## 2. Pre-Implementation Checklist

Before writing any code:

1. Read the relevant baseline doc(s) for the module being changed.
2. Confirm all external field names (SAP, DB, API) from a live diagnostic or authoritative source — never assume.
3. State scope and exclusions in the discussion. Get explicit approval.
4. No implementation starts until approval is given.

---

## 3. Implementation Rules

1. **No assumptions.** Field names, response structures, and behaviors must be confirmed before use. If unconfirmed, raise it — do not implement and note it as a gap.
2. **Deterministic behavior.** Same input must always produce same output. No order-dependent logic, no first-seen selection unless ordering is guaranteed.
3. **No hidden fallback logic.** Every fallback must be an explicit, approved rule. Silent fallbacks are prohibited.
4. **No hidden filters.** Every suppression condition (e.g. `!== 'NA'`, `!== ''`) must be stated as a rule before implementation.
5. **No scope creep.** Only implement what was explicitly approved in the discussion. Additional changes require a new discussion.
6. **Immutable fields must be listed.** Any field that must not be written by an operation (e.g. `CardCode`, `CardType` on PATCH) must be listed as an explicit exclusion in the discussion.

---

## 4. Gap Reporting

If a gap is found during or after implementation:

1. List each gap with: what rule it violates, exact code location, and observed vs. expected behavior.
2. Do not fix gaps without explicit approval.
3. Gaps in confirmed-field names must be resolved by diagnostic before any fix is written.

---

## 5. Baseline Doc Requirement

Every module with non-trivial business logic must have a baseline doc in `docs/`.  
No implementation may change that module's behavior without reading its baseline doc first.  
If no baseline doc exists, one must be written and approved before implementation starts.
