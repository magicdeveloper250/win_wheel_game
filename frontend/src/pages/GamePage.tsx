// GamePage.tsx — PixiJS v8 | Full-screen | TV-remote + keyboard navigable
import React, { useEffect, useRef, useCallback, useState } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { BevelFilter, DropShadowFilter } from "pixi-filters";
import { HistoryWidget } from "@/components/widgets/HistoryWidget";
import { StatusBarWidget } from "@/components/widgets/StatusBarWidget";
import { ScoreHeaderWidget } from "@/components/widgets/ScoreHeaderWidget";
import { ResultOverlayWidget } from "@/components/widgets/ResultOverlayWidget";
import { PredictionModal } from "@/components/ui/PredictionModal";
import { FocusManager } from "@/managers/FocusManager";
import { computeLayout, type Layout } from "@/layouts/GameLayout";
import { gameStatus } from "@/contexts/GameStatusContext";
import { predictionCtx } from "@/contexts/PredictionContext";
import { audioManager } from "@/managers/AudioManager";
import {
  easeOut,
  INNER_RADIUS,
  MIDDLE_RADIUS,
  OUTER_RADIUS,
  segmentAtTop,
  type Segment,
} from "@/lib/segments";
import { gameHistory } from "@/contexts/GameHistoryContext";
import { buildRingContainer, RING_FILTERS } from "@/lib/wheelBuilder";
import { FocusableButton } from "@/components/ui/FocusableButton";
import useUserAxios from "@/hooks/useUserAxios";
import type {
  GameSession,
  GameTargetNumberSetting,
  GameWinMultiplierSetting,
} from "@/lib/types";
import { toast } from "sonner";

// ── Module-level singletons ───────────────────────────────────────────────────
let globalApp: Application | null = null;
let historyWidget: HistoryWidget | null = null;
let statusBarWidget: StatusBarWidget | null = null;
let scoreHeaderWidget: ScoreHeaderWidget | null = null;
let resultOverlay: ResultOverlayWidget | null = null;
let predictionModal: PredictionModal | null = null;
let focusManager: FocusManager | null = null;

const GamePage: React.FC = () => {
  const axios = useUserAxios();
  const mountRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const outerRingRef = useRef<Container | null>(null);
  const midRingRef = useRef<Container | null>(null);
  const midLabelsRef = useRef<Container | null>(null);
  const animRef = useRef<number | null>(null);
  const spinningRef = useRef(false);
  const innerLetterRef = useRef<Text | null>(null);
  const layoutRef = useRef<Layout | null>(null);

  const [outerSegments, setOuterSegments] = useState<Segment[]>([]);
  const [middleSegments, setMiddleSegments] = useState<Segment[]>([]);
  const outerSegmentsRef = useRef<Segment[]>([]);
  const middleSegmentsRef = useRef<Segment[]>([]);
  const [activeSession, setActiveSession] = useState<GameSession | null>(null);
  const activeSessionRef = useRef<GameSession | null>(null);

  // Keep all refs in sync so callbacks always read latest values
  useEffect(() => {
    outerSegmentsRef.current = outerSegments;
  }, [outerSegments]);

  useEffect(() => {
    middleSegmentsRef.current = middleSegments;
  }, [middleSegments]);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchOuterSegments = async () => {
    try {
      const resp = await axios.get("/numbers");
      setOuterSegments(
        resp.data.data.map((n: GameTargetNumberSetting) => ({
          label: String(n.targetNumber),
          color: n.color ? parseInt(n.color.replace("#", "0x")) : 0xef4444,
          value: n.targetNumber,
        })),
      );
    } catch {
      toast.error("Failed to load wheel numbers.");
    }
  };

  const fetchMiddleSegments = async () => {
    try {
      const resp = await axios.get("/multipliers");
      setMiddleSegments(
        resp.data.data.map((n: GameWinMultiplierSetting) => ({
          label: n.multiplierLetter.toUpperCase(),
          color: n.color ? parseInt(n.color.replace("#", "0x")) : 0xef4444,
          value: n.winMultiplier,
        })),
      );
    } catch {
      toast.error("Failed to load multipliers.");
    }
  };

  const fetchActiveSession = async () => {
    try {
      const resp = await axios.get("/spin/next");
      setActiveSession(resp.data);
      openBetModalRef.current();
    } catch {
      toast.error("No active session available.");
    }
  };

  // ── Spin wheel (visual only — result already decided by backend) ──────────
  const spinWheelRef = useRef<(targetWinNumber?: number) => void>(() => {});

  const spinWheel = useCallback(
    (targetWinNumber?: number) => {
      if (spinningRef.current || !outerRingRef.current || !midRingRef.current)
        return;
      spinningRef.current = true;
      gameStatus.onSpinStart();
      audioManager.playSpinStart();
      if (resultOverlay) resultOverlay.hide();

      const session = activeSessionRef.current;
      const duration = (session?.duration ?? 5) * 1000;

      // ── Outer ring: force landing when shouldWin ───────────────────────
      let outerDelta: number;
      const effectiveTarget =
        session?.shouldWin && targetWinNumber !== undefined
          ? targetWinNumber // honour the user's pick
          : targetWinNumber; // normal random (may still be undefined)

      if (
        effectiveTarget !== undefined &&
        outerSegmentsRef.current.length > 0
      ) {
        const targetIdx = outerSegmentsRef.current.findIndex(
          (s) => Number(s.value) === effectiveTarget,
        );
        if (targetIdx >= 0) {
          const segAngle = (Math.PI * 2) / outerSegmentsRef.current.length;
          const targetAngle = -targetIdx * segAngle;
          const currentRot = outerRingRef.current.rotation % (Math.PI * 2);
          const spins = 8 + Math.floor(Math.random() * 5);
          outerDelta =
            spins * Math.PI * 2 +
            ((targetAngle - currentRot + Math.PI * 4) % (Math.PI * 2));
        } else {
          outerDelta = (10 + Math.random() * 5) * Math.PI * 2;
        }
      } else {
        outerDelta = (10 + Math.random() * 5) * Math.PI * 2;
      }

    
      let midDelta: number;
      const maxMult =
        session?.shouldWin && session?.multiplier?.winMultiplier != null
          ? Number(session.multiplier.winMultiplier)
          : null;

      if (maxMult !== null && middleSegmentsRef.current.length > 0) {
        // Collect eligible indices (value ≤ maxMult); fall back to all if none
        const eligible = middleSegmentsRef.current
          .map((s, i) => ({ i, v: Number(s.value) }))
          .filter((x) => x.v <= maxMult);
        const pool =
          eligible.length > 0
            ? eligible
            : middleSegmentsRef.current.map((s, i) => ({
                i,
                v: Number(s.value),
              }));

        // Pick the highest eligible multiplier (best win for the player)
        const best = pool.reduce((a, b) => (b.v > a.v ? b : a));
        const targetMidIdx = best.i;

        const midSegAngle = (Math.PI * 2) / middleSegmentsRef.current.length;
        const targetMidAngle = -targetMidIdx * midSegAngle;
        const currentMidRot = midRingRef.current.rotation % (Math.PI * 2);
        const midSpins = 7 + Math.floor(Math.random() * 8);
        // Middle ring spins in the negative direction in the original code
        midDelta = -(
          midSpins * Math.PI * 2 +
          ((-targetMidAngle + currentMidRot + Math.PI * 4) % (Math.PI * 2))
        );
      } else {
        midDelta = -(
          (7 + Math.random() * 8) * Math.PI * 2 +
          Math.random() * Math.PI * 2
        );
      }

      const outerStart = outerRingRef.current.rotation;
      const midStart = midRingRef.current.rotation;
      const t0 = performance.now();
      let outerDone = false,
        midDone = false,
        tickStarted = false;

      const animate = (now: number) => {
        const elapsed = now - t0;

        if (!outerDone && outerRingRef.current) {
          const p = Math.min(1, elapsed / duration);
          outerRingRef.current.rotation =
            outerStart + outerDelta * easeOut(p, 4);
          if (p >= 1) outerDone = true;
          if (p > 0.15 && !tickStarted) {
            tickStarted = true;
            audioManager.startTick(60);
          }
          if (p > 0.75) audioManager.stopTick();
        }

        if (!midDone && midRingRef.current) {
          const p = Math.min(1, elapsed / (duration + 2000));
          const rot = midStart + midDelta * easeOut(p, 3);
          midRingRef.current.rotation = rot;
          if (midLabelsRef.current) midLabelsRef.current.rotation = rot;
          if (p >= 1) midDone = true;
        }

        focusManager?.tick();

        if (!outerDone || !midDone) {
          animRef.current = requestAnimationFrame(animate);
        } else {
          audioManager.stopTick();
          audioManager.slowTick(600);

          const oi = segmentAtTop(
            outerRingRef.current!.rotation,
            outerSegmentsRef.current.length,
          );
          const mi = segmentAtTop(
            midRingRef.current!.rotation,
            middleSegmentsRef.current.length,
          );
          const outerSeg = outerSegmentsRef.current[oi];
          const midSeg = middleSegmentsRef.current[mi];
          if (!outerSeg || !midSeg) {
            spinningRef.current = false;
            return;
          }

          const basePoints =
            typeof outerSeg.value === "number" ? outerSeg.value : 0;
          const multiplier =
            typeof midSeg.value === "number" ? midSeg.value : 1;

          if (innerLetterRef.current)
            innerLetterRef.current.text = midSeg.label;

          setTimeout(async () => {
            audioManager.playWin(basePoints);
            gameHistory.addEntry(
              midSeg.label,
              basePoints,
              basePoints,
              typeof outerSeg.color === "number" ? outerSeg.color : 0x1a1a1a,
            );
            gameStatus.onSpinComplete(midSeg.label, basePoints, basePoints);

            // ── Only show win overlay if shouldWin OR user picked the right number ──
            const sess = activeSessionRef.current;
          

            if ( resultOverlay && layoutRef.current) {
              resultOverlay.show(
                midSeg.label,
                basePoints,
                basePoints,
                undefined,
                undefined,
                undefined,
              );
              resultOverlay.setPosition(
                layoutRef.current.btnCenterX,
                layoutRef.current.btnAreaY - 20,
              );
              focusManager?.setActiveGroup("overlay");
            }

            if (sess) {
              try {
                await axios.post("/spin", {
                  sessionId: sess.id,
                  winNumber: basePoints,
                  multiplier,
                });
              } catch (err: any) {
                const msg =
                  err?.response?.data?.error ?? "Failed to record spin result.";
                toast.error(msg);
              }
            }
          }, 700);

          spinningRef.current = false;
          animRef.current = null;
        }
      };

      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(animate);
    },
    [axios], // axios added since it's now used inside spinWheel
  );

  // Keep spinWheelRef current so showWinNumberPrompt can always call latest
  useEffect(() => {
    spinWheelRef.current = spinWheel;
  }, [spinWheel]);

  // ── Open bet modal (called on drop tap) ────────────────────────────────────
  // Stored in ref so buildScene can always call the latest without rebuilding
  const openBetModalRef = useRef<() => void>(() => {});

  const openBetModal = useCallback(() => {
    if (spinningRef.current) return;
    if (!activeSessionRef.current) {
      toast.error("No active session. Please wait.");
      return;
    }
    if (!predictionModal || !appRef.current) return;

    // Pass dynamic numbers from API — no hardcoding
    predictionModal.setWheelNumbers(
      outerSegmentsRef.current.map((s) => Number(s.value)),
    );
    predictionModal.layout(
      appRef.current.screen.width,
      appRef.current.screen.height,
    );
    predictionModal.show();
  }, []);

  useEffect(() => {
    openBetModalRef.current = openBetModal;
  }, [openBetModal]);

  // ── Confirm bet (called from modal confirm button) ────────────────────────
  const handleBetConfirmedRef = useRef<() => void>(() => {});

  const handleBetConfirmed = useCallback(async () => {
    const state = predictionCtx.getState();
    const session = activeSessionRef.current;

    if (!session) {
      toast.error("No active session.");
      return;
    }
    if (state.selected === null) {
      toast.error("Please select a number.");
      return;
    }
    const amount = parseFloat(state.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid bet amount.");
      return;
    }

    try {
      await axios.post("/bets", {
        sessionId: session.id,
        targetNumber: state.selected,
        amount,
      });
      toast.success("Bet placed!");
      predictionModal?.hide();
      spinWheel();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "Failed to place bet.";
      toast.error(msg);
    }
  }, [axios]);

  useEffect(() => {
    handleBetConfirmedRef.current = handleBetConfirmed;
  }, [handleBetConfirmed]);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const resetGame = useCallback(() => {
    if (spinningRef.current) return;
    audioManager.playClick();
    gameStatus.resetScore();
    gameHistory.clear();
    predictionCtx.resetStats();
    predictionModal?.hide();

    if (innerLetterRef.current) innerLetterRef.current.text = "";
    if (resultOverlay) resultOverlay.hide();
    focusManager?.setActiveGroup("default");
  }, []);

  // ── Build scene ────────────────────────────────────────────────────────────
  const buildScene = useCallback(
    (app: Application) => {
      app.stage.removeChildren();

      if ((app as any)._dropCleanup) {
        (app as any)._dropCleanup();
        (app as any)._dropCleanup = null;
      }

      historyWidget?.destroy();
      statusBarWidget?.destroy();
      scoreHeaderWidget?.destroy();
      predictionModal?.destroy();
      focusManager?.destroy();
      historyWidget = null;
      statusBarWidget = null;
      scoreHeaderWidget = null;
      resultOverlay = null;
      predictionModal = null;
      focusManager = null;

      const W = app.screen.width;
      const H = app.screen.height;
      const layout = computeLayout(W, H);
      layoutRef.current = layout;

      focusManager = new FocusManager(app);

      // ── Background ────────────────────────────────────────────────────────
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

      // ── Score header ──────────────────────────────────────────────────────
      scoreHeaderWidget = new ScoreHeaderWidget(gameStatus, layout);
      scoreHeaderWidget.container.y = 5;
      app.stage.addChild(scoreHeaderWidget.container);

      // ── History panel ─────────────────────────────────────────────────────
      if (layout.historyVisible) {
        historyWidget = new HistoryWidget(gameHistory, layout);
        historyWidget.container.x = layout.pad;
        historyWidget.container.y = layout.headerH + layout.pad;
        app.stage.addChild(historyWidget.container);

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

      // ── Wheel ─────────────────────────────────────────────────────────────
      const wheelContainer = new Container();
      wheelContainer.x = layout.wheelX;
      wheelContainer.y = layout.wheelY;
      wheelContainer.filters = [
        new BevelFilter({
          rotation: 45,
          thickness: 4,
          lightColor: 0xffffff,
          lightAlpha: 0.9,
          shadowColor: 0x000000,
          shadowAlpha: 0.6,
        }),
        new DropShadowFilter({
          offset: { x: 4, y: 8 },
          blur: 6,
          alpha: 0.7,
          color: 0x000000,
        }),
      ];
      wheelContainer.scale.set(layout.wheelScale);
      app.stage.addChild(wheelContainer);

      const outer = buildRingContainer(
        outerSegments,
        MIDDLE_RADIUS,
        OUTER_RADIUS,
        45,
      );
      outer.filters = RING_FILTERS();
      wheelContainer.addChild(outer);
      outerRingRef.current = outer;

      const mid = buildRingContainer(
        middleSegments,
        INNER_RADIUS,
        MIDDLE_RADIUS,
        85,
      );
      mid.filters = RING_FILTERS();
      wheelContainer.addChild(mid);
      midRingRef.current = mid;

      // ── Center drop ───────────────────────────────────────────────────────
      const centerContainer = new Container();
      centerContainer.eventMode = "static";
      centerContainer.cursor = "pointer";
      wheelContainer.addChild(centerContainer);

      const bodyR = INNER_RADIUS,
        bodyY = 0,
        tipY = -(INNER_RADIUS * 2);

      const drop = new Graphics();
      drop.moveTo(0, tipY);
      drop.bezierCurveTo(
        bodyR * 0.45,
        tipY * 0.7,
        bodyR,
        bodyY - bodyR * 0.6,
        bodyR,
        bodyY,
      );
      drop.arc(0, bodyY, bodyR, 0, Math.PI);
      drop.bezierCurveTo(
        -bodyR,
        bodyY - bodyR * 0.6,
        -bodyR * 0.45,
        tipY * 0.7,
        0,
        tipY,
      );
      drop.closePath();
      drop.fill({ color: 0xe8df59 });
      drop.stroke({ color: 0xffd700, width: 2 });
      drop.filters = [
        new BevelFilter({
          rotation: 45,
          thickness: 4,
          lightColor: 0xffffff,
          lightAlpha: 0.9,
          shadowColor: 0x000000,
          shadowAlpha: 0.6,
        }),
        new DropShadowFilter({
          offset: { x: 4, y: 8 },
          blur: 6,
          alpha: 0.7,
          color: 0x000000,
        }),
      ];
      centerContainer.addChild(drop);

      const innerCircle = new Graphics();
      innerCircle.circle(0, bodyY, bodyR);
      innerCircle.fill({ color: 0xbf3a15 });
      innerCircle.filters = [
        new BevelFilter({
          rotation: 45,
          thickness: 3,
          lightColor: 0xffffff,
          lightAlpha: 0.8,
          shadowColor: 0x000000,
          shadowAlpha: 0.5,
        }),
      ];
      centerContainer.addChild(innerCircle);

      const innerLetter = new Text({
        text: "",
        style: new TextStyle({
          fontFamily: "Arial",
          fontSize: 40,
          fontWeight: "bold",
          fill: 0xffffff,
        }),
      });
      innerLetter.anchor.set(0.5, 0.5);
      centerContainer.addChild(innerLetter);
      innerLetterRef.current = innerLetter;

      const spinHint = new Text({
        text: "TAP",
        style: new TextStyle({
          fontFamily: "Arial",
          fontSize: 10,
          fontWeight: "bold",
          fill: 0xffd700,
          align: "center",
        }),
      });
      spinHint.anchor.set(0.5, 0.5);
      spinHint.y = tipY * 0.55;
      centerContainer.addChild(spinHint);

      let pulseT = 0;
      const pulseTicker = (ticker: { deltaTime: number }) => {
        pulseT += ticker.deltaTime * 0.05;
        spinHint.alpha = 0.5 + 0.5 * Math.sin(pulseT);
      };
      app.ticker.add(pulseTicker);

      // ── Drop tap → open bet modal (single handler, no duplicate) ─────────
      centerContainer.on("pointerdown", () => {
        audioManager.playClick();
        fetchActiveSession(); // always calls latest via ref
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

      const unsubSpin = gameStatus.subscribe((s) => {
        const spinning = s.phase === "spinning" || s.phase === "countdown";
        spinHint.visible = !spinning;
        if (spinning) {
          drop.tint = 0xffffff;
          innerCircle.tint = 0xffffff;
        }
      });

      (app as any)._dropCleanup = () => {
        app.ticker.remove(pulseTicker);
        unsubSpin();
      };

      // ── Mid labels ────────────────────────────────────────────────────────
      const midLabels = new Container();
      wheelContainer.addChild(midLabels);
      midLabelsRef.current = midLabels;
      const midAngleStep = (Math.PI * 2) / (middleSegments.length || 1);
      middleSegments.forEach((seg, i) => {
        const midA = i * midAngleStep - Math.PI / 2 + midAngleStep / 2;
        const labelR = (INNER_RADIUS + MIDDLE_RADIUS) / 2;
        const lbl = new Text({
          text: seg.label,
          style: new TextStyle({
            fontFamily: "Arial, sans-serif",
            fontSize: 70,
            fill: 0xffffff,
            fontWeight: "bold",
          }),
        });
        lbl.anchor.set(0.5, 0.5);
        lbl.x = Math.cos(midA) * labelR;
        lbl.y = Math.sin(midA) * labelR;
        lbl.rotation =
          Math.cos(midA) < 0 ? midA - Math.PI / 2 : midA + Math.PI / 2;
        midLabels.addChild(lbl);
      });

      // Gold border + pointer
      const brd = new Graphics();
      brd.circle(0, 0, OUTER_RADIUS + 8);
      brd.stroke({ color: 0xffd700, width: 12 });
      wheelContainer.addChild(brd);

      const ptr = new Graphics();
      const ptrTop = -(OUTER_RADIUS + 28),
        ptrMid = -(OUTER_RADIUS + 2),
        ptrTip = -(OUTER_RADIUS - 20);
      ptr.moveTo(-16, ptrTop);
      ptr.lineTo(16, ptrTop);
      ptr.lineTo(16, ptrMid);
      ptr.lineTo(0, ptrTip);
      ptr.lineTo(-16, ptrMid);
      ptr.closePath();
      ptr.fill({ color: 0x111111 });
      ptr.stroke({ color: 0xffd700, width: 3 });
      wheelContainer.addChild(ptr);

      // ── Reset button ──────────────────────────────────────────────────────
      const { btnAreaY, btnCenterX, spinBtnH, resetBtnW, resetFontSize, pad } =
        layout;

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
      resetBtn.setActivateCallback(() => {
        audioManager.playClick();
        resetGame();
      });
      resetBtn.container.x = btnCenterX;
      resetBtn.container.y = btnAreaY;
      app.stage.addChild(resetBtn.container);

      focusManager.addItem(
        centerContainer,
        () => {
          audioManager.playClick();
          openBetModalRef.current();
        },
        { group: "default", label: "Place Bet" },
      );
      focusManager.addItem(
        resetBtn.container,
        () => {
          audioManager.playClick();
          resetGame();
        },
        { group: "default", label: "Reset" },
      );

      if (
        layout.mode !== "phone-portrait" &&
        layout.mode !== "phone-landscape"
      ) {
        const hint = new Text({
          text: "Tap the drop to place a bet  |  Tab / ← → to navigate  |  Enter to activate",
          style: new TextStyle({
            fontFamily: "Arial",
            fontSize: Math.max(9, Math.round(10 * layout.uiScale)),
            fill: 0x7799cc,
            align: "center",
          }),
        });
        hint.anchor.set(0.5, 0);
        hint.x = btnCenterX;
        hint.y = btnAreaY + spinBtnH / 2 + pad;
        app.stage.addChild(hint);
      }

      // ── Result overlay ────────────────────────────────────────────────────
      resultOverlay = new ResultOverlayWidget(W);
      resultOverlay.setPosition(btnCenterX, btnAreaY - 20);

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

      // ── Status bar ────────────────────────────────────────────────────────
      statusBarWidget = new StatusBarWidget(gameStatus, layout, focusManager);
      statusBarWidget.container.y = H - layout.statusBarH;
      app.stage.addChild(statusBarWidget.container);

      // ── Prediction modal ──────────────────────────────────────────────────
      predictionModal = new PredictionModal(predictionCtx, focusManager);
      predictionModal.layout(W, H);

      // Wire callbacks through refs — no stale closures
      predictionModal.onConfirm = () => handleBetConfirmedRef.current();
       
      app.stage.addChild(predictionModal.container);

      // ── Phone portrait mini strip ─────────────────────────────────────────
      if (!layout.historyVisible) {
        const strip = new Container();
        strip.x = W - pad;
        strip.y = layout.headerH / 2;
        gameHistory
          .getAll()
          .slice(0, 5)
          .forEach((e, i) => {
            const bW = 28,
              bH = 18;
            const badge = new Graphics();
            badge.roundRect(-(i + 1) * (bW + 3), -bH / 2, bW, bH, 4);
            badge.fill({
              color: e.segmentColor <= 0x222222 ? 0x2a2a3a : e.segmentColor,
            });
            strip.addChild(badge);
            const txt = new Text({
              text: `${e.points}`,
              style: new TextStyle({
                fontFamily: "Arial",
                fontSize: 9,
                fill: 0xffffff,
                fontWeight: "bold",
              }),
            });
            txt.anchor.set(0.5, 0.5);
            txt.x = -(i + 1) * (bW + 3) + bW / 2;
            strip.addChild(txt);
          });
        app.stage.addChild(strip);
      }

      focusManager.focusFirst();
    },
    // buildScene only rebuilds when data changes — all callbacks go through refs
    [outerSegments, middleSegments, resetGame],
  );

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;
    if (globalApp) {
      try {
        globalApp.destroy(true, { children: true });
      } catch {}
      globalApp = null;
    }

    const app = new Application();
    app
      .init({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0x0e2456,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })
      .then(() => {
        if (!mountRef.current) {
          app.destroy(true, { children: true });
          return;
        }
        while (mountRef.current.firstChild)
          mountRef.current.removeChild(mountRef.current.firstChild);
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
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }

      historyWidget?.destroy();
      statusBarWidget?.destroy();
      scoreHeaderWidget?.destroy();
      predictionModal?.destroy();
      focusManager?.destroy();
      audioManager.destroy();
      try {
        app.destroy(true, { children: true });
      } catch {}
      if (globalApp === app) globalApp = null;
      appRef.current = null;
      outerRingRef.current = null;
      midRingRef.current = null;
      midLabelsRef.current = null;
    };
  }, [buildScene]);

  useEffect(() => {
    fetchOuterSegments();
    fetchMiddleSegments();
    fetchActiveSession();
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        display: "block",
        position: "fixed",
        top: 0,
        left: 0,
        background: "#0e2456",
        touchAction: "none",
      }}
    />
  );
};

export default GamePage;
