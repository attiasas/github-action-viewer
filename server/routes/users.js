import express from 'express';
import { db } from '../database.js';

const router = express.Router();

// Get user settings
router.get('/settings/:userId', (req, res) => {
  const { userId } = req.params;

  db.get(
    'SELECT * FROM user_settings WHERE user_id = ?',
    [userId],
    (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!row) {
        // Create default settings
        const defaultSettings = {
          user_id: userId,
          theme: 'light',
          notifications_enabled: true
        };
        
        db.run(
          `INSERT INTO user_settings (user_id, theme, notifications_enabled) 
           VALUES (?, ?, ?)`,
          [userId, 'light', 1],
          function(err) {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Database error' });
            }
            res.json(defaultSettings);
          }
        );
      } else {
        res.json({
          ...row,
          notifications_enabled: Boolean(row.notifications_enabled)
        });
      }
    }
  );
});

// Update user settings
router.put('/settings/:userId', (req, res) => {
  const { userId } = req.params;
  const { theme, notifications_enabled } = req.body;

  if (typeof theme !== 'string' || typeof notifications_enabled !== 'boolean') {
    return res.status(400).json({ error: 'theme (string) and notifications_enabled (boolean) are required' });
  }

  db.run(
    `UPDATE user_settings 
     SET theme = ?, notifications_enabled = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
    [theme, notifications_enabled ? 1 : 0, userId],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'User settings not found' });
      }

      res.json({ success: true, message: 'Settings updated successfully' });
    }
  );
});

export default router;
