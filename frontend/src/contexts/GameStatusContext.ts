// src/contexts/GameStatusContext.ts

export type GamePhase = "idle" | "betting" | "countdown" | "spinning" | "result";

export interface GameStatus {
  phase: GamePhase;
  currentGameId: number;
  nextGameId: number;
  countdown: number;
  bettingWindow: number;
  totalBettingSeconds: number;   
  totalScore: number;
  roundsPlayed: number;
  lastLetter: string;
  lastNumber: number;
  lastPoints: number;
}

type StatusListener = (status: GameStatus) => void;

export class GameStatusContext {
  private status: GameStatus = {
    phase: "idle",
    currentGameId: 0,
    nextGameId: 0,
    countdown: 0,
    bettingWindow: 0,
    totalBettingSeconds: 30,
    totalScore: 0,
    roundsPlayed: 0,
    lastLetter: "",
    lastNumber: 0,
    lastPoints: 0,
  };

  private listeners: StatusListener[] = [];

  // ── Called by WS event: session_opened ───────────────────────────────────
  onSessionOpened(sessionNumber: number, bettingWindowMs: number ): void {
    this.status.phase = "betting";
    this.status.currentGameId = sessionNumber;
    this.status.nextGameId = sessionNumber + 1;
    this.status.bettingWindow = Math.floor(bettingWindowMs / 1000);
    this.status.totalBettingSeconds = Math.floor(bettingWindowMs / 1000);
    this.notify();
  }

  // ── Called by WS event: betting_countdown ────────────────────────────────
  onCountdownTick(secondsLeft: number, totalSeconds:number): void {
    this.status.phase = "betting";
    this.status.bettingWindow = secondsLeft;
    this.status.totalBettingSeconds = totalSeconds;
    this.notify();
  }

  // ── Called by WS event: bets_locked ─────────────────────────────────────
  onBetsLocked(): void {
    this.status.phase = "countdown";
    this.status.countdown = 3; // brief lock→spin transition
    this.notify();
  }

  // ── Called when spinWheel() starts ───────────────────────────────────────
  onSpinStart(): void {
    this.status.phase = "spinning";
    this.status.countdown = 0;
    this.notify();
  }
  onRoundChange(round:number): void {
    this.status.roundsPlayed = round;
    this.notify();
  }

  // ── Called when wheel animation finishes ─────────────────────────────────
  onSpinComplete( outerSeg: any, midSeg: any): void {
    this.status.lastLetter = midSeg.label;
    this.status.lastNumber = outerSeg.value;
    this.status.lastPoints = 0; // Adjust as needed
    this.status.totalScore += this.status.lastPoints;
    
    this.status.phase = "result";
    this.notify();
  }

  resetScore(): void {
    this.status.totalScore = 0;
    this.status.roundsPlayed = 0;
    this.status.lastLetter = "";
    this.status.lastNumber = 0;
    this.status.lastPoints = 0;
    this.status.phase = "idle";
    this.status.countdown = 0;
    this.status.bettingWindow = 0;
    this.notify();
  }

  getStatus(): Readonly<GameStatus> {
    return { ...this.status };
  }

  subscribe(cb: StatusListener): () => void {
    this.listeners.push(cb);
    cb({ ...this.status });
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(): void {
    const snap = { ...this.status };
    this.listeners.forEach((cb) => cb(snap));
  }
}

export const gameStatus = new GameStatusContext();