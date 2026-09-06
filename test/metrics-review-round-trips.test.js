const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calculateReviewRoundTrips,
  summarizePullRequestReviewRoundTrips,
  summarizeReviewRoundTripsDistribution,
} = require("../src/metrics/review-round-trips");

test("review round trips count feedback batches followed by author commits", () => {
  const row = summarizePullRequestReviewRoundTrips({
    pull: makePull(12, "Feature", "2026-09-05T18:00:00.000Z"),
    files: [{ filename: "src/app.js", additions: 10, deletions: 1, status: "modified" }],
    reviews: [
      review("reviewer", "CHANGES_REQUESTED", "2026-09-05T10:00:00.000Z"),
      review("reviewer", "COMMENTED", "2026-09-05T10:20:00.000Z"),
      review("reviewer", "APPROVED", "2026-09-05T17:00:00.000Z"),
    ],
    commits: [
      commit("author", "2026-09-05T09:00:00.000Z"),
      commit("author", "2026-09-05T12:00:00.000Z"),
    ],
  });

  assert.equal(row.review_round_trips, 1);
  assert.equal(row.reviewer_feedback_events, 2);
  assert.equal(row.reviewer_feedback_batches, 1);
  assert.deepEqual(row.counted_batch_starts, ["2026-09-05T10:00:00.000Z"]);
  assert.equal(row.confidence.level, "medium");
});

test("review round trips handle multiple rounds and ignore clean approvals", () => {
  const row = summarizePullRequestReviewRoundTrips({
    pull: makePull(13, "Iterate", "2026-09-05T18:00:00.000Z"),
    files: [],
    reviews: [
      review("reviewer", "CHANGES_REQUESTED", "2026-09-05T09:00:00.000Z"),
      review("reviewer", "COMMENTED", "2026-09-05T13:00:00.000Z"),
      review("reviewer", "APPROVED", "2026-09-05T17:00:00.000Z"),
    ],
    commits: [
      commit("author", "2026-09-05T10:00:00.000Z"),
      commit("author", "2026-09-05T14:00:00.000Z"),
    ],
  });

  assert.equal(row.review_round_trips, 2);
  assert.equal(row.reviewer_feedback_batches, 2);

  const approvedOnly = summarizePullRequestReviewRoundTrips({
    pull: makePull(14, "Ship", "2026-09-05T18:00:00.000Z"),
    files: [],
    reviews: [review("reviewer", "APPROVED", "2026-09-05T17:00:00.000Z")],
    commits: [commit("author", "2026-09-05T12:00:00.000Z")],
  });

  assert.equal(approvedOnly.review_round_trips, 0);
});

test("review comments improve confidence and can count as reviewer feedback", () => {
  const row = summarizePullRequestReviewRoundTrips({
    pull: makePull(15, "Commented", "2026-09-05T18:00:00.000Z"),
    files: [],
    reviews: [],
    reviewComments: [
      { user: { login: "reviewer" }, created_at: "2026-09-05T11:00:00.000Z" },
      { user: { login: "author" }, created_at: "2026-09-05T11:05:00.000Z" },
    ],
    commits: [commit("author", "2026-09-05T12:00:00.000Z")],
  });

  assert.equal(row.review_round_trips, 1);
  assert.equal(row.confidence.level, "high");
  assert.deepEqual(row.confidence.reasons, []);
});

test("review round trips distribution reports percentiles evidence and caveats", () => {
  const result = summarizeReviewRoundTripsDistribution([
    detail(1, "One", "2026-09-05T18:00:00.000Z", 0),
    detail(2, "Two", "2026-09-05T18:00:00.000Z", 1),
    detail(3, "Three", "2026-09-05T18:00:00.000Z", 3),
  ]);

  assert.equal(result.sample_size, 3);
  assert.equal(result.percentiles.p50, 1);
  assert.equal(result.percentiles.p75, 2);
  assert.equal(Math.abs(result.percentiles.p90 - 2.6) < 0.0001, true);
  assert.deepEqual(
    result.evidence_rows.map((row) => [row.pr_number, row.review_round_trips]),
    [
      [3, 3],
      [2, 1],
      [1, 0],
    ]
  );
  assert.equal(result.caveats.some((note) => note.includes("live GitHub API")), true);
});

test("calculateReviewRoundTrips loads merged PR details for the resolved window", async () => {
  const github = {
    repoPath: "owner/repo",
    config: { metricsConcurrency: 2 },
    rateLimit: { remaining: 4999 },
    async requestAllPages(path, params) {
      if (path === "/repos/owner/repo/pulls") {
        assert.equal(params.state, "closed");
        return {
          data: [
            makePull(20, "Window PR", "2026-09-05T12:00:00.000Z"),
            makePull(21, "Old PR", "2026-08-01T12:00:00.000Z"),
          ],
        };
      }
      throw new Error("unexpected request " + path);
    },
    async listPullFiles(number) {
      return { data: [{ filename: "src/" + number + ".js", additions: 1, deletions: 0 }] };
    },
    async listPullReviews() {
      return { data: [review("reviewer", "CHANGES_REQUESTED", "2026-09-05T09:00:00.000Z")] };
    },
    async listPullCommits() {
      return { data: [commit("author", "2026-09-05T10:00:00.000Z")] };
    },
  };

  const result = await calculateReviewRoundTrips({
    github,
    now: new Date("2026-09-06T00:00:00.000Z"),
    config: { window_days: 7 },
  });

  assert.equal(result.metric, "review_round_trips");
  assert.equal(result.sample_size, 1);
  assert.equal(result.headline.p50, 1);
  assert.equal(result.direction, "not_computed");
  assert.deepEqual(result.rateLimit, { remaining: 4999 });
});

function detail(prNumber, title, mergedAt, roundTrips) {
  const reviews = [];
  const commits = [];
  for (let index = 0; index < roundTrips; index += 1) {
    const hour = 8 + index * 2;
    reviews.push(review("reviewer", "CHANGES_REQUESTED", at(hour)));
    commits.push(commit("author", at(hour + 1)));
  }
  if (roundTrips === 0) {
    reviews.push(review("reviewer", "APPROVED", at(17)));
  }
  return {
    pull: makePull(prNumber, title, mergedAt),
    files: [],
    reviews,
    commits,
  };
}

function makePull(number, title, mergedAt) {
  return {
    number,
    title,
    html_url: "https://github.com/owner/repo/pull/" + number,
    merged_at: mergedAt,
    merge_commit_sha: "sha" + number,
    labels: [],
    user: { login: "author", type: "User" },
  };
}

function review(login, state, submittedAt) {
  return {
    state,
    body: state === "APPROVED" ? "" : "please update",
    submitted_at: submittedAt,
    user: { login },
  };
}

function commit(login, date) {
  return {
    author: { login },
    commit: { author: { date } },
  };
}

function at(hour) {
  return "2026-09-05T" + String(hour).padStart(2, "0") + ":00:00.000Z";
}
