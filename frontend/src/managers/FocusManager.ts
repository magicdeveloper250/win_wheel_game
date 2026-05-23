import { Container, Graphics, Application } from "pixi.js";
import { audioManager } from "./AudioManager";

const KEY_ENTER = [13, 32, 179, 85, 23];
const KEY_UP    = [38, 19];
const KEY_DOWN  = [40, 20];
const KEY_LEFT  = [37, 21];
const KEY_RIGHT = [39, 22];
const KEY_BACK  = [8, 27, 166, 461];

let _tapNoteIdx = 0;

function playTapNote(): void {
  audioManager.playTap();
  _tapNoteIdx++;
}

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
  private ringPad   = 6;
  private ringColor = 0xffd700;
  private ringWidth = 3;
  private _inputActive    = false;
  private _suppressRingHide = false;

  constructor(app: Application) {
    this.focusRing         = new Graphics();
    this.focusRing.visible = false;
    this.focusRing.zIndex  = 9999;
    app.stage.addChild(this.focusRing);

    this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener("keydown", this.keyHandler);
    window.addEventListener("mousemove",   this.hideRingOnMouse, { passive: true });
    window.addEventListener("touchstart",  this.hideRingOnMouse, { passive: true });
  }

  private hideRingOnMouse = (): void => {
    if (this._suppressRingHide) return;
    this.focusRing.visible = false;
  };

  addItem(container: Container, onActivate: () => void, options: FocusOptions = {}): void {
    const item: FocusItem = {
      container,
      onActivate,
      group:    options.group    ?? "default",
      label:    options.label    ?? "button",
      disabled: options.disabled ?? false,
    };
    this.items.push(item);

    container.on("pointerdown", () => {
      const idx = this.items.indexOf(item);
      if (idx !== -1) {
        // BUG FIX 3: pass showRing=true so tapping an item draws the ring
        this.setFocus(idx, true);
        playTapNote();
      }
    });
  }

  setInputActive(active: boolean): void {
    this._inputActive = active;
  }

  setActiveGroup(group: string, autoFocusFirst = false): void {
    this.activeGroup = group;
    if (autoFocusFirst) {
      const first = this.items.findIndex((it) => it.group === group && !it.disabled);
      if (first !== -1) this.setFocus(first, true);
      else {
        this.focusedIndex      = -1;
        this.focusRing.visible = false;
      }
    }
  }

  setDisabled(container: Container, disabled: boolean): void {
    const item = this.items.find((it) => it.container === container);
    if (item) {
      item.disabled      = disabled;
      item.container.alpha = disabled ? 0.4 : 1;
    }
  }

  removeItem(container: Container): void {
    const idx = this.items.findIndex((it) => it.container === container);
    if (idx === -1) return;

    this.items.splice(idx, 1);

    if (this.focusedIndex === idx) {
      // BUG FIX 2: always reset when the focused item is removed
      this.focusedIndex      = -1;
      this.focusRing.visible = false;
    } else if (this.focusedIndex > idx) {
      this.focusedIndex--;
    }
  }

  clearAll(): void {
    this.items             = [];
    this.focusedIndex      = -1;
    this.focusRing.visible = false;
    this.activeGroup       = "default";
    // BUG FIX 5: reset _inputActive so keyboard is never permanently blocked
    this._inputActive      = false;
  }

  focusFirst(): void {
    const idx = this.items.findIndex((it) => it.group === this.activeGroup && !it.disabled);
    if (idx !== -1) this.setFocus(idx, false);
  }

  private onKey(e: KeyboardEvent): void {
    if (this._inputActive) return;
    const code = e.keyCode;

    if (code === 9) {
      e.preventDefault();
      const groupItems = this.items
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) =>
          item.group === this.activeGroup &&
          !item.disabled &&
          item.container.visible,
        );

      if (groupItems.length === 0) return;

      const reverse         = e.shiftKey;
      const currentGroupPos = groupItems.findIndex(({ idx }) => idx === this.focusedIndex);

      let nextGroupPos: number;
      if (currentGroupPos === -1) {
        nextGroupPos = reverse ? groupItems.length - 1 : 0;
      } else {
        nextGroupPos = reverse
          ? (currentGroupPos - 1 + groupItems.length) % groupItems.length
          : (currentGroupPos + 1) % groupItems.length;
      }

      this.setFocus(groupItems[nextGroupPos].idx, true);
      playTapNote();
      return;
    }

    if (KEY_BACK.includes(code)) {
      e.preventDefault();
      if (this.activeGroup !== "default") {
        this.setActiveGroup("default", true);
      }
      return;
    }

    if (KEY_ENTER.includes(code)) {
      e.preventDefault();
      if (this.focusedIndex >= 0) {
        const item = this.items[this.focusedIndex];
        if (item && !item.disabled) {
          this.flashRing();
          playTapNote();
          item.onActivate();
        }
      } else {
        this.focusFirst();
        this.focusRing.visible = true;
      }
      return;
    }

    let dx = 0, dy = 0;
    if (KEY_UP.includes(code))    { e.preventDefault(); dy = -1; }
    if (KEY_DOWN.includes(code))  { e.preventDefault(); dy = +1; }
    if (KEY_LEFT.includes(code))  { e.preventDefault(); dx = -1; }
    if (KEY_RIGHT.includes(code)) { e.preventDefault(); dx = +1; }
    if (dx === 0 && dy === 0) return;

    this.focusRing.visible = true;

    if (this.focusedIndex < 0) {
      this.focusFirst();
      return;
    }

    const current    = this.items[this.focusedIndex];
    const currentPos = this.getWorldCenter(current.container);

    let bestIdx   = -1;
    let bestScore = Infinity;

    this.items.forEach((item, idx) => {
      if (idx === this.focusedIndex)        return;
      if (item.group !== this.activeGroup)  return;
      if (item.disabled)                    return;
      if (!item.container.visible)          return;

      const pos  = this.getWorldCenter(item.container);
      const relX = pos.x - currentPos.x;
      const relY = pos.y - currentPos.y;

      const dot = relX * dx + relY * dy;
      // BUG FIX 4: use `< 0` instead of `<= 0` so items perfectly perpendicular
      // on the axis are not incorrectly excluded
      if (dot < 0) return;

      const perpendicular = Math.abs(relX * dy - relY * dx);
      const score         = dot + perpendicular * 2.5;

      if (score < bestScore) {
        bestScore = score;
        bestIdx   = idx;
      }
    });

    if (bestIdx !== -1) {
      this.setFocus(bestIdx, true);
      playTapNote();
    }
  }

  private setFocus(idx: number, showRing: boolean): void {
    this.focusedIndex = idx;
    if (idx >= 0 && this.items[idx]) {
      this._suppressRingHide = true;
      requestAnimationFrame(() => { this._suppressRingHide = false; });
      if (showRing) {
        this.focusRing.visible = true;
        this.drawRing(this.items[idx].container);
      }
    }
  }

  private drawRing(container: Container): void {
    const bounds = container.getBounds();
    const p      = this.ringPad;
    this.focusRing.clear();
    this.focusRing.roundRect(
      bounds.x - p,
      bounds.y - p,
      bounds.width  + p * 2,
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
    // BUG FIX 1: first timeout was also setting white — fixed to be a no-op gap
    this.focusRing.tint = 0xffffff;
    setTimeout(() => {
      this.focusRing.tint = 0xffd700;
    }, 120);
  }

  tick(): void {
    if (this.focusRing.visible && this.focusedIndex >= 0 && this.items[this.focusedIndex]) {
      this.drawRing(this.items[this.focusedIndex].container);
    }
  }

  private getWorldCenter(container: Container): { x: number; y: number } {
    const bounds = container.getBounds();
    return {
      x: bounds.x + bounds.width  / 2,
      y: bounds.y + bounds.height / 2,
    };
  }

  destroy(): void {
    window.removeEventListener("keydown",     this.keyHandler);
    window.removeEventListener("mousemove",   this.hideRingOnMouse);
    window.removeEventListener("touchstart",  this.hideRingOnMouse);
    this.focusRing.destroy();
    this.items = [];
  }
}