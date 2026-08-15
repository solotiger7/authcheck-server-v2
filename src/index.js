import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import analyzeRouter from './routes/analyze.js';
import adminRouter from './routes/admin.js';
import './db/index.js'; // initializes the reference database on startup

dotenv.config();

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    '\n⚠️  ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.\n'
  );
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// Basic abuse protection — each device gets a limited number of scans
// per window. Tune this based on real usage once you have users.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/', analyzeRouter);
app.use('/', adminRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AuthCheck server running on http://localhost:${PORT}`);
});
