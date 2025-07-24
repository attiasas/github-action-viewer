
export function getNormalizedStatus(status: string, conclusion: string | null): string {
  if (status === 'no_runs') return 'no_runs';
  if (conclusion === 'success') return 'success';
  if (conclusion === 'failure') return 'failure';
  if (conclusion === 'cancelled') return 'cancelled';
  if (status === 'running' || status === 'in_progress') return 'running';
  if (status === 'queued' || status === 'pending') return 'pending';
//   if (status === 'completed' && !conclusion) return 'pending'; // Treat completed without conclusion as pending  
  if (status === 'completed') return 'pending'; // Default completed to pending until we have a conclusion  
  if (status === 'error') return 'error';  
  return 'unknown';
}