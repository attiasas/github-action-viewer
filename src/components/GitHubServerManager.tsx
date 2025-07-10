import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './GitHubServerManager.css';

interface GitHubServer {
  id: number;
  server_name: string;
  server_url: string;
  is_default: boolean;
  created_at: string;
}

interface TestResult {
  valid: boolean;
  username?: string;
  scopes?: string;
  error?: string;
  status?: number;
  serverUrl?: string;
}

interface GitHubServerManagerProps {
  showHeader?: boolean;
  onAddServer?: () => void;
  onEditServer?: (server: GitHubServer) => void;
}

export default function GitHubServerManager({ 
  showHeader = true, 
  onAddServer,
  onEditServer
}: GitHubServerManagerProps = {}) {
  const { user, githubServers, loadGitHubServers, deleteGitHubServer } = useAuth();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testingToken, setTestingToken] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<{ [key: number]: TestResult }>({});

  useEffect(() => {
    if (user && loadGitHubServers) {
      loadGitHubServers();
    }
  }, [user, loadGitHubServers]);

  const handleEdit = (server: GitHubServer) => {
    if (onEditServer) {
      onEditServer(server);
    }
  };

  const handleDelete = async (serverId: number) => {
    if (window.confirm('Are you sure you want to delete this GitHub server?')) {
      const success = await deleteGitHubServer(serverId);
      if (success) {
        setSuccess('Server deleted successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError('Failed to delete server');
        setTimeout(() => setError(''), 3000);
      }
    }
  };

  const handleAddClick = () => {
    if (onAddServer) {
      onAddServer();
    }
  };

  const testToken = async (serverId: number) => {
    if (!user) return;
    
    setTestingToken(serverId);
    // Remove the previous result temporarily
    setTestResults(prev => {
      const newResults = { ...prev };
      delete newResults[serverId];
      return newResults;
    });

    try {
      const response = await fetch(`/api/auth/test-token/${serverId}?userId=${encodeURIComponent(user.id)}`);
      const result = await response.json();
      setTestResults(prev => ({ ...prev, [serverId]: result }));
    } catch {
      setTestResults(prev => ({ 
        ...prev, 
        [serverId]: { 
          valid: false, 
          error: 'Network error occurred while testing token' 
        } 
      }));
    } finally {
      setTestingToken(null);
    }
  };

  return (
    <div className="github-server-manager">
      {showHeader && (
        <div className="manager-header">
          <h2>GitHub Servers</h2>
          <button 
            onClick={handleAddClick} 
            className="add-server-button"
          >
            Add GitHub Server
          </button>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="servers-list">
        {githubServers.length === 0 ? (
          <div className="no-servers">
            <p>No GitHub servers configured.</p>
            <p>Add a GitHub server to start tracking repositories.</p>
          </div>
        ) : (
          githubServers.map((server) => (
            <div key={server.id} className={`server-card ${server.is_default ? 'default' : ''}`}>
              <div className="server-info">
                <h4>
                  {server.server_name}
                  {server.is_default && <span className="default-badge">Default</span>}
                </h4>
                <p className="server-url">{server.server_url}</p>
                <p className="server-date">Added: {new Date(server.created_at).toLocaleDateString()}</p>
              </div>

              <div className="server-actions">
                <button 
                  onClick={() => testToken(server.id)}
                  disabled={testingToken === server.id}
                  className="test-button"
                >
                  {testingToken === server.id ? 'Testing...' : 'Test Token'}
                </button>
                <button 
                  onClick={() => handleEdit(server)}
                  className="edit-button"
                >
                  Edit
                </button>
                <button 
                  onClick={() => handleDelete(server.id)}
                  className="delete-button"
                >
                  Delete
                </button>
              </div>

              {testResults[server.id] && (
                <div className={`test-result ${testResults[server.id].valid ? 'valid' : 'invalid'}`}>
                  {testResults[server.id].valid ? (
                    <div className="test-result-content">
                      <div className="test-result-header">
                        <span className="test-result-icon">✓</span>
                        <span className="test-result-title">Token is valid!</span>
                      </div>
                      <div className="test-result-details">
                        <div className="test-result-item">
                          <strong>Username:</strong> {testResults[server.id].username}
                        </div>
                        <div className="test-result-item">
                          <strong>Scopes:</strong> {testResults[server.id].scopes}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="test-result-content">
                      <div className="test-result-header">
                        <span className="test-result-icon">✗</span>
                        <span className="test-result-title">Token test failed</span>
                      </div>
                      <div className="test-result-details">
                        <div className="test-result-item">
                          {testResults[server.id].error}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
