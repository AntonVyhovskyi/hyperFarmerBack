import { Request, Response } from "express";
import { IParams } from "../types/paramsTypes";
import { subscribeBinanceCandlesWS } from "../binance/candlesWS";
import { rsiStrategy } from "../strategy/rsi";
import { subs as balanceAndPositionsWS } from "../sdk/wsInfo";


let params: IParams = {
    coin: {
        name: "ETH",
        index: 1,
    },
    interval: "1m",
    sl: 1,
    tp: 1,
    rsiPeriod: 14,
    minRsi: 50,
    maxRsi: 51,
    lavarage: 3,
    exitMinRsi: 50,
    exitMaxRsi: 51,
}

let userInfo = {
    balance: 0,
    position: 0
}

const subscribtions: any = {}
const user = process.env.USER_ADDRESS || "";
const balanceAndPosSubsribes: any = {}


const hlStarting: Record<string, boolean> = {};

export const tradeControllerStart = async (req: Request, res: Response) => {

    if (balanceAndPosSubsribes[user]) {
        return res.status(400).send("Trade already started");
    }

    if (hlStarting[user]) {
        return res.status(409).send("HL subscription is already starting");
    }



    hlStarting[user] = true;
    try {
        balanceAndPosSubsribes[user] = await balanceAndPositionsWS.clearinghouseState({ user }, (data) => {
            userInfo.balance = Number(data.clearinghouseState.crossMarginSummary.accountValue);
            userInfo.position = Number(
                data.clearinghouseState.assetPositions.find(
                    (pos) => pos.position.coin === params.coin.name
                )?.position?.szi
            ) || 0;
        });
    } finally {
        hlStarting[user] = false;
    }



    subscribtions[params.coin.name] = subscribeBinanceCandlesWS(
        params.coin.name,
        params.interval,
        (candle) => {
            rsiStrategy({
                coin: params.coin,
                timeframe: params.interval,
                candle: candle,
                sl: params.sl,
                tp: params.tp,
                rsiPeriod: params.rsiPeriod,
                minRsi: params.minRsi,
                maxRsi: params.maxRsi,
                lavarage: params.lavarage,
                position: userInfo.position,
                exitMinRsi: params.exitMinRsi,
                exitMaxRsi: params.exitMaxRsi,
                balance: userInfo.balance
            })


        }
    );
    res.status(200).send(`Trade started for ${params.coin.name} at interval ${params.interval}`);
}


export const tradeControllerStop = async (req: Request, res: Response) => {
    if (balanceAndPosSubsribes[user]) {
        await balanceAndPosSubsribes[user].unsubscribe();
        delete balanceAndPosSubsribes[user];
    }

    if (subscribtions[params.coin.name]) {
        await subscribtions[params.coin.name]();
        delete subscribtions[params.coin.name];
    }

    res.status(200).send(`Trade stopped for ${params.coin.name}`);
}

export const tradeControllerChangeParams = (req: Request, res: Response) => {
    const newParams: IParams = req.body;
    params = newParams;
    res.status(200).send(`Trade parameters updated`);
}

export const tradeControllerGetParams = (req: Request, res: Response) => {
    res.status(200).json(params);
}
export const tradeControllerGetStatus = (req: Request, res: Response) => {
    const isTrading = !!subscribtions[params.coin.name];
    res.status(200).json({ isTrading, params });
}
export const tradeControllerGetUserInfo = (req: Request, res: Response) => {
    res.status(200).json(userInfo);
}