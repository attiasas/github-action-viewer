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

export default function GitHubServerManager() {
  const { user, githubServers, loadGitHubServers, addGitHubServer, updateGitHubServer, deleteGitHubServer } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingServer, setEditingServer] = useState<GitHubServer | null>(null);
  const [formData, setFormData] = useState({
    serverName: '',
    serverUrl: '',
    apiToken: '',
    isDefault: false
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testingToken, setTestingToken] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<{ [key: number]: TestResult }>({});

  useEffect(() => {
    if (user && loadGitHubServers) {
      loadGitHubServers();
    }
  }, [user, loadGitHubServers]);

  const resetForm = () => {
    setFormData({
      serverName: '',
      serverUrl: '',
      apiToken: '',
      isDefault: false
    });
    setError('');
    setSuccess('');
    setShowAddForm(false);
    setEditingServer(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.serverName || !formData.serverUrl || !formData.apiToken) {
      setError('All fields are required');
      return;
    }

    const success = editingServer
      ? await updateGitHubServer(editingServer.id, formData.serverName, formData.serverUrl, formData.apiToken, formData.isDefault)
      : await addGitHubServer(formData.serverName, formData.serverUrl, formData.apiToken, formData.isDefault);

    if (success) {
      setSuccess(editingServer ? 'Server updated successfully!' : 'Server added successfully!');
      resetForm();
    } else {
      setError(editingServer ? 'Failed to update server' : 'Failed to add server');
    }
  };

  const handleEdit = (server: GitHubServer) => {
    setEditingServer(server);
    setFormData({
      serverName: server.server_name,
      serverUrl: server.server_url,
      apiToken: '', // Don't populate API token for security
      isDefault: server.is_default
    });
    setShowAddForm(true);
  };

  const handleDelete = async (serverId: number) => {
    if (window.confirm('Are you sure you want to delete this GitHub server?')) {
      const success = await deleteGitHubServer(serverId);
      if (success) {
        setSuccess('Server deleted successfully!');
      } else {
        setError('Failed to delete server');
      }
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <div className="github-server-manager">
      <div className="manager-header">
        <h2>GitHub Servers</h2>
        <button 
          onClick={() => setShowAddForm(true)} 
          className="add-server-button"
          disabled={showAddForm}
        >
          Add GitHub Server
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {showAddForm && (
        <div className="server-form">
          <h3>{editingServer ? 'Edit GitHub Server' : 'Add GitHub Server'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="serverName">Server Name</label>
              <input
                type="text"
                id="serverName"
                name="serverName"
                value={formData.serverName}
                onChange={handleInputChange}
                placeholder="e.g., GitHub.com, Company GitHub"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="serverUrl">Server URL</label>
              <input
                type="url"
                id="serverUrl"
                name="serverUrl"
                value={formData.serverUrl}
                onChange={handleInputChange}
                placeholder="e.g., https://github.com, https://github.company.com"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="apiToken">API Token</label>
              <input
                type="password"
                id="apiToken"
                name="apiToken"
                value={formData.apiToken}
                onChange={handleInputChange}
                placeholder="Your GitHub personal access token"
                required
              />
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="isDefault"
                  checked={formData.isDefault}
                  onChange={handleInputChange}
                />
                Set as default server
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" className="save-button">
                {editingServer ? 'Update Server' : 'Add Server'}
              </button>
              <button type="button" onClick={resetForm} className="cancel-button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

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
                    <div>
                      <p>✓ Token is valid!</p>
                      <p><strong>Username:</strong> {testResults[server.id].username}</p>
                      <p><strong>Scopes:</strong> {testResults[server.id].scopes}</p>
                    </div>
                  ) : (
                    <div>
                      <p>✗ Token test failed</p>
                      <p>{testResults[server.id].error}</p>
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
