import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'database.sqlite');
export const db = new sqlite3.Database(dbPath);

export const initializeDatabase = () => {
  // Users table - now with password authentication
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // GitHub servers table - multiple servers per user
  db.run(`
    CREATE TABLE IF NOT EXISTS github_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      server_name TEXT NOT NULL, -- User-friendly name
      server_url TEXT NOT NULL,
      api_token TEXT NOT NULL,
      is_default BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      UNIQUE(user_id, server_name)
    )
  `);

  // Repositories table - now linked to specific GitHub server
  db.run(`
    CREATE TABLE IF NOT EXISTS user_repositories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      github_server_id INTEGER NOT NULL,
      repository_name TEXT NOT NULL,
      repository_url TEXT NOT NULL,
      tracked_branches TEXT NOT NULL, -- JSON array of branch names
      tracked_workflows TEXT NOT NULL, -- JSON array of workflow file names
      auto_refresh_interval INTEGER DEFAULT 300, -- seconds
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (github_server_id) REFERENCES github_servers (id),
      UNIQUE(user_id, github_server_id, repository_name)
    )
  `);

  // User settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      default_refresh_interval INTEGER DEFAULT 300,
      theme TEXT DEFAULT 'light',
      notifications_enabled BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  console.log('Database initialized successfully');
};
