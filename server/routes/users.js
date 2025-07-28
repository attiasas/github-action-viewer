import express from 'express';
import { GetUserById, UpdateUserSettings } from '../utils/database.js';

const router = express.Router();

// Get user info
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`👤 [${req.requestId}] Fetching user info for: ${userId}`);
  if (!userId) {
    console.warn(`⚠️ [${req.requestId}] User ID is required to fetch user info`);
    return res.status(400).json({ error: 'User ID is required' });
  }
  try {
    const user = await GetUserById(userId);
    if (!user) {
      console.warn(`⚠️ [${req.requestId}] User not found`);
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error fetching user info:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update user settings (currently only run_retention)
router.put('/user/:userId/settings', async (req, res) => {
  const { userId } = req.params;
  const { runRetention } = req.body;
  console.log(`🛠️ [${req.requestId}] Updating settings for user: ${userId}`);
  if (!userId) {
    console.warn(`⚠️ [${req.requestId}] User ID is required to update settings`);
    return res.status(400).json({ error: 'User ID is required' });
  }
  if (runRetention !== undefined && (isNaN(runRetention) || runRetention < 1)) {
    console.warn(`⚠️ [${req.requestId}] Invalid runRetention value: ${runRetention}`);
    return res.status(400).json({ error: 'runRetention must be a positive integer' });
  }
  try {
    const updated = await UpdateUserSettings(userId, runRetention);
    if (!updated) {
      console.warn(`⚠️ [${req.requestId}] User not found`);
      return res.status(404).json({ error: 'User not found' });
    }
    console.log(`✅ [${req.requestId}] User settings updated successfully`);
    res.json({ success: true });
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error updating user settings:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
