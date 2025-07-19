import express from 'express';
import { GetUserSettings, UpdateUserSettings } from '../utils/database.js';

const router = express.Router();

// Get user settings
router.get('/settings/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`⚙️ [${req.requestId}] Getting settings for user: ${userId}`);
  try {
    if (!userId) {
      console.warn(`⚠️ [${req.requestId}] User ID is required`);
      return res.status(400).json({ error: 'userId is required' });
    }
    const userSettings = await GetUserSettings(userId);
    if (!userSettings) {
      console.warn(`⚠️ [${req.requestId}] User settings not found for user: ${userId}`);
      return res.status(404).json({ error: 'User settings not found' });
    }
    console.log(`✅ [${req.requestId}] User settings retrieved successfully`, userSettings);
    res.status(200).json(userSettings);
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error fetching user settings:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user settings
router.put('/settings/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`🛠️ [${req.requestId}] Updating settings for user: ${userId}`, req.body);
  try {
    const changed = await UpdateUserSettings(userId);
    if (!changed) {
      console.warn(`⚠️ [${req.requestId}] No changes made to user settings`);
      return res.status(400).json({ error: 'No changes made' });
    }
    console.log(`✅ [${req.requestId}] User settings updated successfully`);
    res.status(200).json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error updating user settings:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
