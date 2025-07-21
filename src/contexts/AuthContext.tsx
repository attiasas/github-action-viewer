import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import type { ServerDetails } from '../api/User';

interface User {
  id: string;
}

interface AuthContextType {
  user: User | null;
  githubServers: ServerDetails[];
  login: (userId: string) => Promise<boolean>;
  createUser: (userId: string) => Promise<boolean>;
  logout: () => void;
  loadGitHubServers: (force: boolean) => Promise<void>;
  addGitHubServer: (serverName: string, serverUrl: string, apiToken: string, isDefault?: boolean) => Promise<boolean>;
  updateGitHubServer: (serverId: number, serverName: string, serverUrl: string, apiToken: string, isDefault?: boolean) => Promise<boolean>;
  deleteGitHubServer: (serverId: number) => Promise<boolean>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [githubServers, setGithubServers] = useState<ServerDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Prevent repeated server loads for same user
  const lastLoadedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    // Check if user is stored in localStorage
    const storedUser = localStorage.getItem('github-actions-user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        loadGitHubServersForUser(userData.id);
      } catch (error) {
        console.error('Error parsing stored user data:', error);
        localStorage.removeItem('github-actions-user');
      }
    }
    setIsLoading(false);
  }, []);

  const loadGitHubServersForUser = async (userId: string, force: boolean = false) => {
    // If not forcing, skip if already loaded for this user
    if (!force && lastLoadedUserIdRef.current === userId) return;
    lastLoadedUserIdRef.current = userId;
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

  const loadGitHubServers = async (force: boolean = false) => {
    if (!user?.id) return;
    await loadGitHubServersForUser(user.id, force);
  };

  const login = async (userId: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });
      if (response.ok) {
        const userData = { id: userId };
        setUser(userData);
        localStorage.setItem('github-actions-user', JSON.stringify(userData));
        if (lastLoadedUserIdRef.current !== userId) {
          lastLoadedUserIdRef.current = userId;
          await loadGitHubServersForUser(userId, true);
        }
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

  const createUser = async (userId: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });
      if (response.ok) {
        const userData = { id: userId };
        setUser(userData);
        localStorage.setItem('github-actions-user', JSON.stringify(userData));
        await loadGitHubServersForUser(userId, true);
        return true;
      } else {
        const error = await response.json();
        console.error('User creation failed:', error);
        return false;
      }
    } catch (error) {
      console.error('User creation error:', error);
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
        await loadGitHubServers(true);
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
        await loadGitHubServers(true);
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
        await loadGitHubServers(true);
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
      logout, 
      loadGitHubServers, 
      addGitHubServer, 
      updateGitHubServer, 
      deleteGitHubServer, 
      createUser,
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
