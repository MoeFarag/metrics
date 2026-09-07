const { promisePool } = require("./concurrency");
const { percentile } = require("./stats");
const { isoWeekBuckets } = require("./window");

const DEFAULT_CONCURRENCY = 8;
const REQUIRED_CHECKS_MISSING = "needs_config";
const REQUIRED_CHECKS_CONFIGURED = "configured";
const REQUIRED_CHECKS_OBSERVED = "observed_fallback";

async function loadActionsWindow({
  github,
  config = {},
  window,
  concurrency = config.metricsConcurrency || DEFAULT_CONCURRENCY,
} = {}) {
  if (!github) {
    throw new TypeError("github wrapper is required");
  }
  if (!window?.window_start || !window?.window_end) {
    throw new TypeError("metrics window is required");
  }

  const runPage = await github.requestAllPages(`/repos/${github.repoPath}/actions/runs`, {
    event: "push",
    created: `>=${window.window_start.slice(0, 10)}`,
    per_page: 100,
  });
  const runs = extractRuns(runPage.data)
    .filter((run) => isCompletedPushRunInWindow(run, window))
    .map(normalizeRun);

  const jobsByRunId = new Map();
  const attemptsByRunId = new Map();
  const requestMeta = [runPage.meta];

  await promisePool(
    runs,
    async (run) => {
      const attemptNumbers = run.run_attempt > 1 ? range(1, run.run_attempt) : [1];
      const attempts = [];

      for (const attemptNumber of attemptNumbers) {
        const [attempt, jobsPage] = await Promise.all([
          loadAttempt(github, run, attemptNumber),
          loadAttemptJobs(github, run, attemptNumber),
        ]);
        requestMeta.push(attempt.meta, jobsPage.meta);
        attempts.push({
          ...normalizeAttempt(attempt.data, run, attemptNumber),
          jobs: extractJobs(jobsPage.data).map((job) => normalizeJob(job, run.id)),
        });
      }

      attemptsByRunId.set(run.id, attempts);
      jobsByRunId.set(run.id, attempts[0]?.jobs || []);
    },
    concurrency
  );

  return {
    runs,
    jobsByRunId,
    attemptsByRunId,
    requiredChecks: resolveRequiredChecks(config, runs, jobsByRunId),
    meta: {
      rateLimit: summarizeRateLimits(requestMeta.flatMap((meta) => meta?.rateLimits || meta?.rateLimit || [])),
      request_count: countRequests(requestMeta),
      page_count: requestMeta.reduce((sum, meta) => sum + (meta?.pageCount || 0), 0),
    },
  };
}

async function loadAttempt(github, run, attemptNumber) {
  if (attemptNumber === run.run_attempt && typeof github.getWorkflowRunAttempt !== "function") {
    return { data: run, meta: { rateLimit: github.rateLimit || null } };
  }
  if (typeof github.getWorkflowRunAttempt === "function") {
    return github.getWorkflowRunAttempt(run.id, attemptNumber);
  }
  const path = `/repos/${github.repoPath}/actions/runs/${encodeURIComponent(run.id)}/attempts/${attemptNumber}`;
  return github.requestWithMeta(path);
}

async function loadAttemptJobs(github, run, attemptNumber) {
  if (typeof github.listJobsForRunAttempt === "function") {
    return github.listJobsForRunAttempt(run.id, attemptNumber, { filter: "latest", per_page: 100 });
  }
  const path = `/repos/${github.repoPath}/actions/runs/${encodeURIComponent(run.id)}/attempts/${attemptNumber}/jobs`;
  return github.requestAllPages(path, { filter: "latest", per_page: 100 });
}

function computeTimeToSignal(actionsData, { window, config = {} } = {}) {
  const required = actionsData.requiredChecks || resolveRequiredChecks(config, actionsData.runs, actionsData.jobsByRunId);
  if (required.state === REQUIRED_CHECKS_MISSING) {
    return needsRequiredChecksResult("time_to_signal", required, actionsData, window);
  }

  const signals = buildCiSignals(actionsData.runs, actionsData.jobsByRunId, required);
  const included = signals.filter((signal) => !["superseded", "cancelled", "incomplete"].includes(signal.outcome));
  const redValues = included.map((signal) => signal.time_to_red_seconds);
  const greenValues = included.map((signal) => signal.time_to_green_seconds);
  const queueValues = included.map((signal) => signal.queue_seconds);
  const confidence = confidenceFor(signals, actionsData.runs.length);

  return {
    metric: "time_to_signal",
    state: confidence === 0 ? "insufficient_coverage" : "ok",
    headline: {
      time_to_red_p50_seconds: percentile(redValues, 50),
      time_to_green_p50_seconds: percentile(greenValues, 50),
    },
    p90_seconds: {
      red: percentile(redValues, 90),
      green: percentile(greenValues, 90),
    },
    queue_seconds: {
      p50: percentile(queueValues, 50),
      p90: percentile(queueValues, 90),
    },
    required_check_set_version: required.version,
    required_check_count: required.names.length,
    required_checks_state: required.state,
    trend: buildTimeToSignalTrend(signals, window),
    outcomes: countBy(signals, "outcome", ["red", "green", "superseded", "cancelled", "incomplete"]),
    sample_size: actionsData.runs.length,
    measured_sample_size: included.length,
    data_confidence: confidence,
    caveats: caveatsFor(required, confidence),
    evidence_rows: timeToSignalEvidence(included),
    rateLimit: actionsData.meta?.rateLimit || null,
  };
}

function computeCiReliability(actionsData, { window, config = {} } = {}) {
  const required = actionsData.requiredChecks || resolveRequiredChecks(config, actionsData.runs, actionsData.jobsByRunId);
  if (required.state === REQUIRED_CHECKS_MISSING) {
    return needsRequiredChecksResult("ci_reliability", required, actionsData, window);
  }

  const attemptsByRunId = actionsData.attemptsByRunId || buildSingleAttemptMap(actionsData.runs, actionsData.jobsByRunId);
  const groups = groupAttemptsByWorkflowAndSha(actionsData.runs, attemptsByRunId, required);
  const shaGroups = groupAttemptsBySha(actionsData.runs, attemptsByRunId, required);
  const groupValues = [...groups.values()];
  const shaValues = [...shaGroups.values()];
  const rerunGroups = groupValues.filter((group) => group.maxAttempt > 1);
  const firstPassGroups = shaValues.filter((group) => group.firstAttemptPassed);
  const confirmedFlakes = shaValues.filter((group) => group.firstAttemptFailed && group.laterAttemptPassed);
  const confidence = confidenceFromShaGroups(shaValues);

  return {
    metric: "ci_reliability",
    state: confidence === 0 && actionsData.runs.length > 0 ? "insufficient_coverage" : "ok",
    headline: {
      rerun_rate_pct: percent(rerunGroups.length, groupValues.length),
      first_attempt_pass_rate_pct: percent(firstPassGroups.length, shaValues.length),
    },
    confirmed_flake_rate_pct: percentOrNull(confirmedFlakes.length, rerunGroups.length),
    rerun_breakdown: buildRerunBreakdown(rerunGroups),
    rerun_drivers: buildRerunDrivers(shaValues),
    required_check_set_version: required.version,
    required_check_count: required.names.length,
    required_checks_state: required.state,
    trend: buildReliabilityTrend(groupValues, shaValues, window),
    sample_size: actionsData.runs.length,
    group_sample_size: groupValues.length,
    sha_sample_size: shaValues.length,
    data_confidence: confidence,
    caveats: caveatsFor(required, confidence),
    evidence_rows: ciReliabilityEvidence(shaValues),
    rateLimit: actionsData.meta?.rateLimit || null,
  };
}

function buildCiSignals(runs, jobsByRunId, required) {
  const newestByBranch = new Map();
  const sortedRuns = [...runs].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  for (const run of sortedRuns) {
    const branch = run.head_branch || "";
    if (!branch) continue;
    const runEnd = Date.parse(run.updated_at || run.created_at);
    const newer = sortedRuns.find(
      (other) =>
        other.id !== run.id &&
        other.head_branch === branch &&
        Date.parse(other.created_at) > Date.parse(run.created_at) &&
        Date.parse(other.created_at) < runEnd
    );
    if (newer) {
      newestByBranch.set(run.id, true);
    }
  }

  return sortedRuns.map((run) => {
    const allJobs = jobsByRunId.get(run.id) || [];
    const requiredJobs = filterJobsForRequiredSet(allJobs, required);
    const matchedNames = new Set(requiredJobs.map((job) => job.name));
    const allRequiredPresent = hasRequiredCoverage(required, requiredJobs, matchedNames);
    const pushAt = Date.parse(run.created_at);
    const firstStarted = minDate(requiredJobs.map((job) => job.started_at));
    const queueSeconds = secondsBetween(run.created_at, run.run_started_at || firstStarted || run.created_at);
    const failedAt = minDate(
      requiredJobs.filter((job) => job.conclusion === "failure").map((job) => job.completed_at)
    );
    const allSuccess = allRequiredPresent && requiredJobs.every((job) => job.conclusion === "success");
    const lastCompleted = maxDate(requiredJobs.map((job) => job.completed_at));

    let outcome = "incomplete";
    if (newestByBranch.has(run.id)) {
      outcome = "superseded";
    } else if (run.conclusion === "cancelled") {
      outcome = "cancelled";
    } else if (failedAt) {
      outcome = "red";
    } else if (allSuccess) {
      outcome = "green";
    }

    return {
      run_id: run.id,
      run_html_url: run.html_url,
      workflow_id: run.workflow_id,
      workflow_name: run.workflow_name,
      head_sha: run.head_sha,
      head_branch: run.head_branch,
      push_at: run.created_at,
      first_check_started_at: firstStarted,
      queue_seconds: queueSeconds,
      time_to_red_seconds: failedAt ? Math.max(0, Math.round((Date.parse(failedAt) - pushAt) / 1000)) : null,
      time_to_green_seconds: allSuccess && lastCompleted
        ? Math.max(0, Math.round((Date.parse(lastCompleted) - pushAt) / 1000))
        : null,
      required_jobs_found: requiredJobs.length,
      all_required_jobs_found: allRequiredPresent,
      outcome,
      jobs: requiredJobs.map((job) => ({
        name: job.name,
        conclusion: job.conclusion,
        html_url: job.html_url || null,
      })),
    };
  });
}

function resolveRequiredChecks(config = {}, runs = [], jobsByRunId = new Map()) {
  const names = Array.isArray(config.requiredChecks) ? config.requiredChecks.filter(Boolean) : [];
  const observed = observedJobNames(runs, jobsByRunId);
  if (names.length === 0) {
    if (observed.length > 0) {
      return {
        state: REQUIRED_CHECKS_OBSERVED,
        names: observed,
        match_observed_per_run: true,
        version: config.requiredCheckSetVersion || "observed-recent-jobs",
        observed_job_names: observed,
        required_check_count: observed.length,
      };
    }

    return {
      state: REQUIRED_CHECKS_MISSING,
      names: [],
      version: config.requiredCheckSetVersion || "unversioned",
      observed_job_names: observed,
      required_check_count: 0,
    };
  }

  return {
    state: REQUIRED_CHECKS_CONFIGURED,
    names,
    version: config.requiredCheckSetVersion || "unversioned",
    observed_job_names: observed,
    required_check_count: names.length,
  };
}

function filterRequiredJobs(jobs, requiredNames) {
  const required = new Set(requiredNames);
  return (jobs || []).filter((job) => required.has(job.name));
}

function filterJobsForRequiredSet(jobs, required) {
  return required.match_observed_per_run ? jobs || [] : filterRequiredJobs(jobs, required.names);
}

function hasRequiredCoverage(required, requiredJobs, matchedNames) {
  if (required.match_observed_per_run) {
    return requiredJobs.length > 0;
  }
  return required.names.every((name) => matchedNames.has(name));
}

function buildTimeToSignalTrend(signals, window) {
  return bucketsFor(window).map((bucket) => {
    const rows = signals.filter((signal) => inRange(signal.push_at, bucket.start, bucket.end));
    return {
      week_start: bucket.week_start,
      red_p50: percentile(rows.map((row) => row.time_to_red_seconds), 50),
      green_p50: percentile(rows.map((row) => row.time_to_green_seconds), 50),
      queue_p50: percentile(rows.map((row) => row.queue_seconds), 50),
      n: rows.length,
    };
  });
}

function buildReliabilityTrend(groupValues, shaValues, window) {
  return bucketsFor(window).map((bucket) => {
    const groups = groupValues.filter((group) => inRange(group.firstCreatedAt, bucket.start, bucket.end));
    const shas = shaValues.filter((group) => inRange(group.firstCreatedAt, bucket.start, bucket.end));
    return {
      week_start: bucket.week_start,
      rerun_pct: percent(groups.filter((group) => group.maxAttempt > 1).length, groups.length),
      first_pass_pct: percent(shas.filter((group) => group.firstAttemptPassed).length, shas.length),
      n: groups.length,
    };
  });
}

function groupAttemptsByWorkflowAndSha(runs, attemptsByRunId, required) {
  const groups = new Map();
  for (const run of runs) {
    const key = `${run.workflow_id || ""}:${run.head_sha || ""}`;
    const group = ensureGroup(groups, key, run);
    for (const attempt of attemptsByRunId.get(run.id) || []) {
      addAttemptToGroup(group, attempt, required);
    }
  }
  return groups;
}

function groupAttemptsBySha(runs, attemptsByRunId, required) {
  const groups = new Map();
  for (const run of runs) {
    const key = run.head_sha || String(run.id);
    const group = ensureGroup(groups, key, run);
    for (const attempt of attemptsByRunId.get(run.id) || []) {
      addAttemptToGroup(group, attempt, required);
    }
  }
  return groups;
}

function ensureGroup(groups, key, run) {
  if (!groups.has(key)) {
    groups.set(key, {
      key,
      workflow_id: run.workflow_id,
      head_sha: run.head_sha,
      run_html_url: run.html_url || null,
      workflow_name: run.workflow_name || null,
      firstCreatedAt: run.created_at,
      maxAttempt: 0,
      rerunKinds: [],
      firstAttemptPassed: false,
      firstAttemptFailed: false,
      laterAttemptPassed: false,
      resolvable: false,
      failedChecks: new Map(),
    });
  }
  return groups.get(key);
}

function timeToSignalEvidence(signals, limit = 10) {
  return [...signals]
    .sort((a, b) => {
      const aValue = Math.max(Number(a.time_to_green_seconds) || 0, Number(a.time_to_red_seconds) || 0);
      const bValue = Math.max(Number(b.time_to_green_seconds) || 0, Number(b.time_to_red_seconds) || 0);
      return bValue - aValue;
    })
    .slice(0, limit)
    .map((signal) => ({
      run_id: signal.run_id,
      workflow_name: signal.workflow_name,
      head_branch: signal.head_branch,
      head_sha: signal.head_sha,
      html_url: signal.run_html_url || null,
      outcome: signal.outcome,
      queue_seconds: signal.queue_seconds,
      time_to_red_seconds: signal.time_to_red_seconds,
      time_to_green_seconds: signal.time_to_green_seconds,
      jobs: signal.jobs,
    }));
}

function ciReliabilityEvidence(groups, limit = 10) {
  return [...groups]
    .sort((a, b) => {
      if (b.maxAttempt !== a.maxAttempt) return b.maxAttempt - a.maxAttempt;
      return Date.parse(b.firstCreatedAt || 0) - Date.parse(a.firstCreatedAt || 0);
    })
    .slice(0, limit)
    .map((group) => ({
      workflow_id: group.workflow_id,
      workflow_name: group.workflow_name,
      head_sha: group.head_sha,
      html_url: group.run_html_url || null,
      first_created_at: group.firstCreatedAt,
      max_attempt: group.maxAttempt,
      first_attempt_passed: group.firstAttemptPassed,
      first_attempt_failed: group.firstAttemptFailed,
      later_attempt_passed: group.laterAttemptPassed,
      failed_checks: [...group.failedChecks.keys()],
    }));
}

function addAttemptToGroup(group, attempt, required) {
  const requiredJobs = filterJobsForRequiredSet(attempt.jobs, required);
  const matchedNames = new Set(requiredJobs.map((job) => job.name));
  const allRequiredPresent = hasRequiredCoverage(required, requiredJobs, matchedNames);
  const passed = allRequiredPresent && requiredJobs.every((job) => job.conclusion === "success");
  const failed = requiredJobs.some((job) => job.conclusion === "failure");

  group.maxAttempt = Math.max(group.maxAttempt, attempt.run_attempt);
  group.resolvable = group.resolvable || allRequiredPresent;
  if (attempt.run_attempt === 1) {
    group.firstAttemptPassed = group.firstAttemptPassed || passed;
    group.firstAttemptFailed = group.firstAttemptFailed || failed;
    for (const job of requiredJobs) {
      if (job.conclusion === "failure") {
        group.failedChecks.set(job.name, (group.failedChecks.get(job.name) || 0) + 1);
      }
    }
  } else {
    if (passed) {
      group.laterAttemptPassed = true;
    }
    group.rerunKinds.push({
      actor_kind: classifyRerunActor(attempt),
      scope: requiredJobs.length > 0 && requiredJobs.length < required.names.length ? "job" : "run",
    });
  }
}

function buildRerunBreakdown(rerunGroups) {
  const breakdown = { manual: 0, automatic: 0, scope_job: 0, scope_run: 0 };
  for (const group of rerunGroups) {
    for (const kind of group.rerunKinds) {
      breakdown[kind.actor_kind] += 1;
      breakdown[`scope_${kind.scope}`] += 1;
    }
  }
  return breakdown;
}

function buildRerunDrivers(shaGroups) {
  const counts = new Map();
  for (const group of shaGroups) {
    if (!group.firstAttemptFailed || !group.laterAttemptPassed) continue;
    for (const [name, count] of group.failedChecks.entries()) {
      counts.set(name, (counts.get(name) || 0) + count);
    }
  }
  return [...counts.entries()]
    .map(([name, reruns]) => ({ name, reruns }))
    .sort((a, b) => b.reruns - a.reruns || a.name.localeCompare(b.name));
}

function buildSingleAttemptMap(runs, jobsByRunId) {
  const attempts = new Map();
  for (const run of runs) {
    attempts.set(run.id, [
      {
        run_id: run.id,
        run_attempt: 1,
        conclusion: run.conclusion,
        triggering_actor: run.triggering_actor,
        actor: run.actor,
        jobs: jobsByRunId.get(run.id) || [],
      },
    ]);
  }
  return attempts;
}

function confidenceFor(signals, totalRuns) {
  if (!totalRuns) return 0;
  return roundRatio(signals.filter((signal) => signal.all_required_jobs_found).length / totalRuns);
}

function confidenceFromShaGroups(groups) {
  if (!groups.length) return 0;
  return roundRatio(groups.filter((group) => group.resolvable).length / groups.length);
}

function caveatsFor(required, confidence) {
  const caveats = [
    "push_at_uses_workflow_run_created_at",
    "direction_not_computed",
  ];
  if (required.state === REQUIRED_CHECKS_MISSING) {
    caveats.push("required_checks_need_config");
  }
  if (required.state === REQUIRED_CHECKS_OBSERVED) {
    caveats.push("required_checks_observed_jobs_fallback");
  }
  if (confidence < 0.7) {
    caveats.push("insufficient_required_check_coverage");
  }
  return caveats;
}

function needsRequiredChecksResult(metric, required, actionsData, window) {
  return {
    metric,
    state: REQUIRED_CHECKS_MISSING,
    required_checks_state: REQUIRED_CHECKS_MISSING,
    required_check_set_version: required.version,
    required_check_count: 0,
    observed_job_names: required.observed_job_names,
    sample_size: actionsData.runs?.length || 0,
    data_confidence: 0,
    trend: bucketsFor(window).map((bucket) => ({ week_start: bucket.week_start, n: 0 })),
    caveats: caveatsFor(required, 0),
    rateLimit: actionsData.meta?.rateLimit || null,
  };
}

function summarizeRateLimits(rateLimits) {
  const cleaned = rateLimits.filter(Boolean);
  if (!cleaned.length) return null;
  return cleaned.reduce((best, current) => {
    if (best.remaining === null) return current;
    if (current.remaining === null) return best;
    return current.remaining < best.remaining ? current : best;
  }, cleaned[0]);
}

function countRequests(meta) {
  return meta.reduce((sum, item) => {
    if (!item) return sum;
    return sum + (item.pageCount || 1);
  }, 0);
}

function extractRuns(data) {
  if (Array.isArray(data)) return data;
  return data?.workflow_runs || [];
}

function extractJobs(data) {
  if (Array.isArray(data)) return data;
  return data?.jobs || [];
}

function normalizeRun(run) {
  return {
    id: run.id,
    html_url: run.html_url || null,
    workflow_id: run.workflow_id,
    workflow_name: run.name || run.workflow_name,
    head_sha: run.head_sha,
    head_branch: run.head_branch,
    run_attempt: Number.parseInt(run.run_attempt || 1, 10),
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    created_at: run.created_at,
    run_started_at: run.run_started_at,
    updated_at: run.updated_at,
    actor: run.actor || null,
    triggering_actor: run.triggering_actor || null,
  };
}

function normalizeAttempt(attempt, run, attemptNumber) {
  return {
    run_id: run.id,
    run_attempt: Number.parseInt(attempt?.run_attempt || attemptNumber, 10),
    conclusion: attempt?.conclusion || run.conclusion || null,
    status: attempt?.status || run.status || null,
    run_started_at: attempt?.run_started_at || run.run_started_at || null,
    actor: attempt?.actor || run.actor || null,
    triggering_actor: attempt?.triggering_actor || run.triggering_actor || null,
  };
}

function normalizeJob(job, runId) {
  return {
    id: job.id,
    run_id: job.run_id || runId,
    name: job.name,
    started_at: job.started_at,
    completed_at: job.completed_at,
    conclusion: job.conclusion,
    html_url: job.html_url || null,
  };
}

function isCompletedPushRunInWindow(run, window) {
  return (
    run.event === "push" &&
    run.status === "completed" &&
    inRange(run.created_at, window.window_start, window.window_end)
  );
}

function observedJobNames(runs, jobsByRunId) {
  const names = new Set();
  for (const run of runs) {
    for (const job of jobsByRunId.get(run.id) || []) {
      if (job.name) names.add(job.name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function bucketsFor(window) {
  if (!window?.window_start || !window?.window_end) return [];
  return window.iso_week_buckets || isoWeekBuckets(new Date(window.window_start), new Date(window.window_end));
}

function inRange(value, start, end) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= Date.parse(start) && time < Date.parse(end);
}

function secondsBetween(start, end) {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return null;
  }
  return Math.max(0, Math.round((endTime - startTime) / 1000));
}

function minDate(values) {
  const dates = values.filter(Boolean).sort();
  return dates[0] || null;
}

function maxDate(values) {
  const dates = values.filter(Boolean).sort();
  return dates[dates.length - 1] || null;
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function percent(numerator, denominator) {
  if (!denominator) return 0;
  return roundRatio((numerator / denominator) * 100);
}

function percentOrNull(numerator, denominator) {
  if (!denominator) return null;
  return percent(numerator, denominator);
}

function roundRatio(value) {
  return Math.round(value * 1000) / 1000;
}

function countBy(rows, key, names = []) {
  const result = Object.fromEntries(names.map((name) => [name, 0]));
  for (const row of rows) {
    const value = row[key];
    result[value] = (result[value] || 0) + 1;
  }
  return result;
}

function classifyRerunActor(attempt) {
  const actor = attempt.actor?.login || null;
  const triggering = attempt.triggering_actor?.login || null;
  return triggering && actor && triggering !== actor ? "manual" : "automatic";
}

module.exports = {
  REQUIRED_CHECKS_CONFIGURED,
  REQUIRED_CHECKS_MISSING,
  REQUIRED_CHECKS_OBSERVED,
  buildCiSignals,
  computeCiReliability,
  computeTimeToSignal,
  filterRequiredJobs,
  loadActionsWindow,
  resolveRequiredChecks,
};
