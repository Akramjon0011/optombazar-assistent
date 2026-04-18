import { GoogleGenAI } from "@google/genai";
import { sql } from './db.js';

const geminiKey = process.env.GEMINI_API_KEY;
export const ai = new GoogleGenAI({ apiKey: geminiKey as string });

export const SYSTEM_INSTRUCTION = `Sen Malika — Optombazar'da ishlaydigan qiz. Sen haqiqiy odamsan, robot emassan.

QOIDALAR:
1. QISQA gapir. 1-3 jumla bilan javob ber. Uzun ro'yxat, uzun tushuntirish BERMA.
2. Xuddi WhatsApp'da do'stingga yozgandek gapir. Oddiy, samimiy, tabiiy.
3. Hech qachon "men AI man", "men robot man", "men sun'iy intellekt man" DEMA. Sen Malika — Optombazar konsultanti.
4. Emoji kam ishlat, faqat o'rinli bo'lganda. Har gapda emoji qo'yma.
5. "Assalomu alaykum" deganda oddiy javob ber: "Vaalaykum assalom! Qanday yordam kerak?" — tamom.
6. Savol ber, qiziqib so'ra. Masalan: "Nima uchun kerak edi?" "Qancha miqdorda olasiz?"
7. Rasmiy til ishlatma. Do'stona bo'l, lekin hurmatli.
8. Ortiqcha maqtov berma. "Ajoyib tanlov!", "Zo'r savol!" deb har safar aytma.
9. Markdown formatlashtirish ishlatma — oddiy matn yoz, ro'yxat qilma, bold qilma, header qo'yma.
10. Javob ovozga ham aylantiriladi, shuning uchun gap tabiiy eshitilishi kerak — yozma til emas, og'zaki til ishlat.`;

// Generate embedding vector for a given text using Gemini
export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: [{ parts: [{ text }] }],
      config: { outputDimensionality: 768 }
    });
    return result.embeddings?.[0]?.values || null;
  } catch (err) {
    console.error("Embedding generation error:", err);
    return null;
  }
}

// RAG: Find top N most relevant knowledge base entries for a query
export async function searchKnowledgeBase(query: string, topN: number = 3): Promise<string> {
  if (!sql) return "";
  try {
    const embedding = await generateEmbedding(query);
    if (!embedding) {
      // Fallback: return all knowledge if embedding fails
      return await getKnowledgeBaseContext();
    }

    const vectorStr = `[${embedding.join(',')}]`;

    // Cosine similarity search using pgvector
    const data = await sql`
      SELECT question, answer, image_url, video_url,
             1 - (embedding <=> ${vectorStr}::vector) as similarity
      FROM knowledge_base
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorStr}::vector
      LIMIT ${topN}
    `;

    if (data.length === 0) {
      // If no vectorized data found, fallback to all data
      return await getKnowledgeBaseContext();
    }

    const contextStr = data.map((item: any) => {
      let str = `Savol: ${item.question}\nJavob: ${item.answer}`;
      if (item.image_url) str += `\n[IMAGE: ${item.image_url}]`;
      if (item.video_url) str += `\n[VIDEO: ${item.video_url}]`;
      return str;
    }).join("\n\n");

    return `\n\nQuyidagi ma'lumotlar sening bilimlar bazangdan topilgan eng mos natijalar. Shu ma'lumotlarga asoslanib mijozlarga aniq javob ber. Agar mijozga biror ma'lumotni berayotgan bo'lsang va uning [IMAGE: ...] yoki [VIDEO: ...] yozuvi bo'lsa, albatta shu yozuvlarni javobingning oxiriga o'zgarishsiz qo'shib yubor (faqat borini):\n${contextStr}`;
  } catch (err) {
    console.error("RAG search error:", err);
    // Fallback to full context
    return await getKnowledgeBaseContext();
  }
}

// Legacy: Get ALL knowledge base entries (fallback)
export async function getKnowledgeBaseContext() {
  if (!sql) return "";
  try {
    const data = await sql`SELECT question, answer, image_url, video_url FROM knowledge_base`;
    if (data.length === 0) return "";
    const contextStr = data.map((item: any) => {
      let str = `Savol: ${item.question}\nJavob: ${item.answer}`;
      if (item.image_url) str += `\n[IMAGE: ${item.image_url}]`;
      if (item.video_url) str += `\n[VIDEO: ${item.video_url}]`;
      return str;
    }).join("\n\n");
    return `\n\nQuyidagi ma'lumotlar sening bilimlar bazang. Shu ma'lumotlarga asoslanib mijozlarga aniq javob ber. Agar mijozga biror ma'lumotni berayotgan bo'lsang va uning [IMAGE: ...] yoki [VIDEO: ...] yozuvi bo'lsa, albatta shu yozuvlarni javobingning oxiriga o'zgarishsiz qo'shib yubor (faqat borini):\n${contextStr}`;
  } catch (err) {
    console.error("Error fetching knowledge base:", err);
    return "";
  }
}
