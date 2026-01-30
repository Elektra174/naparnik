
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

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
  // URL для прямого подключения к Gemini Live API
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BiDiGenerateContent?key=${apiKey}`;
  
  const geminiWs = new WebSocket(geminiUrl);

  geminiWs.on('open', () => {
    console.log('Connected to Gemini API from Server');
  });

  // Пробрасываем сообщения от клиента к Gemini
  clientWs.on('message', (data) => {
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(data);
    }
  });

  // Пробрасываем ответы от Gemini к клиенту
  geminiWs.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });

  geminiWs.on('error', (err) => console.error('Gemini WS Error:', err));
  clientWs.on('error', (err) => console.error('Client WS Error:', err));

  clientWs.on('close', () => geminiWs.close());
  geminiWs.on('close', () => clientWs.close());
});

// SPA поддержка
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
