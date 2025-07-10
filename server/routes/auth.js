import express from 'express';
import { db } from '../database.js';
import axios from 'axios';

const router = express.Router();

// Login or create user (simplified)
router.post('/login', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (userId.length < 3) {
    return res.status(400).json({ error: 'User ID must be at least 3 characters long' });
  }

  try {
    // Check if user exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!existingUser) {
      // Create new user
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (id) VALUES (?)',
          [userId],
          function(err) {
            if (err) reject(err);
            else resolve(this);
          }
        );
      });

      // Create default settings
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO user_settings (user_id) VALUES (?)',
          [userId],
          (err) => {
            if (err) reject(err);
            else resolve(this);
          }
        );
      });
    }

    res.json({ 
      success: true, 
      message: existingUser ? 'Login successful' : 'User created and logged in',
      userId 
    });
  } catch (error) {
    console.error('Login/registration error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Get user info
router.get('/user/:userId', (req, res) => {
  const { userId } = req.params;

  db.get(
    `SELECT id, created_at FROM users WHERE id = ?`,
    [userId],
    (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!row) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(row);
    }
  );
});

// Get user's GitHub servers
router.get('/github-servers/:userId', (req, res) => {
  const { userId } = req.params;

  db.all(
    `SELECT id, server_name, server_url, is_default, created_at FROM github_servers WHERE user_id = ? ORDER BY is_default DESC, server_name`,
    [userId],
    (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json(rows || []);
    }
  );
});

// Add GitHub server
router.post('/github-servers', (req, res) => {
  const { userId, serverName, serverUrl, apiToken, isDefault } = req.body;

  if (!userId || !serverName || !serverUrl || !apiToken) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // If this is set as default, remove default from other servers
  if (isDefault) {
    db.run(
      'UPDATE github_servers SET is_default = 0 WHERE user_id = ?',
      [userId],
      (err) => {
        if (err) {
          console.error('Error updating default servers:', err);
        }
      }
    );
  }

  db.run(
    `INSERT INTO github_servers (user_id, server_name, server_url, api_token, is_default) 
     VALUES (?, ?, ?, ?, ?)`,
    [userId, serverName, serverUrl, apiToken, isDefault ? 1 : 0],
    function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return res.status(409).json({ error: 'Server name already exists for this user' });
        }
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json({ 
        success: true, 
        message: 'GitHub server added successfully',
        serverId: this.lastID
      });
    }
  );
});

// Update GitHub server
router.put('/github-servers/:serverId', (req, res) => {
  const { serverId } = req.params;
  const { userId, serverName, serverUrl, apiToken, isDefault } = req.body;

  if (!userId || !serverName || !serverUrl || !apiToken) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // If this is set as default, remove default from other servers
  if (isDefault) {
    db.run(
      'UPDATE github_servers SET is_default = 0 WHERE user_id = ? AND id != ?',
      [userId, serverId],
      (err) => {
        if (err) {
          console.error('Error updating default servers:', err);
        }
      }
    );
  }

  db.run(
    `UPDATE github_servers 
     SET server_name = ?, server_url = ?, api_token = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`,
    [serverName, serverUrl, apiToken, isDefault ? 1 : 0, serverId, userId],
    function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return res.status(409).json({ error: 'Server name already exists for this user' });
        }
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Server not found' });
      }

      res.json({ 
        success: true, 
        message: 'GitHub server updated successfully'
      });
    }
  );
});

// Delete GitHub server
router.delete('/github-servers/:serverId', (req, res) => {
  const { serverId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  db.run(
    'DELETE FROM github_servers WHERE id = ? AND user_id = ?',
    [serverId, userId],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Server not found' });
      }

      res.json({ 
        success: true, 
        message: 'GitHub server deleted successfully'
      });
    }
  );
});

// Test GitHub server token validity
router.get('/test-token/:serverId', async (req, res) => {
  const { serverId } = req.params;
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const server = await new Promise((resolve, reject) => {
      db.get(
        'SELECT server_url, api_token FROM github_servers WHERE id = ? AND user_id = ?',
        [serverId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!server) {
      return res.status(404).json({ error: 'GitHub server not found' });
    }

    const baseUrl = server.server_url.replace(/\/$/, '');
    const apiUrl = baseUrl.includes('github.com') 
      ? 'https://api.github.com' 
      : `${baseUrl}/api/v3`;

    // Test token by fetching user info
    const response = await axios.get(`${apiUrl}/user`, {
      headers: {
        'Authorization': `token ${server.api_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const scopes = response.headers['x-oauth-scopes'] || '';
    
    res.json({
      valid: true,
      username: response.data.login,
      scopes: scopes,
      serverUrl: server.server_url
    });

  } catch (error) {
    console.error('Token validation error:', error);
    
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
      
      res.json({
        valid: false,
        error: errorMessage,
        status: status
      });
    } else {
      res.json({
        valid: false,
        error: 'Unable to connect to GitHub server',
        details: error.message
      });
    }
  }
});

export default router;
