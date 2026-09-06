const assert = require("node:assert/strict");
const test = require("node:test");
const {
  computeCiReliability,
  computeTimeToSignal,
  resolveRequiredChecks,
} = require("../src/metrics/actions");
const { resolveMetricsWindow } = require("../src/metrics/window");

test("Actions metrics use observed jobs as a prototype fallback when required checks are unconfigured", () => {
  const window = resolveMetricsWindow({ metricsWindowDays: 60 }, new Date("2026-09-06T00:00:00.000Z"));
  const runs = [
    run(1, "build", "sha-a", "2026-09-01T10:00:00.000Z", "success"),
    run(2, "test", "sha-b", "2026-09-02T10:00:00.000Z", "failure"),
    run(3, "build", "sha-c", "2026-09-03T10:00:00.000Z", "success", 2),
  ];
  const jobsByRunId = new Map([
    [1, [job("build", "2026-09-01T10:01:00.000Z", "2026-09-01T10:04:00.000Z", "success")]],
    [2, [job("test", "2026-09-02T10:02:00.000Z", "2026-09-02T10:03:00.000Z", "failure")]],
    [3, [job("build", "2026-09-03T10:01:00.000Z", "2026-09-03T10:02:00.000Z", "success")]],
  ]);
  const attemptsByRunId = new Map([
    [1, [attempt(1, "success", jobsByRunId.get(1))]],
    [2, [attempt(1, "failure", jobsByRunId.get(2))]],
    [
      3,
      [
        attempt(1, "failure", [job("build", "2026-09-03T10:01:00.000Z", "2026-09-03T10:02:00.000Z", "failure")]),
        attempt(2, "success", jobsByRunId.get(3)),
      ],
    ],
  ]);
  const requiredChecks = resolveRequiredChecks({}, runs, jobsByRunId);
  const actionsData = {
    runs,
    jobsByRunId,
    attemptsByRunId,
    requiredChecks,
    meta: {},
  };

  assert.equal(requiredChecks.state, "observed_fallback");
  assert.deepEqual(requiredChecks.names, ["build", "test"]);

  const signal = computeTimeToSignal(actionsData, { window });
  assert.equal(signal.state, "ok");
  assert.equal(signal.required_checks_state, "observed_fallback");
  assert.equal(signal.measured_sample_size, 3);
  assert.equal(signal.caveats.includes("required_checks_observed_jobs_fallback"), true);

  const reliability = computeCiReliability(actionsData, { window });
  assert.equal(reliability.state, "ok");
  assert.equal(reliability.required_checks_state, "observed_fallback");
  assert.equal(reliability.headline.first_attempt_pass_rate_pct, 33.333);
  assert.equal(reliability.headline.rerun_rate_pct, 33.333);
});

function run(id, workflowName, sha, createdAt, conclusion, runAttempt = 1) {
  return {
    id,
    workflow_id: workflowName,
    workflow_name: workflowName,
    head_sha: sha,
    head_branch: "main",
    run_attempt: runAttempt,
    event: "push",
    status: "completed",
    conclusion,
    created_at: createdAt,
    run_started_at: createdAt,
    updated_at: new Date(Date.parse(createdAt) + 5 * 60 * 1000).toISOString(),
    actor: { login: "bot" },
    triggering_actor: { login: "bot" },
  };
}

function attempt(runAttempt, conclusion, jobs) {
  return {
    run_attempt: runAttempt,
    conclusion,
    actor: { login: "bot" },
    triggering_actor: { login: "bot" },
    jobs,
  };
}

function job(name, startedAt, completedAt, conclusion) {
  return {
    id: name + startedAt,
    name,
    started_at: startedAt,
    completed_at: completedAt,
    conclusion,
  };
}
