import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import {
  getGameSessions,
  getGameSessionById,
  createSession,
  updateSession,
  deleteSession,
  reorderSessions,
  getActiveSession,
} from "../controllers/session.controller";

const router = Router();

router.get("/sessions", authenticate, async (req, res) => {
  try {
    const sessions = await getGameSessions(req.query);
    return res.json(sessions);
  } catch (error) {
    return res.status(500).json({ error: "Unable to fetch game sessions" });
  }
});
router.get("/sessions/active", authenticate, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const session = await getActiveSession(userId);
    return res.json(session);
  } catch (error) {
    console.error(error);
    return res.status(404).json({ error: error });
  }
});
router.get("/sessions/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id as string;
    const session = await getGameSessionById(id);
    return res.json(session);
  } catch (error) {
    return res.status(404).json({ error: "Game session not found" });
  }
});

router.post("/sessions", authenticate, async (req, res) => {
  try {
    const { duration, shouldWin, multiplier } = req.body;
    console.log(req.body);

    if (
      duration === undefined ||
      shouldWin === undefined ||
      multiplier === undefined
    ) {
      return res
        .status(400)
        .json({ error: "duration, shouldWin, and multiplier are required" });
    }

    const session = await createSession({
      duration,
      shouldWin,
      multiplierId: multiplier,
    });
    return res.status(201).json(session);
  } catch (error) {
    return res.status(500).json({ error: "Unable to create game session" });
  }
});

router.patch("/sessions/reorder", authenticate, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }

    const result = await reorderSessions(ids);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "Unable to reorder game sessions" });
  }
});

router.patch("/sessions/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id as string;
    const session = await updateSession(id, {
      ...req.body,
      multiplierId: req.body.multiplier,
    });
    return res.json(session);
  } catch (error) {
    return res.status(500).json({ error: "Unable to update game session" });
  }
});

router.delete("/sessions/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id as string;
    await deleteSession(id);
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: "Unable to delete game session" });
  }
});

export default router;
