import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';

export default function LoginPage() {
  const { user, login, createUser, isLoading } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    userId: ''
  });
  const [error, setError] = useState('');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

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
      setError('User ID not found. Please create a new account or check your User ID.');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsCreatingUser(true);

    if (!formData.userId) {
      setError('Please enter a User ID');
      setIsCreatingUser(false);
      return;
    }

    if (formData.userId.length < 3) {
      setError('User ID must be at least 3 characters long');
      setIsCreatingUser(false);
      return;
    }

    const success = await createUser(formData.userId);

    if (!success) {
      setError('Failed to create user. User ID may already exist.');
    }
    
    setIsCreatingUser(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32">
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor: '#7c3aed', stopOpacity: 1}} />
                  <stop offset="30%" style={{stopColor: '#a855f7', stopOpacity: 1}} />
                  <stop offset="70%" style={{stopColor: '#06b6d4', stopOpacity: 1}} />
                  <stop offset="100%" style={{stopColor: '#0ea5e9', stopOpacity: 1}} />
                </linearGradient>
                <linearGradient id="successGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor: '#238636', stopOpacity: 1}} />
                  <stop offset="100%" style={{stopColor: '#2ea043', stopOpacity: 1}} />
                </linearGradient>
                <linearGradient id="errorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{stopColor: '#cf222e', stopOpacity: 1}} />
                  <stop offset="100%" style={{stopColor: '#da3633', stopOpacity: 1}} />
                </linearGradient>
              </defs>
              
              {/* Background circle */}
              <circle cx="16" cy="16" r="15" fill="url(#logoGrad)" opacity="0.1" stroke="url(#logoGrad)" strokeWidth="2"/>
              
              {/* Pipeline flow logo */}
              <g transform="translate(2, 2)">
                {/* Central hub */}
                <circle cx="14" cy="14" r="3" fill="url(#logoGrad)"/>
                
                {/* Flow lines */}
                <g stroke="url(#logoGrad)" strokeWidth="1.5" fill="none" opacity="0.8">
                  <line x1="6" y1="14" x2="22" y2="14"/>
                  <line x1="14" y1="6" x2="14" y2="22"/>
                  <line x1="9" y1="9" x2="19" y2="19"/>
                  <line x1="19" y1="9" x2="9" y2="19"/>
                </g>
                
                {/* Pipeline nodes */}
                <g fill="url(#logoGrad)">
                  <circle cx="6" cy="14" r="2"/>
                  <circle cx="22" cy="14" r="2"/>
                  <circle cx="14" cy="6" r="1.5"/>
                  <circle cx="14" cy="22" r="1.5"/>
                  <circle cx="9" cy="9" r="1"/>
                  <circle cx="19" cy="9" r="1"/>
                  <circle cx="9" cy="19" r="1"/>
                  <circle cx="19" cy="19" r="1"/>
                </g>
                
                {/* White centers for main nodes */}
                <g fill="#ffffff">
                  <circle cx="6" cy="14" r="0.8"/>
                  <circle cx="22" cy="14" r="0.8"/>
                </g>
              </g>
              
              {/* Status indicators in corners */}
              <circle cx="7" cy="7" r="1.5" fill="url(#successGrad)" opacity="0.6"/>
              <circle cx="25" cy="7" r="1.5" fill="url(#errorGrad)" opacity="0.6"/>
              <circle cx="7" cy="25" r="1.5" fill="#fd7e14" opacity="0.6"/>
              <circle cx="25" cy="25" r="1.5" fill="#656d76" opacity="0.6"/>
            </svg>
          </div>
          <h1>GitHub Actions Viewer</h1>
          <p>Monitor your GitHub Actions across multiple repositories</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <h2>Welcome</h2>
          
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label htmlFor="userId">User ID</label>
            <input
              type="text"
              id="userId"
              name="userId"
              value={formData.userId}
              onChange={handleInputChange}
              placeholder="Enter your unique user ID (3+ characters)"
              disabled={isLoading}
              required
            />
            <small className="form-help">
              Enter your existing User ID to sign in, or create a new account with the Create User button.
            </small>
          </div>

          <div className="form-buttons">
            <button 
              type="submit" 
              className="login-button"
              disabled={isLoading || isCreatingUser}
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>
            
            <button 
              type="button" 
              className="create-user-button"
              onClick={handleCreateUser}
              disabled={isLoading || isCreatingUser}
            >
              {isCreatingUser ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
