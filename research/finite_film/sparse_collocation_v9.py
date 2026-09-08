"""Pinned local-block sparse variant of the qualified v4 Lobatto equations.

The constitutive/residual/profile code is loaded byte-for-byte from the
recorded v4 source.  Only its globally dense finite-difference assembly and
dense linear solve are replaced; equations and acceptance logic are unchanged.
"""
from __future__ import annotations
import hashlib
import inspect
from pathlib import Path

import numpy as np
from scipy.sparse import csc_matrix
from scipy.sparse.linalg import lsqr

import physical_collocation_v4 as _dense

EXPECTED_DENSE_SHA256 = "9f7fa12a1c7375f651addd4b210b015ccfd4bc49a4518661319becf6db7b7bbf"
_path = Path(_dense.__file__)
if hashlib.sha256(_path.read_bytes()).hexdigest() != EXPECTED_DENSE_SHA256:
    raise RuntimeError("PINNED_V4_SOURCE_CHANGED")

_source = inspect.getsource(_dense.solve_lobatto)
_old_jac = '''    def jacobian(v, r):
        j = np.empty((len(r), len(v)))
        for col in range(len(v)):
            step = 2e-7 * max(1, abs(v[col]))
            for _ in range(40):
                plus, minus = v.copy(), v.copy()
                plus[col] += step
                minus[col] -= step
                try:
                    rp = scaled(plus)
                except FilmDomainError:
                    rp = None
                try:
                    rm = scaled(minus)
                except FilmDomainError:
                    rm = None
                if rp is not None and rm is not None:
                    j[:, col] = (rp-rm)/(2*step); break
                if rp is not None:
                    j[:, col] = (rp-r)/step; break
                if rm is not None:
                    j[:, col] = (r-rm)/step; break
                step *= .5
            else:
                raise FilmDomainError("NO_SIMPLEX_MARGIN_FOR_JACOBIAN_COLUMN")
        return j
'''
_new_jac = '''    def jacobian(v, r):
        rows, cols, data = [], [], []
        state_columns = 12*(m-1)
        for col in range(len(v)):
            step = 2e-7 * max(1, abs(v[col]))
            for _ in range(40):
                plus, minus = v.copy(), v.copy()
                plus[col] += step; minus[col] -= step
                try: rp = scaled(plus)
                except FilmDomainError: rp = None
                try: rm = scaled(minus)
                except FilmDomainError: rm = None
                if rp is not None and rm is not None:
                    derivative = (rp-rm)/(2*step); break
                if rp is not None:
                    derivative = (rp-r)/step; break
                if rm is not None:
                    derivative = (r-rm)/step; break
                step *= .5
            else:
                raise FilmDomainError("NO_SIMPLEX_MARGIN_FOR_JACOBIAN_COLUMN")
            if col >= state_columns:
                support = range(len(r))
            elif col < 6*(m-1):
                node = col//6 + 1
                support = list(range(6*max(0,node-1), 6*min(m-1,node+1)))
                if node == m-1: support += list(range(len(r)-7, len(r)))
            else:
                node = (col-6*(m-1))//6
                base = 6*(m-1)
                support = list(range(base+6*max(0,node-1),
                                     base+6*min(m-1,node+1)))
                if node == 0: support += list(range(len(r)-7, len(r)))
            for row in support:
                value = derivative[row]
                if value != 0:
                    rows.append(row); cols.append(col); data.append(value)
        return csc_matrix((data, (rows, cols)), shape=(len(r), len(v)))
'''
if _old_jac not in _source:
    raise RuntimeError("PINNED_V4_JACOBIAN_BLOCK_NOT_FOUND")
_source = _source.replace(_old_jac, _new_jac)
_source = _source.replace(
    "step = np.linalg.lstsq(jac, -r, rcond=1e-11)[0]",
    "step = lsqr(jac, -r, atol=1e-12, btol=1e-12, iter_lim=4*len(r))[0]",
)
_source = _source.replace(
    "jac += np.outer(dr-jac@du, du)/(du@du)",
    "jac = jac + csc_matrix(np.outer(dr-jac@du, du)/(du@du))",
)
_source = _source.replace(
    "singular = np.linalg.svd(final_jacobian, compute_uv=False)",
    "singular = np.linalg.svd(final_jacobian.toarray(), compute_uv=False)",
)
_namespace = dict(_dense.__dict__)
_namespace.update({"csc_matrix": csc_matrix, "lsqr": lsqr})
exec(compile(_source, __file__, "exec"), _namespace)
solve_sparse_lobatto = _namespace["solve_lobatto"]