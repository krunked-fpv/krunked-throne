import type { AreaCode, DebugBridge } from '@/contracts';
import { SAVE_STORAGE_KEY } from '@/ui/save';

/**
 * Lightweight dev-only (`import.meta.env.DEV` or `?debug=1`) playtest drawer
 * toggled via `F9` (hidden by default so gameplay screenshots stay 100% pure).
 * Allows interactive browser playtesting of telemetry, warps, bosses, and save
 * reload verification without requiring JS eval injection.
 */
export class DevPlaytestOverlay {
  private readonly bridge: DebugBridge;
  private root: HTMLDivElement | null = null;
  private statusEl: HTMLPreElement | null = null;
  private visible = false;
  private timerId: number | null = null;

  private boundKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'F9') {
      e.preventDefault();
      this.setVisible(!this.visible);
    }
  };

  constructor(bridge: DebugBridge) {
    this.bridge = bridge;
  }

  mount(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (this.root) return;

    const root = document.createElement('div');
    root.id = 'nt-dev-overlay';
    root.style.cssText = [
      'position:fixed',
      'top:8px',
      'right:8px',
      'z-index:9999',
      'width:300px',
      'max-height:92vh',
      'overflow:auto',
      'background:rgba(10,9,13,0.92)',
      'border:1px solid #d4a63a',
      'color:#f4f1e6',
      'font:11px/1.35 monospace',
      'padding:8px',
      'display:none',
      'box-sizing:border-box',
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-weight:bold;color:#ffd15c;';
    header.textContent = 'KRUNKED THRONE PLAYTEST (F9)';

    const closeBtn = this.makeBtn('HIDE', () => this.setVisible(false));
    header.appendChild(closeBtn);
    root.appendChild(header);

    const status = document.createElement('pre');
    status.id = 'nt-dev-telemetry';
    status.style.cssText = 'margin:0 0 8px 0;white-space:pre-wrap;word-break:break-word;background:#16141d;padding:6px;border:1px solid #353045;font-size:10px;';
    root.appendChild(status);
    this.statusEl = status;

    const addGroup = (title: string, buttons: Array<[string, () => void]>): void => {
      const label = document.createElement('div');
      label.textContent = title;
      label.style.cssText = 'color:#9f96b8;margin:6px 0 3px 0;font-size:10px;';
      root.appendChild(label);

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
      for (const [text, onClick] of buttons) {
        row.appendChild(this.makeBtn(text, onClick));
      }
      root.appendChild(row);
    };

    addGroup('ACTIONS', [
      ['GOD ON', () => this.bridge.setGodMode(true)],
      ['GOD OFF', () => this.bridge.setGodMode(false)],
      ['+80 RADS', () => this.bridge.grantRads(80)],
      ['CLEAR ENEMIES', () => this.bridge.clearEnemies()],
      ['STEP 45T', () => this.bridge.stepTicks(45, { fireHeld: true, firePressed: true })],
      ['WALK NORTH', () => this.bridge.stepTicks(75, { moveX: 0, moveY: -1, fireHeld: true, firePressed: true })],
      ['ENTER PORTAL', () => {
        const t = this.bridge.getTelemetry();
        if (t.portalActive) {
          for (let i = 0; i < 60; i++) {
            const cur = this.bridge.getTelemetry();
            if (cur.screen !== 'playing' || !cur.portalActive) break;
            const dx = cur.portalX - cur.playerX;
            const dy = cur.portalY - cur.playerY;
            const len = Math.hypot(dx, dy) || 1;
            this.bridge.stepTicks(2, { moveX: dx / len, moveY: dy / len });
          }
        }
      }],
      ['PLASMA+SWORD', () => {
        this.bridge.giveWeapon('plasma_cannon', 0);
        this.bridge.giveWeapon('energy_sword', 1);
      }],
      ['GAME OVER', () => this.bridge.setScreen('game_over')],
      ['SAVE NOW', () => this.bridge.saveNow()],
    ]);

    const warpCodes: AreaCode[] = ['1-1', '1-3', '2-1', '3-3', '5-3', '6-1', '7-3', '0-1'];
    addGroup(
      'WARP AREA / BOSSES',
      warpCodes.map((code) => [
        code,
        () => {
          this.bridge.warpArea(code, code === '0-1' ? 0 : undefined);
          this.refresh();
        },
      ]),
    );

    addGroup('SCREENS', [
      ['TITLE', () => this.bridge.setScreen('title')],
      ['CAMPFIRE', () => this.bridge.setScreen('campfire')],
      ['OPTIONS', () => this.bridge.setScreen('options')],
      ['START FISH', () => this.bridge.startRun('fish', 1337, 'none')],
    ]);

    document.body.appendChild(root);
    this.root = root;
    window.addEventListener('keydown', this.boundKeyDown);
    this.timerId = window.setInterval(() => {
      if (this.visible) this.refresh();
    }, 200);
  }

  setVisible(show: boolean): void {
    this.visible = show;
    if (this.root) {
      this.root.style.display = show ? 'block' : 'none';
    }
    if (show) this.refresh();
  }

  refresh(): void {
    if (!this.statusEl) return;
    const t = this.bridge.getTelemetry();
    const assets = this.bridge.getLoadedAssets();
    let saveSummary = 'none';
    try {
      const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { totalRuns?: number; bestKills?: number; selectedMutant?: string };
        saveSummary = `runs=${parsed.totalRuns ?? 0} bestKills=${parsed.bestKills ?? 0} mutant=${parsed.selectedMutant ?? '?'}`;
      }
    } catch {
      saveSummary = 'unavailable';
    }
    this.statusEl.textContent = [
      `assets: ${assets.mode} spr=${assets.sprites} snd=${assets.sounds} fnt=${assets.fonts}`,
      `screen=${t.screen} phase=${t.phase} canvas=${t.canvasWidth}x${t.canvasHeight}`,
      `fps=${t.fps}/${t.targetFps} simHz=${t.simHz} tick=${t.tick}`,
      `area=${t.areaCode} (${t.biome}) loop=${t.loop} mutant=${t.mutant}`,
      `hp=${t.hp}/${t.maxHp} rads=${t.rads} lv=${t.level} kills=${t.kills}`,
      `enemies=${t.enemiesAlive} proj=${t.projectilesActive} corps=${t.corpsesCount} cas=${t.casingsCount}`,
      `portal=${t.portalActive ? `OPEN(${Math.round(t.portalX)},${Math.round(t.portalY)})` : 'closed'}`,
      `boss=${t.bossId ?? 'none'} ${t.bossId ? `${t.bossHp}/${t.bossMaxHp}` : ''}`,
      `weps=${t.weapons[0]} | ${t.weapons[1] ?? '-'} (slot ${t.activeSlot})`,
      `muts=[${t.mutations.join(',')}] pending=[${t.pendingMutations.join(',')}]`,
      `save: ${saveSummary}`,
      `errors=${t.consoleErrors.length}${t.consoleErrors.length ? ' ' + t.consoleErrors[0] : ''}`,
    ].join('\n');
  }

  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      if (this.timerId !== null) {
        window.clearInterval(this.timerId);
        this.timerId = null;
      }
    }
    this.root?.remove();
    this.root = null;
    this.statusEl = null;
  }

  private makeBtn(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = [
      'background:#262235',
      'color:#f4f1e6',
      'border:1px solid #595070',
      'padding:3px 6px',
      'font:10px monospace',
      'cursor:pointer',
    ].join(';');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
      this.refresh();
    });
    return btn;
  }
}
