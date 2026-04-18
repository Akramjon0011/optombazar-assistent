import { GoogleGenAI, Modality } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

// Fetch RAG context from server for a specific query
async function fetchRAGContext(query: string): Promise<string> {
  try {
    const res = await fetch('/api/knowledge/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (res.ok) {
      const data = await res.json();
      return data.context || "";
    }
  } catch (err) {
    console.error("Error fetching RAG context:", err);
  }
  return "";
}

export async function createChat() {
  // Create chat with base system instruction (no preloaded KB)
  return ai.chats.create({
    model: 'gemini-3.1-flash-lite-preview',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.7,
    }
  });
}

// Send message with RAG-enhanced context
export async function sendMessageWithRAG(chat: any, message: string) {
  const ragContext = await fetchRAGContext(message);
  const enhancedMessage = ragContext 
    ? `${message}\n\n---\nQo'shimcha kontekst:\n${ragContext}` 
    : message;
  return chat.sendMessage({ message: enhancedMessage });
}

export async function generateSpeech(text: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-tts-preview',
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
}
