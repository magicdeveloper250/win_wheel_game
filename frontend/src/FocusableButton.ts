// widgets/FocusableButton.ts
// Reusable PixiJS button with full interaction states:
// normal → hover → focused (keyboard) → pressed → disabled
// Works with mouse, touch, and TV remote via FocusManager

import { Container, Graphics, Text, TextStyle } from "pixi.js";

export interface ButtonStyle {
  width: number;
  height: number;
  radius?: number;
  fillColor: number;
  fillAlpha?: number;
  strokeColor?: number;
  strokeWidth?: number;
  hoverFill?: number;
  pressedFill?: number;
  disabledAlpha?: number;
  focusStrokeColor?: number;   // ring drawn by FocusManager — not internal
  label: string;
  fontSize: number;
  fontColor?: number;
  fontWeight?: string;
  icon?: string;               // prepended to label with space
}

export interface ButtonState {
  focused: boolean;
  hovered: boolean;
  pressed: boolean;
  disabled: boolean;
}

export class FocusableButton {
  container: Container;
  private bg: Graphics;
  private focusBorder: Graphics;  // internal focus indicator (inner glow)
  private txt: Text;
  private style: ButtonStyle;
  private state: ButtonState = {
    focused: false,
    hovered: false,
    pressed: false,
    disabled: false,
  };
  private onActivate: (() => void) | null = null;

  constructor(style: ButtonStyle) {
    this.style = style;
    this.container = new Container();
    this.container.eventMode = "static";
    this.container.cursor = "pointer";

    // Background
    this.bg = new Graphics();
    this.container.addChild(this.bg);

    // Inner focus glow border (shown when keyboard-focused)
    this.focusBorder = new Graphics();
    this.container.addChild(this.focusBorder);

    // Label
    const label = style.icon ? `${style.icon}  ${style.label}` : style.label;
    this.txt = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: "Arial, sans-serif",
        fontSize: style.fontSize,
        fill: style.fontColor ?? 0xffffff,
        fontWeight: (style.fontWeight ?? "bold") as any,
        align: "center",
      }),
    });
    this.txt.anchor.set(0.5, 0.5);
    this.txt.x = 0;
    this.txt.y = 0;
    this.container.addChild(this.txt);

    this.draw();
    this.bindEvents();
  }

  setActivateCallback(cb: () => void): this {
    this.onActivate = cb;
    return this;
  }

  setDisabled(val: boolean): this {
    this.state.disabled = val;
    this.container.cursor = val ? "default" : "pointer";
    this.draw();
    return this;
  }

  setFocused(val: boolean): this {
    this.state.focused = val;
    this.draw();
    return this;
  }

  setLabel(label: string): this {
    const full = this.style.icon ? `${this.style.icon}  ${label}` : label;
    this.txt.text = full;
    return this;
  }

  setFillColor(color: number): this {
    this.style.fillColor = color;
    this.draw();
    return this;
  }

  resize(width: number, height: number, fontSize?: number): this {
    this.style.width = width;
    this.style.height = height;
    if (fontSize) {
      this.style.fontSize = fontSize;
      this.txt.style.fontSize = fontSize;
    }
    this.draw();
    return this;
  }

  private draw(): void {
    const s = this.style;
    const st = this.state;
    const w = s.width;
    const h = s.height;
    const r = s.radius ?? h / 2;
    const hw = w / 2;
    const hh = h / 2;

    // Choose fill based on state
    let fill = s.fillColor;
    let alpha = s.fillAlpha ?? 1;

    if (st.disabled) {
      alpha = s.disabledAlpha ?? 0.35;
    } else if (st.pressed) {
      fill = s.pressedFill ?? this.darken(s.fillColor, 0.7);
    } else if (st.hovered || st.focused) {
      fill = s.hoverFill ?? this.lighten(s.fillColor, 1.2);
    }

    this.bg.clear();
    this.bg.roundRect(-hw, -hh, w, h, r);
    this.bg.fill({ color: fill, alpha });

    if (s.strokeColor !== undefined) {
      this.bg.stroke({ color: s.strokeColor, width: s.strokeWidth ?? 1.5, alpha: st.disabled ? 0.2 : 0.5 });
    }

    // Inner focus indicator — white inset border when keyboard-focused
    this.focusBorder.clear();
    if (st.focused && !st.disabled) {
      const inset = 3;
      this.focusBorder.roundRect(-hw + inset, -hh + inset, w - inset * 2, h - inset * 2, Math.max(2, r - inset));
      this.focusBorder.stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
    }

    this.container.alpha = st.disabled ? (s.disabledAlpha ?? 0.35) : 1;
  }

  private bindEvents(): void {
    this.container.on("pointerover", () => {
      if (this.state.disabled) return;
      this.state.hovered = true;
      this.draw();
    });
    this.container.on("pointerout", () => {
      this.state.hovered = false;
      this.state.pressed = false;
      this.draw();
    });
    this.container.on("pointerdown", () => {
      if (this.state.disabled) return;
      this.state.pressed = true;
      this.draw();
    });
    this.container.on("pointerup", () => {
      if (this.state.disabled) return;
      this.state.pressed = false;
      this.draw();
      this.onActivate?.();
    });
    // Also trigger on pointerupoutside (finger slides off)
    this.container.on("pointerupoutside", () => {
      this.state.pressed = false;
      this.draw();
    });
  }

  private darken(color: number, factor: number): number {
    const r = Math.round(((color >> 16) & 0xff) * factor);
    const g = Math.round(((color >> 8) & 0xff) * factor);
    const b = Math.round((color & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
  }

  private lighten(color: number, factor: number): number {
    const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
    const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
    const b = Math.min(255, Math.round((color & 0xff) * factor));
    return (r << 16) | (g << 8) | b;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
