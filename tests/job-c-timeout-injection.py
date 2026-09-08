"""Execute the worker's actual optimizer routing and terminal handlers without SciPy."""
import ast
import copy
import hashlib
import json
import time
from pathlib import Path

tree = ast.parse(Path("server/ecr-pre-pilot/job-c/worker.py").read_text())
names = {
    "canonical", "hashed", "digest", "require_runtime_budget",
    "JobCBlocked", "budgeted_least_squares",
}
namespace = {"json": json, "hashlib": hashlib, "time": time}
exec(compile(ast.Module(body=[
    node for node in tree.body
    if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names
], type_ignores=[]), "<worker-helpers>", "exec"), namespace)

routes = {
    "fit": "BOUNDED_FROZEN",
    "coupled_fit": "COUPLED",
    "unconstrained_fit": "UNBOUNDED_DIAGNOSTIC",
    "polish_fit": "LAMBDA_ONE_POLISH",
}
calls = {}
for node in ast.walk(tree):
    if not isinstance(node, ast.Try) or not node.body:
        continue
    assignment = node.body[0]
    if not isinstance(assignment, ast.Assign):
        continue
    call = assignment.value
    if not (isinstance(call, ast.Call) and isinstance(call.func, ast.Name)
            and call.func.id == "budgeted_least_squares"):
        continue
    target = assignment.targets[0].id
    assert call.args[1].value == routes[target]
    assert ast.unparse(call.args[2]) == "scipy.optimize.least_squares"
    # Retain actual route/budget arguments and enclosing exception handlers.
    # Only numerical payloads and the optimizer are replaced with fast doubles.
    call = copy.deepcopy(call)
    call.args = call.args[:2] + [
        ast.Name(id="optimizer", ctx=ast.Load()),
        ast.Name(id="residual", ctx=ast.Load()),
    ]
    call.keywords = []
    local = copy.deepcopy(node)
    local.body = [ast.Expr(value=call)]
    calls[target] = local
assert set(calls) == set(routes)

terminal_loop = next(node for node in tree.body if isinstance(node, ast.For))
terminal_try = terminal_loop.body[0]
hash_statement = terminal_loop.body[1]
assert isinstance(hash_statement, ast.Assign)
assert hash_statement.targets[0].slice.value == "resultSha256"
results = []
for target, local in calls.items():
    for fault in ("entry", "callback", "residual_return", "optimizer_timeout", "return", "none"):
        clock = [11.0 if fault == "entry" else 0.0]
        counts = {"optimizer": 0, "residual": 0, "after": 0}

        def residual():
            counts["residual"] += 1
            if fault == "residual_return":
                clock[0] = 11.0
            return [0.0]

        def optimizer(callback):
            counts["optimizer"] += 1
            if fault == "optimizer_timeout":
                raise TimeoutError("injected optimizer timeout")
            if fault == "callback":
                clock[0] = 11.0
            callback()
            if fault == "return":
                clock[0] = 11.0
            return object()

        def after():
            counts["after"] += 1

        namespace.update({
            "time": type("Clock", (), {"monotonic": staticmethod(lambda: clock[0])}),
            "budget": {"started": 0.0, "maximumSeconds": 10.0},
            "optimizer": optimizer, "residual": residual, "after": after,
            "PROTOCOL": "ECR_PRE_PILOT_JOB_C_V1",
            "active_runtime_budget_report": lambda: None,
        })
        namespace.pop("body", None)
        outer = copy.deepcopy(terminal_try)
        # Original bounded/coupled handlers contain loop breaks.
        loop = ast.parse("for _ in range(1): pass").body[0]
        loop.body = [copy.deepcopy(local)]
        outer.body = [loop, ast.parse("after()").body[0]]
        program = ast.fix_missing_locations(ast.Module(
            body=[outer], type_ignores=[]))
        exec(compile(program, "<worker-timeout-route>", "exec"), namespace)
        if fault == "none":
            assert counts == {"optimizer": 1, "residual": 1, "after": 1}
            assert "body" not in namespace
            continue
        assert counts["after"] == 0, (target, fault, counts)
        assert counts["optimizer"] == (0 if fault == "entry" else 1)
        assert counts["residual"] == (
            0 if fault in ("entry", "callback", "optimizer_timeout") else 1)
        exec(compile(ast.Module(body=[copy.deepcopy(hash_statement)],
                               type_ignores=[]), "<worker-hash>", "exec"), namespace)
        results.append({"route": target, "fault": fault,
                        "counts": counts, "response": namespace["body"]})
print(json.dumps(results))