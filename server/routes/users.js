import express from 'express';
import { GetUserById } from '../utils/database.js';

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

export default router;
