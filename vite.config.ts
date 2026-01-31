
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Use casting to bypass missing 'cwd' property on Process type in some environments
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
    build: {
      outDir: 'dist',
    },
    server: {
      // Настройки для разработки
      proxy: {
        '/ws': {
          target: 'ws://localhost:3000',
          ws: true,
          changeOrigin: true,
        },
      },
      // Разрешаем доступ с любых хостов (добавлено для Render и других хостингов)
      allowedHosts: 'all',
      host: '0.0.0.0',
    },
  };
});
