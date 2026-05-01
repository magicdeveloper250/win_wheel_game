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

  constructor(ctx: GameStatusContext, layout: Layout) {
    this.ctx = ctx;
    this.container = new Container();

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.timerTxt = new Text({
      text: "—s",
      style: new TextStyle({ fontFamily: "Century Gothic", fontSize: layout.scoreFontSize, fill: 0xffd700, fontWeight: "bold" }),
    });
    this.timerTxt.anchor.set(0.5, 0.5);
    this.container.addChild(this.timerTxt);

    this.roundsTxt = new Text({
      text: "0 rounds",
      style: new TextStyle({ fontFamily: "Century Gothic", fontSize: layout.scoreStatFontSize, fill: 0xaaccff }),
    });
    this.roundsTxt.anchor.set(0, 0.5);
    this.container.addChild(this.roundsTxt);

    this.phaseTxt = new Text({
      text: "Ready",
      style: new TextStyle({ fontFamily: "Century Gothic", fontSize: layout.scoreStatFontSize, fill: 0xaaccff }),
    });
    this.phaseTxt.anchor.set(1, 0.5);
    this.container.addChild(this.phaseTxt);

    this.applyLayout(layout);
    this.unsubscribe = this.ctx.subscribe((s) => this.update(s));
  }

  private applyLayout(layout: Layout): void {
    const { W, headerH, scorePillW, scoreFontSize, scoreStatFontSize } = layout;
    const cx = W / 2;
    const h = headerH;

    this.bg.clear();
    this.bg.roundRect(cx - scorePillW / 2, 4, scorePillW, h - 8, h / 2);
    this.bg.fill({ color: 0xffffff, alpha: 0.1 });
    this.bg.stroke({ color: 0xffd700, width: 1, alpha: 0.3 });

    this.timerTxt.style.fontSize = scoreFontSize;
    this.timerTxt.x = cx;
    this.timerTxt.y = h / 2;

    this.roundsTxt.style.fontSize = scoreStatFontSize;
    this.roundsTxt.x = cx - scorePillW / 2 + 12;
    this.roundsTxt.y = h / 2;

    this.phaseTxt.style.fontSize = scoreStatFontSize;
    this.phaseTxt.x = cx + scorePillW / 2 - 12;
    this.phaseTxt.y = h / 2;

    const hide = W < 400;
    this.roundsTxt.visible = !hide;
    this.phaseTxt.visible = !hide;
  }

  private update(s: GameStatus): void {
    let secondsText = "—s";
    if (s.phase === "betting") {
      secondsText = `${Math.max(0, s.bettingWindow)}s`;
    } else if (s.phase === "countdown") {
      secondsText = `${Math.max(0, s.countdown)}s`;
    }
    this.timerTxt.text = secondsText;
    this.roundsTxt.text = `${s.roundsPlayed} rounds`;
    let phaseText = "Ready";
    if (s.phase === "betting") {
      phaseText = "Betting Open";
    } else if (s.phase === "countdown") {
      phaseText = "Bets locked";
    } else if (s.phase === "spinning") {
      phaseText = "Spinning...";
    } else if (s.phase === "result") {
      phaseText = s.lastPoints > 0 ? `Result +${s.lastPoints}` : "Result no win";
    }
    this.phaseTxt.text = phaseText;
  }

  resize(layout: Layout): void { this.applyLayout(layout); }

  destroy(): void {
    this.unsubscribe?.();
    this.container.destroy({ children: true });
  }
}
