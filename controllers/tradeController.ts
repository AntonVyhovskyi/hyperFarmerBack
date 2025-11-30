import { Request, Response } from "express";
import { IParams } from "../types/paramsTypes";
import { subscribeBinanceCandlesWS } from "../binance/candlesWS";
import { rsiStrategy } from "../strategy/rsi";
import { subs as balanceAndPositionsWS } from "../sdk/wsInfo";
import WebSocket from "ws";

import { IParamsForAdaptiveFunction, rsiAdxAdaptiveFunction } from "../strategy/rsiAdxAdaptive";


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


let paramsForAdaptive: Omit<IParamsForAdaptiveFunction, "balance" | "candle" | "position"> = {
    coin: {
        name: "SOL",
        index: 2,
    },
    timeframe: "3m",
    lavarage: 7,

    rsiPeriod: 14,
    adxPeriod: 14,
    emaPeriod: 50,
    atrPeriod: 14,
    adxTrendThreshold: 25,
    adxRangeThreshold: 20,
    atrSlMultTrend: 2.5,
    atrTpMultTrend: 5,
    atrSlMultRange: 1.0,
    atrTpMultRange: 2.0,
    rsiPercentileLookback: 480,
    rsiLowPercentile: 10,
    rsiHighPercentile: 90,

}

let userInfo = {
    balance: 0,
    position: 0
}

const subscribtions: any = {}


// const hlStarting: Record<string, boolean> = {};

export const tradeControllerStart = async (req: Request, res: Response) => {

    // if (balanceAndPosSubsribes[user]) {
    //     return res.status(400).send("Trade already started");
    // }

    // if (hlStarting[user]) {
    //     return res.status(409).send("HL subscription is already starting");
    // }



    // hlStarting[user] = true;
    // try {
    //     balanceAndPosSubsribes[user] = await balanceAndPositionsWS.clearinghouseState({ user }, (data) => {
    //         userInfo.balance = Number(data.clearinghouseState.crossMarginSummary.accountValue);
    //         userInfo.position = Number(
    //             data.clearinghouseState.assetPositions.find(
    //                 (pos) => pos.position.coin === params.coin.name
    //             )?.position?.szi
    //         ) || 0;
    //     });
    // } finally {
    //     hlStarting[user] = false;
    // }

    if (subscribtions[params.coin.name]) {
        return res.status(400).send(`Trade already started for ${params.coin.name}`);
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

export const tradeControllerStartAdaptive = async (req: Request, res: Response) => {
    if (subscribtions[paramsForAdaptive.coin.name]) {
        return res.status(400).send(`Adaptive trade already started for ${paramsForAdaptive.coin.name}`);
    }

    subscribtions[paramsForAdaptive.coin.name] = subscribeBinanceCandlesWS(
        paramsForAdaptive.coin.name,
        paramsForAdaptive.timeframe,
        (candle) => {
            rsiAdxAdaptiveFunction({
                ...paramsForAdaptive,
                candle,
                balance: userInfo.balance,
                position: userInfo.position
            });
        }
    );
    res.status(200).send(`Adaptive trade started for ${paramsForAdaptive.coin.name} at interval ${paramsForAdaptive.timeframe}`);
}

export const tradeControllerStop = async (req: Request, res: Response) => {
    // if (balanceAndPosSubsribes[user]) {
    //     await balanceAndPosSubsribes[user].unsubscribe();
    //     delete balanceAndPosSubsribes[user];
    // }

    if (subscribtions[params.coin.name]) {
        await subscribtions[params.coin.name]();
        delete subscribtions[params.coin.name];
    }

    res.status(200).send(`Trade stopped for ${params.coin.name}`);
}

export const tradeControllerStopAdaptive = async (req: Request, res: Response) => {
    if (subscribtions[paramsForAdaptive.coin.name]) {
        await subscribtions[paramsForAdaptive.coin.name]();
        delete subscribtions[paramsForAdaptive.coin.name];
    }
    res.status(200).send(`Adaptive trade stopped for ${paramsForAdaptive.coin.name}`);
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




function startClearinghouseWS() {
    const url = "wss://api.hyperliquid.xyz/ws";
    const user = process.env.USER_ADDRESS;

    if (!user) {
        console.error("USER_ADDRESS not set");
        return;
    }

    let ws: WebSocket | null = null;

    const connect = () => {
        ws = new WebSocket(url);

        ws.on("open", () => {
            console.log("[HL WS] connected");

            const msg = {
                method: "subscribe",
                subscription: {
                    type: "clearinghouseState",
                    user,
                },
            };

            ws!.send(JSON.stringify(msg));
        });

        ws.on("message", (raw) => {
            let msg: any;
            try {
                msg = JSON.parse(raw.toString());
            } catch {
                return;
            }

            if (msg.channel !== "clearinghouseState") {
                return;
            }

            const chs = msg.data?.clearinghouseState;
            if (!chs) {
                console.log(
                    "[HL WS] unexpected clearinghouseState shape:",
                    JSON.stringify(msg, null, 2)
                );
                return;
            }

            // --- баланс (equity) ---
            // з доки воно приходить строкою, тому Number()
            const equity = Number(chs.crossMarginSummary.accountValue);

            // --- позиції ---
            const assetPositions = Array.isArray(chs.assetPositions)
                ? chs.assetPositions
                : [];

            const activePositions = assetPositions
                .filter((p: any) => p.position && Number(p.position.szi) !== 0)
                .map((p: any) => p.position);

            const posForCoin = activePositions.find(
                (p: any) => p.coin === params.coin.name
            );

            userInfo.balance = equity;
            userInfo.position = posForCoin ? Number(posForCoin.szi) : 0;

            // можеш залишити для дебагу
            // console.log("Updated userInfo:", userInfo);
        });

        ws.on("close", () => {
            console.log("[HL WS] closed, reconnecting...");
            setTimeout(connect, 2000); // простий реконект
        });

        ws.on("error", (err) => {
            console.log("[HL WS] error:", err.message);
        });
    };

    connect();
}

// ---- ЗАПУСКАЄМО WS ОДИН РАЗ ----
startClearinghouseWS();