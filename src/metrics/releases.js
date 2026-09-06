const { IMMUTABLE_TTL, MemoCache } = require("./cache");
const { promisePool } = require("./concurrency");
const { median } = require("./stats");
const { isoWeekBuckets, resolveMetricsWindow } = require("./window");

const HOURS = 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 60;

async function calculateDeploymentFrequency({
  github,
  config = {},
  now = new Date(),
  includePriorWindow = false,
  cache = new MemoCache(config.metricsCache || {}),
} = {}) {
  if (!github) {
    throw new TypeError("github wrapper is required");
  }

  const window = resolveMetricsWindow(
    { metricsWindowDays: config.window_days || config.metricsWindowDays || DEFAULT_WINDOW_DAYS },
    now
  );
  const currentStart = new Date(window.window_start);
  const currentEnd = new Date(window.window_end);
  const fetchStart = includePriorWindow ? new Date(window.prior_window_start) : currentStart;
  const concurrency = config.metricsConcurrency || 8;

  const releases = await fetchProductionReleases({
    github,
    windowStart: fetchStart,
    windowEnd: currentEnd,
    concurrency,
    cache,
  });
  const currentReleases = releases.filter((release) =>
    isWithinWindow(release.published_at, currentStart, currentEnd)
  );
  const priorReleases = includePriorWindow
    ? releases.filter((release) =>
        isWithinWindow(release.published_at, new Date(window.prior_window_start), currentStart)
      )
    : [];

  const currentStats = summarizeReleaseSet(currentReleases, window.iso_week_buckets);
  const priorStats = includePriorWindow
    ? summarizeReleaseSet(priorReleases, resolvePriorBuckets(window))
    : null;
  const dataConfidence =
    currentStats.kept_count === 0 ? 1 : currentStats.resolved_count / currentStats.kept_count;

  return {
    metric: "deployment_frequency",
    window: {
      start: window.window_start,
      end: window.window_end,
      days: window.window_days,
    },
    state: currentStats.kept_count === 0 ? "no_releases" : "ready",
    headline: {
      value: currentStats.headline,
      unit: "deploys/week",
      band: bandForDeploysPerWeek(currentStats.headline),
    },
    gap_hours: currentStats.gap_hours,
    trend: currentStats.trend,
    release_windows: buildReleaseWindows(currentStats.resolved_releases),
    releases: currentStats.releases,
    direction: directionStatus(currentStats, priorStats, includePriorWindow),
    direction_basis: directionBasis(currentStats, priorStats, includePriorWindow),
    sample_size: currentStats.resolved_count,
    data_confidence: Number(dataConfidence.toFixed(4)),
    unresolved_tags: currentStats.releases
      .filter((release) => !release.resolved_sha)
      .map((release) => release.tag_name),
    computed_at: new Date(now).toISOString(),
    rateLimit: github.rateLimit || null,
  };
}

async function fetchProductionReleases({
  github,
  windowStart,
  windowEnd,
  concurrency = 8,
  cache = new MemoCache(),
} = {}) {
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  const pages = [];
  let nextUrl = null;
  let shouldStop = false;

  while (!shouldStop) {
    const page = nextUrl
      ? await github.requestUrlWithMeta(nextUrl)
      : await github.requestWithMeta(`/repos/${github.repoPath}/releases`, { per_page: 100 });
    const releases = Array.isArray(page.data) ? page.data : [];
    pages.push(...releases);
    shouldStop = releases.some((release) => {
      const publishedAt = parseTime(release.published_at);
      return publishedAt !== null && publishedAt < start.getTime();
    });
    nextUrl = shouldStop ? null : page.meta.nextUrl;
    if (!nextUrl) {
      shouldStop = true;
    }
  }

  const kept = pages
    .filter((release) => isProductionReleaseInRange(release, start, end))
    .map(normalizeRelease);

  const resolved = await promisePool(
    kept,
    (release) => resolveReleaseTag({ github, release, cache }),
    concurrency
  );

  return resolved.sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));
}

function summarizeReleaseSet(releases, buckets) {
  const sorted = [...releases].sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));
  const resolved = sorted.filter((release) => release.resolved_sha);
  const trend = buckets.map((bucket) => ({
    week_start: bucket.week_start,
    deploys: resolved.filter((release) =>
      isWithinWindow(release.published_at, new Date(bucket.start), new Date(bucket.end))
    ).length,
  }));
  const gaps = resolved
    .slice(1)
    .map((release, index) =>
      (Date.parse(release.published_at) - Date.parse(resolved[index].published_at)) / HOURS
    );
  const gapP50 = median(gaps);
  const gapP85 = percentileNearest(gaps, 85);
  const normalized = sorted.map((release) => ({
    id: release.id,
    tag_name: release.tag_name,
    resolved_sha: release.resolved_sha,
    published_at: release.published_at,
    html_url: release.html_url,
    resolution_error: release.resolution_error,
  }));

  return {
    kept_count: sorted.length,
    resolved_count: resolved.length,
    headline: median(trend.map((bucket) => bucket.deploys)) || 0,
    gap_hours: {
      p50: gapP50 === null ? null : round(gapP50),
      p85: gapP85 === null ? null : round(gapP85),
    },
    trend,
    releases: normalized,
    resolved_releases: resolved,
  };
}

function buildReleaseWindows(releases) {
  return releases.map((release, index) => {
    const previous = releases[index - 1] || null;
    return {
      release_id: release.id,
      prev_release_id: previous ? previous.id : null,
      start_sha: previous ? previous.resolved_sha : null,
      end_sha: release.resolved_sha,
      window_start_ts: previous ? previous.published_at : null,
      window_end_ts: release.published_at,
      commit_shas: [],
    };
  });
}

async function resolveReleaseTag({ github, release, cache }) {
  const key = `release-tag:${github.repoPath}:${release.tag_name}`;
  return cache.memoize(
    key,
    async () => {
      try {
        const commit = await github.getCommit(release.tag_name);
        return { ...release, resolved_sha: commit.sha || null, resolution_error: null };
      } catch (error) {
        if (error.statusCode === 404) {
          return {
            ...release,
            resolved_sha: null,
            resolution_error: "tag_not_resolved",
          };
        }
        throw error;
      }
    },
    IMMUTABLE_TTL
  );
}

function normalizeRelease(release) {
  return {
    id: release.id,
    tag_name: release.tag_name,
    resolved_sha: null,
    published_at: new Date(release.published_at).toISOString(),
    draft: Boolean(release.draft),
    prerelease: Boolean(release.prerelease),
    html_url: release.html_url || null,
  };
}

function isProductionReleaseInRange(release, start, end) {
  if (release.draft || release.prerelease) {
    return false;
  }
  return isWithinWindow(release.published_at, start, end);
}

function isWithinWindow(value, start, end) {
  const time = parseTime(value);
  return time !== null && time >= start.getTime() && time < end.getTime();
}

function parseTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function bandForDeploysPerWeek(value) {
  if (value >= 7) return "elite";
  if (value >= 1) return "high";
  if (value >= 0.25) return "medium";
  return "low";
}

function directionStatus(current, prior, includePriorWindow) {
  if (!includePriorWindow) {
    return "not_computed";
  }
  if (!prior || current.kept_count < 30 || prior.kept_count < 30) {
    return "insufficient_data";
  }
  if (current.headline > prior.headline) return "improving";
  if (current.headline < prior.headline) return "degrading";
  return "flat";
}

function directionBasis(current, prior, includePriorWindow) {
  if (!includePriorWindow) {
    return "prior window not requested";
  }
  if (!prior) {
    return "prior window unavailable";
  }
  if (current.kept_count < 30 || prior.kept_count < 30) {
    return "insufficient data";
  }
  return `${current.headline} vs ${prior.headline} deploys/week prior window`;
}

function resolvePriorBuckets(window) {
  return isoWeekBuckets(new Date(window.prior_window_start), new Date(window.prior_window_end));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function percentileNearest(values, p) {
  const sorted = values
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) {
    return null;
  }
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank - 1, 0), sorted.length - 1)];
}

module.exports = {
  bandForDeploysPerWeek,
  buildReleaseWindows,
  calculateDeploymentFrequency,
  fetchProductionReleases,
  summarizeReleaseSet,
};
