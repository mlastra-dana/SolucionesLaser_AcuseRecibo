import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

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
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const revision = (source: string | Uint8Array) => createHash('sha256').update(source).digest('hex');
        const entries = Object.values(bundle).filter(item => /\.(html|js|css)$/.test(item.fileName)).map(item => ({
          url: '/' + item.fileName, revision: revision(item.type === 'chunk' ? item.code : item.source)
        }));
        if (!entries.some(item => item.url === '/index.html')) this.error('El precache PWA requiere index.html compilado.');
        for (const file of ['manifest.webmanifest', 'push-notification.png', 'brand/logo-danaconnect-horizontal.png', 'brand/push-experience-background.webp', 'pwa/icon-192.png', 'pwa/icon-512.png', 'pwa/icon-maskable-512.png', 'pwa/apple-touch-icon.png', 'pwa/favicon.png']) {
          entries.push({ url: '/' + file, revision: revision(readFileSync('public/' + file)) });
        }
        this.emitFile({ type: 'asset', fileName: 'firebase-messaging-sw.js', source: await bundleWorker(entries) });
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace('/src/main.tsx', '/src/push/main.tsx')
        .replace('Portal Acuse de Recibo Soluciones Laser', 'DANA Push Experience')
        .replace('Portal corporativo para confirmar acuse de recibo de factura digital.', 'Experimenta las notificaciones Push de DANAconnect.')
        .replace('/brand/favicon_sl.png', '/pwa/favicon.png')
        .replace('<head>', `<head>
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#DD5736" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="DANA Push" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <link rel="apple-touch-icon" sizes="180x180" href="/pwa/apple-touch-icon.png" />`)
        .replace('width=device-width, initial-scale=1.0', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
      }
    }
  };
  async function bundleWorker(precache: { url: string; revision: string }[] = []) {
    const result = await build({
      entryPoints: ['src/push/firebase-messaging-sw.js'], bundle: true,
      write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true,
      define: { 'import.meta.env': JSON.stringify(env), __DANA_PRECACHE__: JSON.stringify(precache), 'process.env.NODE_ENV': JSON.stringify('production') }
    });
    return result.outputFiles[0].text;
  }
  return { plugins: [react(), ...(push ? [worker] : [])] };
});
