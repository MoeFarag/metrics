const {
  loadMergedPullRequests,
  loadPullRequestDetails,
} = require("./pr-loader");
const { summarizePullRequestSize } = require("./pr-size");
const { percentile } = require("./stats");
const { startOfIsoWeek, resolveMetricsWindow } = require("./window");

const DEFAULT_WINDOW_DAYS = 90;
const FEEDBACK_BATCH_WINDOW_MS = 60 * 60 * 1000;
const REVIEW_FEEDBACK_STATES = new Set(["CHANGES_REQUESTED", "COMMENTED"]);

async function calculateReviewRoundTrips({
  github,
  config = {},
  now = new Date(),
  includePriorWindow = false,
  cache,
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
  const pulls = await loadMergedPullRequests(github, {
    windowStart: fetchStart,
    windowEnd: currentEnd,
    base: config.base,
  });
  const details = await loadPullRequestDetails(github, pulls, {
    cache,
    concurrency: config.metricsConcurrency,
  });
  const currentDetails = details.filter((detail) =>
    isWithinWindow(detail.pull?.merged_at, currentStart, currentEnd)
  );
  const priorDetails = includePriorWindow
    ? details.filter((detail) =>
        isWithinWindow(detail.pull?.merged_at, new Date(window.prior_window_start), currentStart)
      )
    : [];

  return {
    ...summarizeReviewRoundTripsDistribution(currentDetails, {
      window,
      evidenceLimit: config.evidenceLimit,
    }),
    direction: directionStatus(currentDetails, priorDetails, includePriorWindow),
    computed_at: new Date(now).toISOString(),
    rateLimit: github.rateLimit || null,
  };
}

function summarizePullRequestReviewRoundTrips(detail, options = {}) {
  const pull = detail.pull || detail;
  const authorLogin = pull.user?.login || null;
  const mergedAt = parseTime(pull.merged_at);
  const size = summarizePullRequestSize(pull, detail.files || [], options.size || {});
  const events = buildTimelineEvents(detail, { authorLogin, mergedAt });
  const feedbackBatches = batchReviewerFeedback(events, options.feedbackBatchMs);
  const authorActivity = events.filter((event) => event.actor_role === "author");
  const roundTrips = feedbackBatches.filter((batch) =>
    authorActivity.some((event) => event.at > batch.last_at && event.at <= mergedAt)
  );

  return {
    pr_number: pull.number,
    title: pull.title || "",
    html_url: pull.html_url || null,
    merged_at: pull.merged_at || null,
    author_login: authorLogin,
    review_round_trips: roundTrips.length,
    reviewer_feedback_events: events.filter((event) => event.kind === "reviewer_feedback").length,
    reviewer_feedback_batches: feedbackBatches.length,
    author_response_events: authorActivity.length,
    first_feedback_at: feedbackBatches[0]?.first_at_iso || null,
    last_feedback_at: feedbackBatches.at(-1)?.last_at_iso || null,
    counted_batch_starts: roundTrips.map((batch) => batch.first_at_iso),
    changed_lines_filtered: size.changed_lines_filtered,
    files_changed_filtered: size.files_changed_filtered,
    is_revert: size.is_revert,
    is_mechanical: size.is_mechanical,
    confidence: confidenceForPr(detail, events),
    heuristic: "reviewer feedback batches followed by author commits or author comments before merge",
  };
}

function summarizeReviewRoundTripsDistribution(details, options = {}) {
  const rows = (details || []).map((detail) => summarizePullRequestReviewRoundTrips(detail, options));
  const values = rows.map((row) => row.review_round_trips);

  return {
    metric: "review_round_trips",
    window: options.window
      ? {
          start: options.window.window_start,
          end: options.window.window_end,
          days: options.window.window_days,
        }
      : null,
    headline: {
      p50: percentile(values, 50),
      p75: percentile(values, 75),
      p90: percentile(values, 90),
      unit: "round trips per merged PR",
    },
    percentiles: {
      p50: percentile(values, 50),
      p75: percentile(values, 75),
      p90: percentile(values, 90),
    },
    trend: weeklyRoundTrips(rows),
    sample_size: rows.length,
    confidence: summarizeConfidence(rows),
    evidence_rows: evidenceRows(rows, options.evidenceLimit || 10),
    caveats: [
      "Phase one uses live GitHub API metadata only; no datastore or webhook event history is available.",
      "A round trip is counted when reviewer feedback is followed by author-side activity before merge.",
      "Reviewer comments close together are batched so one review pass does not inflate the count.",
      "Approvals without change-request/comment feedback do not count as round trips.",
      "Commit authorship can be incomplete in GitHub metadata, so post-feedback commits may be treated as author activity when no login is available.",
    ],
  };
}

function buildTimelineEvents(detail, { authorLogin, mergedAt }) {
  return [
    ...reviewEvents(detail.reviews, { authorLogin, mergedAt }),
    ...commentEvents(detail.reviewComments || detail.comments || [], {
      authorLogin,
      mergedAt,
      kind: "reviewer_feedback",
      source: "review_comment",
    }),
    ...commentEvents(detail.issueComments || [], {
      authorLogin,
      mergedAt,
      kind: "author_response",
      source: "issue_comment",
    }),
    ...commitEvents(detail.commits, { authorLogin, mergedAt }),
  ].sort((a, b) => a.at - b.at);
}

function reviewEvents(reviews, { authorLogin, mergedAt }) {
  return (Array.isArray(reviews) ? reviews : [])
    .map((review) => {
      const at = parseTime(review.submitted_at || review.created_at);
      if (at === null || at > mergedAt) return null;
      const state = String(review.state || "").toUpperCase();
      const actor = review.user?.login || null;
      const isAuthor = actor && authorLogin && actor === authorLogin;
      const body = String(review.body || "").trim();
      if (!REVIEW_FEEDBACK_STATES.has(state) || (state === "COMMENTED" && !body)) {
        return null;
      }

      return {
        at,
        at_iso: new Date(at).toISOString(),
        actor,
        actor_role: isAuthor ? "author" : "reviewer",
        kind: isAuthor ? "author_response" : "reviewer_feedback",
        source: "review",
        state,
      };
    })
    .filter(Boolean);
}

function commentEvents(comments, { authorLogin, mergedAt, kind, source }) {
  return (Array.isArray(comments) ? comments : [])
    .map((comment) => {
      const at = parseTime(comment.created_at || comment.updated_at);
      if (at === null || at > mergedAt) return null;
      const actor = comment.user?.login || null;
      const isAuthor = actor && authorLogin && actor === authorLogin;
      if ((kind === "reviewer_feedback" && isAuthor) || (kind === "author_response" && !isAuthor)) {
        return null;
      }
      return {
        at,
        at_iso: new Date(at).toISOString(),
        actor,
        actor_role: isAuthor ? "author" : "reviewer",
        kind,
        source,
        state: null,
      };
    })
    .filter(Boolean);
}

function commitEvents(commits, { authorLogin, mergedAt }) {
  return (Array.isArray(commits) ? commits : [])
    .map((commit) => {
      const at = parseTime(commit.commit?.author?.date || commit.commit?.committer?.date);
      if (at === null || at > mergedAt) return null;
      const actor = commit.author?.login || commit.committer?.login || null;
      const isAuthor = !actor || !authorLogin || actor === authorLogin;
      if (!isAuthor) return null;
      return {
        at,
        at_iso: new Date(at).toISOString(),
        actor,
        actor_role: "author",
        kind: "author_response",
        source: "commit",
        state: null,
      };
    })
    .filter(Boolean);
}

function batchReviewerFeedback(events, feedbackBatchMs = FEEDBACK_BATCH_WINDOW_MS) {
  const feedback = events.filter((event) => event.kind === "reviewer_feedback");
  const batches = [];
  for (const event of feedback) {
    const current = batches.at(-1);
    if (current && event.at - current.last_at <= feedbackBatchMs) {
      current.last_at = event.at;
      current.last_at_iso = event.at_iso;
      current.events += 1;
      current.sources.add(event.source);
      continue;
    }
    batches.push({
      first_at: event.at,
      last_at: event.at,
      first_at_iso: event.at_iso,
      last_at_iso: event.at_iso,
      events: 1,
      sources: new Set([event.source]),
    });
  }

  return batches.map((batch) => ({
    ...batch,
    sources: [...batch.sources].sort(),
  }));
}

function weeklyRoundTrips(rows) {
  const buckets = new Map();
  for (const row of rows) {
    if (!row.merged_at) continue;
    const key = startOfIsoWeek(new Date(row.merged_at)).toISOString().slice(0, 10);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row.review_round_trips);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, values]) => ({
      week_start: weekStart,
      p50: percentile(values, 50),
      p75: percentile(values, 75),
      p90: percentile(values, 90),
      n: values.length,
    }));
}

function evidenceRows(rows, limit) {
  return [...rows]
    .sort((a, b) => {
      if (b.review_round_trips !== a.review_round_trips) {
        return b.review_round_trips - a.review_round_trips;
      }
      return Date.parse(b.merged_at || 0) - Date.parse(a.merged_at || 0);
    })
    .slice(0, limit)
    .map((row) => ({
      pr_number: row.pr_number,
      title: row.title,
      html_url: row.html_url,
      merged_at: row.merged_at,
      review_round_trips: row.review_round_trips,
      reviewer_feedback_batches: row.reviewer_feedback_batches,
      author_response_events: row.author_response_events,
      first_feedback_at: row.first_feedback_at,
      last_feedback_at: row.last_feedback_at,
      confidence: row.confidence,
      is_revert: row.is_revert,
      is_mechanical: row.is_mechanical,
    }));
}

function confidenceForPr(detail, events) {
  const hasReviews = Array.isArray(detail.reviews);
  const hasCommits = Array.isArray(detail.commits);
  const hasComments = Array.isArray(detail.reviewComments) || Array.isArray(detail.comments);
  const reasons = [];
  if (!hasReviews) reasons.push("reviews_missing");
  if (!hasCommits) reasons.push("commits_missing");
  if (!hasComments) reasons.push("review_comments_not_loaded");

  let score = 0;
  if (hasReviews) score += 0.45;
  if (hasCommits) score += 0.35;
  if (hasComments) score += 0.2;
  if (events.length === 0 && hasReviews && hasCommits) score = Math.max(score, 0.7);

  return {
    score: Number(score.toFixed(2)),
    level: score > 0.8 ? "high" : score >= 0.55 ? "medium" : "low",
    reasons,
  };
}

function summarizeConfidence(rows) {
  if (rows.length === 0) {
    return {
      score: 1,
      level: "high",
      basis: "no merged PRs in window",
    };
  }
  const score = rows.reduce((sum, row) => sum + row.confidence.score, 0) / rows.length;
  return {
    score: Number(score.toFixed(4)),
    level: score > 0.8 ? "high" : score >= 0.55 ? "medium" : "low",
    basis: "average per-PR metadata coverage",
  };
}

function directionStatus(currentDetails, priorDetails, includePriorWindow) {
  if (!includePriorWindow) return "not_computed";
  if (currentDetails.length < 30 || priorDetails.length < 30) return "insufficient_data";
  const current = percentile(
    currentDetails.map((detail) => summarizePullRequestReviewRoundTrips(detail).review_round_trips),
    50
  );
  const prior = percentile(
    priorDetails.map((detail) => summarizePullRequestReviewRoundTrips(detail).review_round_trips),
    50
  );
  if (current < prior) return "improving";
  if (current > prior) return "degrading";
  return "flat";
}

function isWithinWindow(value, start, end) {
  const time = parseTime(value);
  return time !== null && time >= start.getTime() && time < end.getTime();
}

function parseTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

module.exports = {
  batchReviewerFeedback,
  buildTimelineEvents,
  calculateReviewRoundTrips,
  summarizePullRequestReviewRoundTrips,
  summarizeReviewRoundTripsDistribution,
};
