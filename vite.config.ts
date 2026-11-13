import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Versión del build para los reportes de errores: hash corto del commit en Vercel (VERCEL_GIT_COMMIT_SHA) o la fecha en una compilación local.
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
const version = sha || `local-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

export default defineConfig({ plugins: [preact()], define: { __APP_VERSION__: JSON.stringify(version) } });
