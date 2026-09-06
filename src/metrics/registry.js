const METRICS = [
  {
    id: "m1",
    name: "Deployment Frequency",
    family: "DORA",
    pair: null,
    question: "How often do changes reach production?",
  },
  {
    id: "m2",
    name: "Lead Time for Changes",
    family: "DORA",
    pair: null,
    question: "How long does a PR take to reach production?",
  },
  {
    id: "m3",
    name: "Change Failure Rate",
    family: "DORA",
    pair: null,
    question: "How often do production changes need remediation?",
  },
  {
    id: "m4",
    name: "PR Size Distribution",
    family: "Flow",
    pair: "m5",
    question: "Are changes small enough to review well?",
  },
  {
    id: "m5",
    name: "Review Round Trips",
    family: "Collaboration",
    pair: "m4",
    question: "How much back-and-forth happens after review?",
  },
  {
    id: "m6",
    name: "Time to Signal",
    family: "CI Platform",
    pair: "m7",
    question: "How quickly does CI give useful feedback?",
  },
  {
    id: "m7",
    name: "Rerun Rate & First-Attempt Pass Rate",
    family: "CI Platform",
    pair: "m6",
    question: "How stable is the required check path?",
  },
];

function getMetricRegistry() {
  return METRICS.map((metric) => ({ ...metric }));
}

function getSharedLimitations() {
  return [
    "Production deploys are GitHub Releases. If no qualifying releases are detected, DORA release metrics show a no-release state instead of zeros.",
    "Change-failure signals look for labels or terms matching hotfix, incident, bug, and revert, plus explicit Git revert commits where detectable.",
    "Phase one uses live GitHub API reads only. There is no datastore, webhook ingestion, or historical snapshot.",
    "Direction compares the current 90-day analysis window with the prior 90 days; prior-window comparison queries up to 180 days.",
    "Required-check metrics use configured branch-protection checks when supplied; otherwise the prototype falls back to observed Actions jobs and marks that caveat.",
  ];
}

module.exports = {
  getMetricRegistry,
  getSharedLimitations,
};
