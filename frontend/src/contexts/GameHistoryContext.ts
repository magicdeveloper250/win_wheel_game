// contexts/GameHistoryContext.ts
// Manages game round history with pagination support

export interface HistoryEntry {
  gameId: number;
  letter: string;
  number: number;
  points: number;
  segmentColor: number;
  letterColor:number;
  timestamp: number;
  isZero: boolean;
}

export class GameHistoryContext {
  private entries: HistoryEntry[] = [];
  private maxEntries: number = 200;
  private gameIdCounter: number = 1467415;
  private listeners: Array<(entries: HistoryEntry[]) => void> = [];

  // Pagination
  readonly PAGE_SIZE = 12;
  private currentPage: number = 0;

  addEntry(gameId: number, letter: string, number: number, points: number, segmentColor: number, letterColor:number): HistoryEntry {
    const entry: HistoryEntry = {
      gameId,
      letter,
      number,
      points,
      segmentColor,
      letterColor,
      timestamp: Date.now(),
      isZero: points === 0,
    };
    this.entries.unshift(entry);  
    if (this.entries.length > this.maxEntries) {
      this.entries.pop();
    }
    this.currentPage = 0; 
    this.notify();
    return entry;
  }
addEntries(entries: HistoryEntry[]): void {
  this.entries = entries.map((e) => ({
    ...e,
    gameId: e.gameId,
    timestamp: Date.now(),
  }));

  // Keep only up to maxEntries
  if (this.entries.length > this.maxEntries) {
    this.entries = this.entries.slice(0, this.maxEntries);
  }

  this.currentPage = 0;  
  this.notify();
}

  getCurrentGameId(): number {
    return this.gameIdCounter + 1;
  }

  getPage(page: number): HistoryEntry[] {
    const start = page * this.PAGE_SIZE;
    return this.entries.slice(start, start + this.PAGE_SIZE);
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  setPage(page: number): void {
    const maxPage = this.getTotalPages() - 1;
    this.currentPage = Math.max(0, Math.min(page, maxPage));
    this.notify();
  }

  getTotalPages(): number {
    return Math.max(1, Math.ceil(this.entries.length / this.PAGE_SIZE));
  }

  getTotalEntries(): number {
    return this.entries.length;
  }

  getAll(): HistoryEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
    this.currentPage = 0;
    this.notify();
  }

  subscribe(cb: (entries: HistoryEntry[]) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb(this.getPage(this.currentPage)));
  }
}

export const gameHistory = new GameHistoryContext();