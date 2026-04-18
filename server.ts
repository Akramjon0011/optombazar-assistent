// Polyfill DOMMatrix for pdf-parse/pdf.js compatibility in serverless environments
if (typeof globalThis.DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    is2D = true;
    isIdentity = true;
    inverse() { return new DOMMatrix(); }
    multiply() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
  };
}

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env

import express from "express";
import path from "path";
import fs from 'fs';
import { fileURLToPath } from 'url';

import { initDb } from './src/server/db.js';
import { setupBot } from './src/server/bot.js';
import { router } from './src/server/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
app.set('trust proxy', 1); // Vercel runs behind a proxy
app.use(express.json());

// Initialize Database safely
try {
  initDb();
} catch (e) {
  console.error("Database initialization failed:", e);
}

// Setup Telegram Bot FIRST — before API router
// so the webhook handler isn't blocked by rate limiter
try {
  setupBot(app);
} catch (e) {
  console.error("Telegram bot setup failed:", e);
}

// Setup API Routes (has rate limiter — must be after bot)
app.use('/api', router);

// Setup local dev server or static rendering when NOT in Vercel
if (!process.env.VERCEL) {
  async function setupLocalServer() {
     const PORT = Number(process.env.PORT) || 3000;
     if (process.env.NODE_ENV !== "production") {
         const { createServer: createViteServer } = await import("vite");
         const vite = await createViteServer({
           server: { middlewareMode: true },
           appType: "spa",
         });
         app.use(vite.middlewares);
     } else {
         const distPath = path.join(process.cwd(), 'dist');
         app.use(express.static(distPath));
         app.get('*', (req, res) => {
           if (fs.existsSync(path.join(distPath, 'index.html'))) {
              res.sendFile(path.join(distPath, 'index.html'));
           } else {
              res.send("Build files missing.");
           }
         });
     }
     app.listen(PORT, "0.0.0.0", () => {
         console.log(`Server running on http://localhost:${PORT}`);
     });
  }
  setupLocalServer();
}

export default app;
