import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, onSnapshot, addDoc } from 'firebase/firestore';
import { Trophy, Send, Loader2, BrainCircuit, RefreshCw, MessageSquare, ListFilter, Users, AlertCircle, Quote } from 'lucide-react';

/**
 * --- 修正說明 ---
 * 1. 將不相容的 MessageSquareQuote 替換為 MessageSquare 與 Quote。
 * 2. 確保匯入清單與實際使用的元件名稱一致。
 */

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {};

const appId = typeof __app_id !== 'undefined' ? __app_id : 'yearend-party-2025';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const QUESTIONS = [
  { id: 1, text: "公司今年最熱門的午餐外送是什麼？", reference: "雞排飯或健康餐盒" },
  { id: 2, text: "請問主管最常掛在嘴邊的「口頭禪」是什麼？", reference: "Sync一下、看數據" },
  { id: 3, text: "今年公司尾牙的主題色是什麼？", reference: "熱情紅" },
  { id: 4, text: "你覺得公司茶水間最需要增加什麼物資？", reference: "零食或咖啡豆" },
  { id: 5, text: "如果公司要開發一款 AI 工具，你覺得應該叫什麼名字？", reference: "創意名稱" },
  { id: 10, text: "公司尾牙頭獎如果不是現金，你最想要什麼？", reference: "休假券或iPhone" },
  { id: 15, text: "最後一題：請給今年的自己一個鼓勵的話！", reference: "積極向上的文字" }
];

const delay = (ms) => new Promise(res => setTimeout(res, ms));

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
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });

  const apiKey = ""; 

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setStatusMsg({ text: "身分驗證失敗", type: 'error' });
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const scoresCol = collection(db, 'artifacts', appId, 'public', 'data', 'scores');
    const unsubscribeScores = onSnapshot(scoresCol, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id }));
      setLeaderboard(data.sort((a, b) => (b.score || 0) - (a.score || 0)));
    });

    const feedCol = collection(db, 'artifacts', appId, 'public', 'data', 'feed');
    const unsubscribeFeed = onSnapshot(feedCol, (snapshot) => {
      setAnswerFeed(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => { unsubscribeScores(); unsubscribeFeed(); };
  }, [user]);

  const groupedFeed = useMemo(() => {
    return answerFeed.reduce((acc, curr) => {
      const qText = curr.question || "其他";
      if (!acc[qText]) acc[qText] = [];
      acc[qText].push(curr);
      acc[qText].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      return acc;
    }, {});
  }, [answerFeed]);

  const fetchWithRetry = async (prompt, reference, retries = 5) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `玩家回答：「${prompt}」` }] }],
            systemInstruction: { parts: [{ text: `你是幽默主持人。參考答案「${reference}」。回傳 JSON: {"score": 0-100, "feedback": "20字講評"}` }] },
            generationConfig: { responseMimeType: "application/json" }
          })
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        return JSON.parse(data.candidates[0].content.parts[0].text);
      } catch (err) {
        if (i === retries - 1) throw err;
        await delay(Math.pow(2, i) * 1000);
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
      if (user) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'scores', user.uid), { name: userName, score: newScore, updatedAt: Date.now() }, { merge: true });
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'feed'), { userName, question: QUESTIONS[currentIdx].text, answer, score: result.score, timestamp: Date.now() });
      }
      setTimeout(() => {
        if (currentIdx + 1 < QUESTIONS.length) {
          setCurrentIdx(prev => prev + 1);
          setCurrentInput('');
          setAiResult(null);
        } else { setGameState('END'); }
      }, 3000);
    } catch (e) {
      setStatusMsg({ text: "AI 評分暫時失敗", type: 'error' });
    } finally { setIsJudging(false); }
  };

  return (
    <div className="min-h-screen bg-[#05050a] text-slate-100 p-4 font-sans flex flex-col items-center">
      {statusMsg.text && (
        <div className="fixed top-6 bg-red-500/20 border border-red-500/50 p-4 rounded-xl z-50">
          {statusMsg.text}
        </div>
      )}

      <header className="w-full max-w-6xl flex justify-between items-center mb-10 border-b border-slate-800 pb-6">
        <div className="flex items-center gap-3">
          <BrainCircuit size={28} className="text-yellow-500" />
          <h1 className="text-xl font-black italic uppercase">AI Party Game</h1>
        </div>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          {gameState === 'LOBBY' ? (
            <div className="bg-slate-900 p-10 rounded-[40px] text-center space-y-6 shadow-2xl">
              <h2 className="text-4xl font-black">AI 創意機智賽</h2>
              <input type="text" className="w-full bg-slate-800 p-5 rounded-2xl text-center text-xl" placeholder="輸入暱稱" value={userName} onChange={(e)=>setUserName(e.target.value)} />
              <button onClick={()=>{if(userName) setGameState('PLAYING')}} className="w-full bg-yellow-500 text-black py-5 rounded-2xl font-black">開始遊戲</button>
            </div>
          ) : gameState === 'PLAYING' ? (
            <div className="space-y-6">
              <div className="bg-slate-900 p-10 rounded-[40px]">
                <h2 className="text-3xl font-bold">{QUESTIONS[currentIdx].text}</h2>
              </div>
              <textarea className="w-full min-h-[200px] bg-slate-900 p-10 rounded-[40px] text-xl outline-none focus:border-yellow-500" value={currentInput} onChange={(e)=>setCurrentInput(e.target.value)} placeholder="輸入回答..." />
              {!aiResult && !isJudging && <button onClick={()=>handleScoreAnswer(currentInput)} className="bg-yellow-500 text-black p-4 rounded-2xl">提交答案</button>}
              {aiResult && <div className="bg-white text-black p-8 rounded-[40px] font-bold">分數: +{aiResult.score} <br/> 「{aiResult.feedback}」</div>}
            </div>
          ) : (
            <div className="bg-slate-900 p-16 rounded-[40px] text-center">
              <Trophy size={60} className="text-yellow-500 mx-auto mb-4" />
              <h2 className="text-4xl font-black">遊戲結束</h2>
              <p className="text-6xl font-black text-yellow-500 mt-4">{totalScore}</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900 p-6 rounded-[32px] h-[400px] flex flex-col">
            <h3 className="text-xs font-black flex items-center gap-2 mb-4 text-blue-400">
              <MessageSquare size={16} /> 現場答案牆
            </h3>
            <div className="overflow-y-auto space-y-4">
              {Object.entries(groupedFeed).map(([q, ans]) => (
                <div key={q} className="space-y-2">
                  <p className="text-[10px] text-slate-500 uppercase">{q}</p>
                  {ans.slice(0, 3).map((a, i) => (
                    <div key={i} className="bg-slate-800 p-3 rounded-xl text-xs">
                      <div className="flex justify-between font-bold text-blue-300"><span>{a.userName}</span><span>+{a.score}</span></div>
                      <p className="mt-1">{a.answer}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
