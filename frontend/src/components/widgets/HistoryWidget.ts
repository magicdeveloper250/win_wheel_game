// widgets/HistoryWidget.ts
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { DropShadowFilter } from "pixi-filters";
import { GameHistoryContext, type HistoryEntry } from "@/contexts/GameHistoryContext";
import type { Layout } from "@/layouts/GameLayout";

function darkenColor(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * factor);
  const g = Math.floor(((color >> 8) & 0xff) * factor);
  const b = Math.floor((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function lightenColor(color: number): number {
  const r = Math.min(255, Math.floor(((color >> 16) & 0xff) * 1.5 + 60));
  const g = Math.min(255, Math.floor(((color >> 8) & 0xff) * 1.5 + 60));
  const b = Math.min(255, Math.floor((color & 0xff) * 1.5 + 60));
  return (r << 16) | (g << 8) | b;
}

function badgeBgFromSegment(segColor: number): number {
  return segColor <= 0x222222 ? 0x2a2a3a : darkenColor(segColor, 0.45);
}

function badgeTextFromSegment(segColor: number): number {
  return segColor <= 0x222222 ? 0xdddddd : lightenColor(segColor);
}

export class HistoryWidget {
  container: Container;

  private ctx: GameHistoryContext;
  private rowsContainer: Container;
  private panel: Graphics;
  private headerBg: Graphics;
  private headerText: Text;
  private pageText: Text;
  private rows: Container[] = [];
  private unsubscribe: (() => void) | null = null;
  private layout: Layout;

  private HEADER_H = 32;
  private FOOTER_H = 34;
  private PAD = 8;

  constructor(ctx: GameHistoryContext, layout: Layout) {
    this.ctx = ctx;
    this.layout = layout;
    this.container = new Container();

    this.container.filters = [
      new DropShadowFilter({ offset: { x: 0, y: 8 }, blur: 24, alpha: 0.7, color: 0x000000 }),
    ];

    // Panel bg
    this.panel = new Graphics();
    this.container.addChild(this.panel);

    // Header
    this.headerBg = new Graphics();
    this.container.addChild(this.headerBg);

    this.headerText = new Text({
      text: "Latest bets result",
      style: new TextStyle({
        fontFamily: "Century Gothic",
        fontSize: layout.historyFontMd,
        fill: 0xffffff,
        fontWeight: "bold",
        letterSpacing: 2,
      }),
    });
    this.headerText.anchor.set(0.5, 0.5);
    this.container.addChild(this.headerText);

    this.rowsContainer = new Container();
    this.container.addChild(this.rowsContainer);

    this.pageText = new Text({
      text: "1 / 1",
      style: new TextStyle({ fontFamily: "Century Gothic", fontSize: layout.historyFontSm, fill: 0xaaaacc }),
    });
    this.pageText.anchor.set(0.5, 0.5);

    this.applyLayout(layout);
    this.unsubscribe = this.ctx.subscribe((entries) => this.render(entries));
    this.render([]);
  }

  private maxRows(): number {
    const available = this.layout.H - this.layout.headerH - this.layout.statusBarH
      - this.HEADER_H - this.FOOTER_H - this.PAD * 4;
    return Math.max(1, Math.min(this.ctx.PAGE_SIZE, Math.floor(available / this.layout.historyRowH)));
  }

  private effectiveW(): number {
    const scale = Math.min(2, Math.max(1, this.layout.uiScale));
    return Math.round(this.layout.historyW * scale);
  }

  private applyLayout(layout: Layout): void {
    this.layout = layout;
    const W = this.effectiveW();
    const rowH = layout.historyRowH;

    this.HEADER_H = Math.round(Math.max(28, 34 * layout.uiScale));
    this.FOOTER_H = Math.round(Math.max(30, 36 * layout.uiScale));
    this.PAD = Math.round(Math.max(5, 7 * layout.uiScale));

    const rows = this.maxRows();
    const panelH = this.HEADER_H + rows * rowH + this.FOOTER_H + this.PAD;

    // Panel — glossy plastic body
    this.panel.clear();
    // Outer glow border
    this.panel.roundRect(-2, -2, W + 4, panelH + 4, 13);
    this.panel.fill({ color: 0x1a4a9e, alpha: 0.3 });
    // Main body
    this.panel.roundRect(0, 0, W, panelH, 11);
    this.panel.fill({ color: 0x071630, alpha: 0.97 });
    // Inner highlight top edge
    this.panel.roundRect(2, 2, W - 4, panelH - 4, 9);
    this.panel.stroke({ color: 0xffffff, alpha: 0.06, width: 1 });
    // Border
    this.panel.roundRect(0, 0, W, panelH, 11);
    this.panel.stroke({ color: 0x2255cc, width: 1.5, alpha: 0.8 });

    // Header — plastic ridge
    this.headerBg.clear();
    this.headerBg.roundRect(0, 0, W, this.HEADER_H, 11);
    this.headerBg.fill({ color: 0x0f3080, alpha: 1 });
    // Top gloss strip
    this.headerBg.roundRect(4, 2, W - 8, this.HEADER_H * 0.4, 6);
    this.headerBg.fill({ color: 0xffffff, alpha: 0.07 });
    // Bottom separator line
    this.headerBg.rect(0, this.HEADER_H - 1, W, 1);
    this.headerBg.fill({ color: 0x4477dd, alpha: 0.6 });

    this.headerText.style.fontSize = layout.historyFontMd;
    this.headerText.x = W / 2;
    this.headerText.y = this.HEADER_H / 2;

    this.rowsContainer.x = 0;
    this.rowsContainer.y = this.HEADER_H + this.PAD / 2;

    const btnY = this.FOOTER_H / 2;

    this.pageText.style.fontSize = layout.historyFontSm;
    this.pageText.x = W / 2;
    this.pageText.y = btnY;
  }

  private render(entries: HistoryEntry[]): void {
    this.rowsContainer.removeChildren();
    this.rows = [];

    const W = this.effectiveW();
    const rowH = this.layout.historyRowH;
    const fsm = this.layout.historyFontSm;
    const PAD = this.PAD;

    const COL_ID_X = PAD;

    const BADGE_W  = Math.round(W * 0.28);
    const BADGE_H  = Math.round(rowH * 0.72);
    const LETTER_W = Math.round(rowH * 0.85);
    const LETTER_H = Math.round(rowH * 0.72);

    const INNER_GAP    = Math.round(PAD * 0.5);
    const GROUP_W      = LETTER_W + INNER_GAP + BADGE_W;
    const COL_LETTER_X = W - PAD - GROUP_W;
    const COL_POINTS_X = COL_LETTER_X + LETTER_W + INNER_GAP;

    const ID_MAX_W = COL_LETTER_X - COL_ID_X - PAD;

    entries.forEach((entry, idx) => {
      const row = new Container();
      row.y = idx * rowH;

      // Alternating row bg
      const rowBg = new Graphics();
      rowBg.rect(0, 0, W, rowH - 1);
      rowBg.fill({ color: idx % 2 === 0 ? 0x0a1f45 : 0x060f28, alpha: 0.9 });
      row.addChild(rowBg);

      // Row top highlight line
      const rowLine = new Graphics();
      rowLine.rect(0, 0, W, 1);
      rowLine.fill({ color: 0xffffff, alpha: idx % 2 === 0 ? 0.04 : 0.02 });
      row.addChild(rowLine);

      // Game ID
      const idTxt = new Text({
        text: `#${entry.gameId}`,
        style: new TextStyle({ fontFamily: "Century Gothic", fontSize: fsm, fill: 0x6688bb }),
      });
      idTxt.anchor.set(0, 0.5);
      idTxt.x = COL_ID_X;
      idTxt.y = rowH / 2;
      idTxt.style.wordWrap = false;
      const idMask = new Graphics();
      idMask.rect(COL_ID_X, 0, ID_MAX_W, rowH);
      idMask.fill({ color: 0xffffff });
      row.addChild(idMask);
      idTxt.mask = idMask;
      row.addChild(idTxt);

      // Letter badge
      const letterBadge = new Graphics();
      letterBadge.roundRect(0, 0, LETTER_W, LETTER_H, 4);
      letterBadge.fill({ color: entry.letterColor });
      // Gloss on badge
      letterBadge.roundRect(1, 1, LETTER_W - 2, LETTER_H * 0.45, 3);
      letterBadge.fill({ color: 0xffffff, alpha: 0.15 });
      letterBadge.x = COL_LETTER_X;
      letterBadge.y = (rowH - LETTER_H) / 2;
      row.addChild(letterBadge);

      const letterTxt = new Text({
        text: entry.letter,
        style: new TextStyle({ fontFamily: "Century Gothic", fontSize: fsm, fill: 0xffffff, fontWeight: "bold" }),
      });
      letterTxt.anchor.set(0.5, 0.5);
      letterTxt.x = COL_LETTER_X + LETTER_W / 2;
      letterTxt.y = rowH / 2;
      row.addChild(letterTxt);

      // Points badge
      const bgColor = badgeBgFromSegment(entry.segmentColor);
      const textColor = badgeTextFromSegment(entry.segmentColor);
      const badge = new Graphics();
      badge.roundRect(0, 0, BADGE_W, BADGE_H, 4);
      badge.fill({ color: bgColor });
      // Gloss on badge
      badge.roundRect(1, 1, BADGE_W - 2, BADGE_H * 0.45, 3);
      badge.fill({ color: 0xffffff, alpha: 0.12 });
      badge.x = COL_POINTS_X;
      badge.y = (rowH - BADGE_H) / 2;
      row.addChild(badge);

      const badgeTxt = new Text({
        text: `${entry.points}`,
        style: new TextStyle({ fontFamily: "Century Gothic", fontSize: fsm, fill: textColor, fontWeight: "bold" }),
      });
      badgeTxt.anchor.set(0.5, 0.5);
      badgeTxt.x = COL_POINTS_X + BADGE_W / 2;
      badgeTxt.y = rowH / 2;
      row.addChild(badgeTxt);

      this.rowsContainer.addChild(row);
      this.rows.push(row);
    });

    if (entries.length === 0) {
      const empty = new Text({
        text: "No games yet",
        style: new TextStyle({ fontFamily: "Century Gothic", fontSize: fsm, fill: 0x3355aa }),
      });
      empty.anchor.set(0.5, 0.5);
      empty.x = W / 2;
      empty.y = 60;
      this.rowsContainer.addChild(empty);
    }
  }

  resize(layout: Layout): void {
    this.applyLayout(layout);
    this.render(this.ctx.getPage(this.ctx.getCurrentPage()));
  }

  destroy(): void {
    this.unsubscribe?.();
    this.container.destroy({ children: true });
  }
}