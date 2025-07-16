import { db } from '../database.js';

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
  constructor(id, name, trackedBranches, trackedWorkflows) {
    this.id = id;
    this.name = name;
    this.trackedBranches = trackedBranches;
    this.trackedWorkflows = trackedWorkflows;
  }
}

export async function GetUserTrackedRepositories(userId) {
  const rows = await new Promise((resolve, reject) => {
    db.all(
      `SELECT ur.*, gs.server_name, gs.server_url, gs.api_token
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
  return rows.map(row => new TrackedRepository(
    new RepositoryMetadata(
      row.id,
      row.repository_name,
      JSON.parse(row.tracked_branches),
      JSON.parse(row.tracked_workflows),
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
      JSON.parse(row.tracked_branches),
      JSON.parse(row.tracked_workflows),
    ),
    row.github_server_id,
    row.server_name,
    row.server_url,
    row.api_token
  );
}

// TODO: Remove all below this line


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