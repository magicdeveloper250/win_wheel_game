// widgets/ResultOverlayWidget.ts
// Result card — click the card itself to dismiss. No giant hit area.

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { DropShadowFilter } from "pixi-filters";

export class ResultOverlayWidget {
  container: Container;

  // The card is its own dismiss button — click anywhere on it to close
  private card: Container;
  private bg: Graphics;
  private letterTxt: Text;
  private msgTxt: Text;
  private ptsTxt: Text;
  private dismissTxt: Text;

  private cardW: number = 300;
  private cardH: number = 76;
  private animFrame: number | null = null;
  private onDismiss: (() => void) | null = null;

  constructor(screenW: number) {
    // Outer container — no eventMode, no hit area, just a positioner
    this.container = new Container();
    this.container.visible = false;
    this.container.eventMode = "none";

    this.container.filters = [
      new DropShadowFilter({ offset: { x: 0, y: 6 }, blur: 16, alpha: 0.75, color: 0x000000 }),
    ];

    // Card — the ONLY interactive element
    this.card = new Container();
    this.card.eventMode = "static";
    this.card.cursor = "pointer";
    this.container.addChild(this.card);

    // Card background
    this.bg = new Graphics();
    this.card.addChild(this.bg);

    // Letter (large, left side)
    this.letterTxt = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "Arial", fontSize: 28, fill: 0xffd700, fontWeight: "bold" }),
    });
    this.letterTxt.anchor.set(0.5, 0.5);
    this.card.addChild(this.letterTxt);

    // Result message
    this.msgTxt = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "Arial", fontSize: 13, fill: 0xffffff, fontWeight: "bold" }),
    });
    this.msgTxt.anchor.set(0, 0.5);
    this.card.addChild(this.msgTxt);

    // Points
    this.ptsTxt = new Text({
      text: "",
      style: new TextStyle({ fontFamily: "Arial", fontSize: 20, fill: 0x7cfc00, fontWeight: "bold" }),
    });
    this.ptsTxt.anchor.set(0, 0.5);
    this.card.addChild(this.ptsTxt);

    // "tap to dismiss" hint — bottom right corner
    this.dismissTxt = new Text({
      text: "tap to dismiss",
      style: new TextStyle({ fontFamily: "Arial", fontSize: 10, fill: 0xffffff }),
    });
    this.dismissTxt.alpha = 0.45;
    this.dismissTxt.anchor.set(1, 1);
    this.card.addChild(this.dismissTxt);

    // Click the card to dismiss
    this.card.on("pointerdown", () => this.hide());

    this.resize(screenW);
  }

  resize(screenW: number): void {
    this.cardW = Math.min(360, Math.round(screenW * 0.85));
    this.cardH = Math.max(70, Math.round(this.cardW * 0.24));
    this.layoutCard();
  }

  private layoutCard(): void {
    const cW = this.cardW;
    const cH = this.cardH;

    // Card is anchored top-left from (-cW/2, -cH/2) so its center is at (0,0)
    const letterX = -(cW / 2 - cH * 0.48);
    const textX = letterX + cH * 0.40;
    const fs = Math.round(cH * 0.36);
    const fsSmall = Math.round(cH * 0.20);
    const fsPts = Math.round(cH * 0.30);

    this.letterTxt.style.fontSize = Math.max(16, fs);
    this.letterTxt.x = letterX;
    this.letterTxt.y = 0;

    this.msgTxt.style.fontSize = Math.max(10, fsSmall);
    this.msgTxt.x = textX;
    this.msgTxt.y = -cH * 0.14;

    this.ptsTxt.style.fontSize = Math.max(13, fsPts);
    this.ptsTxt.x = textX;
    this.ptsTxt.y = cH * 0.16;

    this.dismissTxt.x = cW / 2 - 6;
    this.dismissTxt.y = cH / 2 - 4;
  }

  setDismissCallback(cb: () => void): void {
    this.onDismiss = cb;
  }

  // For FocusManager — the card itself is the focusable dismiss target
  getDismissButton(): Container {
    return this.card;
  }

  show(letter: string, number: number, points: number): void {
    if (this.animFrame !== null) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }

    this.container.visible = true;

    const cW = this.cardW;
    const cH = this.cardH;
    const r = Math.round(cH * 0.22);

    this.letterTxt.text = letter;

    if (points === 0) {
      this.msgTxt.text = `Letter ${letter}  ·  Number ${number}`;
      this.ptsTxt.text = "Zero! 😬";
      this.ptsTxt.style.fill = 0x999999;
      this.bg.clear();
      this.bg.roundRect(-cW / 2, -cH / 2, cW, cH, r);
      this.bg.fill({ color: 0x1a0a0a, alpha: 0.96 });
      this.bg.stroke({ color: 0x555555, width: 2 });
    } else {
      this.msgTxt.text = `Letter ${letter}  ×  ${number} pts`;
      this.ptsTxt.text = `+${points} 🎉`;
      this.ptsTxt.style.fill = points >= 30 ? 0xffd700 : 0x7cfc00;
      this.bg.clear();
      this.bg.roundRect(-cW / 2, -cH / 2, cW, cH, r);
      this.bg.fill({ color: 0x0d2a5e, alpha: 0.96 });
      this.bg.stroke({ color: 0xffd700, width: 2 });
    }

    // Pop-in
    this.container.scale.set(0.4);
    this.container.alpha = 0;
    const start = performance.now();
    const animIn = (now: number) => {
      const t = Math.min(1, (now - start) / 220);
      const ease = 1 - Math.pow(1 - t, 3);
      this.container.scale.set(0.4 + ease * 0.6);
      this.container.alpha = ease;
      if (t < 1) this.animFrame = requestAnimationFrame(animIn);
      else this.animFrame = null;
    };
    this.animFrame = requestAnimationFrame(animIn);
  }

  hide(): void {
    if (!this.container.visible) return;
    if (this.animFrame !== null) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    const start = performance.now();
    const animOut = (now: number) => {
      const t = Math.min(1, (now - start) / 180);
      this.container.alpha = 1 - t;
      this.container.scale.set(1 - t * 0.15);
      if (t < 1) {
        this.animFrame = requestAnimationFrame(animOut);
      } else {
        this.animFrame = null;
        this.container.visible = false;
        this.container.scale.set(1);
        this.onDismiss?.();
      }
    };
    this.animFrame = requestAnimationFrame(animOut);
  }

  setPosition(x: number, y: number): void {
    this.container.x = x;
    this.container.y = y;
  }
}