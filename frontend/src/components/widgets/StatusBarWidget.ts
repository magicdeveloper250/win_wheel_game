import { Container, Graphics, Text, TextStyle, Ticker } from "pixi.js";
import { type GameStatus, GameStatusContext } from "@/contexts/GameStatusContext";
import type { Layout } from "@/layouts/GameLayout";
import { FocusManager } from "@/managers/FocusManager";
import { audioManager } from "@/managers/AudioManager";

export class StatusBarWidget {
  container: Container;
  private ctx: GameStatusContext;
  private layout: Layout;
  private unsubscribe: (() => void) | null = null;

  private bg: Graphics;
  private accentLine: Graphics;
  private statusTxt: Text;
  private nextSessionTxt: Text;
  private progressTrack: Graphics;
  private progressGlow: Graphics;
  private progressFill: Graphics;

  private muteBtn: Container;
  private muteBg: Graphics;
  private muteIcon: Text;
  private muteTxt: Text;

  private _currentFrac = 0;
  private _targetFrac  = 0;
  private _fillColor   = 0x3b82f6;
  private _ticker: Ticker | null = null;

  // Cache bar geometry so _animateFill never recomputes layout
  private _barX = 0;
  private _barY = 0;
  private _barW = 0;
  private _barH = 0;

  constructor(ctx: GameStatusContext, layout: Layout, focusManager?: FocusManager) {
    this.ctx    = ctx;
    this.layout = layout;
    this.container = new Container();

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.accentLine = new Graphics();
    this.container.addChild(this.accentLine);

    this.statusTxt = new Text({
      text: "Ready",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: layout.statusFontLg,
        fill: 0xdbeafe,
        fontWeight: "bold",
        dropShadow: { color: 0x2563eb, blur: 8, distance: 0, alpha: 0.7 },
      }),
    });
    this.statusTxt.anchor.set(0.5, 0.5);
    this.container.addChild(this.statusTxt);

    this.nextSessionTxt = new Text({
      text: "Session #—",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: layout.statusFontSm,
        fill: 0x60a5fa,
        fontWeight: "bold",
        letterSpacing: 1.5,
      }),
    });
    this.nextSessionTxt.anchor.set(0.5, 0.5);
    // this.container.addChild(this.nextSessionTxt);

    this.progressTrack = new Graphics();
    this.container.addChild(this.progressTrack);

    this.progressGlow = new Graphics();
    this.container.addChild(this.progressGlow);

    this.progressFill = new Graphics();
    this.container.addChild(this.progressFill);

    this.muteBtn = new Container();
    this.muteBtn.eventMode = "static";
    this.muteBtn.cursor    = "pointer";

    this.muteBg = new Graphics();
    this.muteBtn.addChild(this.muteBg);

    this.muteIcon = new Text({
      text: "🔊",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: layout.statusFontSm,
        fill: 0xffffff,
        fontWeight: "bold",
      }),
    });
    this.muteIcon.anchor.set(0.5, 0.5);
    this.muteBtn.addChild(this.muteIcon);

    this.muteTxt = new Text({
      text: "Sound On",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: layout.statusFontSm,
        fill: 0xffffff,
        fontWeight: "bold",
      }),
    });
    this.muteTxt.anchor.set(0.5, 0.5);
    this.muteBtn.addChild(this.muteTxt);

    this.muteBtn.on("pointerdown", () => this.toggleMute());
    this.muteBtn.on("pointerover", () => {
      this.muteBg.alpha = 0.75;
      this.muteBtn.scale.set(1.04);
    });
    this.muteBtn.on("pointerout", () => {
      this.muteBg.alpha = 1;
      this.muteBtn.scale.set(1.0);
    });
    this.container.addChild(this.muteBtn);

    this.applyLayout(layout);
    this.unsubscribe = this.ctx.subscribe((s) => this.update(s));

    if (focusManager) {
      focusManager.addItem(this.muteBtn, () => this.toggleMute(), { group: "default", label: "Mute" });
    }

    this._ticker = new Ticker();
    // ticker.add receives a Ticker instance; use its deltaMS for frame-rate-independent lerp
    this._ticker.add((ticker) => this._animateFill(ticker.deltaMS));
    this._ticker.start();
  }

  private toggleMute(): void {
    const nowOn = audioManager.toggle();
    this.muteIcon.text = nowOn ? "🔊" : "🔇";
    this.muteTxt.text  = nowOn ? "Sound On" : "Muted";
    this.redrawMuteButton(nowOn);
  }

  private applyLayout(layout: Layout): void {
    const { W, statusBarH, pad, statusFontLg, statusFontSm } = layout;
    const H         = statusBarH;
    const innerPadX = Math.max(12, Math.round(pad * 2.2));
    const barH      = Math.max(8, Math.round(H * 0.14));
    const barY      = H - barH - Math.max(8, Math.round(H * 0.12));
    const barX      = innerPadX;
    const barW      = W - innerPadX * 2;
    const centerY   = Math.round(H * 0.38);
    const btnW      = Math.max(118, Math.round(W * 0.13));
    const btnH      = Math.max(34, Math.round(H * 0.32));

    // Cache for use in _animateFill
    this._barX = barX;
    this._barY = barY;
    this._barW = barW;
    this._barH = barH;

    this.bg.clear();
    this.bg.rect(0, 0, W, H);
    this.bg.fill({ color: 0x060e1f, alpha: 0.97 });

    this.accentLine.clear();
    this.accentLine.rect(0, 0, W, 2);
    this.accentLine.fill({ color: 0x1d4ed8, alpha: 1 });
    this.accentLine.rect(0, 2, W, 1);
    this.accentLine.fill({ color: 0x3b82f6, alpha: 0.3 });

    this.statusTxt.style.fontSize = Math.max(12, statusFontLg + 1);
    this.statusTxt.x = W / 2;
    this.statusTxt.y = centerY;

    this.nextSessionTxt.style.fontSize = Math.max(10, statusFontSm);
    this.nextSessionTxt.x = W / 2;
    this.nextSessionTxt.y = centerY + Math.round(H * 0.24);

    this.progressTrack.clear();
    this.progressTrack.roundRect(barX, barY, barW, barH, barH / 2);
    this.progressTrack.fill({ color: 0x0f2044, alpha: 1 });
    this.progressTrack.roundRect(barX, barY, barW, barH, barH / 2);
    this.progressTrack.stroke({ color: 0x1e3a70, width: 1, alpha: 0.8 });

    this.muteBtn.x = W - btnW - innerPadX;
    this.muteBtn.y = Math.round((H - btnH) / 2);

    this.muteIcon.style.fontSize = Math.max(11, statusFontSm + 2);
    this.muteIcon.x = Math.max(13, Math.round(btnW * 0.2));
    this.muteIcon.y = btnH / 2;

    this.muteTxt.style.fontSize = Math.max(10, statusFontSm);
    this.muteTxt.x = Math.round(btnW * 0.58);
    this.muteTxt.y = btnH / 2;

    this.redrawMuteButton(audioManager.isEnabled(), btnW, btnH);
    this._drawFill(this._currentFrac, this._fillColor);
  }

  private redrawMuteButton(soundOn: boolean, w?: number, h?: number): void {
    const btnW = w ?? (this.muteBg.width  || 118);
    const btnH = h ?? (this.muteBg.height || 34);
    this.muteBg.clear();
    this.muteBg.roundRect(0, 0, btnW, btnH, btnH / 2);
    this.muteBg.fill({ color: soundOn ? 0x1d4ed8 : 0x334155, alpha: 0.95 });
    this.muteBg.roundRect(0, 0, btnW, btnH, btnH / 2);
    this.muteBg.stroke({ color: soundOn ? 0x3b82f6 : 0x475569, width: 1.5, alpha: 0.7 });
  }

  private _animateFill(deltaMS: number): void {
    const diff = this._targetFrac - this._currentFrac;

    // Always redraw when target is actively moving (threshold only applies when settled)
    if (Math.abs(diff) < 0.0005) {
      if (this._currentFrac !== this._targetFrac) {
        this._currentFrac = this._targetFrac;
        this._drawFill(this._currentFrac, this._fillColor);
      }
      return;
    }

    // Delta-time-corrected lerp: ~8 half-lives per second at 60fps equivalent
    const alpha = 1 - Math.pow(0.004, deltaMS / 1000);
    this._currentFrac += diff * alpha;
    this._drawFill(this._currentFrac, this._fillColor);
  }

  private _drawFill(frac: number, color: number): void {
    const { _barX: barX, _barY: barY, _barW: barW, _barH: barH } = this;
    const fillW = Math.max(barH, Math.round(barW * frac));

    this.progressGlow.clear();
    if (frac > 0.02) {
      this.progressGlow.roundRect(barX, barY - 2, fillW, barH + 4, (barH + 4) / 2);
      this.progressGlow.fill({ color, alpha: 0.18 });
    }

    this.progressFill.clear();
    if (frac > 0) {
      this.progressFill.roundRect(barX, barY, fillW, barH, barH / 2);
      this.progressFill.fill({ color, alpha: 0.95 });
      this.progressFill.roundRect(barX + 2, barY + 1, Math.max(0, fillW - 4), Math.round(barH * 0.45), Math.round(barH * 0.2));
      this.progressFill.fill({ color: 0xffffff, alpha: 0.12 });
    }
  }

  private update(s: GameStatus): void {
    let seconds   = 0;
    let total     = 1;
    let label     = "Ready";
    let fillColor = 0x3b82f6;

    if (s.phase === "betting") {
      seconds   = s.bettingWindow;
      total     = s.totalBettingSeconds || 30;
      label     = `Betting Open — ${seconds}s left`;
      fillColor = 0xf59e0b;
    } else if (s.phase === "countdown") {
      seconds   = s.countdown;
      total     = 3;
      label     = "Bets locked — spinning soon…";
      fillColor = 0xf59e0b;
    } else if (s.phase === "spinning") {
      label     = "Spinning…";
      fillColor = 0x60a5fa;
    } else if (s.phase === "result") {
      label     = s.lastPoints > 0 ? `+${s.lastPoints} pts` : "No Win";
      fillColor = s.lastPoints > 0 ? 0x10b981 : 0xef4444;
    }

    this.statusTxt.text      = label;
    this.nextSessionTxt.text = `Session #${s.currentGameId}`;
    this._fillColor          = fillColor;

    // FIX: bar shows how much time REMAINS — fraction is seconds/total (countdown drains right to left)
    // On a new phase, snap _currentFrac to the new starting value immediately so there's
    // no lerp-from-zero glitch when e.g. betting opens at 30s (frac=1.0)
    const newFrac = Math.max(0, Math.min(1, total > 0 ? seconds / total : 0));

    if (s.phase === "spinning") {
      // Spinning has no discrete timer — hold the bar full
      this._currentFrac = 1;
      this._targetFrac  = 1;
    } else if (s.phase === "result") {
      // Result phase — drain to empty instantly
      this._currentFrac = 0;
      this._targetFrac  = 0;
    } else {
      // Only snap _currentFrac when phase just started (frac jumped up relative to current)
      // This prevents a backward lerp whenever a new betting/countdown window opens
      if (newFrac > this._currentFrac + 0.15) {
        this._currentFrac = newFrac;
      }
      this._targetFrac = newFrac;
    }
  }

  resize(layout: Layout): void {
    this.layout = layout;
    this.applyLayout(layout);
  }

  destroy(): void {
    this._ticker?.destroy();
    this._ticker = null;
    this.unsubscribe?.();
    this.container.destroy({ children: true });
  }
}