import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';

export default function LoginPage() {
  const { user, login, register, isLoading } = useAuth();
  const navigate = useNavigate();
  const [isRegistering, setIsRegistering] = useState(false);
  const [formData, setFormData] = useState({
    userId: '',
    password: '',
    confirmPassword: ''
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

    if (!formData.userId || !formData.password) {
      setError('Please fill in all required fields');
      return;
    }

    if (isRegistering && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (isRegistering && formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    const success = isRegistering 
      ? await register(formData.userId, formData.password)
      : await login(formData.userId, formData.password);

    if (success) {
      // Redirect will happen automatically due to useEffect above
    } else {
      setError(isRegistering ? 'Registration failed. User ID may already exist.' : 'Invalid credentials');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError('');
    setFormData({ userId: '', password: '', confirmPassword: '' });
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>GitHub Actions Viewer</h1>
          <p>Monitor your GitHub Actions across multiple repositories</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <h2>{isRegistering ? 'Create Account' : 'Sign In'}</h2>
          
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
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your password"
              disabled={isLoading}
              required
            />
          </div>

          {isRegistering && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="Confirm your password"
                disabled={isLoading}
                required
              />
            </div>
          )}

          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : (isRegistering ? 'Create Account' : 'Sign In')}
          </button>

          <div className="auth-toggle">
            <p>
              {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button type="button" onClick={toggleMode} className="toggle-button">
                {isRegistering ? 'Sign In' : 'Create Account'}
              </button>
            </p>
          </div>
        </form>

        <div className="login-info">
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
