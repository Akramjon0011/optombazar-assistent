import { GoogleGenAI } from "@google/genai";
import fs from "fs";

async function testKeys() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        console.log("Testing text generation...");
        const chat = await ai.chats.create({ model: 'gemini-2.5-flash' });
        const res = await chat.sendMessage({ message: "Hello" });
        console.log("Text generation succeeded.");
    } catch(err) {
        console.error("Text Gen Error: ", err);
    }
}
testKeys();
