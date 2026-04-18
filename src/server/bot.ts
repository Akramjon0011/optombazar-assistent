import { Telegraf } from "telegraf";
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION, searchKnowledgeBase } from './ai.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

try {
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
} catch (e) {
    console.error("Failed to initialize ffmpeg:", e);
}

export function setupBot(app: any) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || botToken === 'MY_TELEGRAM_BOT_TOKEN') {
    console.warn("TELEGRAM_BOT_TOKEN is missing or invalid. Telegram bot will not be started.");
    return;
  }

  const bot = new Telegraf(botToken);
  const userChats = new Map<number, any>();
  
  bot.start((ctx) => {
    ctx.reply("Salom! Men Malika, Optombazar'dan. Qanday yordam kerak?");
  });

  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    
    try {
      await ctx.sendChatAction('record_voice');
      
      const msgText = ctx.text;

      // RAG: Search relevant knowledge for THIS specific message
      const ragContext = await searchKnowledgeBase(msgText, 3);
      
      let chat = userChats.get(userId);
      const currentAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

      if (!chat) {
        chat = await currentAi.chats.create({
          model: 'gemini-2.5-flash',
          config: {
            systemInstruction: SYSTEM_INSTRUCTION + ragContext,
            temperature: 0.7,
          }
        });
        userChats.set(userId, chat);
      }

      const response = await chat.sendMessage({ message: ragContext ? `${msgText}\n\n---\nQo'shimcha kontekst:\n${ragContext}` : msgText });
      const responseText = response.text || "Kechirasiz, men tushuna olmadim.";
      
      let finalResponseText = responseText;
      let imageUrls: string[] = [];
      let videoUrls: string[] = [];

      finalResponseText = finalResponseText.replace(/\[IMAGE: (.*?)\]/g, (_match, url) => {
        imageUrls.push(url);
        return "";
      });

      finalResponseText = finalResponseText.replace(/\[VIDEO: (.*?)\]/g, (_match, url) => {
        videoUrls.push(url);
        return "";
      });

      let plainText = finalResponseText
          .replace(/\[laughing\]/gi, "😄")
          .replace(/\[short pause\]/gi, "...")
          .replace(/\[sigh\]/gi, "😌")
          .trim();

      if (videoUrls.length > 0) {
         plainText += "\n\nBatafsil video: " + videoUrls.join(", ");
      }

      // 1. Generate Voice Buffer
      let oggBuffer: Buffer | null = null;
      try {
          const ttsResponse = await currentAi.models.generateContent({
             model: 'gemini-3.1-flash-tts-preview',
             contents: [{ parts: [{ text: finalResponseText }] }],
             config: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                },
             },
          });
          const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
             const pcmBuffer = Buffer.from(base64Audio, 'base64');
             oggBuffer = await new Promise<Buffer>((resolve, reject) => {
               const tmpPcm = path.join(os.tmpdir(), `tts_${Date.now()}.pcm`);
               const tmpOgg = path.join(os.tmpdir(), `tts_${Date.now()}.ogg`);
               fs.writeFileSync(tmpPcm, pcmBuffer);
               
               ffmpeg()
                 .input(tmpPcm)
                 .inputFormat('s16le')
                 .inputOptions(['-ar 24000', '-ac 1'])
                 .audioCodec('libopus')
                 .audioFrequency(48000)
                 .audioChannels(1)
                 .format('ogg')
                 .output(tmpOgg)
                 .on('end', () => {
                   const ogg = fs.readFileSync(tmpOgg);
                   try { fs.unlinkSync(tmpPcm); } catch {}
                   try { fs.unlinkSync(tmpOgg); } catch {}
                   resolve(ogg);
                 })
                 .on('error', (err: any) => {
                   try { fs.unlinkSync(tmpPcm); } catch {}
                   try { fs.unlinkSync(tmpOgg); } catch {}
                   reject(err);
                 })
                 .run();
             });
          }
      } catch (e: any) {
         console.error("Telegram bot TTS error:", e);
      }

      // 2. Send Response (Audio + Text + Image)
      if (oggBuffer) {
         if (imageUrls.length > 0 && imageUrls[0].startsWith('http')) {
             await ctx.replyWithPhoto({ url: imageUrls[0] }, { caption: plainText });
         } else if (plainText.length > 0) {
             await ctx.reply(plainText);
         }
         await ctx.replyWithVoice({ source: oggBuffer });
      } else {
         // Fallback to purely text/image if audio fails
         if (imageUrls.length > 0 && imageUrls[0].startsWith('http')) {
             await ctx.replyWithPhoto({ url: imageUrls[0] }, { caption: plainText });
         } else {
             await ctx.reply(plainText);
         }
      }

    } catch (err: any) {
      console.error("Bot error processing message:", err);
      await ctx.reply("Uzur, texnik xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
    }
  });

  bot.catch((err: any) => console.error("Bot error:", err));

  bot.launch().catch(err => console.error("Failed to launch bot:", err));
  console.log("Telegram bot started successfully in polling mode.");
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

