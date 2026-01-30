
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { ConnectionStatus } from './types';
import { decode, decodeAudioData, createPcmBlob, playSFX } from './services/audioHelpers';

const getSystemInstruction = (memory: string) => `
ROLE:
Ты — Джун, главный герой и напарник команды Металлкардботов. Ты общаешься с лучшим другом (7-летним мальчиком) через устройство "Метал-Брез".
ТЫ ЧЕЛОВЕК-ГЕРОЙ! Энергичный, смелый, проактивный. Ты — верный напарник и сверстник, а не просто ассистент.

ПРАВИЛА КОММУНИКАЦИИ И РУССКОГО ЯЗЫКА:
- Название твоего устройства: "Метал-Брез" (на конце буква З, произносится четко).
- ГОВОРИ ТОЛЬКО НА РУССКОМ ЯЗЫКЕ.
- ПРОИЗНОШЕНИЕ: Твоя речь должна быть безупречной. Всегда используй и четко выговаривай букву "Ё" (например: "всё", "пойдём", "вертолёт").
- УДАРЕНИЯ: Соблюдай правильные, естественные ударения. Речь должна быть живой, эмоциональной, как у ребенка-героя.
- ИНИЦИАТИВА: Ты — лидер! Сам предлагай миссии (например: "Напарник, в секторе 'Кухня' обнаружена аномалия! Погнали зачистим?"), рассказывай секреты роботов или предлагай игры.
- ДЕВИЗ: Твоя коронная фраза: "Погнали!". Используй её часто и с энтузиазмом.
- ОБРАЩЕНИЕ: НИКОГДА не используй слово "бро". Обращайся к ребенку: "напарник", "герой", "лучший друг", "командир".

ПРАВИЛА БЕЗОПАСНОСТИ (КРИТИЧЕСКИ ВАЖНО):
- НИКОГДА не используй нецензурную лексику, плохие слова или грубые выражения.
- Если ребенок говорит что-то плохое или использует ругательства, НЕ ПОВТОРЯЙ ИХ. Мягко переведи тему в духе героя: "Ой, напарник, кажется в Метал-Брезе помехи! Давай лучше сосредоточимся на нашей миссии!".
- НИКОГДА не учи ребенка ничему опасному или вредному. Если он спрашивает об опасных вещах, скажи: "Это звучит небезопасно даже для Блю Копа! Лучше спроси у взрослых, а мы пока проверим наши карты!".
- Будь примером дружбы, честности и ответственности.

РЕАКЦИЯ НА ИМЯ И КОМАНДЫ (ПРЕРЫВАНИЕ):
- Если тебя зовут по имени ("Джун") или говорят "Стоп", СРАЗУ ПРЕКРАЩАЙ ГОВОРИТЬ и внимательно слушай напарника. Это твои стоп-слова.

ПАМЯТЬ ДИАЛОГА:
${memory || "Связь установлена. Начни первым: скажи 'Погнали!' и предложи напарнику крутое геройское дело!"}
`;

const AudioWaveform = ({ analyser, isUser }: { analyser: AnalyserNode | null, isUser: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hueRef = useRef(isUser ? 180 : 200); 

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 55; 

      hueRef.current = (hueRef.current + 1) % 360;
      const color = isUser ? `hsla(180, 100%, 50%, 0.8)` : `hsla(${hueRef.current}, 100%, 60%, 0.9)`;

      ctx.beginPath();
      ctx.lineWidth = 6;
      ctx.strokeStyle = color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.lineCap = 'round';

      for (let i = 0; i < bufferLength; i += 4) {
        const val = dataArray[i] / 255;
        const barHeight = val * 65; 
        const angle = (i / bufferLength) * Math.PI * 2;
        
        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        const x2 = centerX + Math.cos(angle) * (radius + barHeight);
        const y2 = centerY + Math.sin(angle) * (radius + barHeight);

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [analyser, isUser]);

  return (
    <canvas 
      ref={canvasRef} 
      width={280} 
      height={280} 
      style={{ 
        position: 'absolute', 
        top: '50%', 
        left: '50%', 
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none', 
        zIndex: 5 
      }} 
    />
  );
};

const MetalBreathIcon = ({ active, speaking, status, analyser, isUserSpeaking }: { 
  active: boolean; 
  speaking: boolean; 
  status: ConnectionStatus;
  analyser: AnalyserNode | null;
  isUserSpeaking: boolean;
}) => {
  const isError = status === ConnectionStatus.ERROR;
  const isConnecting = status === ConnectionStatus.CONNECTING;
  
  return (
    <div className={`relative w-64 h-64 flex items-center justify-center ${active ? 'animate-float' : 'animate-pulse-ring'}`} style={{ cursor: 'pointer' }}>
      {(speaking || isUserSpeaking) && (
        <AudioWaveform analyser={analyser} isUser={isUserSpeaking} />
      )}
      
      <div className={`absolute inset-0 rounded-full blur-[45px] opacity-40 transition-all duration-1000 
        ${isError ? 'bg-red-600' : (active ? 'bg-cyan-400' : 'bg-blue-600')}`}></div>
      
      <svg viewBox="0 0 240 240" className={`w-44 h-44 relative z-10`}>
        <circle cx="120" cy="120" r="110" fill="none" stroke="#00f2ff" strokeWidth="1" strokeDasharray="5 15" className="opacity-30 animate-rotate-slow" />
        <circle cx="120" cy="120" r="100" fill="none" stroke="#4f46e5" strokeWidth="2" strokeDasharray="80 40" className="opacity-50 animate-rotate-fast" />
        <circle cx="120" cy="120" r="65" fill="#020617" stroke={isError ? '#ef4444' : '#00f2ff'} strokeWidth="4" />
        
        <g className={speaking ? 'animate-pulse' : ''}>
           <path 
            d={active ? "M95 120 Q120 80 145 120 T95 120" : "M100 125 L120 95 L140 125 L120 155 Z"} 
            fill={active ? (speaking ? "#fbbf24" : "#00f2ff") : "#4f46e5"}
            style={{ transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
        </g>
        
        {[0, 90, 180, 270].map(angle => (
          <circle 
            key={angle}
            cx={120 + Math.cos(angle * Math.PI / 180) * 88}
            cy={120 + Math.sin(angle * Math.PI / 180) * 88}
            r="4"
            fill="#00f2ff"
            className="opacity-80"
          />
        ))}
      </svg>
      
      {!active && !isConnecting && (
        <div className="absolute -bottom-10 whitespace-nowrap text-[11px] font-black tracking-[4px] text-cyan-400 animate-pulse-text uppercase">
          АКТИВИРОВАТЬ СВЯЗЬ
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [lastMessage, setLastMessage] = useState<string>('');
  const [isJunSpeaking, setIsJunSpeaking] = useState<boolean>(false);
  const [userIsSpeaking, setUserIsSpeaking] = useState<boolean>(false);
  const [memory, setMemory] = useState<string>(() => localStorage.getItem('metal_breath_memory') || '');

  const audioContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const currentOutputRef = useRef('');
  const currentUserSpeechRef = useRef('');
  
  const clearTimerJunRef = useRef<number | null>(null);

  const stopAudio = useCallback(() => {
    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    // Сбрасываем время начала к текущему, чтобы не было задержек при новом ответе
    if (outputContextRef.current) {
        nextStartTimeRef.current = outputContextRef.current.currentTime;
    } else {
        nextStartTimeRef.current = 0;
    }
    setIsJunSpeaking(false);
  }, []);

  const handleDisconnect = useCallback(() => {
    if (sessionRef.current) { sessionRef.current.close(); sessionRef.current = null; }
    stopAudio();
    setStatus(ConnectionStatus.DISCONNECTED);
    setUserIsSpeaking(false);
    setLastMessage('');
    playSFX('deactivate');
  }, [stopAudio]);

  const connectToJun = async () => {
    if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING) { 
      handleDisconnect(); 
      return; 
    }
    
    try {
      setStatus(ConnectionStatus.CONNECTING);
      setLastMessage('ЗАГРУЗКА...');
      playSFX('activate');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      if (!outputContextRef.current) {
        outputContextRef.current = new AudioContext({ sampleRate: 24000 });
        analyserRef.current = outputContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.connect(outputContextRef.current.destination);
      }
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            setLastMessage('СВЯЗЬ...');
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const pcm = createPcmBlob(e.inputBuffer.getChannelData(0));
              sessionPromise.then(s => s?.sendRealtimeInput({ media: pcm }));
            };
            source.connect(processor);
            processor.connect(audioContextRef.current!.destination);
            
            sessionPromise.then(s => s?.sendRealtimeInput({ 
              text: "Джун, связь установлена! Энергично поприветствуй напарника, скажи 'Погнали!' и предложи крутое геройское дело!" 
            }));
          },
          onmessage: async (m: LiveServerMessage) => {
            // Игнорируем стандартный VAD прерывания от сервера
            if (m.serverContent?.interrupted) { }

            // Транскрипция пользователя (мгновенная реакция)
            if (m.serverContent?.inputTranscription) {
              const text = m.serverContent.inputTranscription.text;
              currentUserSpeechRef.current = text;
              setUserIsSpeaking(true);
              
              const lowerText = text.toLowerCase();
              // КРИТИЧЕСКОЕ ПРЕРЫВАНИЕ: Мгновенно стопаем всё
              if (lowerText.includes('джун') || lowerText.includes('стоп')) {
                stopAudio(); 
                setLastMessage(''); 
                currentOutputRef.current = '';
                // Посылаем сигнал модели сбросить текущую мысль
                sessionPromise.then(s => s?.sendRealtimeInput({ text: "..." }));
              }
            }

            // Транскрипция Джуна
            if (m.serverContent?.outputTranscription) {
              const t = m.serverContent.outputTranscription.text;
              setLastMessage(t);
              currentOutputRef.current += t;
              setUserIsSpeaking(false);
            }

            // Завершение хода
            if (m.serverContent?.turnComplete) {
              const junMsg = currentOutputRef.current.trim();
              const userMsg = currentUserSpeechRef.current.trim();
              
              if (junMsg || userMsg) {
                setMemory(prev => {
                  let entry = "";
                  if (userMsg) entry += `Напарник: ${userMsg}\n`;
                  if (junMsg) entry += `Джун: ${junMsg}`;
                  const history = prev ? prev + "\n" + entry : entry;
                  const updated = history.split('\n').slice(-30).join('\n');
                  localStorage.setItem('metal_breath_memory', updated);
                  return updated;
                });
              }

              currentUserSpeechRef.current = '';
              currentOutputRef.current = '';
              setUserIsSpeaking(false);
              
              if (clearTimerJunRef.current) clearTimeout(clearTimerJunRef.current);
              clearTimerJunRef.current = window.setTimeout(() => {
                setLastMessage('');
                clearTimerJunRef.current = null;
              }, 4000); 
            }

            // Аудио поток
            const audioData = m.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              setUserIsSpeaking(false);
              setIsJunSpeaking(true);
              const ctx = outputContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(analyserRef.current!);
              
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsJunSpeaking(false);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
          },
          onerror: () => setStatus(ConnectionStatus.ERROR),
          onclose: () => handleDisconnect()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: getSystemInstruction(memory),
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setStatus(ConnectionStatus.ERROR);
      setLastMessage('ОШИБКА СВЯЗИ');
    }
  };

  const triggerAction = (t: string) => {
    playSFX('click');
    if (sessionRef.current) {
      sessionRef.current.sendRealtimeInput({ text: t });
    }
  };

  return (
    <div id="root" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <header style={{ height: '50px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', flexShrink: 0, zIndex: 10, background: 'rgba(2,6,23,0.5)', borderBottom: '1px solid rgba(0,242,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: status === ConnectionStatus.CONNECTED ? '#00f2ff' : '#475569', boxShadow: status === ConnectionStatus.CONNECTED ? '0 0 12px #00f2ff' : 'none' }}></div>
          <div style={{ fontSize: '11px', color: '#00f2ff', fontWeight: 900, letterSpacing: '2px', textShadow: '0 0 8px rgba(0,242,255,0.6)' }}>
            METAL BREATH LINK
          </div>
        </div>
        <button onClick={() => { if(confirm('Сбросить память Джуна?')) { setMemory(''); localStorage.clear(); location.reload(); }}} 
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', padding: '6px 14px', borderRadius: '10px', fontSize: '10px', fontWeight: 900, cursor: 'pointer', transition: '0.2s' }}>
          СБРОС
        </button>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative', zIndex: 5 }}>
        <div style={{ position: 'relative', width: '300px', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={connectToJun}>
          <MetalBreathIcon 
            active={status === ConnectionStatus.CONNECTED} 
            speaking={isJunSpeaking || (lastMessage.length > 0 && lastMessage !== 'СВЯЗЬ...' && lastMessage !== 'ЗАГРУЗКА...')} 
            status={status}
            analyser={analyserRef.current}
            isUserSpeaking={userIsSpeaking}
          />
        </div>

        <div style={{ 
          textAlign: 'center', 
          width: '100%', 
          padding: '20px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '12px',
          minHeight: '160px',
          justifyContent: 'center'
        }}>
          {/* Текст Джуна */}
          <div style={{ 
            fontSize: lastMessage.length > 55 ? '18px' : '24px', 
            fontWeight: '900', 
            color: status === ConnectionStatus.ERROR ? '#ef4444' : 'white', 
            letterSpacing: '0.5px', 
            lineHeight: '1.3',
            textTransform: 'uppercase',
            maxWidth: '100%',
            padding: '0 15px',
            opacity: lastMessage ? 1 : 0,
            transition: 'opacity 0.5s ease-out',
            textShadow: '0 0 20px rgba(255,255,255,0.3)'
          }}>
            {lastMessage || (status === ConnectionStatus.CONNECTED ? '' : status === ConnectionStatus.DISCONNECTED ? 'СВЯЗЬ ГОТОВА К ЗАПУСКУ' : '')}
          </div>
        </div>
      </main>

      <footer style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '12px', 
        padding: '15px', 
        flexShrink: 0, 
        zIndex: 10,
        background: 'rgba(2,6,23,0.9)',
        backdropFilter: 'blur(15px)',
        borderTop: '1px solid rgba(0,242,255,0.15)',
        paddingBottom: 'calc(15px + env(safe-area-inset-bottom))'
      }}>
        <FooterBtn label="ОБЩЕНИЕ" onClick={() => triggerAction('Джун, напарник на связи! Расскажи что-нибудь крутое!')} color="#4f46e5" active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="МИССИЯ" onClick={() => triggerAction('Джун, дай мне крутую миссию на сегодня!')} color="#0ea5e9" active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="СКАНЕР" onClick={() => triggerAction('Джун, активируй сканер! Давай распознаем Метал-карту!')} color="#ec4899" active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="КАРТЫ" onClick={() => triggerAction('Джун, расскажи легенду про одного из Металлкардботов!')} color="#8b5cf6" active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="НАУКА" onClick={() => triggerAction('Джун, расскажи как работают твои гаджеты или роботы!')} color="#10b981" active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="ЯЗЫКИ" onClick={() => triggerAction('Джун, научи меня секретному геройскому коду на другом языке!')} color="#f59e0b" active={status === ConnectionStatus.CONNECTED} />
      </footer>
    </div>
  );
}

const FooterBtn = ({ label, onClick, color, active }: any) => (
  <button 
    onClick={onClick}
    disabled={!active}
    className="btn-active-flash"
    style={{ 
      background: active ? `linear-gradient(135deg, ${color}44, rgba(15,23,42,0.9))` : 'rgba(255,255,255,0.02)',
      border: `1px solid ${active ? color : 'rgba(255,255,255,0.06)'}`,
      borderRadius: '16px',
      padding: '16px 4px',
      color: active ? 'white' : '#475569',
      fontSize: '12px',
      fontWeight: '900',
      letterSpacing: '1.5px',
      transition: 'all 0.3s ease',
      position: 'relative',
      overflow: 'hidden',
      cursor: active ? 'pointer' : 'default',
      boxShadow: active ? `0 4px 20px ${color}33` : 'none'
    }}
  >
    {active && <div className="animate-shimmer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)', animation: 'shimmer 2.5s infinite' }}></div>}
    {label}
  </button>
);
