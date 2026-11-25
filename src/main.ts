import { GameApp } from '@/app';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('Missing #game-canvas element in index.html');
  }

  const app = new GameApp(canvas);
  await app.init();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void bootstrap();
    });
  } else {
    void bootstrap();
  }
}
