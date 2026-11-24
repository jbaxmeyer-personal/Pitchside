import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served from https://<user>.github.io/pitchside/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/pitchside/',
  plugins: [react()],
});
