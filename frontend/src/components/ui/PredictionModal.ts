import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { Input } from "@pixi/ui";
import type {
  PredictionContext,
  PredictionState,
} from "@/contexts/PredictionContext";
import type { FocusManager } from "@/managers/FocusManager";
import type { Segment } from "@/lib/segments";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:          0x04091a,
  bgPanel:     0x060e22,
  bgCard:      0x0a1530,
  bgInput:     0x070f20,
  bgChip:      0x0c1628,
  border:      0x1a3060,
  borderGlow:  0x2a50a0,
  accent:      0xf59e0b,
  accentDim:   0xb45309,
  accentGlow:  0xfbbf24,
  green:       0x22c55e,
  greenGlow:   0x86efac,
  greenDark:   0x052e16,
  red:         0xef4444,
  textPrimary: 0xf8fafc,
  textMuted:   0x4a6a9a,
  textDim:     0x334466,
  gold:        0xffd700,
  goldDim:     0xa07820,
  white:       0xffffff,
  shadow:      0x000000,
} as const;

function drawScanlines(
  g: Graphics,
  x: number, y: number,
  w: number, h: number,
  alpha = 0.018,
) {
  for (let sy = y; sy < y + h; sy += 4) {
    g.rect(x, sy, w, 1);
    g.fill({ color: T.white, alpha });
  }
}

export class PredictionPanel {
  container: Container;
  segments: Segment[] = [];
  private ctx: PredictionContext;
  private focusManager: FocusManager | null;
  private unsubscribe: (() => void) | null = null;

  onConfirm: (() => void) | null = null;

  private selectedValues: Set<string> = new Set();

  private panelW = 400;
  private panelH = 320;

  private panelBg: Graphics;
  private titleTxt: Text;
  // ── Stable child nodes (created once, repositioned in layout()) ───────────
  private subtitleTxt: Text;
  private divG: Graphics;
  private amtLbl: Text;
  // ─────────────────────────────────────────────────────────────────────────
  private gridContainer: Container;

  private cells: Map<
    Segment,
    { baseBg: Graphics; highlightBg: Graphics; root: Container; cellSize: number }
  > = new Map();

  private selectionBar: Container;
  private selectionBg: Graphics;
  private selectionTxt: Text;
  // Mask that clips selectionTxt to the bar width
  private selectionMask: Graphics;

  private amountInput: Input | null = null;
  private amountInputContainer: Container;

  private amountStepButtons: Array<{
    delta: number; root: Container; bg: Graphics; txt: Text;
  }> = [];
  private chipButtons: Array<{
    value: number; root: Container; bg: Graphics; txt: Text;
  }> = [];

  private confirmBtn: Container;
  private confirmBg: Graphics;
  private confirmGlow: Graphics;
  private confirmTxt: Text;
  private errorTxt: Text;

  private enabled_ = true;
  private submitting_ = false;

  constructor(
    ctx: PredictionContext,
    focusManager: FocusManager | null = null,
    segments: Segment[] = [],
  ) {
    this.ctx = ctx;
    this.focusManager = focusManager;
    this.container = new Container();
    this.container.visible = true;
    this.container.eventMode = "static";
    this.segments = segments;

    this.panelBg = new Graphics();
    this.container.addChild(this.panelBg);

    this.titleTxt = new Text({
      text: "PLACE YOUR BET",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: 13,
        fill: T.gold,
        fontWeight: "bold",
        letterSpacing: 4,
      }),
    });
    this.titleTxt.anchor.set(0.5, 0.5);
    this.container.addChild(this.titleTxt);

    // ── Stable nodes — added once here, repositioned in layout() ─────────
    this.subtitleTxt = new Text({
      text: "Select numbers  ·  set amount  ·  confirm",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: 10,
        fill: T.textMuted,
        align: "center",
        letterSpacing: 0.5,
      }),
    });
    this.subtitleTxt.anchor.set(0.5, 0);
    this.container.addChild(this.subtitleTxt);

    this.divG = new Graphics();
    this.container.addChild(this.divG);

    this.amtLbl = new Text({
      text: "WAGER",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: 9,
        fill: T.textMuted,
        letterSpacing: 2,
      }),
    });
    this.amtLbl.anchor.set(0, 1);
    this.container.addChild(this.amtLbl);
    // ─────────────────────────────────────────────────────────────────────

    this.gridContainer = new Container();
    this.container.addChild(this.gridContainer);

    this.selectionBar = new Container();
    this.container.addChild(this.selectionBar);
    this.selectionBg = new Graphics();
    this.selectionBar.addChild(this.selectionBg);
    this.selectionTxt = new Text({
      text: "No numbers selected",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: 11,
        fill: T.textMuted,
        align: "center",
      }),
    });
    this.selectionTxt.anchor.set(0.5, 0.5);
    this.selectionBar.addChild(this.selectionTxt);

    // Mask clips selectionTxt inside the bar — created once, resized in layout()
    this.selectionMask = new Graphics();
    this.selectionBar.addChild(this.selectionMask);
    this.selectionTxt.mask = this.selectionMask;

    this.errorTxt = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: 10,
        fill: T.red,
        align: "center",
      }),
    });
    this.errorTxt.anchor.set(0.5, 0.5);
    this.container.addChild(this.errorTxt);

    this.amountInputContainer = new Container();
    this.container.addChild(this.amountInputContainer);

    // ── Step buttons ──────────────────────────────────────────────────────
    [{ delta: -100, label: "−" }, { delta: 100, label: "+" }].forEach(({ delta, label }) => {
      const root = new Container();
      root.eventMode = "static";
      root.cursor = "pointer";
      const bg = new Graphics();
      root.addChild(bg);
      const txt = new Text({
        text: label,
        style: new TextStyle({
          fontFamily: "Century Gothic", fontSize: 20,
          fill: T.accent, fontWeight: "bold",
        }),
      });
      txt.anchor.set(0.5, 0.5);
      root.addChild(txt);
      root.on("pointerdown", () => this._incrementAmount(delta));
      root.on("pointerover", () => { bg.tint = 0x1a2a40; txt.style.fill = T.accentGlow; });
      root.on("pointerout",  () => { bg.tint = T.white;  txt.style.fill = T.accent; });
      this.amountStepButtons.push({ delta, root, bg, txt });
      this.container.addChild(root);
    });

    // ── Chip buttons ──────────────────────────────────────────────────────
    [200, 400, 500, 1000].forEach((value) => {
      const root = new Container();
      root.eventMode = "static";
      root.cursor = "pointer";
      const bg = new Graphics();
      root.addChild(bg);
      const txt = new Text({
        text: `+${value}`,
        style: new TextStyle({
          fontFamily: "Century Gothic", fontSize: 12,
          fill: T.textPrimary, fontWeight: "bold",
        }),
      });
      txt.anchor.set(0.5, 0.5);
      root.addChild(txt);
      root.on("pointerdown", () => this._incrementAmount(value));
      root.on("pointerover", () => { bg.tint = 0x1e3050; txt.style.fill = T.accentGlow; });
      root.on("pointerout",  () => { bg.tint = T.white;  txt.style.fill = T.textPrimary; });
      this.chipButtons.push({ value, root, bg, txt });
      this.container.addChild(root);
    });

    // ── Confirm button ────────────────────────────────────────────────────
    this.confirmBtn = new Container();
    this.confirmBtn.eventMode = "static";
    this.confirmBtn.cursor = "pointer";
    this.container.addChild(this.confirmBtn);

    this.confirmGlow = new Graphics();
    this.confirmBtn.addChild(this.confirmGlow);

    this.confirmBg = new Graphics();
    this.confirmBtn.addChild(this.confirmBg);

    this.confirmTxt = new Text({
      text: "✓  CONFIRM BET",
      style: new TextStyle({
        fontFamily: "Century Gothic", fontSize: 13,
        fill: 0x0a0a0a, fontWeight: "bold", letterSpacing: 2,
      }),
    });
    this.confirmTxt.anchor.set(0.5, 0.5);
    this.confirmBtn.addChild(this.confirmTxt);

    this.confirmBtn.on("pointerdown", () => this._handleConfirm());
    this.confirmBtn.on("pointerover", () => {
      this.confirmGlow.alpha = 1;
      this.confirmBg.tint = 0xfde68a;
    });
    this.confirmBtn.on("pointerout", () => {
      this.confirmGlow.alpha = 0.5;
      this.confirmBg.tint = T.white;
    });

    if (focusManager) {
      this.amountStepButtons.forEach((chip) => {
        focusManager.addItem(chip.root, () => this._incrementAmount(chip.delta), {
          group: "default",
          label: chip.delta > 0 ? "Increase amount" : "Decrease amount",
        });
      });
      this.chipButtons.forEach((chip) => {
        focusManager.addItem(chip.root, () => this._incrementAmount(chip.value), {
          group: "default", label: `Add ${chip.value}`,
        });
      });
      focusManager.addItem(this.confirmBtn, () => this._handleConfirm(), {
        group: "default", label: "Confirm bet",
      });
    }

    this.unsubscribe = this.ctx.subscribe((s) => this._updateState(s));
  }

  // ── Public API ────────────────────────────────────────────────────────────

  getSelectedValues(): string[] { return Array.from(this.selectedValues); }

  setEnabled(enabled: boolean) {
    this.enabled_ = enabled;
    const interactive = enabled && !this.submitting_;
    this.container.alpha = enabled ? 1 : 0.35;
    this.confirmBtn.eventMode = interactive ? "static" : "none";
    this.gridContainer.eventMode = interactive ? "static" : "none";
    this.amountStepButtons.forEach((b) => { b.root.eventMode = interactive ? "static" : "none"; });
    this.chipButtons.forEach((b) => { b.root.eventMode = interactive ? "static" : "none"; });
    if (this.amountInput) {
      this.amountInputContainer.eventMode = interactive ? "static" : "none";
      this.amountInputContainer.alpha = interactive ? 1 : 0.4;
    }
    this._refreshConfirmButton();
  }

  setSubmitting(submitting: boolean) {
    this.submitting_ = submitting;
    const interactive = this.enabled_ && !this.submitting_;
    this.confirmBtn.eventMode = interactive ? "static" : "none";
    this.gridContainer.eventMode = interactive ? "static" : "none";
    this.amountStepButtons.forEach((b) => { b.root.eventMode = interactive ? "static" : "none"; });
    this.chipButtons.forEach((b) => { b.root.eventMode = interactive ? "static" : "none"; });
    if (this.amountInput) this.amountInputContainer.eventMode = interactive ? "static" : "none";
    this._refreshConfirmButton();
  }

  setAmount(value: string) {
    if (this.amountInput) (this.amountInput as any).value = value;
    this.ctx.setAmount(value);
  }

  clearBetInput() {
    this.setAmount("");
    this.ctx.clear();
    this.selectedValues.clear();
    this._refreshCellHighlights();
    this._refreshSelectionBar();
  }

  focusAmountInput() {
    try { (this.amountInput as any)?.focus?.(); } catch {}
  }

  show(): void {
    this.container.visible = true;
    if (this.focusManager) this.focusManager.setActiveGroup("default");
  }

  hide(): void   { this.setEnabled(false); }
  enable(): void { this.setEnabled(true); }
  isVisible(): boolean { return this.container.visible; }
  repositionInput(_panelX: number, _panelY: number) { /* no-op */ }

  // ── Layout ────────────────────────────────────────────────────────────────

  layout(panelX: number, panelY: number, panelW: number, panelH: number): void {
    this.panelW = panelW;
    this.panelH = panelH;
    this.container.x = panelX;
    this.container.y = panelY;

    const PAD = Math.round(panelW * 0.055);
    const cx = panelW / 2;

    // ── Panel background ──────────────────────────────────────────────────
    this.panelBg.clear();
    for (let i = 4; i > 0; i--) {
      const s = i * 3;
      this.panelBg.roundRect(-s, -s, panelW + s * 2, panelH + s * 2, 18 + s);
      this.panelBg.stroke({ color: T.borderGlow, width: 1, alpha: 0.06 * (5 - i) });
    }
    this.panelBg.roundRect(0, 0, panelW, panelH, 16);
    this.panelBg.fill({ color: T.bgPanel });
    this.panelBg.stroke({ color: T.borderGlow, width: 1.5 });
    this.panelBg.roundRect(0, 0, panelW, Math.round(panelH * 0.4), 16);
    this.panelBg.fill({ color: T.bgCard, alpha: 0.5 });
    drawScanlines(this.panelBg, 0, 0, panelW, panelH);
    const cs = 10;
    ([[0, 0], [panelW, 0], [0, panelH], [panelW, panelH]] as const).forEach(([bx, by]) => {
      const sx = bx === 0 ? 1 : -1;
      const sy = by === 0 ? 1 : -1;
      this.panelBg.moveTo(bx, by + sy * cs);
      this.panelBg.lineTo(bx, by);
      this.panelBg.lineTo(bx + sx * cs, by);
      this.panelBg.stroke({ color: T.accent, width: 2, alpha: 0.9 });
    });

    let y = PAD;

    // ── Title band ────────────────────────────────────────────────────────
    const titleBandH = 32;
    this.panelBg.roundRect(PAD, y - 4, panelW - PAD * 2, titleBandH, 8);
    this.panelBg.fill({ color: 0x080f28, alpha: 0.8 });
    this.panelBg.stroke({ color: T.goldDim, width: 1, alpha: 0.6 });
    this.panelBg.rect(PAD + 6, y, 3, titleBandH - 8);
    this.panelBg.fill({ color: T.accent });

    this.titleTxt.style.fontSize = Math.max(10, Math.round(panelW * 0.034));
    this.titleTxt.x = cx + 4;
    this.titleTxt.y = y + titleBandH / 2 - 2;
    y += titleBandH + 6;

    // ── Subtitle (stable node — reposition, don't recreate) ───────────────
    this.subtitleTxt.style.fontSize = Math.max(8, Math.round(panelW * 0.021));
    this.subtitleTxt.x = cx;
    this.subtitleTxt.y = y;
    y += this.subtitleTxt.height + 6;

    // ── Divider (stable node — redraw in place) ───────────────────────────
    this.divG.clear();
    this.divG.moveTo(PAD, y + 1);
    this.divG.lineTo(panelW - PAD, y + 1);
    this.divG.stroke({ color: T.border, width: 1 });
    this.divG.circle(cx, y + 1, 3);
    this.divG.fill({ color: T.borderGlow });
    y += 10;

    // ── Number grid ───────────────────────────────────────────────────────
    this.gridContainer.removeChildren();
    this.cells.clear();

    const numbers = this.segments;
    const COLS = Math.min(numbers.length, numbers.length <= 20 ? 7 : 9);
    const availW = panelW - PAD * 2;
    const cellGap = Math.round(availW * 0.024);
    const cellSize = Math.round((availW - cellGap * (COLS - 1)) / COLS);
    const ROWS = Math.ceil(numbers.length / COLS);

    this.gridContainer.x = PAD;
    this.gridContainer.y = y;

    numbers.forEach((num, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);

      const root = new Container();
      root.x = col * (cellSize + cellGap);
      root.y = row * (cellSize + cellGap);
      root.eventMode = "static";
      root.cursor = "pointer";

      const baseBg = new Graphics();
      baseBg.roundRect(0, 0, cellSize, cellSize, 5);
      baseBg.fill({ color: num.color });
      baseBg.stroke({ color: num.color, width: 1 });
      baseBg.roundRect(0, 0, cellSize, Math.round(cellSize * 0.5), 5);
      baseBg.fill({ color: T.white, alpha: 0.12 });
      baseBg.roundRect(0, Math.round(cellSize * 0.7), cellSize, Math.round(cellSize * 0.3), 3);
      baseBg.fill({ color: T.shadow, alpha: 0.25 });
      root.addChild(baseBg);

      const highlightBg = new Graphics();
      root.addChild(highlightBg);

      const lbl = new Text({
        text: `${num.label}`,
        style: new TextStyle({
          fontFamily: "Century Gothic",
          fontSize: Math.max(8, Math.round(cellSize * 0.38)),
          fill: T.white, fontWeight: "bold",
          dropShadow: { color: T.shadow, blur: 3, distance: 1, alpha: 0.8 },
        }),
      });
      lbl.anchor.set(0.5, 0.5);
      lbl.x = cellSize / 2;
      lbl.y = cellSize / 2;
      root.addChild(lbl);

      root.on("pointerdown", () => this._toggleValue(num.value));
      root.on("pointerover", () => { baseBg.alpha = 0.75; root.scale.set(1.06); });
      root.on("pointerout",  () => { baseBg.alpha = 1;    root.scale.set(1.0); });

      this.gridContainer.addChild(root);
      this.cells.set(num, { baseBg, highlightBg, root, cellSize });

      if (this.focusManager) {
        this.focusManager.addItem(
          root,
          () => this._toggleValue(num.value),
          { group: "default", label: `Toggle ${num.value}` },
        );
      }
    });

    y += ROWS * (cellSize + cellGap) + PAD * 0.7;

    // ── Selection bar ─────────────────────────────────────────────────────
    const selW = panelW - PAD * 2;
    const selH = Math.round(panelH * 0.075);
    this.selectionBar.x = PAD;
    this.selectionBar.y = y;

    // Resize clip mask to match the bar
    this.selectionMask.clear();
    this.selectionMask.rect(0, 0, selW, selH);
    this.selectionMask.fill({ color: T.white });

    this.selectionBg.clear();
    this.selectionBg.roundRect(0, 0, selW, selH, 7);
    this.selectionBg.fill({ color: T.bgCard });
    this.selectionBg.stroke({ color: T.border, width: 1 });
    this.selectionTxt.style.fontSize = Math.max(12, Math.round(panelW * 0.032));
    this.selectionTxt.x = selW / 2;
    this.selectionTxt.y = selH / 2;
    y += selH + PAD * 0.6;

    // ── Amount row ────────────────────────────────────────────────────────
    const inputH = Math.min(44, Math.max(36, Math.round(panelH * 0.095)));
    const stepGap = Math.max(8, Math.round(PAD * 0.5));
    const stepW = Math.max(38, Math.round(panelW * 0.1));
    const leftStepX = PAD;
    const rightStepX = panelW - PAD - stepW;
    const inputStartX = leftStepX + stepW + stepGap;
    const inputLogicalW = Math.max(100, rightStepX - stepGap - inputStartX);

    // ── WAGER label (stable node — reposition only) ───────────────────────
    this.amtLbl.style.fontSize = Math.max(7, Math.round(panelW * 0.018));
    this.amtLbl.x = leftStepX;
    this.amtLbl.y = y - 2;

    this.amountStepButtons.forEach((chip, i) => {
      const isMinus = i === 0;
      chip.root.x = isMinus ? leftStepX : rightStepX;
      chip.root.y = y;
      chip.root.zIndex = 15;
      chip.bg.clear();
      for (let gl = 2; gl > 0; gl--) {
        const s = gl * 1.5;
        chip.bg.roundRect(-s, -s, stepW + s * 2, inputH + s * 2, 9 + s);
        chip.bg.stroke({ color: T.accent, width: 1, alpha: 0.08 * (3 - gl) });
      }
      chip.bg.roundRect(0, 0, stepW, inputH, 8);
      chip.bg.fill({ color: T.bgCard });
      chip.bg.stroke({ color: T.accentDim, width: 1.5 });
      chip.txt.style.fontSize = Math.max(16, Math.round(inputH * 0.52));
      chip.txt.x = stepW / 2;
      chip.txt.y = inputH / 2;
    });

    // ── PixiJS Input ──────────────────────────────────────────────────────
    if (this.amountInput) {
      this.amountInputContainer.removeChildren();
      this.amountInput = null;
    }

    const fontSize = Math.max(13, Math.round(inputH * 0.4));
    const inputBg = new Graphics();
    inputBg.roundRect(0, 0, inputLogicalW, inputH, 8);
    inputBg.fill({ color: T.bgInput });
    inputBg.stroke({ color: T.border, width: 1.5 });

    this.amountInput = new Input({
      bg: inputBg,
      textStyle: new TextStyle({
        fontFamily: "Century Gothic", fontSize,
        fill: T.gold, fontWeight: "bold",
      }),
      padding: { top: 0, right: 16, bottom: 0, left: 16 },
      value: this.ctx.getState().amount,
    });

    this.amountInput.onChange.connect((value: string) => {
      const cleaned = value.replace(/[^0-9.]/g, "");
      if (cleaned !== value) (this.amountInput as any).value = cleaned;
      this.ctx.setAmount(cleaned);
      this._refreshSelectionBar();
    });
    this.amountInput.onEnter?.connect(() => { this.focusManager?.setInputActive(false); });
    (this.amountInput as any).on?.("focus", () => { this.focusManager?.setInputActive(true); });
    (this.amountInput as any).on?.("blur",  () => { this.focusManager?.setInputActive(false); });

    this.amountInputContainer.addChild(this.amountInput);
    this.amountInputContainer.x = inputStartX;
    this.amountInputContainer.y = y;
    y += inputH + PAD * 0.35;

    // ── Chip buttons ──────────────────────────────────────────────────────
    const chipGap = Math.max(6, Math.round(PAD * 0.4));
    const chipH = Math.min(32, Math.max(26, Math.round(panelH * 0.072)));
    const chipW = Math.floor((panelW - PAD * 2 - chipGap * 3) / 4);
    const confirmBtnH = Math.min(44, Math.max(36, Math.round(panelH * 0.09)));
    const chipsY = y;

    this.chipButtons.forEach((chip, i) => {
      chip.root.visible = true;
      chip.root.eventMode = this.enabled_ && !this.submitting_ ? "static" : "none";
      chip.root.x = PAD + i * (chipW + chipGap);
      chip.root.y = chipsY;
      chip.root.zIndex = 15;
      chip.bg.clear();
      chip.bg.roundRect(0, 0, chipW, chipH, 6);
      chip.bg.fill({ color: T.bgChip });
      chip.bg.stroke({ color: T.border, width: 1.2 });
      chip.bg.roundRect(2, 1, chipW - 4, Math.round(chipH * 0.4), 5);
      chip.bg.fill({ color: T.white, alpha: 0.05 });
      chip.txt.style.fontSize = Math.max(10, Math.round(chipH * 0.42));
      chip.txt.x = chipW / 2;
      chip.txt.y = chipH / 2;
    });
    y = chipsY + chipH + PAD * 0.5;

    // ── Error text ────────────────────────────────────────────────────────
    this.errorTxt.style.fontSize = Math.max(9, Math.round(panelW * 0.024));
    this.errorTxt.x = cx;
    this.errorTxt.y = y;
    y += 18;

    // ── Confirm button ────────────────────────────────────────────────────
    const confirmW = panelW - PAD * 2;
    const minConfirmY = y;
    const confirmBottomInset = PAD + Math.max(8, Math.round(PAD * 0.35));
    const bottomAnchoredY = panelH - confirmBottomInset - confirmBtnH;

    this.confirmBtn.x = PAD;
    this.confirmBtn.y = Math.max(minConfirmY, bottomAnchoredY);

    this.confirmGlow.clear();
    for (let g = 4; g > 0; g--) {
      const spread = g * 4;
      this.confirmGlow.roundRect(
        -spread, -spread,
        confirmW + spread * 2, confirmBtnH + spread * 2,
        confirmBtnH / 2 + spread,
      );
      this.confirmGlow.fill({ color: T.accent, alpha: 0.04 * (5 - g) });
    }
    this.confirmGlow.alpha = 0.5;

    this.confirmBg.clear();
    this.confirmBg.roundRect(0, 0, confirmW, confirmBtnH, confirmBtnH / 2);
    this.confirmBg.fill({ color: T.accent });
    this.confirmBg.roundRect(2, 2, confirmW - 4, Math.round(confirmBtnH * 0.48), confirmBtnH / 2);
    this.confirmBg.fill({ color: T.white, alpha: 0.18 });

    this.confirmTxt.style.fontSize = Math.max(11, Math.round(confirmBtnH * 0.42));
    this.confirmTxt.x = confirmW / 2;
    this.confirmTxt.y = confirmBtnH / 2;

    this._refreshCellHighlights();
    this._refreshSelectionBar();
  }

  // ── Destroy ───────────────────────────────────────────────────────────────

  destroy(): void {
    this.unsubscribe?.();
    this.amountInput = null;
    this.container.destroy({ children: true });
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _toggleValue(value: string) {
    if (this.selectedValues.has(value)) {
      this.selectedValues.delete(value);
    } else {
      this.selectedValues.add(value);
    }
    this._refreshCellHighlights();
    this._refreshSelectionBar();
  }

  private _refreshCellHighlights() {
    this.cells.forEach(({ highlightBg, root, cellSize }, seg) => {
      highlightBg.clear();

      if (this.selectedValues.has(seg.value)) {
        for (let g = 3; g > 0; g--) {
          const s = g * 1.5;
          highlightBg.roundRect(-s, -s, cellSize + s * 2, cellSize + s * 2, 6 + s);
          highlightBg.stroke({ color: T.green, width: 1, alpha: 0.15 * (4 - g) });
        }
        highlightBg.roundRect(0, 0, cellSize, cellSize, 5);
        highlightBg.stroke({ color: T.green, width: 2.5 });
        highlightBg.roundRect(1, 1, cellSize - 2, cellSize - 2, 4);
        highlightBg.stroke({ color: T.greenGlow, width: 1, alpha: 0.7 });
        root.zIndex = 10;
      } else {
        highlightBg.roundRect(0, 0, cellSize, cellSize, 5);
        highlightBg.stroke({ color: T.shadow, width: 1, alpha: 0.4 });
        root.zIndex = 0;
      }
    });
  }

  private _refreshSelectionBar() {
    const mW = this.panelW;
    const PAD = Math.round(mW * 0.055);
    const selW = mW - PAD * 2;
    const selH = Math.round(this.panelH * 0.075);

    // Keep the mask in sync with the current bar width
    this.selectionMask.clear();
    this.selectionMask.rect(0, 0, selW, selH);
    this.selectionMask.fill({ color: T.white });

    if (this.selectedValues.size > 0) {
      const count = this.selectedValues.size;
      const amountPerNumber = parseFloat(this.ctx.getState().amount) || 0;
      const totalAmount = amountPerNumber * count;
      const numLine = count === 1
        ? `Selected: ${Array.from(this.selectedValues)[0]}`
        : `Selected (${count})`;
      const totalLine = amountPerNumber > 0
        ? `  ·  Total: ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "";
      this.selectionTxt.text = numLine + totalLine;
      this.selectionTxt.style.fill = T.greenGlow;
      this.selectionTxt.style.fontWeight = "bold";
      this.selectionTxt.style.fontSize = Math.max(
        10, Math.round(this.panelW * (count > 5 ? 0.026 : 0.034)),
      );
      this.selectionBg.clear();
      for (let g = 2; g > 0; g--) {
        const s = g * 1.5;
        this.selectionBg.roundRect(-s, -s, selW + s * 2, selH + s * 2, 9 + s);
        this.selectionBg.stroke({ color: T.green, width: 1, alpha: 0.1 * (3 - g) });
      }
      this.selectionBg.roundRect(0, 0, selW, selH, 7);
      this.selectionBg.fill({ color: T.greenDark });
      this.selectionBg.stroke({ color: T.green, width: 1.5 });
      this.selectionBg.roundRect(0, 0, selW, Math.round(selH * 0.5), 7);
      this.selectionBg.fill({ color: T.white, alpha: 0.04 });
    } else {
      this.selectionTxt.text = "No numbers selected — tap to pick";
      this.selectionTxt.style.fill = T.textDim;
      this.selectionTxt.style.fontWeight = "normal";
      this.selectionTxt.style.fontSize = Math.max(12, Math.round(this.panelW * 0.032));
      this.selectionBg.clear();
      this.selectionBg.roundRect(0, 0, selW, selH, 7);
      this.selectionBg.fill({ color: T.bgCard });
      this.selectionBg.stroke({ color: T.border, width: 1 });
    }
  }

  private _refreshConfirmButton() {
    const isBusy = this.submitting_;
    this.confirmTxt.text = isBusy ? "CONFIRMING..." : "✓  CONFIRM BET";
    this.confirmBg.alpha = isBusy ? 0.6 : 1;
    this.confirmGlow.alpha = isBusy ? 0.2 : 0.5;
  }

  private _handleConfirm() {
    if (!this.enabled_ || this.submitting_) return;
    if (this.selectedValues.size === 0) {
      this.errorTxt.text = "Please select at least one number.";
      return;
    }
    const amt = parseFloat(this.ctx.getState().amount);
    if (isNaN(amt) || amt <= 0) {
      this.errorTxt.text = "Please enter a valid bet amount.";
      return;
    }
    this.errorTxt.text = "";
    this.onConfirm?.();
  }

  private _incrementAmount(delta: number) {
    if (!this.enabled_ || this.submitting_) return;
    const current = Number(this.ctx.getState().amount);
    const safeCurrent = Number.isFinite(current) ? current : 0;
    const next = Math.max(0, safeCurrent + delta);
    this.setAmount(String(next));
    this._refreshSelectionBar();
  }

  private _updateState(state: PredictionState): void {
    if (this.amountInput) {
      const current = (this.amountInput as any).value ?? "";
      if (current !== state.amount) (this.amountInput as any).value = state.amount;
    }
    this._refreshSelectionBar();
  }
}