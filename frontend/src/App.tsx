// App.tsx — PixiJS v8 | Full-screen | TV-remote + keyboard navigable
import React, { useEffect, useRef, useCallback } from "react";
import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
} from "pixi.js";
import { BevelFilter, DropShadowFilter } from "pixi-filters";

// Contexts
import { gameHistory } from "./GameHistoryContext";
import { gameStatus } from "./GameStatusContext";

// Managers
import { audioManager } from "./AudioManager";
import { FocusManager } from "./FocusManager";

// Widgets
import { HistoryWidget } from "./HistoryWidget";
import { StatusBarWidget } from "./StatusBarWidget";
import { ScoreHeaderWidget } from "./ScoreHeaderWidget";
import { ResultOverlayWidget } from "./ResultOverlayWidget";
import { FocusableButton } from "./FocusableButton";

// Utils
import {
  OUTER_SEGMENTS,
  MIDDLE_SEGMENTS,
  OUTER_DURATION,
  MIDDLE_DURATION,
  OUTER_RADIUS,
  MIDDLE_RADIUS,
  INNER_RADIUS,
  easeOut,
  segmentAtTop,
} from "./segments";
import { buildRingContainer, RING_FILTERS } from "./wheelBuilder";
import { computeLayout, type Layout } from "./layout";

// ── Module-level singletons (survive React re-renders) ────────────────────────
let globalApp: Application | null = null;
let historyWidget: HistoryWidget | null = null;
let statusBarWidget: StatusBarWidget | null = null;
let scoreHeaderWidget: ScoreHeaderWidget | null = null;
let resultOverlay: ResultOverlayWidget | null = null;
let focusManager: FocusManager | null = null;

const App: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const outerRingRef = useRef<Container | null>(null);
  const midRingRef = useRef<Container | null>(null);
  const midLabelsRef = useRef<Container | null>(null);
  const animRef = useRef<number | null>(null);
  const spinningRef = useRef(false);
  const innerLetterRef = useRef<Text | null>(null);
  const layoutRef = useRef<Layout | null>(null);

  // ── Spin logic ─────────────────────────────────────────────────────────────
  const spinWheel = useCallback(() => {
    if (spinningRef.current || !outerRingRef.current || !midRingRef.current) return;
    spinningRef.current = true;

    gameStatus.onSpinStart();
    audioManager.playSpinStart();

    if (resultOverlay) resultOverlay.hide();

    const outerDelta =
      (10 + Math.random() * 10) * Math.PI * 2 + Math.random() * Math.PI * 2;
    const midDelta = -(
      (7 + Math.random() * 8) * Math.PI * 2 + Math.random() * Math.PI * 2
    );
    const outerStart = outerRingRef.current.rotation;
    const midStart = midRingRef.current.rotation;
    const t0 = performance.now();
    let outerDone = false, midDone = false, tickStarted = false;

    const animate = (now: number) => {
      const elapsed = now - t0;

      if (!outerDone && outerRingRef.current) {
        const p = Math.min(1, elapsed / OUTER_DURATION);
        outerRingRef.current.rotation = outerStart + outerDelta * easeOut(p, 4);
        if (p >= 1) outerDone = true;
        if (p > 0.15 && !tickStarted) { tickStarted = true; audioManager.startTick(60); }
        if (p > 0.75) audioManager.stopTick();
      }
      if (!midDone && midRingRef.current) {
        const p = Math.min(1, elapsed / MIDDLE_DURATION);
        const rot = midStart + midDelta * easeOut(p, 3);
        midRingRef.current.rotation = rot;
        if (midLabelsRef.current) midLabelsRef.current.rotation = rot;
        if (p >= 1) midDone = true;
      }

      // Update focus ring position every frame during spin
      focusManager?.tick();

      if (!outerDone || !midDone) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        audioManager.stopTick();
        audioManager.slowTick(600);

        const oi = segmentAtTop(outerRingRef.current!.rotation, OUTER_SEGMENTS.length);
        const mi = segmentAtTop(midRingRef.current!.rotation, MIDDLE_SEGMENTS.length);
        const outerSeg = OUTER_SEGMENTS[oi];
        const midSeg = MIDDLE_SEGMENTS[mi];
        const pts = typeof outerSeg.value === "number" ? outerSeg.value : 0;

        if (innerLetterRef.current) innerLetterRef.current.text = midSeg.label;
        setTimeout(() => audioManager.playWin(pts), 650);

        setTimeout(() => {
          const segColor = outerSeg.color ?? 0x1a1a1a;
          gameHistory.addEntry(midSeg.label, pts, pts, segColor);
          gameStatus.onSpinComplete(midSeg.label, pts, pts);

          if (resultOverlay && layoutRef.current) {
            const layout = layoutRef.current;
            resultOverlay.show(midSeg.label, pts, pts);
            resultOverlay.setPosition(layout.btnCenterX, layout.btnAreaY - 20);
            // Trap focus to overlay dismiss button when result shows
            focusManager?.setActiveGroup("overlay");
          }
        }, 700);

        spinningRef.current = false;
        animRef.current = null;
      }
    };

    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    gameStatus.setSpinCallback(spinWheel);
  }, [spinWheel]);

  const resetGame = useCallback(() => {
    if (spinningRef.current) return;
    audioManager.playClick();
    gameStatus.resetScore();
    gameHistory.clear();
    if (innerLetterRef.current) innerLetterRef.current.text = "";
    if (resultOverlay) resultOverlay.hide();
    focusManager?.setActiveGroup("default");
  }, []);

  // ── Build scene ────────────────────────────────────────────────────────────
  const buildScene = useCallback(
    (app: Application) => {
      app.stage.removeChildren();

      // Clean up previous drop animation ticker + status subscription
      if ((app as any)._dropCleanup) {
        (app as any)._dropCleanup();
        (app as any)._dropCleanup = null;
      }

      // Destroy old widgets & focus manager
      historyWidget?.destroy();
      statusBarWidget?.destroy();
      scoreHeaderWidget?.destroy();
      focusManager?.destroy();
      historyWidget = null;
      statusBarWidget = null;
      scoreHeaderWidget = null;
      resultOverlay = null;
      focusManager = null;

      const W = app.screen.width;
      const H = app.screen.height;
      const layout = computeLayout(W, H);
      layoutRef.current = layout;

      // Init focus manager (must be first so its ring is added to stage)
      focusManager = new FocusManager(app);

      // ── BACKGROUND ────────────────────────────────────────────────────────
      const bg = new Graphics();
      bg.rect(0, 0, W, H);
      bg.fill({ color: 0x0e2456 });
      app.stage.addChild(bg);

      const pattern = new Graphics();
      const spacing = Math.round(40 * layout.uiScale);
      const dotSize = Math.round(12 * layout.uiScale);
      for (let x = 0; x < W; x += spacing) {
        for (let y = 0; y < H; y += spacing) {
          const ox = (y / spacing) % 2 === 0 ? 0 : spacing / 2;
          pattern.moveTo(x + ox, y - dotSize);
          pattern.lineTo(x + ox + dotSize, y);
          pattern.lineTo(x + ox, y + dotSize);
          pattern.lineTo(x + ox - dotSize, y);
          pattern.closePath();
        }
      }
      pattern.fill({ color: 0x1a3a6e, alpha: 0.5 });
      app.stage.addChild(pattern);

      // ── SCORE HEADER ──────────────────────────────────────────────────────
      scoreHeaderWidget = new ScoreHeaderWidget(gameStatus, layout);
      scoreHeaderWidget.container.y = 5;
      app.stage.addChild(scoreHeaderWidget.container);

      // ── HISTORY PANEL ─────────────────────────────────────────────────────
      if (layout.historyVisible) {
        historyWidget = new HistoryWidget(gameHistory, layout);
        historyWidget.container.x = layout.pad;
        historyWidget.container.y = layout.headerH + layout.pad;
        app.stage.addChild(historyWidget.container);

        // Register history pagination buttons with focus manager
        if (historyWidget.prevBtnContainer) {
          focusManager.addItem(
            historyWidget.prevBtnContainer,
            () => gameHistory.setPage(gameHistory.getCurrentPage() - 1),
            { group: "default", label: "History Prev" },
          );
        }
        if (historyWidget.nextBtnContainer) {
          focusManager.addItem(
            historyWidget.nextBtnContainer,
            () => gameHistory.setPage(gameHistory.getCurrentPage() + 1),
            { group: "default", label: "History Next" },
          );
        }
      }

      // ── WHEEL ──────────────────────────────────────────────────────────────
      const wheelContainer = new Container();
      wheelContainer.x = layout.wheelX;
      wheelContainer.y = layout.wheelY;
      wheelContainer.filters = [
        new BevelFilter({ rotation: 45, thickness: 4, lightColor: 0xffffff, lightAlpha: 0.9, shadowColor: 0x000000, shadowAlpha: 0.6 }),
        new DropShadowFilter({ offset: { x: 4, y: 8 }, blur: 6, alpha: 0.7, color: 0x000000 }),
      ];
      wheelContainer.scale.set(layout.wheelScale);
      app.stage.addChild(wheelContainer);

      const outer = buildRingContainer(OUTER_SEGMENTS, MIDDLE_RADIUS, OUTER_RADIUS, 13);
      outer.filters = RING_FILTERS();
      wheelContainer.addChild(outer);
      outerRingRef.current = outer;

      const mid = buildRingContainer(MIDDLE_SEGMENTS, INNER_RADIUS, MIDDLE_RADIUS, 36);
      mid.filters = RING_FILTERS();
      wheelContainer.addChild(mid);
      midRingRef.current = mid;

      // Center drop — clickable to spin
      const centerContainer = new Container();
      centerContainer.eventMode = "static";
      centerContainer.cursor = "pointer";
      wheelContainer.addChild(centerContainer);

      const bodyR = INNER_RADIUS, bodyY = 0, tipY = -(INNER_RADIUS * 2);

      const drop = new Graphics();
      drop.moveTo(0, tipY);
      drop.bezierCurveTo(bodyR * 0.45, tipY * 0.7, bodyR, bodyY - bodyR * 0.6, bodyR, bodyY);
      drop.arc(0, bodyY, bodyR, 0, Math.PI);
      drop.bezierCurveTo(-bodyR, bodyY - bodyR * 0.6, -bodyR * 0.45, tipY * 0.7, 0, tipY);
      drop.closePath();
      drop.fill({ color: 0xe8df59 });
      drop.stroke({ color: 0xffd700, width: 2 });
      drop.filters = [
        new BevelFilter({ rotation: 45, thickness: 4, lightColor: 0xffffff, lightAlpha: 0.9, shadowColor: 0x000000, shadowAlpha: 0.6 }),
        new DropShadowFilter({ offset: { x: 4, y: 8 }, blur: 6, alpha: 0.7, color: 0x000000 }),
      ];
      centerContainer.addChild(drop);

      const innerCircle = new Graphics();
      innerCircle.circle(0, bodyY, bodyR);
      innerCircle.fill({ color: 0xbf3a15 });
      innerCircle.filters = [new BevelFilter({ rotation: 45, thickness: 3, lightColor: 0xffffff, lightAlpha: 0.8, shadowColor: 0x000000, shadowAlpha: 0.5 })];
      centerContainer.addChild(innerCircle);

      const innerLetter = new Text({
        text: "",
        style: new TextStyle({ fontFamily: "Arial", fontSize: 40, fontWeight: "bold", fill: 0xffffff }),
      });
      innerLetter.anchor.set(0.5, 0.5);
      centerContainer.addChild(innerLetter);
      innerLetterRef.current = innerLetter;

      // Pulsing "SPIN" hint on the drop — shown when idle, hidden while spinning
      const spinHint = new Text({
        text: "TAP",
        style: new TextStyle({ fontFamily: "Arial", fontSize: 10, fontWeight: "bold", fill: 0xffd700, align: "center" }),
      });
      spinHint.anchor.set(0.5, 0.5);
      spinHint.y = tipY * 0.55; // sits in the teardrop tip area
      centerContainer.addChild(spinHint);

      // Pulse animation on the hint
      let pulseT = 0;
      const pulseTicker = (ticker: { deltaTime: number }) => {
        pulseT += ticker.deltaTime * 0.05;
        spinHint.alpha = 0.5 + 0.5 * Math.sin(pulseT);
      };
      app.ticker.add(pulseTicker);

      // Click/tap the drop to spin
      centerContainer.on("pointerdown", () => {
        audioManager.playClick();
        spinWheel();
      });
      centerContainer.on("pointerover", () => {
        if (!spinningRef.current) {
          drop.tint = 0xffffaa;
          innerCircle.tint = 0xff6644;
        }
      });
      centerContainer.on("pointerout", () => {
        drop.tint = 0xffffff;
        innerCircle.tint = 0xffffff;
      });

      // Hide hint while spinning, show when idle
      const unsubSpin = gameStatus.subscribe((s) => {
        const spinning = s.phase === "spinning" || s.phase === "countdown";
        spinHint.visible = !spinning;
        if (spinning) {
          drop.tint = 0xffffff;
          innerCircle.tint = 0xffffff;
        }
      });
      // Clean up on next buildScene
      app.ticker.add(() => {}); // keep ticker alive
      (centerContainer as any)._cleanup = () => {
        app.ticker.remove(pulseTicker);
        unsubSpin();
      };

      // Store cleanup so next buildScene can remove the ticker + subscription
      (app as any)._dropCleanup = () => {
        app.ticker.remove(pulseTicker);
        unsubSpin();
      };

      // Mid label overlay
      const midLabels = new Container();
      wheelContainer.addChild(midLabels);
      midLabelsRef.current = midLabels;
      const midCount = MIDDLE_SEGMENTS.length;
      const midAngleStep = (Math.PI * 2) / midCount;
      MIDDLE_SEGMENTS.forEach((seg, i) => {
        const startA = i * midAngleStep - Math.PI / 2;
        const midA = startA + midAngleStep / 2;
        const labelR = (INNER_RADIUS + MIDDLE_RADIUS) / 2;
        const lbl = new Text({
          text: seg.label,
          style: new TextStyle({ fontFamily: "Arial, sans-serif", fontSize: 36, fill: 0xffffff, fontWeight: "bold" }),
        });
        lbl.anchor.set(0.5, 0.5);
        lbl.x = Math.cos(midA) * labelR;
        lbl.y = Math.sin(midA) * labelR;
        const isLeftHalf = Math.cos(midA) < 0;
        lbl.rotation = isLeftHalf ? midA - Math.PI / 2 : midA + Math.PI / 2;
        midLabels.addChild(lbl);
      });

      // Gold border + pointer
      const brd = new Graphics();
      brd.circle(0, 0, OUTER_RADIUS + 8);
      brd.stroke({ color: 0xffd700, width: 12 });
      wheelContainer.addChild(brd);

      const ptr = new Graphics();
      const ptrTop = -(OUTER_RADIUS + 28), ptrMid = -(OUTER_RADIUS + 2), ptrTip = -(OUTER_RADIUS - 20);
      ptr.moveTo(-16, ptrTop); ptr.lineTo(16, ptrTop); ptr.lineTo(16, ptrMid);
      ptr.lineTo(0, ptrTip); ptr.lineTo(-16, ptrMid); ptr.closePath();
      ptr.fill({ color: 0x111111 }); ptr.stroke({ color: 0xffd700, width: 3 });
      wheelContainer.addChild(ptr);

      // ── BUTTONS — only Reset remains, centered ────────────────────────────
      const { btnAreaY, btnCenterX, spinBtnH, resetBtnW, resetFontSize, pad } = layout;

      const resetBtn = new FocusableButton({
        width: resetBtnW,
        height: spinBtnH,
        radius: spinBtnH / 2,
        fillColor: 0x1e3a70,
        fillAlpha: 0.7,
        hoverFill: 0x2a5298,
        pressedFill: 0x162d5a,
        strokeColor: 0xffffff,
        strokeWidth: 1.5,
        label: "Reset",
        icon: "↺",
        fontSize: resetFontSize,
        fontColor: 0xffffff,
      });
      resetBtn.setActivateCallback(() => { audioManager.playClick(); resetGame(); });
      resetBtn.container.x = btnCenterX;
      resetBtn.container.y = btnAreaY;
      app.stage.addChild(resetBtn.container);

      // Register drop + reset with FocusManager
      focusManager.addItem(
        centerContainer,
        () => { audioManager.playClick(); spinWheel(); },
        { group: "default", label: "Spin (drop)" },
      );
      focusManager.addItem(resetBtn.container, () => { audioManager.playClick(); resetGame(); }, { group: "default", label: "Reset" });

      // Hint
      if (layout.mode !== "phone-portrait" && layout.mode !== "phone-landscape") {
        const hint = new Text({
          text: "Tap the drop to spin  |  Tab / ← → ↑ ↓ to navigate  |  Enter to activate",
          style: new TextStyle({ fontFamily: "Arial", fontSize: Math.max(9, Math.round(10 * layout.uiScale)), fill: 0x7799cc, align: "center" }),
        });
        hint.anchor.set(0.5, 0);
        hint.x = btnCenterX;
        hint.y = btnAreaY + spinBtnH / 2 + pad;
        app.stage.addChild(hint);
      }

      // ── RESULT OVERLAY ────────────────────────────────────────────────────
      resultOverlay = new ResultOverlayWidget(W);
      resultOverlay.setPosition(btnCenterX, btnAreaY - 20);

      // Dismiss button inside overlay — registered in "overlay" group
      const dismissBtn = resultOverlay.getDismissButton();
      if (dismissBtn) {
        focusManager.addItem(
          dismissBtn,
          () => {
            resultOverlay?.hide();
            focusManager?.setActiveGroup("default");
          },
          { group: "overlay", label: "Dismiss result" },
        );
      }
      resultOverlay.setDismissCallback(() => {
        focusManager?.setActiveGroup("default");
      });
      app.stage.addChild(resultOverlay.container);

      // ── STATUS BAR ────────────────────────────────────────────────────────
      statusBarWidget = new StatusBarWidget(gameStatus, layout, focusManager);
      statusBarWidget.container.y = H - layout.statusBarH;
      app.stage.addChild(statusBarWidget.container);

      // ── PHONE PORTRAIT: mini history strip ───────────────────────────────
      if (!layout.historyVisible) {
        const strip = new Container();
        strip.x = W - pad;
        strip.y = layout.headerH / 2;
        const entries = gameHistory.getAll().slice(0, 5);
        entries.forEach((e, i) => {
          const bW = 28, bH = 18;
          const badge = new Graphics();
          badge.roundRect(-(i + 1) * (bW + 3), -bH / 2, bW, bH, 4);
          badge.fill({ color: e.segmentColor <= 0x222222 ? 0x2a2a3a : e.segmentColor });
          strip.addChild(badge);
          const txt = new Text({ text: `${e.points}`, style: new TextStyle({ fontFamily: "Arial", fontSize: 9, fill: 0xffffff, fontWeight: "bold" }) });
          txt.anchor.set(0.5, 0.5);
          txt.x = -(i + 1) * (bW + 3) + bW / 2;
          strip.addChild(txt);
        });
        app.stage.addChild(strip);
      }

      // Focus first button by default (silent — no ring until keyboard used)
      focusManager.focusFirst();
    },
    [spinWheel, resetGame],
  );

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;
    if (globalApp) {
      try { globalApp.destroy(true, { children: true }); } catch {}
      globalApp = null;
    }

    const app = new Application();
    app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x0e2456,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      if (!mountRef.current) { app.destroy(true, { children: true }); return; }
      while (mountRef.current.firstChild) mountRef.current.removeChild(mountRef.current.firstChild);
      mountRef.current.appendChild(app.canvas);
      app.canvas.setAttribute("tabindex", "0");
      (app.canvas as HTMLElement).style.outline = "none";
      (app.canvas as HTMLElement).focus();
      appRef.current = app;
      globalApp = app;
      buildScene(app);
    });

    const handleResize = () => {
      if (!appRef.current) return;
      appRef.current.renderer.resize(window.innerWidth, window.innerHeight);
      buildScene(appRef.current);
      (appRef.current.canvas as HTMLElement).focus();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
      historyWidget?.destroy();
      statusBarWidget?.destroy();
      scoreHeaderWidget?.destroy();
      focusManager?.destroy();
      audioManager.destroy();
      try { app.destroy(true, { children: true }); } catch {}
      if (globalApp === app) globalApp = null;
      appRef.current = null;
      outerRingRef.current = null;
      midRingRef.current = null;
      midLabelsRef.current = null;
    };
  }, [buildScene]);

  return (
    <div
      ref={mountRef}
      style={{ width: "100vw", height: "100vh", overflow: "hidden", display: "block", position: "fixed", top: 0, left: 0, background: "#0e2456", touchAction: "none" }}
    />
  );
};

export default App;