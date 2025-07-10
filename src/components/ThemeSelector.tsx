import { useTheme } from '../contexts/ThemeContext';
import './ThemeSelector.css';

export default function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  const handleThemeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTheme = e.target.value as 'light' | 'dark' | 'auto';
    setTheme(newTheme);
  };

  return (
    <div className="theme-selector-card">
      <div className="card-header">
        <h2>Theme</h2>
        <p>Choose your preferred color scheme</p>
      </div>
      <div className="card-content">
        <div className="theme-selector-content">
          <div className="theme-options">
            <div className="theme-option">
              <input
                type="radio"
                id="theme-light"
                name="theme"
                value="light"
                checked={theme === 'light'}
                onChange={handleThemeChange}
              />
              <label htmlFor="theme-light" className="theme-option-label">
                <div className="theme-preview theme-preview-light">
                  <div className="preview-header"></div>
                  <div className="preview-content">
                    <div className="preview-card"></div>
                    <div className="preview-card"></div>
                  </div>
                </div>
                <span className="theme-name">Light</span>
              </label>
            </div>

            <div className="theme-option">
              <input
                type="radio"
                id="theme-dark"
                name="theme"
                value="dark"
                checked={theme === 'dark'}
                onChange={handleThemeChange}
              />
              <label htmlFor="theme-dark" className="theme-option-label">
                <div className="theme-preview theme-preview-dark">
                  <div className="preview-header"></div>
                  <div className="preview-content">
                    <div className="preview-card"></div>
                    <div className="preview-card"></div>
                  </div>
                </div>
                <span className="theme-name">Dark</span>
              </label>
            </div>

            <div className="theme-option">
              <input
                type="radio"
                id="theme-auto"
                name="theme"
                value="auto"
                checked={theme === 'auto'}
                onChange={handleThemeChange}
              />
              <label htmlFor="theme-auto" className="theme-option-label">
                <div className="theme-preview theme-preview-auto">
                  <div className="preview-split">
                    <div className="preview-half preview-half-light">
                      <div className="preview-header"></div>
                      <div className="preview-content">
                        <div className="preview-card"></div>
                      </div>
                    </div>
                    <div className="preview-half preview-half-dark">
                      <div className="preview-header"></div>
                      <div className="preview-content">
                        <div className="preview-card"></div>
                      </div>
                    </div>
                  </div>
                </div>
                <span className="theme-name">Auto (System)</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
