const { percentile } = require("./stats");
const { startOfIsoWeek } = require("./window");

const DEFAULT_EXCLUSION_GLOBS = [
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/Gemfile.lock",
  "**/poetry.lock",
  "**/go.sum",
  "**/Cargo.lock",
  "**/*.pb.go",
  "**/*_pb2.py",
  "**/generated/**",
  "**/__generated__/**",
  "**/vendor/**",
  "**/node_modules/**",
  "**/__snapshots__/**",
  "**/*.snap",
];

const DEFAULT_RULESET_VERSION = "2026-09-06.1";
const DEFAULT_LARGE_CHANGE_THRESHOLD = 400;

function summarizePullRequestSize(pull, files, options = {}) {
  const exclusionGlobs = options.exclusionGlobs || DEFAULT_EXCLUSION_GLOBS;
  const exclusionRulesetVersion = options.exclusionRulesetVersion || DEFAULT_RULESET_VERSION;
  const labels = normalizeLabels(pull.labels);
  let additionsRaw = 0;
  let deletionsRaw = 0;
  let additionsFiltered = 0;
  let deletionsFiltered = 0;
  let filesChangedFiltered = 0;
  let excludedFiles = 0;

  for (const file of files || []) {
    const additions = safeNumber(file.additions);
    const deletions = safeNumber(file.deletions);
    additionsRaw += additions;
    deletionsRaw += deletions;

    if (matchesAnyGlob(file.filename || "", exclusionGlobs)) {
      excludedFiles += 1;
      continue;
    }

    filesChangedFiltered += 1;
    if (file.status === "renamed") {
      continue;
    }

    additionsFiltered += additions;
    deletionsFiltered += deletions;
  }

  return {
    pr_number: pull.number,
    title: pull.title || "",
    html_url: pull.html_url || null,
    merged_at: pull.merged_at || null,
    merge_commit_sha: pull.merge_commit_sha || null,
    author_login: pull.user?.login || null,
    author_type: pull.user?.type || null,
    additions_raw: additionsRaw,
    deletions_raw: deletionsRaw,
    changed_lines_raw: additionsRaw + deletionsRaw,
    additions_filtered: additionsFiltered,
    deletions_filtered: deletionsFiltered,
    changed_lines_filtered: additionsFiltered + deletionsFiltered,
    files_changed_filtered: filesChangedFiltered,
    files_total: Array.isArray(files) ? files.length : 0,
    files_excluded: excludedFiles,
    is_revert: isRevertPull(pull),
    is_mechanical: isMechanicalPull(pull, labels, {
      additionsRaw,
      deletionsRaw,
      additionsFiltered,
      deletionsFiltered,
    }),
    mechanical_reason: mechanicalReason(
      pull,
      labels,
      additionsRaw + deletionsRaw,
      additionsFiltered + deletionsFiltered
    ),
    exclusion_ruleset_version: exclusionRulesetVersion,
  };
}

function summarizePrSizeDistribution(sizeRows, options = {}) {
  const threshold = options.largeChangeThreshold || DEFAULT_LARGE_CHANGE_THRESHOLD;
  const totalMerged = options.totalMerged ?? sizeRows.length;
  const rowsWithData = sizeRows.filter((row) => row.files_total > 0 || row.changed_lines_raw === 0);
  const included = sizeRows.filter((row) => !row.is_revert);
  const sizes = included.map((row) => row.changed_lines_filtered);
  const largeRows = included.filter((row) => row.changed_lines_filtered > threshold);

  return {
    metric: "pr_size_distribution",
    headline: {
      large_change_share_pct: percent(included.length ? largeRows.length / included.length : null),
      threshold_lines: threshold,
    },
    percentiles_lines: {
      p50: percentile(sizes, 50),
      p75: percentile(sizes, 75),
      p90: percentile(sizes, 90),
    },
    trend: weeklyPercentiles(included),
    excluded: {
      reverts: sizeRows.filter((row) => row.is_revert).length,
      mechanical_tagged: sizeRows.filter((row) => row.is_mechanical).length,
    },
    exclusion_ruleset_version: options.exclusionRulesetVersion || DEFAULT_RULESET_VERSION,
    sample_size: included.length,
    data_confidence: totalMerged === 0 ? 1 : rowsWithData.length / totalMerged,
    evidence_rows: largeRows
      .sort((a, b) => b.changed_lines_filtered - a.changed_lines_filtered)
      .slice(0, options.evidenceLimit || 10)
      .map((row) => ({
        pr_number: row.pr_number,
        title: row.title,
        html_url: row.html_url,
        changed_lines_filtered: row.changed_lines_filtered,
        changed_lines_raw: row.changed_lines_raw,
        files_changed_filtered: row.files_changed_filtered,
        is_mechanical: row.is_mechanical,
      })),
    notes: [
      "Revert PRs are excluded from percentiles and counted separately.",
      "Mechanical PRs are flagged by label/title or only-excluded-path heuristics and remain filterable, but are not excluded.",
    ],
  };
}

function weeklyPercentiles(rows) {
  const buckets = new Map();
  for (const row of rows) {
    if (!row.merged_at) continue;
    const key = startOfIsoWeek(new Date(row.merged_at)).toISOString().slice(0, 10);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row.changed_lines_filtered);
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

function normalizeLabels(labels) {
  return (Array.isArray(labels) ? labels : [])
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter(Boolean)
    .map((label) => label.toLowerCase());
}

function isRevertPull(pull) {
  return /^Revert "/.test(pull.title || "");
}

function isMechanicalPull(pull, labels, totals) {
  const title = String(pull.title || "").toLowerCase();
  if (labels.some((label) => /^(mechanical|dependencies|dependency|formatting|lint|renovate|dependabot)$/.test(label))) {
    return true;
  }
  if (/\b(dependabot|renovate|dependency|dependencies|format|prettier|lint)\b/.test(title)) {
    return true;
  }

  const raw = totals.additionsRaw + totals.deletionsRaw;
  const filtered = totals.additionsFiltered + totals.deletionsFiltered;
  return raw > 0 && filtered === 0;
}

function mechanicalReason(pull, labels, rawLines, filteredLines) {
  const title = String(pull.title || "").toLowerCase();
  if (labels.some((label) => /^(mechanical|dependencies|dependency|formatting|lint|renovate|dependabot)$/.test(label))) {
    return "mechanical_label";
  }
  if (/\b(dependabot|renovate|dependency|dependencies)\b/.test(title)) {
    return "dependency_title";
  }
  if (/\b(format|prettier|lint)\b/.test(title)) {
    return "format_lint_title";
  }
  if (rawLines > 0 && filteredLines === 0) {
    return "only_excluded_paths";
  }
  return null;
}

function matchesAnyGlob(path, globs) {
  return globs.some((glob) => globToRegExp(glob).test(path));
}

function globToRegExp(glob) {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    const afterNext = glob[index + 2];

    if (char === "*" && next === "*" && afterNext === "/") {
      source += "(?:.*/)?";
      index += 2;
    } else if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp("^" + source + "$");
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function percent(value) {
  return value === null ? null : value * 100;
}

module.exports = {
  DEFAULT_EXCLUSION_GLOBS,
  DEFAULT_LARGE_CHANGE_THRESHOLD,
  DEFAULT_RULESET_VERSION,
  escapeRegExp,
  globToRegExp,
  matchesAnyGlob,
  summarizePrSizeDistribution,
  summarizePullRequestSize,
};
