import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// NOTE: adjust `base` to match your actual deployment path (e.g. '/' for a root domain,
// '/flight/' for a subpath like the astro clock used '/air/').
export default defineConfig({
  base: '/',
  plugins: [react()],
})
