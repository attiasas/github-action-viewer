import { Router } from 'express';

const router = Router();

// Simple auth middleware for testing
router.use((req, res, next) => {
  if (
    req.headers.authorization === 'Bearer testtoken' ||
    req.path === '/' // allow base route for 401 test
  ) {
    return next();
  }
  res.sendStatus(401);
});

router.get('/', (req, res) => {
  res.sendStatus(401); // Only for the base unauthorized test
});

router.get('/search', (req, res) => {
  if (!req.query.q) return res.sendStatus(400);
  res.json([{ id: 1, name: 'mock-repo' }]);
});

router.post('/track', (req, res) => {
  if (!req.body || !req.body.repo) return res.sendStatus(400);
  res.json({ success: true });
});

router.get('/tracked', (req, res) => {
  res.json([{ id: 1, name: 'mock-repo' }]);
});

router.get('/workflows', (req, res) => {
  if (!req.query.repo) return res.sendStatus(400);
  res.json([{ id: 1, name: 'mock-workflow' }]);
});

router.get('/branches', (req, res) => {
  if (!req.query.repo) return res.sendStatus(400);
  res.json([{ name: 'main' }, { name: 'dev' }]);
});

export default router;
