// Metrik runtime buat observasi & monitoring server
export const metrics = {
  requests: { total: 0, byEndpoint: {} },  // total request per endpoint
  cache: { hits: 0, misses: 0 },           // hit/miss ratio cache
  llm: { calls: 0, errors: 0, totalLatencyMs: 0 },  // statistik panggilan LLM
  scraper: { successes: 0, failures: 0, methods: {} },  // keberhasilan scraping URL
  errors: { total: 0, byType: {} },        // error tracking by type
  startTime: Date.now(),                    // waktu mulai server
};

export const getMetrics = () => {
  const total = metrics.cache.hits + metrics.cache.misses;
  return {
    uptime: Date.now() - metrics.startTime,
    uptimeFormatted: formatDuration(Date.now() - metrics.startTime),
    requests: { ...metrics.requests },
    cache: {
      ...metrics.cache,
      hitRate: total > 0 ? `${(metrics.cache.hits / total * 100).toFixed(1)}%` : "N/A",
    },
    llm: {
      calls: metrics.llm.calls,
      errors: metrics.llm.errors,
      avgLatencyMs: metrics.llm.calls > 0 ? `${(metrics.llm.totalLatencyMs / metrics.llm.calls).toFixed(0)}ms` : "N/A",
    },
    scraper: { ...metrics.scraper },
    errors: { ...metrics.errors },
  };
};

const formatDuration = (ms) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
};
