import React, { useEffect, useRef, useCallback, useState } from "react";
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";
import { BevelFilter, DropShadowFilter } from "pixi-filters";
import { HistoryWidget } from "@/components/widgets/HistoryWidget";
import { StatusBarWidget } from "@/components/widgets/StatusBarWidget";
import { ScoreHeaderWidget } from "@/components/widgets/ScoreHeaderWidget";
import { ResultOverlayWidget } from "@/components/widgets/ResultOverlayWidget";
import { PredictionPanel } from "@/components/ui/PredictionModal"; // renamed export
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
import { gameHistory, type HistoryEntry } from "@/contexts/GameHistoryContext";
import { buildRingContainer, RING_FILTERS } from "@/lib/wheelBuilder";
import useUserAxios from "@/hooks/useUserAxios";
import type {
  GameFinancialSetting,
  GameSession,
  GameTargetNumberSetting,
  GameWinMultiplierSetting,
} from "@/lib/types";
import { toast } from "sonner";
import { MagnifierLens } from "@/lib/magnifierLens";
import { useLiveGameWs } from "@/hooks/useLiveGameWs";
import Logo from "@/components/ui/Logo";
import { ChevronLeft, CreditCard, Loader2 } from "lucide-react";
import UserMoneyDialog from "@/components/ui/UserMoneyDialog";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import useSession from "@/hooks/useSession";
import { cn } from "@/lib/utils";

// ── Module-level singletons ───────────────────────────────────────────────────
let globalApp: Application | null = null;

const WHEEL_TEXTURE_PATHS = {
  outerBody: "/wheel-assets/outer-wood-ring.png",
  outerTrim: "/wheel-assets/outer-gold-trim.png",
  pointer: "/wheel-assets/pointer.png",
  centerCap: "/wheel-assets/center-cap.png",
} as const;

type WheelTextures = {
  outerBody: Texture | null;
  outerTrim: Texture | null;
  pointer: Texture | null;
  centerCap: Texture | null;
};

let wheelTextures: WheelTextures = {
  outerBody: null,
  outerTrim: null,
  pointer: null,
  centerCap: null,
};

let wheelTexturesLoaded = false;

async function loadWheelTextures(): Promise<void> {
  if (wheelTexturesLoaded) return;
  wheelTexturesLoaded = true;
  try {
    const [outerBody, outerTrim, pointer, centerCap] = await Promise.all([
      Assets.load(WHEEL_TEXTURE_PATHS.outerBody),
      Assets.load(WHEEL_TEXTURE_PATHS.outerTrim),
      Assets.load(WHEEL_TEXTURE_PATHS.pointer),
      Assets.load(WHEEL_TEXTURE_PATHS.centerCap),
    ]);
    wheelTextures = { outerBody, outerTrim, pointer, centerCap };
  } catch {
    wheelTextures = {
      outerBody: null,
      outerTrim: null,
      pointer: null,
      centerCap: null,
    };
  }
}

function computePanelRect(
  W: number,
  H: number,
  layout: Layout,
): { x: number; y: number; w: number; h: number } {
  const MIN_PANEL_H = 460;
  const wheelRight = layout.wheelX + OUTER_RADIUS * layout.wheelScale;
  const rightSpace = W - wheelRight;
  const PAD = layout.pad;

  // ── Side panel (right of wheel) — enough horizontal room ─────────────
  if (rightSpace >= 220) {
    const panelW = Math.min(rightSpace - PAD * 2, 420);
    const panelX = wheelRight + PAD;
    // Vertically center relative to wheel
    const wheelTop = layout.wheelY - OUTER_RADIUS * layout.wheelScale;
    const wheelBottom = layout.wheelY + OUTER_RADIUS * layout.wheelScale;
    const availableH = H - layout.headerH - layout.statusBarH - PAD * 2;
    const panelH = Math.min(
      availableH,
      Math.max(MIN_PANEL_H, Math.min(wheelBottom - wheelTop, availableH)),
    );
    const panelY = Math.round((H - panelH) / 2);
    return { x: panelX, y: panelY, w: panelW, h: panelH };
  }

  // ── Bottom panel (below wheel) ─────────────────────────────────────────
  const wheelBottom = layout.wheelY + OUTER_RADIUS * layout.wheelScale;
  const panelTop = wheelBottom + PAD;
  const panelH = H - panelTop - layout.statusBarH - PAD;
  const panelW = Math.min(W - layout.pad * 2, 520);
  const panelX = Math.round((W - panelW) / 2);
  return {
    x: panelX,
    y: panelTop,
    w: panelW,
    h: Math.max(panelH, MIN_PANEL_H),
  };
}

const GamePage: React.FC = () => {
  const axios = useUserAxios();
  const mountRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const outerRingRef = useRef<Container | null>(null);
  const midRingRef = useRef<Container | null>(null);
  const midLabelsRef = useRef<Container | null>(null);
  const wheelContainerRef = useRef<Container | null>(null);
  const animRef = useRef<number | null>(null);
  const spinningRef = useRef(false);
  const innerLetterRef = useRef<Text | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const magnifierRef = useRef<MagnifierLens | null>(null);
  const historyWidgetRef = useRef<HistoryWidget | null>(null);
  const statusBarWidgetRef = useRef<StatusBarWidget | null>(null);
  const scoreHeaderWidgetRef = useRef<ScoreHeaderWidget | null>(null);
  const resultOverlayRef = useRef<ResultOverlayWidget | null>(null);
  const resultOverlayHideTimerRef = useRef<number | null>(null);
  const predictionPanelRef = useRef<PredictionPanel | null>(null);
  const focusManagerRef = useRef<FocusManager | null>(null);
  const [outerSegments, setOuterSegments] = useState<Segment[]>([]);
  const [middleSegments, setMiddleSegments] = useState<Segment[]>([]);
  const [financialSetting, setFinancialSetting] =
    useState<GameFinancialSetting | null>(null);
  const outerSegmentsRef = useRef<Segment[]>([]);
  const [alreadyBetted, setAlreadyBetted] = useState(false);
  const middleSegmentsRef = useRef<Segment[]>([]);
  const [activeSession, setActiveSession] = useState<GameSession | null>(null);
  const activeSessionRef = useRef<GameSession | null>(null);
  const { latestEvent } = useLiveGameWs();
  const [sceneBuilt, setSceneBuilt] = useState(false);
  const [showOddsModal, setShowOddsModal] = useState(false);
  const openOddsModal = useCallback(() => setShowOddsModal(true), []);
  const closeOddsModal = useCallback(() => setShowOddsModal(false), []);
  const [depositOpen, setDepositOpen] = useState(false);
  const userSession = useSession();
  const extractFinancialSetting = (
    payload: unknown,
  ): GameFinancialSetting | null => {
    if (!payload || typeof payload !== "object") return null;
    const raw = payload as Record<string, unknown>;
    const candidate = (raw.data ?? raw) as Record<string, unknown>;
    const minBetAmount = Number(candidate.minBetAmount);
    if (!Number.isFinite(minBetAmount)) return null;
    return candidate as unknown as GameFinancialSetting;
  };
  const [latestBets, setLatestBets] = useState<HistoryEntry[]>([]);

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
      toast.error("Failed to load wheel numbers.", { position: "top-right" });
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
      toast.error("Failed to load multipliers.", { position: "top-right" });
    }
  };

  const fetchFinancialSettings = async () => {
    try {
      const resp = await axios.get("/settings/financial");
      const parsed = extractFinancialSetting(resp.data);
      if (parsed) setFinancialSetting(parsed);
    } catch {
      toast.error("Failed to load financial settings.", {
        position: "top-right",
      });
    }
  };

  const applyMinBetAmount = useCallback(() => {
    const minBetAmount = Number(financialSetting?.minBetAmount);
    if (!Number.isFinite(minBetAmount) || minBetAmount <= 0) return;
    predictionPanelRef.current?.setAmount(String(minBetAmount));
  }, [financialSetting]);

  const fetchActiveSession = async () => {
    try {
      const resp = await axios.get("/sessions/active");
      setActiveSession(resp.data);
      setAlreadyBetted(resp.data.betted);
      predictionPanelRef.current?.enable();
      applyMinBetAmount();

      if (resp.data.betted) {
        predictionPanelRef.current?.setEnabled(false);
      } else {
        predictionPanelRef.current?.focusAmountInput();
      }
    } catch {
      toast.error("No active session available.", { position: "top-right" });
    }
  };
  const fetchBalance = async () => {
    try {
      const resp = await axios.get("/transactions/balance");
      if (userSession.session) {
        userSession.setSession({
          ...userSession.session,
          balance: resp.data,
        });
      }
    } catch (error) {}
  };

  const fetchLatestBets = async () => {
    try {
      const resp = await axios.get("/bets/latest");
      setLatestBets(
        resp.data.map((b: any) => ({
          gameId: b.sessionId.substring(5), // use last digit of sessionId as gameId
          letter:
            middleSegments.find((s) => Number(s.value) == b.winMultiplier)
              ?.label ?? "",
          number: b.winNumber,
          segmentColor:
            outerSegments.find((s) => Number(s.value) == b.winNumber)?.color ?? 0x1a1a1a,
          timestamp: new Date(b.createdAt).getTime(),
          isZero: b.winNumber === 0,
          points: b.winNumber,
        })),
      );
    } catch (error) {
      toast.error("Failed to fetch latest bets.", { position: "top-right" });
    }
  };

  // ── Spin wheel ─────────────────────────────────────────────────────────────
  const spinWheelRef = useRef<(targetWinNumber?: number) => void>(() => {});

  const spinWheel = useCallback((targetWinNumber?: number) => {
    if (spinningRef.current || !outerRingRef.current || !midRingRef.current)
      return;
    spinningRef.current = true;
    gameStatus.onSpinStart();
    audioManager.playSpinStart();
    if (resultOverlayRef.current) resultOverlayRef.current.hide();
    if (resultOverlayHideTimerRef.current !== null) {
      window.clearTimeout(resultOverlayHideTimerRef.current);
      resultOverlayHideTimerRef.current = null;
    }

    // Disable panel during spin
    predictionPanelRef.current?.hide();

    const session = activeSessionRef.current;
    const duration = (session?.duration ?? 5) * 1000;

    let outerDelta: number;
    const effectiveTarget =
      session?.shouldWin && targetWinNumber !== undefined
        ? targetWinNumber
        : targetWinNumber;

    // In spinWheel, replace the outerDelta calculation block:

    if (effectiveTarget !== undefined && outerSegmentsRef.current.length > 0) {
      const targetIdx = outerSegmentsRef.current.findIndex(
        (s) => Number(s.value) === effectiveTarget,
      );

      if (targetIdx >= 0) {
        const segAngle = (Math.PI * 2) / outerSegmentsRef.current.length;

        const targetAngle = -(targetIdx * segAngle + segAngle / 2);

        const currentRot = outerRingRef.current.rotation;
        const currentNorm = currentRot % (Math.PI * 2);

        let diff = (targetAngle - currentNorm + Math.PI * 4) % (Math.PI * 2);

        if (diff < 0.01) diff += Math.PI * 2;

        const spins = 8 + Math.floor(Math.random() * 5);
        outerDelta = spins * Math.PI * 2 + diff;
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
      const best = pool.reduce((a, b) => (b.v > a.v ? b : a));
      const targetMidIdx = best.i;
      const midSegAngle = (Math.PI * 2) / middleSegmentsRef.current.length;
      // Match segmentAtTop(): target the CENTER of the multiplier segment
      const targetMidAngle = -(targetMidIdx * midSegAngle + midSegAngle / 2);
      const currentMidRot = midRingRef.current.rotation % (Math.PI * 2);
      const midSpins = 7 + Math.floor(Math.random() * 8);
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
        outerRingRef.current.rotation = outerStart + outerDelta * easeOut(p, 4);
        if (p >= 1) outerDone = true;
        if (p > 0.15 && !tickStarted) {
          tickStarted = true;
          audioManager.startTick(60);
        }
        if (p > 0.75) audioManager.stopTick();
        if (p > 0.2 && magnifierRef.current) {
          magnifierRef.current.updateAtPointer(OUTER_RADIUS, MIDDLE_RADIUS);
          magnifierRef.current.show();
        }
      }

      if (!midDone && midRingRef.current) {
        const p = Math.min(1, elapsed / (duration + 2000));
        const rot = midStart + midDelta * easeOut(p, 3);
        midRingRef.current.rotation = rot;
        if (midLabelsRef.current) midLabelsRef.current.rotation = rot;
        if (p >= 1) midDone = true;
      }

      focusManagerRef.current?.tick();

      if (!outerDone || !midDone) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        audioManager.stopTick();
        audioManager.slowTick(600);
        magnifierRef.current?.hide();

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

        if (innerLetterRef.current) innerLetterRef.current.text = midSeg.label;

        setTimeout(() => {
          audioManager.playWin(basePoints);
          
          gameStatus.onSpinComplete(midSeg.label, basePoints, basePoints);

          if (resultOverlayRef.current && layoutRef.current) {
            const wheelCenterX =
              wheelContainerRef.current?.getGlobalPosition().x ??
              layoutRef.current.btnCenterX;
            resultOverlayRef.current.show(
              midSeg.label,
              basePoints,
              basePoints,
              undefined,
              undefined,
              undefined,
            );
            resultOverlayRef.current.setPosition(
              wheelCenterX,
              layoutRef.current.btnAreaY - 20,
            );
            focusManagerRef.current?.setActiveGroup("overlay");
            if (resultOverlayHideTimerRef.current !== null) {
              window.clearTimeout(resultOverlayHideTimerRef.current);
            }
            resultOverlayHideTimerRef.current = window.setTimeout(() => {
              resultOverlayRef.current?.hide();
              focusManagerRef.current?.setActiveGroup("default");
              resultOverlayHideTimerRef.current = null;
            }, 5000);
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
    spinWheelRef.current = spinWheel;
  }, [spinWheel]);

  useEffect(() => {
    if (!latestEvent) return;

    switch (latestEvent.type) {
      case "session_opened": {
        const session: GameSession = {
          id: latestEvent.sessionId as string,
          sessionNumber: latestEvent.sessionNumber as number,
          duration: latestEvent.duration as number,
          shouldWin: latestEvent.shouldWin as boolean,
          multiplier:
            (latestEvent.multiplier as GameWinMultiplierSetting) ?? undefined,
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setActiveSession(session);
        gameStatus.onSessionOpened(
          latestEvent.sessionNumber as number,
          latestEvent.bettingWindowMs as number,
        );
        predictionPanelRef.current?.enable();
        applyMinBetAmount();
        predictionPanelRef.current?.focusAmountInput();
        break;
      }

      case "betting_countdown": {
        gameStatus.onCountdownTick(
          latestEvent.secondsLeft as number,
          latestEvent.totalSeconds as number,
        );
        break;
      }

      case "bets_locked": {
        gameStatus.onBetsLocked();
        predictionPanelRef.current?.setEnabled(false);
        break;
      }

      case "spin_result": {
        spinWheelRef.current(latestEvent.winNumber as number);
        fetchBalance();
        fetchLatestBets();
        break;
      }

      case "round_ended": {
        // Status bar goes to result phase — spinWheel completion handles overlay
        // Panel re-opens on next session_opened event
        break;
      }
    }
  }, [latestEvent, applyMinBetAmount]);

  // ── Confirm bet ────────────────────────────────────────────────────────────
  const handleBetConfirmedRef = useRef<() => void>(() => {});

  const handleBetConfirmed = useCallback(async () => {
    const state = predictionCtx.getState();
    const session = activeSessionRef.current;

    if (!session) {
      toast.error("No active session.", { position: "top-right" });
      return;
    }

    const selectedNumbers =
      predictionPanelRef.current?.getSelectedNumbers() ?? [];
    if (selectedNumbers.length === 0) {
      toast.error("Please select at least one number.", {
        position: "top-right",
      });
      return;
    }

    const amount = parseFloat(state.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid bet amount.", {
        position: "top-right",
      });
      return;
    }

    try {
      predictionPanelRef.current?.setSubmitting(true);
      const resp = await axios.post("/bets", {
        sessionId: session.id,
        targetNumbers: selectedNumbers,
        amount,
      });
      toast.success("Bet placed! Waiting for spin...", {
        position: "top-right",
      });
      predictionPanelRef.current?.clearBetInput();
      predictionPanelRef.current?.setEnabled(false);
      predictionPanelRef.current?.setEnabled(false);
      if (userSession.session) {
        userSession.setSession({
          ...userSession.session,
          balance: resp.data.balance,
        });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Failed to place bet.");
    } finally {
      predictionPanelRef.current?.setSubmitting(false);
    }
  }, [axios]);

  useEffect(() => {
    handleBetConfirmedRef.current = handleBetConfirmed;
  }, [handleBetConfirmed]);
  useEffect(() => {
    predictionPanelRef.current?.setEnabled(!alreadyBetted);
  }, [alreadyBetted, sceneBuilt]);
  useEffect(() => {
    gameHistory.addEntries(latestBets)
  },[latestBets, sceneBuilt])

  useEffect(() => {
    fetchLatestBets();
  }, [outerSegments, middleSegments]);
  

  // ── Build scene ────────────────────────────────────────────────────────────
  const buildScene = useCallback(
    (app: Application) => {
      if (outerSegments.length === 0 || middleSegments.length === 0) {
        return;
      }

      app.stage.removeChildren();
      app.stage.sortableChildren = true;

      if ((app as any)._dropCleanup) {
        (app as any)._dropCleanup();
        (app as any)._dropCleanup = null;
      }

      historyWidgetRef.current?.destroy();
      statusBarWidgetRef.current?.destroy();
      scoreHeaderWidgetRef.current?.destroy();
      predictionPanelRef.current?.destroy();
      focusManagerRef.current?.destroy();
      historyWidgetRef.current = null;
      statusBarWidgetRef.current = null;
      scoreHeaderWidgetRef.current = null;
      resultOverlayRef.current = null;
      predictionPanelRef.current = null;
      focusManagerRef.current = null;

      const W = app.screen.width;
      const H = app.screen.height;
      const layout = computeLayout(W, H);
      layoutRef.current = layout;

      focusManagerRef.current = new FocusManager(app);

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
      scoreHeaderWidgetRef.current = new ScoreHeaderWidget(gameStatus, layout);
      scoreHeaderWidgetRef.current.container.y = 5;
      app.stage.addChild(scoreHeaderWidgetRef.current.container);

      // ── History panel ─────────────────────────────────────────────────────
      if (layout.historyVisible) {
        historyWidgetRef.current = new HistoryWidget(gameHistory, layout);
        const wheelLeftEdge = layout.wheelX - OUTER_RADIUS * layout.wheelScale;
        const panelMargin = Math.max(layout.pad * 1.5, 24);
        const historyGap = Math.round(layout.pad + panelMargin);
        const historyWidth = historyWidgetRef.current.container.width;
        const historyHeight = historyWidgetRef.current.container.height;
        const wheelTop = layout.wheelY - OUTER_RADIUS * layout.wheelScale;
        const wheelBottom = layout.wheelY + OUTER_RADIUS * layout.wheelScale;
        const centeredHistoryY = Math.round(
          wheelTop + (wheelBottom - wheelTop - historyHeight) / 2,
        );
        const minHistoryY = layout.headerH + layout.pad;
        const maxHistoryY = H - layout.statusBarH - layout.pad - historyHeight;
        historyWidgetRef.current.container.x = Math.max(
          layout.pad,
          wheelLeftEdge - historyWidth - historyGap,
        );
        historyWidgetRef.current.container.y = Math.max(
          minHistoryY,
          Math.min(centeredHistoryY, maxHistoryY),
        );
        app.stage.addChild(historyWidgetRef.current.container);
 
        
      }

      // ── Wheel ─────────────────────────────────────────────────────────────
      const wheelContainer = new Container();
      wheelContainerRef.current = wheelContainer;
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

      magnifierRef.current?.destroy();
      const LENS_R = 110;
      const magnifier = new MagnifierLens(app, wheelContainer, LENS_R, 3);
      const wheelRightEdge = layout.wheelX + OUTER_RADIUS * layout.wheelScale;
      const wheelRadiusPx = OUTER_RADIUS * layout.wheelScale;
      const isPhoneLayout =
        layout.mode === "phone-portrait" || layout.mode === "phone-landscape";
      const lensX = isPhoneLayout
        ? layout.wheelX
        : wheelRightEdge + LENS_R + 50;
      const lensY = layout.wheelY;
      magnifier.moveTo(lensX, lensY);
      magnifier.container.zIndex = 2;
      app.stage.addChild(magnifier.container);
      magnifierRef.current = magnifier;

      const outer = buildRingContainer(
        outerSegments,
        MIDDLE_RADIUS,
        OUTER_RADIUS,
        26,
      );
      outer.filters = RING_FILTERS();
      wheelContainer.addChild(outer);
      outerRingRef.current = outer;

      const mid = buildRingContainer(
        middleSegments,
        INNER_RADIUS,
        MIDDLE_RADIUS,
        70,
      );
      mid.filters = RING_FILTERS();
      wheelContainer.addChild(mid);
      midRingRef.current = mid;

      if (wheelTextures.outerBody) {
        const outerBody = new Sprite(wheelTextures.outerBody);
        outerBody.anchor.set(0.5, 0.5);
        const d = (OUTER_RADIUS + 30) * 2;
        outerBody.width = d;
        outerBody.height = d;
        outerBody.zIndex = -2;
        wheelContainer.addChild(outerBody);
      } else {
        const outerBodyFallback = new Graphics();
        outerBodyFallback.circle(0, 0, OUTER_RADIUS + 18);
        outerBodyFallback.stroke({ color: 0x8b5a2b, width: 22 });
        outerBodyFallback.circle(0, 0, OUTER_RADIUS + 16);
        outerBodyFallback.stroke({ color: 0xc48a4a, width: 3, alpha: 0.5 });
        outerBodyFallback.zIndex = -2;
        wheelContainer.addChild(outerBodyFallback);
      }

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

      if (wheelTextures.centerCap) {
        const cap = new Sprite(wheelTextures.centerCap);
        cap.anchor.set(0.5, 0.5);
        cap.width = INNER_RADIUS * 2.1;
        cap.height = INNER_RADIUS * 2.1;
        centerContainer.addChild(cap);
      }

      const innerLetter = new Text({
        text: "",
        style: new TextStyle({
          fontFamily: "Century Gothic",
          fontSize: 40,
          fontWeight: "bold",
          fill: 0xffffff,
        }),
      });
      innerLetter.resolution = 2;
      innerLetter.roundPixels = true;
      innerLetter.anchor.set(0.5, 0.5);
      centerContainer.addChild(innerLetter);
      innerLetterRef.current = innerLetter;

      const spinHint = new Text({
        text: "TAP",
        style: new TextStyle({
          fontFamily: "Century Gothic",
          fontSize: 10,
          fontWeight: "bold",
          fill: 0xffd700,
          align: "center",
        }),
      });
      spinHint.resolution = 2;
      spinHint.roundPixels = true;
      spinHint.anchor.set(0.5, 0.5);
      spinHint.y = tipY * 0.55;
      centerContainer.addChild(spinHint);

      let pulseT = 0;
      const pulseTicker = (ticker: { deltaTime: number }) => {
        pulseT += ticker.deltaTime * 0.05;
        spinHint.alpha = 0.5 + 0.5 * Math.sin(pulseT);
      };
      app.ticker.add(pulseTicker);

      centerContainer.on("pointerdown", () => {
        audioManager.playClick();
        fetchActiveSession();
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
        lbl.resolution = 2;
        lbl.roundPixels = true;
        lbl.anchor.set(0.5, 0.5);
        lbl.x = Math.cos(midA) * labelR;
        lbl.y = Math.sin(midA) * labelR;
        lbl.rotation =
          Math.cos(midA) < 0 ? midA - Math.PI / 2 : midA + Math.PI / 2;
        midLabels.addChild(lbl);
      });

      if (wheelTextures.outerTrim) {
        const trim = new Sprite(wheelTextures.outerTrim);
        trim.anchor.set(0.5, 0.5);
        const d = (OUTER_RADIUS + 16) * 2;
        trim.width = d;
        trim.height = d;
        trim.zIndex = 1;
        wheelContainer.addChild(trim);
      } else {
        const brd = new Graphics();
        brd.circle(0, 0, OUTER_RADIUS + 8);
        brd.stroke({ color: 0xffd700, width: 12 });
        wheelContainer.addChild(brd);
      }

      if (wheelTextures.pointer) {
        const ptr = new Sprite(wheelTextures.pointer);
        ptr.anchor.set(0.5, 1);
        ptr.x = 0;
        ptr.y = -(OUTER_RADIUS + 24);
        ptr.width = 42;
        ptr.height = 66;
        ptr.zIndex = 3;
        wheelContainer.addChild(ptr);
      } else {
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
      }

      const { btnAreaY, spinBtnH, pad } = layout;

      focusManagerRef.current?.addItem(
        centerContainer,
        () => {
          audioManager.playClick();
          fetchActiveSession();
        },
        { group: "default", label: "Start spin / open bet" },
      );
      if (
        layout.mode !== "phone-portrait" &&
        layout.mode !== "phone-landscape"
      ) {
        const hint = new Text({
          text: "Select a number · enter bet amount · confirm  |  Tab / ← → to navigate",
          style: new TextStyle({
            fontFamily: "Century Gothic",
            fontSize: Math.max(9, Math.round(10 * layout.uiScale)),
            fill: 0x7799cc,
            align: "center",
          }),
        });
        hint.anchor.set(0.5, 0);
        hint.x = layout.wheelX;
        hint.y = btnAreaY + spinBtnH / 2 + pad;
        app.stage.addChild(hint);

        const oddsBtn = new Container();
        oddsBtn.eventMode = "static";
        oddsBtn.cursor = "pointer";
        oddsBtn.x = hint.x + Math.max(230, Math.round(220 * layout.uiScale));
        oddsBtn.y = hint.y - 2;
        const oddsBg = new Graphics();
        const oddsW = Math.max(64, Math.round(68 * layout.uiScale));
        const oddsH = Math.max(24, Math.round(26 * layout.uiScale));
        oddsBg.roundRect(0, 0, oddsW, oddsH, 8);
        oddsBg.fill({ color: 0x0b1328, alpha: 0.96 });
        oddsBg.stroke({ color: 0xfacc15, width: 1.5, alpha: 0.95 });
        oddsBtn.addChild(oddsBg);
        const oddsTxt = new Text({
          text: "Odds",
          style: new TextStyle({
            fontFamily: "Century Gothic",
            fontSize: Math.max(10, Math.round(11 * layout.uiScale)),
            fill: 0xf8fafc,
            fontWeight: "bold",
            align: "center",
          }),
        });
        oddsTxt.anchor.set(0.5, 0.5);
        oddsTxt.x = oddsW / 2;
        oddsTxt.y = oddsH / 2;
        oddsBtn.addChild(oddsTxt);
        oddsBtn.on("pointerdown", () => openOddsModal());
        oddsBtn.on("pointerover", () => {
          oddsBg.alpha = 0.84;
        });
        oddsBtn.on("pointerout", () => {
          oddsBg.alpha = 0.96;
        });
        app.stage.addChild(oddsBtn);
        focusManagerRef.current?.addItem(oddsBtn, () => openOddsModal(), {
          group: "default",
          label: "Open odds",
        });
      }

      // ── Result overlay ────────────────────────────────────────────────────
      resultOverlayRef.current = new ResultOverlayWidget(W);
      resultOverlayRef.current.setPosition(layout.wheelX, btnAreaY - 20);

      const dismissBtn = resultOverlayRef.current.getDismissButton();
      if (dismissBtn) {
        focusManagerRef.current?.addItem(
          dismissBtn,
          () => {
            resultOverlayRef.current?.hide();
            focusManagerRef.current?.setActiveGroup("default");
            if (resultOverlayHideTimerRef.current !== null) {
              window.clearTimeout(resultOverlayHideTimerRef.current);
              resultOverlayHideTimerRef.current = null;
            }
          },
          { group: "overlay", label: "Dismiss result" },
        );
      }
      resultOverlayRef.current.setDismissCallback(() => {
        focusManagerRef.current?.setActiveGroup("default");
        if (resultOverlayHideTimerRef.current !== null) {
          window.clearTimeout(resultOverlayHideTimerRef.current);
          resultOverlayHideTimerRef.current = null;
        }
      });
      resultOverlayRef.current.container.zIndex = 50;
      app.stage.addChild(resultOverlayRef.current.container);

      // ── Status bar ────────────────────────────────────────────────────────
      statusBarWidgetRef.current = new StatusBarWidget(
        gameStatus,
        layout,
        focusManagerRef.current,
      );
      statusBarWidgetRef.current.container.y = H - layout.statusBarH;
      app.stage.addChild(statusBarWidgetRef.current.container);

      // ── Prediction PANEL (inline, not modal) ─────────────────────────────
      const pRect = computePanelRect(W, H, layout);
      predictionPanelRef.current = new PredictionPanel(
        predictionCtx,
        focusManagerRef.current,
        outerSegments,
      );

      // Apply margin around panel
      const panelMargin = Math.max(layout.pad * 1.5, 24);
      predictionPanelRef.current.layout(
        0,
        0,
        pRect.w - panelMargin * 2,
        pRect.h - panelMargin * 2,
      );

      // Wire confirm callback through ref — no stale closures
      predictionPanelRef.current.onConfirm = () =>
        handleBetConfirmedRef.current();

      applyMinBetAmount();

      // Keep the panel behind the magnifier lens
      predictionPanelRef.current.container.zIndex = 0;
      app.stage.addChild(predictionPanelRef.current.container);

      // Keep original responsive behavior when history panel is hidden (phone layouts)
      if (!layout.historyVisible) {
        predictionPanelRef.current.container.x = Math.round(
          pRect.x + panelMargin,
        );
        predictionPanelRef.current.container.y = Math.round(
          pRect.y + panelMargin,
        );
        predictionPanelRef.current.repositionInput(
          predictionPanelRef.current.container.x,
          predictionPanelRef.current.container.y,
        );
      }

      // Group history + wheel + betting panel so they can be centered together
      if (layout.historyVisible && historyWidgetRef.current) {
        const arenaContainer = new Container();
        const historyContainer = historyWidgetRef.current.container;
        const panelContainer = predictionPanelRef.current.container;
        const sideGap = Math.round(layout.pad + panelMargin);

        const arenaHeight = Math.max(
          historyContainer.height,
          panelContainer.height,
          wheelRadiusPx * 2,
        );

        historyContainer.x = 0;
        historyContainer.y = Math.round(
          (arenaHeight - historyContainer.height) / 2,
        );

        wheelContainer.x = Math.round(
          historyContainer.width + sideGap + wheelRadiusPx,
        );
        wheelContainer.y = Math.round(arenaHeight / 2);

        panelContainer.x = Math.round(
          wheelContainer.x + wheelRadiusPx + sideGap,
        );
        panelContainer.y = Math.round(
          (arenaHeight - panelContainer.height) / 2,
        );

        const arenaWidth = Math.round(panelContainer.x + panelContainer.width);
        const minArenaY = layout.headerH + layout.pad;
        const maxArenaY = H - layout.statusBarH - layout.pad - arenaHeight;
        const arenaY = Math.max(
          minArenaY,
          Math.min(Math.round((H - arenaHeight) / 2), maxArenaY),
        );

        arenaContainer.x = Math.max(
          layout.pad,
          Math.round((W - arenaWidth) / 2),
        );
        arenaContainer.y = arenaY;

        arenaContainer.addChild(historyContainer);
        arenaContainer.addChild(wheelContainer);
        arenaContainer.addChild(panelContainer);
        app.stage.addChild(arenaContainer);

        predictionPanelRef.current.repositionInput(
          arenaContainer.x + panelContainer.x,
          arenaContainer.y + panelContainer.y,
        );

        const wheelGlobalX = arenaContainer.x + wheelContainer.x;
        const wheelGlobalY = arenaContainer.y + wheelContainer.y;
        const isPhoneLayout =
          layout.mode === "phone-portrait" || layout.mode === "phone-landscape";
        const lensX = isPhoneLayout
          ? wheelGlobalX
          : wheelGlobalX + wheelRadiusPx + LENS_R + 50;
        const lensY = wheelGlobalY;
        magnifier.moveTo(lensX, lensY);
        resultOverlayRef.current?.setPosition(wheelGlobalX, btnAreaY - 20);
        // Keep helper hint centered with the wheel after grouped re-layout.
        const hintNode = app.stage.children.find(
          (child) =>
            child instanceof Text && (child as Text).text.includes("Tab /"),
        ) as Text | undefined;
        if (hintNode) hintNode.x = wheelGlobalX;
      }

      // Mobile mini history strip between score bar and wheel
      if (!layout.historyVisible) {
        const strip = new Container();
        const badges = gameHistory.getAll().slice(0, 5);
        const bW = 28;
        const bH = 18;
        const gap = 6;
        const totalW =
          badges.length * bW + Math.max(0, badges.length - 1) * gap;
        const wheelTop = layout.wheelY - OUTER_RADIUS * layout.wheelScale;
        const stripY = Math.round((layout.headerH + wheelTop) / 2);

        strip.x = Math.round(layout.wheelX - totalW / 2);
        strip.y = stripY;

        badges.forEach((e, i) => {
          const badge = new Graphics();
          const x = i * (bW + gap);
          badge.roundRect(x, -bH / 2, bW, bH, 4);
          badge.fill({
            color: e.segmentColor <= 0x222222 ? 0x2a2a3a : e.segmentColor,
          });
          strip.addChild(badge);

          const txt = new Text({
            text: `${e.points}`,
            style: new TextStyle({
              fontFamily: "Century Gothic",
              fontSize: 9,
              fill: 0xffffff,
              fontWeight: "bold",
            }),
          });
          txt.anchor.set(0.5, 0.5);
          txt.x = x + bW / 2;
          txt.y = 0;
          strip.addChild(txt);
        });

        app.stage.addChild(strip);
      }

      focusManagerRef.current?.focusFirst();
      setSceneBuilt(true);
    },
    [outerSegments, middleSegments],
  );

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;
    let disposed = false;

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
        if (disposed || !mountRef.current) {
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
        setAppReady(true);
      });

    const handleResize = () => {
      if (!appRef.current) return;
      appRef.current.renderer.resize(window.innerWidth, window.innerHeight);
      setSceneBuilt(false);
      if (appRef.current) buildSceneRef.current(appRef.current);
      (appRef.current.canvas as HTMLElement)?.focus();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      if (resultOverlayHideTimerRef.current !== null) {
        window.clearTimeout(resultOverlayHideTimerRef.current);
        resultOverlayHideTimerRef.current = null;
      }
      historyWidgetRef.current?.destroy();
      statusBarWidgetRef.current?.destroy();
      scoreHeaderWidgetRef.current?.destroy();
      predictionPanelRef.current?.destroy();
      focusManagerRef.current?.destroy();
      magnifierRef.current?.destroy();
      magnifierRef.current = null;
      audioManager.destroy();
      try {
        app.destroy(true, { children: true });
      } catch {}
      if (globalApp === app) globalApp = null;
      appRef.current = null;
      wheelContainerRef.current = null;
      outerRingRef.current = null;
      midRingRef.current = null;
      midLabelsRef.current = null;
    };
  }, []);
  const [appReady, setAppReady] = useState(false);

  const buildSceneRef = useRef(buildScene);
  useEffect(() => {
    buildSceneRef.current = buildScene;
  }, [buildScene]);
  useEffect(() => {
    if (!appReady) return;
    if (outerSegments.length === 0 || middleSegments.length === 0) return;
    if (!appRef.current) return;

    setSceneBuilt(false);
    loadWheelTextures().finally(() => {
      if (appRef.current) buildScene(appRef.current);
      appRef.current?.canvas && (appRef.current.canvas as HTMLElement).focus();
    });
  }, [appReady, outerSegments, middleSegments, buildScene]);

  useEffect(() => {
    void Promise.all([
      fetchOuterSegments(),
      fetchMiddleSegments(),
      fetchFinancialSettings(),
      fetchActiveSession(),
     
    ]);
  }, []);

  useEffect(() => {
    if (!sceneBuilt) return;
    applyMinBetAmount();
  }, [sceneBuilt, applyMinBetAmount]);

  useEffect(() => {
    predictionPanelRef.current?.setAmountOverlayVisible(!showOddsModal);
  }, [showOddsModal]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        display: "block",
        position: "fixed",
        top: 0,
        left: 0,
        background: "#0e2456",
      }}
    >
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "100%",
          touchAction: "none",
        }}
      />

      <div
        style={{
          position: "fixed",
          top: "max(28px, 4vh)",
          left: "max(12px, 2vw)",
          color: "#f8fafc",
          fontWeight: 800,
          fontSize: "clamp(16px, 2.8vw, 28px)",
          letterSpacing: "0.02em",
        }}
      >
        <Link to={"/app"} className="flex gap-2 items-center justify-center mb-2">
          <ChevronLeft />
          <Logo />
        </Link>
      </div>

      <div
        style={{
          position: "fixed",
          top: "max(28px, 4vh)",
          left: "max(12px, 70vw)",
          paddingTop: "",
        }}
      >
       
        <Button onClick={() => setDepositOpen(true)} className={cn(" py-0")}>
          <CreditCard  /> Deposit
        </Button>
         <div className="font-bold items-end flex justify-end">
          <span className="text-sm">{Number(userSession.session?.balance).toFixed(2)}</span>
        </div>
      </div>

      {(!appReady ||
        outerSegments.length === 0 ||
        middleSegments.length === 0 ||
        !sceneBuilt) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 30,
            background: "rgba(6, 18, 46, 0.78)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#dbeafe",
            fontFamily: "Arial, sans-serif",
            fontSize: "clamp(14px, 2.2vw, 22px)",
            fontWeight: 700,
            letterSpacing: "0.05em",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div className="text-2xl ">
            <Logo />
          </div>
          <Loader2 className="animate-spin" />
        </div>
      )}

      {showOddsModal && (
        <div
          onClick={closeOddsModal}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(2, 8, 23, 0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(480px, 94vw)",
              maxHeight: "80vh",
              overflowY: "auto",
              background: "#081a42",
              border: "1px solid #2a5298",
              borderRadius: "14px",
              boxShadow: "0 18px 48px rgba(2, 6, 23, 0.55)",
              padding: "16px 16px 14px",
              color: "#dbeafe",
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={closeOddsModal}
              aria-label="Close odds modal"
              style={{
                position: "absolute",
                top: "8px",
                right: "10px",
                width: "28px",
                height: "28px",
                borderRadius: "999px",
                border: "1px solid #3b82f6",
                background: "#0b1f4a",
                color: "#e2e8f0",
                fontSize: "18px",
                lineHeight: "24px",
                cursor: "pointer",
              }}
            >
              ×
            </button>
            <div
              style={{
                fontWeight: 800,
                fontSize: "18px",
                color: "#facc15",
                letterSpacing: "0.04em",
                marginBottom: "12px",
              }}
            >
              Multiplier Odds
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              {[...middleSegments]
                .sort((a, b) => Number(b.value) - Number(a.value))
                .map((m, idx) => (
                  <div
                    key={`${m.label}-${idx}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "#0b204f",
                      border: "1px solid #23407a",
                      borderRadius: "10px",
                      padding: "10px 12px",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "#e2e8f0" }}>
                      {m.label}
                    </span>
                    <span style={{ fontWeight: 800, color: "#22c55e" }}>
                      x{Number(m.value)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
      <UserMoneyDialog
        open={depositOpen}
        onOpenChange={setDepositOpen}
        action="deposit"
      />
    </div>
  );
};

export default GamePage;
