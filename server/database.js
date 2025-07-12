import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get user data directory
const getUserDataDir = () => {
  const homeDir = os.homedir();
  let dataDir;
  
  switch (process.platform) {
    case 'darwin': // macOS
      dataDir = path.join(homeDir, 'Library', 'Application Support', 'GitHubActionViewer');
      break;
    case 'win32': // Windows
      dataDir = path.join(homeDir, 'AppData', 'Local', 'GitHubActionViewer');
      break;
    default: // Linux and others
      dataDir = path.join(homeDir, '.local', 'share', 'GitHubActionViewer');
      break;
  }
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  return dataDir;
};

// Use user data directory for database in production, test DB in test, local directory in development
const dbPath = process.env.NODE_ENV === 'production'
  ? path.join(getUserDataDir(), 'database.sqlite')
  : process.env.NODE_ENV === 'test'
    ? path.join(__dirname, 'database.test.sqlite')
    : path.join(__dirname, 'database.sqlite');

export const db = new sqlite3.Database(dbPath);

console.log(`Database location: ${dbPath}`);

export const initializeDatabase = () => {
  // Users table - simple user ID based authentication
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
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
      display_name TEXT, -- Optional custom repository name
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (github_server_id) REFERENCES github_servers (id)
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

  // Add display_name column to existing user_repositories table if it doesn't exist
  db.run(`
    ALTER TABLE user_repositories 
    ADD COLUMN display_name TEXT
  `, (err) => {
    // Ignore error if column already exists
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding display_name column:', err);
    }
  });

  console.log('Database initialized successfully');
};
