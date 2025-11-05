import { Router } from "express";

import { tradeControllerChangeParams, tradeControllerGetParams, tradeControllerGetStatus, tradeControllerGetUserInfo, tradeControllerStart, tradeControllerStop } from "../controllers/tradeController";

const router = Router();

router.post('/start', tradeControllerStart);
router.post('/stop', tradeControllerStop);
router.get('/getParams', tradeControllerGetParams);
router.put('/changeParams', tradeControllerChangeParams);
router.get('/status', tradeControllerGetStatus);
router.get('/userInfo', tradeControllerGetUserInfo);

export default router;