from threading import Lock


class SimpleMetrics:
    def __init__(self):
        self._lock = Lock()
        self.active_requests = 0
        self.peak_concurrency = 0
        self.total_requests = 0
        self.total_cost_ms = 0.0
        self.cache_hits = 0
        self.cache_misses = 0

    def request_start(self):
        with self._lock:
            self.active_requests += 1
            if self.active_requests > self.peak_concurrency:
                self.peak_concurrency = self.active_requests

    def request_finish(self, cost_ms: float, hits: int, misses: int):
        with self._lock:
            self.active_requests = max(0, self.active_requests - 1)
            self.total_requests += 1
            self.total_cost_ms += cost_ms
            self.cache_hits += hits
            self.cache_misses += misses

    def realtime_snapshot(self):
        with self._lock:
            return {
                "active_requests": self.active_requests,
                "peak_concurrency": self.peak_concurrency,
            }

    def snapshot_and_reset(self):
        with self._lock:
            snapshot = {
                "active_requests": self.active_requests,
                "peak_concurrency": self.peak_concurrency,
                "total_requests": self.total_requests,
                "total_cost_ms": self.total_cost_ms,
                "cache_hits": self.cache_hits,
                "cache_misses": self.cache_misses,
            }
            self.peak_concurrency = self.active_requests
            self.total_requests = 0
            self.total_cost_ms = 0.0
            self.cache_hits = 0
            self.cache_misses = 0
            return snapshot


metrics = SimpleMetrics()
