import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { build } from 'esbuild';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const push = mode === 'push';
  const worker: Plugin = {
    name: 'dana-push-worker',
    async configureServer(server) {
      server.middlewares.use('/firebase-messaging-sw.js', async (_req, res, next) => {
        try {
          const code = await bundleWorker();
          res.setHeader('Content-Type', 'application/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(code);
        } catch (error) { next(error as Error); }
      });
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'firebase-messaging-sw.js', source: await bundleWorker() });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace('/src/main.tsx', '/src/push/main.tsx')
        .replace('Portal Acuse de Recibo Soluciones Laser', 'DANA Push Experience')
        .replace('Portal corporativo para confirmar acuse de recibo de factura digital.', 'Experimenta las notificaciones Push de DANAconnect.')
        .replace('/brand/favicon_sl.png', '/push-notification.png');
      }
    }
  };
  async function bundleWorker() {
    const result = await build({
      entryPoints: ['src/push/firebase-messaging-sw.js'], bundle: true,
      write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true,
      define: { 'import.meta.env': JSON.stringify(env) }
    });
    return result.outputFiles[0].text;
  }
  return { plugins: [react(), ...(push ? [worker] : [])] };
});
