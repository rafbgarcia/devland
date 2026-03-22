import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import { findAvailableDevRendererPort } from './src/dev/dev-instance';

// https://vitejs.dev/config
export default defineConfig(async () => {
  const port = await findAvailableDevRendererPort(__dirname);

  return {
    server: {
      port,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: [tanstackRouter({ target: 'react' }), react({}), tailwindcss()],
  };
});
