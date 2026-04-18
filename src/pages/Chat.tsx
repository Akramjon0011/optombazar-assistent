import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, User, Package, Loader2, Sparkles, Volume2, VolumeX, Bot } from 'lucide-react';
import { createChat, generateSpeech } from '../services/geminiService';

type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
  isAudioPlaying?: boolean;
};

// Singleton audio context for consistent playback
let globalAudioCtx: AudioContext | null = null;
let currentAudioSource: AudioBufferSourceNode | null = null;

function getAudioContext() {
  if (!globalAudioCtx) {
    globalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  return globalAudioCtx;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'model',
      content: "Salom! Men Malika, Optombazar'dan. Qanday yordam kerak?"
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const chatRef = useRef<any>(null);

  useEffect(() => {
    async function initChat() {
      try {
        chatRef.current = await createChat();
      } catch (err: any) {
        console.error("Chat info xatolik: ", err);
      }
    }
    initChat();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const stopCurrentAudio = () => {
    if (currentAudioSource) {
      currentAudioSource.stop();
      currentAudioSource.disconnect();
      currentAudioSource = null;
    }
    setMessages(prev => prev.map(m => ({ ...m, isAudioPlaying: false })));
  };

  const playPCMBase64 = async (base64Data: string, messageId: string) => {
    try {
      const audioCtx = getAudioContext();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      stopCurrentAudio();

      const binaryString = window.atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const buffer = new Int16Array(bytes.buffer);
      const audioBuffer = audioCtx.createBuffer(1, buffer.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = buffer[i] / 32768.0; // convert to float32
      }

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      
      source.onended = () => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isAudioPlaying: false } : m));
        if (currentAudioSource === source) currentAudioSource = null;
      };

      currentAudioSource = source;
      source.start();
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isAudioPlaying: true } : m));

    } catch (err) {
      console.error("Failed to play audio", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!chatRef.current) {
        try {
            chatRef.current = await createChat();
        } catch {
            setError('Tizim bilan ulanib bo\'lmadi.');
            return;
        }
    }

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    stopCurrentAudio(); // Stop audio if user types a new message

    try {
      // 1. Fetch RAG Context
      let ragContext = "";
      try {
        const res = await fetch('/api/knowledge/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: userMessage.content })
        });
        if (res.ok) {
          const data = await res.json();
          ragContext = data.context || "";
        }
      } catch (e) {
        console.error("RAG search error", e);
      }

      // 2. Enhance message with context
      const enhancedMessage = ragContext 
        ? `${userMessage.content}\n\n---\nQo'shimcha kontekst:\n${ragContext}` 
        : userMessage.content;

      // 3. Stream response
      const responseStream = await chatRef.current.sendMessageStream({
          message: enhancedMessage
      });
      
      const modelMessageId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: modelMessageId, role: 'model', content: '' }]);

      let fullResponseText = "";
      for await (const chunk of responseStream) {
        if (chunk.text) {
          fullResponseText += chunk.text;
        }
      }
      
      let audioData = null;
      // Request TTS 3.1 audio after text stream completes
      if (isAudioEnabled && fullResponseText) {
          try {
              audioData = await generateSpeech(fullResponseText);
          } catch(err) {
              console.error("TTS generation failed: ", err);
          }
      }

      // Now update the UI with the final text all at once
      setMessages(prev => prev.map(msg => 
        msg.id === modelMessageId 
          ? { ...msg, content: fullResponseText }
          : msg
      ));

      if (audioData) {
          playPCMBase64(audioData, modelMessageId);
      }
      
    } catch (err: any) {
      console.error(err);
      setError("Kechirasiz, javob olishda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
    } finally {
      setIsLoading(false);
    }
  };

  // Helper visually replace audio tags for better chat reading
  const renderMessageContent = (content: string) => {
    let processedHTML = content;
    processedHTML = processedHTML.replace(/\[laughing\]/gi, '😄 *[kulib]*');
    processedHTML = processedHTML.replace(/\[short pause\]/gi, '*...*');
    processedHTML = processedHTML.replace(/\[sigh\]/gi, '😌 *[chuqur nafas olib]*');
    
    // Convert custom tags to Markdown
    processedHTML = processedHTML.replace(/\[IMAGE:\s*(.*?)\]/g, '\n\n![Mahsulot rasmi]($1)\n\n');
    processedHTML = processedHTML.replace(/\[VIDEO:\s*(.*?)\]/g, '\n\n📺 **Batafsil video:** [YouTube orqali ko\'rish]($1)\n\n');
    
    return processedHTML;
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-amber-500 text-white shadow-md p-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center space-x-3 w-full max-w-4xl mx-auto px-4 sm:px-0 justify-between">
          <div className="flex items-center space-x-3">
             <div className="bg-white/20 p-2 rounded-full">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold flex items-center gap-2">
              <Bot className="w-6 h-6 text-emerald-400" />
              Optombazar Sun'iy Intellekt
            </h1>
              <p className="text-amber-100 text-sm flex items-center">
                <Sparkles className="w-3 h-3 mr-1" /> Malika (Raqamli yordamchi)
              </p>
            </div>
          </div>
          <button 
             onClick={() => {
                 setIsAudioEnabled(!isAudioEnabled);
                 if (isAudioEnabled) stopCurrentAudio();
             }}
             className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors flex items-center justify-center shrink-0"
             title={isAudioEnabled ? "Ovozni o'chirish" : "Ovozni yoqish"}
          >
             {isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 opacity-70" />}
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 w-full max-w-4xl mx-auto w-full relative">
        <div className="space-y-6 pb-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex max-w-[85%] sm:max-w-[75%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                
                {/* Avatar */}
                <div className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full shadow-sm max-sm:w-8 max-sm:h-8 ${
                  message.role === 'user' ? 'bg-gray-200 text-gray-500 ml-3' : 'bg-amber-100 text-amber-600 mr-3'
                }`}>
                  {message.role === 'user' ? <User className="w-5 h-5 max-sm:w-4 max-sm:h-4" /> : <Package className="w-5 h-5 max-sm:w-4 max-sm:h-4" />}
                </div>

                {/* Message Bubble */}
                <div className={`group relative p-4 rounded-2xl shadow-sm ${
                  message.role === 'user'
                    ? 'bg-amber-500 text-white rounded-tr-sm'
                    : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'
                }`}>
                  <div className={`prose max-w-none text-sm sm:text-base ${message.role === 'user' ? 'prose-invert' : ''}`}>
                    <ReactMarkdown>
                        {renderMessageContent(message.content)}
                    </ReactMarkdown>
                  </div>
                  {message.isAudioPlaying && (
                      <div className="absolute -bottom-2 -left-2 text-amber-500 animate-pulse bg-white rounded-full p-0.5 shadow">
                         <Volume2 className="w-4 h-4" />
                      </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
               <div className="flex flex-row max-w-[85%] sm:max-w-[75%]">
                <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full shadow-sm bg-amber-100 text-amber-600 mr-3 max-sm:w-8 max-sm:h-8">
                    <Package className="w-5 h-5 max-sm:w-4 max-sm:h-4" />
                </div>
                <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="bg-white border-t border-gray-200 p-4 shrink-0">
        <div className="w-full max-w-4xl mx-auto flex flex-col space-y-2">
           {error && (
            <div className="text-red-500 text-sm bg-red-50 p-2 rounded border border-red-100">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex relative items-end space-x-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Malikaga xabar yozing (ovoz bilan javob beradi)..."
              className="flex-1 max-h-32 min-h-[56px] resize-none bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 sm:py-4 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all text-sm sm:text-base text-gray-900 placeholder:text-gray-400 m-0"
              rows={1}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:hover:bg-amber-500 text-white rounded-xl p-3 sm:p-4 transition-colors flex-shrink-0 flex items-center justify-center flex-col h-[56px] w-[56px]"
            >
              <Send className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </form>
          <div className="text-center text-xs text-gray-400 pt-2 flex flex-col sm:flex-row justify-center items-center gap-1">
            <span>Optombazar sun'iy intellekt yordamchisi. Ayrim javoblarda noaniqliklar bo'lishi mumkin.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
