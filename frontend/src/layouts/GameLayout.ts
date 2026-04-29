// utils/layout.ts — wheel-first, overflow-safe layout engine

export type LayoutMode = "phone-portrait" | "phone-landscape" | "tablet" | "desktop" | "tv";

export interface Layout {
  mode: LayoutMode;
  W: number;
  H: number;
  headerH: number;
  statusBarH: number;
  historyW: number;
  historyVisible: boolean;
  historyRowH: number;
  historyFontSm: number;
  historyFontMd: number;
  wheelX: number;
  wheelY: number;
  wheelSize: number;
  wheelScale: number;
  btnAreaY: number;
  btnCenterX: number;
  spinBtnW: number;
  spinBtnH: number;
  spinFontSize: number;
  resetBtnW: number;
  resetFontSize: number;
  btnGap: number;
  scoreFontSize: number;
  scoreStatFontSize: number;
  scorePillW: number;
  statusFontLg: number;
  statusFontSm: number;
  pad: number;
  uiScale: number;
  safeWheelAreaW: number;
}

const BASE_SIZE = 800;

export function computeLayout(W: number, H: number): Layout {
  const isPortrait = H > W;
  const minDim = Math.min(W, H);
  const maxDim = Math.max(W, H);

  let mode: LayoutMode;
  if (minDim < 480) {
    mode = isPortrait ? "phone-portrait" : "phone-landscape";
  } else if (minDim < 900) {
    mode = "tablet";
  } else if (maxDim >= 2400) {
    mode = "tv";
  } else {
    mode = "desktop";
  }

  const uiScale = Math.max(0.65, Math.min(2.2, minDim / 600));
  const pad = Math.round(5 * uiScale);

  const headerH    = Math.round(Math.max(36, 44 * uiScale));
  const statusBarH = Math.round(Math.max(48, 60 * uiScale));

  // ── History panel widths ──────────────────────────────────────────────────
  let historyW = 0;
  let historyVisible = false;
  if (mode === "phone-portrait") {
    historyW = 0;
    historyVisible = false;
  } else if (mode === "phone-landscape") {
    historyW = Math.round(Math.min(160, W * 0.22));
    historyVisible = true;
  } else if (mode === "tablet") {
    historyW = Math.round(Math.min(200, W * 0.22));
    historyVisible = true;
  } else if (mode === "tv") {
    historyW = Math.round(Math.min(320, W * 0.14));
    historyVisible = true;
  } else {
    // desktop — shrink history panel to give wheel more room
    historyW = Math.round(Math.min(180, W * 0.13));
    historyVisible = true;
  }

  // ── Button sizing ─────────────────────────────────────────────────────────
  const spinBtnH  = Math.round(Math.max(32, 44 * uiScale));
  // Reserve less vertical space for buttons so the wheel can grow taller
  const btnStripH = spinBtnH + pad * 2;

  // ── Wheel available area ──────────────────────────────────────────────────
  const wheelAreaX    = historyW + (historyVisible ? pad * 2 : 0);
  const safeWheelAreaW = W - wheelAreaX - pad;

  // ── Button widths ─────────────────────────────────────────────────────────
  const maxBtnTotalW = safeWheelAreaW - pad * 4;
  const rawSpinBtnW  = Math.round(Math.max(110, 200 * uiScale));
  const rawResetBtnW = Math.round(Math.max(70,  100 * uiScale));
  const rawBtnGap    = Math.round(14 * uiScale);
  const rawTotal     = rawSpinBtnW + rawResetBtnW + rawBtnGap;
  const btnScale     = rawTotal > maxBtnTotalW ? maxBtnTotalW / rawTotal : 1;
  const spinBtnW     = Math.round(rawSpinBtnW  * btnScale);
  const resetBtnW    = Math.round(rawResetBtnW * btnScale);
  const btnGap       = Math.round((spinBtnW / 2 + resetBtnW / 2) + rawBtnGap * btnScale);

  const spinFontSize  = Math.round(Math.min(Math.max(11, 19 * uiScale), spinBtnH * 0.52));
  const resetFontSize = Math.round(Math.min(Math.max(10, 17 * uiScale), spinBtnH * 0.48));

  // ── Wheel size — maximise to fill available space ─────────────────────────
  // Available height after header, status bar and button strip
  const wheelAreaH = H - headerH - statusBarH - btnStripH - pad * 2;

  // Use 96% of whichever axis is smaller, so the wheel is as large as possible
  // without clipping. Previously this was 100% which left no breathing room;
  // bump both axes up and take the smaller to stay within bounds.
  const wheelSizeFromW = Math.round(safeWheelAreaW  * 0.96);
  const wheelSizeFromH = Math.round(wheelAreaH       * 0.96);
  const wheelSize      = Math.max(80, Math.min(wheelSizeFromW, wheelSizeFromH));
  const wheelScale     = wheelSize / BASE_SIZE;

  // Centre horizontally in the wheel area, vertically in its allocated band
  const wheelX = wheelAreaX + safeWheelAreaW / 2;
  const wheelY = headerH + pad + wheelSize / 2;

  // ── Button area ───────────────────────────────────────────────────────────
  const wheelBottom  = wheelY + wheelSize / 2;
  const rawBtnAreaY  = wheelBottom + pad + spinBtnH / 2;
  const maxBtnY      = H - statusBarH - spinBtnH / 2 - pad;
  const btnAreaY     = Math.min(rawBtnAreaY, maxBtnY);
  const btnCenterX   = wheelAreaX + safeWheelAreaW / 2;

  // ── Score header ──────────────────────────────────────────────────────────
  const scoreFontSize     = Math.round(Math.max(12, 20 * uiScale));
  const scoreStatFontSize = Math.round(Math.max(9,  11 * uiScale));
  const scorePillW        = Math.round(Math.min(W * 0.65, 340 * uiScale));

  // ── Status bar ────────────────────────────────────────────────────────────
  const statusFontLg = Math.round(Math.max(10, 13 * uiScale));
  const statusFontSm = Math.round(Math.max(9,  11 * uiScale));

  // ── History row + fonts ───────────────────────────────────────────────────
  const historyRowH   = Math.round(Math.max(24, 28 * uiScale));
  const historyFontSm = Math.round(Math.max(10, 12 * uiScale));
  const historyFontMd = Math.round(Math.max(11, 15 * uiScale));

  return {
    mode, W, H,
    headerH, statusBarH,
    historyW, historyVisible,
    historyRowH, historyFontSm, historyFontMd,
    wheelX, wheelY, wheelSize, wheelScale,
    btnAreaY, btnCenterX,
    spinBtnW, spinBtnH, spinFontSize,
    resetBtnW, resetFontSize, btnGap,
    scoreFontSize, scoreStatFontSize, scorePillW,
    statusFontLg, statusFontSm,
    pad, uiScale, safeWheelAreaW,
  };
}