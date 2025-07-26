
export type NormalizedStatus = 'success' | 'failure' | 'cancelled' | 'running' | 'pending' | 'error' | 'unknown' | 'no_runs';

export function getNormalizedStatus(status: string, conclusion: string | null): string {
  const actual: string = conclusion || status;
  if (actual === 'no_runs') return 'no_runs';

  if (actual === 'success') return 'success';
  if (actual === 'failure' || actual === 'timed_out') return 'failure';
  if (actual === 'cancelled' || actual === 'skipped') return 'cancelled';
  if (actual === 'queued' || actual === 'running' || actual === 'in_progress') return 'running';

  if (actual === 'error') return 'error';

  if (actual === 'pending' || actual === 'action_required') return 'pending';

  return 'unknown';
}