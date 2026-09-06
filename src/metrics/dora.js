const { MemoCache } = require("./cache");
const { promisePool } = require("./concurrency");
const { loadMergedPullRequests, loadPullRequestDetails } = require("./pr-loader");
const { fetchProductionReleases } = require("./releases");
const { percentile } = require("./stats");
const { resolveMetricsWindow } = require("./window");

const HOURS = 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 60;
const FAILURE_PATTERN = /\b(hot\s*fix|hotfix|incident|sev[0-9]?|outage|rollback|bug|fix|defect|regression|revert(?:ed|s|ing)?|postmortem|restore)\b/i;
const NON_FAILURE_FIX_PATTERN = /\b(prefix|suffix|fixture|fixtures|config(?:uration)? fixup|fixup!)\b/i;

async function calculateLeadTimeForChanges({
  github,
  config = {},
  now = new Date(),
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
  const releases = await loadReleaseContext({ github, config, window, cache });
  const currentReleases = releases.filter((release) =>
    isWithinWindow(release.published_at, currentStart, currentEnd)
  );

  if (currentReleases.length === 0) {
    return noReleaseMetric("lead_time_for_changes", window, now, github);
  }

  const pullDetails = await loadPullContext({ github, config, window, cache });
  const association = await associatePullsToReleaseWindows({
    github,
    releases,
    windowStart: currentStart,
    windowEnd: currentEnd,
    pullDetails,
    cache,
    concurrency: config.metricsConcurrency || 8,
  });
  const rows = association.rows.filter((row) => row.release_published_at);
  const leadTimes = rows.map((row) => row.lead_time_hours);
  const caveats = caveatsForAssociation(association, releases, currentReleases, rows);

  return {
    metric: "lead_time_for_changes",
    window: {
      start: window.window_start,
      end: window.window_end,
      days: window.window_days,
    },
    state: rows.length === 0 ? "low_confidence" : "ready",
    headline: {
      value: round(percentile(leadTimes, 50)),
      unit: "hours",
      p50_hours: round(percentile(leadTimes, 50)),
      p85_hours: round(percentile(leadTimes, 85)),
      band: bandForLeadTimeHours(percentile(leadTimes, 50)),
    },
    lead_time_hours: {
      p50: round(percentile(leadTimes, 50)),
      p85: round(percentile(leadTimes, 85)),
    },
    sample_size: rows.length,
    release_count: currentReleases.length,
    data_confidence: confidenceForRows(rows, association),
    caveats,
    evidence_rows: rows.slice(0, config.evidenceLimit || 20),
    computed_at: new Date(now).toISOString(),
    rateLimit: github.rateLimit || null,
  };
}

async function calculateChangeFailureRate({
  github,
  config = {},
  now = new Date(),
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
  const releases = await loadReleaseContext({ github, config, window, cache });
  const currentReleases = releases.filter((release) =>
    isWithinWindow(release.published_at, currentStart, currentEnd)
  );

  if (currentReleases.length === 0) {
    return noReleaseMetric("change_failure_rate", window, now, github);
  }

  const pullDetails = await loadPullContext({ github, config, window, cache });
  const association = await associatePullsToReleaseWindows({
    github,
    releases,
    windowStart: currentStart,
    windowEnd: currentEnd,
    pullDetails,
    cache,
    concurrency: config.metricsConcurrency || 8,
  });
  const byReleaseId = groupRowsByRelease(association.rows);
  const releaseRows = currentReleases.map((release) => {
    const signals = detectFailureSignals({
      release,
      pullRows: byReleaseId.get(release.id) || [],
    });
    return {
      release_id: release.id,
      tag_name: release.tag_name,
      title: release.title || release.name || release.tag_name,
      published_at: release.published_at,
      html_url: release.html_url || null,
      failed: signals.failed,
      signals: signals.signals,
    };
  });
  const failed = releaseRows.filter((release) => release.failed);
  const caveats = caveatsForAssociation(association, releases, currentReleases, association.rows);
  if (association.rows.length === 0) {
    caveats.push("no_pull_requests_linked_to_releases");
  }
  caveats.push("failure detection is heuristic; labels and titles may miss incidents resolved outside PRs");

  return {
    metric: "change_failure_rate",
    window: {
      start: window.window_start,
      end: window.window_end,
      days: window.window_days,
    },
    state: caveats.length > 1 ? "low_confidence" : "ready",
    headline: {
      value: percent(failed.length, currentReleases.length),
      unit: "percent",
      failed_releases: failed.length,
      total_releases: currentReleases.length,
    },
    sample_size: currentReleases.length,
    failed_release_count: failed.length,
    data_confidence: confidenceForRows(association.rows, association),
    low_confidence_reasons: caveats,
    releases: releaseRows,
    evidence_rows: failed.slice(0, config.evidenceLimit || 20),
    computed_at: new Date(now).toISOString(),
    rateLimit: github.rateLimit || null,
  };
}

async function loadReleaseContext({ github, config, window, cache }) {
  return fetchProductionReleases({
    github,
    windowStart: new Date(window.prior_window_start),
    windowEnd: new Date(window.window_end),
    concurrency: config.metricsConcurrency || 8,
    cache,
  });
}

async function loadPullContext({ github, config, window, cache }) {
  const pulls = await loadMergedPullRequests(github, {
    windowStart: new Date(window.prior_window_start),
    windowEnd: new Date(window.window_end),
    base: config.base,
  });
  return loadPullRequestDetails(github, pulls, {
    cache,
    concurrency: config.metricsConcurrency || 8,
  });
}

async function associatePullsToReleaseWindows({
  github,
  releases,
  windowStart,
  windowEnd,
  pullDetails,
  cache = new MemoCache(),
  concurrency = 8,
} = {}) {
  const windows = buildResolvedWindows(releases)
    .filter((releaseWindow) => isWithinWindow(releaseWindow.window_end_ts, windowStart, windowEnd));
  const windowsWithCommits = await promisePool(
    windows,
    async (releaseWindow) => resolveWindowCommits({ github, releaseWindow, cache }),
    concurrency
  );
  const stats = {
    release_windows: windowsWithCommits.length,
    sha_windows: windowsWithCommits.filter((item) => item.match_quality === "sha").length,
    compare_unavailable: windowsWithCommits.filter((item) => item.match_quality !== "sha").length,
  };
  const rows = [];

  for (const detail of pullDetails || []) {
    const pull = detail.pull || {};
    const mergedAt = parseTime(pull.merged_at);
    if (mergedAt === null) continue;

    const shaCandidates = shaCandidatesForPull(detail);
    const shaMatch = windowsWithCommits.find((releaseWindow) =>
      [...shaCandidates].some((sha) => releaseWindow.commit_sha_set.has(sha))
    );
    const timeMatch =
      shaMatch ||
      windowsWithCommits.find((releaseWindow) => {
        if (releaseWindow.match_quality === "sha") return false;
        const start = parseTime(releaseWindow.window_start_ts);
        const end = parseTime(releaseWindow.window_end_ts);
        return end !== null && mergedAt <= end && (start === null || mergedAt > start);
      });
    if (!timeMatch) continue;

    const releasedAt = parseTime(timeMatch.window_end_ts);
    if (releasedAt === null || releasedAt < mergedAt) continue;

    rows.push({
      pr_number: pull.number,
      title: pull.title || "",
      html_url: pull.html_url || null,
      merged_at: new Date(mergedAt).toISOString(),
      merge_commit_sha: pull.merge_commit_sha || null,
      head_sha: pull.head?.sha || null,
      release_id: timeMatch.release_id,
      release_tag: timeMatch.tag_name,
      release_published_at: timeMatch.window_end_ts,
      match_method: shaMatch ? "sha" : "time_window",
      lead_time_hours: round((releasedAt - mergedAt) / HOURS),
      labels: normalizeLabels(pull.labels),
      commit_messages: normalizeCommitMessages(detail.commits),
    });
  }

  return {
    windows: windowsWithCommits,
    rows: rows.sort((a, b) => Date.parse(a.release_published_at) - Date.parse(b.release_published_at)),
    stats,
  };
}

function buildResolvedWindows(releases) {
  const resolved = (Array.isArray(releases) ? releases : [])
    .filter((release) => release.resolved_sha)
    .sort((a, b) => Date.parse(a.published_at) - Date.parse(b.published_at));

  return resolved.map((release, index) => {
    const previous = resolved[index - 1] || null;
    return {
      release_id: release.id,
      tag_name: release.tag_name,
      title: release.title || release.name || release.tag_name,
      html_url: release.html_url || null,
      start_sha: previous ? previous.resolved_sha : null,
      end_sha: release.resolved_sha,
      window_start_ts: previous ? previous.published_at : null,
      window_end_ts: release.published_at,
    };
  });
}

async function resolveWindowCommits({ github, releaseWindow, cache }) {
  if (!releaseWindow.start_sha) {
    return {
      ...releaseWindow,
      commit_shas: [],
      commit_sha_set: new Set(),
      match_quality: "time_window",
      match_quality_reason: "first_release_has_no_previous_sha",
    };
  }

  const key = `release-compare:${github.repoPath}:${releaseWindow.start_sha}...${releaseWindow.end_sha}`;
  const read = async () => {
    try {
      const data = await github.request(
        `/repos/${github.repoPath}/compare/${encodeURIComponent(releaseWindow.start_sha)}...${encodeURIComponent(
          releaseWindow.end_sha
        )}`
      );
      const commitShas = (Array.isArray(data.commits) ? data.commits : [])
        .map((commit) => commit.sha)
        .filter(Boolean);
      if (releaseWindow.end_sha) commitShas.push(releaseWindow.end_sha);
      return unique(commitShas);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 422) {
        return null;
      }
      throw error;
    }
  };
  const commitShas =
    cache && typeof cache.memoize === "function" ? await cache.memoize(key, read, Infinity) : await read();

  if (!commitShas) {
    return {
      ...releaseWindow,
      commit_shas: [],
      commit_sha_set: new Set(),
      match_quality: "time_window",
      match_quality_reason: "compare_unavailable",
    };
  }

  return {
    ...releaseWindow,
    commit_shas: commitShas,
    commit_sha_set: new Set(commitShas),
    match_quality: "sha",
    match_quality_reason: null,
  };
}

function detectFailureSignals({ release, pullRows }) {
  const signals = [];
  addSignal(signals, "release_title_or_tag", [release.tag_name, release.title, release.name]);

  for (const row of pullRows || []) {
    addSignal(signals, "pr_title", [row.title]);
    addSignal(signals, "pr_label", row.labels || []);
    addSignal(signals, "commit_message", row.commit_messages || []);
  }

  return {
    failed: signals.length > 0,
    signals,
  };
}

function addSignal(signals, source, values) {
  for (const value of values || []) {
    const text = String(value || "");
    if (!text || NON_FAILURE_FIX_PATTERN.test(text)) continue;
    if (FAILURE_PATTERN.test(text)) {
      signals.push({ source, value: text });
    }
  }
}

function caveatsForAssociation(association, releases, currentReleases, rows) {
  const caveats = [];
  if (releases.some((release) => !release.resolved_sha)) {
    caveats.push("some_release_tags_could_not_be_resolved");
  }
  if (association.stats.compare_unavailable > 0) {
    caveats.push("some_release_windows_used_time_fallback");
  }
  if (rows.some((row) => row.match_method === "time_window")) {
    caveats.push("some_prs_matched_by_merge_time_not_sha");
  }
  if (rows.length === 0 && currentReleases.length > 0) {
    caveats.push("no_pull_requests_linked_to_releases");
  }
  return caveats;
}

function confidenceForRows(rows, association) {
  if (!rows.length) {
    return 0;
  }
  const shaRows = rows.filter((row) => row.match_method === "sha").length;
  const windowScore = association.stats.release_windows === 0
    ? 0
    : association.stats.sha_windows / association.stats.release_windows;
  return round((shaRows / rows.length) * 0.7 + windowScore * 0.3);
}

function noReleaseMetric(metric, window, now, github) {
  return {
    metric,
    window: {
      start: window.window_start,
      end: window.window_end,
      days: window.window_days,
    },
    state: "no_releases",
    headline: {
      value: null,
      unit: metric === "change_failure_rate" ? "percent" : "hours",
    },
    sample_size: 0,
    data_confidence: 0,
    low_confidence_reasons: ["no_production_releases"],
    caveats: ["no production GitHub Releases found in the metrics window"],
    computed_at: new Date(now).toISOString(),
    rateLimit: github.rateLimit || null,
  };
}

function shaCandidatesForPull(detail) {
  const pull = detail.pull || {};
  return new Set(
    [
      pull.merge_commit_sha,
      pull.head?.sha,
      ...(Array.isArray(detail.commits) ? detail.commits.map((commit) => commit.sha) : []),
    ].filter(Boolean)
  );
}

function normalizeLabels(labels) {
  return (Array.isArray(labels) ? labels : [])
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter(Boolean)
    .map((label) => label.toLowerCase());
}

function normalizeCommitMessages(commits) {
  return (Array.isArray(commits) ? commits : [])
    .map((commit) => commit.commit?.message || commit.message)
    .filter(Boolean);
}

function groupRowsByRelease(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!groups.has(row.release_id)) groups.set(row.release_id, []);
    groups.get(row.release_id).push(row);
  }
  return groups;
}

function bandForLeadTimeHours(value) {
  if (value === null || value === undefined) return "unknown";
  if (value < 24) return "elite";
  if (value < 24 * 7) return "high";
  if (value < 24 * 30) return "medium";
  return "low";
}

function isWithinWindow(value, start, end) {
  const time = parseTime(value);
  return time !== null && time >= start.getTime() && time < end.getTime();
}

function parseTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function percent(numerator, denominator) {
  if (!denominator) return null;
  return round((numerator / denominator) * 100);
}

function round(value) {
  if (value === null || value === undefined) return null;
  return Math.round(value * 100) / 100;
}

function unique(values) {
  return [...new Set(values)];
}

module.exports = {
  associatePullsToReleaseWindows,
  bandForLeadTimeHours,
  buildResolvedWindows,
  calculateChangeFailureRate,
  calculateLeadTimeForChanges,
  detectFailureSignals,
  shaCandidatesForPull,
};
