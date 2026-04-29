
export interface PredictionResult {
  predicted: number | null;
  actual: number;
  distanceFromActual: number;
  multiplier: number;
  fixedBonus: number;
  basePoints: number;
  totalPoints: number;
  prizeLabel: string;
  hasPrize: boolean;
}

export interface PredictionState {
  selected: number | null;
  locked: boolean;
  lastResult: PredictionResult | null;
  correctCount: number;
  nearCount: number;
  totalPredictions: number;
  amount: string;
}

type Listener = (state: PredictionState) => void;

export const WHEEL_NUMBERS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
  31, 32, 33, 34, 35, 36,
];

const WHEEL_TOTAL = 37;

export class PredictionContext {
  private state: PredictionState = {
    selected: null,
    locked: false,
    lastResult: null,
    correctCount: 0,
    nearCount: 0,
    totalPredictions: 0,
    amount: "",
  };

  private listeners: Listener[] = [];

  getState(): Readonly<PredictionState> {
    return { ...this.state };
  }

  select(number: number): void {
    if (this.state.locked) return;
    this.state.selected = this.state.selected === number ? null : number;
    this.notify();
  }

  setAmount(v: string): void {
    this.state.amount = v;
    this.notify();
  }

  clear(): void {
    if (this.state.locked) return;
    this.state.selected = null;
    this.state.amount = "";
    this.notify();
  }

  lock(): void {
    this.state.locked = true;
    this.notify();
  }

  unlock(): void {
    this.state.locked = false;
    this.notify();
  }

  evaluate(actualNumber: number, basePoints: number): PredictionResult {
    const predicted = this.state.selected;
    let multiplier = 1;
    let fixedBonus = 0;
    let prizeLabel = "";
    let hasPrize = false;
    let dist = 0;

    if (predicted !== null) {
      this.state.totalPredictions++;
      dist = Math.min(
        Math.abs(predicted - actualNumber),
        WHEEL_TOTAL - Math.abs(predicted - actualNumber),
      );
    }

    const totalPoints = Math.round(basePoints * multiplier) + fixedBonus;

    const result: PredictionResult = {
      predicted,
      actual: actualNumber,
      distanceFromActual: dist,
      multiplier,
      fixedBonus,
      basePoints,
      totalPoints,
      prizeLabel,
      hasPrize,
    };

    this.state.lastResult = result;
    this.state.locked = false;
    this.state.selected = null;
    this.state.amount = "";
    this.notify();
    return result;
  }

  resetStats(): void {
    this.state = {
      selected: null,
      locked: false,
      lastResult: null,
      correctCount: 0,
      nearCount: 0,
      totalPredictions: 0,
      amount: "",
    };
    this.notify();
  }

  subscribe(cb: Listener): () => void {
    this.listeners.push(cb);
    cb({ ...this.state });
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb({ ...this.state }));
  }
}

export const predictionCtx = new PredictionContext()