// widgets/StatusBarWidget.ts
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { GameStatusContext, type GameStatus } from "@/contexts/GameStatusContext";
import { audioManager } from "@/managers/AudioManager";
import type { Layout } from "@/layouts/GameLayout";
import { FocusManager } from "@/managers/FocusManager";

export class StatusBarWidget {
  container: Container;
  private ctx: GameStatusContext;
  private unsubscribe: (() => void) | null = null;

  private bg: Graphics;
  private divider: Graphics;
  private playingTabBg: Graphics;
  private playingTabTxt: Text;
  private gameIdTxt: Text;
  private timerTxt: Text;
  private timerBar: Graphics;
  private timerBarFill: Graphics;
  private muteBg: Graphics;
  private muteTxt: Text;

  private layout: Layout;

  private _playingTab!: Container;
  private _muteBtn!: Container;
  private _muteBtnW: number = 65;
  private _tabW: number = 70;
  private _tabH: number = 22;
  private _btnH: number = 20;

  constructor(ctx: GameStatusContext, layout: Layout, focusManager?: FocusManager) {
    this.ctx = ctx;
    this.layout = layout;
    this.container = new Container();

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.divider = new Graphics();
    this.container.addChild(this.divider);

    // Playing tab
    const playingTab = new Container();
    this.container.addChild(playingTab);
    this.playingTabBg = new Graphics();
    playingTab.addChild(this.playingTabBg);
    this.playingTabTxt = new Text({
      text: "Playing",
      style: new TextStyle({ fontFamily: "Arial", fontSize: 12, fill: 0x1a1a1a, fontWeight: "bold" }),
    });
    this.playingTabTxt.anchor.set(0.5, 0.5);
    playingTab.addChild(this.playingTabTxt);
    this._playingTab = playingTab;

    // Game ID
    this.gameIdTxt = new Text({
      text: "Current Game #—",
      style: new TextStyle({ fontFamily: "Arial", fontSize: layout.statusFontLg, fill: 0xffd700, fontWeight: "bold" }),
    });
    this.gameIdTxt.anchor.set(0, 0.5);
    this.container.addChild(this.gameIdTxt);

    // Timer text
    this.timerTxt = new Text({
      text: "Ready",
      style: new TextStyle({ fontFamily: "Arial", fontSize: layout.statusFontSm, fill: 0xaaccff }),
    });
    this.timerTxt.anchor.set(1, 0.5);
    this.container.addChild(this.timerTxt);

    // Progress bar
    this.timerBar = new Graphics();
    this.container.addChild(this.timerBar);
    this.timerBarFill = new Graphics();
    this.container.addChild(this.timerBarFill);

    // Mute button
    const muteBtn = new Container();
    muteBtn.eventMode = "static";
    muteBtn.cursor = "pointer";
    this.muteBg = new Graphics();
    muteBtn.addChild(this.muteBg);
    this.muteTxt = new Text({
      text: "🔊 Sound",
      style: new TextStyle({ fontFamily: "Arial", fontSize: layout.statusFontSm, fill: 0xffffff }),
    });
    this.muteTxt.anchor.set(0.5, 0.5);
    muteBtn.addChild(this.muteTxt);
    muteBtn.on("pointerdown", () => {
      const nowOn = audioManager.toggle();
      this.muteTxt.text = nowOn ? "🔊 Sound" : "🔇 Muted";
      this.muteBg.clear();
      this.muteBg.roundRect(0, 0, this._muteBtnW, this._btnH, this._btnH / 2);
      this.muteBg.fill({ color: nowOn ? 0x334466 : 0x553333 });
    });
    muteBtn.on("pointerover", () => { this.muteBg.alpha = 0.8; });
    muteBtn.on("pointerout",  () => { this.muteBg.alpha = 1; });
    this.container.addChild(muteBtn);
    this._muteBtn = muteBtn;

    this.applyLayout(layout);
    this.unsubscribe = this.ctx.subscribe((s) => this.update(s));

    if (focusManager) {
      focusManager.addItem(muteBtn, () => { audioManager.toggle(); }, { group: "default", label: "Mute" });
    }
  }

  private applyLayout(layout: Layout): void {
    const { W, statusBarH, statusFontLg, statusFontSm, pad } = layout;
    const H    = statusBarH;
    const row1Y = Math.round(H * 0.3);
    const row2Y = Math.round(H * 0.72);

    // Background
    this.bg.clear();
    this.bg.rect(0, 0, W, H);
    this.bg.fill({ color: 0x0a1a3a, alpha: 0.95 });

    // Divider
    this.divider.clear();
    this.divider.rect(0, 0, W, 2);
    this.divider.fill({ color: 0xffd700, alpha: 0.5 });

    // Playing tab
    const tabW = Math.round(Math.max(55, 70 * layout.uiScale));
    const tabH = Math.round(Math.max(18, 22 * layout.uiScale));
    this._tabW = tabW;
    this._tabH = tabH;
    this._playingTab.x = pad * 2;
    this._playingTab.y = row1Y - tabH / 2;
    this.playingTabBg.clear();
    this.playingTabBg.roundRect(0, 0, tabW, tabH, 4);
    this.playingTabBg.fill({ color: 0xffd700 });
    this.playingTabTxt.style.fontSize = Math.round(Math.max(9, 12 * layout.uiScale));
    this.playingTabTxt.x = tabW / 2;
    this.playingTabTxt.y = tabH / 2;

    // Game ID
    this.gameIdTxt.style.fontSize = statusFontLg;
    this.gameIdTxt.x = pad * 2 + tabW + pad * 2;
    this.gameIdTxt.y = row1Y;

    // Timer text — right aligned
    this.timerTxt.style.fontSize = statusFontSm;
    this.timerTxt.x = W - pad * 2;
    this.timerTxt.y = row1Y;

    // Progress bar (middle strip)
    const barY = Math.round(H * 0.5) - 1;
    const barX = pad * 2;
    const barW = W - pad * 4;
    this.timerBar.clear();
    this.timerBar.roundRect(barX, barY, barW, 3, 2);
    this.timerBar.fill({ color: 0x223355 });

    // Mute button on row 2
    const btnH     = Math.round(Math.max(16, 20 * layout.uiScale));
    const muteBtnW = Math.round(Math.max(55, 65 * layout.uiScale));
    this._btnH     = btnH;
    this._muteBtnW = muteBtnW;

    this._muteBtn.x = pad * 2;
    this._muteBtn.y = row2Y - btnH / 2;
    this.muteBg.clear();
    this.muteBg.roundRect(0, 0, muteBtnW, btnH, btnH / 2);
    this.muteBg.fill({ color: 0x334466 });
    this.muteTxt.style.fontSize = statusFontSm;
    this.muteTxt.x = muteBtnW / 2;
    this.muteTxt.y = btnH / 2;
  }

  private update(s: GameStatus): void {
    const TOTAL     = this.ctx.COUNTDOWN_SECONDS;
    const remaining = s.countdown;

    this.gameIdTxt.text = `Current Game #${s.currentGameId}`;

    if (s.phase === "countdown") {
      this.timerTxt.text = `Time to next: ${remaining}s`;
      (this.timerTxt.style as TextStyle).fill = remaining <= 3 ? 0xff6b6b : 0xaaccff;
    } else if (s.phase === "spinning") {
      this.timerTxt.text = "Spinning…";
      (this.timerTxt.style as TextStyle).fill = 0xffd700;
    } else if (s.phase === "result") {
      this.timerTxt.text = s.lastPoints === 0 ? "⚪ Zero!" : `+${s.lastPoints} pts 🎉`;
      (this.timerTxt.style as TextStyle).fill = s.lastPoints === 0 ? 0xaaaaaa : 0x7cfc00;
    } else {
      this.timerTxt.text = "Ready to spin";
      (this.timerTxt.style as TextStyle).fill = 0xaaccff;
    }

    const frac = s.phase === "countdown" ? remaining / TOTAL : s.phase === "idle" ? 1 : 0;
    const { W, statusBarH, pad } = this.layout;
    const barX = pad * 2;
    const barY = Math.round(statusBarH * 0.5) - 1;
    const barW = W - pad * 4;

    this.timerBarFill.clear();
    if (frac > 0) {
      this.timerBarFill.roundRect(barX, barY, barW * frac, 3, 2);
      this.timerBarFill.fill({ color: remaining <= 3 ? 0xff4444 : 0xffd700 });
    }

    this.playingTabBg.clear();
    this.playingTabBg.roundRect(0, 0, this._tabW, this._tabH, 4);
    this.playingTabBg.fill({ color: s.phase === "spinning" ? 0xff6b35 : 0xffd700 });
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