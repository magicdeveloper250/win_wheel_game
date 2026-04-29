import { Router, Request, Response } from "express";
 
import { authenticate } from "../middleware/authenticate";
import { createTargetNumber, deleteTargetNumber, getAllTargetNumbers, getTargetNumberById, updateTarget } from "../controllers/targetNumber.controller";
 

const router = Router();

 
router.post(
  "/numbers/",
  async (req: Request, res: Response) => {
    const {  number, color } = req.body;

    const result = await createTargetNumber({  number, color });

    if ("error" in result) {
      if (result.error.includes("already exists")) {
        return res.status(409).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(201).json(result);
  },
);

 
router.get(
  "/numbers/",
  authenticate,
  async (req: Request, res: Response) => {
    const { page, limit } = req.query as unknown as {
      page: number;
      limit: number;
    };

    const result = await getAllTargetNumbers({ page, limit });

    if ("error" in result) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  },
);

 
router.get("/numbers/:id", authenticate, async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const result = await getTargetNumberById(id);

  if (!result) {
    return res.status(404).json({ error: "TargetNumber not found." });
  }

  if ("error" in result) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
});


router.patch("/numbers/:id", authenticate, async(req, res)=>{
     const {  number, color } = req.body;
const id = req.params.id as string;
    const result = await updateTarget(id,{  number, color });

    if ("error" in result) {
      if (result.error.includes("already exists")) {
        return res.status(409).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(201).json(result);
    
})
 
 
 
router.delete(
  "/numbers/:id",
  authenticate,
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const result = await deleteTargetNumber(id);

    if ("error" in result) {
      if (result.error === "TargetNumber not found.") {
        return res.status(404).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  },
);

export default router;