import { Router } from "express";

import { tradeControllerStart } from "../controllers/tradeController";

const router = Router();

router.post('/start', tradeControllerStart);

export default router;