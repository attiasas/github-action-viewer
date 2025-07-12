// Unit test for RepositoryListSimple component
import { render, screen } from '@testing-library/react';
import RepositoryListSimple from '../components/RepositoryListSimple';

describe('RepositoryListSimple', () => {
  it('renders empty state', () => {
    render(<RepositoryListSimple repositories={[]} onSelect={() => {}} />);
    expect(screen.getByText(/No repositories configured/i)).toBeInTheDocument();
  });
});
