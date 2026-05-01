import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { Input } from "@pixi/ui";
import type {
  PredictionContext,
  PredictionState,
} from "@/contexts/PredictionContext";
import type { FocusManager } from "@/managers/FocusManager";
import type { Segment } from "@/lib/segments";

export class PredictionPanel {
  container: Container;
  segments: Segment[] = [];
  private ctx: PredictionContext;
  private focusManager: FocusManager | null;
  private unsubscribe: (() => void) | null = null;

  onConfirm: (() => void) | null = null;

  private selectedNumbers: Set<number> = new Set();

  private panelW = 400;
  private panelH = 320;

  private panelBg: Graphics;
  private titleTxt: Text;
  private gridContainer: Container;
  private cells: Map<
    Segment,
    { bg: Graphics; root: Container; cellSize: number }
  > = new Map();
  private selectionBar: Container;
  private selectionBg: Graphics;
  private selectionTxt: Text;

  // ── Native PixiJS input ───────────────────────────────────────────────────
  private amountInput: Input | null = null;
  private amountInputContainer: Container;

  private amountStepButtons: Array<{
    delta: number;
    root: Container;
    bg: Graphics;
    txt: Text;
  }> = [];
  private chipButtons: Array<{
    value: number;
    root: Container;
    bg: Graphics;
    txt: Text;
  }> = [];

  private confirmBtn: Container;
  private confirmBg: Graphics;
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

    // ── Panel background ──────────────────────────────────────────────────
    this.panelBg = new Graphics();
    this.container.addChild(this.panelBg);

    // ── Title ─────────────────────────────────────────────────────────────
    this.titleTxt = new Text({
      text: "PLACE YOUR BET",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: 13,
        fill: 0xffd700,
        fontWeight: "bold",
        letterSpacing: 2,
      }),
    });
    this.titleTxt.anchor.set(0.5, 0.5);
    this.container.addChild(this.titleTxt);

    // ── Number grid ───────────────────────────────────────────────────────
    this.gridContainer = new Container();
    this.container.addChild(this.gridContainer);

    // ── Selection bar ─────────────────────────────────────────────────────
    this.selectionBar = new Container();
    this.container.addChild(this.selectionBar);
    this.selectionBg = new Graphics();
    this.selectionBar.addChild(this.selectionBg);
    this.selectionTxt = new Text({
      text: "No numbers selected",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: 11,
        fill: 0x888888,
        align: "center",
      }),
    });
    this.selectionTxt.anchor.set(0.5, 0.5);
    this.selectionBar.addChild(this.selectionTxt);

    // ── Error text ────────────────────────────────────────────────────────
    this.errorTxt = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: 10,
        fill: 0xff4444,
        align: "center",
      }),
    });
    this.errorTxt.anchor.set(0.5, 0.5);
    this.container.addChild(this.errorTxt);

    // ── Amount input container (native pixi-ui Input placed here in layout) ─
    this.amountInputContainer = new Container();
    this.container.addChild(this.amountInputContainer);

    // ── +/- Step buttons ──────────────────────────────────────────────────
    const stepButtons = [
      { delta: -100, label: "−" },
      { delta: 100, label: "+" },
    ];
    stepButtons.forEach(({ delta, label }) => {
      const root = new Container();
      root.eventMode = "static";
      root.cursor = "pointer";
      const bg = new Graphics();
      root.addChild(bg);
      const txt = new Text({
        text: label,
        style: new TextStyle({
          fontFamily: "Century Gothic",
          fontSize: 18,
          fill: 0xffffff,
          fontWeight: "bold",
        }),
      });
      txt.anchor.set(0.5, 0.5);
      root.addChild(txt);
      root.on("pointerdown", () => this._incrementAmount(delta));
      root.on("pointerover", () => {
        bg.tint = 0x334155;
      });
      root.on("pointerout", () => {
        bg.tint = 0xffffff;
      });
      this.amountStepButtons.push({ delta, root, bg, txt });
      this.container.addChild(root);
    });

    // ── Chip buttons ──────────────────────────────────────────────────────
    const chipValues = [200, 400, 500, 1000];
    chipValues.forEach((value) => {
      const root = new Container();
      root.eventMode = "static";
      root.cursor = "pointer";
      const bg = new Graphics();
      root.addChild(bg);
      const txt = new Text({
        text: `+${value}`,
        style: new TextStyle({
          fontFamily: "Century Gothic",
          fontSize: 13,
          fill: 0xffffff,
          fontWeight: "bold",
        }),
      });
      txt.anchor.set(0.5, 0.5);
      root.addChild(txt);
      root.on("pointerdown", () => this._incrementAmount(value));
      root.on("pointerover", () => {
        bg.tint = 0x334155;
      });
      root.on("pointerout", () => {
        bg.tint = 0xffffff;
      });
      this.chipButtons.push({ value, root, bg, txt });
      this.container.addChild(root);
    });

    // ── Confirm button ────────────────────────────────────────────────────
    this.confirmBtn = new Container();
    this.confirmBtn.eventMode = "static";
    this.confirmBtn.cursor = "pointer";
    this.container.addChild(this.confirmBtn);
    this.confirmBg = new Graphics();
    this.confirmBtn.addChild(this.confirmBg);
    this.confirmTxt = new Text({
      text: "✓  Confirm Bet",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: 13,
        fill: 0x1a1a1a,
        fontWeight: "bold",
      }),
    });
    this.confirmTxt.anchor.set(0.5, 0.5);
    this.confirmBtn.addChild(this.confirmTxt);
    this.confirmBtn.on("pointerdown", () => this._handleConfirm());
    this.confirmBtn.on("pointerover", () => {
      this.confirmBg.tint = 0xfbbf24;
    });
    this.confirmBtn.on("pointerout", () => {
      this.confirmBg.tint = 0xffffff;
    });

    // ── Focus manager registration ─────────────────────────────────────────
    if (focusManager) {
      this.amountStepButtons.forEach((chip) => {
        focusManager.addItem(
          chip.root,
          () => this._incrementAmount(chip.delta),
          {
            group: "default",
            label: chip.delta > 0 ? "Increase amount" : "Decrease amount",
          },
        );
      });
      this.chipButtons.forEach((chip) => {
        focusManager.addItem(
          chip.root,
          () => this._incrementAmount(chip.value),
          {
            group: "default",
            label: `Add ${chip.value}`,
          },
        );
      });
      focusManager.addItem(this.confirmBtn, () => this._handleConfirm(), {
        group: "default",
        label: "Confirm bet",
      });
    }

    this.unsubscribe = this.ctx.subscribe((s) => this._updateState(s));
  }

  // ── Public API ────────────────────────────────────────────────────────────

  getSelectedNumbers(): number[] {
    return Array.from(this.selectedNumbers);
  }

  setEnabled(enabled: boolean) {
    this.enabled_ = enabled;
    const interactive = enabled && !this.submitting_;
    this.container.alpha = enabled ? 1 : 0.4;
    this.confirmBtn.eventMode = interactive ? "static" : "none";
    this.gridContainer.eventMode = interactive ? "static" : "none";
    this.amountStepButtons.forEach((b) => {
      b.root.eventMode = interactive ? "static" : "none";
    });
    this.chipButtons.forEach((b) => {
      b.root.eventMode = interactive ? "static" : "none";
    });
    if (this.amountInput) {
      // @pixi/ui Input does not have a built-in disabled prop — mask pointer events via its container
      this.amountInputContainer.eventMode = interactive ? "static" : "none";
      this.amountInputContainer.alpha = interactive ? 1 : 0.45;
    }
    this._refreshConfirmButton();
  }

  setSubmitting(submitting: boolean) {
    this.submitting_ = submitting;
    const interactive = this.enabled_ && !this.submitting_;
    this.confirmBtn.eventMode = interactive ? "static" : "none";
    this.gridContainer.eventMode = interactive ? "static" : "none";
    this.amountStepButtons.forEach((b) => {
      b.root.eventMode = interactive ? "static" : "none";
    });
    this.chipButtons.forEach((b) => {
      b.root.eventMode = interactive ? "static" : "none";
    });
    if (this.amountInput) {
      this.amountInputContainer.eventMode = interactive ? "static" : "none";
    }
    this._refreshConfirmButton();
  }

  setAmount(value: string) {
    if (this.amountInput) {
      // @pixi/ui Input exposes `value` as a setter
      (this.amountInput as any).value = value;
    }
    this.ctx.setAmount(value);
  }

  clearBetInput() {
    this.setAmount("");
    this.ctx.clear();
    this.selectedNumbers.clear();
    this._refreshCellHighlights();
    this._refreshSelectionBar();
  }

  focusAmountInput() {
    // @pixi/ui Input — programmatic focus
    try {
      (this.amountInput as any)?.focus?.();
    } catch {}
  }

  show(): void {
    this.container.visible = true;
    if (this.focusManager) this.focusManager.setActiveGroup("default");
  }

  hide(): void {
    this.setEnabled(false);
  }

  enable(): void {
    this.setEnabled(true);
  }

  isVisible(): boolean {
    return this.container.visible;
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  /**
   * repositionInput is a no-op now — the PixiJS Input lives inside the
   * container and moves with it automatically.
   */
  repositionInput(_panelX: number, _panelY: number) {
    /* no-op */
  }

  layout(panelX: number, panelY: number, panelW: number, panelH: number): void {
    this.panelW = panelW;
    this.panelH = panelH;
    this.container.x = panelX;
    this.container.y = panelY;

    const PAD = Math.round(panelW * 0.055);
    const cx = panelW / 2;

    // Background
    this.panelBg.clear();
    this.panelBg.roundRect(0, 0, panelW, panelH, 14);
    this.panelBg.fill({ color: 0x071530, alpha: 0.95 });
    this.panelBg.stroke({ color: 0x2a4a8a, width: 1.5 });

    let y = PAD;

    // Title
    this.titleTxt.style.fontSize = Math.max(10, Math.round(panelW * 0.035));
    this.titleTxt.x = cx;
    this.titleTxt.y = y + 7;
    y += 24;

    // Subtitle (recreated each layout call for simplicity)
    const subtitleTxt = new Text({
      text: "Tap numbers to select (multi-select allowed)",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: Math.max(8, Math.round(panelW * 0.022)),
        fill: 0x4a6a9a,
        align: "center",
      }),
    });
    subtitleTxt.anchor.set(0.5, 0);
    subtitleTxt.x = cx;
    subtitleTxt.y = y;
    this.container.addChild(subtitleTxt);
    y += subtitleTxt.height + 4;

    const div = new Graphics();
    div.moveTo(PAD, y);
    div.lineTo(panelW - PAD, y);
    div.stroke({ color: 0x2a4a8a, width: 1 });
    this.container.addChildAt(div, 1);
    y += 10;

    // ── Number grid ───────────────────────────────────────────────────────
    this.gridContainer.removeChildren();
    this.cells.clear();

    const numbers = this.segments;
    const COLS = Math.min(numbers.length, numbers.length <= 20 ? 7 : 9);
    const availW = panelW - PAD * 2;
    const cellGap = Math.round(availW * 0.022);
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

      const bg = new Graphics();
      bg.roundRect(0, 0, cellSize, cellSize, 4);
      bg.fill({ color: num.color });
      bg.stroke({ color: num.color, width: 1 });
      root.addChild(bg);

      const lbl = new Text({
        text: `${num.value}`,
        style: new TextStyle({
          fontFamily: "Century Gothic",
          fontSize: Math.max(8, Math.round(cellSize * 0.4)),
          fill: 0xffffff,
          fontWeight: "bold",
        }),
      });
      lbl.anchor.set(0.5, 0.5);
      lbl.x = cellSize / 2;
      lbl.y = cellSize / 2;
      root.addChild(lbl);

      root.on("pointerdown", () => this._toggleNumber(Number(num.value)));
      root.on("pointerover", () => {
        bg.alpha = 0.7;
      });
      root.on("pointerout", () => {
        bg.alpha = 1;
      });

      this.gridContainer.addChild(root);
      this.cells.set(num, { bg, root, cellSize });

      if (this.focusManager) {
        this.focusManager.addItem(
          root,
          () => this._toggleNumber(Number(num.value)),
          {
            group: "default",
            label: `Toggle ${num.value}`,
          },
        );
      }
    });

    y += ROWS * (cellSize + cellGap) + PAD * 0.7;

    // ── Selection bar ─────────────────────────────────────────────────────
    const selH = Math.round(panelH * 0.07);
    this.selectionBar.x = PAD;
    this.selectionBar.y = y;
    this.selectionBg.clear();
    this.selectionBg.roundRect(0, 0, panelW - PAD * 2, selH, 6);
    this.selectionBg.fill({ color: 0x112244 });
    this.selectionBg.stroke({ color: 0x334477, width: 1 });
    this.selectionTxt.style.fontSize = Math.max(12, Math.round(panelW * 0.032));
    this.selectionTxt.x = (panelW - PAD * 2) / 2;
    this.selectionTxt.y = selH / 2;
    y += selH + PAD * 0.6;

    // ── Amount input row (step− | [PixiJS Input] | step+) ─────────────────
    const inputH = Math.min(44, Math.max(36, Math.round(panelH * 0.095)));
    const stepGap = Math.max(10, Math.round(PAD * 0.5));
    const stepW = Math.max(40, Math.round(panelW * 0.1));
    const leftStepX = PAD;
    const rightStepX = panelW - PAD - stepW;
    const inputStartX = leftStepX + stepW + stepGap;
    const inputLogicalW = Math.max(120, rightStepX - stepGap - inputStartX);

    // Step buttons
    this.amountStepButtons.forEach((chip, i) => {
      const isMinus = i === 0;
      chip.root.x = isMinus ? leftStepX : rightStepX;
      chip.root.y = y;
      chip.root.zIndex = 15;
      chip.bg.clear();
      chip.bg.roundRect(0, 0, stepW, inputH, 8);
      chip.bg.fill({ color: 0x030712, alpha: 0.95 });
      chip.bg.stroke({ color: 0xeab308, width: 1.5, alpha: 0.95 });
      chip.txt.style.fontSize = Math.max(16, Math.round(inputH * 0.52));
      chip.txt.x = stepW / 2;
      chip.txt.y = inputH / 2;
    });

    // ── Native PixiJS Input ───────────────────────────────────────────────
    // Destroy old input if dimensions changed significantly
    if (this.amountInput) {
      this.amountInputContainer.removeChildren();
      // @pixi/ui Input does not have a .destroy(); remove from container is enough
      this.amountInput = null;
    }

    const fontSize = Math.max(13, Math.round(inputH * 0.4));

    /**
     * @pixi/ui Input constructor signature:
     *   new Input({ bg, textStyle, placeholder, value, padding, ... })
     *
     * The `bg` prop is a Graphics or Sprite used as the background.
     * The Input sizes itself to the bg dimensions.
     */
    const inputBg = new Graphics();
    inputBg.roundRect(0, 0, inputLogicalW, inputH, 8);
    inputBg.fill({ color: 0x0d1b3e });
    inputBg.stroke({ color: 0x334477, width: 1.5 });

    const inputBgFocus = new Graphics();
    inputBgFocus.roundRect(0, 0, inputLogicalW, inputH, 8);
    inputBgFocus.fill({ color: 0x0d1b3e });
    inputBgFocus.stroke({ color: 0xf59e0b, width: 2 });

    this.amountInput = new Input({
      bg: inputBg,
      textStyle: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize,
        fill: 0xffd700,
        fontWeight: "bold",
      }),

      padding: { top: 0, right: 16, bottom: 0, left: 16 },
      value: this.ctx.getState().amount,
    });

    // Listen for value changes
    this.amountInput.onChange.connect((value: string) => {
      // Filter to numeric input only
      const cleaned = value.replace(/[^0-9.]/g, "");
      if (cleaned !== value) {
        (this.amountInput as any).value = cleaned;
      }
      this.ctx.setAmount(cleaned);
      this._refreshSelectionBar();
    });

    this.amountInput.onEnter?.connect(() => {
      this.focusManager?.setInputActive(false);
    });
    (this.amountInput as any).on?.("focus", () => {
      this.focusManager?.setInputActive(true);
    });
    (this.amountInput as any).on?.("blur", () => {
      this.focusManager?.setInputActive(false);
    });

    this.amountInputContainer.addChild(this.amountInput);
    this.amountInputContainer.x = inputStartX;
    this.amountInputContainer.y = y;

    y += inputH + PAD * 0.35;

    // ── Chip buttons ──────────────────────────────────────────────────────
    const chipGap = Math.max(8, Math.round(PAD * 0.45));
    const chipH = Math.min(34, Math.max(28, Math.round(panelH * 0.075)));
    const chipW = Math.floor((panelW - PAD * 2 - chipGap * 3) / 4);
    const confirmBtnH = Math.min(42, Math.max(34, Math.round(panelH * 0.085)));
    const chipsY = y;
    this.chipButtons.forEach((chip, i) => {
      chip.root.visible = true;
      chip.root.eventMode =
        this.enabled_ && !this.submitting_ ? "static" : "none";
      chip.root.x = PAD + i * (chipW + chipGap);
      chip.root.y = chipsY;
      chip.root.zIndex = 15;
      chip.bg.clear();
      chip.bg.roundRect(0, 0, chipW, chipH, 6);
      chip.bg.fill({ color: 0x030712, alpha: 0.95 });
      chip.bg.stroke({ color: 0xeab308, width: 1.5, alpha: 0.95 });
      chip.txt.style.fontSize = Math.max(11, Math.round(chipH * 0.42));
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
    const btnH = confirmBtnH;
    const confirmW = panelW - PAD * 2;
    const minConfirmY = y;
    const confirmBottomInset = PAD + Math.max(8, Math.round(PAD * 0.35));
    const bottomAnchoredY = panelH - confirmBottomInset - btnH;

    this.confirmBtn.x = PAD;
    this.confirmBtn.y = Math.max(minConfirmY, bottomAnchoredY);
    this.confirmBg.clear();
    this.confirmBg.roundRect(0, 0, confirmW, btnH, btnH / 2);
    this.confirmBg.fill({ color: 0xf59e0b });
    this.confirmTxt.style.fontSize = Math.max(11, Math.round(btnH * 0.44));
    this.confirmTxt.x = confirmW / 2;
    this.confirmTxt.y = btnH / 2;

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

  private _toggleNumber(value: number) {
    if (this.selectedNumbers.has(value)) {
      this.selectedNumbers.delete(value);
    } else {
      this.selectedNumbers.add(value);
    }
    this._refreshCellHighlights();
    this._refreshSelectionBar();
  }

  private _refreshCellHighlights() {
    this.cells.forEach(({ bg, root, cellSize }, seg) => {
      const sel = this.selectedNumbers.has(Number(seg.value));
      bg.clear();
      bg.roundRect(0, 0, cellSize, cellSize, 4);
      bg.fill({ color: seg.color });
      if (sel) {
        bg.stroke({ color: 0x22c55e, width: 3 });
        bg.roundRect(2, 2, cellSize - 4, cellSize - 4, 4);
        bg.stroke({ color: 0x86efac, width: 1.5, alpha: 0.95 });
      } else {
        bg.stroke({ color: seg.color, width: 1 });
      }
      root.zIndex = sel ? 10 : 0;
    });
  }

  private _refreshSelectionBar() {
    const mW = this.panelW;
    const PAD = Math.round(mW * 0.055);
    const selW = mW - PAD * 2;
    const selH = Math.round(this.panelH * 0.07);

    if (this.selectedNumbers.size > 0) {
      const nums = Array.from(this.selectedNumbers)
        .sort((a, b) => a - b)
        .join(", ");
      const count = this.selectedNumbers.size;
      const amountPerNumber = parseFloat(this.ctx.getState().amount) || 0;
      const totalAmount = amountPerNumber * count;
      const numLine =
        count === 1 ? `Selected: ${nums}` : `Selected (${count}) `;
      const totalLine =
        amountPerNumber > 0
          ? `  |  Total bet: ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "";
      this.selectionTxt.text = numLine + totalLine;
      this.selectionTxt.style.fill = 0x86efac;
      this.selectionTxt.style.fontWeight = "bold";
      this.selectionTxt.style.fontSize = Math.max(
        10,
        Math.round(this.panelW * (count > 5 ? 0.026 : 0.034)),
      );
      this.selectionBg.clear();
      this.selectionBg.roundRect(0, 0, selW, selH, 6);
      this.selectionBg.fill({ color: 0x0a2218 });
      this.selectionBg.stroke({ color: 0x22c55e, width: 1.5 });
    } else {
      this.selectionTxt.text = "No numbers selected — tap to pick";
      this.selectionTxt.style.fill = 0x666688;
      this.selectionTxt.style.fontWeight = "normal";
      this.selectionTxt.style.fontSize = Math.max(
        12,
        Math.round(this.panelW * 0.032),
      );
      this.selectionBg.clear();
      this.selectionBg.roundRect(0, 0, selW, selH, 6);
      this.selectionBg.fill({ color: 0x112244 });
      this.selectionBg.stroke({ color: 0x334477, width: 1 });
    }
  }

  private _refreshConfirmButton() {
    const isBusy = this.submitting_;
    this.confirmTxt.text = isBusy ? "Confirming..." : "✓  Confirm Bet";
    this.confirmBg.alpha = isBusy ? 0.75 : 1;
  }

  private _handleConfirm() {
    if (!this.enabled_ || this.submitting_) return;
    if (this.selectedNumbers.size === 0) {
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
      if (current !== state.amount) {
        (this.amountInput as any).value = state.amount;
      }
    }
    this._refreshSelectionBar();
  }
}
