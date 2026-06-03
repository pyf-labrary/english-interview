const { useState, useEffect, useRef, useCallback } = React;

// ── 后端 + 鉴权：硬编码 endpoint，token 必须从 ?token=xxx 或 localStorage 读到
//    没 token 就当未授权（按钮置灰提示去要 magic link）。这是公开站，必须挡白嫖。
const DEFAULT_API_BASE = 'https://eng.panyifeng.xyz';
const API_BASE = (() => {
  const p = new URLSearchParams(location.search).get('api');
  if (p) { localStorage.setItem('apiBase', p); return p; }
  const stored = localStorage.getItem('apiBase');
  return (stored && stored.startsWith('http')) ? stored : DEFAULT_API_BASE;
})();
const AUTH_TOKEN = (() => {
  const p = new URLSearchParams(location.search).get('token');
  if (p) {
    localStorage.setItem('authToken', p);
    // 清掉 URL 上的 token 避免泄露
    history.replaceState(null, '', location.pathname + location.hash);
    return p;
  }
  return localStorage.getItem('authToken') || '';
})();
function authHeaders(extra) {
  const h = extra || {};
  if (AUTH_TOKEN) h['X-Auth-Token'] = AUTH_TOKEN;
  return h;
}

const STYLES = [
  { id: 'mixed',      label: 'Mixed',      hint: '综合面' },
  { id: 'hsbc',       label: 'HSBC',       hint: '汇丰/银行外企 strengths' },
  { id: 'strengths',  label: 'HireVue',    hint: '单向自录节奏' },
  { id: 'tech',       label: 'Tech',       hint: '技术深挖' },
  { id: 'behavioral', label: 'Behavioural', hint: '纯 STAR 行为面' },
];

// 面试范围/题材（决定问什么）—— 全方位，不再死磕个人项目
const TOPICS = [
  { id: 'general',    label: '全方位',   hint: '综合 · 从零' },
  { id: 'ai',         label: 'AI/LLM',  hint: '大模型 / Agent 基础' },
  { id: 'backend',    label: '后端',     hint: 'API/DB/缓存/队列' },
  { id: 'sysdesign',  label: '系统设计', hint: '入门级' },
  { id: 'cs',         label: 'CS 基础',  hint: '数据结构/OS/网络' },
  { id: 'behavioral', label: '行为面',   hint: 'STAR · 通用' },
  { id: 'myproj',     label: '我的项目', hint: 'Army/网关/runtime' },
];

const ACCENTS = [
  { id: 'british',    label: 'UK ♂', hint: 'RP / 男声' },
  { id: 'british-f',  label: 'UK ♀', hint: 'RP / 女声' },
  { id: 'indian',     label: 'IN ♂', hint: '印度英语 / 男声' },
  { id: 'indian-f',   label: 'IN ♀', hint: '印度英语 / 女声' },
  { id: 'mixed',      label: 'Panel', hint: '混口音' },
];

const COUNTS = [4, 6, 8, 10, 15, 20];

function pickMime() {
  const cand = [
    'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus',
  ];
  for (const m of cand) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 简易 toast
function useToast() {
  const [msg, setMsg] = useState(null);
  const show = (m, ms=2500) => { setMsg(m); setTimeout(() => setMsg(null), ms); };
  const node = msg ? (
    <div className="fixed top-4 inset-x-0 flex justify-center z-50 pt-safe">
      <div className="bg-[var(--ink-3)] border border-[var(--line)] px-4 py-2 rounded-lg text-sm shadow-2xl max-w-[90%]">
        {msg}
      </div>
    </div>
  ) : null;
  return { show, node };
}

// b64 → audio blob URL
function audioFromB64(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) buf[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
}

function ScoreBar({ score }) {
  const pct = Math.max(0, Math.min(10, Number(score)||0)) * 10;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-[var(--ink-3)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${pct}%`, background: `linear-gradient(90deg, var(--teal), var(--gold))` }} />
      </div>
      <span className="serif text-xl tabular-nums">{score}<span className="text-[var(--muted)] text-sm">/10</span></span>
    </div>
  );
}

function Pill({ active, onClick, label, hint }) {
  return (
    <button onClick={onClick}
      className={"px-3 py-1.5 rounded-full text-xs transition-all border " +
        (active ? "bg-white text-[var(--ink)] border-white font-semibold"
                : "border-[var(--line)] text-[var(--muted)] hover:text-white")}>
      <div>{label}</div>
      {hint && <div className="text-[10px] opacity-60 mt-0.5">{hint}</div>}
    </button>
  );
}

function App() {
  // 设置
  const [mode, setMode] = useState(localStorage.getItem('mode') || 'practice'); // practice | spar
  const [style, setStyle] = useState(localStorage.getItem('style') || 'mixed');
  const [topic, setTopic] = useState(localStorage.getItem('topic') || 'general');
  const [accent, setAccent] = useState(localStorage.getItem('accent') || 'british');
  const [nQuestions, setNQuestions] = useState(Number(localStorage.getItem('nq')) || 6);
  const [apiBase, setApiBase] = useState(API_BASE);
  const [showSettings, setShowSettings] = useState(!apiBase);

  // 状态机（练习）：idle → starting → listening → recording → uploading → reviewing → finished → error
  // 对练：idle → sparLoading → spar
  const [phase, setPhase] = useState('idle');
  const [idx, setIdx] = useState(0);          // 已答 idx 题
  const [question, setQuestion] = useState(null);
  const [questionZh, setQuestionZh] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [history, setHistory] = useState([]);  // {idx, question, sttText, feedback}
  const [summary, setSummary] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState(null);
  // 拿到下一题先存这，等用户点「下一题 →」才显示 + 播放
  const [pendingNext, setPendingNext] = useState(null);
  const toast = useToast();

  useEffect(() => { localStorage.setItem('mode', mode); }, [mode]);
  useEffect(() => { localStorage.setItem('style', style); }, [style]);
  useEffect(() => { localStorage.setItem('topic', topic); }, [topic]);
  useEffect(() => { localStorage.setItem('accent', accent); }, [accent]);
  useEffect(() => { localStorage.setItem('nq', String(nQuestions)); }, [nQuestions]);

  // 自动播放面试官 TTS（练习模式）
  const audioRef = useRef(null);
  useEffect(() => {
    if (!audioUrl) return;
    const a = new Audio(audioUrl);
    audioRef.current = a;
    a.play().catch(() => { toast.show('点击🔊播放问题（浏览器策略需手势）'); });
    return () => { a.pause(); audioRef.current = null; };
  }, [audioUrl]);

  // 录音 + 实时字幕（Web Speech API = 主转写源；MediaRecorder 仅作兜底音频）
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const recogRef = useRef(null);
  const [liveText, setLiveText] = useState('');     // 已确定的小段
  const [interimText, setInterimText] = useState(''); // 浏览器正在猜的小段
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // ── 一轮录音的协调状态（用 ref，避免事件回调里读到过期 state）──
  const liveTextRef = useRef('');     // Web Speech 累计的最终文本（提交时用它）
  const blobRef = useRef(null);       // 兜底音频 blob
  const mimeRef = useRef('');         // 兜底音频 mime
  const recDoneRef = useRef(false);   // MediaRecorder 已 stop
  const srDoneRef = useRef(false);    // SpeechRecognition 已 end（或不支持）
  const stoppingRef = useRef(false);  // 用户已松手，进入收尾（区分 SR 中途自动 end）
  const submittedRef = useRef(false); // 本轮已提交，防重复
  const srRestartsRef = useRef(0);    // SR 中途 end 后重启计数（防死循环）

  const guard = () => {
    if (!apiBase) { setShowSettings(true); return false; }
    if (!AUTH_TOKEN) {
      setError('未授权：缺少 token。请用 magic link 重新访问，或在 ⚙ 设置里填 token。');
      setPhase('error'); return false;
    }
    return true;
  };

  const startInterview = async () => {
    if (!guard()) return;
    setPhase('starting'); setError(null); setHistory([]); setSummary(null);
    setIdx(0); setTranscript('');
    try {
      const r = await fetch(apiBase + '/api/start', {
        method: 'POST',
        headers: authHeaders({'Content-Type': 'application/json'}),
        body: JSON.stringify({ style, accent, topic, questions: nQuestions }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setQuestion(j.question); setQuestionZh(j.question_zh);
      if (j.audio_b64) setAudioUrl(audioFromB64(j.audio_b64));
      setPhase('listening');
    } catch (e) {
      setError(String(e.message || e)); setPhase('error');
    }
  };

  // 一轮答完：录音(MediaRecorder)和实时识别(SR)都收尾后，决定走哪条提交路径
  const maybeFinish = () => {
    if (submittedRef.current) return;
    if (!recDoneRef.current || !srDoneRef.current) return;  // 等两边都结束
    submittedRef.current = true;
    recogRef.current = null;
    const text = (liveTextRef.current || '').trim();
    if (text && /[a-zA-Z]/.test(text) && text.length >= 2) {
      submitText(text);                               // 主路径：浏览器实时转写文本
    } else {
      uploadTurn(blobRef.current, mimeRef.current || 'audio/webm');  // 兜底：上传音频走 whisper
    }
  };

  const beginRecord = async () => {
    if (phase === 'recording') return;
    // 重置本轮协调状态
    liveTextRef.current = ''; blobRef.current = null; mimeRef.current = '';
    mediaRef.current = null; recogRef.current = null;
    recDoneRef.current = false; stoppingRef.current = false;
    submittedRef.current = false; srRestartsRef.current = 0;
    srDoneRef.current = !SR;        // 不支持 Web Speech → 直接视为 SR 完成，走音频兜底
    setLiveText(''); setInterimText('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      // 竞态防护：拿麦克风（含首次授权弹窗）期间用户已松手 → 别开录，干净退回 listening
      if (stoppingRef.current) {
        stream.getTracks().forEach(t => t.stop());
        setPhase('listening');
        toast.show('麦克风已就绪，按住说话即可');
        return;
      }
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRef.current = rec; chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        blobRef.current = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        mimeRef.current = rec.mimeType || 'audio/webm';
        recDoneRef.current = true;
        maybeFinish();
      };
      rec.start();
      setPhase('recording');

      // 同步开启浏览器实时字幕（= 主转写源；与录音并行）
      if (SR) {
        try {
          const r2 = new SR();
          r2.lang = 'en-US';
          r2.continuous = true;
          r2.interimResults = true;
          r2.onresult = (ev) => {
            let interim = '', finals = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              const t = ev.results[i][0].transcript;
              if (ev.results[i].isFinal) finals += t;
              else interim += t;
            }
            if (finals) {
              liveTextRef.current = (liveTextRef.current + ' ' + finals).trim();
              setLiveText(liveTextRef.current);
            }
            setInterimText(interim);
          };
          r2.onerror = () => {};  // 静默；真正失败由 onend → maybeFinish 走兜底
          r2.onend = () => {
            if (stoppingRef.current) { srDoneRef.current = true; maybeFinish(); return; }
            // 录音中 SR 自己断了（安卓静音会自动停）→ 续上保持流式
            if (srRestartsRef.current < 20) {
              srRestartsRef.current++;
              try { r2.start(); return; } catch (e) {}
            }
            srDoneRef.current = true;
          };
          r2.start();
          recogRef.current = r2;
        } catch (e) { srDoneRef.current = true; /* 起不来 → 走音频兜底 */ }
      }
    } catch (e) {
      toast.show('麦克风权限被拒，去浏览器设置打开');
      setPhase('listening');
    }
  };

  const endRecord = () => {
    if (stoppingRef.current) return;  // 防 mouseup + mouseleave 重复触发
    stoppingRef.current = true;
    const r = mediaRef.current;
    if (r && r.state !== 'inactive') { try { r.stop(); } catch (e) { recDoneRef.current = true; } }
    else recDoneRef.current = true;
    const r2 = recogRef.current;
    if (r2) { try { r2.stop(); } catch (e) { srDoneRef.current = true; } }
    else srDoneRef.current = true;
    // 提交统一由 rec.onstop / SR.onend 触发，这里不调 maybeFinish——
    // 否则快速点按 / 首次授权竞态下（录音器还没建好）会提前提交并把录音卡死
  };

  // 两条提交路径（文本 / 音频 / 跳过）共用的结果落地
  const applyTurnResult = async (j) => {
    setTranscript(j.transcript || transcript);
    setHistory(h => [...h, {
      idx: idx + 1, question, sttText: j.stt_text, feedback: j.feedback,
    }]);
    setIdx(i => i + 1);
    // 把下一题先存起来；UI 进入 reviewing 显示反馈，等用户点「下一题 →」才暴露
    setPendingNext(j.question ? {
      question: j.question, question_zh: j.question_zh, audio_b64: j.audio_b64,
    } : null);
    setPhase('reviewing');
    // 若是最后一题，提前拉总评，反正现在用户也在看反馈
    if (!j.question) {
      try {
        const r2 = await fetch(apiBase + '/api/summary', {
          method: 'POST',
          headers: authHeaders({'Content-Type': 'application/json'}),
          body: JSON.stringify({ transcript: j.transcript || transcript, style, accent, topic }),
        });
        if (r2.ok) setSummary(await r2.json());
      } catch {}
    }
  };

  // 主路径：浏览器实时转写的文本直接评分，跳过音频上传 + whisper
  const submitText = async (text) => {
    setPhase('uploading');
    try {
      const r = await fetch(apiBase + '/api/turn-text', {
        method: 'POST',
        headers: authHeaders({'Content-Type': 'application/json'}),
        body: JSON.stringify({
          text, style, accent, topic, questions: nQuestions,
          idx: idx + 1, transcript, current_question: question || '',
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      await applyTurnResult(await r.json());
    } catch (e) {
      // 文本路径失败（如后端未更新 / 网络）→ 有兜底音频就改走 whisper
      if (blobRef.current && blobRef.current.size >= 4096) {
        await uploadTurn(blobRef.current, mimeRef.current || 'audio/webm');
      } else {
        setError(String(e.message || e)); setPhase('error');
      }
    }
  };

  // 兜底路径：Web Speech 失败/为空时上传音频走服务器 whisper
  const uploadTurn = async (blob, mime) => {
    if (!blob || blob.size < 4096) {
      toast.show('录音太短，没听清，再试一次');
      setPhase('listening');
      return;
    }
    setPhase('uploading');
    const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') || mime.includes('aac') ? 'm4a' : 'ogg';
    const fd = new FormData();
    fd.append('audio', blob, `ans.${ext}`);
    fd.append('style', style);
    fd.append('accent', accent);
    fd.append('topic', topic);
    fd.append('questions', String(nQuestions));
    fd.append('idx', String(idx + 1));
    fd.append('transcript', transcript);
    fd.append('current_question', question || '');
    try {
      const r = await fetch(apiBase + '/api/turn', {
        method: 'POST', headers: authHeaders(), body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      await applyTurnResult(await r.json());
    } catch (e) {
      setError(String(e.message || e)); setPhase('error');
    }
  };

  // 一键跳过 → 直接看范答（不会答的题）
  const skipQuestion = async () => {
    if (phase === 'recording') return;
    setPhase('uploading');
    try {
      const r = await fetch(apiBase + '/api/skip', {
        method: 'POST',
        headers: authHeaders({'Content-Type': 'application/json'}),
        body: JSON.stringify({
          style, accent, topic, questions: nQuestions,
          idx: idx + 1, transcript, current_question: question || '',
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      await applyTurnResult(await r.json());
    } catch (e) {
      setError(String(e.message || e)); setPhase('error');
    }
  };

  const replayQuestion = () => {
    if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play().catch(()=>{}); }
  };

  // 看完反馈点「下一题 →」/「看总评 →」
  const proceedNext = () => {
    if (pendingNext) {
      setQuestion(pendingNext.question);
      setQuestionZh(pendingNext.question_zh);
      if (pendingNext.audio_b64) setAudioUrl(audioFromB64(pendingNext.audio_b64));
      setPendingNext(null);
      setLiveText(''); setInterimText('');
      setPhase('listening');
    } else {
      setPhase('finished');
    }
  };

  // ── AI 对练观摩 ─────────────────────────────────────────────────
  const [dialogue, setDialogue] = useState([]);
  const [sparIdx, setSparIdx] = useState(-1);
  const [sparPlaying, setSparPlaying] = useState(false);
  const [showZh, setShowZh] = useState(true);
  const dialogueRef = useRef([]);
  const sparRunRef = useRef(0);       // 播放运行 token，换值即中止旧循环
  const sparAudioRef = useRef(null);  // 当前播放的 Audio
  const ttsCacheRef = useRef(new Map()); // 行号 → blob URL
  const curBubbleRef = useRef(null);

  const stopSparAudio = () => {
    sparRunRef.current++;                  // 中止任何在跑的 playFrom
    const a = sparAudioRef.current;
    if (a) { try { a.pause(); } catch {} sparAudioRef.current = null; }
  };

  const ttsFor = async (i) => {
    const dlg = dialogueRef.current;
    if (!dlg || !dlg[i]) return null;
    if (ttsCacheRef.current.has(i)) return ttsCacheRef.current.get(i);
    try {
      const r = await fetch(apiBase + '/api/tts', {
        method: 'POST',
        headers: authHeaders({'Content-Type': 'application/json'}),
        body: JSON.stringify({ text: dlg[i].en, accent, role: dlg[i].role }),
      });
      if (!r.ok) throw new Error('tts');
      const j = await r.json();
      const url = audioFromB64(j.audio_b64);
      ttsCacheRef.current.set(i, url);
      return url;
    } catch { return null; }
  };
  const prefetch = (i) => {
    const dlg = dialogueRef.current;
    if (dlg && dlg[i] && !ttsCacheRef.current.has(i)) ttsFor(i);
  };
  const playUrl = (url) => new Promise((resolve) => {
    const a = new Audio(url);
    sparAudioRef.current = a;
    a.onended = () => resolve();
    a.onerror = () => resolve();
    a.play().catch(() => resolve());
  });

  const playFrom = async (start) => {
    const run = ++sparRunRef.current;
    setSparPlaying(true);
    const dlg = dialogueRef.current;
    for (let i = start; i < dlg.length; i++) {
      if (run !== sparRunRef.current) return;     // 被中止
      setSparIdx(i);
      prefetch(i + 1);
      const url = await ttsFor(i);
      if (run !== sparRunRef.current) return;
      if (url) await playUrl(url);
      if (run !== sparRunRef.current) return;
      await sleep(280);                           // 两句之间留个气口
    }
    if (run === sparRunRef.current) setSparPlaying(false);
  };

  const startSpar = async () => {
    if (!guard()) return;
    stopSparAudio();
    ttsCacheRef.current = new Map();
    setDialogue([]); dialogueRef.current = [];
    setSparIdx(-1); setSparPlaying(false); setError(null);
    setPhase('sparLoading');
    try {
      const r = await fetch(apiBase + '/api/spar', {
        method: 'POST',
        headers: authHeaders({'Content-Type': 'application/json'}),
        body: JSON.stringify({ style, accent, topic, rounds: nQuestions }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      const dlg = (j.dialogue || []).filter(d => d && d.en);
      if (!dlg.length) throw new Error('对话为空');
      dialogueRef.current = dlg;
      setDialogue(dlg);
      setPhase('spar');
      playFrom(0);
    } catch (e) {
      setError(String(e.message || e)); setPhase('error');
    }
  };

  const pauseSpar = () => { stopSparAudio(); setSparPlaying(false); };
  const resumeSpar = () => { if (dialogueRef.current.length) playFrom(Math.max(0, sparIdx)); };
  const replaySparLine = () => { stopSparAudio(); playFrom(Math.max(0, sparIdx)); };
  const jumpSparLine = (i) => { stopSparAudio(); setSparIdx(i); playFrom(i); };

  // 当前行滚到可视中央
  useEffect(() => {
    if (phase === 'spar' && curBubbleRef.current) {
      curBubbleRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [sparIdx, phase]);

  const reset = () => {
    stopSparAudio();
    setPhase('idle'); setIdx(0); setQuestion(null); setQuestionZh(null);
    setTranscript(''); setHistory([]); setSummary(null); setAudioUrl(null); setError(null);
    setPendingNext(null); setLiveText(''); setInterimText('');
    setDialogue([]); dialogueRef.current = []; setSparIdx(-1); setSparPlaying(false);
  };

  const styleLabel = STYLES.find(s=>s.id===style)?.label;
  const topicLabel = TOPICS.find(t=>t.id===topic)?.label;
  const accentLabel = ACCENTS.find(a=>a.id===accent)?.label;
  const sparDone = phase === 'spar' && !sparPlaying && sparIdx >= dialogue.length - 1;

  // ── UI ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-full flex flex-col">
      {toast.node}

      <header className="pt-safe px-5 pt-4 pb-3 border-b border-[var(--line)] flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="serif text-xl tracking-tight">Interview · Drill</h1>
          <span className="text-[10px] tracking-[0.2em] text-[var(--muted)] mono">FOR REMOTE / OVERSEAS</span>
        </div>
        <button onClick={() => setShowSettings(s => !s)}
          className="text-xs px-2 py-1 rounded border border-[var(--line)] text-[var(--muted)]">
          ⚙ {showSettings ? '收起' : '设置'}
        </button>
      </header>

      {showSettings && (
        <section className="px-5 py-4 border-b border-[var(--line)] bg-[var(--ink-2)] space-y-3">
          <div>
            <div className="text-[10px] tracking-widest text-[var(--muted)] mb-2 mono">MODE 模式</div>
            <div className="flex gap-2">
              <button onClick={()=>{ reset(); setMode('practice'); }}
                className={"flex-1 px-3 py-2 rounded text-sm border " + (mode==='practice' ? "bg-white text-[var(--ink)] border-white font-semibold" : "border-[var(--line)] text-[var(--muted)]")}>
                🎤 自己练<div className="text-[10px] opacity-60">你答 · AI 评 · 看范答</div>
              </button>
              <button onClick={()=>{ reset(); setMode('spar'); }}
                className={"flex-1 px-3 py-2 rounded text-sm border " + (mode==='spar' ? "bg-white text-[var(--ink)] border-white font-semibold" : "border-[var(--line)] text-[var(--muted)]")}>
                👥 AI 对练<div className="text-[10px] opacity-60">两个 AI 对答 · 你听学</div>
              </button>
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-widest text-[var(--muted)] mb-2 mono">TOPIC 范围</div>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map(t => <Pill key={t.id} active={topic===t.id} onClick={()=>setTopic(t.id)} label={t.label} hint={t.hint}/>)}
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-widest text-[var(--muted)] mb-2 mono">STYLE 面试风格</div>
            <div className="flex flex-wrap gap-2">
              {STYLES.map(s => <Pill key={s.id} active={style===s.id} onClick={()=>setStyle(s.id)} label={s.label} hint={s.hint}/>)}
            </div>
          </div>
          <div>
            <div className="text-[10px] tracking-widest text-[var(--muted)] mb-2 mono">ACCENT 口音</div>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map(a => <Pill key={a.id} active={accent===a.id} onClick={()=>setAccent(a.id)} label={a.label} hint={a.hint}/>)}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <span className="text-[10px] tracking-widest text-[var(--muted)] mono">{mode==='spar' ? '轮数' : '题数'}</span>
            {COUNTS.map(n => (
              <button key={n} onClick={()=>setNQuestions(n)}
                className={"px-3 py-1 rounded text-sm border " + (nQuestions===n ? "bg-white text-[var(--ink)] border-white" : "border-[var(--line)] text-[var(--muted)]")}>
                {n}
              </button>
            ))}
            {mode==='spar' && nQuestions>12 && <span className="text-[10px] text-[var(--muted)]">（对练最多 12 轮）</span>}
          </div>
          <div className="pt-1">
            <div className="text-[10px] tracking-widest text-[var(--muted)] mb-2 mono">BACKEND API</div>
            <input value={apiBase} onChange={e => setApiBase(e.target.value.trim())}
              placeholder="https://eng.panyifeng.xyz"
              className="w-full px-3 py-2 rounded bg-[var(--ink-3)] border border-[var(--line)] text-sm mono" />
            <button onClick={() => { localStorage.setItem('apiBase', apiBase); toast.show('已保存'); }}
              className="mt-2 px-3 py-1.5 rounded bg-white text-[var(--ink)] text-xs font-semibold">保存</button>
          </div>
        </section>
      )}

      <main className="flex-1 flex flex-col">
        {phase === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="text-[10px] tracking-[0.3em] text-[var(--muted)] mono mb-3">SESSION READY</div>
            <h2 className="serif text-3xl mb-2">{topicLabel} · {styleLabel} · {accentLabel}</h2>
            {mode==='practice' ? (
              <p className="text-[var(--muted)] text-sm max-w-sm mb-8">
                {nQuestions} 道题，全英作答。按住麦克风说话，松开提交。每题立即获得范答 + 地道改写 + 错误点评 + 评分。不会答？一键「看范答」。
              </p>
            ) : (
              <p className="text-[var(--muted)] text-sm max-w-sm mb-8">
                AI 面试官 × AI 考生现场对答 {Math.min(nQuestions,12)} 轮，双声线 TTS。你只管听 + 看中英字幕，学他们怎么问、怎么答。
              </p>
            )}
            <button onClick={mode==='practice' ? startInterview : startSpar} disabled={!apiBase}
              className="px-8 py-3 rounded-full bg-[var(--hsbc)] hover:opacity-90 disabled:opacity-30 text-white serif text-lg tracking-wide">
              {mode==='practice' ? 'Begin Interview' : '▶ 开始对练观摩'}
            </button>
            {!apiBase && <p className="text-xs text-[var(--muted)] mt-4">先到 ⚙ 设置里填后端地址</p>}
          </div>
        )}

        {(phase==='starting' || phase==='uploading' || phase==='sparLoading') && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="bar"></div><div className="bar"></div><div className="bar"></div><div className="bar"></div>
            <p className="text-[var(--muted)] text-sm mt-4">
              {phase==='starting' ? '面试官正在准备问题…' : phase==='sparLoading' ? 'AI 们正在准备对话…（多轮稍等几秒）' : '正在处理…'}
            </p>
          </div>
        )}

        {(phase==='listening' || phase==='recording') && question && (
          <div className="flex-1 flex flex-col">
            <section className="grain p-6 border-b border-[var(--line)]">
              <div className="flex items-center justify-between text-[10px] mono text-[var(--muted)] mb-3 tracking-widest">
                <span>Q{idx + 1} / {nQuestions}</span>
                <button onClick={replayQuestion} className="hover:text-white">↻ REPLAY 🔊</button>
              </div>
              <h2 className="serif text-2xl leading-snug mb-3">{question}</h2>
              {questionZh && <p className="text-[var(--muted)] text-sm">{questionZh}</p>}
            </section>

            <div className="flex-1 flex flex-col items-center justify-center pb-safe py-8">
              <button
                onTouchStart={beginRecord} onTouchEnd={endRecord}
                onMouseDown={beginRecord} onMouseUp={endRecord} onMouseLeave={() => phase==='recording' && endRecord()}
                className={"relative w-32 h-32 rounded-full transition-transform select-none " +
                  (phase==='recording' ? 'recording-ring scale-95' : 'bg-[var(--ink-3)] border border-[var(--line)] hover:border-white')}>
                <div className={"absolute inset-0 rounded-full flex items-center justify-center " +
                  (phase==='recording' ? 'bg-[var(--hsbc)]' : 'bg-[var(--ink-3)]')}>
                  <svg viewBox="0 0 24 24" className="w-12 h-12" fill={phase==='recording' ? 'white' : 'var(--text)'}>
                    <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/>
                  </svg>
                </div>
              </button>
              <p className="mt-6 text-[var(--muted)] text-sm">
                {phase==='recording' ? <span className="blink">● 录音中 — 松开提交</span> : '按住说话'}
              </p>

              {phase==='listening' && (
                <button onClick={skipQuestion}
                  className="mt-5 px-5 py-2 rounded-full border border-[var(--gold)] text-[var(--gold)] text-sm hover:bg-[var(--gold)] hover:text-[var(--ink)] transition-colors">
                  🙈 不会 · 直接看范答
                </button>
              )}

              {/* 实时字幕（录音时显示，提交后清空） */}
              {phase==='recording' && (liveText || interimText) && (
                <div className="mt-6 mx-5 max-w-2xl">
                  <div className="text-[10px] mono tracking-widest text-[var(--gold)] mb-2">LIVE CAPTION · 实时字幕</div>
                  <div className="bg-[var(--ink-2)] border border-[var(--line)] rounded-lg p-4 text-base leading-relaxed">
                    <span>{liveText}</span>
                    {interimText && <span className="text-[var(--muted)] italic"> {interimText}</span>}
                  </div>
                  <div className="text-[10px] text-[var(--muted)] mt-1.5">
                    浏览器实时识别，松开即作为评分依据；识别不到时自动回落服务器转写
                  </div>
                </div>
              )}
              {phase==='recording' && !SR && (
                <div className="mt-4 text-[10px] text-[var(--muted)] italic">
                  （此浏览器不支持 Web Speech，无实时字幕。建议用 Chrome / Edge）
                </div>
              )}
            </div>
          </div>
        )}

        {phase === 'reviewing' && history.length > 0 && (
          <div className="flex-1 flex flex-col">
            <div className="px-5 py-4 overflow-y-auto flex-1 pb-safe">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <div className="text-[10px] mono tracking-widest text-[var(--gold)]">REVIEW · 复盘</div>
                  <h2 className="serif text-2xl mt-1">Q{history.slice(-1)[0].idx} feedback</h2>
                </div>
                <span className="text-[10px] mono text-[var(--muted)]">
                  {pendingNext ? `${idx} / ${nQuestions}` : `final`}
                </span>
              </div>
              {history.slice(-1).map(h => <FeedbackCard key={h.idx} item={h} expanded />)}
            </div>
            <div className="px-5 pb-safe pt-3 border-t border-[var(--line)] bg-[var(--ink)]">
              <button onClick={proceedNext}
                className="w-full py-3 rounded-full bg-[var(--hsbc)] hover:opacity-90 text-white serif text-lg tracking-wide">
                {pendingNext ? `Next question  Q${idx + 1} →` : 'See debrief →'}
              </button>
            </div>
          </div>
        )}

        {phase === 'finished' && (
          <div className="flex-1 px-5 py-6 overflow-y-auto pb-safe">
            <div className="text-[10px] mono tracking-widest text-[var(--muted)] mb-2">DEBRIEF · 总评</div>
            <h2 className="serif text-3xl mb-4">Interview complete.</h2>
            {summary ? <Summary s={summary} /> : <p className="text-[var(--muted)]">总评生成中…</p>}

            <div className="mt-8 border-t border-[var(--line)] pt-6">
              <div className="text-[10px] mono tracking-widest text-[var(--muted)] mb-3">FULL TRANSCRIPT 历题</div>
              {history.map(h => <FeedbackCard key={h.idx} item={h} expanded />)}
            </div>

            <button onClick={reset}
              className="mt-8 w-full py-3 rounded-full border border-[var(--line)] hover:border-white">
              Restart Drill
            </button>
          </div>
        )}

        {phase === 'spar' && (
          <div className="flex-1 flex flex-col">
            <div className="px-5 py-3 border-b border-[var(--line)] flex items-center justify-between">
              <div className="text-[10px] mono tracking-widest text-[var(--gold)]">
                AI 对练 · {topicLabel} · {Math.min(dialogue.length/2|0 || 0, 99)} 轮
              </div>
              <div className="flex items-center gap-3">
                <button onClick={()=>setShowZh(z=>!z)} className="text-xs text-[var(--muted)] hover:text-white">
                  {showZh ? '中/EN' : 'EN only'}
                </button>
                <button onClick={reset} className="text-xs text-[var(--muted)] hover:text-white">✕ 退出</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {dialogue.map((d, i) => {
                if (i > sparIdx) return null;            // 还没播到的不显示
                const isInt = d.role === 'interviewer';
                const cur = i === sparIdx;
                return (
                  <div key={i} ref={cur ? curBubbleRef : null}
                    className={"flex " + (isInt ? "justify-start" : "justify-end")}>
                    <div onClick={()=>jumpSparLine(i)}
                      className={"max-w-[85%] rounded-2xl px-4 py-3 cursor-pointer transition-all border " +
                        (isInt ? "bg-[var(--ink-2)] border-[var(--line)] rounded-tl-sm "
                               : "bg-[var(--ink-3)] border-[var(--line)] rounded-tr-sm ") +
                        (cur ? "ring-2 ring-[var(--gold)]" : "opacity-90")}>
                      <div className={"text-[10px] mono tracking-widest mb-1 " + (isInt ? "text-[var(--hsbc)]" : "text-[var(--teal)]")}>
                        {isInt ? '面试官 INTERVIEWER' : '考生 CANDIDATE'}{cur && sparPlaying ? ' · 🔊' : ''}
                      </div>
                      <p className="serif leading-relaxed">{d.en}</p>
                      {showZh && d.zh && <p className="text-sm text-[var(--muted)] mt-1.5">{d.zh}</p>}
                    </div>
                  </div>
                );
              })}
              {sparDone && (
                <div className="text-center text-[var(--muted)] text-sm py-4">— 对练结束 · 点任意一句可重听 —</div>
              )}
            </div>

            <div className="px-5 pb-safe pt-3 border-t border-[var(--line)] bg-[var(--ink)] flex items-center justify-center gap-5">
              <button onClick={replaySparLine} title="重听本句"
                className="w-11 h-11 rounded-full border border-[var(--line)] hover:border-white flex items-center justify-center">⏮</button>
              {sparPlaying ? (
                <button onClick={pauseSpar}
                  className="w-14 h-14 rounded-full bg-[var(--hsbc)] text-white flex items-center justify-center text-xl">⏸</button>
              ) : (
                <button onClick={sparDone ? startSpar : resumeSpar}
                  className="w-14 h-14 rounded-full bg-[var(--hsbc)] text-white flex items-center justify-center text-xl">
                  {sparDone ? '↻' : '▶'}
                </button>
              )}
              <button onClick={()=>jumpSparLine(Math.min(dialogue.length-1, sparIdx+1))} title="下一句"
                className="w-11 h-11 rounded-full border border-[var(--line)] hover:border-white flex items-center justify-center">⏭</button>
              <span className="text-[10px] mono text-[var(--muted)] ml-2">{Math.max(0,sparIdx+1)}/{dialogue.length}</span>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="text-[var(--hsbc)] serif text-2xl mb-2">⚠ Something broke</div>
            <pre className="text-xs text-[var(--muted)] max-w-full whitespace-pre-wrap mono">{error}</pre>
            <button onClick={reset} className="mt-6 px-6 py-2 rounded-full border border-[var(--line)]">Restart</button>
          </div>
        )}
      </main>
    </div>
  );
}

function FeedbackCard({ item, expanded }) {
  const fb = item.feedback;
  if (!fb) return null;
  const skipped = fb.skipped;
  return (
    <div className="bg-[var(--ink-2)] border border-[var(--line)] rounded-lg p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] mono tracking-widest text-[var(--muted)]">Q{item.idx}</span>
        {skipped
          ? <span className="text-[10px] mono tracking-widest text-[var(--gold)] border border-[var(--gold)] rounded px-2 py-0.5">已跳过 · 范答</span>
          : <div className="w-40"><ScoreBar score={fb.score} /></div>}
      </div>
      {expanded && item.question && (
        <p className="serif text-sm mb-2 text-[var(--muted)]">Q: {item.question}</p>
      )}
      {item.sttText && !skipped && (
        <div className="text-sm text-[var(--muted)] italic mb-3 border-l-2 border-[var(--line)] pl-3">
          你的回答：{item.sttText}
        </div>
      )}
      {fb.model_answer && (
        <div className="mb-3">
          <div className="text-[10px] mono tracking-widest text-[var(--gold)] mb-1">MODEL ANSWER · 范答</div>
          <p className="serif leading-relaxed">{fb.model_answer}</p>
          {fb.model_answer_zh && <p className="text-sm text-[var(--muted)] mt-1.5">{fb.model_answer_zh}</p>}
        </div>
      )}
      {fb.key_points_zh && fb.key_points_zh.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] mono tracking-widest text-[var(--teal)] mb-1">答题要点</div>
          <ul className="text-sm space-y-1">
            {fb.key_points_zh.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        </div>
      )}
      {fb.rewrite && (
        <div className="mb-3">
          <div className="text-[10px] mono tracking-widest text-[var(--teal)] mb-1">NATIVE REWRITE · 你的话改写</div>
          <p className="serif">{fb.rewrite}</p>
        </div>
      )}
      {fb.errors && fb.errors.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] mono tracking-widest text-[var(--hsbc)] mb-1">错误点评</div>
          <ul className="text-sm space-y-1">
            {fb.errors.map((e, i) => <li key={i} className="text-[var(--text)]">• {e}</li>)}
          </ul>
        </div>
      )}
      {fb.vocab && fb.vocab.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] mono tracking-widest text-[var(--gold)] mb-1">地道表达</div>
          <ul className="text-sm space-y-1">
            {fb.vocab.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        </div>
      )}
      {fb.coach_zh && (
        <div>
          <div className="text-[10px] mono tracking-widest text-[var(--gold)] mb-1">教练</div>
          <p className="text-sm">{fb.coach_zh}</p>
        </div>
      )}
    </div>
  );
}

function Summary({ s }) {
  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-3">
        <span className="text-[10px] mono tracking-widest text-[var(--muted)]">CEFR</span>
        <span className="serif text-3xl text-[var(--gold)]">{s.cefr || '?'}</span>
      </div>
      {s.verdict_zh && <p className="serif text-lg leading-relaxed">{s.verdict_zh}</p>}
      <Section title="优势" items={s.strengths} color="var(--teal)" />
      <Section title="待补" items={s.weaknesses} color="var(--hsbc)" />
      <Section title="地道表达" items={s.vocab} color="var(--gold)" mono />
      <Section title="行动项" items={s.action_items} color="var(--text)" />
    </div>
  );
}

function Section({ title, items, color, mono: useMono }) {
  if (!items || !items.length) return null;
  return (
    <div>
      <div className="text-[10px] mono tracking-widest mb-2" style={{ color }}>{title}</div>
      <ul className={"space-y-1.5 text-sm " + (useMono ? '' : '')}>
        {items.map((it, i) => <li key={i} className="flex gap-2"><span className="text-[var(--muted)]">·</span><span>{it}</span></li>)}
      </ul>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
