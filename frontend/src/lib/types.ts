// ─── Enums (const + inferred type pattern — compatible with erasableSyntaxOnly) ──

export const GameSessionStatus = {
  UPCOMING: "UPCOMING",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

 
export type GameSessionStatus = (typeof GameSessionStatus)[keyof typeof GameSessionStatus];

export const TransactionType = {
  DEPOSIT: "DEPOSIT",
  WITHDRAWAL: "WITHDRAWAL",
  BET: "BET",
  WIN: "WIN",
  REFUND: "REFUND",
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const UserRole = {
  ADMIN: "ADMIN",
  USER: "USER",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

// ─── Game Session ─────────────────────────────────────────────────────────────

export interface GameSession {
  id: string;
  sessionNumber:number;
  duration: number;
  startedAt: string;
  endedAt: string;
  shouldWin: boolean;
  status: GameSessionStatus;
  createdAt: string;
  updatedAt: string;
  gameResults?: GameResult[];
  gameBets?: GameBet[];
  multiplier?: GameWinMultiplierSetting;
}

export interface GameSessionCreate {
  duration: number;
  startedAt: string;
  endedAt: string;
  shouldWin: boolean;
  status?: GameSessionStatus;
}

export interface GameSessionUpdate {
  duration?: number;
  startedAt?: string;
  endedAt?: string;
  shouldWin?: boolean;
  status?: GameSessionStatus;
}

// ─── Game Bet ─────────────────────────────────────────────────────────────────

export interface GameBet {
  id: string;
  userId: string;
  user?: User;
  targetNumber: number;
  amount: number;
  sessionId: string;
  session?: GameSession;
  createdAt: string;
  updatedAt: string;
}

export interface GameBetCreate {
  userId: string;
  targetNumber: number;
  amount: number;
  sessionId: string;
}

// ─── Game Result ──────────────────────────────────────────────────────────────

export interface GameResult {
  id: string;
  sessionId: string;
  session?: GameSession;
  winNumber: number;
  winMultiplier: number;
  createdAt: string;
  updatedAt: string;
}

export interface GameResultCreate {
  sessionId: string;
  winNumber: number;
  winMultiplier: number;
}

// ─── Transaction ──────────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  userId: string;
  user?: User;
  amount: number;
  type: TransactionType;
  tax: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionCreate {
  userId: string;
  amount: number;
  type: TransactionType;
  tax: number;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  createdAt: string;
}

// ─── System Config ────────────────────────────────────────────────────────────

export interface SystemConfig {
  id: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

// ─── User Session ─────────────────────────────────────────────────────────────

export interface UserSession {
  id: string;
  userId: string;
  user?: User;
  token: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Password Reset Token ─────────────────────────────────────────────────────

export interface PasswordResetToken {
  id: string;
  userId: string;
  user?: User;
  token: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Game Financial Settings ──────────────────────────────────────────────────

export interface GameFinancialSetting {
  id: string;
  maxBetAmount: number;
  minBetAmount: number;
  taxPercentage: number;
  houseEdgePercentage: number;
  createdAt: string;
  updatedAt: string;
}

export interface GameFinancialSettingUpdate {
  maxBetAmount?: number;
  minBetAmount?: number;
  taxPercentage?: number;
  houseEdgePercentage?: number;
}

// ─── Game Target Number Settings ──────────────────────────────────────────────

export interface GameTargetNumberSetting {
  id: string;
  targetNumber: number;
  createdAt: string;
   color: string;
  updatedAt: string;
}

// ─── Game Win Multiplier Settings ─────────────────────────────────────────────

export interface GameWinMultiplierSetting {
  id: string;
  multiplierLetter: string;
   color: string;
  winMultiplier: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Paginated Response ───────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── API Error ────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
}

export interface NotificationData {
  id?: string;
  message?: string;
  title?: string;
  type?: string;
  createdAt?: string;
  read?: boolean;
  [key: string]: unknown;
}

// ─── WebSocket Game Events ─────────────────────────────────────────────────

export interface WsSessionOpened {
  type: "session_opened";
  sessionId: string;
  sessionNumber: number;
  bettingWindowMs: number;
  multiplier: GameWinMultiplierSetting | null;
  shouldWin: boolean;
  duration: number;
  ts: number;
}

export interface WsBettingCountdown {
  type: "betting_countdown";
  secondsLeft: number;
  totalSeconds: number;
  ts: number;
}

export interface WsBetsLocked {
  type: "bets_locked";
  sessionId: string;
  sessionNumber: number;
  ts: number;
}

export interface WsSpinResult {
  type: "spin_result";
  sessionId: string;
  sessionNumber: number;
  winNumber: number;
  animation: { duration: number };
  completedSession: GameSession;
  nextSession: GameSession | null;
  ts: number;
}

export interface WsRoundEnded {
  type: "round_ended";
  completedSession: GameSession;
  winNumber: number;
  nextSession: GameSession | null;
  ts: number;
}

export interface WsJoined {
  type: "joined";
  roomId: string;
}

export interface WsPong {
  type: "pong";
}

export type LiveGameWsEvent =
  | WsSessionOpened
  | WsBettingCountdown
  | WsBetsLocked
  | WsSpinResult
  | WsRoundEnded
  | WsJoined
  | WsPong;

export type LiveGameEventType = LiveGameWsEvent["type"];

// Legacy application-flow types used by useApplicatinFlow hook
export type ApplicationStep = 0 | 1 | 2 | 3;

export interface ApplicationAnswer {
  questionId: string;
  question: string;
  answer: string;
}

export interface ApplicationFormState {
  jobId: string;
  applicationId: string | null;
  answers: ApplicationAnswer[];
  resumeFile: File | null;
  resumeId: string | null;
}

export interface Job {
  id: string;
}

export interface ApplicationResponse {
  id: string;
  job_id: string;
  step: number;
  job_responses: string | null;
  resumes?: Array<{ id: string }>;
}
