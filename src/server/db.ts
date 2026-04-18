import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

export const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export async function initDb() {
  if (!sql) return;
  try {
    // Enable pgvector extension
    await sql`CREATE EXTENSION IF NOT EXISTS vector;`;

    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS image_url TEXT;`;
    await sql`ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS video_url TEXT;`;
    await sql`ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS embedding vector(768);`;
    console.log("Knowledge base table checked/created with pgvector support");
  } catch (err) {
    console.error("DB init error:", err);
  }
}
