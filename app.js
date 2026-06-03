/* built from app.src.jsx — do not edit; run build.sh */
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
  hint: '汇丰/银行外企 strengths + values'
}, {
  id: 'strengths',
  label: 'HireVue',
  hint: '单向自录节奏 30s+90s'
}, {
  id: 'tech',
  label: 'Tech',
  hint: 'system design 深挖'
}, {
  id: 'behavioral',
  label: 'Behavioural',
  hint: '纯 STAR 行为面'
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
function pickMime() {
  const cand = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus'];
  for (const m of cand) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
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
  const [style, setStyle] = useState(localStorage.getItem('style') || 'hsbc');
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
    localStorage.setItem('style', style);
  }, [style]);
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
  const startInterview = async () => {
    if (!apiBase) {
      setShowSettings(true);
      return;
    }
    if (!AUTH_TOKEN) {
      setError('未授权：缺少 token。请用 magic link 重新访问，或在 ⚙ 设置里填 token。');
      setPhase('error');
      return;
    }
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
            accent
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
  const reset = () => {
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
  };
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
  }, "BACKEND API"), React.createElement("input", {
    value: apiBase,
    onChange: e => setApiBase(e.target.value.trim()),
    placeholder: "https://xxx.trycloudflare.com",
    className: "w-full px-3 py-2 rounded bg-[var(--ink-3)] border border-[var(--line)] text-sm mono"
  }), React.createElement("button", {
    onClick: () => {
      localStorage.setItem('apiBase', apiBase);
      toast.show('已保存');
    },
    className: "mt-2 px-3 py-1.5 rounded bg-white text-[var(--ink)] text-xs font-semibold"
  }, "\u4FDD\u5B58")), React.createElement("div", null, React.createElement("div", {
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
    className: "flex items-center gap-3 pt-1"
  }, React.createElement("span", {
    className: "text-[10px] tracking-widest text-[var(--muted)] mono"
  }, "\u9898\u6570"), [4, 6, 8].map(n => React.createElement("button", {
    key: n,
    onClick: () => setNQuestions(n),
    className: "px-3 py-1 rounded text-sm border " + (nQuestions === n ? "bg-white text-[var(--ink)] border-white" : "border-[var(--line)] text-[var(--muted)]")
  }, n)))), React.createElement("main", {
    className: "flex-1 flex flex-col"
  }, phase === 'idle' && React.createElement("div", {
    className: "flex-1 flex flex-col items-center justify-center px-6 text-center"
  }, React.createElement("div", {
    className: "text-[10px] tracking-[0.3em] text-[var(--muted)] mono mb-3"
  }, "SESSION READY"), React.createElement("h2", {
    className: "serif text-3xl mb-2"
  }, "\u300C", STYLES.find(s => s.id === style)?.label, "\u300D\u9762 \xB7 ", ACCENTS.find(a => a.id === accent)?.label), React.createElement("p", {
    className: "text-[var(--muted)] text-sm max-w-sm mb-8"
  }, nQuestions, " \u9053\u9898\uFF0C\u5168\u82F1\u4F5C\u7B54\u3002\u6309\u4F4F\u9EA6\u514B\u98CE\u8BF4\u8BDD\uFF0C\u677E\u5F00\u63D0\u4EA4\u3002\u6BCF\u9898\u7ACB\u5373\u83B7\u5F97\u5730\u9053\u6539\u5199 + \u9519\u8BEF\u70B9\u8BC4 + \u8BC4\u5206\u3002"), React.createElement("button", {
    onClick: startInterview,
    disabled: !apiBase,
    className: "px-8 py-3 rounded-full bg-[var(--hsbc)] hover:opacity-90 disabled:opacity-30 text-white serif text-lg tracking-wide"
  }, "Begin Interview"), !apiBase && React.createElement("p", {
    className: "text-xs text-[var(--muted)] mt-4"
  }, "\u5148\u5230 \u2699 \u8BBE\u7F6E\u91CC\u586B\u540E\u7AEF\u5730\u5740")), (phase === 'starting' || phase === 'uploading') && React.createElement("div", {
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
  }, phase === 'starting' ? '面试官正在准备问题…' : '正在转写 + 评分…')), (phase === 'listening' || phase === 'recording') && question && React.createElement("div", {
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
  }, "\u25CF \u5F55\u97F3\u4E2D \u2014 \u677E\u5F00\u63D0\u4EA4") : '按住说话'), phase === 'recording' && (liveText || interimText) && React.createElement("div", {
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
  }, "\uFF08\u6B64\u6D4F\u89C8\u5668\u4E0D\u652F\u6301 Web Speech\uFF0C\u65E0\u5B9E\u65F6\u5B57\u5E55\u3002\u5EFA\u8BAE\u7528 iOS Safari / Chrome / Edge\uFF09"))), phase === 'reviewing' && history.length > 0 && React.createElement("div", {
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
  }, "Restart Drill")), phase === 'error' && React.createElement("div", {
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
  return React.createElement("div", {
    className: "bg-[var(--ink-2)] border border-[var(--line)] rounded-lg p-4 mb-3"
  }, React.createElement("div", {
    className: "flex items-center justify-between mb-2"
  }, React.createElement("span", {
    className: "text-[10px] mono tracking-widest text-[var(--muted)]"
  }, "Q", item.idx), React.createElement("div", {
    className: "w-40"
  }, React.createElement(ScoreBar, {
    score: fb.score
  }))), expanded && item.question && React.createElement("p", {
    className: "serif text-sm mb-2 text-[var(--muted)]"
  }, "Q: ", item.question), item.sttText && React.createElement("div", {
    className: "text-sm text-[var(--muted)] italic mb-3 border-l-2 border-[var(--line)] pl-3"
  }, item.sttText), fb.rewrite && React.createElement("div", {
    className: "mb-3"
  }, React.createElement("div", {
    className: "text-[10px] mono tracking-widest text-[var(--teal)] mb-1"
  }, "NATIVE REWRITE"), React.createElement("p", {
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