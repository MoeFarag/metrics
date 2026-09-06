const MS_PER_DAY = 24 * 60 * 60 * 1000;

function resolveMetricsWindow(config = {}, now = new Date()) {
  const days = parseWindowDays(config.metricsWindowDays ?? config.METRICS_WINDOW_DAYS, 90);
  const windowEnd = new Date(now);
  const windowStart = addDays(windowEnd, -days);
  const priorWindowEnd = new Date(windowStart);
  const priorWindowStart = addDays(priorWindowEnd, -days);

  return {
    window_days: days,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    prior_window_start: priorWindowStart.toISOString(),
    prior_window_end: priorWindowEnd.toISOString(),
    iso_week_buckets: isoWeekBuckets(windowStart, windowEnd),
  };
}

function parseWindowDays(value, defaultDays = 90) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultDays;
}

function isoWeekBuckets(start, end) {
  const buckets = [];
  let cursor = startOfIsoWeek(start);
  const endTime = end.getTime();

  while (cursor.getTime() < endTime) {
    const next = addDays(cursor, 7);
    buckets.push({
      week_start: formatDate(cursor),
      start: new Date(Math.max(cursor.getTime(), start.getTime())).toISOString(),
      end: new Date(Math.min(next.getTime(), end.getTime())).toISOString(),
    });
    cursor = next;
  }

  return buckets;
}

function startOfIsoWeek(date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return copy;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

module.exports = {
  isoWeekBuckets,
  parseWindowDays,
  resolveMetricsWindow,
  startOfIsoWeek,
};
