import { Container, Graphics, Text, TextStyle } from "pixi.js";
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
  private statusTxt: Text;
  private nextSessionTxt: Text;
  private progressTrack: Graphics;
  private progressFill: Graphics;
  private muteBtn: Container;
  private muteBg: Graphics;
  private muteIcon: Text;
  private muteTxt: Text;

  constructor(ctx: GameStatusContext, layout: Layout, focusManager?: FocusManager) {
    this.ctx = ctx;
    this.layout = layout;
    this.container = new Container();

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.statusTxt = new Text({
      text: "Ready",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: layout.statusFontLg,
        fill: 0xdbeafe,
        fontWeight: "bold",
      }),
    });
    this.statusTxt.anchor.set(0.5, 0.5);
    this.container.addChild(this.statusTxt);

    this.nextSessionTxt = new Text({
      text: "Next Session: -",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: layout.statusFontSm,
        fill: 0x93c5fd,
        fontWeight: "bold",
      }),
    });
    this.nextSessionTxt.anchor.set(0.5, 0.5);
    this.container.addChild(this.nextSessionTxt);

    this.progressTrack = new Graphics();
    this.container.addChild(this.progressTrack);

    this.progressFill = new Graphics();
    this.container.addChild(this.progressFill);

    this.muteBtn = new Container();
    this.muteBtn.eventMode = "static";
    this.muteBtn.cursor = "pointer";
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
    this.muteBtn.on("pointerover", () => { this.muteBg.alpha = 0.85; });
    this.muteBtn.on("pointerout", () => { this.muteBg.alpha = 1; });
    this.container.addChild(this.muteBtn);

    this.applyLayout(layout);
    this.unsubscribe = this.ctx.subscribe((s) => this.update(s));

    if (focusManager) {
      focusManager.addItem(this.muteBtn, () => this.toggleMute(), { group: "default", label: "Mute" });
    }
  }

  private toggleMute(): void {
    const nowOn = audioManager.toggle();
    this.muteIcon.text = nowOn ? "🔊" : "🔇";
    this.muteTxt.text = nowOn ? "Sound On" : "Muted";
    this.redrawMuteButton(nowOn);
  }

  private applyLayout(layout: Layout): void {
    const { W, statusBarH, pad, statusFontLg } = layout;
    const H = statusBarH;
    const innerPadX = Math.max(12, Math.round(pad * 2.2));
    const innerPadY = Math.max(6, Math.round(H * 0.1));
    const barX = innerPadX;
    const barW = W - innerPadX * 2;
    const barH = Math.max(10, Math.round(H * 0.17));
    const barY = H - barH - Math.max(8, Math.round(H * 0.1));

    this.bg.clear();
    this.bg.rect(0, 0, W, H);
    this.bg.fill({ color: 0x0a1a3a, alpha: 0.96 });
    this.bg.rect(0, 0, W, 2);
    this.bg.fill({ color: 0x2563eb, alpha: 0.8 });

    this.statusTxt.style.fontSize = Math.max(12, statusFontLg + 1);
    this.statusTxt.x = W / 2;
    this.statusTxt.y = innerPadY + Math.round(H * 0.16);

    this.nextSessionTxt.style.fontSize = Math.max(10, layout.statusFontSm + 1);
    this.nextSessionTxt.x = W / 2;
    this.nextSessionTxt.y = this.statusTxt.y + Math.round(H * 0.22);

    this.progressTrack.clear();
    this.progressTrack.roundRect(barX, barY, barW, barH, barH / 2);
    this.progressTrack.fill({ color: 0x1e3a70, alpha: 1 });

    const btnW = Math.max(118, Math.round(W * 0.13));
    const btnH = Math.max(34, Math.round(H * 0.3));
    this.muteBtn.x = W - btnW - innerPadX;
    this.muteBtn.y = innerPadY;
    this.muteIcon.style.fontSize = Math.max(11, layout.statusFontSm + 2);
    this.muteIcon.x = Math.max(13, Math.round(btnW * 0.18));
    this.muteIcon.y = btnH / 2;
    this.muteTxt.style.fontSize = Math.max(10, layout.statusFontSm + 1);
    this.muteTxt.x = Math.round(btnW * 0.56);
    this.muteTxt.y = btnH / 2;
    this.redrawMuteButton(true, btnW, btnH);
  }

  private redrawMuteButton(soundOn: boolean, w?: number, h?: number): void {
    const btnW = w ?? this.muteBg.width;
    const btnH = h ?? this.muteBg.height;
    this.muteBg.clear();
    this.muteBg.roundRect(0, 0, btnW, btnH, btnH / 2);
    this.muteBg.fill({ color: soundOn ? 0x2563eb : 0x475569, alpha: 0.95 });
  }

 // In StatusBarWidget.update(), replace:
// total = this.ctx.BETTING_SECONDS;
// with:
private update(s: GameStatus): void {
  let seconds = 0;
  let total = 1;
  let label = "Ready";
  let fillColor = 0x3b82f6;

  if (s.phase === "betting") {
    seconds = s.bettingWindow;
    total = s.totalBettingSeconds || 30;    
    label = `Betting Open — ${seconds}s left`;
    fillColor = 0xf59e0b;
  } else if (s.phase === "countdown") {
    seconds = s.countdown;
    total = 3;
    label = "Bets locked — spinning soon…";
    fillColor = 0xf59e0b;
  } else if (s.phase === "spinning") {
    label = "Spinning…";
    fillColor = 0x60a5fa;
  } else if (s.phase === "result") {
    label = s.lastPoints > 0 ? `Result: +${s.lastPoints}` : "Result: No win";
    fillColor = 0x10b981;
  }

  this.statusTxt.text = label;
  this.nextSessionTxt.text = `Session #${s.currentGameId}`;

  const frac = Math.max(0, Math.min(1, total > 0 ? seconds / total : 0));
  const { W, statusBarH, pad } = this.layout;
  const innerPadX = Math.max(12, Math.round(pad * 2.2));
  const barX = innerPadX;
  const barW = W - innerPadX * 2;
  const barH = Math.max(10, Math.round(statusBarH * 0.17));
  const barY = statusBarH - barH - Math.max(8, Math.round(statusBarH * 0.1));

  this.progressFill.clear();
  if (frac > 0) {
    this.progressFill.roundRect(barX, barY, Math.max(8, Math.round(barW * frac)), barH, barH / 2);
    this.progressFill.fill({ color: fillColor, alpha: 0.95 });
  }
}

  resize(layout: Layout): void {
    this.layout = layout;
    this.applyLayout(layout);
  }

  destroy(): void {
    this.unsubscribe?.();
    this.container.destroy({ children: true });
  }
}
