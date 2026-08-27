import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadEnv } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');

const env = loadEnv();
const app = express();

/**
 * The only thing this process computes server-side: the frontend's static
 * JS/CSS/HTML never hardcodes where apps/api lives, so the same build works
 * in dev and in any deployment just by setting API_BASE_URL. Served as JS
 * (not JSON) so a plain <script src="/config.js"> tag in index.html can
 * load it before app.js runs.
 */
app.get('/config.js', (_req, res) => {
  res.type('application/javascript').send(`window.CITADEL_API_BASE = ${JSON.stringify(env.API_BASE_URL)};\n`);
});

app.use(express.static(publicDir));

app.listen(env.DASHBOARD_PORT, () => {
  console.log(`Citadel Command Center dashboard listening on port ${env.DASHBOARD_PORT} (API: ${env.API_BASE_URL})`);
});
