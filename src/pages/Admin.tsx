import { useState, useEffect } from 'react';
import { Shield, Key, Plus, Trash2, Database, AlertCircle, Loader2 } from 'lucide-react';

export default function Admin() {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState('');
  
  const [knowledgeBase, setKnowledgeBase] = useState<any[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-login check if we have token stored in session
  useEffect(() => {
    const savedToken = sessionStorage.getItem('admin_token');
    if (savedToken) {
      setToken(savedToken);
      setIsAuthenticated(true);
      // Wait for token to be set in state before fetching, but since state is async, 
      // we pass it directly or useEffect will handle it. We can just call fetchKnowledgeBase later
    }
  }, []);

  useEffect(() => {
     if (isAuthenticated && token) {
         fetchKnowledgeBase();
     }
  }, [isAuthenticated, token]);

  const checkLogin = async (pass: string) => {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      });
      if (res.ok) {
        const data = await res.json();
        const jwtToken = data.token;
        setToken(jwtToken);
        setIsAuthenticated(true);
        sessionStorage.setItem('admin_token', jwtToken);
      } else {
        setLoginError('Noto\'g\'ri parol');
        sessionStorage.removeItem('admin_token');
        setIsAuthenticated(false);
      }
    } catch (err) {
      setLoginError('Xatolik yuz berdi');
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    checkLogin(password);
  };

  const fetchKnowledgeBase = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/knowledge');
      if (res.ok) {
        const data = await res.json();
        setKnowledgeBase(data);
      } else {
        setError('Ma\'lumotlarni yuklab bo\'lmadi');
      }
    } catch (err) {
      setError('Tarmoq xatosi');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('question', newQuestion);
      formData.append('answer', newAnswer);
      if (newVideoUrl.trim()) {
         formData.append('video_url', newVideoUrl.trim());
      }
      
      const fileInput = (e.target as HTMLFormElement).elements.namedItem('imageFile') as HTMLInputElement;
      if (fileInput && fileInput.files && fileInput.files[0]) {
         formData.append('image', fileInput.files[0]);
      }

      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (res.ok) {
        setNewQuestion('');
        setNewAnswer('');
        setNewVideoUrl('');
        if (fileInput) fileInput.value = '';
        fetchKnowledgeBase();
      } else {
        setError('Saqlashda xatolik yuz berdi');
      }
    } catch (err) {
      setError('Tarmoq xatosi');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Rostdan ham o\'chirmoqchimisiz?')) return;
    
    try {
      const res = await fetch(`/api/knowledge/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchKnowledgeBase();
      } else {
        setError('O\'chirishda xatolik yuz berdi');
      }
    } catch (err) {
      setError('Tarmoq xatosi');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPassword('');
    setToken('');
    sessionStorage.removeItem('admin_token');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-amber-100 p-3 rounded-full mb-4 text-amber-600">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-500 text-sm mt-2">Bilimlar bazasini boshqarish</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Maxfiy parol</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Key className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl focus:ring-amber-500 focus:border-amber-500 text-gray-900 placeholder-gray-400 bg-gray-50 transition-colors"
                  placeholder="Parolni kiriting..."
                  required
                />
              </div>
              {loginError && (
                <p className="mt-2 text-sm text-red-600 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {loginError}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-all"
            >
              Kirish
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4 text-gray-900">
            <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Bilimlar Bazasi</h1>
              <p className="text-sm text-gray-500">Malika (AI) uchun ma'lumotlar bazasi</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Chiqish
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Add Form */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 bg-gray-50 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <Plus className="w-5 h-5 mr-2 text-amber-500" />
                  Qo'lda kiritish
                </h2>
              </div>
              <form onSubmit={handleAddKnowledge} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mijoz savoli (yoki mavzu)</label>
                  <textarea
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900 bg-white"
                    rows={2}
                    placeholder="Masalan: Yetkazib berish narxi qancha?"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Malika javobi (ma'lumot)</label>
                  <textarea
                    value={newAnswer}
                    onChange={(e) => setNewAnswer(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900 bg-white"
                    rows={4}
                    placeholder="Toshkent shahri ichida yetkazib berish 25,000 so'm..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rasm yuklash (ixtiyoriy)</label>
                  <input
                    type="file"
                    name="imageFile"
                    accept="image/*"
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">YouTube Video Link (ixtiyoriy)</label>
                  <input
                    type="url"
                    value={newVideoUrl}
                    onChange={(e) => setNewVideoUrl(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 focus:ring-amber-500 focus:border-amber-500 text-gray-900 bg-white"
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-all disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Qo\'shish'}
                </button>
              </form>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 bg-amber-50 border-b border-amber-100">
                <h2 className="text-lg font-semibold text-amber-900 flex items-center">
                  <Database className="w-5 h-5 mr-2 text-amber-600" />
                  Fayldan (PDF/Rasm) o'qish
                </h2>
                <p className="text-xs text-amber-700 mt-1">PDF narxnomalar yoki rasmli flayerlarni yuklang, AI o'zi matnni ajratib bazaga saqlaydi.</p>
              </div>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const fileInput = (e.target as HTMLFormElement).elements.namedItem('file') as HTMLInputElement;
                const file = fileInput.files?.[0];
                if (!file) return;

                setIsLoading(true);
                setError('');
                const formData = new FormData();
                formData.append('file', file);

                try {
                  const res = await fetch('/api/knowledge/upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                  });
                  
                  if (res.ok) {
                    fileInput.value = '';
                    fetchKnowledgeBase();
                  } else {
                    const data = await res.json();
                    setError(data.error || "Faylni o'qishda xatolik");
                  }
                } catch (err) {
                  setError('Tarmoq xatosi');
                } finally {
                  setIsLoading(false);
                }
              }} className="p-6 space-y-4">
                <div>
                  <input
                    type="file"
                    name="file"
                    accept=".pdf,image/png,image/jpeg,image/jpg"
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-all disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Faylni o\'qish va saqlash'}
                </button>
              </form>
            </div>
          </div>

          {/* List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Mavjud ma'lumotlar ro'yxati</h2>
                <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                  {knowledgeBase.length} ta
                </span>
              </div>
              
              <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                {isLoading && knowledgeBase.length === 0 ? (
                  <div className="p-12 flex justify-center text-amber-500">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                ) : knowledgeBase.length === 0 ? (
                  <div className="p-12 text-center text-gray-500 flex flex-col items-center">
                    <Database className="w-12 h-12 text-gray-300 mb-3" />
                    <p>Hozircha ma'lumot yo'q. Chap tomondagi forma orqali qo'shing.</p>
                  </div>
                ) : (
                  knowledgeBase.map((item) => (
                    <div key={item.id} className="p-6 hover:bg-gray-50 transition-colors group">
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-2 flex-1">
                          <div>
                            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Savol</span>
                            <p className="text-gray-900 font-medium mt-0.5">{item.question}</p>
                          </div>
                          <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Javob</span>
                            <p className="text-gray-700 text-sm mt-0.5 whitespace-pre-wrap">{item.answer}</p>
                          </div>
                          <p className="text-xs text-gray-400 mt-2">
                            Qo'shilgan vaqti: {new Date(item.created_at).toLocaleString('uz-UZ')}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="O'chirish"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
