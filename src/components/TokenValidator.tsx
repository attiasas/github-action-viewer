import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './TokenValidator.css';

export default function TokenValidator() {
  const { user } = useAuth();
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    username?: string;
    scopes?: string;
    error?: string;
  } | null>(null);

  const validateToken = async () => {
    if (!user) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const response = await fetch(`/api/auth/test-token/${encodeURIComponent(user.id)}`);
      const result = await response.json();
      setValidationResult(result);
    } catch (error) {
      console.error('Token validation error:', error);
      setValidationResult({
        valid: false,
        error: 'Network error occurred while validating token'
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="token-validator">
      <div className="validator-header">
        <h4>GitHub Token Validation</h4>
        <button 
          onClick={validateToken} 
          disabled={isValidating || !user}
          className="validate-button"
        >
          {isValidating ? 'Validating...' : 'Test Token'}
        </button>
      </div>

      {validationResult && (
        <div className={`validation-result ${validationResult.valid ? 'valid' : 'invalid'}`}>
          {validationResult.valid ? (
            <div className="success-info">
              <h5>✓ Token is valid!</h5>
              <p><strong>GitHub Username:</strong> {validationResult.username}</p>
              <p><strong>Token Scopes:</strong> {validationResult.scopes}</p>
              <div className="scope-check">
                <p><strong>Required Scopes Check:</strong></p>
                <ul>
                  <li className={validationResult.scopes?.includes('repo') ? 'scope-ok' : 'scope-missing'}>
                    repo {validationResult.scopes?.includes('repo') ? '✓' : '✗ (for private repos & Actions)'}
                  </li>
                  <li className={validationResult.scopes?.includes('public_repo') ? 'scope-ok' : 'scope-missing'}>
                    public_repo {validationResult.scopes?.includes('public_repo') ? '✓' : '✗ (for public repos only)'}
                  </li>
                </ul>
                {!validationResult.scopes?.includes('repo') && !validationResult.scopes?.includes('public_repo') && (
                  <p className="scope-warning">⚠️ You need either 'repo' or 'public_repo' scope to access GitHub Actions</p>
                )}
              </div>
            </div>
          ) : (
            <div className="error-info">
              <h5>✗ Token validation failed</h5>
              <p>{validationResult.error}</p>
              <div className="troubleshooting">
                <p><strong>Common solutions:</strong></p>
                <ul>
                  <li>Check if your token is correct and not expired</li>
                  <li>Ensure token has either "repo" scope (for private repos) or "public_repo" scope (for public repos)</li>
                  <li>Verify the GitHub server URL is correct</li>
                  <li>Check if you've hit the API rate limit</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
