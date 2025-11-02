import { Request, Response } from "express";
import { IParams } from "../types/paramsTypes";
import { subscribeBinanceCandlesWS } from "../binance/candlesWS";
import { rsiStrategy } from "../strategy/rsi";


const params: IParams = {
    coin: {
        name: "ETH",
        index: 1,
    },
    interval: "1m",
}

const subscribtions:any = {}

export const tradeControllerStart = (req: Request, res: Response) => {
    subscribtions[params.coin.name] = subscribeBinanceCandlesWS(
        params.coin.name,
        params.interval,
        (candle) => {
           rsiStrategy({
                coin: params.coin,
                timeframe: params.interval,
                candle: candle,
                sl: 1,
                tp: 1,
                rsiPeriod: 14,
                minRsi: 25,
                maxRsi: 75,
                lavarage: 3,
                position: 0,
                exitMinRsi: 30,
                exitMaxRsi: 70
           })
        }
    );
    res.status(200).send(`Trade started for ${params.coin.name} at interval ${params.interval}`);
}