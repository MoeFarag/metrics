async function promisePool(items, worker, concurrency = 8) {
  if (!Array.isArray(items)) {
    throw new TypeError("promisePool items must be an array");
  }
  if (items.length === 0) {
    return [];
  }

  const limit = Number.isFinite(concurrency) && concurrency > 0 ? Math.floor(concurrency) : 8;
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(workers);
  return results;
}

module.exports = { promisePool };
