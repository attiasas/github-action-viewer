import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './database.js';
import authRoutes from './routes/auth.js';
import repositoryRoutes from './routes/repositories.js';
import actionsRoutes from './routes/actions.js';
import workflowsRoutes from './routes/workflows.js';
import userRoutes from './routes/users.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

var requestIdCounter = 0;

// Middleware
app.use(cors());
app.use(express.json());

const generalRouter = express.Router();

// add middleware to log request ID
generalRouter.use('*', (req, res, next) => {
    req.requestId = `req_${++requestIdCounter}`;
    console.log(`🔗 [${req.requestId}] Received request: ${req.method} ${req.baseUrl}`);
    next();
});

// Initialize database
initializeDatabase();

// Routes
app.use('/api', generalRouter);
app.use('/api/auth', authRoutes);
app.use('/api/repositories', repositoryRoutes);
app.use('/api/actions', actionsRoutes);
app.use('/api/workflows', workflowsRoutes);
app.use('/api/users', userRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

export default app;
