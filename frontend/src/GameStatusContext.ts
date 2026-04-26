// contexts/GameStatusContext.ts
// Tracks game phase, auto-play toggle, countdown timer, current game number

export type GamePhase = "idle" | "countdown" | "spinning" | "result";

export interface GameStatus {
  phase: GamePhase;
  currentGameId: number;
  nextGameId: number;
  countdown: number; // seconds remaining
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
    countdown: 8,
    autoPlay: true,
    totalScore: 0,
    roundsPlayed: 0,
    lastLetter: "",
    lastNumber: 0,
    lastPoints: 0,
  };

  private listeners: StatusListener[] = [];
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private onSpinRequest: (() => void) | null = null;

  readonly COUNTDOWN_SECONDS = 8;

  setSpinCallback(cb: () => void): void {
    this.onSpinRequest = cb;
  }

  getStatus(): Readonly<GameStatus> {
    return { ...this.status };
  }

  toggleAutoPlay(): void {
    this.status.autoPlay = !this.status.autoPlay;
    if (this.status.autoPlay && this.status.phase === "idle") {
      this.startCountdown();
    } else if (!this.status.autoPlay) {
      this.stopCountdown();
      if (this.status.phase === "countdown") {
        this.status.phase = "idle";
      }
    }
    this.notify();
  }

  setAutoPlay(val: boolean): void {
    if (this.status.autoPlay === val) return;
    this.toggleAutoPlay();
  }

  startCountdown(): void {
    if (this.status.phase === "spinning") return;
    this.stopCountdown();
    this.status.phase = "countdown";
    this.status.countdown = this.COUNTDOWN_SECONDS;
    this.notify();

    this.countdownInterval = setInterval(() => {
      this.status.countdown -= 1;
      if (this.status.countdown <= 0) {
        this.stopCountdown();
        this.triggerSpin();
      } else {
        this.notify();
      }
    }, 1000);
  }

  stopCountdown(): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  triggerSpin(): void {
    this.status.phase = "spinning";
    this.status.countdown = 0;
    this.notify();
    if (this.onSpinRequest) this.onSpinRequest();
  }

  onSpinStart(): void {
    this.status.phase = "spinning";
    this.stopCountdown();
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

    // After result display, if autoplay -> start next countdown
    setTimeout(() => {
      if (this.status.autoPlay) {
        this.startCountdown();
      } else {
        this.status.phase = "idle";
        this.notify();
      }
    }, 2200);
  }

  resetScore(): void {
    this.stopCountdown();
    this.status.totalScore = 0;
    this.status.roundsPlayed = 0;
    this.status.lastLetter = "";
    this.status.lastNumber = 0;
    this.status.lastPoints = 0;
    this.status.phase = "idle";
    this.status.countdown = this.COUNTDOWN_SECONDS;
    this.notify();
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
