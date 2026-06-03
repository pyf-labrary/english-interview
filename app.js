/* built from app.src.jsx by build.sh — do not edit by hand */
const {
  useState,
  useEffect,
  useRef,
  useCallback
} = React;
const DEFAULT_API_BASE = 'https://eng.panyifeng.xyz';
const API_BASE = (() => {
  const p = new URLSearchParams(location.search).get('api');
  if (p) {
    localStorage.setItem('apiBase', p);
    return p;
  }
  const stored = localStorage.getItem('apiBase');
  return stored && stored.startsWith('http') ? stored : DEFAULT_API_BASE;
})();
const AUTH_TOKEN = (() => {
  const p = new URLSearchParams(location.search).get('token');
  if (p) {
    localStorage.setItem('authToken', p);
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
const STYLES = [{
  id: 'mixed',
  label: 'Mixed',
  hint: '综合面'
}, {
  id: 'hsbc',
  label: 'HSBC',
  hint: '汇丰/银行外企 strengths'
}, {
  id: 'strengths',
  label: 'HireVue',
  hint: '单向自录节奏'
}, {
  id: 'tech',
  label: 'Tech',
  hint: '技术深挖'
}, {
  id: 'behavioral',
  label: 'Behavioural',
  hint: '纯 STAR 行为面'
}];
const TOPICS = [{
  id: 'general',
  label: '全方位',
  hint: '综合 · 从零'
}, {
  id: 'ai',
  label: 'AI/LLM',
  hint: '大模型 / Agent 基础'
}, {
  id: 'backend',
  label: '后端',
  hint: 'API/DB/缓存/队列'
}, {
  id: 'sysdesign',
  label: '系统设计',
  hint: '入门级'
}, {
  id: 'cs',
  label: 'CS 基础',
  hint: '数据结构/OS/网络'
}, {
  id: 'behavioral',
  label: '行为面',
  hint: 'STAR · 通用'
}, {
  id: 'myproj',
  label: '我的项目',
  hint: 'Army/网关/runtime'
}];
const ACCENTS = [{
  id: 'british',
  label: 'UK ♂',
  hint: 'RP / 男声'
}, {
  id: 'british-f',
  label: 'UK ♀',
  hint: 'RP / 女声'
}, {
  id: 'indian',
  label: 'IN ♂',
  hint: '印度英语 / 男声'
}, {
  id: 'indian-f',
  label: 'IN ♀',
  hint: '印度英语 / 女声'
}, {
  id: 'mixed',
  label: 'Panel',
  hint: '混口音'
}];
const COUNTS = [4, 6, 8, 10, 15, 20];
function pickMime() {
  const cand = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus'];
  for (const m of cand) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function useToast() {
  const [msg, setMsg] = useState(null);
  const show = (m, ms = 2500) => {
    setMsg(m);
    setTimeout(() => setMsg(null), ms);
  };
  const node = msg ? React.createElement("div", {
    className: "fixed top-4 inset-x-0 flex justify-center z-50 pt-safe"
  }, React.createElement("div", {
    className: "bg-[var(--ink-3)] border border-[var(--line)] px-4 py-2 rounded-lg text-sm shadow-2xl max-w-[90%]"
  }, msg)) : null;
  return {
    show,
    node
  };
}
function audioFromB64(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([buf], {
    type: 'audio/mpeg'
  }));
}
function ScoreBar({
  score
}) {
  const pct = Math.max(0, Math.min(10, Number(score) || 0)) * 10;
  return React.createElement("div", {
    className: "flex items-center gap-2"
  }, React.createElement("div", {
    className: "flex-1 h-2 rounded-full bg-[var(--ink-3)] overflow-hidden"
  }, React.createElement("div", {
    className: "h-full rounded-full transition-all duration-700",
    style: {
      width: `${pct}%`,
      background: `linear-gradient(90deg, var(--teal), var(--gold))`
    }
  })), React.createElement("span", {
    className: "serif text-xl tabular-nums"
  }, score, React.createElement("span", {
    className: "text-[var(--muted)] text-sm"
  }, "/10")));
}
function Pill({
  active,
  onClick,
  label,
  hint
}) {
  return React.createElement("button", {
    onClick: onClick,
    className: "px-3 py-1.5 rounded-full text-xs transition-all border " + (active ? "bg-white text-[var(--ink)] border-white font-semibold" : "border-[var(--line)] text-[var(--muted)] hover:text-white")
  }, React.createElement("div", null, label), hint && React.createElement("div", {
    className: "text-[10px] opacity-60 mt-0.5"
  }, hint));
}
function App() {
  const [mode, setMode] = useState(localStorage.getItem('mode') || 'practice');
  const [style, setStyle] = useState(localStorage.getItem('style') || 'mixed');
  const [topic, setTopic] = useState(localStorage.getItem('topic') || 'general');
  const [accent, setAccent] = useState(localStorage.getItem('accent') || 'british');
  const [nQuestions, setNQuestions] = useState(Number(localStorage.getItem('nq')) || 6);
  const [apiBase, setApiBase] = useState(API_BASE);
  const [showSettings, setShowSettings] = useState(!apiBase);
  const [phase, setPhase] = useState('idle');
  const [idx, setIdx] = useState(0);
  const [question, setQuestion] = useState(null);
  const [questionZh, setQuestionZh] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState(null);
  const [pendingNext, setPendingNext] = useState(null);
  const toast = useToast();
  useEffect(() => {
    localStorage.setItem('mode', mode);
  }, [mode]);
  useEffect(() => {
    localStorage.setItem('style', style);
  }, [style]);
  useEffect(() => {
    localStorage.setItem('topic', topic);
  }, [topic]);
  useEffect(() => {
    localStorage.setItem('accent', accent);
  }, [accent]);
  useEffect(() => {
    localStorage.setItem('nq', String(nQuestions));
  }, [nQuestions]);
  const audioRef = useRef(null);
  useEffect(() => {
    if (!audioUrl) return;
    const a = new Audio(audioUrl);
    audioRef.current = a;
    a.play().catch(() => {
      toast.show('点击🔊播放问题（浏览器策略需手势）');
    });
    return () => {
      a.pause();
      audioRef.current = null;
    };
  }, [audioUrl]);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const recogRef = useRef(null);
  const [liveText, setLiveText] = useState('');
  const [interimText, setInterimText] = useState('');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const liveTextRef = useRef('');
  const blobRef = useRef(null);
  const mimeRef = useRef('');
  const recDoneRef = useRef(false);
  const srDoneRef = useRef(false);
  const stoppingRef = useRef(false);
  const submittedRef = useRef(false);
  const srRestartsRef = useRef(0);
  const guard = () => {
    if (!apiBase) {
      setShowSettings(true);
      return false;
    }
    if (!AUTH_TOKEN) {
      setError('未授权：缺少 token。请用 magic link 重新访问，或在 ⚙ 设置里填 token。');
      setPhase('error');
      return false;
    }
    return true;
  };
  const startInterview = async () => {
    if (!guard()) return;
    setPhase('starting');
    setError(null);
    setHistory([]);
    setSummary(null);
    setIdx(0);
    setTranscript('');
    try {
      const r = await fetch(apiBase + '/api/start', {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          style,
          accent,
          topic,
          questions: nQuestions
        })
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setQuestion(j.question);
      setQuestionZh(j.question_zh);
      if (j.audio_b64) setAudioUrl(audioFromB64(j.audio_b64));
      setPhase('listening');
    } catch (e) {
      setError(String(e.message || e));
      setPhase('error');
    }
  };
  const maybeFinish = () => {
    if (submittedRef.current) return;
    if (!recDoneRef.current || !srDoneRef.current) return;
    submittedRef.current = true;
    recogRef.current = null;
    const text = (liveTextRef.current || '').trim();
    if (text && /[a-zA-Z]/.test(text) && text.length >= 2) {
      submitText(text);
    } else {
      uploadTurn(blobRef.current, mimeRef.current || 'audio/webm');
    }
  };
  const beginRecord = async () => {
    if (phase === 'recording') return;
    liveTextRef.current = '';
    blobRef.current = null;
    mimeRef.current = '';
    mediaRef.current = null;
    recogRef.current = null;
    recDoneRef.current = false;
    stoppingRef.current = false;
    submittedRef.current = false;
    srRestartsRef.current = 0;
    srDoneRef.current = !SR;
    setLiveText('');
    setInterimText('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      if (stoppingRef.current) {
        stream.getTracks().forEach(t => t.stop());
        setPhase('listening');
        toast.show('麦克风已就绪，按住说话即可');
        return;
      }
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, {
        mimeType: mime
      }) : new MediaRecorder(stream);
      mediaRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = e => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        blobRef.current = new Blob(chunksRef.current, {
          type: rec.mimeType || 'audio/webm'
        });
        mimeRef.current = rec.mimeType || 'audio/webm';
        recDoneRef.current = true;
        maybeFinish();
      };
      rec.start();
      setPhase('recording');
      if (SR) {
        try {
          const r2 = new SR();
          r2.lang = 'en-US';
          r2.continuous = true;
          r2.interimResults = true;
          r2.onresult = ev => {
            let interim = '',
              finals = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              const t = ev.results[i][0].transcript;
              if (ev.results[i].isFinal) finals += t;else interim += t;
            }
            if (finals) {
              liveTextRef.current = (liveTextRef.current + ' ' + finals).trim();
              setLiveText(liveTextRef.current);
            }
            setInterimText(interim);
          };
          r2.onerror = () => {};
          r2.onend = () => {
            if (stoppingRef.current) {
              srDoneRef.current = true;
              maybeFinish();
              return;
            }
            if (srRestartsRef.current < 20) {
              srRestartsRef.current++;
              try {
                r2.start();
                return;
              } catch (e) {}
            }
            srDoneRef.current = true;
          };
          r2.start();
          recogRef.current = r2;
        } catch (e) {
          srDoneRef.current = true;
        }
      }
    } catch (e) {
      toast.show('麦克风权限被拒，去浏览器设置打开');
      setPhase('listening');
    }
  };
  const endRecord = () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    const r = mediaRef.current;
    if (r && r.state !== 'inactive') {
      try {
        r.stop();
      } catch (e) {
        recDoneRef.current = true;
      }
    } else recDoneRef.current = true;
    const r2 = recogRef.current;
    if (r2) {
      try {
        r2.stop();
      } catch (e) {
        srDoneRef.current = true;
      }
    } else srDoneRef.current = true;
  };
  const applyTurnResult = async j => {
    setTranscript(j.transcript || transcript);
    setHistory(h => [...h, {
      idx: idx + 1,
      question,
      sttText: j.stt_text,
      feedback: j.feedback
    }]);
    setIdx(i => i + 1);
    setPendingNext(j.question ? {
      question: j.question,
      question_zh: j.question_zh,
      audio_b64: j.audio_b64
    } : null);
    setPhase('reviewing');
    if (!j.question) {
      try {
        const r2 = await fetch(apiBase + '/api/summary', {
          method: 'POST',
          headers: authHeaders({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            transcript: j.transcript || transcript,
            style,
            accent,
            topic
          })
        });
        if (r2.ok) setSummary(await r2.json());
      } catch {}
    }
  };
  const submitText = async text => {
    setPhase('uploading');
    try {
      const r = await fetch(apiBase + '/api/turn-text', {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          text,
          style,
          accent,
          topic,
          questions: nQuestions,
          idx: idx + 1,
          transcript,
          current_question: question || ''
        })
      });
      if (!r.ok) throw new Error(await r.text());
      await applyTurnResult(await r.json());
    } catch (e) {
      if (blobRef.current && blobRef.current.size >= 4096) {
        await uploadTurn(blobRef.current, mimeRef.current || 'audio/webm');
      } else {
        setError(String(e.message || e));
        setPhase('error');
      }
    }
  };
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
        method: 'POST',
        headers: authHeaders(),
        body: fd
      });
      if (!r.ok) throw new Error(await r.text());
      await applyTurnResult(await r.json());
    } catch (e) {
      setError(String(e.message || e));
      setPhase('error');
    }
  };
  const skipQuestion = async () => {
    if (phase === 'recording') return;
    setPhase('uploading');
    try {
      const r = await fetch(apiBase + '/api/skip', {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          style,
          accent,
          topic,
          questions: nQuestions,
          idx: idx + 1,
          transcript,
          current_question: question || ''
        })
      });
      if (!r.ok) throw new Error(await r.text());
      await applyTurnResult(await r.json());
    } catch (e) {
      setError(String(e.message || e));
      setPhase('error');
    }
  };
  const replayQuestion = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  };
  const proceedNext = () => {
    if (pendingNext) {
      setQuestion(pendingNext.question);
      setQuestionZh(pendingNext.question_zh);
      if (pendingNext.audio_b64) setAudioUrl(audioFromB64(pendingNext.audio_b64));
      setPendingNext(null);
      setLiveText('');
      setInterimText('');
      setPhase('listening');
    } else {
      setPhase('finished');
    }
  };
  const [dialogue, setDialogue] = useState([]);
  const [sparIdx, setSparIdx] = useState(-1);
  const [sparPlaying, setSparPlaying] = useState(false);
  const [showZh, setShowZh] = useState(true);
  const dialogueRef = useRef([]);
  const sparRunRef = useRef(0);
  const sparAudioRef = useRef(null);
  const ttsCacheRef = useRef(new Map());
  const curBubbleRef = useRef(null);
  const stopSparAudio = () => {
    sparRunRef.current++;
    const a = sparAudioRef.current;
    if (a) {
      try {
        a.pause();
      } catch {}
      sparAudioRef.current = null;
    }
  };
  const ttsFor = async i => {
    const dlg = dialogueRef.current;
    if (!dlg || !dlg[i]) return null;
    if (ttsCacheRef.current.has(i)) return ttsCacheRef.current.get(i);
    try {
      const r = await fetch(apiBase + '/api/tts', {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          text: dlg[i].en,
          accent,
          role: dlg[i].role
        })
      });
      if (!r.ok) throw new Error('tts');
      const j = await r.json();
      const url = audioFromB64(j.audio_b64);
      ttsCacheRef.current.set(i, url);
      return url;
    } catch {
      return null;
    }
  };
  const prefetch = i => {
    const dlg = dialogueRef.current;
    if (dlg && dlg[i] && !ttsCacheRef.current.has(i)) ttsFor(i);
  };
  const playUrl = url => new Promise(resolve => {
    const a = new Audio(url);
    sparAudioRef.current = a;
    a.onended = () => resolve();
    a.onerror = () => resolve();
    a.play().catch(() => resolve());
  });
  const playFrom = async start => {
    const run = ++sparRunRef.current;
    setSparPlaying(true);
    const dlg = dialogueRef.current;
    for (let i = start; i < dlg.length; i++) {
      if (run !== sparRunRef.current) return;
      setSparIdx(i);
      prefetch(i + 1);
      const url = await ttsFor(i);
      if (run !== sparRunRef.current) return;
      if (url) await playUrl(url);
      if (run !== sparRunRef.current) return;
      await sleep(280);
    }
    if (run === sparRunRef.current) setSparPlaying(false);
  };
  const startSpar = async () => {
    if (!guard()) return;
    stopSparAudio();
    ttsCacheRef.current = new Map();
    setDialogue([]);
    dialogueRef.current = [];
    setSparIdx(-1);
    setSparPlaying(false);
    setError(null);
    setPhase('sparLoading');
    try {
      const r = await fetch(apiBase + '/api/spar', {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          style,
          accent,
          topic,
          rounds: nQuestions
        })
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
      setError(String(e.message || e));
      setPhase('error');
    }
  };
  const pauseSpar = () => {
    stopSparAudio();
    setSparPlaying(false);
  };
  const resumeSpar = () => {
    if (dialogueRef.current.length) playFrom(Math.max(0, sparIdx));
  };
  const replaySparLine = () => {
    stopSparAudio();
    playFrom(Math.max(0, sparIdx));
  };
  const jumpSparLine = i => {
    stopSparAudio();
    setSparIdx(i);
    playFrom(i);
  };
  useEffect(() => {
    if (phase === 'spar' && curBubbleRef.current) {
      curBubbleRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [sparIdx, phase]);
  const reset = () => {
    stopSparAudio();
    setPhase('idle');
    setIdx(0);
    setQuestion(null);
    setQuestionZh(null);
    setTranscript('');
    setHistory([]);
    setSummary(null);
    setAudioUrl(null);
    setError(null);
    setPendingNext(null);
    setLiveText('');
    setInterimText('');
    setDialogue([]);
    dialogueRef.current = [];
    setSparIdx(-1);
    setSparPlaying(false);
  };
  const styleLabel = STYLES.find(s => s.id === style)?.label;
  const topicLabel = TOPICS.find(t => t.id === topic)?.label;
  const accentLabel = ACCENTS.find(a => a.id === accent)?.label;
  const sparDone = phase === 'spar' && !sparPlaying && sparIdx >= dialogue.length - 1;
  return React.createElement("div", {
    className: "min-h-full flex flex-col"
  }, toast.node, React.createElement("header", {
    className: "pt-safe px-5 pt-4 pb-3 border-b border-[var(--line)] flex items-center justify-between"
  }, React.createElement("div", {
    className: "flex items-baseline gap-3"
  }, React.createElement("h1", {
    className: "serif text-xl tracking-tight"
  }, "Interview \xB7 Drill"), React.createElement("span", {
    className: "text-[10px] tracking-[0.2em] text-[var(--muted)] mono"
  }, "FOR REMOTE / OVERSEAS")), React.createElement("button", {
    onClick: () => setShowSettings(s => !s),
    className: "text-xs px-2 py-1 rounded border border-[var(--line)] text-[var(--muted)]"
  }, "\u2699 ", showSettings ? '收起' : '设置')), showSettings && React.createElement("section", {
    className: "px-5 py-4 border-b border-[var(--line)] bg-[var(--ink-2)] space-y-3"
  }, React.createElement("div", null, React.createElement("div", {
    className: "text-[10px] tracking-widest text-[var(--muted)] mb-2 mono"
  }, "MODE \u6A21\u5F0F"), React.createElement("div", {
    className: "flex gap-2"
  }, React.createElement("button", {
    onClick: () => {
      reset();
      setMode('practice');
    },
    className: "flex-1 px-3 py-2 rounded text-sm border " + (mode === 'practice' ? "bg-white text-[var(--ink)] border-white font-semibold" : "border-[var(--line)] text-[var(--muted)]")
  }, "\uD83C\uDFA4 \u81EA\u5DF1\u7EC3", React.createElement("div", {
    className: "text-[10px] opacity-60"
  }, "\u4F60\u7B54 \xB7 AI \u8BC4 \xB7 \u770B\u8303\u7B54")), React.createElement("button", {
    onClick: () => {
      reset();
      setMode('spar');
    },
    className: "flex-1 px-3 py-2 rounded text-sm border " + (mode === 'spar' ? "bg-white text-[var(--ink)] border-white font-semibold" : "border-[var(--line)] text-[var(--muted)]")
  }, "\uD83D\uDC65 AI \u5BF9\u7EC3", React.createElement("div", {
    className: "text-[10px] opacity-60"
  }, "\u4E24\u4E2A AI \u5BF9\u7B54 \xB7 \u4F60\u542C\u5B66")))), React.createElement("div", null, React.createElement("div", {
    className: "text-[10px] tracking-widest text-[var(--muted)] mb-2 mono"
  }, "TOPIC \u8303\u56F4"), React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, TOPICS.map(t => React.createElement(Pill, {
    key: t.id,
    active: topic === t.id,
    onClick: () => setTopic(t.id),
    label: t.label,
    hint: t.hint
  })))), React.createElement("div", null, React.createElement("div", {
    className: "text-[10px] tracking-widest text-[var(--muted)] mb-2 mono"
  }, "STYLE \u9762\u8BD5\u98CE\u683C"), React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, STYLES.map(s => React.createElement(Pill, {
    key: s.id,
    active: style === s.id,
    onClick: () => setStyle(s.id),
    label: s.label,
    hint: s.hint
  })))), React.createElement("div", null, React.createElement("div", {
    className: "text-[10px] tracking-widest text-[var(--muted)] mb-2 mono"
  }, "ACCENT \u53E3\u97F3"), React.createElement("div", {
    className: "flex flex-wrap gap-2"
  }, ACCENTS.map(a => React.createElement(Pill, {
    key: a.id,
    active: accent === a.id,
    onClick: () => setAccent(a.id),
    label: a.label,
    hint: a.hint
  })))), React.createElement("div", {
    className: "flex items-center gap-2 pt-1 flex-wrap"
  }, React.createElement("span", {
    className: "text-[10px] tracking-widest text-[var(--muted)] mono"
  }, mode === 'spar' ? '轮数' : '题数'), COUNTS.map(n => React.createElement("button", {
    key: n,
    onClick: () => setNQuestions(n),
    className: "px-3 py-1 rounded text-sm border " + (nQuestions === n ? "bg-white text-[var(--ink)] border-white" : "border-[var(--line)] text-[var(--muted)]")
  }, n)), mode === 'spar' && nQuestions > 12 && React.createElement("span", {
    className: "text-[10px] text-[var(--muted)]"
  }, "\uFF08\u5BF9\u7EC3\u6700\u591A 12 \u8F6E\uFF09")), React.createElement("div", {
    className: "pt-1"
  }, React.createElement("div", {
    className: "text-[10px] tracking-widest text-[var(--muted)] mb-2 mono"
  }, "BACKEND API"), React.createElement("input", {
    value: apiBase,
    onChange: e => setApiBase(e.target.value.trim()),
    placeholder: "https://eng.panyifeng.xyz",
    className: "w-full px-3 py-2 rounded bg-[var(--ink-3)] border border-[var(--line)] text-sm mono"
  }), React.createElement("button", {
    onClick: () => {
      localStorage.setItem('apiBase', apiBase);
      toast.show('已保存');
    },
    className: "mt-2 px-3 py-1.5 rounded bg-white text-[var(--ink)] text-xs font-semibold"
  }, "\u4FDD\u5B58"))), React.createElement("main", {
    className: "flex-1 flex flex-col"
  }, phase === 'idle' && React.createElement("div", {
    className: "flex-1 flex flex-col items-center justify-center px-6 text-center"
  }, React.createElement("div", {
    className: "text-[10px] tracking-[0.3em] text-[var(--muted)] mono mb-3"
  }, "SESSION READY"), React.createElement("h2", {
    className: "serif text-3xl mb-2"
  }, topicLabel, " \xB7 ", styleLabel, " \xB7 ", accentLabel), mode === 'practice' ? React.createElement("p", {
    className: "text-[var(--muted)] text-sm max-w-sm mb-8"
  }, nQuestions, " \u9053\u9898\uFF0C\u5168\u82F1\u4F5C\u7B54\u3002\u6309\u4F4F\u9EA6\u514B\u98CE\u8BF4\u8BDD\uFF0C\u677E\u5F00\u63D0\u4EA4\u3002\u6BCF\u9898\u7ACB\u5373\u83B7\u5F97\u8303\u7B54 + \u5730\u9053\u6539\u5199 + \u9519\u8BEF\u70B9\u8BC4 + \u8BC4\u5206\u3002\u4E0D\u4F1A\u7B54\uFF1F\u4E00\u952E\u300C\u770B\u8303\u7B54\u300D\u3002") : React.createElement("p", {
    className: "text-[var(--muted)] text-sm max-w-sm mb-8"
  }, "AI \u9762\u8BD5\u5B98 \xD7 AI \u8003\u751F\u73B0\u573A\u5BF9\u7B54 ", Math.min(nQuestions, 12), " \u8F6E\uFF0C\u53CC\u58F0\u7EBF TTS\u3002\u4F60\u53EA\u7BA1\u542C + \u770B\u4E2D\u82F1\u5B57\u5E55\uFF0C\u5B66\u4ED6\u4EEC\u600E\u4E48\u95EE\u3001\u600E\u4E48\u7B54\u3002"), React.createElement("button", {
    onClick: mode === 'practice' ? startInterview : startSpar,
    disabled: !apiBase,
    className: "px-8 py-3 rounded-full bg-[var(--hsbc)] hover:opacity-90 disabled:opacity-30 text-white serif text-lg tracking-wide"
  }, mode === 'practice' ? 'Begin Interview' : '▶ 开始对练观摩'), !apiBase && React.createElement("p", {
    className: "text-xs text-[var(--muted)] mt-4"
  }, "\u5148\u5230 \u2699 \u8BBE\u7F6E\u91CC\u586B\u540E\u7AEF\u5730\u5740")), (phase === 'starting' || phase === 'uploading' || phase === 'sparLoading') && React.createElement("div", {
    className: "flex-1 flex flex-col items-center justify-center text-center"
  }, React.createElement("div", {
    className: "bar"
  }), React.createElement("div", {
    className: "bar"
  }), React.createElement("div", {
    className: "bar"
  }), React.createElement("div", {
    className: "bar"
  }), React.createElement("p", {
    className: "text-[var(--muted)] text-sm mt-4"
  }, phase === 'starting' ? '面试官正在准备问题…' : phase === 'sparLoading' ? 'AI 们正在准备对话…（多轮稍等几秒）' : '正在处理…')), (phase === 'listening' || phase === 'recording') && question && React.createElement("div", {
    className: "flex-1 flex flex-col"
  }, React.createElement("section", {
    className: "grain p-6 border-b border-[var(--line)]"
  }, React.createElement("div", {
    className: "flex items-center justify-between text-[10px] mono text-[var(--muted)] mb-3 tracking-widest"
  }, React.createElement("span", null, "Q", idx + 1, " / ", nQuestions), React.createElement("button", {
    onClick: replayQuestion,
    className: "hover:text-white"
  }, "\u21BB REPLAY \uD83D\uDD0A")), React.createElement("h2", {
    className: "serif text-2xl leading-snug mb-3"
  }, question), questionZh && React.createElement("p", {
    className: "text-[var(--muted)] text-sm"
  }, questionZh)), React.createElement("div", {
    className: "flex-1 flex flex-col items-center justify-center pb-safe py-8"
  }, React.createElement("button", {
    onTouchStart: beginRecord,
    onTouchEnd: endRecord,
    onMouseDown: beginRecord,
    onMouseUp: endRecord,
    onMouseLeave: () => phase === 'recording' && endRecord(),
    className: "relative w-32 h-32 rounded-full transition-transform select-none " + (phase === 'recording' ? 'recording-ring scale-95' : 'bg-[var(--ink-3)] border border-[var(--line)] hover:border-white')
  }, React.createElement("div", {
    className: "absolute inset-0 rounded-full flex items-center justify-center " + (phase === 'recording' ? 'bg-[var(--hsbc)]' : 'bg-[var(--ink-3)]')
  }, React.createElement("svg", {
    viewBox: "0 0 24 24",
    className: "w-12 h-12",
    fill: phase === 'recording' ? 'white' : 'var(--text)'
  }, React.createElement("path", {
    d: "M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"
  })))), React.createElement("p", {
    className: "mt-6 text-[var(--muted)] text-sm"
  }, phase === 'recording' ? React.createElement("span", {
    className: "blink"
  }, "\u25CF \u5F55\u97F3\u4E2D \u2014 \u677E\u5F00\u63D0\u4EA4") : '按住说话'), phase === 'listening' && React.createElement("button", {
    onClick: skipQuestion,
    className: "mt-5 px-5 py-2 rounded-full border border-[var(--gold)] text-[var(--gold)] text-sm hover:bg-[var(--gold)] hover:text-[var(--ink)] transition-colors"
  }, "\uD83D\uDE48 \u4E0D\u4F1A \xB7 \u76F4\u63A5\u770B\u8303\u7B54"), phase === 'recording' && (liveText || interimText) && React.createElement("div", {
    className: "mt-6 mx-5 max-w-2xl"
  }, React.createElement("div", {
    className: "text-[10px] mono tracking-widest text-[var(--gold)] mb-2"
  }, "LIVE CAPTION \xB7 \u5B9E\u65F6\u5B57\u5E55"), React.createElement("div", {
    className: "bg-[var(--ink-2)] border border-[var(--line)] rounded-lg p-4 text-base leading-relaxed"
  }, React.createElement("span", null, liveText), interimText && React.createElement("span", {
    className: "text-[var(--muted)] italic"
  }, " ", interimText)), React.createElement("div", {
    className: "text-[10px] text-[var(--muted)] mt-1.5"
  }, "\u6D4F\u89C8\u5668\u5B9E\u65F6\u8BC6\u522B\uFF0C\u677E\u5F00\u5373\u4F5C\u4E3A\u8BC4\u5206\u4F9D\u636E\uFF1B\u8BC6\u522B\u4E0D\u5230\u65F6\u81EA\u52A8\u56DE\u843D\u670D\u52A1\u5668\u8F6C\u5199")), phase === 'recording' && !SR && React.createElement("div", {
    className: "mt-4 text-[10px] text-[var(--muted)] italic"
  }, "\uFF08\u6B64\u6D4F\u89C8\u5668\u4E0D\u652F\u6301 Web Speech\uFF0C\u65E0\u5B9E\u65F6\u5B57\u5E55\u3002\u5EFA\u8BAE\u7528 Chrome / Edge\uFF09"))), phase === 'reviewing' && history.length > 0 && React.createElement("div", {
    className: "flex-1 flex flex-col"
  }, React.createElement("div", {
    className: "px-5 py-4 overflow-y-auto flex-1 pb-safe"
  }, React.createElement("div", {
    className: "flex items-baseline justify-between mb-4"
  }, React.createElement("div", null, React.createElement("div", {
    className: "text-[10px] mono tracking-widest text-[var(--gold)]"
  }, "REVIEW \xB7 \u590D\u76D8"), React.createElement("h2", {
    className: "serif text-2xl mt-1"
  }, "Q", history.slice(-1)[0].idx, " feedback")), React.createElement("span", {
    className: "text-[10px] mono text-[var(--muted)]"
  }, pendingNext ? `${idx} / ${nQuestions}` : `final`)), history.slice(-1).map(h => React.createElement(FeedbackCard, {
    key: h.idx,
    item: h,
    expanded: true
  }))), React.createElement("div", {
    className: "px-5 pb-safe pt-3 border-t border-[var(--line)] bg-[var(--ink)]"
  }, React.createElement("button", {
    onClick: proceedNext,
    className: "w-full py-3 rounded-full bg-[var(--hsbc)] hover:opacity-90 text-white serif text-lg tracking-wide"
  }, pendingNext ? `Next question  Q${idx + 1} →` : 'See debrief →'))), phase === 'finished' && React.createElement("div", {
    className: "flex-1 px-5 py-6 overflow-y-auto pb-safe"
  }, React.createElement("div", {
    className: "text-[10px] mono tracking-widest text-[var(--muted)] mb-2"
  }, "DEBRIEF \xB7 \u603B\u8BC4"), React.createElement("h2", {
    className: "serif text-3xl mb-4"
  }, "Interview complete."), summary ? React.createElement(Summary, {
    s: summary
  }) : React.createElement("p", {
    className: "text-[var(--muted)]"
  }, "\u603B\u8BC4\u751F\u6210\u4E2D\u2026"), React.createElement("div", {
    className: "mt-8 border-t border-[var(--line)] pt-6"
  }, React.createElement("div", {
    className: "text-[10px] mono tracking-widest text-[var(--muted)] mb-3"
  }, "FULL TRANSCRIPT \u5386\u9898"), history.map(h => React.createElement(FeedbackCard, {
    key: h.idx,
    item: h,
    expanded: true
  }))), React.createElement("button", {
    onClick: reset,
    className: "mt-8 w-full py-3 rounded-full border border-[var(--line)] hover:border-white"
  }, "Restart Drill")), phase === 'spar' && React.createElement("div", {
    className: "flex-1 flex flex-col"
  }, React.createElement("div", {
    className: "px-5 py-3 border-b border-[var(--line)] flex items-center justify-between"
  }, React.createElement("div", {
    className: "text-[10px] mono tracking-widest text-[var(--gold)]"
  }, "AI \u5BF9\u7EC3 \xB7 ", topicLabel, " \xB7 ", Math.min(dialogue.length / 2 | 0 || 0, 99), " \u8F6E"), React.createElement("div", {
    className: "flex items-center gap-3"
  }, React.createElement("button", {
    onClick: () => setShowZh(z => !z),
    className: "text-xs text-[var(--muted)] hover:text-white"
  }, showZh ? '中/EN' : 'EN only'), React.createElement("button", {
    onClick: reset,
    className: "text-xs text-[var(--muted)] hover:text-white"
  }, "\u2715 \u9000\u51FA"))), React.createElement("div", {
    className: "flex-1 overflow-y-auto px-4 py-4 space-y-3"
  }, dialogue.map((d, i) => {
    if (i > sparIdx) return null;
    const isInt = d.role === 'interviewer';
    const cur = i === sparIdx;
    return React.createElement("div", {
      key: i,
      ref: cur ? curBubbleRef : null,
      className: "flex " + (isInt ? "justify-start" : "justify-end")
    }, React.createElement("div", {
      onClick: () => jumpSparLine(i),
      className: "max-w-[85%] rounded-2xl px-4 py-3 cursor-pointer transition-all border " + (isInt ? "bg-[var(--ink-2)] border-[var(--line)] rounded-tl-sm " : "bg-[var(--ink-3)] border-[var(--line)] rounded-tr-sm ") + (cur ? "ring-2 ring-[var(--gold)]" : "opacity-90")
    }, React.createElement("div", {
      className: "text-[10px] mono tracking-widest mb-1 " + (isInt ? "text-[var(--hsbc)]" : "text-[var(--teal)]")
    }, isInt ? '面试官 INTERVIEWER' : '考生 CANDIDATE', cur && sparPlaying ? ' · 🔊' : ''), React.createElement("p", {
      className: "serif leading-relaxed"
    }, d.en), showZh && d.zh && React.createElement("p", {
      className: "text-sm text-[var(--muted)] mt-1.5"
    }, d.zh)));
  }), sparDone && React.createElement("div", {
    className: "text-center text-[var(--muted)] text-sm py-4"
  }, "\u2014 \u5BF9\u7EC3\u7ED3\u675F \xB7 \u70B9\u4EFB\u610F\u4E00\u53E5\u53EF\u91CD\u542C \u2014")), React.createElement("div", {
    className: "px-5 pb-safe pt-3 border-t border-[var(--line)] bg-[var(--ink)] flex items-center justify-center gap-5"
  }, React.createElement("button", {
    onClick: replaySparLine,
    title: "\u91CD\u542C\u672C\u53E5",
    className: "w-11 h-11 rounded-full border border-[var(--line)] hover:border-white flex items-center justify-center"
  }, "\u23EE"), sparPlaying ? React.createElement("button", {
    onClick: pauseSpar,
    className: "w-14 h-14 rounded-full bg-[var(--hsbc)] text-white flex items-center justify-center text-xl"
  }, "\u23F8") : React.createElement("button", {
    onClick: sparDone ? startSpar : resumeSpar,
    className: "w-14 h-14 rounded-full bg-[var(--hsbc)] text-white flex items-center justify-center text-xl"
  }, sparDone ? '↻' : '▶'), React.createElement("button", {
    onClick: () => jumpSparLine(Math.min(dialogue.length - 1, sparIdx + 1)),
    title: "\u4E0B\u4E00\u53E5",
    className: "w-11 h-11 rounded-full border border-[var(--line)] hover:border-white flex items-center justify-center"
  }, "\u23ED"), React.createElement("span", {
    className: "text-[10px] mono text-[var(--muted)] ml-2"
  }, Math.max(0, sparIdx + 1), "/", dialogue.length))), phase === 'error' && React.createElement("div", {
    className: "flex-1 flex flex-col items-center justify-center px-6 text-center"
  }, React.createElement("div", {
    className: "text-[var(--hsbc)] serif text-2xl mb-2"
  }, "\u26A0 Something broke"), React.createElement("pre", {
    className: "text-xs text-[var(--muted)] max-w-full whitespace-pre-wrap mono"
  }, error), React.createElement("button", {
    onClick: reset,
    className: "mt-6 px-6 py-2 rounded-full border border-[var(--line)]"
  }, "Restart"))));
}
function FeedbackCard({
  item,
  expanded
}) {
  const fb = item.feedback;
  if (!fb) return null;
  const skipped = fb.skipped;
  return React.createElement("div", {
    className: "bg-[var(--ink-2)] border border-[var(--line)] rounded-lg p-4 mb-3"
  }, React.createElement("div", {
    className: "flex items-center justify-between mb-2"
  }, React.createElement("span", {
    className: "text-[10px] mono tracking-widest text-[var(--muted)]"
  }, "Q", item.idx), skipped ? React.createElement("span", {
    className: "text-[10px] mono tracking-widest text-[var(--gold)] border border-[var(--gold)] rounded px-2 py-0.5"
  }, "\u5DF2\u8DF3\u8FC7 \xB7 \u8303\u7B54") : React.createElement("div", {
    className: "w-40"
  }, React.createElement(ScoreBar, {
    score: fb.score
  }))), expanded && item.question && React.createElement("p", {
    className: "serif text-sm mb-2 text-[var(--muted)]"
  }, "Q: ", item.question), item.sttText && !skipped && React.createElement("div", {
    className: "text-sm text-[var(--muted)] italic mb-3 border-l-2 border-[var(--line)] pl-3"
  }, "\u4F60\u7684\u56DE\u7B54\uFF1A", item.sttText), fb.model_answer && React.createElement("div", {
    className: "mb-3"
  }, React.createElement("div", {
    className: "text-[10px] mono tracking-widest text-[var(--gold)] mb-1"
  }, "MODEL ANSWER \xB7 \u8303\u7B54"), React.createElement("p", {
    className: "serif leading-relaxed"
  }, fb.model_answer), fb.model_answer_zh && React.createElement("p", {
    className: "text-sm text-[var(--muted)] mt-1.5"
  }, fb.model_answer_zh)), fb.key_points_zh && fb.key_points_zh.length > 0 && React.createElement("div", {
    className: "mb-3"
  }, React.createElement("div", {
    className: "text-[10px] mono tracking-widest text-[var(--teal)] mb-1"
  }, "\u7B54\u9898\u8981\u70B9"), React.createElement("ul", {
    className: "text-sm space-y-1"
  }, fb.key_points_zh.map((e, i) => React.createElement("li", {
    key: i
  }, "\u2022 ", e)))), fb.rewrite && React.createElement("div", {
    className: "mb-3"
  }, React.createElement("div", {
    className: "text-[10px] mono tracking-widest text-[var(--teal)] mb-1"
  }, "NATIVE REWRITE \xB7 \u4F60\u7684\u8BDD\u6539\u5199"), React.createElement("p", {
    className: "serif"
  }, fb.rewrite)), fb.errors && fb.errors.length > 0 && React.createElement("div", {
    className: "mb-3"
  }, React.createElement("div", {
    className: "text-[10px] mono tracking-widest text-[var(--hsbc)] mb-1"
  }, "\u9519\u8BEF\u70B9\u8BC4"), React.createElement("ul", {
    className: "text-sm space-y-1"
  }, fb.errors.map((e, i) => React.createElement("li", {
    key: i,
    className: "text-[var(--text)]"
  }, "\u2022 ", e)))), fb.vocab && fb.vocab.length > 0 && React.createElement("div", {
    className: "mb-3"
  }, React.createElement("div", {
    className: "text-[10px] mono tracking-widest text-[var(--gold)] mb-1"
  }, "\u5730\u9053\u8868\u8FBE"), React.createElement("ul", {
    className: "text-sm space-y-1"
  }, fb.vocab.map((e, i) => React.createElement("li", {
    key: i
  }, "\u2022 ", e)))), fb.coach_zh && React.createElement("div", null, React.createElement("div", {
    className: "text-[10px] mono tracking-widest text-[var(--gold)] mb-1"
  }, "\u6559\u7EC3"), React.createElement("p", {
    className: "text-sm"
  }, fb.coach_zh)));
}
function Summary({
  s
}) {
  return React.createElement("div", {
    className: "space-y-5"
  }, React.createElement("div", {
    className: "flex items-baseline gap-3"
  }, React.createElement("span", {
    className: "text-[10px] mono tracking-widest text-[var(--muted)]"
  }, "CEFR"), React.createElement("span", {
    className: "serif text-3xl text-[var(--gold)]"
  }, s.cefr || '?')), s.verdict_zh && React.createElement("p", {
    className: "serif text-lg leading-relaxed"
  }, s.verdict_zh), React.createElement(Section, {
    title: "\u4F18\u52BF",
    items: s.strengths,
    color: "var(--teal)"
  }), React.createElement(Section, {
    title: "\u5F85\u8865",
    items: s.weaknesses,
    color: "var(--hsbc)"
  }), React.createElement(Section, {
    title: "\u5730\u9053\u8868\u8FBE",
    items: s.vocab,
    color: "var(--gold)",
    mono: true
  }), React.createElement(Section, {
    title: "\u884C\u52A8\u9879",
    items: s.action_items,
    color: "var(--text)"
  }));
}
function Section({
  title,
  items,
  color,
  mono: useMono
}) {
  if (!items || !items.length) return null;
  return React.createElement("div", null, React.createElement("div", {
    className: "text-[10px] mono tracking-widest mb-2",
    style: {
      color
    }
  }, title), React.createElement("ul", {
    className: "space-y-1.5 text-sm " + (useMono ? '' : '')
  }, items.map((it, i) => React.createElement("li", {
    key: i,
    className: "flex gap-2"
  }, React.createElement("span", {
    className: "text-[var(--muted)]"
  }, "\xB7"), React.createElement("span", null, it)))));
}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App, null));