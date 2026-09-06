function median(values) {
  return percentile(values, 50);
}

function percentile(values, p) {
  const sorted = cleanNumbers(values).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return null;
  }

  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];

  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sorted[lower];
  }

  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mad(values) {
  const nums = cleanNumbers(values);
  const center = median(nums);
  if (center === null) {
    return null;
  }
  return median(nums.map((value) => Math.abs(value - center)));
}

function direction({
  current,
  prior,
  history = [],
  minSample = 30,
  minRelativeChange = 0.1,
  minPeriods = 8,
  higherIsBetter = false,
} = {}) {
  if (!prior) {
    return {
      status: "not_computed",
      computed: false,
      reasons: ["prior_window_not_requested"],
    };
  }

  const currentValues = cleanNumbers(current);
  const priorValues = cleanNumbers(prior);
  const reasons = [];

  if (currentValues.length < minSample || priorValues.length < minSample) {
    reasons.push("insufficient_sample");
  }

  const currentMedian = median(currentValues);
  const priorMedian = median(priorValues);
  const delta = currentMedian === null || priorMedian === null ? null : currentMedian - priorMedian;
  const baseline = priorMedian === 0 ? Math.abs(currentMedian || 0) : Math.abs(priorMedian || 0);
  const relativeChange = delta === null || baseline === 0 ? 0 : Math.abs(delta) / baseline;

  if (relativeChange < minRelativeChange) {
    reasons.push("minimum_magnitude_not_met");
  }

  const historicalVariation = mad(history);
  if (cleanNumbers(history).length < minPeriods) {
    reasons.push("insufficient_history");
  } else if (historicalVariation !== null && Math.abs(delta || 0) <= historicalVariation) {
    reasons.push("within_historical_variation");
  }

  if (reasons.length > 0) {
    return {
      status: reasons.includes("insufficient_sample") ? "insufficient_data" : "flat",
      computed: true,
      reasons,
      current: currentMedian,
      prior: priorMedian,
      delta,
      relative_change: relativeChange,
      mad: historicalVariation,
    };
  }

  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return {
    status: improved ? "improving" : "degrading",
    computed: true,
    reasons: [],
    current: currentMedian,
    prior: priorMedian,
    delta,
    relative_change: relativeChange,
    mad: historicalVariation,
  };
}

function cleanNumbers(values) {
  return (Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isFinite(value));
}

module.exports = {
  direction,
  mad,
  median,
  percentile,
};
