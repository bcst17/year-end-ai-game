import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, addDoc } from 'firebase/firestore';
import { Trophy, User, Send, Volume2, Loader2, Sparkles, BrainCircuit, AlertCircle, RefreshCw, MessageSquareQuote, ChevronDown, ListFilter, Users } from 'lucide-react';

// --- Firebase 核心初始化 (Rule 3) ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'semantic-ai-quiz-v3';

// --- 15 道開放式題目 ---
const QUESTIONS = [
  { id: 1, text: "公司今年最熱門的午餐外送是什麼？", reference: "雞排飯或健康餐盒" },
  { id: 2, text: "請問主管最常掛在嘴邊的「口頭禪」是什麼？", reference: "Sync一下、看數據、有Q嗎" },
  { id: 3, text: "今年公司尾牙的主題色是什麼？", reference: "熱情紅" },
  { id: 4, text: "你覺得公司茶水間最需要增加什麼物資？", reference: "零食、咖啡豆或氣泡水" },
  { id: 5, text: "如果公司要開發一款 AI 工具，你覺得應該叫什麼名字？", reference: "創意名稱皆可" },
  { id: 6, text: "公司影印機故障時，通常第一個動作是？", reference: "重開機或拍打它" },
  { id: 7, text: "今年最讓你印象深刻的公司大事是？", reference: "導入AI、擴建、或成功上市" },
  { id: 8, text: "如果要用一個成語形容你的部門，會是？", reference: "任何正面或幽默的成語" },
  { id: 9, text: "你覺得老闆最喜歡的運動是什麼？", reference: "高爾夫、馬拉松或看報表" },
  { id: 10, text: "公司尾牙頭獎如果不是現金，你最想要什麼？", reference: "休假券、iPhone或出國機票" },
  { id: 11, text: "在辦公室裡，誰是公認的 AI 達人？", reference: "IT部門或特定同仁名字" },
  { id: 12, text: "請描述一下公司明年的發展願景。", reference: "業績長紅、領先業界" },
  { id: 13, text: "你覺得哪一個月份的工作量最爆炸？", reference: "11月或12月" },
  { id: 14, text: "如果要把主管比喻成一種動物，你會選？", reference: "獅子、貓咪、或是招財貓" },
  { id: 15, text: "最後一題：請給今年的自己一個鼓勵的話！", reference: "任何積極向上的文字" }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [gameState, setGameState] = useState('LOBBY'); 
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentInput, setCurrentInput] = useState('');
  const [totalScore, setTotalScore] = useState(0);
  const [isJudging, setIsJudging] = useState(false);
  const [aiResult, setAiResult] = useState(null); 
  const [leaderboard, setLeaderboard] = useState([]);
  const [answerFeed, setAnswerFeed] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const apiKey = ""; 

  // 1. 初始化 Auth (嚴格遵循 Rule 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setErrorMsg("身份驗證失敗，請重整頁面。");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // 2. 監聽公開資料 (遵循 Rule 1, 2)
  useEffect(() => {
    if (!user) return;
    
    // 監聽排行榜：確保路徑為公共路徑
    const scoreCol = collection(db, 'artifacts', appId, 'public', 'data', 'scores');
    const unsubscribeScores = onSnapshot(scoreCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      // 確保 score 是數字並進行全員排序
      const sortedData = [...data].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
      setLeaderboard(sortedData);
    }, (err) => console.error("Leaderboard listen failed:", err));

    // 監聽即時答案牆
    const feedCol = collection(db, 'artifacts', appId, 'public', 'data', 'feed');
    const unsubscribeFeed = onSnapshot(feedCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAnswerFeed(data);
    }, (err) => console.error("Feed listen failed:", err));

    return () => {
      unsubscribeScores();
      unsubscribeFeed();
    };
  }, [user]);

  // 分類答案邏輯 (按題目分類)
  const groupedFeed = useMemo(() => {
    return answerFeed.reduce((acc, curr) => {
      const qText = curr.question;
      if (!acc[qText]) acc[qText] = [];
      acc[qText].push(curr);
      acc[qText].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      return acc;
    }, {});
  }, [answerFeed]);

  // 3. AI 評分核心邏輯
  const scoreWithAI = async (userAnswer, reference) => {
    setIsJudging(true);
    setAiResult(null);

    const systemPrompt = `你是一位幽默的尾牙主持人。參考答案：「${reference}」。根據相關性給 0-100 分。回傳 JSON: {"score": 數字, "feedback": "20字內講評"}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `玩家回答：「${userAnswer}」` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const result = text ? JSON.parse(text) : { score: 0, feedback: "AI 分心了..." };
      
      const newTotal = totalScore + result.score;
      setAiResult(result);
      setTotalScore(newTotal);

      // A. 更新個人總分
      const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'scores', user.uid);
      await setDoc(userDocRef, { 
        score: newTotal,
        name: userName,
        uid: user.uid,
        updatedAt: Date.now() 
      }, { merge: true });

      // B. 發布到即時答案牆
      const feedColRef = collection(db, 'artifacts', appId, 'public', 'data', 'feed');
      await addDoc(feedColRef, {
        userName,
        question: QUESTIONS[currentIdx].text,
        answer: userAnswer,
        score: result.score,
        feedback: result.feedback,
        timestamp: Date.now()
      });

      return result;
    } catch (e) {
      console.error(e);
      return { score: 50, feedback: "網路擁塞，給你友情分！" };
    } finally {
      setIsJudging(false);
    }
  };

  const handleStart = async () => {
    if (!userName.trim() || !user) return;
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'scores', user.uid);
      await setDoc(userDocRef, { 
        name: userName, 
        score: 0, 
        uid: user.uid, 
        timestamp: Date.now() 
      }, { merge: true });
      setGameState('PLAYING');
    } catch (err) {
      setErrorMsg("資料初始化失敗。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentInput.trim() || isJudging) return;
    await scoreWithAI(currentInput, QUESTIONS[currentIdx].reference);
    
    setTimeout(() => {
      if (currentIdx + 1 < QUESTIONS.length) {
        setCurrentIdx(currentIdx + 1);
        setCurrentInput('');
        setAiResult(null);
      } else {
        setGameState('END');
      }
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 font-sans selection:bg-yellow-500/20 flex flex-col items-center">
      {/* 頁首 */}
      <header className="w-full max-w-7xl flex justify-between items-center mb-8 h-16">
        <div className="flex items-center gap-2">
          <div className="bg-yellow-500 p-2 rounded-xl shadow-lg shadow-yellow-500/10">
            <BrainCircuit size={24} className="text-slate-900" />
          </div>
          <h1 className="text-xl font-black italic tracking-tighter uppercase">AI Party Live</h1>
        </div>
        {user && (
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-full shadow-lg">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold opacity-80">{userName || 'Connecting...'}</span>
          </div>
        )}
      </header>

      <main className="w-full max-w-7xl flex-grow">
        {gameState === 'LOBBY' && (
          <div className="max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-[40px] p-10 text-center space-y-8 animate-in fade-in zoom-in duration-500 shadow-2xl">
            <h2 className="text-5xl font-black tracking-tighter uppercase leading-tight">即時<br/><span className="text-yellow-500 underline decoration-4 underline-offset-8">智慧擂台</span></h2>
            <p className="text-slate-500 font-medium italic text-sm">大家的答案將依題目分類即時呈現！</p>
            
            <div className="space-y-4">
              {errorMsg && <p className="text-red-400 text-xs bg-red-400/10 py-2 rounded-lg">{errorMsg}</p>}
              <input 
                type="text" 
                maxLength={10}
                placeholder="輸入您的參賽暱稱" 
                className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl px-6 py-4 focus:border-yellow-500 outline-none text-center text-xl font-bold transition-all shadow-inner"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                disabled={isLoading}
              />
              <button 
                onClick={handleStart}
                disabled={!userName.trim() || isLoading || !authReady}
                className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-slate-950 font-black py-5 rounded-2xl text-xl transition-all active:scale-95 flex items-center justify-center gap-3 shadow-xl shadow-yellow-500/10"
              >
                {isLoading ? <Loader2 className="animate-spin" /> : <>進入賽場 <Send size={20} /></>}
              </button>
            </div>
          </div>
        )}

        {(gameState === 'PLAYING' || gameState === 'END') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in slide-in-from-bottom duration-500 h-full max-h-[1200px]">
            
            {/* 左側：主交互區 */}
            <div className="lg:col-span-7 space-y-6 flex flex-col h-full">
              {gameState === 'PLAYING' ? (
                <>
                  <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px] shadow-xl">
                    <span className="bg-yellow-500/10 text-yellow-500 text-[10px] font-black px-3 py-1 rounded-full border border-yellow-500/20 uppercase tracking-widest">
                      Q{currentIdx + 1} / {QUESTIONS.length}
                    </span>
                    <h2 className="text-3xl font-bold mt-4 leading-tight">{QUESTIONS[currentIdx].text}</h2>
                  </div>

                  <div className="relative group flex-grow">
                    <textarea 
                      value={currentInput}
                      onChange={(e) => setCurrentInput(e.target.value)}
                      placeholder="您的答案將會依題目分類公開..."
                      className="w-full h-full min-h-[250px] bg-slate-900 border-2 border-slate-800 rounded-[32px] p-8 text-xl outline-none focus:border-yellow-500 transition-all resize-none shadow-xl disabled:opacity-50"
                      disabled={isJudging || aiResult}
                    />
                    {!aiResult && !isJudging && (
                      <button onClick={handleSubmit} className="absolute bottom-6 right-6 bg-yellow-500 p-4 rounded-2xl text-slate-950 shadow-lg hover:scale-110 active:scale-90 transition-all">
                        <Send size={24} />
                      </button>
                    )}
                  </div>

                  <div className="min-h-[120px]">
                    {isJudging && (
                      <div className="bg-slate-900/40 border border-dashed border-slate-700 p-8 rounded-[32px] flex flex-col items-center justify-center gap-3 animate-pulse">
                        <Loader2 className="animate-spin text-yellow-500" size={24} />
                        <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest">AI 正在審閱並同步分類動態牆...</p>
                      </div>
                    )}
                    {aiResult && (
                      <div className="bg-slate-900 border-2 border-yellow-500/40 p-8 rounded-[32px] flex flex-col md:flex-row gap-6 items-center animate-in zoom-in">
                        <div className="text-center min-w-[100px]">
                          <p className="text-[10px] text-slate-500 font-black uppercase mb-1">獲得分數</p>
                          <div className="text-5xl font-black text-yellow-500">+{aiResult.score}</div>
                        </div>
                        <div className="w-px h-12 bg-slate-800 hidden md:block" />
                        <div className="flex-1">
                          <p className="text-lg italic font-medium text-slate-200">「{aiResult.feedback}」</p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-12 text-center space-y-8 h-full flex flex-col justify-center items-center shadow-2xl min-h-[400px]">
                  <Trophy size={64} className="text-yellow-500 mb-2 drop-shadow-lg" />
                  <h2 className="text-5xl font-black italic tracking-tighter uppercase">挑戰結束</h2>
                  <div className="bg-slate-950 p-8 rounded-[32px] border border-slate-800 w-full max-w-sm shadow-inner">
                    <p className="text-[10px] font-black text-slate-600 uppercase mb-2">您的最終分數</p>
                    <p className="text-7xl font-black text-yellow-500 tabular-nums">{totalScore}</p>
                  </div>
                  <button onClick={() => window.location.reload()} className="text-slate-500 hover:text-white transition-all font-bold text-sm uppercase flex items-center gap-2">
                    <RefreshCw size={16} /> 重新挑戰
                  </button>
                </div>
              )}
            </div>

            {/* 右側：分類動態牆與全員排行榜 */}
            <div className="lg:col-span-5 flex flex-col gap-6 h-full min-h-[600px]">
              
              {/* 1. 分類動態牆 (佔比 3) */}
              <div className="bg-slate-900 rounded-[32px] p-6 border border-slate-800 flex flex-col flex-[3] shadow-2xl overflow-hidden min-h-[300px]">
                <h3 className="text-sm font-black flex items-center gap-2 pb-4 border-b border-slate-800 uppercase tracking-widest text-blue-400">
                  <ListFilter size={18} /> 分類動態牆 (按題目區分)
                </h3>
                <div className="flex-grow overflow-y-auto mt-4 space-y-6 pr-2 custom-scrollbar">
                  {Object.keys(groupedFeed).length === 0 ? (
                    <p className="text-center text-slate-700 py-10 italic">尚未有回答紀錄...</p>
                  ) : (
                    Object.entries(groupedFeed).map(([qText, answers]) => (
                      <div key={qText} className="space-y-3">
                        <div className="flex items-center gap-2 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700 sticky top-0 z-10">
                          <MessageSquareQuote size={14} className="text-yellow-500 flex-shrink-0" />
                          <span className="text-xs font-bold text-slate-300 truncate">{qText}</span>
                        </div>
                        <div className="space-y-2 pl-2">
                          {answers.map((msg, idx) => (
                            <div key={`${msg.id}-${idx}`} className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/30 animate-in slide-in-from-right text-xs">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-black text-blue-400">{msg.userName}</span>
                                <span className="text-yellow-500 font-bold">+{msg.score} 分</span>
                              </div>
                              <p className="text-slate-200">「{msg.answer}」</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 2. 全員排行榜 (佔比 2) - Debug 核心區 */}
              <div className="bg-slate-900 rounded-[32px] p-6 border border-slate-800 flex flex-col flex-[2] shadow-2xl overflow-hidden min-h-[250px]">
                <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                  <h3 className="text-sm font-black flex items-center gap-2 uppercase tracking-widest text-yellow-500">
                    <Trophy size={16} /> 全員排行榜
                  </h3>
                  <div className="bg-slate-800 px-2 py-1 rounded-md flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                    <Users size={12} />
                    <span>共 {leaderboard.length} 人</span>
                  </div>
                </div>
                
                <div className="flex-grow overflow-y-auto mt-4 space-y-2 pr-2 custom-scrollbar">
                  {leaderboard.length === 0 ? (
                    <p className="text-center text-slate-700 py-10 italic">等待參賽者加入...</p>
                  ) : (
                    leaderboard.map((entry, i) => (
                      <div 
                        key={entry.id || i} 
                        className={`flex justify-between items-center p-3 rounded-xl transition-all ${entry.uid === user?.uid ? 'bg-white text-slate-950 shadow-xl ring-2 ring-yellow-500 animate-pulse-slow' : 'bg-slate-800/40 hover:bg-slate-800/60'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-black w-6 text-center ${entry.uid === user?.uid ? 'text-slate-900' : i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-400' : 'opacity-40'}`}>
                            {i + 1}
                          </span>
                          <span className="font-bold text-sm truncate max-w-[140px]">{entry.name || '無名氏'}</span>
                        </div>
                        <span className="font-black tabular-nums">{Number(entry.score) || 0}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </main>

      <footer className="mt-8 text-center opacity-20 pb-8 tracking-[0.3em] text-[8px] uppercase">
        Multi-Player Semantic AI System v5.1 | Stable Release
      </footer>
    </div>
  );
}
