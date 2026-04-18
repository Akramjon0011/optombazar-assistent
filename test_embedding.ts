import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  try {
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: "Hello",
      config: { outputDimensionality: 768 }
    });
    console.log("gemini-embedding-001 OK, dims:", result.embeddings?.[0]?.values?.length);
  } catch (err: any) {
    console.error("Failed:", err.message);
  }
}

test();
