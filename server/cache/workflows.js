
export class CachedItem {
  constructor(data) {
    this.data = data;
    this.timestamp = Date.now();
    this.error = null; // error related to data if any
  }
}

class WorkflowRunsCache {
  constructor(maxRunsPerWorkflow = 200) {
    this.cache = new Map(); // gitServer -> repo -> branch -> workflow -> runs[]
    this.maxRunsPerWorkflow = maxRunsPerWorkflow;
  }

  // Allow updating maxRunsPerWorkflow at runtime
  setMaxRunsPerWorkflow(newMax) {
    if (typeof newMax === 'number' && newMax > 0) {
      this.maxRunsPerWorkflow = newMax;
    }
  }

  // Helper to get or create nested map structure
  _getOrCreate(map, key) {
    if (!map.has(key)) map.set(key, new Map());
    return map.get(key);
  }

  // Check if a workflow runs entry exists in the cache
  hasEntry({
    gitServer,
    repository,
    branch,
    workflow,
    noError = false // if true, ignore error state
  }) {
    let repoMap = this.cache.get(gitServer);
    if (!repoMap) return false;
    let branchMap = repoMap.get(repository);
    if (!branchMap) return false;
    let workflowMap = branchMap.get(branch);
    if (!workflowMap) return false;
    let item = workflowMap.get(workflow);
    if (!item || (noError && item.error)) return false;
    return true;
  }

  // Add or update runs related error for a workflow
  updateError({
    gitServer,
    repository,
    branch,
    workflow,
    error
  }) {
    let repoMap = this._getOrCreate(this.cache, gitServer);
    let branchMap = this._getOrCreate(repoMap, repository);
    let workflowMap = this._getOrCreate(branchMap, branch);
    let item = workflowMap.get(workflow);
    if (item) {
      item.error = error;
      item.timestamp = Date.now();
    } else {
      item = new CachedItem(null);
      item.error = error;
      workflowMap.set(workflow, item);
    }
  }

  // Add or update runs for a workflow
  updateRuns({
    gitServer,
    repository,
    branch,
    workflow,
    runs, // array of run objects (from GitHub API)
  }) {
    let repoMap = this._getOrCreate(this.cache, gitServer);
    let branchMap = this._getOrCreate(repoMap, repository);
    let workflowMap = this._getOrCreate(branchMap, branch);
    // Always keep only the latest X runs (sorted by created_at desc)
    let sortedRuns = [...runs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    let item = new CachedItem(sortedRuns.slice(0, this.maxRunsPerWorkflow));
    workflowMap.set(workflow, item);
  }

  // Get latest X runs for a workflow
  getLatestRuns({
    gitServer,
    repository,
    branch,
    workflow,
    count = this.maxRunsPerWorkflow
  }) {
    let repoMap = this.cache.get(gitServer);
    if (!repoMap) return [];
    let branchMap = repoMap.get(repository);
    if (!branchMap) return [];
    let workflowMap = branchMap.get(branch);
    if (!workflowMap) return [];
    let runs = workflowMap.get(workflow) || [];
    if (runs.data && runs.data.repository && runs.data.repository.trackedWorkflows) {
        runs.data = runs.data.repository.trackedWorkflows.slice(0, count);
    }
    return runs
  }

  // Get the latest run for a workflow
  getLatestRun(params) {
    return this.getLatestRuns({ ...params, count: 1 });
  }

  // Clear cache (for testing or reset)
  clear() {
    this.cache = new Map();
  }

}

// Singleton map: userId -> WorkflowRunsCache
const userWorkflowRunsCaches = new Map();

// Helper to get or create a WorkflowRunsCache for a userId
function getUserWorkflowRunsCache(userId, maxRunsPerWorkflow = 200) {
  if (!userWorkflowRunsCaches.has(userId)) {
    userWorkflowRunsCaches.set(userId, new WorkflowRunsCache(maxRunsPerWorkflow));
  } 
  const existingCache = userWorkflowRunsCaches.get(userId);
  if (maxRunsPerWorkflow !== existingCache.maxRunsPerWorkflow) {
    existingCache.setMaxRunsPerWorkflow(maxRunsPerWorkflow);
  }
  return existingCache;
}

export { getUserWorkflowRunsCache };
