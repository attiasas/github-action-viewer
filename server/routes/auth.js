import express from 'express';
import { CreateUser, IsUserExists } from '../utils/database.js';

const router = express.Router();

// Login existing user only
router.post('/login', async (req, res) => {
  const { userId } = req.body;
  console.log(`🔑 [${req.requestId}] User login attempt for: ${userId}`);
  if (!userId) {
    console.warn(`⚠️ [${req.requestId}] User ID is required for login`);
    return res.status(400).json({ error: 'User ID is required' });
  }
  if (userId.length < 3) {
    console.warn(`⚠️ [${req.requestId}] User ID must be at least 3 characters long`);
    return res.status(400).json({ error: 'User ID must be at least 3 characters long' });
  }
  try {
    if (!await IsUserExists(userId)) {
      console.error(`⚠️ [${req.requestId}] User ID not found: ${userId}`);
      return res.status(404).json({ error: 'User ID not found. Please create a new account.' });
    }
    console.log(`✅ [${req.requestId}] User ${userId} logged in successfully`);
    res.json({ 
      success: true, 
      message: 'Login successful',
      userId 
    });
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error during login:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create new user endpoint
router.post('/create-user', async (req, res) => {
  const { userId } = req.body;
  console.log(`🆕 [${req.requestId}] Creating new user: ${userId}`);
  if (!userId) {
    console.warn(`⚠️ [${req.requestId}] User ID is required for creation`);
    return res.status(400).json({ error: 'User ID is required' });
  }
  if (userId.length < 3) {
    console.warn(`⚠️ [${req.requestId}] User ID must be at least 3 characters long`);
    return res.status(400).json({ error: 'User ID must be at least 3 characters long' });
  }
  try {
    if (await IsUserExists(userId)) {
      console.error(`⚠️ [${req.requestId}] User ID already exists`);
      return res.status(409).json({ error: 'User ID already exists' });
    }
    // Create new user
    await CreateUser(userId);
    console.log(`✅ [${req.requestId}] User created successfully`);
    res.json({ success: true, message: 'User created successfully' });
  } catch (error) {
    console.error(`❌ [${req.requestId}] Error creating user:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
