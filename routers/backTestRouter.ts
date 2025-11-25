import { Router } from "express";
import { getCandlesController, runRsiAdxController, runRsiAdxOptimizationController } from "../controllers/backTestController";

const router = Router();

// GET /api/candles/:symbol?interval=1h
router.get("/loadCandles/:symbol", getCandlesController);
router.get("/runRSIADX/:symbol", runRsiAdxController);
router.get("/runRSIADXOpt/:symbol", runRsiAdxOptimizationController);
export default router;