import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import GitHubServerManager from '../components/GitHubServerManager';
import ThemeSelector from '../components/ThemeSelector';
import './SettingsPage.css';
import type { ServerDetails, User } from '../api/User';

export default function SettingsPage() {
  const { user: authUser, logout, addGitHubServer, updateGitHubServer } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showAddServerForm, setShowAddServerForm] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerDetails | null>(null);
  const [serverFormData, setServerFormData] = useState({
    serverName: '',
    serverUrl: '',
    apiToken: '',
    isDefault: false
  });
  const [serverError, setServerError] = useState('');
  const [serverSuccess, setServerSuccess] = useState('');

  // Histogram settings state
  const [showHistogram, setShowHistogram] = useState(() => {
    const stored = localStorage.getItem('gav_showHistogram');
    if (stored === null) return true; // default to true if not set
    return stored === 'true';
  });
  const [histogramType, setHistogramType] = useState(() => {
    return localStorage.getItem('gav_histogramType') || 'refresh';
  });

  // User state (from API)
  const [user, setUser] = useState<User | null>(null);
  const [runRetention, setRunRetention] = useState<number>(200);
  const [runRetentionStatus, setRunRetentionStatus] = useState<string>('');

  const loadSettings = useCallback(async () => {
    if (!authUser) return;
    setIsLoading(true);
    try {
      // Load user settings from backend
      const res = await fetch(`/api/users/user/${authUser.id}`);
      if (res.ok) {
        const data: User = await res.json();
        setUser(data);
        if (typeof data.runRetention === 'number') {
          setRunRetention(data.runRetention);
        }
      }
      // Histogram settings are loaded from localStorage above
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      setIsLoading(false);
    }
  }, [authUser]);
  // Handle run retention change
  const handleRunRetentionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setRunRetention(value);
    setRunRetentionStatus('');
  };

  const handleRunRetentionSave = async () => {
    if (!user) {
      setRunRetentionStatus('User not found');
      return;
    }
    if (runRetention < 200 || runRetention > 1000) {
      setRunRetentionStatus('Value must be between 200 and 1000');
      return;
    }
    setRunRetentionStatus('');
    try {
      const res = await fetch(`/api/users/user/${user.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runRetention })
      });
      if (res.ok) {
        setRunRetentionStatus('Saved!');
        // Update user state with new value
        setUser(prev => prev ? { ...prev, runRetention } : prev);
      } else {
        const err = await res.json();
        setRunRetentionStatus(err.error || 'Failed to save settings');
      }
    } catch (e) {
      setRunRetentionStatus('Failed to save: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  };
  // Persist histogram settings to localStorage
  useEffect(() => {
    localStorage.setItem('gav_showHistogram', String(showHistogram));
  }, [showHistogram]);

  useEffect(() => {
    localStorage.setItem('gav_histogramType', histogramType);
  }, [histogramType]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleServerFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setServerFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const resetServerForm = () => {
    setServerFormData({
      serverName: '',
      serverUrl: '',
      apiToken: '',
      isDefault: false
    });
    setServerError('');
    setServerSuccess('');
    setShowAddServerForm(false);
    setEditingServer(null);
  };

  const handleServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    setServerSuccess('');

    if (!serverFormData.serverName || !serverFormData.serverUrl || !serverFormData.apiToken) {
      setServerError('All fields are required');
      return;
    }

    const success = editingServer
      ? await updateGitHubServer(editingServer.id, serverFormData.serverName, serverFormData.serverUrl, serverFormData.apiToken, serverFormData.isDefault)
      : await addGitHubServer(serverFormData.serverName, serverFormData.serverUrl, serverFormData.apiToken, serverFormData.isDefault);

    if (success) {
      setServerSuccess(editingServer ? 'Server updated successfully!' : 'Server added successfully!');
      setTimeout(() => {
        resetServerForm();
      }, 1500);
    } else {
      setServerError(editingServer ? 'Failed to update server' : 'Failed to add server');
    }
  };

  const handleEditServer = (server: ServerDetails) => {
    setEditingServer(server);
    setServerFormData({
      serverName: server.serverName,
      serverUrl: server.serverUrl,
      apiToken: '', // Don't populate API token for security
      isDefault: server.isDefault
    });
    setShowAddServerForm(true);
  };

  if (isLoading) {
    return (
      <div className="settings-page">
        <div className="settings-container">
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-container">
        <header className="settings-header">
          <div className="header-content">
            <div className="header-left">
              <div className="title-section">
                <button 
                  onClick={() => setShowAboutModal(true)} 
                  className="about-button"
                  title="About GitHub Actions Viewer"
                >
                  ℹ️
                </button>
                <h1>Settings</h1>
              </div>
            </div>
            <div className="header-center">
              <p className="subtitle">Manage your preferences and configurations</p>
            </div>
            <div className="header-actions">
              <Link 
                to="/dashboard" 
                className="back-link"
                state={{ fromSettings: true }}
              >
                ← Dashboard
              </Link>
              <button onClick={logout} className="logout-button">
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="settings-main">
          <div className="settings-grid">
            {/* Theme Selector */}
            <ThemeSelector />
            
            <div className="settings-card">
              <div className="card-header">
                <h2>User Preferences</h2>
              </div>
              <div className="card-content">
                <div className="user-info">
                  <div className="info-item">
                    <span className="info-label">User ID</span>
                    <span className="info-value">{user?.id}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Current Run Retention</span>
                    <span className="info-value">{user?.runRetention ?? '—'}</span>
                  </div>
                </div>
                <div className="histogram-settings">
                  <div className="info-item">
                    <label className="info-label" htmlFor="showHistogramSwitch">
                      <input
                        id="showHistogramSwitch"
                        type="checkbox"
                        checked={showHistogram}
                        onChange={e => setShowHistogram(e.target.checked)}
                        style={{ marginRight: 8 }}
                      />
                      Show Repository Card Histogram
                    </label>
                  </div>
                  {showHistogram && (
                    <div className="info-item" style={{ marginTop: 8 }}>
                      <label className="info-label" htmlFor="histogramTypeSelect">
                        Histogram Type
                        <select
                          id="histogramTypeSelect"
                          value={histogramType}
                          onChange={e => setHistogramType(e.target.value)}
                          style={{ marginLeft: 8 }}
                        >
                          <option value="refresh">Refresh Histogram</option>
                          {/* Future options can be added here */}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
                <div className="run-retention-settings" style={{ marginTop: 16 }}>
                  <div className="info-item" style={{ alignItems: 'flex-end', flexDirection: 'column', gap: 4 }}>
                    <label className="info-label" htmlFor="runRetentionInput" style={{ width: '100%' }}>
                      Maximum Run Retention
                      <input
                        id="runRetentionInput"
                        type="number"
                        min={200}
                        max={1000}
                        value={runRetention}
                        onChange={handleRunRetentionChange}
                        style={{ marginLeft: 8, width: 80 }}
                      />
                    </label>
                    {runRetentionStatus && (
                      <div className={runRetentionStatus === 'Saved!' ? 'success-message' : 'error-message'} style={{ marginTop: 14, width: '100%' }}>
                        {runRetentionStatus}
                      </div>
                    )}
                    <button
                      type="button"
                      className="save-button"
                      style={{ marginLeft: 0, marginTop: 4, width: 100 }}
                      onClick={handleRunRetentionSave}
                      disabled={runRetention < 200 || runRetention > 1000}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-card github-servers-card">
              <div className="card-header">
                <h2>GitHub Servers</h2>
                <button 
                  onClick={() => setShowAddServerForm(true)} 
                  className="add-server-button"
                  title="Add GitHub Server"
                >
                  + Add Server
                </button>
              </div>
              <div className="card-content">
                <GitHubServerManager 
                  showHeader={false} 
                  onAddServer={() => setShowAddServerForm(true)}
                  onEditServer={handleEditServer}
                />
              </div>
            </div>
          </div>
        </main>

        {/* About Modal */}
        {showAboutModal && (
          <div className="modal-overlay" onClick={() => setShowAboutModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>About</h2>
                <button 
                  onClick={() => setShowAboutModal(false)} 
                  className="modal-close-button"
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="about-info">
                  <div className="app-version">
                    <h3>GitHub Actions Viewer</h3>
                    <a 
                      href="https://github.com/attiasas/github-action-viewer/releases"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="version-badge-link"
                    >
                      <span className="version-badge">v{import.meta.env.PACKAGE_VERSION || '1.0.0'}</span>
                    </a>
                  </div>
                  <p>A modern tool for monitoring GitHub Actions across multiple repositories.</p>
                  
                  <div className="features-list">
                    <h4>Key Features</h4>
                    <div className="features-grid">
                      <div className="feature-item">
                        <span className="feature-icon">📊</span>
                        <span>Multi-repository monitoring</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">🌿</span>
                        <span>Branch-specific tracking</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">⚡</span>
                        <span>Real-time updates</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">🔧</span>
                        <span>Workflow filtering</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">💾</span>
                        <span>Persistent configurations</span>
                      </div>
                      <div className="feature-item">
                        <span className="feature-icon">🔄</span>
                        <span>Auto-refresh capabilities</span>
                      </div>
                    </div>
                  </div>

                  <div className="support-section">
                    <h4>Support & Issues</h4>
                    <div className="support-content">
                      <p>Found a bug or have a feature request?</p>
                      <a 
                        href="https://github.com/attiasas/github-action-viewer/issues"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="issues-link"
                      >
                        <span className="link-icon">🐛</span>
                        Report Issues on GitHub
                      </a>
                      <div className="repository-info">
                        <p>View the source code and contribute:</p>
                        <a 
                          href="https://github.com/attiasas/github-action-viewer"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="repo-link"
                        >
                          <span className="link-icon">📂</span>
                          GitHub Repository
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Server Modal */}
        {showAddServerForm && (
          <div className="modal-overlay" onClick={() => setShowAddServerForm(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingServer ? 'Edit GitHub Server' : 'Add GitHub Server'}</h2>
                <button 
                  onClick={() => setShowAddServerForm(false)} 
                  className="modal-close-button"
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                {serverError && <div className="error-message">{serverError}</div>}
                {serverSuccess && <div className="success-message">{serverSuccess}</div>}
                
                <form onSubmit={handleServerSubmit} className="server-form">
                  <div className="form-group">
                    <label htmlFor="serverName">Server Name</label>
                    <input
                      type="text"
                      id="serverName"
                      name="serverName"
                      value={serverFormData.serverName}
                      onChange={handleServerFormChange}
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
                      value={serverFormData.serverUrl}
                      onChange={handleServerFormChange}
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
                      value={serverFormData.apiToken}
                      onChange={handleServerFormChange}
                      placeholder="Your GitHub personal access token"
                      required
                    />
                  </div>

                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="isDefault"
                        checked={serverFormData.isDefault}
                        onChange={handleServerFormChange}
                      />
                      <span className="checkbox-text">Set as default server</span>
                    </label>
                  </div>

                  <div className="form-actions">
                    <button type="submit" className="save-button">
                      {editingServer ? 'Update Server' : 'Add Server'}
                    </button>
                    <button type="button" onClick={() => setShowAddServerForm(false)} className="cancel-button">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
