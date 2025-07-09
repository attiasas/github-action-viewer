import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import GitHubServerManager from '../components/GitHubServerManager';
import './SettingsPage.css';

interface UserSettings {
  theme: string;
  notifications_enabled: boolean;
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<UserSettings>({
    theme: 'light',
    notifications_enabled: true
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadSettings = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/users/settings/${user.id}`);
      if (response.ok) {
        const userSettings = await response.json();
        setSettings(userSettings);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    setMessage('');
    
    try {
      const response = await fetch(`/api/users/settings/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setMessage('Settings saved successfully!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('Error saving settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked 
              : type === 'number' ? Number(value) 
              : value
    }));
  };

  if (isLoading) {
    return (
      <div className="settings-page">
        <div className="settings-container">
          <div className="loading">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-container">
        <header className="settings-header">
          <div className="header-content">
            <h1>Settings</h1>
            <div className="header-actions">
              <Link to="/dashboard" className="back-link">
                ← Back to Dashboard
              </Link>
              <button onClick={logout} className="logout-button">
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="settings-main">
          <div className="settings-section">
            <h2>User Information</h2>
            <div className="user-info">
              <div className="info-item">
                <strong>User ID:</strong> {user?.id}
              </div>
            </div>
          </div>

          <div className="settings-section">
            <GitHubServerManager />
          </div>

          <div className="settings-section">
            <h2>Preferences</h2>
            <form onSubmit={saveSettings} className="settings-form">
              <div className="form-group">
                <label htmlFor="theme">Theme</label>
                <select
                  id="theme"
                  name="theme"
                  value={settings.theme}
                  onChange={handleInputChange}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">Auto (System)</option>
                </select>
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="notifications_enabled"
                    checked={settings.notifications_enabled}
                    onChange={handleInputChange}
                  />
                  <span className="checkbox-text">Enable notifications</span>
                </label>
                <small>Get notifications about action failures (feature coming soon)</small>
              </div>

              {message && (
                <div className={`message ${message.includes('successfully') ? 'success' : 'error'}`}>
                  {message}
                </div>
              )}

              <div className="form-actions">
                <button type="submit" disabled={isSaving} className="save-button">
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>

          <div className="settings-section">
            <h2>About</h2>
            <div className="about-info">
              <p>GitHub Actions Viewer v1.0.0</p>
              <p>A tool for monitoring GitHub Actions across multiple repositories.</p>
              <p>
                <strong>Features:</strong>
              </p>
              <ul>
                <li>Multi-repository action monitoring</li>
                <li>Branch-specific tracking</li>
                <li>Workflow filtering</li>
                <li>Per-repository refresh settings</li>
                <li>Persistent user configurations</li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
