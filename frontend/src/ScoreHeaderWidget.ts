// widgets/ScoreHeaderWidget.ts
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { GameStatus, GameStatusContext } from "./GameStatusContext";
import type { Layout } from "./layout";
 

export class ScoreHeaderWidget {
  container: Container;
  private ctx: GameStatusContext;
  private unsubscribe: (() => void) | null = null;
  private scoreTxt: Text;
  private roundsTxt: Text;
  private avgTxt: Text;
  private bg: Graphics;

  constructor(ctx: GameStatusContext, layout: Layout) {
    this.ctx = ctx;
    this.container = new Container();

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.scoreTxt = new Text({
      text: "🏆  Score: 0",
      style: new TextStyle({ fontFamily: "Arial", fontSize: layout.scoreFontSize, fill: 0xffd700, fontWeight: "bold" }),
    });
    this.scoreTxt.anchor.set(0.5, 0.5);
    this.container.addChild(this.scoreTxt);

    this.roundsTxt = new Text({
      text: "0 rounds",
      style: new TextStyle({ fontFamily: "Arial", fontSize: layout.scoreStatFontSize, fill: 0xaaccff }),
    });
    this.roundsTxt.anchor.set(0, 0.5);
    this.container.addChild(this.roundsTxt);

    this.avgTxt = new Text({
      text: "avg: —",
      style: new TextStyle({ fontFamily: "Arial", fontSize: layout.scoreStatFontSize, fill: 0xaaccff }),
    });
    this.avgTxt.anchor.set(1, 0.5);
    this.container.addChild(this.avgTxt);

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

    this.scoreTxt.style.fontSize = scoreFontSize;
    this.scoreTxt.x = cx;
    this.scoreTxt.y = h / 2;

    this.roundsTxt.style.fontSize = scoreStatFontSize;
    this.roundsTxt.x = cx - scorePillW / 2 + 12;
    this.roundsTxt.y = h / 2;

    this.avgTxt.style.fontSize = scoreStatFontSize;
    this.avgTxt.x = cx + scorePillW / 2 - 12;
    this.avgTxt.y = h / 2;

    const hide = W < 400;
    this.roundsTxt.visible = !hide;
    this.avgTxt.visible = !hide;
  }

  private update(s: GameStatus): void {
    this.scoreTxt.text = `Score: ${s.totalScore}`;
    this.roundsTxt.text = `${s.roundsPlayed} rounds`;
    const avg = s.roundsPlayed > 0 ? (s.totalScore / s.roundsPlayed).toFixed(1) : "—";
    this.avgTxt.text = `avg: ${avg}`;
  }

  resize(layout: Layout): void { this.applyLayout(layout); }

  destroy(): void {
    this.unsubscribe?.();
    this.container.destroy({ children: true });
  }
}