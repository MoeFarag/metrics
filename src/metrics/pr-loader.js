const { promisePool } = require("./concurrency");

function normalizeWindow({ windowStart, windowEnd } = {}) {
  const start = windowStart ? new Date(windowStart) : new Date(0);
  const end = windowEnd ? new Date(windowEnd) : new Date();

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new TypeError("windowStart and windowEnd must be valid dates");
  }

  return { start, end };
}

async function loadMergedPullRequests(github, options = {}) {
  const { start, end } = normalizeWindow(options);
  const params = {
    state: "closed",
    sort: "updated",
    direction: "desc",
    base: options.base || undefined,
  };
  const result = await github.requestAllPages(`/repos/${github.repoPath}/pulls`, params);
  const pulls = Array.isArray(result.data) ? result.data : [];

  return pulls
    .filter((pull) => pull && pull.merged_at)
    .filter((pull) => {
      const mergedAt = new Date(pull.merged_at);
      return mergedAt >= start && mergedAt < end;
    })
    .sort((a, b) => new Date(a.merged_at) - new Date(b.merged_at));
}

async function loadPullRequestDetails(github, pulls, options = {}) {
  const concurrency = options.concurrency || github.config?.metricsConcurrency || 8;

  return promisePool(
    pulls,
    async (pull) => {
      const [files, reviews, commits] = await Promise.all([
        loadCachedPullFiles(github, pull, options),
        loadCachedPullReviews(github, pull, options),
        loadCachedPullCommits(github, pull, options),
      ]);

      return { pull, files, reviews, commits };
    },
    concurrency
  );
}

async function loadCachedPullFiles(github, pull, options = {}) {
  return loadCachedPullResource(github, pull, "files", () => github.listPullFiles(pull.number), options);
}

async function loadCachedPullReviews(github, pull, options = {}) {
  return loadCachedPullResource(
    github,
    pull,
    "reviews",
    () => github.listPullReviews(pull.number),
    options
  );
}

async function loadCachedPullCommits(github, pull, options = {}) {
  return loadCachedPullResource(
    github,
    pull,
    "commits",
    () => github.listPullCommits(pull.number),
    options
  );
}

async function loadCachedPullResource(github, pull, kind, load, { cache } = {}) {
  const key = `pull:${pull.number}:${pull.merge_commit_sha || "unmerged"}:${kind}`;
  const read = async () => {
    const result = await load();
    return Array.isArray(result.data) ? result.data : [];
  };

  return cache && typeof cache.memoize === "function" ? cache.memoize(key, read, Infinity) : read();
}

module.exports = {
  loadCachedPullCommits,
  loadCachedPullFiles,
  loadCachedPullReviews,
  loadMergedPullRequests,
  loadPullRequestDetails,
  normalizeWindow,
};
