import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, addDoc, getDoc } from 'firebase/firestore';
import { Trophy, Send, Loader2, BrainCircuit, RefreshCw, MessageSquareQuote, ListFilter, Users, AlertCircle } from 'lucide-react';

// --- 環境變數與 Firebase 初始化 ---
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {};

const appId = typeof __app_id !== 'undefined' ? __app_id : 'yearend-party-2025';

// 初始化實例 (全域)
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 遊戲題目配置
const QUESTIONS = [
  { id: 1, text: "公司今年最熱門的午餐外送是什麼？", reference: "雞排飯或健康餐盒" },
  { id: 2, text: "請問主管最常掛在嘴邊的「口頭禪」是什麼？", reference: "Sync一下、看數據" },
  { id: 3, text: "今年公司尾牙的主題色是什麼？", reference: "熱情紅" },
  { id: 4, text: "你覺得公司茶水間最需要增加什麼物資？", reference: "零食或咖啡豆" },
  { id: 5, text: "如果公司要開發一款 AI 工具，你覺得應該叫什麼名字？", reference: "創意名稱" },
  { id: 10, text: "公司尾牙頭獎如果不是現金，你最想要什麼？", reference: "休假券或iPhone" },
  { id: 15, text: "最後一題：請給今年的自己一個鼓勵的話！", reference: "積極向上的文字" }
];

// 指數退避延遲函數
const delay = (ms) => new Promise(res => setTimeout(res, ms));

export default function App() {
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [gameState, setGameState] = useState('LOBBY'); // LOBBY, PLAYING, END
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentInput, setCurrentInput] = useState('');
  const [totalScore, setTotalScore] = useState(0);
  const [isJudging, setIsJudging] = useState(false);
  const [aiResult, setAiResult] = useState(null); 
  const [leaderboard, setLeaderboard] = useState([]);
  const [answerFeed, setAnswerFeed] = useState([]);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' }); // info, error

  // Gemini API 設定
  const apiKey = ""; 

  // --- 1. 身分驗證流程 (Rule 3) ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        setStatusMsg({ text: "身分驗證失敗，請重新整理頁面", type: 'error' });
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // --- 2. Firestore 資料監聽 (Rule 1 & 2) ---
  useEffect(() => {
    if (!user) return;

    // 監聽排行榜
    const scoresCol = collection(db, 'artifacts', appId, 'public', 'data', 'scores');
    const unsubscribeScores = onSnapshot(scoresCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id }));
      // 記憶體內排序 (Rule 2)
      setLeaderboard(data.sort((a, b) => (b.score || 0) - (a.score || 0)));
    }, (err) => {
      console.error("Leaderboard error:", err);
      setStatusMsg({ text: "無法連接即時排行榜", type: 'error' });
    });

    // 監聽答題動態
    const feedCol = collection(db, 'artifacts', appId, 'public', 'data', 'feed');
    const unsubscribeFeed = onSnapshot(feedCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAnswerFeed(data);
    }, (err) => console.error("Feed error:", err));

    return () => {
      unsubscribeScores();
      unsubscribeFeed();
    };
  }, [user]);

  // 分組處理動態牆資料
  const groupedFeed = useMemo(() => {
    return answerFeed.reduce((acc, curr) => {
      const qText = curr.question || "其他";
      if (!acc[qText]) acc[qText] = [];
      acc[qText].push(curr);
      // 按時間降序排序
      acc[qText].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      return acc;
    }, {});
  }, [answerFeed]);

  // --- 3. Gemini AI 評分 (含指數退避) ---
  const fetchWithRetry = async (prompt, reference, retries = 5) => {
    const systemPrompt = `你是一位幽默的尾牙主持人。參考答案是「${reference}」。
    請依據玩家回答的創意度、幽默感給予 0-100 分。
    請嚴格回傳 JSON 格式：{"score": 數字, "feedback": "20字以內的毒舌或鼓勵"}`;

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `玩家回答：「${prompt}」` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: "application/json" }
          })
        });

        if (!response.ok) throw new Error('API request failed');
        
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return JSON.parse(text);
      } catch (err) {
        if (i === retries - 1) throw err;
        await delay(Math.pow(2, i) * 1000); // 1s, 2s, 4s, 8s, 16s
      }
    }
  };

  const handleScoreAnswer = async (answer) => {
    if (!answer.trim() || isJudging) return;
    setIsJudging(true);
    setAiResult(null);

    try {
      const result = await fetchWithRetry(answer, QUESTIONS[currentIdx].reference);
      const newScore = totalScore + result.score;
      setTotalScore(newScore);
      setAiResult(result);

      // 同步到 Firestore
      if (user) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'scores', user.uid), {
          name: userName,
          score: newScore,
          updatedAt: Date.now()
        }, { merge: true });

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'feed'), {
          userName,
          question: QUESTIONS[currentIdx].text,
          answer: answer,
          score: result.score,
          timestamp: Date.now()
        });
      }

      // 延遲跳轉下一題
      setTimeout(() => {
        if (currentIdx + 1 < QUESTIONS.length) {
          setCurrentIdx(prev => prev + 1);
          setCurrentInput('');
          setAiResult(null);
        } else {
          setGameState('END');
        }
      }, 3000);

    } catch (e) {
      console.error(e);
      setStatusMsg({ text: "AI 暫時離線，請稍後再試", type: 'error' });
    } finally {
      setIsJudging(false);
    }
  };

  const handleStartGame = async () => {
    if (!userName.trim() || !user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'scores', user.uid), {
        name: userName,
        score: 0,
        updatedAt: Date.now()
      }, { merge: true });
      setGameState('PLAYING');
    } catch (err) {
      setStatusMsg({ text: "無法登錄參賽資料", type: 'error' });
    }
  };

  return (
    <div className="min-h-screen bg-[#05050a] text-slate-100 p-4 md:p-8 font-sans flex flex-col items-center">
      {/* 頂部導航欄 */}
      <header className="w-full max-w-6xl flex justify-between items-center mb-10 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500 rounded-xl rotate-3 shadow-lg shadow-yellow-500/20">
            <BrainCircuit size={28} className="text-black" />
          </div>
          <h1 className="text-2xl font-black italic tracking-tighter uppercase text-white">
            Year-End <span className="text-yellow-500">AI Challenge</span>
          </h1>
        </div>
        <div className="hidden md:flex items-center gap-3 bg-slate-900 border border-slate-800 px-5 py-2.5 rounded-2xl shadow-xl">
          <div className={`w-2.5 h-2.5 rounded-full ${user ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500'} animate-pulse`} />
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {user ? `線上伺服器: 已連線` : '正在建立連線...'}
          </span>
        </div>
      </header>

      {/* 錯誤提示浮窗 */}
      {statusMsg.text && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl animate-in slide-in-from-top duration-300 ${statusMsg.type === 'error' ? 'bg-red-500/20 border border-red-500/50 text-red-100' : 'bg-blue-500/20 border border-blue-500/50 text-blue-100'}`}>
          <AlertCircle size={20} />
          <span className="font-bold">{statusMsg.text}</span>
          <button onClick={() => setStatusMsg({text:'', type:''})} className="ml-4 opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* 左側：主遊戲區 */}
        <div className="lg:col-span-8 space-y-6">
          {gameState === 'LOBBY' && (
            <div className="bg-slate-900 border border-slate-800 rounded-[48px] p-10 text-center space-y-8 animate-in zoom-in shadow-2xl">
              <div className="space-y-4">
                <span className="text-yellow-500 text-sm font-black tracking-[0.3em] uppercase">2025 尾牙限定</span>
                <h2 className="text-6xl font-black tracking-tight text-white leading-none">
                  AI 創意<br/><span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">機智大考驗</span>
                </h2>
                <p className="text-slate-400 max-w-md mx-auto leading-relaxed">
                  輸入你的大名，並在接下來的題目中發揮創意！AI 主持人會即時針對你的回答給分並公佈於大螢幕。
                </p>
              </div>

              <div className="max-w-sm mx-auto space-y-4">
                <input 
                  type="text" 
                  maxLength={15}
                  placeholder="輸入參賽暱稱" 
                  className="w-full bg-slate-800/50 border-2 border-slate-700 rounded-[24px] px-8 py-5 focus:border-yellow-500 outline-none text-center text-xl font-bold transition-all text-white placeholder:text-slate-600"
                  value={userName} 
                  onChange={(e) => setUserName(e.target.value)} 
                />
                <button 
                  onClick={handleStartGame} 
                  disabled={!userName.trim() || !user}
                  className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-20 text-black font-black py-5 rounded-[24px] text-xl transition-all active:scale-95 shadow-lg shadow-yellow-500/20 flex items-center justify-center gap-2"
                >
                  {user ? '🚀 開始挑戰' : <Loader2 className="animate-spin" />}
                </button>
              </div>
            </div>
          )}

          {gameState === 'PLAYING' && (
            <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
              <div className="bg-slate-900 border border-slate-800 p-10 rounded-[40px] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5">
                   <BrainCircuit size={120} />
                </div>
                <div className="flex items-center gap-3 mb-6">
                  <span className="bg-yellow-500 text-black text-[10px] font-black px-4 py-1 rounded-full uppercase tracking-tighter">
                    Question {currentIdx + 1} / {QUESTIONS.length}
                  </span>
                </div>
                <h2 className="text-4xl font-bold leading-tight text-white">{QUESTIONS[currentIdx].text}</h2>
              </div>

              <div className="relative">
                <textarea 
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  disabled={isJudging || !!aiResult}
                  className="w-full min-h-[220px] bg-slate-900 border-2 border-slate-800 rounded-[40px] p-10 text-2xl outline-none focus:border-yellow-500 transition-all resize-none shadow-2xl text-white placeholder:text-slate-700"
                  placeholder="輸入你的創意回答..."
                />
                {!aiResult && !isJudging && (
                  <button 
                    onClick={() => handleScoreAnswer(currentInput)}
                    className="absolute bottom-8 right-8 bg-yellow-500 p-5 rounded-3xl text-black shadow-xl hover:scale-105 active:scale-90 transition-all"
                  >
                    <Send size={28} />
                  </button>
                )}
              </div>

              {/* 評分反饋區 */}
              <div className="min-h-[140px]">
                {isJudging && (
                  <div className="bg-yellow-500/10 border-2 border-dashed border-yellow-500/30 p-10 rounded-[40px] flex flex-col items-center justify-center gap-4 animate-pulse">
                    <Loader2 className="animate-spin text-yellow-500" size={32} />
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-yellow-500">AI 主持人正在審閱你的答案...</p>
                  </div>
                )}

                {aiResult && (
                  <div className="bg-white border-none p-10 rounded-[40px] flex flex-col md:flex-row gap-8 items-center animate-in zoom-in shadow-2xl">
                    <div className="text-center md:border-r border-slate-200 pr-0 md:pr-10">
                      <p className="text-[10px] text-slate-400 font-black uppercase mb-1">獲得評分</p>
                      <div className="text-6xl font-black text-black">+{aiResult.score}</div>
                    </div>
                    <div className="flex-1">
                      <p className="text-xl italic font-bold text-slate-800 leading-relaxed text-center md:text-left">
                        「{aiResult.feedback}」
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {gameState === 'END' && (
            <div className="bg-slate-900 border border-slate-800 rounded-[48px] p-16 text-center flex flex-col items-center shadow-2xl animate-in zoom-in">
              <div className="w-24 h-24 bg-yellow-500 rounded-full flex items-center justify-center mb-8 shadow-lg shadow-yellow-500/30">
                <Trophy size={48} className="text-black" />
              </div>
              <h2 className="text-5xl font-black uppercase italic tracking-tighter text-white mb-2">任務達成！</h2>
              <p className="text-slate-400 mb-10 font-medium">恭喜完成挑戰，去看看你在全公司的排名吧！</p>
              
              <div className="bg-slate-950 p-10 rounded-[40px] border border-slate-800 w-full max-w-md shadow-inner mb-10">
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">最終累計積分</p>
                <p className="text-8xl font-black text-yellow-500 tracking-tighter tabular-nums">{totalScore}</p>
              </div>

              <button 
                onClick={() => window.location.reload()} 
                className="flex items-center gap-3 text-slate-500 hover:text-white transition-all font-bold text-sm uppercase tracking-widest"
              >
                <RefreshCw size={18} /> 重新開始
              </button>
            </div>
          )}
        </div>

        {/* 右側：即時資訊板 */}
        <div className="lg:col-span-4 space-y-6 flex flex-col">
          {/* 即時動態 */}
          <div className="bg-slate-900 rounded-[40px] p-8 border border-slate-800 flex flex-col h-[420px] shadow-2xl">
            <div className="flex items-center justify-between pb-6 border-b border-slate-800 mb-6">
              <h3 className="text-xs font-black flex items-center gap-2 uppercase tracking-widest text-blue-400">
                <MessageSquareQuote size={18} /> 即時答案牆
              </h3>
            </div>
            <div className="flex-grow overflow-y-auto space-y-8 pr-2 custom-scrollbar">
              {Object.keys(groupedFeed).length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-700 italic text-sm">等待同仁提交中...</div>
              ) : (
                Object.entries(groupedFeed).map(([qText, answers]) => (
                  <div key={qText} className="space-y-4">
                    <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-2 rounded-xl border border-slate-700">
                      <span className="text-[10px] font-bold text-slate-400 truncate">{qText}</span>
                    </div>
                    <div className="space-y-3 pl-2 border-l-2 border-slate-800">
                      {answers.slice(0, 5).map((msg, idx) => (
                        <div key={idx} className="bg-slate-800/20 p-4 rounded-2xl border border-slate-700/30 text-xs animate-in slide-in-from-right">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-black text-blue-400">{msg.userName}</span>
                            <span className="text-yellow-500 font-black">+{msg.score}</span>
                          </div>
                          <p className="text-slate-200 line-clamp-2 leading-relaxed font-medium">「{msg.answer}」</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 排行榜 */}
          <div className="bg-slate-900 rounded-[40px] p-8 border border-slate-800 flex flex-col h-[320px] shadow-2xl">
            <div className="flex justify-between items-center pb-6 border-b border-slate-800 mb-6">
              <h3 className="text-xs font-black flex items-center gap-2 uppercase tracking-widest text-yellow-500">
                <Trophy size={18} /> 積分龍虎榜
              </h3>
              <div className="bg-slate-800 px-3 py-1 rounded-full text-[10px] font-black text-slate-400 flex items-center gap-2">
                <Users size={12} /> {leaderboard.length} 人參賽
              </div>
            </div>
            <div className="flex-grow overflow-y-auto space-y-2.5 pr-2 custom-scrollbar">
              {leaderboard.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-700 italic text-sm">暫無排名資料</div>
              ) : (
                leaderboard.map((entry, i) => (
                  <div 
                    key={i} 
                    className={`flex justify-between items-center p-4 rounded-2xl transition-all ${user && entry.uid === user.uid ? 'bg-yellow-500 text-black shadow-lg scale-105' : 'bg-slate-800/40'}`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`text-xs font-black w-5 ${user && entry.uid === user.uid ? 'text-black' : 'text-slate-500'}`}>
                        {i + 1}.
                      </span>
                      <span className="font-bold text-sm truncate max-w-[120px]">
                        {entry.name || '訪客'}
                      </span>
                    </div>
                    <span className="font-black tabular-nums">{entry.score || 0}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-16 text-center opacity-20 pb-10 tracking-[0.5em] text-[10px] uppercase text-slate-500">
        Powered by AI Sync & Multi-User Engine v2.0
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>
    </div>
  );
}
