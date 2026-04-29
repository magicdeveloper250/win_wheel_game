 
export type GamePhase = "idle" | "betting" | "countdown" | "spinning" | "result";

export interface GameStatus {
  phase: GamePhase;
  currentGameId: number;
  nextGameId: number;
  countdown: number;        
  bettingWindow: number;   
  autoPlay: boolean;
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
    currentGameId: 1467430,
    nextGameId: 1467431,
    countdown: 0,
    bettingWindow: 0,
    autoPlay: false,
    totalScore: 0,
    roundsPlayed: 0,
    lastLetter: "",
    lastNumber: 0,
    lastPoints: 0,
  };

  private listeners: StatusListener[] = [];
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private onSpinRequest: (() => void) | null = null;
  private onBettingOpen: (() => void) | null = null;
  private onBettingClose: (() => void) | null = null;

  readonly BETTING_SECONDS = 8;    
  readonly COUNTDOWN_SECONDS = 3;  
  readonly RESULT_SECONDS = 3;   

  setSpinCallback(cb: () => void): void { this.onSpinRequest = cb; }
  setBettingOpenCallback(cb: () => void): void { this.onBettingOpen = cb; }
  setBettingCloseCallback(cb: () => void): void { this.onBettingClose = cb; }

  getStatus(): Readonly<GameStatus> { return { ...this.status }; }

  toggleAutoPlay(): void {
    this.status.autoPlay = !this.status.autoPlay;
    if (this.status.autoPlay && this.status.phase === "idle") {
      this.openBetting();
    } else if (!this.status.autoPlay) {
      this.stopTick();
      if (this.status.phase !== "spinning") {
        this.status.phase = "idle";
        this.onBettingClose?.();
      }
    }
    this.notify();
  }

  openBetting(): void {
    if (this.status.phase === "spinning") return;
    this.stopTick();
    this.status.phase = "betting";
    this.status.bettingWindow = this.BETTING_SECONDS;
    this.notify();
    this.onBettingOpen?.();

    this.tickInterval = setInterval(() => {
      this.status.bettingWindow -= 1;
      if (this.status.bettingWindow <= 0) {
        this.closeBetting();
      } else {
        this.notify();
      }
    }, 1000);
  }

  closeBetting(): void {
    this.stopTick();
    this.onBettingClose?.();
    this.startCountdown();
  }

  skipBetting(): void {
    // User manually spins — close betting immediately and spin
    this.stopTick();
    this.onBettingClose?.();
    this.triggerSpin();
  }

  // ── Countdown (after betting closes) ─────────────────────────────────────
  startCountdown(): void {
    this.stopTick();
    this.status.phase = "countdown";
    this.status.countdown = this.COUNTDOWN_SECONDS;
    this.notify();

    this.tickInterval = setInterval(() => {
      this.status.countdown -= 1;
      if (this.status.countdown <= 0) {
        this.stopTick();
        this.triggerSpin();
      } else {
        this.notify();
      }
    }, 1000);
  }

  triggerSpin(): void {
    this.stopTick();
    this.status.phase = "spinning";
    this.status.countdown = 0;
    this.notify();
    this.onSpinRequest?.();
  }

  onSpinStart(): void {
    this.stopTick();
    this.status.phase = "spinning";
    this.notify();
  }

  onSpinComplete(letter: string, number: number, points: number): void {
    this.status.lastLetter = letter;
    this.status.lastNumber = number;
    this.status.lastPoints = points;
    this.status.totalScore += points;
    this.status.roundsPlayed += 1;
    this.status.currentGameId = this.status.nextGameId;
    this.status.nextGameId += 1;
    this.status.phase = "result";
    this.notify();

    // After result: always open next betting window (Aviator-style continuous loop)
    setTimeout(() => {
      if (this.status.autoPlay) {
        this.openBetting();
      } else {
        this.status.phase = "idle";
        this.notify();
      }
    }, this.RESULT_SECONDS * 1000);
  }

  resetScore(): void {
    this.stopTick();
    this.status.totalScore = 0;
    this.status.roundsPlayed = 0;
    this.status.lastLetter = "";
    this.status.lastNumber = 0;
    this.status.lastPoints = 0;
    this.status.phase = "idle";
    this.status.countdown = 0;
    this.status.bettingWindow = 0;
    this.onBettingClose?.();
    this.notify();
  }

  private stopTick(): void {
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  subscribe(cb: StatusListener): () => void {
    this.listeners.push(cb);
    cb({ ...this.status });
    return () => { this.listeners = this.listeners.filter((l) => l !== cb); };
  }

  private notify(): void {
    const snap = { ...this.status };
    this.listeners.forEach((cb) => cb(snap));
  }
}

export const gameStatus = new GameStatusContext();