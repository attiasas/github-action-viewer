// Basic React component test
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  it('renders GitHub Actions Viewer', () => {
    render(<App />);
    expect(screen.getByText(/GitHub Actions Viewer/i)).toBeInTheDocument();
  });
});
