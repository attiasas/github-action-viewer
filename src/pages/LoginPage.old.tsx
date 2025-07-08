import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const [formData, setFormData] = useState({
    userId: '',
    githubServerUrl: 'https://github.com',
    githubToken: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!formData.userId || !formData.githubServerUrl || !formData.githubToken) {
      setError('All fields are required');
      setIsLoading(false);
      return;
    }

    const success = await login(formData.userId, formData.githubServerUrl, formData.githubToken);
    
    if (success) {
      navigate('/dashboard');
    } else {
      setError('Failed to authenticate. Please check your credentials.');
    }
    
    setIsLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>GitHub Actions Viewer</h1>
          <p>Monitor your GitHub Actions across multiple repositories</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="userId">User ID</label>
            <input
              type="text"
              id="userId"
              name="userId"
              value={formData.userId}
              onChange={handleChange}
              placeholder="Enter a unique identifier for your account"
              required
            />
            <small>This ID will be used to save your repository configurations</small>
          </div>

          <div className="form-group">
            <label htmlFor="githubServerUrl">GitHub Server URL</label>
            <input
              type="url"
              id="githubServerUrl"
              name="githubServerUrl"
              value={formData.githubServerUrl}
              onChange={handleChange}
              placeholder="https://github.com"
              required
            />
            <small>Use https://github.com for GitHub.com or your GitHub Enterprise URL</small>
          </div>

          <div className="form-group">
            <label htmlFor="githubToken">GitHub Access Token</label>
            <input
              type="password"
              id="githubToken"
              name="githubToken"
              value={formData.githubToken}
              onChange={handleChange}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              required
            />
            <small>Generate a personal access token with 'repo' and 'actions:read' permissions</small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={isLoading} className="login-button">
            {isLoading ? 'Authenticating...' : 'Login'}
          </button>
        </form>

        <div className="login-help">
          <h3>How to get a GitHub Access Token:</h3>
          <ol>
            <li>Go to GitHub Settings → Developer settings → Personal access tokens</li>
            <li>Click "Generate new token (classic)"</li>
            <li>Select scopes: <code>repo</code> and <code>actions:read</code></li>
            <li>Copy the generated token and paste it above</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
