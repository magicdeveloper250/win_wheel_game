import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { DropShadowFilter } from "pixi-filters";
import type { PredictionContext, PredictionState } from "@/contexts/PredictionContext";
import type { FocusManager } from "@/managers/FocusManager";

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function numFill(n: number): number {
  if (n === 0) return 0x1a7a3a;
  return RED_NUMBERS.has(n) ? 0x9b1c1c : 0x1a1a2e;
}
function numStroke(n: number): number {
  if (n === 0) return 0x27ae60;
  return RED_NUMBERS.has(n) ? 0xc0392b : 0x444466;
}

export class PredictionModal {
  container: Container;
  private ctx: PredictionContext;
  private focusManager: FocusManager | null;
  private unsubscribe: (() => void) | null = null;

  onConfirm: (() => void) | null = null;

  // ── Stored layout values ─────────────────────────────────────────────────
  private modalW = 520;
  private modalH = 580;
  private inputX = 0;
  private inputY = 0;
  private inputW = 0;
  private inputH = 0;

  // Confirm button DOM overlay position (for TV tab nav)
  private confirmDomX = 0;
  private confirmDomY = 0;
  private confirmDomW = 0;
  private confirmDomH = 0;

  private backdrop: Graphics;
  private card: Container;
  private cardBg: Graphics;
  private titleTxt: Text;
  private subtitleTxt: Text;
  private gridContainer: Container;
  private cells: Map<number, { bg: Graphics; root: Container; cellSize: number }> = new Map();
  private selectionBar: Container;
  private selectionBg: Graphics;
  private selectionTxt: Text;

  // Amount input — real HTML input overlaid on the canvas
  private amountInputEl: HTMLInputElement | null = null;
  private amountInputWrapper: HTMLDivElement | null = null;

  // Transparent DOM button for TV Tab navigation to confirm
  private confirmDomBtn: HTMLButtonElement | null = null;

  private confirmBtn: Container;
  private confirmBg: Graphics;
  private confirmTxt: Text;

  private errorTxt: Text;

  private animFrame: number | null = null;
  private visible_ = false;

  private wheelNumbers: number[] = [];

  constructor(ctx: PredictionContext, focusManager: FocusManager | null = null) {
    this.ctx = ctx;
    this.focusManager = focusManager;
    this.container = new Container();
    this.container.visible = false;
    this.container.eventMode = "static";

    this.backdrop = new Graphics();
    this.backdrop.eventMode = "static";
    this.container.addChild(this.backdrop);

    this.card = new Container();
    this.card.filters = [
      new DropShadowFilter({ offset: { x: 0, y: 12 }, blur: 24, alpha: 0.85, color: 0x000000 }),
    ];
    this.container.addChild(this.card);

    this.cardBg = new Graphics();
    this.card.addChild(this.cardBg);

    this.titleTxt = new Text({
      text: "Place Your Bet",
      style: new TextStyle({ fontFamily: "Arial", fontSize: 20, fill: 0xffd700, fontWeight: "bold" }),
    });
    this.titleTxt.anchor.set(0.5, 0.5);
    this.card.addChild(this.titleTxt);

    this.subtitleTxt = new Text({
      text: "Pick a number and enter your bet amount",
      style: new TextStyle({ fontFamily: "Arial", fontSize: 12, fill: 0xaaccff, align: "center" }),
    });
    this.subtitleTxt.anchor.set(0.5, 0.5);
    this.card.addChild(this.subtitleTxt);

    this.gridContainer = new Container();
    this.card.addChild(this.gridContainer);

    this.selectionBar = new Container();
    this.card.addChild(this.selectionBar);
    this.selectionBg = new Graphics();
    this.selectionBar.addChild(this.selectionBg);
    this.selectionTxt = new Text({
      text: "No number selected",
      style: new TextStyle({ fontFamily: "Arial", fontSize: 13, fill: 0x888888, align: "center" }),
    });
    this.selectionTxt.anchor.set(0.5, 0.5);
    this.selectionBar.addChild(this.selectionTxt);

    this.errorTxt = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "Arial", fontSize: 11, fill: 0xff4444, align: "center" }),
    });
    this.errorTxt.anchor.set(0.5, 0.5);
    this.card.addChild(this.errorTxt);

    this.confirmBtn = new Container();
    this.confirmBtn.eventMode = "static";
    this.confirmBtn.cursor = "pointer";
    this.card.addChild(this.confirmBtn);
    this.confirmBg = new Graphics();
    this.confirmBtn.addChild(this.confirmBg);
    this.confirmTxt = new Text({
      text: "✓  Confirm Bet",
      style: new TextStyle({ fontFamily: "Arial", fontSize: 15, fill: 0x1a1a1a, fontWeight: "bold" }),
    });
    this.confirmTxt.anchor.set(0.5, 0.5);
    this.confirmBtn.addChild(this.confirmTxt);
    this.confirmBtn.on("pointerdown", () => this._handleConfirm());
    this.confirmBtn.on("pointerover", () => { this.confirmBg.tint = 0xfbbf24; });
    this.confirmBtn.on("pointerout",  () => { this.confirmBg.tint = 0xffffff; });

    if (focusManager) {
      focusManager.addItem(this.confirmBtn, () => this._handleConfirm(), { group: "modal", label: "Confirm bet" });
    }

    this.unsubscribe = this.ctx.subscribe((s) => this._updateState(s));
  }

  setWheelNumbers(numbers: number[]) {
    this.wheelNumbers = numbers;
  }

  private _handleConfirm() {
    const state = this.ctx.getState();
    if (state.selected === null) {
      this.errorTxt.text = "Please select a number first.";
      return;
    }
    const amt = parseFloat(state.amount);
    if (isNaN(amt) || amt <= 0) {
      this.errorTxt.text = "Please enter a valid bet amount.";
      return;
    }
    this.errorTxt.text = "";
    this.onConfirm?.();
  }

  // ── layout() ─────────────────────────────────────────────────────────────
  layout(W: number, H: number): void {
    if (this.visible_) {
      this._repositionInput();
      this._repositionConfirmDomBtn();
      return;
    }

    this.modalW = Math.min(520, Math.round(W * 0.88));
    this.modalH = Math.min(680, Math.round(H * 0.92));   // slightly taller to fit bigger input

    const mW  = this.modalW;
    const mH  = this.modalH;
    const PAD = Math.round(mW * 0.05);
    const cx  = mW / 2;
    const cardX = Math.round((W - mW) / 2);
    const cardY = Math.round((H - mH) / 2);

    // Backdrop
    this.backdrop.clear();
    this.backdrop.rect(0, 0, W, H);
    this.backdrop.fill({ color: 0x000000, alpha: 0.75 });

    this.card.x = cardX;
    this.card.y = cardY;
    this.card.scale.set(1);

    this.cardBg.clear();
    this.cardBg.roundRect(0, 0, mW, mH, 18);
    this.cardBg.fill({ color: 0x0a1f4a, alpha: 0.98 });
    this.cardBg.stroke({ color: 0x6c3483, width: 2 });

    let y = 28;

    // Title
    this.titleTxt.style.fontSize = Math.max(14, Math.round(mW * 0.044));
    this.titleTxt.x = cx;
    this.titleTxt.y = y;
    y += 32;

    // Subtitle
    this.subtitleTxt.style.fontSize = Math.max(10, Math.round(mW * 0.026));
    this.subtitleTxt.x = cx;
    this.subtitleTxt.y = y;
    y += 26;

    // Number grid
    this.gridContainer.removeChildren();
    this.cells.clear();

    const numbers  = this.wheelNumbers.length > 0 ? this.wheelNumbers : [];
    const COLS     = 7;
    const availW   = mW - PAD * 2;
    const cellGap  = Math.round(availW * 0.025);
    const cellSize = Math.round((availW - cellGap * (COLS - 1)) / COLS);
    const ROWS     = Math.ceil(numbers.length / COLS);

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
      bg.roundRect(0, 0, cellSize, cellSize, 5);
      bg.fill({ color: numFill(num) });
      bg.stroke({ color: numStroke(num), width: 1.5 });
      root.addChild(bg);

      const lbl = new Text({
        text: `${num}`,
        style: new TextStyle({
          fontFamily: "Arial",
          fontSize: Math.max(9, Math.round(cellSize * 0.38)),
          fill: 0xffffff,
          fontWeight: "bold",
        }),
      });
      lbl.anchor.set(0.5, 0.5);
      lbl.x = cellSize / 2;
      lbl.y = cellSize / 2;
      root.addChild(lbl);

      root.on("pointerdown", () => this.ctx.select(num));
      root.on("pointerover", () => { bg.alpha = 0.7; });
      root.on("pointerout",  () => { bg.alpha = 1; });

      this.gridContainer.addChild(root);
      this.cells.set(num, { bg, root, cellSize });

      if (this.focusManager) {
        this.focusManager.addItem(root, () => this.ctx.select(num), { group: "modal", label: `Pick ${num}` });
      }
    });

    y += ROWS * (cellSize + cellGap) + PAD;

    // Selection bar
    const selH = Math.round(mH * 0.065);
    this.selectionBar.x = PAD;
    this.selectionBar.y = y;
    this.selectionBg.clear();
    this.selectionBg.roundRect(0, 0, mW - PAD * 2, selH, 8);
    this.selectionBg.fill({ color: 0x112244 });
    this.selectionBg.stroke({ color: 0x334477, width: 1 });
    this.selectionTxt.style.fontSize = Math.max(11, Math.round(mW * 0.028));
    this.selectionTxt.x = (mW - PAD * 2) / 2;
    this.selectionTxt.y = selH / 2;
    y += selH + PAD;

    // ── HTML amount input — larger height for TV ──────────────────────────
    const inputH = Math.round(mH * 0.115);   // was 0.075 — ~53% taller
    this.inputX = cardX + PAD;
    this.inputY = cardY + y;
    this.inputW = mW - PAD * 2;
    this.inputH = inputH;
    this._createOrUpdateInput();
    y += inputH + Math.round(PAD * 0.6);

    // Error text
    this.errorTxt.style.fontSize = Math.max(10, Math.round(mW * 0.024));
    this.errorTxt.x = cx;
    this.errorTxt.y = y;
    y += 22;

    // Confirm button (PixiJS visual)
    const btnH     = Math.round(mH * 0.09);
    const confirmW = mW - PAD * 2;

    this.confirmBtn.x = PAD;
    this.confirmBtn.y = y;
    this.confirmBg.clear();
    this.confirmBg.roundRect(0, 0, confirmW, btnH, btnH / 2);
    this.confirmBg.fill({ color: 0xf59e0b });
    this.confirmTxt.style.fontSize = Math.max(12, Math.round(btnH * 0.44));
    this.confirmTxt.x = confirmW / 2;
    this.confirmTxt.y = btnH / 2;

    // Store confirm button DOM overlay coords
    this.confirmDomX = cardX + PAD;
    this.confirmDomY = cardY + y;
    this.confirmDomW = confirmW;
    this.confirmDomH = btnH;
    this._createOrUpdateConfirmDomBtn();
  }

  // ── HTML input helpers ───────────────────────────────────────────────────

  private _createOrUpdateInput() {
    if (!this.amountInputWrapper) {
      const wrapper = document.createElement("div");
      wrapper.style.cssText = `
        position: fixed;
        z-index: 9999;
        display: none;
        flex-direction: column;
        gap: 6px;
        pointer-events: auto;
      `;

      const label = document.createElement("label");
      label.textContent = "Bet Amount";
      label.style.cssText = `
        color: #aaccff;
        font-family: Arial, sans-serif;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      `;

      const spinnerStyle = document.createElement("style");
      spinnerStyle.textContent = `
        .bet-input::-webkit-inner-spin-button,
        .bet-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .bet-input { -moz-appearance: textfield; }
        .bet-input:focus { outline: none; border-color: #f59e0b !important; box-shadow: 0 0 0 3px rgba(245,158,11,0.35); }
      `;
      document.head.appendChild(spinnerStyle);

      const input = document.createElement("input");
      input.type        = "number";
      input.min         = "0";
      input.step        = "0.01";
      input.placeholder = "Enter amount…";
      input.className   = "bet-input";
      input.tabIndex    = 1;   // Tab order slot 1 — first tabbable element in modal
      input.style.cssText = `
        background: #0d1b3e;
        color: #ffd700;
        border: 2px solid #334477;
        border-radius: 10px;
        padding: 0 18px;
        font-family: Arial, monospace;
        font-size: 22px;
        font-weight: bold;
        outline: none;
        width: 100%;
        box-sizing: border-box;
        transition: border-color 0.15s, box-shadow 0.15s;
        caret-color: #f59e0b;
      `;

      input.addEventListener("input", () => { this.ctx.setAmount(input.value); });

      // Block keyboard events from leaking to canvas / FocusManager,
      // but allow Tab so the browser can move focus to the confirm button
      input.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key !== "Tab") e.stopPropagation();
      });
      input.addEventListener("keyup",    (e: KeyboardEvent) => { if (e.key !== "Tab") e.stopPropagation(); });
      input.addEventListener("keypress", (e: KeyboardEvent) => { if (e.key !== "Tab") e.stopPropagation(); });

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      document.body.appendChild(wrapper);

      this.amountInputWrapper = wrapper;
      this.amountInputEl = input;
    }

    this._repositionInput();
  }

  private _repositionInput() {
    if (!this.amountInputWrapper || !this.amountInputEl) return;

    const wrapper = this.amountInputWrapper;
    const input   = this.amountInputEl;
    const labelEl = wrapper.querySelector("label") as HTMLLabelElement | null;

    wrapper.style.left  = `${this.inputX}px`;
    wrapper.style.top   = `${this.inputY}px`;
    wrapper.style.width = `${this.inputW}px`;

    const labelH = 20;
    const inputH = this.inputH - labelH - 6;
    if (labelEl) labelEl.style.fontSize = `${Math.max(11, Math.round(this.inputW * 0.028))}px`;
    input.style.height   = `${inputH}px`;
    input.style.fontSize = `${Math.max(16, Math.round(inputH * 0.42))}px`;
  }

  // ── Transparent DOM confirm button — enables Tab focus for TV ────────────

  private _createOrUpdateConfirmDomBtn() {
    if (!this.confirmDomBtn) {
      const btn = document.createElement("button");
      btn.tabIndex = 2;   // Tab order slot 2 — second stop after the amount input
      btn.setAttribute("aria-label", "Confirm Bet");
      btn.style.cssText = `
        position: fixed;
        z-index: 9999;
        display: none;
        background: transparent;
        border: none;
        cursor: pointer;
        border-radius: 999px;
        outline: none;
      `;

      // Highlight the PixiJS confirm button when this DOM button is focused
      btn.addEventListener("focus", () => {
        this.confirmBg.tint = 0xfbbf24;
        // Draw a visible focus ring via box-shadow so TV users get feedback
        btn.style.boxShadow = "0 0 0 4px rgba(245,158,11,0.7)";
      });
      btn.addEventListener("blur", () => {
        this.confirmBg.tint = 0xffffff;
        btn.style.boxShadow = "none";
      });

      // Pointer events mirror the PixiJS button's hover tint
      btn.addEventListener("pointerover", () => { this.confirmBg.tint = 0xfbbf24; });
      btn.addEventListener("pointerout",  () => { this.confirmBg.tint = 0xffffff; });

      // Trigger confirm on click or Enter/Space (TV remote select key)
      btn.addEventListener("click", () => this._handleConfirm());
      btn.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this._handleConfirm();
        }
        // Allow Tab to propagate so focus can cycle naturally
      });

      document.body.appendChild(btn);
      this.confirmDomBtn = btn;
    }

    this._repositionConfirmDomBtn();
  }

  private _repositionConfirmDomBtn() {
    if (!this.confirmDomBtn) return;
    const btn = this.confirmDomBtn;
    btn.style.left   = `${this.confirmDomX}px`;
    btn.style.top    = `${this.confirmDomY}px`;
    btn.style.width  = `${this.confirmDomW}px`;
    btn.style.height = `${this.confirmDomH}px`;
  }

  clearBetInput() {
    if (this.amountInputEl) this.amountInputEl.value = "";
    this.ctx.setAmount("");
    this.ctx.clear();
  }

  // ── _updateState — ONLY redraws selection highlights ────────────────────
  private _updateState(state: PredictionState): void {
    this.cells.forEach(({ bg, root, cellSize }, num) => {
      const sel = state.selected === num;
      bg.clear();
      bg.roundRect(0, 0, cellSize, cellSize, 5);
      bg.fill({ color: numFill(num) });
      bg.stroke({ color: sel ? 0xffd700 : numStroke(num), width: sel ? 3 : 1.5 });
      root.zIndex = sel ? 10 : 0;
    });

    const mW  = this.modalW;
    const mH  = this.modalH;
    const PAD = Math.round(mW * 0.05);
    const selW = mW - PAD * 2;
    const selH = Math.round(mH * 0.065);

    if (state.selected !== null) {
      this.selectionTxt.text = `Selected: ${state.selected}`;
      this.selectionTxt.style.fill = 0xffd700;
      this.selectionBg.clear();
      this.selectionBg.roundRect(0, 0, selW, selH, 8);
      this.selectionBg.fill({ color: 0x1a3a0a });
      this.selectionBg.stroke({ color: 0x7cfc00, width: 1.5 });
    } else {
      this.selectionTxt.text = "No number selected — tap a number above";
      this.selectionTxt.style.fill = 0x666688;
      this.selectionBg.clear();
      this.selectionBg.roundRect(0, 0, selW, selH, 8);
      this.selectionBg.fill({ color: 0x112244 });
      this.selectionBg.stroke({ color: 0x334477, width: 1 });
    }
  }

  show(): void {
    if (this.amountInputEl) {
      this.amountInputEl.value = this.ctx.getState().amount ?? "";
    }
    if (this.amountInputWrapper) this.amountInputWrapper.style.display = "flex";
    if (this.confirmDomBtn)      this.confirmDomBtn.style.display      = "block";

    if (this.animFrame !== null) { cancelAnimationFrame(this.animFrame); this.animFrame = null; }

    this.container.visible = true;
    this.container.alpha = 0;
    this.card.scale.set(1);
    if (this.focusManager) this.focusManager.setActiveGroup("modal");

    const start = performance.now();
    const animIn = (now: number) => {
      const t    = Math.min(1, (now - start) / 220);
      const ease = 1 - Math.pow(1 - t, 3);
      this.container.alpha = ease;
      if (t < 1) {
        this.animFrame = requestAnimationFrame(animIn);
      } else {
        this.animFrame = null;
        this.visible_ = true;
        this.amountInputEl?.focus();
      }
    };
    this.animFrame = requestAnimationFrame(animIn);
  }

  hide(): void {
    if (this.amountInputWrapper) this.amountInputWrapper.style.display = "none";
    if (this.confirmDomBtn)      this.confirmDomBtn.style.display      = "none";
    this.amountInputEl?.blur();

    if (!this.container.visible) return;
    if (this.animFrame !== null) { cancelAnimationFrame(this.animFrame); this.animFrame = null; }
    if (this.focusManager) this.focusManager.setActiveGroup("default");

    this.visible_ = false;

    const start = performance.now();
    const animOut = (now: number) => {
      const t = Math.min(1, (now - start) / 180);
      this.container.alpha = 1 - t;
      if (t < 1) {
        this.animFrame = requestAnimationFrame(animOut);
      } else {
        this.animFrame = null;
        this.container.visible = false;
        this.container.alpha = 1;
      }
    };
    this.animFrame = requestAnimationFrame(animOut);
  }

  isVisible(): boolean { return this.visible_; }

  destroy(): void {
    this.unsubscribe?.();
    if (this.animFrame !== null) cancelAnimationFrame(this.animFrame);
    if (this.amountInputWrapper) {
      document.body.removeChild(this.amountInputWrapper);
      this.amountInputWrapper = null;
      this.amountInputEl = null;
    }
    if (this.confirmDomBtn) {
      document.body.removeChild(this.confirmDomBtn);
      this.confirmDomBtn = null;
    }
    this.container.destroy({ children: true });
  }
}