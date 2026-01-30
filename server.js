
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

// Добавляем CORS для лучшей совместимости
app.use(cors());

// Раздаем статические файлы фронтенда
app.use(express.static(path.join(__dirname, 'dist')));

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});

// Создаем WebSocket сервер для проксирования
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (clientWs) => {
  console.log('Client connected to proxy');
  
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    console.error('API_KEY is not defined');
    clientWs.close(1011, 'API_KEY is not configured on the server');
    return;
  }
  
  // URL для прямого подключения к Gemini Live API
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BiDiGenerateContent?key=${apiKey}`;
  
  // Добавляем опции для лучшей обработки соединения
  const geminiWs = new WebSocket(geminiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GeminiProxy/1.0)'
    }
  });

  geminiWs.on('open', () => {
    console.log('Connected to Gemini API from Server');
  });

  // Пробрасываем сообщения от клиента к Gemini
  clientWs.on('message', (data) => {
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(data);
    } else if (geminiWs.readyState === WebSocket.CONNECTING) {
      // Если Gemini WS еще подключается, ждем немного
      setTimeout(() => {
        if (geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.send(data);
        } else {
          console.error('Failed to send message: Gemini connection not ready');
          clientWs.send(JSON.stringify({ error: 'Gemini connection not ready' }));
        }
      }, 100);
    } else {
      console.error('Failed to send message: Gemini connection closed');
      clientWs.send(JSON.stringify({ error: 'Gemini connection closed' }));
    }
  });

  // Пробрасываем ответы от Gemini к клиенту
  geminiWs.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });

  geminiWs.on('error', (err) => {
    console.error('Gemini WS Error:', err);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ error: 'Connection to Gemini API failed' }));
    }
  });
  
  clientWs.on('error', (err) => {
    console.error('Client WS Error:', err);
  });

  clientWs.on('close', (code, reason) => {
    console.log(`Client disconnected: ${code} ${reason ? reason.toString() : ''}`);
    if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
      geminiWs.close();
    }
  });
  
  geminiWs.on('close', (code, reason) => {
    console.log(`Gemini connection closed: ${code} ${reason ? reason.toString() : ''}`);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(code, reason);
    }
  });
});

// SPA поддержка
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
