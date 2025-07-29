import express from 'express';

import { getUserWorkflowRunsCache } from '../cache/workflows.js';
import { GetUserById, GetUserTrackedRepositoryData } from '../utils/database.js';
import {FetchRepositoryWorkflows, FetchWorkflowRuns } from '../utils/github.js';

// userId_serverId_repoId
export const refreshingRepositories = new Set();

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
    constructor({
        name,
        runId,
        runNumber,
        event,
        commit,
        status,
        conclusion,
        createdAt,
        updatedAt,
        runStartedAt,
        runAttempt,
        url,
        workflow_id,
        workflow_path
    }) {
        this.name = name;
        this.runId = runId;
        this.runNumber = runNumber;
        this.event = event;
        this.commit = commit;
        this.status = status;
        this.normalizeStatus = normalizeWorkflowStatus(conclusion, status);
        this.conclusion = conclusion;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.runStartedAt = runStartedAt;
        this.runAttempt = runAttempt;
        this.url = url;
        this.workflow_id = workflow_id;
        this.workflow_path = workflow_path;
    }
}

// add middleware to fetch repository data
router.use('*/:userId/:repoId', async (req, res, next) => {
    const { userId, repoId } = req.params;
    try {
        const tracked = await GetUserTrackedRepositoryData(userId, repoId);
        if (!tracked) {
            console.warn(`⚠️ [${req.requestId}] Repository not found for user ${userId} and repo ${repoId}`);
            return res.status(404).json({ error: 'Repository not found' });
        }
        // Get all workflows for the repository
        let allWorkflows = await FetchRepositoryWorkflows(tracked.serverUrl, tracked.apiToken, tracked.repository.name);
        // Attach allWorkflows to tracked for downstream use
        tracked.allWorkflows = allWorkflows;
        // Match tracked workflows paths to ids
        tracked.repository.trackedWorkflows = tracked.repository.trackedWorkflowsPaths.map(path => {
            const matched = allWorkflows.find(workflow => workflow.path.includes(path) || workflow.name === path);
            if (!matched) {
                console.warn(`⚠️ [${req.requestId}] Workflow path ${path} not found in repository ${tracked.repository.name}`);
            }
            return matched ? matched.id : null;
        });
        req.tracked = tracked; // attach repository data to request
        next();
    } catch (error) {
        console.error(`❌ [${req.requestId}] Error fetching repository data:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/refresh/:userId/:repoId', async (req, res) => {
    const userIdRefresh = req.params.userId;
    const repoIdRefresh = req.params.repoId;
    const forceFull = req.query.force === 'true';
    console.log(`🔄 [${req.requestId}] Refreshing workflows for ${userIdRefresh}/${repoIdRefresh} (forceFull=${forceFull})`);
    // Check if repository is already being refreshed
    const cacheKey = `${userIdRefresh}_${req.tracked.serverId}_${repoIdRefresh}`;
    try {
        if (refreshingRepositories.has(cacheKey)) {
            console.info(`ℹ️ [${req.requestId}] Repository is already being refreshed: ${cacheKey}`);
            return res.status(202).json({ error: 'Repository is already being refreshed' });
        }
        // Add to refreshing set
        refreshingRepositories.add(cacheKey);
        // Get the user's workflow runs cache
        const userInfo = await GetUserById(userIdRefresh);
        if (!userInfo) {
            console.warn(`⚠️ [${req.requestId}] User not found: ${userIdRefresh}`);
            return res.status(404).json({ error: 'User not found' });
        }
        console.log(`[${req.requestId}] User info found:`, userInfo);
        const runsCacheRefresh = getUserWorkflowRunsCache(userIdRefresh, userInfo.runRetention);
        // Check cache for existing runs
        let fetchCount = 10;
        if (forceFull || runsCacheRefresh.size() === 0) {
            fetchCount = userInfo.runRetention;
        }
        // Fetch workflows runs from GitHub
        for (const branch of req.tracked.repository.trackedBranches) {
            for (const workflow of req.tracked.repository.trackedWorkflows) {
                try {
                    const runs = await FetchWorkflowRuns(
                        req.tracked.serverUrl,
                        req.tracked.apiToken,
                        req.tracked.repository.name,
                        branch,
                        workflow,
                        fetchCount
                    );
                    console.log(`[${req.requestId}] Fetched ${runs.length} (fetchCount=${fetchCount}) runs for ${req.tracked.repository.name}/${branch}/${workflow}`);
                    // Update cache with fetched runs
                    runsCacheRefresh.updateRuns({
                        gitServer: req.tracked.serverUrl,
                        repository: req.tracked.repository.name,
                        branch,
                        workflow,
                        runs
                    });
                } catch (error) {
                    console.error(`❌ [${req.requestId}] Error fetching runs for ${req.tracked.repository.name}/${branch}/${workflow}:`, error);
                    // Update cache with error status
                    runsCacheRefresh.updateError({
                        gitServer: req.tracked.serverUrl,
                        repository: req.tracked.repository.name,
                        branch,
                        workflow,
                        error: error.message || 'Unknown error'
                    });
                }
            }
        }
        console.log(`✅ [${req.requestId}] Workflows refreshed`);
        res.status(200).json(getRepositoryStatusFromCache(req.tracked, runsCacheRefresh));
    } catch (error) {
        console.error(`❌ [${req.requestId}] Error refreshing workflows:`, error);
        res.status(500).json({ error: 'Failed to refresh workflows' });
    } finally {
        refreshingRepositories.delete(cacheKey);
    }
});

router.get('/status/:userId/:repoId', async (req, res) => {
    const userIdStatus = req.params.userId;
    const repoIdStatus = req.params.repoId;
    const { allowCache } = req.query;
    console.log(`🚦 [${req.requestId}] Fetching repository status for ${userIdStatus}/${repoIdStatus} (ignore refresh = ${allowCache})`);
    // Get the user's workflow runs cache
    const runsCacheStatus = getUserWorkflowRunsCache(userIdStatus);
    try {
        // Check if repository is being refreshed
        const cacheKey = `${userIdStatus}_${req.tracked.repository.serverId}_${repoIdStatus}`;
        if (refreshingRepositories.has(cacheKey)) {
            if (allowCache === 'true') {
                console.log(`ℹ️ [${req.requestId}] Returning cached status while refreshing`);
                return res.status(200).json(getRepositoryStatusFromCache(req.tracked, runsCacheStatus));
            }
            console.warn(`⚠️ [${req.requestId}] Repository is currently being refreshed: ${cacheKey}`);
            return res.status(202).json({ error: 'Repository is currently being refreshed' });
        }
        console.log(`✅ [${req.requestId}] Fetched repository data`);
        res.status(200).json(getRepositoryStatusFromCache(req.tracked, runsCacheStatus));
    } catch (error) {
        console.error(`❌ [${req.requestId}] Error fetching repository status:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

function getRepositoryStatusFromCache(tracked, runsCache) {
    const repositoryStatus = new RepositoryStatus(tracked.repository.id, tracked.repository.name, tracked.repository.url);
    // Build a map of workflowId -> { name, path }
    let workflowMetaMap = {};
    if (tracked.allWorkflows && Array.isArray(tracked.allWorkflows)) {
        tracked.allWorkflows.forEach(wf => {
            workflowMetaMap[wf.id] = { name: wf.name, path: wf.path };
        });
    }
    for (const branch of tracked.repository.trackedBranches) {
        repositoryStatus.branches[branch] = new BranchStatus(branch);
        let branchHasError = false;
        for (const workflow of tracked.repository.trackedWorkflows) {
            let cacheItem = runsCache.getLatestRuns({
                gitServer: tracked.serverUrl,
                repository: tracked.repository.name,
                branch,
                workflow
            });
            const workflowMeta = workflowMetaMap[workflow] || { name: workflow, path: null };
            if (!cacheItem || !cacheItem.data || cacheItem.data.length === 0) {
                if (cacheItem) {
                    if (cacheItem.error) {
                        branchHasError = true;
                        repositoryStatus.hasError = true;
                        if (cacheItem.error.includes('Access denied') || cacheItem.error.includes('not found')) {
                            repositoryStatus.hasPermissionError = true;
                        }
                    }
                    if (cacheItem.data && cacheItem.data.length === 0) {
                        // If no runs found for this workflow yet, create a placeholder
                        repositoryStatus.branches[branch].workflows[workflow] = [
                            new WorkflowStatus({
                                name: workflowMeta.name,
                                status: WorkflowStatusEnum.NO_RUNS,
                                workflow_id: workflow,
                                workflow_path: workflowMeta.path
                            })
                        ];
                    }
                }
                continue; // skip to next workflow
            } else {
                repositoryStatus.branches[branch].workflows[workflow] = cacheItem.data.map(run => new WorkflowStatus({
                    name: run.workflowName,
                    runId: run.runId,
                    runNumber: run.runNumber,
                    event: run.event,
                    commit: run.commit,
                    status: run.status,
                    conclusion: run.conclusion,
                    createdAt: run.createdAt,
                    updatedAt: run.updatedAt,
                    runStartedAt: run.runStartedAt,
                    runAttempt: run.runAttempt,
                    url: run.url,
                    workflow_id: run.workflowId,
                    workflow_path: workflowMeta.path
                }));
            }
            // Update overall status and counts base on the latest workflow run
            const workflowStatus = repositoryStatus.branches[branch].workflows[workflow][0];
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

function normalizeWorkflowStatus(conclusion, status) {
    const statusToCompare = conclusion || status;
    return statusToCompare === WorkflowStatusEnum.SUCCESS ? WorkflowStatusEnum.SUCCESS
              : statusToCompare === WorkflowStatusEnum.FAILURE ? WorkflowStatusEnum.FAILURE
              : statusToCompare === WorkflowStatusEnum.CANCELLED ? WorkflowStatusEnum.CANCELLED
              : statusToCompare === 'in_progress' ? WorkflowStatusEnum.RUNNING
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
