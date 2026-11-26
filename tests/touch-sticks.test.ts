import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH_16_9, LOGICAL_WIDTH_4_3 } from '@/contracts';
import {
  TOUCH_AIM_FIRE_THRESHOLD,
  TOUCH_AIM_STICK_RADIUS,
  TOUCH_MOVE_STICK_RADIUS,
  TouchControlsManager,
  computeTouchStickHomes,
  computeTouchTriggerRects,
  detectMobileOrTouchEnvironment,
  triggerTouchHaptic,
  type TouchStickHome,
  type TouchTriggerRect,
} from '@/input';

interface RecordedArc {
  x: number;
  y: number;
  r: number;
  startAngle: number;
  endAngle: number;
  op: 'fill' | 'stroke';
  style: string;
  lineWidth: number;
}

interface RecordedLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  style: string;
}

function createRecordingCanvasContext() {
  const calls: string[] = [];
  const arcs: RecordedArc[] = [];
  const lines: RecordedLine[] = [];

  let pendingArc: { x: number; y: number; r: number; startAngle: number; endAngle: number } | null = null;
  let pendingMove: { x: number; y: number } | null = null;
  let pendingLine: { x1: number; y1: number; x2: number; y2: number } | null = null;

  const ctx = {
    imageSmoothingEnabled: false,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    save: vi.fn(() => calls.push('save')),
    restore: vi.fn(() => calls.push('restore')),
    fillRect: vi.fn(() => calls.push('fillRect')),
    strokeRect: vi.fn(() => calls.push('strokeRect')),
    beginPath: vi.fn(() => {
      calls.push('beginPath');
      pendingArc = null;
      pendingMove = null;
      pendingLine = null;
    }),
    arc: vi.fn((x: number, y: number, r: number, startAngle: number, endAngle: number) => {
      calls.push('arc');
      pendingArc = { x, y, r, startAngle, endAngle };
    }),
    moveTo: vi.fn((x: number, y: number) => {
      calls.push('moveTo');
      pendingMove = { x, y };
    }),
    lineTo: vi.fn((x: number, y: number) => {
      calls.push('lineTo');
      if (pendingMove) {
        pendingLine = { x1: pendingMove.x, y1: pendingMove.y, x2: x, y2: y };
      }
    }),
    stroke: vi.fn(() => {
      calls.push('stroke');
      if (pendingArc) {
        arcs.push({
          ...pendingArc,
          op: 'stroke',
          style: String(ctx.strokeStyle),
          lineWidth: ctx.lineWidth,
        });
      }
      if (pendingLine) {
        lines.push({
          ...pendingLine,
          style: String(ctx.strokeStyle),
        });
      }
    }),
    fill: vi.fn(() => {
      calls.push('fill');
      if (pendingArc) {
        arcs.push({
          ...pendingArc,
          op: 'fill',
          style: String(ctx.fillStyle),
          lineWidth: ctx.lineWidth,
        });
      }
    }),
  };

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    calls,
    arcs,
    lines,
  };
}

function parseRgbaAlpha(style: string): number | null {
  const m = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/i.exec(style);
  return m ? Number(m[1]) : null;
}

function circleIntersectsRectInterior(circle: TouchStickHome, rect: TouchTriggerRect): boolean {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.h));
  const dist = Math.hypot(circle.x - closestX, circle.y - closestY);
  return dist < circle.radius - 1e-6;
}

function makeMatchMedia(matchesSet: readonly string[]) {
  const set = new Set(matchesSet);
  return (query: string) => ({ matches: set.has(query) });
}

describe('touch-sticks: Strict Mobile/Touch Environment Sensing', () => {
  it('returns false in headless Node when invoked with no arguments', () => {
    expect(typeof window).toBe('undefined');
    expect(detectMobileOrTouchEnvironment()).toBe(false);
  });

  it('STRICT ZERO-LEAK: returns false on desktop PCs and Windows/Mac touchscreen laptops', () => {
    // Standard desktop PC (mouse + keyboard)
    expect(
      detectMobileOrTouchEnvironment({
        matchMedia: makeMatchMedia(['(pointer: fine)', '(hover: hover)']),
        maxTouchPoints: 0,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
        hasOntouchstart: false,
      }),
    ).toBe(false);

    // Windows touchscreen laptop (Surface / ThinkPad touch): fine pointer + hover + 10 touch points!
    expect(
      detectMobileOrTouchEnvironment({
        matchMedia: makeMatchMedia(['(pointer: fine)', '(hover: hover)']),
        maxTouchPoints: 10,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
        hasOntouchstart: true,
      }),
    ).toBe(false);

    // Hybrid device reporting pointer: fine even if coarse query also mocked
    expect(
      detectMobileOrTouchEnvironment({
        matchMedia: makeMatchMedia(['(pointer: fine)', '(pointer: coarse) and (hover: none)']),
        maxTouchPoints: 10,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15',
        hasOntouchstart: true,
      }),
    ).toBe(false);

    // Hybrid device reporting hover: hover MUST still return false
    expect(
      detectMobileOrTouchEnvironment({
        matchMedia: makeMatchMedia(['(hover: hover)']),
        maxTouchPoints: 10,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
        hasOntouchstart: true,
      }),
    ).toBe(false);

    // Touchscreen laptop when matchMedia is unavailable: desktop UA -> still false!
    expect(
      detectMobileOrTouchEnvironment({
        maxTouchPoints: 10,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        hasOntouchstart: true,
      }),
    ).toBe(false);

    // Desktop with spoofed mobile UA but zero touch hardware and no coarse matchMedia -> false
    expect(
      detectMobileOrTouchEnvironment({
        maxTouchPoints: 0,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36',
        hasOntouchstart: false,
      }),
    ).toBe(false);
  });

  it('returns true for iPhone, Android, iPad, Chrome DevTools mobile emulation, and Tesla touchscreens', () => {
    // iPhone Safari
    expect(
      detectMobileOrTouchEnvironment({
        matchMedia: makeMatchMedia(['(pointer: coarse) and (hover: none)']),
        maxTouchPoints: 5,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148 Safari/604.1',
        hasOntouchstart: true,
      }),
    ).toBe(true);

    // Android Chrome
    expect(
      detectMobileOrTouchEnvironment({
        matchMedia: makeMatchMedia(['(pointer: coarse) and (hover: none)']),
        maxTouchPoints: 5,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0.0.0 Mobile Safari/537.36',
        hasOntouchstart: true,
      }),
    ).toBe(true);

    // iPadOS 13+ (desktop Mac UA, but coarse pointer + no hover)
    expect(
      detectMobileOrTouchEnvironment({
        matchMedia: makeMatchMedia(['(pointer: coarse) and (hover: none)']),
        maxTouchPoints: 5,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
        hasOntouchstart: true,
      }),
    ).toBe(true);

    // Chrome DevTools mobile emulation (atomic media queries)
    expect(
      detectMobileOrTouchEnvironment({
        matchMedia: makeMatchMedia(['(pointer: coarse)', '(hover: none)']),
        maxTouchPoints: 1,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) Mobile Safari',
      }),
    ).toBe(true);

    // Tesla MCU touchscreen (coarse pointer + Tesla/ UA)
    expect(
      detectMobileOrTouchEnvironment({
        matchMedia: makeMatchMedia(['(pointer: coarse) and (hover: none)']),
        maxTouchPoints: 5,
        userAgent:
          'Mozilla/5.0 (X11; GNU/Linux) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/114.0.0.0 Safari/537.36 Tesla/2024.20.1',
        hasOntouchstart: true,
      }),
    ).toBe(true);

    // Fallback path when matchMedia is unavailable: touch points + mobile/tablet/Tesla UA
    expect(
      detectMobileOrTouchEnvironment({
        maxTouchPoints: 5,
        userAgent: 'Mozilla/5.0 (X11; GNU/Linux) Chromium/114.0.0.0 Tesla/2024.32.6',
      }),
    ).toBe(true);

    expect(
      detectMobileOrTouchEnvironment({
        hasOntouchstart: true,
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) Safari/604.1',
      }),
    ).toBe(true);

    // Throwing matchMedia falls back cleanly without crashing
    expect(
      detectMobileOrTouchEnvironment({
        matchMedia: () => {
          throw new Error('matchMedia unavailable');
        },
        maxTouchPoints: 5,
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Tablet) Safari/537.36',
      }),
    ).toBe(true);
  });
});

describe('touch-sticks: Ergonomic Home Geometry & Non-Overlap Guarantees', () => {
  it('places resting sticks cleanly inside viewport with zero overlap against HUD, Boss HP bar, and all 4 edge triggers on 4:3 and 16:9', () => {
    const viewports = [
      { label: '4:3', width: LOGICAL_WIDTH_4_3, height: LOGICAL_HEIGHT, expectedInsetX: 58 },
      { label: '16:9', width: LOGICAL_WIDTH_16_9, height: LOGICAL_HEIGHT, expectedInsetX: 66 },
    ] as const;

    for (const vp of viewports) {
      const homes = computeTouchStickHomes(vp.width, vp.height);
      const triggers = computeTouchTriggerRects(vp.width, vp.height);

      // Exact ergonomic coordinates & radii
      expect(homes.move).toEqual({
        x: vp.expectedInsetX,
        y: vp.height - 52,
        radius: TOUCH_MOVE_STICK_RADIUS,
      });
      expect(homes.aim).toEqual({
        x: vp.width - vp.expectedInsetX,
        y: vp.height - 52,
        radius: TOUCH_AIM_STICK_RADIUS,
      });

      for (const stick of [homes.move, homes.aim]) {
        // Fully inside viewport
        expect(stick.x - stick.radius).toBeGreaterThanOrEqual(0);
        expect(stick.x + stick.radius).toBeLessThanOrEqual(vp.width);
        expect(stick.y - stick.radius).toBeGreaterThanOrEqual(0);
        expect(stick.y + stick.radius).toBeLessThanOrEqual(vp.height);

        // Strictly below top HUD (y <= 46)
        expect(stick.y - stick.radius).toBeGreaterThan(46);

        // Strictly above Boss HP bar (y >= height - 23)
        expect(stick.y + stick.radius).toBeLessThan(vp.height - 23);

        // Zero overlap with any of the 4 edge ghost triggers (ACT, SWP, USE, ||)
        for (const trig of triggers) {
          expect(circleIntersectsRectInterior(stick, trig)).toBe(false);
        }
      }

      // Left stick clears ACT trigger horizontal band (x: 4..30)
      expect(homes.move.x - homes.move.radius).toBeGreaterThan(30);
      // Right stick clears SWP/USE trigger horizontal band (x: width - 30..width - 4)
      expect(homes.aim.x + homes.aim.radius).toBeLessThanOrEqual(vp.width - 30);
      // Generous unobstructed combat corridor between sticks
      const centerGap = (homes.aim.x - homes.aim.radius) - (homes.move.x + homes.move.radius);
      expect(centerGap).toBeGreaterThanOrEqual(140);
    }
  });
});

describe('touch-sticks: Translucent Resting + Floating Virtual Game Sticks Rendering', () => {
  it('draws ZERO canvas calls when opts.visible === false even with active touches', () => {
    const touch = new TouchControlsManager();
    touch.setLogicalSize(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    touch.handleGameplayTouchStart(1, 60, 170);
    touch.handleGameplayTouchMove(1, 82, 170);
    touch.handleGameplayTouchStart(2, 260, 170);
    touch.handleGameplayTouchMove(2, 286, 170);
    for (let i = 0; i < 6; i++) touch.updateFade(0.033);

    const rec = createRecordingCanvasContext();
    touch.render(rec.ctx, LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT, {
      visible: false,
      nearbyInteractable: true,
      timeSec: 1.5,
    });
    expect(rec.calls.length).toBe(0);
  });

  it('renders both translucent resting virtual game sticks visibly even at idle (alpha === 0)', () => {
    const touch = new TouchControlsManager();
    touch.setLogicalSize(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);

    // Confirm idle state (alpha === 0)
    expect(touch.getMoveStickState().alpha).toBe(0);
    expect(touch.getAimStickState().alpha).toBe(0);

    const homes = computeTouchStickHomes(LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT);
    const rec = createRecordingCanvasContext();
    touch.render(rec.ctx, LOGICAL_WIDTH_4_3, LOGICAL_HEIGHT, {
      visible: true,
      nearbyInteractable: false,
      timeSec: 0.5,
    });

    // Both sockets drawn at their exact resting home positions with frosted dark-glass fills
    const moveSocketFill = rec.arcs.find(
      (a) =>
        a.op === 'fill' &&
        Math.abs(a.x - (homes.move.x + 0.5)) < 0.01 &&
        Math.abs(a.y - (homes.move.y + 0.5)) < 0.01 &&
        Math.abs(a.r - TOUCH_MOVE_STICK_RADIUS) < 0.01,
    );
    const aimSocketFill = rec.arcs.find(
      (a) =>
        a.op === 'fill' &&
        Math.abs(a.x - (homes.aim.x + 0.5)) < 0.01 &&
        Math.abs(a.y - (homes.aim.y + 0.5)) < 0.01 &&
        Math.abs(a.r - TOUCH_AIM_STICK_RADIUS) < 0.01,
    );
    expect(moveSocketFill).toBeDefined();
    expect(aimSocketFill).toBeDefined();

    // Inner depth ring on Move stick (72% radius) & 52% fire-threshold ring on Aim stick
    const moveDepthRing = rec.arcs.find(
      (a) =>
        a.op === 'stroke' &&
        Math.abs(a.x - (homes.move.x + 0.5)) < 0.01 &&
        Math.abs(a.r - TOUCH_MOVE_STICK_RADIUS * 0.72) < 0.1,
    );
    const aimFireThresholdRing = rec.arcs.find(
      (a) =>
        a.op === 'stroke' &&
        Math.abs(a.x - (homes.aim.x + 0.5)) < 0.01 &&
        Math.abs(a.r - TOUCH_AIM_STICK_RADIUS * TOUCH_AIM_FIRE_THRESHOLD) < 0.1,
    );
    expect(moveDepthRing).toBeDefined();
    expect(aimFireThresholdRing).toBeDefined();

    // Translucent 3D thumbstick knobs centered at resting home positions (8.5 move / 9 aim)
    const moveKnob = rec.arcs.find(
      (a) =>
        a.op === 'fill' &&
        Math.abs(a.x - (homes.move.x + 0.5)) < 0.01 &&
        Math.abs(a.y - (homes.move.y + 0.5)) < 0.01 &&
        Math.abs(a.r - 8.5) < 0.01,
    );
    const aimKnob = rec.arcs.find(
      (a) =>
        a.op === 'fill' &&
        Math.abs(a.x - (homes.aim.x + 0.5)) < 0.01 &&
        Math.abs(a.y - (homes.aim.y + 0.5)) < 0.01 &&
        Math.abs(a.r - 9) < 0.01,
    );
    expect(moveKnob).toBeDefined();
    expect(aimKnob).toBeDefined();

    // Specular highlight crescents drawn on both thumbcaps (partial arcs < 2*PI)
    const specularArcs = rec.arcs.filter(
      (a) => a.op === 'stroke' && a.endAngle - a.startAngle < Math.PI && a.style.includes('255, 255, 255'),
    );
    expect(specularArcs.length).toBeGreaterThanOrEqual(4); // 2 socket bevels + 2 thumbcap crescents

    // Sleek low translucency at idle (every stick arc alpha strictly translucent and <= 0.4)
    for (const a of rec.arcs) {
      const alpha = parseRgbaAlpha(a.style);
      expect(alpha).not.toBeNull();
      expect(alpha!).toBeGreaterThan(0);
      expect(alpha!).toBeLessThanOrEqual(0.4);
    }

    // No tether lines at idle
    expect(rec.lines.length).toBe(0);
  });

  it('floats smoothly to touched origins, draws directional tethers, brightens when active, shifts Aim stick fiery when firing, and returns to home on release', () => {
    const touch = new TouchControlsManager();
    touch.setLogicalSize(LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT);

    // Measure idle alpha baseline
    const idleRec = createRecordingCanvasContext();
    touch.render(idleRec.ctx, LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT, {
      visible: true,
      nearbyInteractable: false,
      timeSec: 1,
    });
    const idleMaxAlpha = Math.max(
      ...idleRec.arcs.map((a) => parseRgbaAlpha(a.style) ?? 0),
    );

    // Touch both sticks away from home and push right stick past 52% fire threshold
    touch.handleGameplayTouchStart(10, 110, 140);
    touch.handleGameplayTouchMove(10, 130, 140); // deflected +X
    touch.handleGameplayTouchStart(20, 310, 130);
    touch.handleGameplayTouchMove(20, 310 + TOUCH_AIM_STICK_RADIUS * 0.85, 130); // firing!
    for (let i = 0; i < 8; i++) touch.updateFade(0.033);

    expect(touch.getMoveStickState().alpha).toBeCloseTo(1, 5);
    expect(touch.getAimStickState().alpha).toBeCloseTo(1, 5);
    expect(touch.getAimStickState().firing).toBe(true);

    const activeRec = createRecordingCanvasContext();
    touch.render(activeRec.ctx, LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT, {
      visible: true,
      nearbyInteractable: false,
      timeSec: 1.3,
    });

    // Floating socket origins match touched locations
    const floatedMoveSocket = activeRec.arcs.find(
      (a) =>
        a.op === 'fill' &&
        Math.abs(a.x - 110.5) < 0.01 &&
        Math.abs(a.y - 140.5) < 0.01 &&
        Math.abs(a.r - TOUCH_MOVE_STICK_RADIUS) < 0.01,
    );
    const floatedAimSocket = activeRec.arcs.find(
      (a) =>
        a.op === 'fill' &&
        Math.abs(a.x - 310.5) < 0.01 &&
        Math.abs(a.y - 130.5) < 0.01 &&
        Math.abs(a.r - TOUCH_AIM_STICK_RADIUS) < 0.01,
    );
    expect(floatedMoveSocket).toBeDefined();
    expect(floatedAimSocket).toBeDefined();

    // Directional translucent tether lines drawn for both deflected sticks
    expect(activeRec.lines.length).toBe(2);

    // Brightens noticeably when held while remaining translucent (< 0.9)
    const activeMaxAlpha = Math.max(
      ...activeRec.arcs.map((a) => parseRgbaAlpha(a.style) ?? 0),
    );
    expect(activeMaxAlpha).toBeGreaterThan(idleMaxAlpha * 1.8);
    expect(activeMaxAlpha).toBeLessThan(0.9);

    // Firing Aim stick shifts to vibrant fiery orange-red outer/fire-threshold ring (255, 108, 56)
    const fieryRing = activeRec.arcs.find(
      (a) => a.op === 'stroke' && a.style.startsWith('rgba(255, 108, 56,'),
    );
    expect(fieryRing).toBeDefined();

    // Release both sticks -> alpha decays back to 0 and sticks return to resting home positions
    touch.handleGameplayTouchEnd(10);
    touch.handleGameplayTouchEnd(20);
    for (let i = 0; i < 20; i++) touch.updateFade(0.033);
    expect(touch.getMoveStickState().alpha).toBe(0);
    expect(touch.getAimStickState().alpha).toBe(0);

    const homesWide = computeTouchStickHomes(LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT);
    const postRec = createRecordingCanvasContext();
    touch.render(postRec.ctx, LOGICAL_WIDTH_16_9, LOGICAL_HEIGHT, {
      visible: true,
      nearbyInteractable: false,
      timeSec: 2,
    });
    expect(
      postRec.arcs.some(
        (a) =>
          a.op === 'fill' &&
          Math.abs(a.x - (homesWide.move.x + 0.5)) < 0.01 &&
          Math.abs(a.y - (homesWide.move.y + 0.5)) < 0.01 &&
          Math.abs(a.r - TOUCH_MOVE_STICK_RADIUS) < 0.01,
      ),
    ).toBe(true);
    expect(
      postRec.arcs.some(
        (a) =>
          a.op === 'fill' &&
          Math.abs(a.x - (homesWide.aim.x + 0.5)) < 0.01 &&
          Math.abs(a.y - (homesWide.aim.y + 0.5)) < 0.01 &&
          Math.abs(a.r - TOUCH_AIM_STICK_RADIUS) < 0.01,
      ),
    ).toBe(true);
  });
});

describe('touch-sticks: Safe Mobile Micro-Haptics Helper', () => {
  it('invokes navigator.vibrate when enabled & supported, no-ops when disabled or absent, and never throws', () => {
    const origNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const setMockNavigator = (val: unknown) => {
      Object.defineProperty(globalThis, 'navigator', {
        value: val,
        configurable: true,
        writable: true,
      });
    };

    try {
      // 1. Supported & enabled (scalar and readonly tuple)
      const vibrate = vi.fn(() => true);
      setMockNavigator({ vibrate });
      expect(triggerTouchHaptic(12, true)).toBe(true);
      expect(vibrate).toHaveBeenCalledWith(12);

      const pattern: readonly number[] = [10, 20, 15];
      expect(triggerTouchHaptic(pattern, true)).toBe(true);
      expect(vibrate).toHaveBeenCalledWith([10, 20, 15]);

      // 2. Disabled -> no-op, returns false
      vibrate.mockClear();
      expect(triggerTouchHaptic(18, false)).toBe(false);
      expect(vibrate).not.toHaveBeenCalled();

      // 3. Missing vibrate function (iOS Safari / desktop) -> returns false cleanly
      setMockNavigator({});
      expect(() => triggerTouchHaptic(15, true)).not.toThrow();
      expect(triggerTouchHaptic(15, true)).toBe(false);

      // 4. Undefined navigator -> returns false cleanly
      setMockNavigator(undefined);
      expect(() => triggerTouchHaptic(15, true)).not.toThrow();
      expect(triggerTouchHaptic(15, true)).toBe(false);

      // 5. Throwing vibrate (Tesla / restricted sandbox) -> caught safely, returns false
      setMockNavigator({
        vibrate: () => {
          throw new Error('Vibration blocked');
        },
      });
      expect(() => triggerTouchHaptic([12, 8], true)).not.toThrow();
      expect(triggerTouchHaptic([12, 8], true)).toBe(false);
    } finally {
      if (origNavigatorDesc) {
        Object.defineProperty(globalThis, 'navigator', origNavigatorDesc);
      } else {
        delete (globalThis as Record<string, unknown>).navigator;
      }
    }
  });
});

describe('touch-sticks: Mobile & Tesla Viewport Hardening (index.html)', () => {
  it('enforces safe-area viewport-fit, status bar, overscroll, touch-action, and callout hardening', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('apple-mobile-web-app-status-bar-style');
    expect(html).toContain('overscroll-behavior: none');
    expect(html).toContain('touch-action: none');
    expect(html).toContain('-webkit-touch-callout: none');
  });
});
