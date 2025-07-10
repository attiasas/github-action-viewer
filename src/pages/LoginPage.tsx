import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';

export default function LoginPage() {
  const { user, login, isLoading } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    userId: ''
  });
  const [error, setError] = useState('');

  // Redirect to dashboard if user is already logged in
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.userId) {
      setError('Please enter a User ID');
      return;
    }

    if (formData.userId.length < 3) {
      setError('User ID must be at least 3 characters long');
      return;
    }

    const success = await login(formData.userId);

    if (!success) {
      setError('Failed to login. Please try again.');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>GitHub Actions Viewer</h1>
          <p>Monitor your GitHub Actions across multiple repositories</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <h2>Sign In</h2>
          
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="userId">User ID</label>
            <input
              type="text"
              id="userId"
              name="userId"
              value={formData.userId}
              onChange={handleInputChange}
              placeholder="Enter your unique user ID"
              disabled={isLoading}
              required
            />
            <small className="form-help">
              Enter any unique identifier (3+ characters). If it doesn't exist, we'll create it for you.
            </small>
          </div>

          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : 'Sign In'}
          </button>
        </form>

        <div className="login-info">
          <h3>How it works:</h3>
          <ul>
            <li>Enter any unique User ID (3+ characters)</li>
            <li>If the ID exists, you'll be signed in</li>
            <li>If it's new, we'll create it for you automatically</li>
            <li>No passwords needed - just remember your User ID!</li>
          </ul>
          
          <h3>After signing in:</h3>
          <ul>
            <li>Add your GitHub servers and API tokens</li>
            <li>Search and track repositories</li>
            <li>Monitor GitHub Actions across multiple servers</li>
            <li>View real-time action statistics</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
