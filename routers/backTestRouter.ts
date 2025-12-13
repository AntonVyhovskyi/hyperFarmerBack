import { Router } from "express";
import { getCandlesController, runConservativeStrategyController, runConservativeV2StrategyController, runRsiAdxAdaptiveStrateg, runRsiAdxController, runRsiAdxOptimizationController } from "../controllers/backTestController";

const router = Router();

// GET /api/candles/:symbol?interval=1h
router.get("/loadCandles/:symbol", getCandlesController);
router.get("/runRSIADX/:symbol", runRsiAdxController);
router.get("/runRSIADXOpt/:symbol", runRsiAdxOptimizationController);
router.get("/runRsiAdxAdaptive/:symbol", runRsiAdxAdaptiveStrateg);
router.get("/runConservative/:symbol", runConservativeStrategyController);
router.get("/runConservativeV2/:symbol", runConservativeV2StrategyController);
export default router;