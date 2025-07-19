import e from 'express';
import { db } from '../database.js';

export class User {
  constructor(id, createdAt, updatedAt) {
    this.id = id;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
export class UserSettings {
  constructor(userId, createdAt, updatedAt) {
    this.userId = userId;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export async function GetUserSettings(userId) {
  const row = await new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM user_settings WHERE user_id = ?',
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
  if (!row) return null;
  return new UserSettings(row.user_id, row.created_at, row.updated_at);
}

export async function UpdateUserSettings(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE user_settings 
       SET updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = ?`,
      [userId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      }
    );
  });
}

export async function IsUserExists(userId) {
  const user = await new Promise((resolve, reject) => {
    db.get('SELECT id FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  return user ? true : false;
}

export async function GetUserById(userId) {
  const user = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
  if (!user) return null;
  return new User(
    user.id,
    user.created_at,
    user.updated_at
  );
}

export async function CreateUser(userId) {
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (id) VALUES (?)',
      [userId],
      function(err) {
        if (err) reject(err);
        // Create default settings
        db.run(
          'INSERT INTO user_settings (user_id) VALUES (?)',
          [userId],
          (err) => {
            if (err) reject(err);
            else resolve(this);
          }
        );
      }
    );
  });
}

export class ServerDetails {
  constructor(id, userId, serverName, serverUrl, apiToken, isDefault, createdAt, updatedAt) {
    this.id = id;
    this.userId = userId;
    this.serverName = serverName;
    this.serverUrl = serverUrl;
    this.apiToken = apiToken;
    this.isDefault = isDefault;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export async function GetUserServer(serverId, userId) {
  const row = await new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM github_servers WHERE id = ? AND user_id = ?',
      [serverId, userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
  if (!row) return null;
  return new ServerDetails(
    row.id,
    row.user_id,
    row.server_name,
    row.server_url,
    row.api_token,
    // Convert is_default from integer to boolean
    Boolean(row.is_default),
    row.created_at,
    row.updated_at
  );
}

export async function GetUserServers(userId) {
  const rows = await new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM github_servers WHERE user_id = ? ORDER BY is_default DESC, server_name',
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
  return (rows || []).map(row => new ServerDetails(
    row.id,
    row.user_id,
    row.server_name,
    row.server_url,
    row.api_token,
    // Convert is_default from integer to boolean
    Boolean(row.is_default),
    row.created_at,
    row.updated_at
  ));
}

export async function AddUserServer(userId, serverName, serverUrl, apiToken, isDefault = false) {
  return new Promise((resolve, reject) => {
    // Check if this is the first server for the user
    db.get(
      'SELECT COUNT(*) as count FROM github_servers WHERE user_id = ?',
      [userId],
      (err, row) => {
        if (err) reject(err);

        const isFirstServer = row.count === 0;
        const shouldBeDefault = isDefault || isFirstServer;
        
        // If this is set as default or is the first server, remove default from other servers
        if (shouldBeDefault) {
          db.run(
            'UPDATE github_servers SET is_default = 0 WHERE user_id = ?',
            [userId],
            (err) => {
              if (err) reject(err);
            }
          );
        }
        // Insert the new server
        db.run(
          'INSERT INTO github_servers (user_id, server_name, server_url, api_token, is_default) VALUES (?, ?, ?, ?, ?)',
          [userId, serverName, serverUrl, apiToken, shouldBeDefault ? 1 : 0],
          function(err) {
            if (err) reject(err);
            resolve(new ServerDetails(
              this.lastID,
              userId,
              serverName,
              serverUrl,
              apiToken,
              shouldBeDefault,
              new Date().toISOString(),
              new Date().toISOString()
            ));
          }
        );
      }
    );
  });
}

export async function UpdateUserServer(serverId, userId, serverName, serverUrl, apiToken, isDefault) {
  return new Promise((resolve, reject) => {
    // If this is set as default, remove default from other servers
    if (isDefault) {
      db.run(
        'UPDATE github_servers SET is_default = 0 WHERE user_id = ? AND id != ?',
        [userId, serverId],
        (err) => {
          if (err) reject(err);
        }
      );
    }
    // Update the server details
    db.run(
      `UPDATE github_servers 
       SET server_name = ?, server_url = ?, api_token = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND user_id = ?`,
      [serverName, serverUrl, apiToken, isDefault ? 1 : 0, serverId, userId],
      function(err) {
        if (err) reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

export async function DeleteUserServer(serverId, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM github_servers WHERE id = ? AND user_id = ?',
      [serverId, userId],
      function(err) {
        if (err) reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

export class TrackedRepository {
  constructor(metadata, serverId, serverName, serverUrl, apiToken) {
    this.repository = metadata;
    this.serverId = serverId;
    this.serverName = serverName;
    this.serverUrl = serverUrl;
    this.apiToken = apiToken;
  }
}

export class RepositoryMetadata {
  constructor(id, name, url, trackedBranches, trackedWorkflows, autoRefreshInterval, displayName = null) {
    this.id = id;
    this.name = name;
    this.url = url;
    this.autoRefreshInterval = autoRefreshInterval;
    this.displayName = displayName;

    this.trackedBranches = trackedBranches;
    this.trackedWorkflowsPaths = trackedWorkflows;
    this.trackedWorkflows = [];
  }
}

export async function GetUserTrackedRepositories(userId, withApiToken = true) {
  let query = `SELECT ur.*, gs.server_name, gs.server_url ${withApiToken ? ', gs.api_token' : ''}
               FROM user_repositories ur 
               JOIN github_servers gs ON ur.github_server_id = gs.id 
               WHERE ur.user_id = ?
               ORDER BY ur.created_at DESC`;
  if (!withApiToken) {
    query = query.replace(', gs.api_token', '');
  }
  const rows = await new Promise((resolve, reject) => {
    db.all(
      query,
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
  return rows.map(row => new TrackedRepository(
    new RepositoryMetadata(
      row.id,
      row.repository_name,
      row.repository_url,
      JSON.parse(row.tracked_branches),
      JSON.parse(row.tracked_workflows),
      row.auto_refresh_interval || 300,
      row.display_name || null
    ),
    row.github_server_id,
    row.server_name,
    row.server_url,
    row.api_token
  ));
}

export async function GetUserTrackedRepositoryData(userId, repoId) {
  const row = await new Promise((resolve, reject) => {
    db.get(
      `SELECT ur.*, gs.server_name, gs.server_url, gs.api_token 
       FROM user_repositories ur 
       JOIN github_servers gs ON ur.github_server_id = gs.id 
       WHERE ur.user_id = ? AND ur.id = ?`,
      [userId, repoId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
  if (!row) return null;
  return new TrackedRepository(
    new RepositoryMetadata(
      row.id,
      row.repository_name,
      row.repository_url,
      JSON.parse(row.tracked_branches),
      JSON.parse(row.tracked_workflows),
      row.auto_refresh_interval || 300,
      row.display_name || null
    ),
    row.github_server_id,
    row.server_name,
    row.server_url,
    row.api_token
  );
}

export async function AddUserTrackedRepository(userId, serverId, repositoryName, repositoryUrl, trackedBranches, trackedWorkflows, autoRefreshInterval, displayName) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO user_repositories (user_id, github_server_id, repository_name, repository_url, tracked_branches, tracked_workflows, auto_refresh_interval, display_name) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, serverId, repositoryName, repositoryUrl, JSON.stringify(trackedBranches), JSON.stringify(trackedWorkflows), autoRefreshInterval || 300, displayName || null],
      function(err) {
        if (err) reject(err);
        resolve(this.lastID);
      }
    );
  });
}

export async function UpdateUserTrackedRepository(repoId, userId, trackedBranches, trackedWorkflows) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE user_repositories 
       SET tracked_branches = ?, tracked_workflows = ? 
       WHERE id = ? AND user_id = ?`,
      [JSON.stringify(trackedBranches), JSON.stringify(trackedWorkflows), repoId, userId],
      function(err) {
        if (err) reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

export async function DeleteUserTrackedRepository(repoId, userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM user_repositories WHERE id = ? AND user_id = ?',
      [repoId, userId],
      function(err) {
        if (err) reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}