import { db } from '../database.js';

// Returns: { server_name, server_url, api_token }
export async function GetServerDetails(userId, serverId) {
  return new Promise((resolve, reject) => {
      db.get(
        'SELECT server_name, server_url, api_token FROM github_servers WHERE id = ? AND user_id = ?',
        [serverId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
}

// Returns: [repository, serverName, serverUrl]
export async function GetTrackedRepositories(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT ur.*, gs.server_name, gs.server_url 
       FROM user_repositories ur 
       JOIN github_servers gs ON ur.github_server_id = gs.id 
       WHERE ur.user_id = ?`,
      [userId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Returns: [repository, serverUrl, apiToken, serverName]
export async function GetTrackedRepositoryWithServerDetails(userId, repoId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT ur.*, gs.server_url, gs.api_token, gs.server_name
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
}