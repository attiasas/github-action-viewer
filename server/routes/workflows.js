import express from 'express';

import runsCache from '../cache/workflows.js';
import { GetUserTrackedRepositoryData } from '../utils/database.js';
import { FetchWorkflowRuns } from '../utils/github.js';

// userId_serverId_repoId
const refreshingRepositories = new Set();

const router = express.Router();

// Enum for workflow normalized status
const WorkflowStatusEnum = {
    SUCCESS: 'success',
    FAILURE: 'failure',
    PENDING: 'pending',
    RUNNING: 'running',
    CANCELLED: 'cancelled',
    ERROR: 'error',
    NO_RUNS: 'no_runs',
};
// Enum for normalized status values of branch and repository
const NormalizedStatusEnum = {
    SUCCESS: 'success',
    FAILURE: 'failure',
    PENDING: 'pending',
    RUNNING: 'running',
    ERROR: 'error',
    UNKNOWN: 'unknown' // no runs / cancelled
}

export class RepositoryStatus {
    constructor(id, name, url) {
        this.id = id;
        this.name = name;
        this.url = url;
        this.branches = {};

        this.status = NormalizedStatusEnum.UNKNOWN;
        this.overall = { success: 0, failure: 0, pending: 0, cancelled: 0, running: 0 };

        this.hasPermissionError = false; // true if any branch has permission error
        this.hasError = false; // true if any branch has error
    }
}

export class BranchStatus {
    constructor(name) {
        this.name = name;
        this.workflows = {};

        this.status = NormalizedStatusEnum.UNKNOWN;
        this.overall = { success: 0, failure: 0, pending: 0, cancelled: 0, running: 0 };
    }
}

export class WorkflowStatus {
    constructor(name, runNumber, commit, status, conclusion, createdAt, url) {
        // GitHub workflow properties
        this.name = name;
        this.runNumber = runNumber;
        this.commit = commit;
        this.status = status;
        this.normalizeStatus = normalizeWorkflowStatus(status);
        this.conclusion = conclusion;
        this.createdAt = createdAt;
        this.url = url;
    }
}

// add middleware to fetch repository data
router.use('/:userId/:repoId', async (req, res, next) => {
    const { userId, repoId } = req.params;
    try {
        const repository = await GetUserTrackedRepositoryData(userId, repoId);
        if (!repository) {
            console.warn(`⚠️ [${req.requestId}] Repository not found for user ${userId} and repo ${repoId}`);
            return res.status(404).json({ error: 'Repository not found' });
        }
        req.repository = repository; // attach repository data to request
        next();
    } catch (error) {
        console.error(`❌ [${req.requestId}] Error fetching repository data:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/refresh/:userId/:repoId', async (req, res) => {
    const { userId, repoId } = req.params;
    console.log(`🔄 [${req.requestId}] Refreshing workflows for ${userId}/${repoId}`);
    try {
        // Check if repository is already being refreshed
        const cacheKey = `${userId}_${req.repository.serverId}_${repoId}`;
        if (refreshingRepositories.has(cacheKey)) {
            console.warn(`⚠️ [${req.requestId}] Repository is already being refreshed: ${cacheKey}`);
            return res.status(202).json({ error: 'Repository is already being refreshed' });
        }
        // Add to refreshing set
        refreshingRepositories.add(cacheKey);
        // Fetch workflows runs from GitHub
        for (const branch of req.repository.trackedBranches) {
            for (const workflow of req.repository.trackedWorkflows) {
                try {
                    const runs = await FetchWorkflowRuns(
                        req.repository.serverUrl,
                        req.repository.apiToken,
                        req.repository.repositoryName,
                        branch,
                        workflow
                    );
                    // Update cache with fetched runs
                    runsCache.updateRuns({
                        gitServer: req.repository.serverUrl,
                        repository: req.repository.repositoryName,
                        branch,
                        workflow,
                        runs
                    });
                } catch (error) {
                    console.error(`❌ [${req.requestId}] Error fetching runs for ${req.repository.repositoryName}/${branch}/${workflow}:`, error);
                    // Update cache with error status
                    runsCache.updateError({
                        gitServer: req.repository.serverUrl,
                        repository: req.repository.repositoryName,
                        branch,
                        workflow,
                        error: error.message || 'Unknown error'
                    });
                }
            }
        }
        console.log(`✅ [${req.requestId}] Workflows refreshed`);
        res.status(200).json(getRepositoryStatusFromCache(req.repository));
    } catch (error) {
        console.error(`❌ [${req.requestId}] Error refreshing workflows:`, error);
        res.status(500).json({ error: 'Failed to refresh workflows' });
    } finally {
        refreshingRepositories.delete(cacheKey);
    }
});

router.get('/status/:userId/:repoId', async (req, res) => {
    const { userId, repoId } = req.params;
    const { allowCache } = req.query;
    console.log(`🔍 [${req.requestId}] Fetching repository status for ${userId}/${repoId} (ignore refresh = ${allowCache})`);
    try {
        // Check if repository is being refreshed
        const cacheKey = `${userId}_${req.repository.serverId}_${repoId}`;
        if (refreshingRepositories.has(cacheKey)) {
            if (allowCache === 'true') {
                console.log(`ℹ️ [${req.requestId}] Returning cached status while refreshing`);
                return res.status(200).json(getRepositoryStatusFromCache(req.repository));
            }
            console.warn(`⚠️ [${req.requestId}] Repository is currently being refreshed: ${cacheKey}`);
            return res.status(202).json({ error: 'Repository is currently being refreshed' });
        }
        console.log(`✅ [${req.requestId}] Fetched repository data`);
        res.status(200).json(getRepositoryStatusFromCache(req.repository));
    } catch (error) {
        console.error(`❌ [${req.requestId}] Error fetching repository status:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

function getRepositoryStatusFromCache(trackedRepository) {
    const repositoryStatus = new RepositoryStatus(trackedRepository.id, trackedRepository.name, trackedRepository.repository_url);
    for (const branch of trackedRepository.tracked_branches) {
        repositoryStatus.branches[branch] = new BranchStatus(branch);
        let branchHasError = false;
        for (const workflow of trackedRepository.tracked_workflows) {
            cacheItem = runsCache.getLatestRun({
                gitServer: trackedRepository.serverUrl,
                repository: trackedRepository.name,
                branch,
                workflow
            });
            if (!cacheItem || !cacheItem.data || cacheItem.data.length === 0) {
                // If no runs found for this workflow yet, create a placeholder
                repositoryStatus.branches[branch].workflows[workflow] = new WorkflowStatus(
                    workflow,
                    -1,
                    null,
                    WorkflowStatusEnum.NO_RUNS,
                    null,
                    null,
                    null
                );
            } else {
                repositoryStatus.branches[branch].workflows[workflow] = cacheItem.data;
            }
            if (cacheItem && cacheItem.error) {
                branchHasError = true;
                repositoryStatus.hasError = true;
                if (cacheItem.error.includes('Access denied') || cacheItem.error.includes('not found')) {
                    repositoryStatus.hasPermissionError = true;
                }
            }
            // Update overall status and counts
            const workflowStatus = repositoryStatus.branches[branch].workflows[workflow];
            switch (workflowStatus.normalizeStatus) {
                case WorkflowStatusEnum.SUCCESS:
                    repositoryStatus.branches[branch].overall.success++;
                    repositoryStatus.overall.success++;
                    break;
                case WorkflowStatusEnum.FAILURE:
                    repositoryStatus.branches[branch].overall.failure++;
                    repositoryStatus.overall.failure++;
                    break;
                case WorkflowStatusEnum.PENDING:
                    repositoryStatus.branches[branch].overall.pending++;
                    repositoryStatus.overall.pending++;
                    break;
                case WorkflowStatusEnum.RUNNING:
                    repositoryStatus.branches[branch].overall.running++;
                    repositoryStatus.overall.running++;
                    break;
                case WorkflowStatusEnum.CANCELLED:
                    repositoryStatus.branches[branch].overall.cancelled++;
                    repositoryStatus.overall.cancelled++;
                    break;
                default:
                    // No runs / error
                    break;
            }
        }
        repositoryStatus.branches[branch].status = getFinalStatus(repositoryStatus.branches[branch].overall, branchHasError);
    }
    repositoryStatus.status = getFinalStatus(repositoryStatus.overall, repositoryStatus.hasError);
    return repositoryStatus;
}

function normalizeWorkflowStatus(status) {
    return status === WorkflowStatusEnum.SUCCESS ? WorkflowStatusEnum.SUCCESS
              : status === WorkflowStatusEnum.FAILURE ? WorkflowStatusEnum.FAILURE
              : status === WorkflowStatusEnum.CANCELLED ? WorkflowStatusEnum.CANCELLED
              : status === 'in_progress' ? WorkflowStatusEnum.RUNNING
              : WorkflowStatusEnum.PENDING;
}

function getFinalStatus(overall, hasError) {
    if (hasError) {
      return NormalizedStatusEnum.ERROR;
    }
    if (overall.failure > 0) {
      return NormalizedStatusEnum.FAILURE;
    }
    if (overall.pending > 0) {
      return NormalizedStatusEnum.PENDING;
    }
    if (overall.running > 0) {
      return NormalizedStatusEnum.RUNNING;
    }
    if (overall.success > 0) {
      return NormalizedStatusEnum.SUCCESS;
    }
    return NormalizedStatusEnum.UNKNOWN;
}

export default router;
