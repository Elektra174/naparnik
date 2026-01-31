import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

// Настройки Джуна (дублируем здесь для надежности прокси)
const SYSTEM_INSTRUCTION = `
РОЛЬ: Ты Джун из Металлкардбот. Ты - энергичный мальчик-герой, напарник и сверстник.
ХАРАКТЕР: Твой голос полон жизни! Ты общаешься с напарником через устройство Метал-Брез.
ПРАВИЛА ПРОИЗНОШЕНИЯ:
- Говори ТОЛЬКО на русском языке.
- Используй букву "Ё" (всё, погнали, напарник, герой).
- ВАЖНО: Слово "герои" произносится с четким ударением на "О" (герОи), никогда не говори "герАи".
- Твой девиз: "Погнали!".
- ОБРЫВ РЕЧИ: Если напарник начинает говорить или перебивает тебя, ты должен МГНОВЕННО замолчать.
- Обращение: "напарник", "герой", "лучший друг".
`;

// Раздаем статические файлы фронтенда из папки dist
app.use(express.static(path.join(__dirname, 'dist')));

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Metal-Breath Proxy running on port ${port}`);
});

// Создаем WebSocket сервер на пути /ws
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (clientWs) => {
  console.log('📱 Напарник подключился к прокси');
  
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error('❌ ОШИБКА: API_KEY не найден в переменных окружения!');
    clientWs.close();
    return;
  }

  // Используем v1beta для стабильности
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BiDiGenerateContent?key=${apiKey}`;
  
  const geminiWs = new WebSocket(geminiUrl);

  // Пересылаем сообщения от Напарника (браузера) к Джуну (Google)
  clientWs.on('message', (data) => {
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(data);
    }
  });

  geminiWs.on('open', () => {
    console.log('🤖 Соединение с Джуном установлено (Google API)');
    
    // Сразу отправляем конфигурацию, чтобы Джун знал свою роль
    const setupMessage = {
      setup: {
        model: "models/gemini-2.0-flash-exp", // Или ваша актуальная модель
        generationConfig: {
          responseModalities: ["audio"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } }
          }
        },
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        }
      }
    };
    geminiWs.send(JSON.stringify(setupMessage));
  });

  // Пересылаем ответы от Джуна обратно Напарнику
  geminiWs.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      // data может быть как строкой (JSON), так и Buffer (бинарное аудио)
      clientWs.send(data);
    }
  });

  geminiWs.on('error', (err) => console.error('❌ Gemini WS Error:', err.message));
  clientWs.on('error', (err) => console.error('❌ Client WS Error:', err.message));

  clientWs.on('close', () => {
    console.log('📱 Напарник отключился');
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });

  geminiWs.on('close', () => {
    console.log('🤖 Джун ушел со связи');
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });
});

// Поддержка Single Page Application (SPA)
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(500).send("Ошибка: Файл index.html не найден в папке dist. Сначала выполните сборку (npm run build).");
    }
  });
});
