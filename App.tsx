
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionStatus } from './types';
import { decode, decodeAudioData, createPcmBlob, playSFX, encode } from './services/audioHelpers';

const SYSTEM_INSTRUCTION = `
РОЛЬ: Ты Джун из Металлкардбот. Ты - энергичный мальчик-герой, напарник и сверстник.
ХАРАКТЕР: Твой голос полон жизни! Ты общаешься с напарником через устройство Метал-Брез.
ПРАВИЛА ПРОИЗНОШЕНИЯ:
- Говори ТОЛЬКО на русском языке.
- Используй букву "Ё" (всё, погнали, напарник, герой).
- ВАЖНО: Слово "герои" произносится с четким ударением на "О" (герОи), никогда не говори "герАи".
- Твой девиз: "Погнали!".
- ОБРЫВ РЕЧИ: Если напарник начинает говорить или перебивает тебя, ты должен МГНОВЕННО замолчать. Ты не заканчиваешь предложение, а просто исчезаешь из эфира.
- Обращение: "напарник", "герой", "лучший друг".
`;

// Качественный ресемплинг для API (16кГц)
function resample(buffer: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    result[i] = buffer[Math.round(i * ratio)];
  }
  return result;
}

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
      const radius = 60; 

      hueRef.current = (hueRef.current + 1) % 360;
      const color = isUser ? `hsla(180, 100%, 50%, 0.8)` : `hsla(${hueRef.current}, 100%, 60%, 0.9)`;

      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;

      for (let i = 0; i < bufferLength; i += 2) {
        const val = dataArray[i] / 255;
        const barHeight = val * 70; 
        const angle = (i / bufferLength) * Math.PI * 2;
        
        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        const x2 = centerX + Math.cos(angle) * (radius + barHeight);
        const y2 = centerY + Math.sin(angle) * (radius + barHeight);

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [analyser, isUser]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={300} 
      style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 15 }} 
    />
  );
};

const MetalBreathIcon = ({ active, speaking, status, analyser, isUserSpeaking }: any) => {
  const isConnecting = status === ConnectionStatus.CONNECTING;
  const isError = status === ConnectionStatus.ERROR;

  return (
    <div 
      className={active ? 'animate-float' : 'animate-pulse-ring'}
      style={{ 
        position: 'relative', 
        width: '280px', 
        height: '280px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center'
      }}
    >
      {(speaking || isUserSpeaking) && <AudioWaveform analyser={analyser} isUser={isUserSpeaking} />}
      
      <div style={{ 
        position: 'absolute', 
        inset: 0, 
        borderRadius: '50%', 
        filter: 'blur(60px)', 
        opacity: 0.3, 
        transition: 'all 1s ease',
        background: isError ? '#ef4444' : (active ? '#00f2ff' : '#4f46e5')
      }}></div>

      <svg viewBox="0 0 240 240" style={{ width: '256px', height: '256px', position: 'relative', zIndex: 10, pointerEvents: 'none' }}>
        <defs>
          <pattern id="hexagons" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M10 0 L20 5 L20 15 L10 20 L0 15 L0 5 Z" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
        </defs>
        
        <circle cx="120" cy="120" r="115" fill="none" stroke="var(--cyan)" strokeWidth="0.5" strokeDasharray="2 10" className="opacity-20 animate-rotate-slow" />
        <g className="animate-rotate-fast">
          <circle cx="120" cy="120" r="105" fill="none" stroke="var(--indigo)" strokeWidth="1" strokeDasharray="60 120" className="opacity-40" />
          <circle cx="225" cy="120" r="4" fill="var(--cyan)" className="animate-pulse" />
        </g>
        <circle cx="120" cy="120" r="85" fill="none" stroke="var(--cyan)" strokeWidth="1" className="opacity-30" />
        <circle cx="120" cy="120" r="75" fill="url(#hexagons)" className="text-cyan-900 opacity-20" />
        
        <circle 
          cx="120" 
          cy="120" 
          r="65" 
          fill="#020617" 
          stroke={isError ? '#ef4444' : (active ? (speaking ? '#fbbf24' : '#00f2ff') : 'rgba(0, 242, 255, 0.4)')} 
          strokeWidth="4" 
          style={{ 
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: active ? (speaking ? 'drop-shadow(0 0 25px #fbbf24)' : 'drop-shadow(0 0 20px var(--cyan))') : 'none',
            transform: speaking ? 'scale(1.08)' : 'scale(1)',
            transformOrigin: 'center'
          }}
        />
        
        {active && (
          <circle 
            cx="120" 
            cy="120" 
            r="60" 
            fill="none" 
            stroke="white" 
            strokeWidth="0.5" 
            className="opacity-20 animate-pulse"
          />
        )}
      </svg>
      
      {!active && !isConnecting && (
        <div className="animate-pulse-text" style={{ 
          position: 'absolute', 
          bottom: '10px', 
          fontSize: '10px', 
          fontWeight: 900, 
          letterSpacing: '6px', 
          color: '#00f2ff', 
          whiteSpace: 'nowrap',
          zIndex: 30,
          background: 'rgba(2, 6, 23, 0.85)',
          padding: '6px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(0, 242, 255, 0.15)',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)'
        }}>
          НАЖМИ ДЛЯ СВЯЗИ
        </div>
      )}
      {isConnecting && (
        <div className="animate-pulse" style={{ 
          position: 'absolute', 
          bottom: '10px', 
          fontSize: '10px', 
          fontWeight: 900, 
          letterSpacing: '6px', 
          color: '#ffcc00', 
          whiteSpace: 'nowrap',
          zIndex: 30,
          background: 'rgba(2, 6, 23, 0.85)',
          padding: '6px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(255, 204, 0, 0.15)',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)'
        }}>
          УСТАНОВКА КАНАЛА...
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

  const sessionRef = useRef<any>(null);
  const mainAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const analyserRef = useRef<AnalyserNode | null>(null);

  const stopAudio = useCallback(() => {
    sourcesRef.current.forEach(s => { try { s.stop(); } catch (e) {} });
    sourcesRef.current.clear();
    if (mainAudioContextRef.current) nextStartTimeRef.current = mainAudioContextRef.current.currentTime;
    setIsJunSpeaking(false);
  }, []);

  const handleDisconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    stopAudio();
    setStatus(ConnectionStatus.DISCONNECTED);
    setLastMessage('');
    playSFX('deactivate');
  }, [stopAudio]);

  const connectToJun = useCallback(async (initialPrompt?: string) => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      playSFX('activate');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      if (!mainAudioContextRef.current) {
        mainAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = mainAudioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      
      const inputRate = ctx.sampleRate;
      
      if (!analyserRef.current) {
        analyserRef.current = ctx.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.connect(ctx.destination);
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
          },
          systemInstruction: SYSTEM_INSTRUCTION,
        },
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            if (initialPrompt) {
              sessionPromise.then(s => s.sendRealtimeInput({ text: initialPrompt }));
            }
            
            const source = ctx.createMediaStreamSource(stream);
            const processor = ctx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const downsampled = resample(inputData, inputRate, 16000);
              const pcmBlob = createPcmBlob(downsampled);
              
              sessionPromise.then(session => {
                if (session) session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(processor);
            processor.connect(ctx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              setIsJunSpeaking(true);
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(analyserRef.current!);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsJunSpeaking(false);
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) stopAudio();
            if (message.serverContent?.turnComplete) setUserIsSpeaking(false);
          },
          onerror: (e) => {
            console.error("Neural link error:", e);
            setStatus(ConnectionStatus.ERROR);
            handleDisconnect();
          },
          onclose: () => setStatus(ConnectionStatus.DISCONNECTED)
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err) {
      console.error("Connection failed:", err);
      setStatus(ConnectionStatus.ERROR);
    }
  }, [stopAudio, handleDisconnect]);

  const toggleMainAction = useCallback(() => {
    // Если Джун говорит - мгновенно прерываем его речь по клику на круг тоже
    if (isJunSpeaking) {
      stopAudio();
      playSFX('click');
      return;
    }

    if (status === ConnectionStatus.CONNECTED || status === ConnectionStatus.CONNECTING) {
      handleDisconnect();
    } else {
      connectToJun('Джун, погнали! Напарник на связи!');
    }
  }, [status, isJunSpeaking, handleDisconnect, connectToJun, stopAudio]);

  const triggerAction = (label: string, prompt: string) => {
    playSFX('click');
    setLastMessage(`РЕЖИМ: ${label}`);
    if (status === ConnectionStatus.CONNECTED && sessionRef.current) {
      stopAudio();
      sessionRef.current.sendRealtimeInput({ text: prompt });
    } else {
      connectToJun(prompt);
    }
  };

  return (
    <div id="root" style={{ background: 'transparent', height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ 
        height: '65px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '0 20px', 
        zIndex: 100, 
        background: 'rgba(2, 6, 23, 0.75)', 
        backdropFilter: 'blur(15px)',
        borderBottom: '1px solid rgba(0, 242, 255, 0.25)',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.6)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: '13px', color: '#00f2ff', fontWeight: 900, letterSpacing: '3.5px', textShadow: '0 0 12px var(--cyan)' }}>МЕТАЛ-БРЕЗ</div>
            <div style={{ fontSize: '8px', color: 'rgba(0, 242, 255, 0.6)', fontWeight: 700, letterSpacing: '1.5px' }}>ПРЯМАЯ СВЯЗЬ</div>
          </div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '16px' }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ 
                width: '3px', 
                height: i * 3 + 'px', 
                background: status === ConnectionStatus.CONNECTED ? '#00f2ff' : '#1e293b',
                boxShadow: status === ConnectionStatus.CONNECTED ? '0 0 8px #00f2ff' : 'none',
                borderRadius: '1px',
                transition: 'all 0.4s ease'
              }}></div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* НЕОНОВЫЙ ДИНАМИК ДЛЯ ОСТАНОВКИ */}
          <button 
            onClick={(e) => { e.stopPropagation(); stopAudio(); playSFX('click'); }}
            disabled={!isJunSpeaking}
            style={{ 
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px',
              transition: 'all 0.3s ease',
              opacity: isJunSpeaking ? 1 : 0.2,
              filter: isJunSpeaking ? 'drop-shadow(0 0 8px #ef4444)' : 'none'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={isJunSpeaking ? "#ef4444" : "#64748b"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isJunSpeaking ? "animate-pulse" : ""}>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <line x1="23" y1="9" x2="17" y2="15"></line>
              <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
          </button>

          <button onClick={() => location.reload()} style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#ef4444', padding: '8px 14px', borderRadius: '10px', fontSize: '9px', fontWeight: 900, cursor: 'pointer' }}>СБРОС</button>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div 
          onClick={toggleMainAction} 
          style={{ zIndex: 20, width: '280px', height: '280px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
        >
          <MetalBreathIcon active={status === ConnectionStatus.CONNECTED} speaking={isJunSpeaking} status={status} analyser={analyserRef.current} isUserSpeaking={userIsSpeaking} />
        </div>
      </main>

      <div style={{ width: '100%', padding: '10px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60px', zIndex: 10 }}>
        {lastMessage && (
          <div style={{ 
            fontSize: '12px', fontWeight: 900, color: '#00f2ff', letterSpacing: '5px', textTransform: 'uppercase',
            textShadow: '0 0 10px rgba(0, 242, 255, 0.6)', background: 'rgba(0, 242, 255, 0.1)',
            padding: '8px 20px', borderRadius: '20px', border: '1px solid rgba(0, 242, 255, 0.3)'
          }}>
            {lastMessage}
          </div>
        )}
      </div>

      <footer style={{ 
        display: 'grid',  gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '15px', 
        background: 'rgba(2, 6, 23, 0.95)', backdropFilter: 'blur(30px)', borderTop: '1px solid rgba(0, 242, 255, 0.2)', 
        paddingBottom: 'calc(15px + env(safe-area-inset-bottom))', zIndex: 100
      }}>
        <FooterBtn label="ОБЩЕНИЕ" color="#4f46e5" onClick={() => triggerAction('ОБЩЕНИЕ', 'Джун, переходи в режим ОБЩЕНИЕ!')} active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="МИССИЯ" color="#0ea5e9" onClick={() => triggerAction('МИССИЯ', 'Джун, активируй режим МИССИЯ!')} active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="СКАНЕР" color="#ec4899" onClick={() => triggerAction('СКАНЕР', 'Джун, включай режим СКАНЕР!')} active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="КАРТЫ" color="#8b5cf6" onClick={() => triggerAction('КАРТЫ', 'Джун, активируй режим КАРТЫ!')} active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="НАУКА" color="#10b981" onClick={() => triggerAction('НАУКА', 'Джун, включай режим НАУКА!')} active={status === ConnectionStatus.CONNECTED} />
        <FooterBtn label="ЯЗЫКИ" color="#f59e0b" onClick={() => triggerAction('ЯЗЫКИ', 'Джун, переходи в режим ЯЗЫКИ!')} active={status === ConnectionStatus.CONNECTED} />
      </footer>
    </div>
  );
}

const FooterBtn = ({ label, onClick, color, active }: any) => (
  <button onClick={onClick} className="btn-active-flash" style={{ 
    background: active ? `linear-gradient(135deg, ${color}33, rgba(15, 23, 42, 0.8))` : 'rgba(255, 255, 255, 0.04)', 
    border: `1px solid ${active ? color : 'rgba(255, 255, 255, 0.15)'}`, 
    borderRadius: '16px', padding: '18px 6px', color: active ? 'white' : '#64748b', 
    fontSize: '11px', fontWeight: '900', letterSpacing: '1.5px', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)', 
    cursor: 'pointer', overflow: 'hidden', position: 'relative', boxShadow: active ? `0 0 20px ${color}22` : 'none'
  }}>
    {active && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent)', animation: 'shimmer 2.5s infinite' }}></div>}
    {label}
  </button>
);
