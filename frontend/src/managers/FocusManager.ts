// managers/FocusManager.ts
// Keyboard / TV remote spatial navigation for PixiJS.
//
// How it works:
//  1. Register focusable items with addItem(container, onActivate, options)
//  2. Arrow keys move focus to the nearest neighbour in that direction
//  3. Enter / Space / TV OK (keyCode 13 / 32 / 179) activates the focused item
//  4. A gold focus ring is drawn around the focused item
//  5. Groups let you trap focus (e.g. overlay open → only overlay buttons reachable)
//  6. Call destroy() on scene rebuild to remove all listeners

import { Container, Graphics, Application } from "pixi.js";

// TV remote keycodes (Samsung Tizen, LG WebOS, Android TV, Roku)
const KEY_ENTER = [13, 32, 179, 85, 23]; // Enter, Space, Play/OK, LG OK, Android OK
const KEY_UP = [38, 19]; // ArrowUp, Android DPad Up
const KEY_DOWN = [40, 20]; // ArrowDown, Android DPad Down
const KEY_LEFT = [37, 21]; // ArrowLeft, Android DPad Left
const KEY_RIGHT = [39, 22]; // ArrowRight, Android DPad Right
const KEY_BACK = [8, 27, 166, 461]; // Backspace, Escape, LG Back, WebOS Back

export interface FocusItem {
  container: Container;
  onActivate: () => void;
  group: string;
  label: string;
  disabled?: boolean;
}

export interface FocusOptions {
  group?: string;
  label?: string;
  disabled?: boolean;
}

export class FocusManager {
  private items: FocusItem[] = [];
  private focusedIndex: number = -1;
  private focusRing: Graphics;
  private activeGroup: string = "default";
  private keyHandler: (e: KeyboardEvent) => void;
  private ringPad = 6;
  private ringColor = 0xffd700;
  private ringWidth = 3;
  private _inputActive = false;
  constructor(app: Application) {
    this.focusRing = new Graphics();
    this.focusRing.visible = false;
    this.focusRing.zIndex = 9999;
    app.stage.addChild(this.focusRing);

    this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener("keydown", this.keyHandler);

    window.addEventListener("mousemove", this.hideRingOnMouse, {
      passive: true,
    });
    window.addEventListener("touchstart", this.hideRingOnMouse, {
      passive: true,
    });
  }

  private _suppressRingHide = false;

  private hideRingOnMouse = () => {
    if (this._suppressRingHide) return;
    this.focusRing.visible = false;
  };
  // Register a focusable button
  addItem(
    container: Container,
    onActivate: () => void,
    options: FocusOptions = {},
  ): void {
    const item: FocusItem = {
      container,
      onActivate,
      group: options.group ?? "default",
      label: options.label ?? "button",
      disabled: options.disabled ?? false,
    };
    this.items.push(item);

    container.on("pointerdown", () => {
      const idx = this.items.indexOf(item);
      if (idx !== -1) this.setFocus(idx, false);
    });
  }
  setInputActive(active: boolean): void {
    this._inputActive = active;
  }

  setActiveGroup(group: string, autoFocusFirst = false): void {
    this.activeGroup = group;
    if (autoFocusFirst) {
      const first = this.items.findIndex(
        (it) => it.group === group && !it.disabled,
      );
      if (first !== -1) this.setFocus(first, true);
      else {
        this.focusedIndex = -1;
        this.focusRing.visible = false;
      }
    }
  }

  setDisabled(container: Container, disabled: boolean): void {
    const item = this.items.find((it) => it.container === container);
    if (item) {
      item.disabled = disabled;
      item.container.alpha = disabled ? 0.4 : 1;
    }
  }

  removeItem(container: Container): void {
    const idx = this.items.findIndex((it) => it.container === container);
    if (idx !== -1) {
      this.items.splice(idx, 1);
      if (this.focusedIndex === idx) {
        this.focusedIndex = -1;
        this.focusRing.visible = false;
      } else if (this.focusedIndex > idx) {
        this.focusedIndex--;
      }
    }
  }

  clearAll(): void {
    this.items = [];
    this.focusedIndex = -1;
    this.focusRing.visible = false;
    this.activeGroup = "default";
  }

  focusFirst(): void {
    const idx = this.items.findIndex(
      (it) => it.group === this.activeGroup && !it.disabled,
    );
    if (idx !== -1) this.setFocus(idx, false);
  }

  private onKey(e: KeyboardEvent): void {
    if (this._inputActive) return;
    const code = e.keyCode;

    if (code === 9) {
      e.preventDefault();
      const groupItems = this.items
        .map((item, idx) => ({ item, idx }))
        .filter(
          ({ item }) =>
            item.group === this.activeGroup &&
            !item.disabled &&
            item.container.visible,
        );

      if (groupItems.length === 0) return;

      const reverse = e.shiftKey;
      const currentGroupPos = groupItems.findIndex(
        ({ idx }) => idx === this.focusedIndex,
      );

      let nextGroupPos: number;
      if (currentGroupPos === -1) {
        nextGroupPos = reverse ? groupItems.length - 1 : 0;
      } else {
        nextGroupPos = reverse
          ? (currentGroupPos - 1 + groupItems.length) % groupItems.length
          : (currentGroupPos + 1) % groupItems.length;
      }

      this.setFocus(groupItems[nextGroupPos].idx, true);
      return;
    }

    // ── Back / Escape ─────────────────────────────────────────────────────────
    if (KEY_BACK.includes(code)) {
      e.preventDefault();
      if (this.activeGroup !== "default") {
        this.setActiveGroup("default", true);
      }
      return;
    }

    // ── Enter / OK ────────────────────────────────────────────────────────────
    if (KEY_ENTER.includes(code)) {
      e.preventDefault();
      if (this.focusedIndex >= 0) {
        const item = this.items[this.focusedIndex];
        if (item && !item.disabled) {
          this.flashRing();
          item.onActivate();
        }
      } else {
        this.focusFirst();
        this.focusRing.visible = true;
      }
      return;
    }

    // ── Arrow keys ────────────────────────────────────────────────────────────
    let dx = 0,
      dy = 0;
    if (KEY_UP.includes(code)) {
      e.preventDefault();
      dy = -1;
    }
    if (KEY_DOWN.includes(code)) {
      e.preventDefault();
      dy = +1;
    }
    if (KEY_LEFT.includes(code)) {
      e.preventDefault();
      dx = -1;
    }
    if (KEY_RIGHT.includes(code)) {
      e.preventDefault();
      dx = +1;
    }

    if (dx === 0 && dy === 0) return;

    // Show ring on first arrow key press
    this.focusRing.visible = true;

    if (this.focusedIndex < 0) {
      this.focusFirst();
      return;
    }

    const current = this.items[this.focusedIndex];
    const currentPos = this.getWorldCenter(current.container);

    // Find best candidate in the pressed direction
    let bestIdx = -1;
    let bestScore = Infinity;

    this.items.forEach((item, idx) => {
      if (idx === this.focusedIndex) return;
      if (item.group !== this.activeGroup) return;
      if (item.disabled) return;
      if (!item.container.visible) return;

      const pos = this.getWorldCenter(item.container);
      const relX = pos.x - currentPos.x;
      const relY = pos.y - currentPos.y;

      // Must be in the right half-plane for this direction
      const dot = relX * dx + relY * dy;
      if (dot <= 0) return;

      // Score = distance penalised by perpendicular offset
      // (strongly prefer items that are directly in line)
      const perpendicular = Math.abs(relX * dy - relY * dx);
      const parallel = dot;
      const score = parallel + perpendicular * 2.5;

      if (score < bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    if (bestIdx !== -1) this.setFocus(bestIdx, true);
  }

  private setFocus(idx: number, showRing: boolean): void {
    this.focusedIndex = idx;
    if (idx >= 0 && this.items[idx]) {
      this._suppressRingHide = true;
      requestAnimationFrame(() => {
        this._suppressRingHide = false;
      });
      if (showRing) {
        this.focusRing.visible = true;
        this.drawRing(this.items[idx].container);
      }
    }
  }

  private drawRing(container: Container): void {
    const bounds = container.getBounds();
    const p = this.ringPad;
    this.focusRing.clear();
    this.focusRing.roundRect(
      bounds.x - p,
      bounds.y - p,
      bounds.width + p * 2,
      bounds.height + p * 2,
      12,
    );
    this.focusRing.stroke({ color: this.ringColor, width: this.ringWidth });
  }

  private flashRing(): void {
    this.focusRing.visible = true;
    if (this.focusedIndex >= 0) {
      this.drawRing(this.items[this.focusedIndex].container);
    }
    // Brief white flash then back to gold
    this.focusRing.tint = 0xffffff;
    setTimeout(() => {
      this.focusRing.tint = 0xffffff;
    }, 60);
    setTimeout(() => {
      this.focusRing.tint = 0xffd700;
    }, 120);
  }

  // Update ring position every frame if focused item might have moved
  tick(): void {
    if (
      this.focusRing.visible &&
      this.focusedIndex >= 0 &&
      this.items[this.focusedIndex]
    ) {
      this.drawRing(this.items[this.focusedIndex].container);
    }
  }

  private getWorldCenter(container: Container): { x: number; y: number } {
    const bounds = container.getBounds();
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    };
  }

  destroy(): void {
    window.removeEventListener("keydown", this.keyHandler);
    window.removeEventListener("mousemove", this.hideRingOnMouse);
    window.removeEventListener("touchstart", this.hideRingOnMouse);
    this.focusRing.destroy();
    this.items = [];
  }
}
