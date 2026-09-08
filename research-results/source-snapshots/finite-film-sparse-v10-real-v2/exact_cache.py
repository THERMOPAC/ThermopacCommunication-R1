"""Bounded exact-state memoization; no rounding, interpolation or model change."""
from collections import OrderedDict


class ExactExcessCache:
    def __init__(self, adapter, capacity=8192):
        self.adapter = adapter
        self.np = adapter.np
        self.kind = adapter.kind
        self.capacity = int(capacity)
        if self.capacity <= 0:
            raise ValueError("POSITIVE_CACHE_CAPACITY_REQUIRED")
        self.values = OrderedDict()
        self.derivatives = OrderedDict()
        self.counts = {"valueHits": 0, "valueMisses": 0,
                       "derivativeHits": 0, "derivativeMisses": 0}

    def key(self, x):
        # Validate even on hits. Shape cannot be omitted from the key/contract.
        physical = self.adapter._simplex(x)
        return physical.astype(self.np.float64).tobytes()

    def lookup(self, table, key, calculate, prefix):
        if key in table:
            self.counts[prefix + "Hits"] += 1
            table.move_to_end(key)
        else:
            self.counts[prefix + "Misses"] += 1
            table[key] = calculate().copy()
            if len(table) > self.capacity:
                table.popitem(last=False)
        return table[key].copy()

    def excess(self, x):
        key = self.key(x)
        return self.lookup(self.values, key, lambda: self.adapter.excess(x), "value")

    def excess_jacobian_full(self, x, dependent_index=None, step=None):
        key = (self.key(x), dependent_index, step)
        return self.lookup(
            self.derivatives, key,
            lambda: self.adapter.excess_jacobian_full(x, dependent_index, step),
            "derivative",
        )