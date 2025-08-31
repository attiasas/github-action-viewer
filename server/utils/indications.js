// Base Indication class to represent a single indication
export class Indication {
    constructor({ type, severity, severityScore, relevantJobs, message, url, timestamp }) {
        this.type = type;
        this.severity = severity;
        this.severityScore = severityScore;
        this.relevantJobs = relevantJobs || [];
        this.message = message;
        this.url = url;
        this.timestamp = timestamp || new Date().toISOString();
    }

    // Helper method to check if two indications are the same
    isSameAs(other) {
        return this.severity === other.severity && this.message === other.message;
    }

    // Convert to plain object for JSON serialization
    toJSON() {
        return {
            type: this.type,
            severity: this.severity,
            severityScore: this.severityScore,
            relevantJobs: this.relevantJobs,
            message: this.message,
            url: this.url,
            timestamp: this.timestamp,
            ...this._getAdditionalMetadata()
        };
    }

    // Override in subclasses to add specific metadata
    _getAdditionalMetadata() {
        return {};
    }
}

// Job With No Runs indication
export class NoRunsIndication extends Indication {
    constructor({ relevantJobs }) {
        super({
            type: 'Job With No Runs',
            severity: 'info',
            severityScore: relevantJobs.length,
            relevantJobs,
            message: relevantJobs.length === 1 ? `A job has no runs` : `${relevantJobs.length} jobs have no runs`
        });
    }
}

// Job Not Run Recently indication
export class NotRunRecentlyIndication extends Indication {
    constructor({ relevantJobs, daysSinceLastRun, jobDetails }) {
        super({
            type: 'Job Not Run Recently',
            severity: 'warning',
            severityScore: 3 * daysSinceLastRun * relevantJobs.length,
            relevantJobs,
            message: relevantJobs.length === 1 ? `A job has not run recently` : `${relevantJobs.length} jobs have not run recently`
        });
        this.intervalDaysSinceLastRun = daysSinceLastRun; // The interval threshold for grouping
        this.jobDetails = jobDetails || []; // Array of {jobId, actualDaysSinceLastRun}
    }

    _getAdditionalMetadata() {
        return {
            intervalDaysSinceLastRun: this.intervalDaysSinceLastRun,
            jobDetails: this.jobDetails
        };
    }
}

// Consecutive Failed Runs indication
export class ConsecutiveFailedRunsIndication extends Indication {
    constructor({ relevantJobs, streak, jobDetails }) {
        super({
            type: 'Consecutive Failed Runs',
            severity: 'error',
            severityScore: 5 * streak * relevantJobs.length,
            relevantJobs,
            message: relevantJobs.length === 1 ? `A job has failed for ${streak} or more consecutive runs` : `${relevantJobs.length} jobs have failed for ${streak} or more consecutive runs`
        });
        this.intervalStreak = streak; // The interval threshold for grouping
        this.jobDetails = jobDetails || []; // Array of {jobId, actualStreak}
    }

    _getAdditionalMetadata() {
        return {
            intervalStreak: this.intervalStreak,
            jobDetails: this.jobDetails
        };
    }
}

// Consecutive Successful Runs indication
export class ConsecutiveSuccessfulRunsIndication extends Indication {
    constructor({ relevantJobs, streak, jobDetails }) {
        super({
            type: 'Consecutive Successful Runs',
            severity: 'success',
            severityScore: 0,
            relevantJobs,
            message: relevantJobs.length === 1 ? `A job has succeeded for ${streak} or more consecutive runs` : `${relevantJobs.length} jobs have succeeded for ${streak} or more consecutive runs`
        });
        this.intervalStreak = streak; // The interval threshold for grouping
        this.jobDetails = jobDetails || []; // Array of {jobId, actualStreak}
    }

    _getAdditionalMetadata() {
        return {
            intervalStreak: this.intervalStreak,
            jobDetails: this.jobDetails
        };
    }
}

// Daily Failure Streaks indication
export class DailyFailureStreaksIndication extends Indication {
    constructor({ relevantJobs, days, jobDetails }) {
        super({
            type: 'Daily Streaks Failure',
            severity: 'error',
            severityScore: 4 * days * relevantJobs.length,
            relevantJobs,
            message: relevantJobs.length === 1 ? `A job has failed for ${days} or more consecutive days` : `${relevantJobs.length} jobs have failed for ${days} or more consecutive days`
        });
        this.intervalDays = days; // The interval threshold for grouping
        this.jobDetails = jobDetails || []; // Array of {jobId, actualDays}
    }

    _getAdditionalMetadata() {
        return {
            intervalDays: this.intervalDays,
            jobDetails: this.jobDetails
        };
    }
}

// Daily Success Streaks indication
export class DailySuccessStreaksIndication extends Indication {
    constructor({ relevantJobs, days, jobDetails }) {
        super({
            type: 'Daily Streaks Success',
            severity: 'success',
            severityScore: 0,
            relevantJobs,
            message: relevantJobs.length === 1 ? `A job has succeeded for ${days} or more consecutive days` : `${relevantJobs.length} jobs have succeeded for ${days} or more consecutive days`
        });
        this.intervalDays = days; // The interval threshold for grouping
        this.jobDetails = jobDetails || []; // Array of {jobId, actualDays}
    }

    _getAdditionalMetadata() {
        return {
            intervalDays: this.intervalDays,
            jobDetails: this.jobDetails
        };
    }
}

// Job Failed In Last Run indication
export class FailedLastRunIndication extends Indication {
    constructor({ relevantJobs, lastRunDetails }) {
        super({
            type: 'Job Failed In Last Run',
            severity: 'warning',
            severityScore: 2 * relevantJobs.length,
            relevantJobs,
            message: relevantJobs.length === 1 ? 'A job failed in the most recent run' : `${relevantJobs.length} jobs failed in the most recent run`
        });
        this.lastRunDetails = lastRunDetails || [];
    }

    _getAdditionalMetadata() {
        return {
            lastRunDetails: this.lastRunDetails
        };
    }
}

// All Jobs Failed indication
export class AllJobsFailedIndication extends Indication {
    constructor({ relevantJobs, totalRuns }) {
        super({
            type: 'All Jobs Failed',
            severity: 'error',
            severityScore: 10 * relevantJobs.length,
            relevantJobs,
            message: relevantJobs.length === 1 ? 'A job has failed all runs' : `${relevantJobs.length} jobs have failed all runs`
        });
        this.totalRuns = totalRuns || 0;
    }

    _getAdditionalMetadata() {
        return {
            totalRuns: this.totalRuns
        };
    }
}

// All Jobs Succeeded indication
export class AllJobsSucceededIndication extends Indication {
    constructor({ relevantJobs, totalRuns }) {
        super({
            type: 'All Jobs Succeeded',
            severity: 'success',
            severityScore: 0,
            relevantJobs,
            message: relevantJobs.length === 1 ? 'A job has succeeded all runs' : `${relevantJobs.length} jobs have succeeded all runs`
        });
        this.totalRuns = totalRuns || 0;
    }

    _getAdditionalMetadata() {
        return {
            totalRuns: this.totalRuns
        };
    }
}

// IndicationAnalyzer class to encapsulate the analysis logic
export class IndicationAnalyzer {
    constructor() {
        // Configuration constants
        this.config = {
            daysWithoutRunsIntervalForIndications: 10,
            minDaysWithoutRunsInterval: 10,
            failureStreakIntervalForIndications: 10,
            minFailureStreakInterval: 5,
            successStreakIntervalForIndications: 10,
            minSuccessStreakInterval: 20,
            dailyFailureIntervalForIndications: 10,
            minDailyFailureStreakInterval: 5,
            dailySuccessIntervalForIndications: 10,
            minDailySuccessInterval: 20
        };
    }

    // Main method to analyze jobs and return indications
    analyze(jobs) {
        const indications = [];

        // --- Job With No Runs ---
        indications.push(...this._analyzeNoRunJobs(jobs));

        const jobsWithRuns = jobs.filter(j => !this._jobHasNoRuns(j));

        // --- Job Not Run Recently ---
        indications.push(...this._analyzeJobsNotRunRecently(jobsWithRuns));

        // --- Consecutive Failed Runs ---
        indications.push(...this._analyzeConsecutiveFailedRuns(jobsWithRuns));

        // --- Consecutive Successful Runs ---
        indications.push(...this._analyzeConsecutiveSuccessfulRuns(jobsWithRuns));

        // --- Daily Streaks Failure ---
        indications.push(...this._analyzeDailyFailureStreaks(jobsWithRuns));

        // --- Daily Streaks Success ---
        indications.push(...this._analyzeDailySuccessStreaks(jobsWithRuns));

        // --- Job Failed In Last Run ---
        indications.push(...this._analyzeFailedLastRun(jobsWithRuns));

        // --- All Jobs Failed ---
        indications.push(...this._analyzeAllJobsFailed(jobsWithRuns));

        // --- All Jobs Succeeded ---
        indications.push(...this._analyzeAllJobsSucceeded(jobsWithRuns));

        return indications;
    }

    // Private helper methods
    _jobHasNoRuns(job) {
        return !job.jobRuns || job.jobRuns.length === 0 || job.jobRuns.every(run => run.status === 'no_runs');
    }

    _getJobId(job) {
        return `${job.branch}-${job.workflowKey}`;
    }

    _analyzeNoRunJobs(jobs) {
        const noRunJobs = jobs.filter(job => this._jobHasNoRuns(job));
        if (noRunJobs.length > 0) {
            return [new NoRunsIndication({
                relevantJobs: noRunJobs.map(job => this._getJobId(job))
            })];
        }
        return [];
    }

    _analyzeJobsNotRunRecently(jobsWithRuns) {
        const { daysWithoutRunsIntervalForIndications, minDaysWithoutRunsInterval } = this.config;
        const jobsWithNotRunDays = {};
        const jobDaysMap = new Map(); // Track actual days for each job
        let maxNotRunDays = 0;

        jobsWithRuns.forEach((j) => {
            const daily = getDailyStatus(j.jobRuns);
            let daysSinceLastRun = 0;
            for (let i = 0; i < daily.length; i++) {
                const run = daily[i].run;
                const status = run ? getNormalizedStatus(run.status, run.conclusion) : 'no_runs';
                if (status !== 'no_runs') {
                    daysSinceLastRun = i;
                    break;
                }
            }
            if (daysSinceLastRun >= minDaysWithoutRunsInterval) {
                const jobId = this._getJobId(j);
                jobDaysMap.set(jobId, daysSinceLastRun);
                if (!jobsWithNotRunDays[daysSinceLastRun]) jobsWithNotRunDays[daysSinceLastRun] = [];
                jobsWithNotRunDays[daysSinceLastRun].push(jobId);
                if (daysSinceLastRun > maxNotRunDays) maxNotRunDays = daysSinceLastRun;
            }
        });

        const notRecentlyIntervalGroups = {};
        Object.keys(jobsWithNotRunDays).forEach(s => {
            const days = parseInt(s);
            if (days >= minDaysWithoutRunsInterval) {
                const interval = Math.max(minDaysWithoutRunsInterval, Math.floor(days / daysWithoutRunsIntervalForIndications) * daysWithoutRunsIntervalForIndications);
                if (!notRecentlyIntervalGroups[interval]) notRecentlyIntervalGroups[interval] = [];
                notRecentlyIntervalGroups[interval].push(...jobsWithNotRunDays[days]);
            }
        });

        const indications = [];
        Object.entries(notRecentlyIntervalGroups).forEach(([intervalStr, jobIds]) => {
            const interval = parseInt(intervalStr);
            const jobDetails = jobIds.map(jobId => ({
                jobId,
                actualDaysSinceLastRun: jobDaysMap.get(jobId)
            }));
            
            indications.push(new NotRunRecentlyIndication({
                relevantJobs: jobIds,
                daysSinceLastRun: interval,
                jobDetails
            }));
        });

        return indications;
    }

    _analyzeConsecutiveFailedRuns(jobsWithRuns) {
        const { failureStreakIntervalForIndications, minFailureStreakInterval } = this.config;
        const jobsWithFailureStreak = {};
        const jobStreakMap = new Map(); // Track actual streaks for each job

        jobsWithRuns.forEach((j) => {
            let streak = 0;
            for (const run of j.jobRuns) {
                const status = getNormalizedStatus(run.status, run.conclusion);
                if (status !== 'success') streak++;
                else break;
            }
            if (streak >= minFailureStreakInterval) {
                const jobId = this._getJobId(j);
                jobStreakMap.set(jobId, streak);
                if (!jobsWithFailureStreak[streak]) jobsWithFailureStreak[streak] = [];
                jobsWithFailureStreak[streak].push(jobId);
            }
        });

        const failureStreakIntervalGroups = {};
        Object.keys(jobsWithFailureStreak).forEach(s => {
            const streak = parseInt(s);
            if (streak >= minFailureStreakInterval) {
                const interval = Math.max(minFailureStreakInterval, Math.floor(streak / failureStreakIntervalForIndications) * failureStreakIntervalForIndications);
                if (!failureStreakIntervalGroups[interval]) failureStreakIntervalGroups[interval] = [];
                failureStreakIntervalGroups[interval].push(...jobsWithFailureStreak[streak]);
            }
        });

        const indications = [];
        Object.entries(failureStreakIntervalGroups).forEach(([intervalStr, jobIds]) => {
            const interval = parseInt(intervalStr);
            const jobDetails = jobIds.map(jobId => ({
                jobId,
                actualStreak: jobStreakMap.get(jobId)
            }));
            
            indications.push(new ConsecutiveFailedRunsIndication({
                relevantJobs: jobIds,
                streak: interval,
                jobDetails
            }));
        });

        return indications;
    }

    _analyzeConsecutiveSuccessfulRuns(jobsWithRuns) {
        const { successStreakIntervalForIndications, minSuccessStreakInterval } = this.config;
        const jobsWithSuccessStreak = {};
        const jobStreakMap = new Map(); // Track actual streaks for each job
        let maxSuccessStreak = 0;

        jobsWithRuns.forEach((j) => {
            let streak = 0;
            for (const run of j.jobRuns) {
                const status = getNormalizedStatus(run.status, run.conclusion);
                if (status === 'success' || status === 'canceled' || status === 'running') streak++;
                else break;
            }
            if (streak >= minSuccessStreakInterval) {
                const jobId = this._getJobId(j);
                jobStreakMap.set(jobId, streak);
                if (!jobsWithSuccessStreak[streak]) jobsWithSuccessStreak[streak] = [];
                jobsWithSuccessStreak[streak].push(jobId);
                if (streak > maxSuccessStreak) maxSuccessStreak = streak;
            }
        });

        const successStreakIntervalGroups = {};
        Object.keys(jobsWithSuccessStreak).forEach(s => {
            const streak = parseInt(s);
            if (streak >= minSuccessStreakInterval) {
                const interval = Math.max(minSuccessStreakInterval, Math.floor(streak / successStreakIntervalForIndications) * successStreakIntervalForIndications);
                if (!successStreakIntervalGroups[interval]) successStreakIntervalGroups[interval] = [];
                successStreakIntervalGroups[interval].push(...jobsWithSuccessStreak[streak]);
            }
        });

        const successStreakIntervalKeys = Object.keys(successStreakIntervalGroups).map(Number).filter(k => k >= 5);
        if (successStreakIntervalKeys.length > 0) {
            const maxInterval = Math.max(...successStreakIntervalKeys);
            const jobIds = successStreakIntervalGroups[maxInterval];
            const jobDetails = jobIds.map(jobId => ({
                jobId,
                actualStreak: jobStreakMap.get(jobId)
            }));
            
            return [new ConsecutiveSuccessfulRunsIndication({
                relevantJobs: jobIds,
                streak: maxInterval,
                jobDetails
            })];
        }

        return [];
    }

    _analyzeDailyFailureStreaks(jobsWithRuns) {
        const { dailyFailureIntervalForIndications, minDailyFailureStreakInterval } = this.config;
        const jobsWithDailyFailureStreak = {};
        const jobDailyStreakMap = new Map(); // Track actual daily streaks for each job
        let maxDailyFailureStreak = 0;

        jobsWithRuns.forEach((j) => {
            const daily = getDailyStatus(j.jobRuns);
            let streak = 0;
            for (const d of daily) {
                const status = d.run ? getNormalizedStatus(d.run.status, d.run.conclusion) : 'no_runs';
                if (status !== 'success' && status !== 'no_runs') streak++;
                else break;
            }
            if (streak >= minDailyFailureStreakInterval) {
                const jobId = this._getJobId(j);
                jobDailyStreakMap.set(jobId, streak);
                if (!jobsWithDailyFailureStreak[streak]) jobsWithDailyFailureStreak[streak] = [];
                jobsWithDailyFailureStreak[streak].push(jobId);
                if (streak > maxDailyFailureStreak) maxDailyFailureStreak = streak;
            }
        });

        const dailyFailureStreakIntervalGroups = {};
        Object.keys(jobsWithDailyFailureStreak).forEach(s => {
            const streak = parseInt(s);
            if (streak >= minDailyFailureStreakInterval) {
                const interval = Math.max(minDailyFailureStreakInterval, Math.floor(streak / dailyFailureIntervalForIndications) * dailyFailureIntervalForIndications);
                if (!dailyFailureStreakIntervalGroups[interval]) dailyFailureStreakIntervalGroups[interval] = [];
                dailyFailureStreakIntervalGroups[interval].push(...jobsWithDailyFailureStreak[streak]);
            }
        });

        const indications = [];
        Object.entries(dailyFailureStreakIntervalGroups).forEach(([intervalStr, jobIds]) => {
            const interval = parseInt(intervalStr);
            const jobDetails = jobIds.map(jobId => ({
                jobId,
                actualDays: jobDailyStreakMap.get(jobId)
            }));
            
            indications.push(new DailyFailureStreaksIndication({
                relevantJobs: jobIds,
                days: interval,
                jobDetails
            }));
        });

        return indications;
    }

    _analyzeDailySuccessStreaks(jobsWithRuns) {
        const { dailySuccessIntervalForIndications, minDailySuccessInterval } = this.config;
        let maxDailySuccessStreak = 0;
        const jobsWithDailySuccessStreak = {};
        const jobDailyStreakMap = new Map(); // Track actual daily streaks for each job

        jobsWithRuns.forEach((j) => {
            const daily = getDailyStatus(j.jobRuns);
            let streak = 0;
            for (const d of daily) {
                const status = d.run ? getNormalizedStatus(d.run.status, d.run.conclusion) : 'no_runs';
                if (status === 'success' || status === 'running') streak++;
                else break;
            }
            if (streak >= minDailySuccessInterval) {
                const jobId = this._getJobId(j);
                jobDailyStreakMap.set(jobId, streak);
                if (!jobsWithDailySuccessStreak[streak]) jobsWithDailySuccessStreak[streak] = [];
                jobsWithDailySuccessStreak[streak].push(jobId);
                if (streak > maxDailySuccessStreak) maxDailySuccessStreak = streak;
            }
        });

        const dailySuccessStreakIntervalGroups = {};
        Object.keys(jobsWithDailySuccessStreak).forEach(s => {
            const streak = parseInt(s);
            if (streak >= minDailySuccessInterval) {
                const interval = Math.max(minDailySuccessInterval, Math.floor(streak / dailySuccessIntervalForIndications) * dailySuccessIntervalForIndications);
                if (!dailySuccessStreakIntervalGroups[interval]) dailySuccessStreakIntervalGroups[interval] = [];
                dailySuccessStreakIntervalGroups[interval].push(...jobsWithDailySuccessStreak[streak]);
            }
        });

        const dailySuccessIntervalKeys = Object.keys(dailySuccessStreakIntervalGroups).map(Number).filter(k => k >= 5);
        if (dailySuccessIntervalKeys.length > 0) {
            const maxInterval = Math.max(...dailySuccessIntervalKeys);
            const jobIds = dailySuccessStreakIntervalGroups[maxInterval];
            const jobDetails = jobIds.map(jobId => ({
                jobId,
                actualDays: jobDailyStreakMap.get(jobId)
            }));
            
            return [new DailySuccessStreaksIndication({
                relevantJobs: jobIds,
                days: maxInterval,
                jobDetails
            })];
        }

        return [];
    }

    _analyzeFailedLastRun(jobsWithRuns) {
        const failedLastRunJobs = jobsWithRuns.filter(j => j.jobRuns.length > 0 && ['failure', 'error'].includes(getNormalizedStatus(j.jobRuns[0].status, j.jobRuns[0].conclusion)));
        if (failedLastRunJobs.length > 0) {
            const lastRunDetails = failedLastRunJobs.map(j => ({
                jobId: this._getJobId(j),
                status: getNormalizedStatus(j.jobRuns[0].status, j.jobRuns[0].conclusion),
                timestamp: j.jobRuns[0].createdAt || j.jobRuns[0].runStartedAt || j.jobRuns[0].updatedAt
            }));
            
            return [new FailedLastRunIndication({
                relevantJobs: failedLastRunJobs.map(j => this._getJobId(j)),
                lastRunDetails
            })];
        }
        return [];
    }

    _analyzeAllJobsFailed(jobsWithRuns) {
        const allFailedJobs = jobsWithRuns.filter(j => j.jobRuns.every(run => getNormalizedStatus(run.status, run.conclusion) !== 'success'));
        if (allFailedJobs.length > 0) {
            const totalRuns = allFailedJobs.reduce((sum, j) => sum + j.jobRuns.length, 0);
            
            return [new AllJobsFailedIndication({
                relevantJobs: allFailedJobs.map(j => this._getJobId(j)),
                totalRuns
            })];
        }
        return [];
    }

    _analyzeAllJobsSucceeded(jobsWithRuns) {
        const allSucceededJobs = jobsWithRuns.filter(j => j.jobRuns.every(run => getNormalizedStatus(run.status, run.conclusion) === 'success'));
        if (allSucceededJobs.length > 0) {
            const totalRuns = allSucceededJobs.reduce((sum, j) => sum + j.jobRuns.length, 0);
            
            return [new AllJobsSucceededIndication({
                relevantJobs: allSucceededJobs.map(j => this._getJobId(j)),
                totalRuns
            })];
        }
        return [];
    }
}

// Helper functions (kept as standalone functions for internal use)
function getNormalizedStatus(status, conclusion) {
    const actual = conclusion || status;
    if (actual === 'no_runs') return 'no_runs';
    if (actual === 'success') return 'success';
    if (actual === 'failure' || actual === 'timed_out') return 'failure';
    if (actual === 'cancelled' || actual === 'skipped') return 'cancelled';
    if (actual === 'queued' || actual === 'running' || actual === 'in_progress') return 'running';
    if (actual === 'error') return 'error';
    if (actual === 'pending' || actual === 'action_required') return 'pending';
    return 'unknown';
}

function getDailyStatus(workflow) {
    if (!workflow.length) return [];
    // Map date string (DD-MM-YYYY) to latest run for that day
    const map = new Map();
    let lastRunDate = null;
    for (const run of workflow) {
        const timestamp = run.createdAt || run.runStartedAt || run.updatedAt;
        if (!timestamp) continue;
        const timestampDate = new Date(timestamp);
        const dayStr = String(timestampDate.getDate()).padStart(2, '0') + '-' + String(timestampDate.getMonth() + 1).padStart(2, '0') + '-' + timestampDate.getFullYear();
        // Only keep the latest run for the day (assuming workflow is sorted latest first)
        if (!map.has(dayStr)) {
            map.set(dayStr, run);
            lastRunDate = timestampDate;
        }
    }
    if (!lastRunDate) return [];
    // Remove time from last run date
    lastRunDate.setHours(0, 0, 0, 0);
    if (lastRunDate > new Date()) {
        lastRunDate = new Date(); // Ensure we don't go into future
    }
    // Build array from today back to last run date
    const days = [];
    const currentDate = new Date();
    while (currentDate >= lastRunDate) {
        const dayStr = String(currentDate.getDate()).padStart(2, '0') + '-' + String(currentDate.getMonth() + 1).padStart(2, '0') + '-' + currentDate.getFullYear();
        days.push({ date: dayStr, run: map.get(dayStr) || { status: 'no_runs' } });
        currentDate.setDate(currentDate.getDate() - 1);
    }
    return days;
}

// Backward compatibility function that uses the new class
export function getIndications(jobs) {
    const analyzer = new IndicationAnalyzer();
    return analyzer.analyze(jobs);
}

export function repositoryStatusToFlatArray(repositoryData, filterBranch, filterWorkflow) {
    const allRunsForAnalytics = [];
    Object.entries(repositoryData.branches).filter(([branchName]) => !filterBranch || branchName === filterBranch)
        .forEach(([branchName, branchData]) => {
            Object.entries(branchData.workflows).filter(([workflowKey, workflowRuns]) => {
                if (!filterWorkflow) return true;
                const runs = workflowRuns;
                const wf = runs[0];
                return (
                    workflowKey === filterWorkflow ||
                    (wf && (wf.name === filterWorkflow || wf.workflow_path === filterWorkflow))
                );
            })
            .forEach(([workflowKey, workflowRuns]) => {
                allRunsForAnalytics.push({ branch: branchName, workflowKey, jobRuns: workflowRuns });
            });
        });
    return allRunsForAnalytics;
}
