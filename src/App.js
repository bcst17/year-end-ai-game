import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Send, Loader2, BrainCircuit, RefreshCw, MessageSquare, ListFilter, Users, Sparkles, Zap } from 'lucide-react';

/**
 * --- 尾牙 AI 互動擂台：圖示相容修正版 ---
 * 修正重點：
 * 1. 解決 lucide-react 版本相容性問題：將 MessageSquareText 改為 MessageSquare。
 * 2. 移除所有 Firebase 依賴，確保單機運作絕對穩定。
 * 3. 優化 Vercel Build 流程，排除所有因圖示名稱導致的導出錯誤。
 */

// --- 輔助函式：安全讀取環境變數 ---
const getSafeEnv = (key) => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) { return ""; }
  return "";
};

const QUESTIONS = [
  { id: 1, text: "公司今年最熱門的午餐外送是什麼？", reference: "雞排飯或健康餐盒" },
  { id: 2, text: "請問主管最常掛在嘴邊的「口頭禪」是什麼？", reference: "Sync一下、看數據" },
  { id: 3, text: "今年公司尾牙的主題色是什麼？", reference: "熱情紅" },
  { id: 4, text: "你覺得公司茶水間最需要增加什麼物資？", reference: "零食或咖啡豆" },
  { id: 5, text: "如果公司要開發一款 AI 工具，你覺得應該叫什麼名字？", reference: "創意名稱" },
  { id: 6, text: "公司影印機故障時，通常第一個動作是？", reference: "重開機" },
  { id: 10, text: "公司尾牙頭獎如果不是現金，你最想要什麼？", reference: "休假券或iPhone" },
  { id: 15, text: "最後一題：請給今年的自己一個鼓勵的話！", reference: "積極向上的文字" }
];

export default function App() {
  const [userName, setUserName] = useState('');
  const [gameState, setGameState] = useState('LOBBY'); 
  const [currentIdx, setCurrentIdx] = useState(0);
  const [currentInput, setCurrentInput] = useState('');
  const [totalScore, setTotalScore] = useState(0);
  const [isJudging, setIsJudging] = useState(false);
  const [aiResult, setAiResult] = useState(null); 
  const [localHistory, setLocalHistory] = useState([]); 

  const apiKey = getSafeEnv('REACT_APP_GEMINI_API_KEY') || ""; 

  const groupedFeed = useMemo(() => {
    return localHistory.reduce((acc, curr) => {
      const qText = String(curr.question || "未分類");
      if (!acc[qText]) acc[qText] = [];
      acc[qText].push(curr);
      return acc;
    }, {});
  }, [localHistory]);

  const scoreWithAI = async (userAnswer, reference) => {
    if (!apiKey) {
      alert("請在 Vercel 設定 REACT_APP_GEMINI_API_KEY 金鑰。");
      return;
    }
    setIsJudging(true);
    setAiResult(null);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `玩家回答：「${userAnswer}」` }] }],
          systemInstruction: { parts: [{ text: `你是一位幽默主持人。參考答案：「${reference}」。請依據創意給 0-100 分。必須回傳 JSON: {"score": 數字, "feedback": "20字講評"}` }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const result = text ? JSON.parse(text) : { score: 10, feedback: "AI 出神了..." };
      
      const newTotal = totalScore + result.score;
      setAiResult(result);
      setTotalScore(newTotal);

      setLocalHistory(prev => [{
        userName,
        question: QUESTIONS[currentIdx].text,
        answer: userAnswer,
        score: result.score,
        feedback: result.feedback,
        timestamp: Date.now()
      }, ...prev]);

    } catch (e) {
      setAiResult({ score: 50, feedback: "網路擁塞，給你友情分！" });
      setTotalScore(totalScore + 50);
    } finally {
      setIsJudging(false);
    }
  };

  const handleStart = () => {
    if (!userName.trim()) return;
    setGameState('PLAYING');
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
    }, 3500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 font-sans flex flex-col items-center">
      <header className="w-full max-w-7xl flex justify-between items-center mb-8 h-16 border-b border-slate-900 pb-4">
        <div className="flex items-center gap-2">
          <BrainCircuit size={32} className="text-yellow-500" />
          <h1 className="text-xl font-black italic tracking-tighter uppercase text-white">AI Party Solo</h1>
        </div>
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-full shadow-lg">
          <Zap size={14} className="text-yellow-500 fill-yellow-500" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">穩定單機版</span>
        </div>
      </header>

      <main className="w-full max-w-7xl flex-grow">
        {gameState === 'LOBBY' && (
          <div className="max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-[40px] p-10 text-center space-y-8 animate-in fade-in zoom-in duration-500 shadow-2xl">
            <h2 className="text-5xl font-black tracking-tighter uppercase leading-tight text-white">尾牙<br/><span className="text-yellow-500 underline decoration-4 underline-offset-8 text-white">智慧大擂台</span></h2>
            <div className="space-y-4">
              <input type="text" maxLength={10} placeholder="輸入您的參賽暱稱" className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl px-6 py-4 focus:border-yellow-500 outline-none text-center text-xl font-bold transition-all text-white" value={userName} onChange={(e) => setUserName(e.target.value)} />
              <button onClick={handleStart} disabled={!userName.trim()} className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-slate-950 font-black py-5 rounded-2xl text-xl transition-all active:scale-95 shadow-xl shadow-yellow-500/10">
                🚀 進入賽場
              </button>
            </div>
          </div>
        )}

        {(gameState === 'PLAYING' || gameState === 'END') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-[600px] animate-in slide-in-from-bottom duration-500">
            <div className="lg:col-span-7 space-y-6 flex flex-col h-full">
              {gameState === 'PLAYING' ? (
                <>
                  <div className="bg-slate-900 border border-slate-800 p-8 rounded-[32px] shadow-xl">
                    <span className="bg-yellow-500/10 text-yellow-500 text-[10px] font-black px-3 py-1 rounded-full border border-yellow-500/20 uppercase tracking-widest">Q{currentIdx + 1} / {QUESTIONS.length}</span>
                    <h2 className="text-3xl font-bold mt-4 leading-tight text-white">{QUESTIONS[currentIdx].text}</h2>
                  </div>
                  <div className="relative group flex-grow">
                    <textarea value={currentInput} onChange={(e) => setCurrentInput(e.target.value)} className="w-full h-full min-h-[250px] bg-slate-900 border-2 border-slate-800 rounded-[32px] p-8 text-xl outline-none focus:border-yellow-500 transition-all resize-none shadow-xl text-white" disabled={isJudging || aiResult} placeholder="在此輸入答案..." />
                    {!aiResult && !isJudging && (
                      <button onClick={handleSubmit} className="absolute bottom-6 right-6 bg-yellow-500 p-4 rounded-2xl text-slate-950 shadow-lg hover:scale-110 active:scale-90 transition-all">
                        <Send size={24} />
                      </button>
                    )}
                  </div>
                  <div className="min-h-[120px]">
                    {isJudging && <div className="bg-slate-900/40 border border-dashed border-slate-700 p-8 rounded-[32px] flex flex-col items-center justify-center gap-3 animate-pulse text-slate-500"><Loader2 className="animate-spin text-yellow-500" /><p className="text-[10px] font-black uppercase tracking-widest">AI 正在審閱答案...</p></div>}
                    {aiResult && <div className="bg-slate-900 border-2 border-yellow-500/40 p-8 rounded-[32px] flex flex-col md:flex-row gap-6 items-center animate-in zoom-in shadow-2xl"><div className="min-w-[100px] text-center"><p className="text-[10px] text-slate-500 font-black uppercase mb-1">獲得分數</p><div className="text-5xl font-black text-yellow-500">+{aiResult.score}</div></div><div className="w-px h-12 bg-slate-800 hidden md:block" /><div className="flex-1"><p className="text-lg italic font-medium text-slate-200">「{aiResult.feedback}」</p></div></div>}
                  </div>
                </>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-[40px] p-12 text-center flex flex-col justify-center items-center shadow-2xl h-full min-h-[400px]">
                  <Trophy size={80} className="text-yellow-500 mb-4 animate-bounce" />
                  <h2 className="text-5xl font-black italic tracking-tighter uppercase text-white">挑戰結束</h2>
                  <div className="bg-slate-950 p-8 rounded-[32px] border border-slate-800 w-full max-w-sm shadow-inner mt-4">
                    <p className="text-xs font-black text-slate-600 uppercase mb-2 text-white">最終累計得分</p>
                    <p className="text-7xl font-black text-yellow-500 tabular-nums">{totalScore}</p>
                  </div>
                  <button onClick={() => window.location.reload()} className="mt-8 text-slate-500 hover:text-white transition-all font-bold text-sm uppercase flex items-center gap-2"><RefreshCw size={16} /> 重新挑戰</button>
                </div>
              )}
            </div>

            <div className="lg:col-span-5 flex flex-col gap-6">
              <div className="bg-yellow-500 rounded-[32px] p-8 text-slate-950 shadow-xl shadow-yellow-500/10">
                <p className="text-[10px] font-black uppercase opacity-60 tracking-widest mb-1">您的總計分</p>
                <div className="text-6xl font-black tracking-tighter tabular-nums">{totalScore}</div>
              </div>

              <div className="bg-slate-900 rounded-[32px] p-6 border border-slate-800 flex flex-col h-[400px] shadow-2xl overflow-hidden">
                <h3 className="text-sm font-black flex items-center gap-2 pb-4 border-b border-slate-800 uppercase tracking-widest text-blue-400">
                  <ListFilter size={18} /> 我的答題紀錄
                </h3>
                <div className="flex-grow overflow-y-auto mt-4 space-y-6 pr-2 custom-scrollbar">
                  {localHistory.length === 0 ? <p className="text-slate-700 text-center py-10 italic">尚未提交答案...</p> : 
                    Object.entries(groupedFeed).map(([qText, answers]) => (
                      <div key={qText} className="space-y-3">
                        <div className="flex items-center gap-2 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700"><MessageSquare size={14} className="text-yellow-500 flex-shrink-0" /><span className="text-xs font-bold text-slate-300 truncate">{qText}</span></div>
                        <div className="space-y-2 pl-2">
                          {answers.map((msg, idx) => (
                            <div key={idx} className="bg-slate-800/30 p-3 rounded-xl border border-slate-700/30 text-xs shadow-inner">
                              <div className="flex justify-between items-center mb-1"><span className="font-black text-blue-400">{msg.userName}</span><span className="text-yellow-500 font-bold">+{msg.score}</span></div>
                              <p className="text-slate-200 mb-1 leading-relaxed">「{msg.answer}」</p>
                              <p className="text-[10px] italic text-slate-500 border-t border-slate-700/50 pt-1 mt-1">{msg.feedback}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      <footer className="mt-8 text-center opacity-30 pb-8 tracking-[0.3em] text-[8px] uppercase text-slate-500">Standalone AI Engine v14.0 | Build Success Fix</footer>
    </div>
  );
}
