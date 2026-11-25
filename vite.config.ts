import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
};

/**
 * Serves locally extracted user-owned assets from `.nt-assets/` under `/nt-assets/*`
 * during local `dev` / `preview` sessions without ever bundling copyrighted binaries
 * into `dist/` or git.
 */
function ntLocalAssetsPlugin(): Plugin {
  const assetsRoot = path.resolve(__dirname, '.nt-assets');

  const middleware = (
    req: { url?: string },
    res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: Buffer | string) => void },
    next: () => void,
  ): void => {
    const rawUrl = req.url ?? '';
    if (!rawUrl.startsWith('/nt-assets/')) {
      next();
      return;
    }
    const relPath = decodeURIComponent(rawUrl.slice('/nt-assets/'.length).split('?')[0] ?? '');
    const resolved = path.resolve(assetsRoot, relPath);
    if (!resolved.startsWith(assetsRoot + path.sep) && resolved !== assetsRoot) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(fs.readFileSync(resolved));
  };

  return {
    name: 'nt-local-assets',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [ntLocalAssetsPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 4173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
