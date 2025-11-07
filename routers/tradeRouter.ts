import { Router } from "express";

import { tradeControllerChangeParams, tradeControllerGetParams, tradeControllerGetStatus, tradeControllerGetUserInfo, tradeControllerStart, tradeControllerStop } from "../controllers/tradeController";
import { checkPassword } from "../middleware/checkPassword";

const router = Router();

router.post('/start',checkPassword(), tradeControllerStart);
router.post('/stop',checkPassword(), tradeControllerStop);
router.get('/getParams', tradeControllerGetParams);
router.put('/changeParams', checkPassword(), tradeControllerChangeParams);
router.get('/status', tradeControllerGetStatus);
router.get('/userInfo', tradeControllerGetUserInfo);
router.get('/checkPass', checkPassword(), (req, res)=>{
    return res.status(200).json({message: true})
});

export default router;