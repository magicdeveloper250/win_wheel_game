import {
  endBetSession,
  getNextSession,
  spin,
  startBetSession,
} from "../controllers/spin.controller";
import { emitGameEvent, GameEventType } from "../ws/gameEvents";

const BETTING_DURATION_MS = 180_000;
const COUNTDOWN_TICK_MS = 1_000;
const ANIMATION_DURATION_MS = 5_000;
const RESULTS_DISPLAY_MS = 3_000;
const LOCK_BUFFER_MS = 500;

let isLoopRunning = false;

const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

const runCountdown = async (totalMs: number) => {
  let remaining = Math.floor(totalMs / 1000);

  while (remaining > 0 && isLoopRunning) {
    await emitGameEvent(GameEventType.BETTING_COUNTDOWN, {
      secondsLeft: remaining,
      totalSeconds: Math.floor(totalMs / 1000),
    });
    await delay(COUNTDOWN_TICK_MS);
    remaining--;
  }

  if (!isLoopRunning) return;
  await emitGameEvent(GameEventType.BETTING_COUNTDOWN, {
    secondsLeft: 0,
    totalSeconds: Math.floor(totalMs / 1000),
  });
};

export const startGameLoop = async () => {
  if (isLoopRunning) {
    console.log("[GameLoop] Already running, skipping duplicate start.");
    return;
  }

  isLoopRunning = true;
  console.log("[GameLoop] Started.");

  while (isLoopRunning) {
    try {
      const session = await getNextSession();
      if (!isLoopRunning) break;
      const betSession = await startBetSession({ sessionId: session.id });

      console.log(
        `[GameLoop] Session #${betSession.session.sessionNumber} opened.`,
      );

      await emitGameEvent(GameEventType.SESSION_OPENED, {
        sessionId: betSession.id,
        sessionNumber: betSession.session.sessionNumber,
        bettingWindowMs: BETTING_DURATION_MS,
        multiplier: betSession.session.multiplier ?? null,
        shouldWin: betSession.session.shouldWin ?? false,
        duration: ANIMATION_DURATION_MS / 1000,
      });
      if (!isLoopRunning) break;

      await runCountdown(BETTING_DURATION_MS);
      if (!isLoopRunning) break;

      await emitGameEvent(GameEventType.BETS_LOCKED, {
        sessionId: betSession.id,
        sessionNumber: betSession.session.sessionNumber,
      });
      if (!isLoopRunning) break;

      console.log(
        `[GameLoop] Bets locked for session #${betSession.session.sessionNumber}.`,
      );
      await delay(LOCK_BUFFER_MS);
      if (!isLoopRunning) break;

      const result = await spin( );
      if (!isLoopRunning) break;

      console.log(
        `[GameLoop] Session #${betSession.session.sessionNumber} result - win number: ${result.winNumber}`,
      );

      await emitGameEvent(GameEventType.SPIN_RESULT, {
        sessionId: betSession.id,
        sessionNumber: betSession.session.sessionNumber,
        winNumber: result.winNumber,
        winMultiplier: result.winMultiplier,
        animation: result.animation ?? {
          duration: ANIMATION_DURATION_MS / 1000,
        },
        completedSession: result.completedSession,
        nextSession: result.nextSession ?? null,
      });
      if (!isLoopRunning) break;

      await delay(ANIMATION_DURATION_MS);
      if (!isLoopRunning) break;
      await endBetSession({
        sessionId: betSession.id,
        resultId: result.result.id,
      });
      await emitGameEvent(GameEventType.ROUND_ENDED, {
        completedSession: result.completedSession,
        winNumber: result.winNumber,
        nextSession: result.nextSession ?? null,
      });
      if (!isLoopRunning) break;

      console.log(
        `[GameLoop] Round ended. Showing results for ${RESULTS_DISPLAY_MS}ms.`,
      );
      await delay(RESULTS_DISPLAY_MS);
    } catch (err) {
      console.error("[GameLoop] Error - retrying in 5s:", err);
      if (!isLoopRunning) break;
      await delay(5_000);
    }
  }

  console.log("[GameLoop] Stopped.");
};

export const stopGameLoop = () => {
  if (!isLoopRunning) return;
  isLoopRunning = false;
  console.log("[GameLoop] Stop requested - will halt after current step.");
};
