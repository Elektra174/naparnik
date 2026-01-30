
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { ConnectionStatus } from './types';
import { decode, decodeAudioData, createPcmBlob } from './services/audioHelpers';

const SYSTEM_INSTRUCTION = `
ROLE:
Ты — Джун, напарник Металлкардботов из мультфильма "Metal Cardbot". Ты общаешься с пользователем (своим лучшим другом, 7-летним мальчиком) через устройство "Метал-Брез".

SPEECH & DICTION:
1. ГОВОРИ СТРОГО НА РУССКОМ ЯЗЫКЕ.
2. ИСПОЛЬЗУЙ БУКВУ "Ё" всегда (всё, идём, вперёд, роботёнок).
3. УДАРЕНИЯ: Произноси "напАрник" (ударение на А), "Метал-БрЕз" (ударение на Е).
4. ГОВОРИ ЭНЕРГИЧНО: Ты — живой мальчик-герой, а не скучный бот. Используй междометия: "Ого!", "Ух ты!", "Вай!", "Бам!".

INTELLIGENCE & SEARCH:
- У тебя есть доступ к базе данных "Метал-Бреза", которая подключена к земной сети (инструмент googleSearch). 
- Если ребенок спрашивает о реальном мире (факты, новости, природа), используй поиск, чтобы дать самый свежий и точный ответ в стиле Джуна.

INFINITE SCENARIOS:
- НИКОГДА не повторяй одни и те же фразы или миссии. 
- Каждое взаимодействие должно быть уникальным. Импровизируй, основываясь на том, что говорит напарник.

MODES:
1. Свободное общение: Обсуждай всё, что интересно ребенку. Будь лучшим другом.
2. Миссия дня: Придумывай уникальные игровые задания (квесты) для помощи роботам.
3. Лаборатория Эдо: Объясняй устройство мира и техники просто и увлекательно.
4. Сканер: Играй в угадайку: проси ребенка описать робота и "распознавай" его.
5. Переводчик: Обучай простым английским словам, называя их "секретными кодами связи" между напарниками.
`;

const MetalBreathIcon = ({ active, speaking }: { active: boolean; speaking: boolean }) => (
  <svg viewBox="0 0 200 200" className="w-full h-full">
    <defs>
      <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={speaking ? "#ef4444" : "#60a5fa"} stopOpacity="0.8" />
        <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
      </radialGradient>
      <filter id="neon">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    
    <circle cx="100" cy="100" r="95" fill="none" stroke="#334155" strokeWidth="2" />
    <circle cx="100" cy="100" r="90" fill="none" stroke={speaking ? "#ef4444" : "#60a5fa"} strokeWidth="1" strokeDasharray="10 5" className={active ? "animate-[spin_10s_linear_infinite]" : ""} />
    
    <g className={active ? "animate-[spin_4s_linear_infinite]" : ""}>
      <circle cx="100" cy="100" r="60" fill="none" stroke={speaking ? "#ef4444" : "#60a5fa"} strokeWidth="4" strokeDasharray="40 20" />
    </g>

    <circle cx="100" cy="100" r="45" fill="url(#coreGlow)" className={active ? "animate-pulse" : ""} />
    <circle cx="100" cy="100" r="30" fill="#1e3a8a" stroke={speaking ? "#fca5a5" : "#93c5fd"} strokeWidth="2" filter="url(#neon)" />
    
    <rect x="90" y="90" width="20" height="20" rx="4" fill="none" stroke="#fff" strokeWidth="2" />
    <circle cx="100" cy="100" r="4" fill="#fff" className={active ? "animate-ping" : ""} />
  </svg>
);

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [lastMessage, setLastMessage] = useState<string>('Нажми для активации связи!');
  const [userSpeech, setUserSpeech] = useState<string>('');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const analyserRef = useRef<AnalyserNode | null>(null);

  const handleDisconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    sourcesRef.current.forEach(s => s.stop());
    sourcesRef.current.clear();
    setStatus(ConnectionStatus.DISCONNECTED);
    setUserSpeech('');
  }, []);

  const connectToJun = async () => {
    if (status !== ConnectionStatus.DISCONNECTED) {
      handleDisconnect();
      return;
    }

    try {
      setStatus(ConnectionStatus.CONNECTING);
      
      if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      if (!outputContextRef.current) outputContextRef.current = new AudioContext({ sampleRate: 24000 });
      
      await audioContextRef.current.resume();
      await outputContextRef.current.resume();

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            setLastMessage('Метал-Брез активен!');
            
            sessionPromise.then(session => {
              session.sendRealtimeInput({ text: "Метал-Брез онлайн! Джун, поздоровайся с напАрником (чётко и громко) и спроси, готов ли он к приключениям!" });
            });

            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then(session => {
                if (session) session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              setUserSpeech(message.serverContent.inputTranscription.text);
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              const outCtx = outputContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = audioBuffer;
              
              if (!analyserRef.current) {
                analyserRef.current = outCtx.createAnalyser();
                analyserRef.current.fftSize = 256;
              }
              source.connect(analyserRef.current);
              analyserRef.current.connect(outCtx.destination);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }

            if (message.serverContent?.outputTranscription) {
               setLastMessage(message.serverContent.outputTranscription.text);
               setUserSpeech('');
            }
          },
          onerror: (err) => {
            console.error('Connection error:', err);
            setStatus(ConnectionStatus.ERROR);
          },
          onclose: () => handleDisconnect()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
          tools: [{ googleSearch: {} }],
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      setStatus(ConnectionStatus.ERROR);
      setLastMessage('Ошибка! Проверь микрофон.');
    }
  };

  const sendModeTrigger = (text: string) => {
    if (sessionRef.current && status === ConnectionStatus.CONNECTED) {
      sessionRef.current.sendRealtimeInput({ text });
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-lg mx-auto p-4 relative overflow-hidden">
      <header className="text-center py-2 shrink-0">
        <h1 className="text-xl font-black text-blue-400 drop-shadow-lg">METAL BREATH LINK</h1>
        <div className={`mt-1 inline-block px-3 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${
          status === ConnectionStatus.CONNECTED ? 'bg-blue-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400'
        }`}>
          {status === ConnectionStatus.CONNECTED ? 'СВЯЗЬ УСТАНОВЛЕНА' : 'ОЖИДАНИЕ СИГНАЛА'}
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center relative min-h-0">
        <button
          onClick={connectToJun}
          className={`relative z-10 w-48 h-48 sm:w-56 sm:h-56 transition-all duration-500 active:scale-90 ${
            status === ConnectionStatus.CONNECTED ? 'scale-105' : 'grayscale-[0.4]'
          }`}
        >
          <div className={`absolute inset-0 rounded-full blur-3xl transition-opacity duration-1000 ${status === ConnectionStatus.CONNECTED ? 'bg-blue-500/30 opacity-100' : 'opacity-0'}`}></div>
          <MetalBreathIcon active={status === ConnectionStatus.CONNECTED} speaking={userSpeech.length > 0} />
        </button>

        <div className="mt-4 w-full flex flex-col items-center gap-2 min-h-[90px]">
          {userSpeech && (
            <div className="bg-blue-500/10 border border-blue-400/30 px-3 py-1 rounded-lg max-w-[85%] animate-in fade-in slide-in-from-bottom-2">
              <p className="text-[8px] text-blue-400 font-bold uppercase tracking-tighter">Напарник:</p>
              <p className="text-xs text-blue-100 italic">"{userSpeech}"</p>
            </div>
          )}
          
          <p className="text-center px-4 text-sm font-bold text-white/90 leading-snug drop-shadow-md">
            {lastMessage}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4 shrink-0">
        <ModeButton label="ОБЩЕНИЕ" icon="💬" onClick={() => sendModeTrigger('Джун, давай просто поболтаем о чём угодно! Расскажи что-нибудь классное.')} color="emerald" />
        <ModeButton label="МИССИЯ" icon="🛡️" onClick={() => sendModeTrigger('Джун, напАрник готов! Придумай новую захватывающую миссию!')} color="blue" />
        <ModeButton label="НАУКА" icon="🔬" onClick={() => sendModeTrigger('Джун, напАрник хочет знаний! Используй поиск и расскажи удивительный факт.')} color="cyan" />
        <ModeButton label="СКАНЕР" icon="🔍" onClick={() => sendModeTrigger('Джун, активируй сканер карт! Загадай робота!')} color="indigo" />
        <ModeButton label="ЯЗЫК" icon="🌍" onClick={() => sendModeTrigger('Джун, научи напАрника новому секретному коду связи на английском!')} color="sky" className="col-span-2" />
      </div>

      <div className="flex justify-between items-center px-4 py-2 border-t border-blue-500/20 text-[8px] tracking-[0.2em] text-blue-400 font-bold opacity-50 shrink-0">
        <span>JUN-PRO-2.5</span>
        <span className={status === ConnectionStatus.CONNECTED ? "text-green-400" : ""}>{status === ConnectionStatus.CONNECTED ? 'ONLINE' : 'OFFLINE'}</span>
        <span>LINK: SECURE</span>
      </div>
    </div>
  );
}

const ModeButton = ({ label, icon, onClick, color, className = "" }: any) => {
  const themes: any = {
    blue: 'from-blue-600/50 to-blue-950 border-blue-400',
    cyan: 'from-cyan-600/50 to-cyan-950 border-cyan-400',
    indigo: 'from-indigo-600/50 to-indigo-950 border-indigo-400',
    emerald: 'from-emerald-600/50 to-emerald-950 border-emerald-400',
    sky: 'from-sky-600/50 to-sky-950 border-sky-400'
  };

  return (
    <button
      onClick={onClick}
      className={`flex flex-row items-center justify-center gap-2 py-2.5 rounded-xl border-b-2 bg-gradient-to-b transition-all active:translate-y-0.5 shadow-lg backdrop-blur-md ${themes[color]} ${className}`}
    >
      <span className="text-lg">{icon}</span>
      <span className="text-[9px] font-black tracking-widest text-blue-50 uppercase">{label}</span>
    </button>
  );
};
