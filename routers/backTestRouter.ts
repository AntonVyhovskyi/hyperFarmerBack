import { Router } from "express";
import { getCandlesController, runConservativeStrategyController, runConservativeV2StrategyController, runRsiAdxAdaptiveStrateg, runRsiAdxController, runRsiAdxOptimizationController, runTrendFollowingStrategy } from "../controllers/backTestController";
import { runConservativeV2VolumeMultiplierGridController } from "../controllers/backTestMultiController";

const router = Router();

// GET /api/candles/:symbol?interval=1h
router.get("/loadCandles/:symbol", getCandlesController);
router.get("/runRSIADX/:symbol", runRsiAdxController);
router.get("/runRSIADXOpt/:symbol", runRsiAdxOptimizationController);
router.get("/runRsiAdxAdaptive/:symbol", runRsiAdxAdaptiveStrateg);
router.get("/runConservative/:symbol", runConservativeStrategyController);
router.get("/runConservativeV2/:symbol", runConservativeV2StrategyController);
router.get("/runTrendFollowing/:symbol", runTrendFollowingStrategy);
router.get("/multipleConservative/:symbol", runConservativeV2VolumeMultiplierGridController);
export default router;  