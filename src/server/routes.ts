import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { sql } from './db.js';
import { generateEmbedding, searchKnowledgeBase } from './ai.js';
import { GoogleGenAI } from "@google/genai";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.join(path.dirname(__filename), '../..');

export const router = express.Router();

// Basic health check endpoint
router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { error: "Juda ko'p so'rov yuborildi. Iltimos 15 daqiqadan so'ng qayta urinib ko'ring." }
});

router.use(apiLimiter);

// Admin Authentication Middleware
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      jwt.verify(token, process.env.ADMIN_PASSWORD as string);
      next();
    } catch (err) {
      res.status(401).json({ error: "Yaroqsiz yoki muddati tugagan token" });
    }
  } else {
    // Fallback checking for backward compatibility
    const password = req.headers['x-admin-password'];
    if (password === process.env.ADMIN_PASSWORD) {
      next();
    } else {
      res.status(401).json({ error: "Ruxsat etilmagan (Unauthorized)" });
    }
  }
};

// Admin APIs
router.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, process.env.ADMIN_PASSWORD as string, { expiresIn: '24h' });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: "Noto'g'ri parol" });
  }
});

router.get("/knowledge", async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not connected" });
  try {
    const data = await sql`SELECT * FROM knowledge_base ORDER BY created_at DESC`;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadImageMemory = multer({ 
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  storage: multer.memoryStorage()
});

router.post("/knowledge", requireAdmin, uploadImageMemory.single('image'), async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not connected" });
  const { question, answer, video_url } = req.body;
  if (!question || !answer) return res.status(400).json({ error: "Missing fields" });
  
  let image_url = null;
  if (req.file) {
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      // Upload to Cloudinary
      try {
          const uploadResult = await new Promise<any>((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { folder: 'optombazar' },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(req.file!.buffer);
          });
          image_url = uploadResult.secure_url;
      } catch (err) {
          console.error("Cloudinary upload failed:", err);
          return res.status(500).json({ error: "Rasm yuklashda xatolik yuz berdi" });
      }
    } else {
      // Fallback local upload
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const filename = uniqueSuffix + path.extname(req.file.originalname);
      const dir = path.join(projectRoot, 'public', 'uploads');
      if (!fs.existsSync(dir)){
          fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, filename), req.file.buffer);
      image_url = `/uploads/${filename}`;
    }
  }

  try {
    // Generate embedding for the knowledge entry
    const embeddingText = `${question} ${answer}`;
    const embedding = await generateEmbedding(embeddingText);
    const vectorStr = embedding ? `[${embedding.join(',')}]` : null;

    const result = vectorStr 
      ? await sql`
          INSERT INTO knowledge_base (question, answer, image_url, video_url, embedding) 
          VALUES (${question}, ${answer}, ${image_url}, ${video_url || null}, ${vectorStr}::vector) 
          RETURNING *
        `
      : await sql`
          INSERT INTO knowledge_base (question, answer, image_url, video_url) 
          VALUES (${question}, ${answer}, ${image_url}, ${video_url || null}) 
          RETURNING *
        `;
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/knowledge/:id", requireAdmin, async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not connected" });
  try {
    await sql`DELETE FROM knowledge_base WHERE id = ${req.params.id}`;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const uploadMemory = multer({ 
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  storage: multer.memoryStorage()
});

router.post("/knowledge/upload", requireAdmin, uploadMemory.single('file'), async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not connected" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    let extractedText = "";
    const fileName = req.file.originalname;

    if (req.file.mimetype === 'application/pdf') {
      if (typeof globalThis.DOMMatrix === 'undefined') {
          globalThis.DOMMatrix = class DOMMatrix {} as any;
      }
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(req.file.buffer);
      extractedText = pdfData.text;
    } 
    else if (req.file.mimetype.startsWith('image/')) {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const base64Data = req.file.buffer.toString('base64');
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: req.file.mimetype
                }
              },
              { text: "Ushbu rasmdagi barcha yozuvlarni, narxlarni, mahsulotlarni va boshqa foydali ma'lumotlarni matn ko'rinishida yozib ber. Hech qanday ortiqcha gap qo'shma, faqat ichidagi bor ma'lumotni tuzilgan shaklda ber." }
            ]
          }
        ]
      });
      extractedText = response.text || "";
    } else {
      return res.status(400).json({ error: "Faqat PDF va Rasm (JPG, PNG) qo'llab-quvvatlanadi" });
    }

    if (!extractedText.trim()) {
      return res.status(400).json({ error: "Fayldan hech qanday matn o'qib bo'lmadi" });
    }

    const question = `Fayl ma'lumoti: ${fileName}`;
    
    // Generate embedding for file content
    const embeddingText = `${question} ${extractedText.substring(0, 2000)}`;
    const embedding = await generateEmbedding(embeddingText);
    const vectorStr = embedding ? `[${embedding.join(',')}]` : null;

    const result = vectorStr
      ? await sql`
          INSERT INTO knowledge_base (question, answer, embedding) 
          VALUES (${question}, ${extractedText}, ${vectorStr}::vector) 
          RETURNING *
        `
      : await sql`
          INSERT INTO knowledge_base (question, answer) 
          VALUES (${question}, ${extractedText}) 
          RETURNING *
        `;
    
    res.json(result[0]);
  } catch (err) {
    console.error("File upload parsing error:", err);
    res.status(500).json({ error: "Faylni o'qishda xatolik yuz berdi" });
  }
});

// RAG Search endpoint for web chat
router.post("/knowledge/search", async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });
  try {
    const context = await searchKnowledgeBase(query, 3);
    res.json({ context });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Reindex all existing knowledge base entries with embeddings
router.post("/knowledge/reindex", requireAdmin, async (req, res) => {
  if (!sql) return res.status(500).json({ error: "Database not connected" });
  try {
    const data = await sql`SELECT id, question, answer FROM knowledge_base WHERE embedding IS NULL`;
    let updated = 0;
    for (const item of data) {
      const embeddingText = `${item.question} ${item.answer}`.substring(0, 3000);
      const embedding = await generateEmbedding(embeddingText);
      if (embedding) {
        const vectorStr = `[${embedding.join(',')}]`;
        await sql`UPDATE knowledge_base SET embedding = ${vectorStr}::vector WHERE id = ${item.id}`;
        updated++;
      }
    }
    res.json({ success: true, total: data.length, updated });
  } catch (err) {
    console.error("Reindex error:", err);
    res.status(500).json({ error: String(err) });
  }
});
