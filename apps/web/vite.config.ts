import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    // A run reference is the thing people paste into a ticket, so a deep link
    // has to work on a cold load rather than only after navigating there.
    proxy: { '/api': 'http://localhost:4000' },
  },
  appType: 'spa',
});
