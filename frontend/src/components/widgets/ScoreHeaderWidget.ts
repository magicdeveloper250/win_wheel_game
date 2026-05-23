// widgets/ScoreHeaderWidget.ts
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { GameStatus, GameStatusContext } from "@/contexts/GameStatusContext";
import type { Layout } from "@/layouts/GameLayout";

export class ScoreHeaderWidget {
  container: Container;
  private ctx: GameStatusContext;
  private unsubscribe: (() => void) | null = null;
  private timerTxt: Text;
  private roundsTxt: Text;
  private phaseTxt: Text;
  private bg: Graphics;
  private phaseDot: Graphics;

  private dotAlpha = 1;
  private dotDir = 1;
  private rafId: number | null = null;
  private currentPhase = "ready";

  constructor(ctx: GameStatusContext, layout: Layout) {
    this.ctx = ctx;
    this.container = new Container();

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.timerTxt = new Text({
      text: "—s",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: layout.scoreFontSize,
        fill: 0xffd700,
        fontWeight: "bold",
      }),
    });
    this.timerTxt.anchor.set(0.5, 0.5);
    this.container.addChild(this.timerTxt);

    this.roundsTxt = new Text({
      text: "Round 0",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: layout.scoreStatFontSize,
        fill: 0xffd700,
        fontWeight: "bold",
      }),
    });
    this.roundsTxt.anchor.set(0, 0.5);
    this.container.addChild(this.roundsTxt);

    this.phaseDot = new Graphics();
    this.container.addChild(this.phaseDot);

    this.phaseTxt = new Text({
      text: "Ready",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: layout.scoreStatFontSize,
        fill: 0xaaccff,
      }),
    });
    this.phaseTxt.anchor.set(1, 0.5);
    this.container.addChild(this.phaseTxt);

    this.applyLayout(layout);
    this.startPulse();
    this.unsubscribe = this.ctx.subscribe((s) => this.update(s));
  }

  private applyLayout(layout: Layout): void {
    const { W, headerH, scorePillW, scoreFontSize, scoreStatFontSize } = layout;
    const cx = W / 2;
    const h = headerH;

    // ── Background pill — same shape/position as original, richer fill ────────
    this.bg.clear();

    // Subtle outer glow ring
    this.bg.roundRect(cx - scorePillW / 2 - 1, 3, scorePillW + 2, h - 6, h / 2);
    this.bg.fill({ color: 0xc0392b, alpha: 0.15 });

    // Main pill — deep dark crimson body
    this.bg.roundRect(cx - scorePillW / 2, 4, scorePillW, h - 8, h / 2);
    this.bg.fill({ color: 0x1a0000, alpha: 0.88 });

    // Top sheen stripe
    this.bg.roundRect(cx - scorePillW / 2 + 2, 5, scorePillW - 4, (h - 8) * 0.42, h / 2);
    this.bg.fill({ color: 0xffffff, alpha: 0.04 });

    // Gold border
    this.bg.roundRect(cx - scorePillW / 2, 4, scorePillW, h - 8, h / 2);
    this.bg.stroke({ color: 0xffd700, width: 1.5, alpha: 0.55 });

    // Inner crimson accent ring
    this.bg.roundRect(cx - scorePillW / 2 + 2, 6, scorePillW - 4, h - 12, h / 2);
    this.bg.stroke({ color: 0xc0392b, width: 0.5, alpha: 0.35 });

    // ── Text — exact same positions as original ───────────────────────────────
    this.timerTxt.style.fontSize = scoreFontSize;
    this.timerTxt.x = cx;
    this.timerTxt.y = h / 2;

    this.roundsTxt.style.fontSize = scoreStatFontSize;
    this.roundsTxt.x = cx - scorePillW / 2 + 12;
    this.roundsTxt.y = h / 2;

    this.phaseTxt.style.fontSize = scoreStatFontSize;
    this.phaseTxt.x = cx + scorePillW / 2 - 12;
    this.phaseTxt.y = h / 2;

    // Small pulsing dot just left of the phase text anchor
    this.phaseDot.x = (cx + scorePillW / 2 - 12) - (this.phaseTxt.width + 8);
    this.phaseDot.y = h / 2;
    this.redrawDot();

    const hide = W < 400;
    this.roundsTxt.visible = !hide;
    this.phaseTxt.visible  = !hide;
    this.phaseDot.visible  = !hide;
  }

  private dotColor(): number {
    switch (this.currentPhase) {
      case "betting":   return 0x2ecc71;
      case "countdown": return 0xe74c3c;
      case "spinning":  return 0xffd700;
      default:          return 0x6688aa;
    }
  }

  private redrawDot(): void {
    this.phaseDot.clear();
    this.phaseDot.circle(0, 0, 3.5);
    this.phaseDot.fill({ color: this.dotColor(), alpha: this.dotAlpha });
  }

  private startPulse(): void {
    const tick = () => {
      const active = ["betting", "countdown", "spinning"].includes(this.currentPhase);
      if (active) {
        this.dotAlpha += 0.035 * this.dotDir;
        if (this.dotAlpha >= 1)    { this.dotAlpha = 1;    this.dotDir = -1; }
        if (this.dotAlpha <= 0.15) { this.dotAlpha = 0.15; this.dotDir =  1; }
      } else {
        this.dotAlpha = 1;
      }
      this.redrawDot();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private update(s: GameStatus): void {
    this.currentPhase = s.phase;

    // Timer
    let secondsText = "—s";
    if (s.phase === "betting")   secondsText = `${Math.max(0, s.bettingWindow)}s`;
    if (s.phase === "countdown") secondsText = `${Math.max(0, s.countdown)}s`;
    this.timerTxt.text = secondsText;

    // Flash red when critically low
    const isLow =
      (s.phase === "betting"   && s.bettingWindow <= 5) ||
      (s.phase === "countdown" && s.countdown     <= 3);
    this.timerTxt.style.fill = isLow ? 0xff4444 : 0xffd700;

    // Round
    this.roundsTxt.text = `Round ${Number(s.roundsPlayed) || 0}`;

    // Phase
    const phaseMap: Record<string, { label: string; color: number }> = {
      ready:     { label: "Ready",        color: 0xaaccff },
      betting:   { label: "Betting Open", color: 0x2ecc71 },
      countdown: { label: "Bets Locked",  color: 0xe74c3c },
      spinning:  { label: "Spinning…",    color: 0xffd700 },
      result:    { label: "",             color: 0xaaccff },
    };
    const info = phaseMap[s.phase] ?? phaseMap.ready;
    this.phaseTxt.text       = info.label;
    this.phaseTxt.style.fill = info.color;

    // Reposition dot after text content changes
    // (width is only accurate after next render tick, but close enough here)
    this.phaseDot.x = this.phaseTxt.x - this.phaseTxt.width - 8;
  }

  resize(layout: Layout): void {
    this.applyLayout(layout);
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.unsubscribe?.();
    this.container.destroy({ children: true });
  }
}