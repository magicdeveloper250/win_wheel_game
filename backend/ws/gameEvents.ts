import { broadcastToRoom, sendToUser } from "./rooms";
import { redis } from "../config/redis";

export const GAME_ROOM = "game";
export enum GameEventType {
  BET_PLACED = "bet_placed",
  SESSION_STARTED = "session_started",
  SESSION_ENDED = "session_ended",
  BETTING_COUNTDOWN = "betting_countdown",
  BETS_LOCKED = "bets_locked",
  SPIN_RESULT = "spin_result",
  ROUND_ENDED = "round_ended",
  SESSION_OPENED = "session_opened",
}

export async function emitGameEvent(
  type: GameEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  const message = {
    type,
    ...payload,
    ts: Date.now(),
  };
  switch (type) {
    case GameEventType.BET_PLACED: {
      if (typeof payload.userId === "string") {
        await sendToUser(payload.userId, GAME_ROOM, message);
      }
      break;
    }
    default: {
      await broadcastToRoom(GAME_ROOM, message);
      break;
    }
  }

  await redis.setex(`game:state:${GAME_ROOM}`, 3600, JSON.stringify(message));
}
