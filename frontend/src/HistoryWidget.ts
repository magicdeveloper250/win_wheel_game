// widgets/HistoryWidget.ts
import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { DropShadowFilter } from "pixi-filters";
import { GameHistoryContext, type HistoryEntry } from "./GameHistoryContext";
import type { Layout } from "./layout";

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
  // Exposed so App.tsx can register them with FocusManager
  prevBtnContainer: Container;
  nextBtnContainer: Container;

  private ctx: GameHistoryContext;
  private rowsContainer: Container;
  private paginationContainer: Container;
  private panel: Graphics;
  private headerBg: Graphics;
  private footerBg: Graphics;
  private headerText: Text;
  private pageText: Text;
  private prevBtnBg: Graphics;
  private nextBtnBg: Graphics;
  private rows: Container[] = [];
  private unsubscribe: (() => void) | null = null;
  private layout: Layout;

  // Computed per layout
  private HEADER_H = 32;
  private FOOTER_H = 34;
  private PAD = 8;

  constructor(ctx: GameHistoryContext, layout: Layout) {
    this.ctx = ctx;
    this.layout = layout;
    this.container = new Container();

    this.container.filters = [
      new DropShadowFilter({ offset: { x: 3, y: 3 }, blur: 8, alpha: 0.5, color: 0x000000 }),
    ];

    // Panel bg
    this.panel = new Graphics();
    this.container.addChild(this.panel);

    // Header
    this.headerBg = new Graphics();
    this.container.addChild(this.headerBg);

    this.headerText = new Text({
      text: "History",
      style: new TextStyle({
        fontFamily: "Arial",
        fontSize: layout.historyFontMd,
        fill: 0xffffff,
        fontWeight: "bold",
        letterSpacing: 2,
      }),
    });
    this.headerText.anchor.set(0.5, 0.5);
    this.container.addChild(this.headerText);

    // Rows
    this.rowsContainer = new Container();
    this.container.addChild(this.rowsContainer);

    // Pagination footer
    this.paginationContainer = new Container();
    this.container.addChild(this.paginationContainer);

    this.footerBg = new Graphics();
    this.paginationContainer.addChild(this.footerBg);

    // Prev button
    this.prevBtnBg = new Graphics();
    this.prevBtnContainer = new Container();
    this.prevBtnContainer.eventMode = "static";
    this.prevBtnContainer.cursor = "pointer";
    this.prevBtnContainer.addChild(this.prevBtnBg);
    const prevTxt = new Text({ text: "‹ Prev", style: new TextStyle({ fontFamily: "Arial", fontSize: 12, fill: 0xffd700, fontWeight: "bold" }) });
    prevTxt.anchor.set(0.5, 0.5);
    this.prevBtnContainer.addChild(prevTxt);
    this.prevBtnContainer.on("pointerdown", () => this.ctx.setPage(this.ctx.getCurrentPage() - 1));
    this.prevBtnContainer.on("pointerover", () => { this.prevBtnBg.alpha = 1; });
    this.prevBtnContainer.on("pointerout", () => { this.prevBtnBg.alpha = 0.6; });
    this.paginationContainer.addChild(this.prevBtnContainer);

    // Page label
    this.pageText = new Text({
      text: "1 / 1",
      style: new TextStyle({ fontFamily: "Arial", fontSize: layout.historyFontSm, fill: 0xaaaacc }),
    });
    this.pageText.anchor.set(0.5, 0.5);
    this.paginationContainer.addChild(this.pageText);

    // Next button
    this.nextBtnBg = new Graphics();
    this.nextBtnContainer = new Container();
    this.nextBtnContainer.eventMode = "static";
    this.nextBtnContainer.cursor = "pointer";
    this.nextBtnContainer.addChild(this.nextBtnBg);
    const nextTxt = new Text({ text: "Next ›", style: new TextStyle({ fontFamily: "Arial", fontSize: 12, fill: 0xffd700, fontWeight: "bold" }) });
    nextTxt.anchor.set(0.5, 0.5);
    this.nextBtnContainer.addChild(nextTxt);
    this.nextBtnContainer.on("pointerdown", () => this.ctx.setPage(this.ctx.getCurrentPage() + 1));
    this.nextBtnContainer.on("pointerover", () => { this.nextBtnBg.alpha = 1; });
    this.nextBtnContainer.on("pointerout", () => { this.nextBtnBg.alpha = 0.6; });
    this.paginationContainer.addChild(this.nextBtnContainer);

    this.applyLayout(layout);
    this.unsubscribe = this.ctx.subscribe((entries) => this.render(entries));
    this.render([]);
  }

  private maxRows(): number {
    const available = this.layout.H - this.layout.headerH - this.layout.statusBarH
      - this.HEADER_H - this.FOOTER_H - this.PAD * 4;
    return Math.max(1, Math.min(this.ctx.PAGE_SIZE, Math.floor(available / this.layout.historyRowH)));
  }

  private applyLayout(layout: Layout): void {
    this.layout = layout;
    const W = layout.historyW;
    const rowH = layout.historyRowH;

    // Scale header/footer with uiScale
    this.HEADER_H = Math.round(Math.max(28, 34 * layout.uiScale));
    this.FOOTER_H = Math.round(Math.max(30, 36 * layout.uiScale));
    this.PAD = Math.round(Math.max(5, 7 * layout.uiScale));

    const rows = this.maxRows();
    const panelH = this.HEADER_H + rows * rowH + this.FOOTER_H + this.PAD;

    // Panel
    this.panel.clear();
    this.panel.roundRect(0, 0, W, panelH, 10);
    this.panel.fill({ color: 0x0b2050, alpha: 0.94 });
    this.panel.stroke({ color: 0x2a5298, width: 1.5 });

    // Header
    this.headerBg.clear();
    this.headerBg.roundRect(0, 0, W, this.HEADER_H, 10);
    this.headerBg.fill({ color: 0x1a3a7a });

    this.headerText.style.fontSize = layout.historyFontMd;
    this.headerText.x = W / 2;
    this.headerText.y = this.HEADER_H / 2;

    // Rows container
    this.rowsContainer.x = 0;
    this.rowsContainer.y = this.HEADER_H + this.PAD / 2;

    // Pagination
    this.paginationContainer.y = this.HEADER_H + this.PAD / 2 + rows * rowH + 4;

    this.footerBg.clear();
    this.footerBg.rect(0, 0, W, this.FOOTER_H);
    this.footerBg.fill({ color: 0x091838, alpha: 0.9 });

    // Prev/next button sizing — each takes ~40% of width
    const btnW = Math.round(W * 0.4);
    const btnH = Math.round(this.FOOTER_H * 0.7);
    const btnY = this.FOOTER_H / 2;

    this.prevBtnBg.clear();
    this.prevBtnBg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
    this.prevBtnBg.fill({ color: 0x2a5298, alpha: 0.6 });
    this.prevBtnContainer.x = btnW / 2 + this.PAD;
    this.prevBtnContainer.y = btnY;

    this.nextBtnBg.clear();
    this.nextBtnBg.roundRect(-btnW / 2, -btnH / 2, btnW, btnH, 4);
    this.nextBtnBg.fill({ color: 0x2a5298, alpha: 0.6 });
    this.nextBtnContainer.x = W - btnW / 2 - this.PAD;
    this.nextBtnContainer.y = btnY;

    this.pageText.style.fontSize = layout.historyFontSm;
    this.pageText.x = W / 2;
    this.pageText.y = btnY;
  }

  private render(entries: HistoryEntry[]): void {
    this.rowsContainer.removeChildren();
    this.rows = [];

    const totalPages = this.ctx.getTotalPages();
    const currentPage = this.ctx.getCurrentPage();
    this.pageText.text = `${currentPage + 1}/${totalPages}`;
    this.prevBtnContainer.alpha = currentPage > 0 ? 1 : 0.3;
    this.nextBtnContainer.alpha = currentPage < totalPages - 1 ? 1 : 0.3;

    const W = this.layout.historyW;
    const rowH = this.layout.historyRowH;
    const fsm = this.layout.historyFontSm;
    const PAD = this.PAD;

    entries.forEach((entry, idx) => {
      const row = new Container();
      row.y = idx * rowH;

      // Alternating row bg
      const rowBg = new Graphics();
      rowBg.rect(0, 0, W, rowH - 1);
      rowBg.fill({ color: idx % 2 === 0 ? 0x0d2a5e : 0x091f4a, alpha: 0.7 });
      row.addChild(rowBg);

      // Game ID — left aligned
      const idTxt = new Text({
        text: `#${entry.gameId}`,
        style: new TextStyle({ fontFamily: "Arial", fontSize: fsm, fill: 0x8899cc }),
      });
      idTxt.anchor.set(0, 0.5);
      idTxt.x = PAD;
      idTxt.y = rowH / 2;
      // Clamp ID text width so it doesn't eat badge space
      idTxt.style.wordWrap = false;
      row.addChild(idTxt);

      // Letter badge (inner ring result) — center
      const letterBadgeW = Math.round(rowH * 0.85);
      const letterBadgeH = Math.round(rowH * 0.72);
      const letterBadge = new Graphics();
      letterBadge.roundRect(0, 0, letterBadgeW, letterBadgeH, 3);
      letterBadge.fill({ color: 0x1a3a7a });
      letterBadge.x = Math.round(W * 0.48);
      letterBadge.y = (rowH - letterBadgeH) / 2;
      row.addChild(letterBadge);

      const letterTxt = new Text({
        text: entry.letter,
        style: new TextStyle({ fontFamily: "Arial", fontSize: fsm, fill: 0xffd700, fontWeight: "bold" }),
      });
      letterTxt.anchor.set(0.5, 0.5);
      letterTxt.x = letterBadge.x + letterBadgeW / 2;
      letterTxt.y = rowH / 2;
      row.addChild(letterTxt);

      // Points badge — right aligned, colored by segment
      const badgeW = Math.round(W * 0.28);
      const badgeH = Math.round(rowH * 0.72);
      const bgColor = badgeBgFromSegment(entry.segmentColor);
      const textColor = badgeTextFromSegment(entry.segmentColor);
      const badge = new Graphics();
      badge.roundRect(0, 0, badgeW, badgeH, 3);
      badge.fill({ color: bgColor });
      badge.x = W - PAD - badgeW;
      badge.y = (rowH - badgeH) / 2;
      row.addChild(badge);

      const badgeTxt = new Text({
        text: `${entry.points}`,
        style: new TextStyle({ fontFamily: "Arial", fontSize: fsm, fill: textColor, fontWeight: "bold" }),
      });
      badgeTxt.anchor.set(0.5, 0.5);
      badgeTxt.x = badge.x + badgeW / 2;
      badgeTxt.y = rowH / 2;
      row.addChild(badgeTxt);

      this.rowsContainer.addChild(row);
      this.rows.push(row);
    });

    if (entries.length === 0) {
      const empty = new Text({
        text: "No games yet",
        style: new TextStyle({ fontFamily: "Arial", fontSize: fsm, fill: 0x5577aa }),
      });
      empty.anchor.set(0.5, 0.5);
      empty.x = this.layout.historyW / 2;
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