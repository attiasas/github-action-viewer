import express from 'express';
import { GetUserServers, GetUserServer, AddUserServer, UpdateUserServer, DeleteUserServer } from '../utils/database.js';
import { GetUserInfo } from '../utils/github.js';

const router = express.Router();

// Get user's GitHub servers
router.get('/github-servers/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`🌐 [${req.requestId}] Fetching GitHub servers for user: ${userId}`);
  try {
    const servers = await GetUserServers(userId);
    console.log(`✅ [${req.requestId}] Found ${servers.length} GitHub servers for user`);
    res.json(servers);
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error fetching GitHub servers:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Add GitHub server
router.post('/github-servers', async (req, res) => {
  const { userId, serverName, serverUrl, apiToken, isDefault } = req.body;
  console.log(`🆕 [${req.requestId}] Adding GitHub server for user: ${userId}`, { serverName, serverUrl, isDefault });
  if (!userId || !serverName || !serverUrl || !apiToken) {
    console.warn(`⚠️ [${req.requestId}] All fields are required`);
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (serverName.length < 3) {
    console.warn(`⚠️ [${req.requestId}] Server name must be at least 3 characters long`);
    return res.status(400).json({ error: 'Server name must be at least 3 characters long' });
  }
  if (!/^https?:\/\//.test(serverUrl)) {
    console.warn(`⚠️ [${req.requestId}] Invalid server URL format`);
    return res.status(400).json({ error: 'Invalid server URL format' });
  }
  try {
    const server = await AddUserServer(userId, serverName, serverUrl, apiToken, isDefault);
    console.log(`✅ [${req.requestId}] GitHub server added successfully`, { serverId: server.id });
    res.json({ 
      success: true, 
      message: 'GitHub server added successfully',
      serverId: server.id
    });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      console.warn(`⚠️ [${req.requestId}] Server name already exists for this user`);
      return res.status(409).json({ error: 'Server name already exists for this user' });
    }
    console.error(`❌ [${req.requestId}] Error adding GitHub server:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update GitHub server
router.put('/github-servers/:serverId', async (req, res) => {
  const { serverId } = req.params;
  const { userId, serverName, serverUrl, apiToken, isDefault } = req.body;
  console.log(`✏️ [${req.requestId}] Updating GitHub server: ${serverId} for user: ${userId}`, { serverName, serverUrl, isDefault });
  if (!userId || !serverName || !serverUrl || !apiToken) {
    console.warn(`⚠️ [${req.requestId}] All fields are required for updating server`);
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    if (!await UpdateUserServer(serverId, userId, serverName, serverUrl, apiToken, isDefault)) {
      console.warn(`⚠️ [${req.requestId}] Server not found or no changes made`);
      return res.status(404).json({ error: 'Server not found or no changes made' });
    }
    console.log(`✅ [${req.requestId}] GitHub server updated successfully`);
    res.json({ 
      success: true, 
      message: 'GitHub server updated successfully'
    });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      console.warn(`⚠️ [${req.requestId}] Server name already exists for this user`);
      return res.status(409).json({ error: 'Server name already exists for this user' });
    }
    console.error(`❌ [${req.requestId}] Error updating GitHub server:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete GitHub server
router.delete('/github-servers/:serverId', async (req, res) => {
  const { serverId } = req.params;
  const { userId } = req.body;
  console.log(`🗑️ [${req.requestId}] Deleting GitHub server: ${serverId} for user: ${userId}`);
  if (!userId) {
    console.warn(`⚠️ [${req.requestId}] User ID is required to delete server`);
    return res.status(400).json({ error: 'User ID is required' });
  }
  if (!serverId) {
    console.warn(`⚠️ [${req.requestId}] Server ID is required to delete server`);
    return res.status(400).json({ error: 'Server ID is required' });
  }
  try {
    if (!await DeleteUserServer(serverId, userId)) {
      console.warn(`⚠️ [${req.requestId}] Server not found or no changes made`);
      return res.status(404).json({ error: 'Server not found or no changes made' });
    }
    console.log(`✅ [${req.requestId}] GitHub server deleted successfully`);
    res.json({ 
      success: true, 
      message: 'GitHub server deleted successfully'
    });
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error deleting GitHub server:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Test GitHub server token validity
router.get('/test-token/:serverId', async (req, res) => {
  const { serverId } = req.params;
  const { userId } = req.query;
  console.log(`🧪 [${req.requestId}] Testing token for GitHub server: ${serverId} for user: ${userId}`);
  if (!userId) {
    console.warn(`⚠️ [${req.requestId}] User ID is required to test token`);
    return res.status(400).json({ error: 'User ID is required' });
  }
  if (!serverId) {
    console.warn(`⚠️ [${req.requestId}] Server ID is required to test token`);
    return res.status(400).json({ error: 'Server ID is required' });
  }
  try {
    const server = await GetUserServer(serverId, userId);
    if (!server) {
      console.warn(`⚠️ [${req.requestId}] GitHub server not found`);
      return res.status(404).json({ error: 'GitHub server not found' });
    }
    // Test token by fetching user info
    const userInfo = await GetUserInfo(server.serverUrl, server.apiToken);
    console.log(`✅ [${req.requestId}] Token is valid for user:`, { scopes: userInfo.scopes });
    res.json({
      valid: true,
      username: userInfo.userName,
      scopes: userInfo.scopes,
      serverUrl: server.serverUrl
    });
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      let errorMessage = 'Token validation failed';
      if (status === 401) {
        errorMessage = 'Invalid or expired token';
      } else if (status === 403) {
        errorMessage = 'Token lacks required permissions or rate limit exceeded';
      } else if (status === 404) {
        errorMessage = 'GitHub server URL not found';
      }
      console.warn(`⚠️ [${req.requestId}] Token validation error:`, errorMessage);
      return res.status(status).json({
        valid: false, 
        error: errorMessage,
        status: status
      });
    }
    console.error(`❌ [${req.requestId}] Error testing token:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  } 
});

export default router;