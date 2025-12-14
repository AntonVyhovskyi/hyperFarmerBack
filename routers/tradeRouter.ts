import { Router } from "express";

import { tradeControllerChangeParams, tradeControllerGetParams, tradeControllerGetStatus, tradeControllerGetUserInfo, tradeControllerStart, tradeControllerStartAdaptive, tradeControllerStartConservativeV2, tradeControllerStop, tradeControllerStopAdaptive, tradeControllerStopConservativeV2 } from "../controllers/tradeController";
import { checkPassword } from "../middleware/checkPassword";

const router = Router();

router.post('/start',checkPassword(), tradeControllerStart);
router.post('/stop',checkPassword(), tradeControllerStop);


router.post('/startAdaptive', checkPassword(), tradeControllerStartAdaptive);
router.post('/stopAdaptive', checkPassword(), tradeControllerStopAdaptive);


router.post('/startConservativeV2', checkPassword(), tradeControllerStartConservativeV2);
router.post('/stopConservativeV2', checkPassword(), tradeControllerStopConservativeV2);


router.get('/getParams', tradeControllerGetParams);
router.put('/changeParams', checkPassword(), tradeControllerChangeParams);
router.get('/status', tradeControllerGetStatus);
router.get('/userInfo', tradeControllerGetUserInfo);
router.get('/checkPass', checkPassword(), (req, res)=>{
    return res.status(200).json({message: true})
});

export default router;