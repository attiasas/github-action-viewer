import './ActionStats.css';

interface BranchStats {
  success: number;
  failure: number;
  pending: number;
  cancelled: number;
  latestRun?: {
    id: number;
    status: string;
    conclusion: string | null;
    created_at: string;
    head_branch: string;
  };
  error?: string;
}

interface ActionStatistics {
  repository: string;
  repositoryUrl: string;
  repoId: number;
  branches: Record<string, BranchStats>;
  overall: {
    success: number;
    failure: number;
    pending: number;
    cancelled: number;
  };
}

interface ActionStatsProps {
  stats: ActionStatistics[];
  isLoading: boolean;
}

export default function ActionStats({ stats, isLoading }: ActionStatsProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return '#28a745';
      case 'failure': return '#dc3545';
      case 'pending': return '#ffc107';
      case 'cancelled': return '#6c757d';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return '✓';
      case 'failure': return '✗';
      case 'pending': return '○';
      case 'cancelled': return '⊘';
      default: return '?';
    }
  };

  const calculateTotals = () => {
    return stats.reduce((totals, stat) => ({
      success: totals.success + stat.overall.success,
      failure: totals.failure + stat.overall.failure,
      pending: totals.pending + stat.overall.pending,
      cancelled: totals.cancelled + stat.overall.cancelled,
    }), { success: 0, failure: 0, pending: 0, cancelled: 0 });
  };

  if (isLoading) {
    return (
      <div className="action-stats loading">
        <div className="loading-spinner"></div>
        <p>Loading action statistics...</p>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="action-stats empty">
        <p>No action statistics available</p>
      </div>
    );
  }

  const totals = calculateTotals();

  return (
    <div className="action-stats">
      <div className="stats-overview">
        <h3>Overall Statistics</h3>
        <div className="stats-cards">
          <div className="stat-card success">
            <div className="stat-icon">{getStatusIcon('success')}</div>
            <div className="stat-info">
              <div className="stat-value">{totals.success}</div>
              <div className="stat-label">Success</div>
            </div>
          </div>
          <div className="stat-card failure">
            <div className="stat-icon">{getStatusIcon('failure')}</div>
            <div className="stat-info">
              <div className="stat-value">{totals.failure}</div>
              <div className="stat-label">Failure</div>
            </div>
          </div>
          <div className="stat-card pending">
            <div className="stat-icon">{getStatusIcon('pending')}</div>
            <div className="stat-info">
              <div className="stat-value">{totals.pending}</div>
              <div className="stat-label">Pending</div>
            </div>
          </div>
          <div className="stat-card cancelled">
            <div className="stat-icon">{getStatusIcon('cancelled')}</div>
            <div className="stat-info">
              <div className="stat-value">{totals.cancelled}</div>
              <div className="stat-label">Cancelled</div>
            </div>
          </div>
        </div>
      </div>

      <div className="repository-stats">
        {stats.map(stat => (
          <div key={stat.repoId} className="repository-stat">
            <div className="repo-header">
              <h4>
                <a href={stat.repositoryUrl} target="_blank" rel="noopener noreferrer">
                  {stat.repository}
                </a>
              </h4>
              <div className="repo-overall">
                <div className="overall-stats">
                  <span className="stat-item success">{stat.overall.success}</span>
                  <span className="stat-item failure">{stat.overall.failure}</span>
                  <span className="stat-item pending">{stat.overall.pending}</span>
                  <span className="stat-item cancelled">{stat.overall.cancelled}</span>
                </div>
              </div>
            </div>
            
            <div className="branch-stats">
              {Object.entries(stat.branches).map(([branch, branchStats]) => (
                <div key={branch} className="branch-stat">
                  <div className="branch-name">{branch}</div>
                  {branchStats.error ? (
                    <div className="branch-error">Error: {branchStats.error}</div>
                  ) : (
                    <>
                      <div className="branch-counts">
                        <span className="count success" title="Success">{branchStats.success}</span>
                        <span className="count failure" title="Failure">{branchStats.failure}</span>
                        <span className="count pending" title="Pending">{branchStats.pending}</span>
                        <span className="count cancelled" title="Cancelled">{branchStats.cancelled}</span>
                      </div>
                      {branchStats.latestRun && (
                        <div className="latest-run">
                          <span 
                            className={`run-status ${branchStats.latestRun.conclusion || branchStats.latestRun.status}`}
                            style={{ color: getStatusColor(branchStats.latestRun.conclusion || branchStats.latestRun.status) }}
                          >
                            {getStatusIcon(branchStats.latestRun.conclusion || branchStats.latestRun.status)}
                          </span>
                          <span className="run-time">
                            {new Date(branchStats.latestRun.created_at).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
