import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface User {
  id: string;
}

interface GitHubServer {
  id: number;
  server_name: string;
  server_url: string;
  is_default: boolean;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  githubServers: GitHubServer[];
  login: (userId: string, password: string) => Promise<boolean>;
  register: (userId: string, password: string) => Promise<boolean>;
  logout: () => void;
  loadGitHubServers: () => Promise<void>;
  addGitHubServer: (serverName: string, serverUrl: string, apiToken: string, isDefault?: boolean) => Promise<boolean>;
  updateGitHubServer: (serverId: number, serverName: string, serverUrl: string, apiToken: string, isDefault?: boolean) => Promise<boolean>;
  deleteGitHubServer: (serverId: number) => Promise<boolean>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [githubServers, setGithubServers] = useState<GitHubServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is stored in localStorage
    const storedUser = localStorage.getItem('github-actions-user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        // Load GitHub servers after setting user
        if (userData?.id) {
          loadGitHubServersForUser(userData.id);
        }
      } catch (error) {
        console.error('Error parsing stored user data:', error);
        localStorage.removeItem('github-actions-user');
      }
    }
    setIsLoading(false);
  }, []);

  const loadGitHubServersForUser = async (userId: string) => {
    try {
      const response = await fetch(`/api/auth/github-servers/${userId}`);
      if (response.ok) {
        const servers = await response.json();
        setGithubServers(servers);
      }
    } catch (error) {
      console.error('Error loading GitHub servers:', error);
    }
  };

  const loadGitHubServers = async () => {
    if (!user?.id) return;
    await loadGitHubServersForUser(user.id);
  };

  const login = async (userId: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          password,
        }),
      });

      if (response.ok) {
        const userData = { id: userId };
        setUser(userData);
        localStorage.setItem('github-actions-user', JSON.stringify(userData));
        await loadGitHubServers();
        return true;
      } else {
        const error = await response.json();
        console.error('Login failed:', error);
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userId: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          password,
        }),
      });

      if (response.ok) {
        const userData = { id: userId };
        setUser(userData);
        localStorage.setItem('github-actions-user', JSON.stringify(userData));
        setGithubServers([]);
        return true;
      } else {
        const error = await response.json();
        console.error('Registration failed:', error);
        return false;
      }
    } catch (error) {
      console.error('Registration error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const addGitHubServer = async (serverName: string, serverUrl: string, apiToken: string, isDefault = false): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const response = await fetch('/api/auth/github-servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          serverName,
          serverUrl,
          apiToken,
          isDefault,
        }),
      });

      if (response.ok) {
        await loadGitHubServers();
        return true;
      } else {
        const error = await response.json();
        console.error('Add GitHub server failed:', error);
        return false;
      }
    } catch (error) {
      console.error('Add GitHub server error:', error);
      return false;
    }
  };

  const updateGitHubServer = async (serverId: number, serverName: string, serverUrl: string, apiToken: string, isDefault = false): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const response = await fetch(`/api/auth/github-servers/${serverId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          serverName,
          serverUrl,
          apiToken,
          isDefault,
        }),
      });

      if (response.ok) {
        await loadGitHubServers();
        return true;
      } else {
        const error = await response.json();
        console.error('Update GitHub server failed:', error);
        return false;
      }
    } catch (error) {
      console.error('Update GitHub server error:', error);
      return false;
    }
  };

  const deleteGitHubServer = async (serverId: number): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const response = await fetch(`/api/auth/github-servers/${serverId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      if (response.ok) {
        await loadGitHubServers();
        return true;
      } else {
        const error = await response.json();
        console.error('Delete GitHub server failed:', error);
        return false;
      }
    } catch (error) {
      console.error('Delete GitHub server error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setGithubServers([]);
    localStorage.removeItem('github-actions-user');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      githubServers, 
      login, 
      register, 
      logout, 
      loadGitHubServers, 
      addGitHubServer, 
      updateGitHubServer, 
      deleteGitHubServer, 
      isLoading 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
