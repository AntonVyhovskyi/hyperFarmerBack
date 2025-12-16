import { ATR, EMA } from "technicalindicators";
import { getCandlesFromBinance } from "../binance/api";
import { cancelAllOrdersByInstrument, changeLavarage, closeAllPositions, placeLimitOrder, placeStopOrTakeOrder } from "../sdk/trade";
import { ICoin } from "../types/coinsTypes";
import { normalizePrice, normalizeQty } from "../utils/correctSize";




const cashe = {
    candles: [] as string[][],
    leverage: 3,
    tickSize: 1,
    qtySize: 0.001,
    entryPrice: 0,
    trailingActive: false,
    slPrice: 0,
    beActive: false

}



export interface IParamsForEmaConservativeFunction {
    emaShortPeriod?: number;
    emaLongPeriod?: number;
    atrPeriod?: number;
    atrRange?: number;
    riskPct?: number;

    atrPctforSL?: number;
    trailStartFromParams?: number;
    trailGapFromParams?: number;
    leverage?: number;

    bePrc?: number;


    coin: ICoin;
    balance: number;
    candle: string[]
    timeframe: "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d";
    position: number;
}


function calculateQtyAndNMargin(balance: number, riskPct: number, entryPrice: number, slPrice: number, leverage: number, side: "long" | "short") {
    let dPrice
    if (side === "long") {
        dPrice = entryPrice - slPrice;
    } else {
        dPrice = slPrice - entryPrice;
    }

    const maxLoss = (balance * (riskPct / 100))
    const qty = maxLoss / dPrice;
    const notional = qty * entryPrice;
    const nMargin = notional / leverage;


    return { qty, nMargin, notional };
}

export const emaConservativeFunction = async (
    {
        emaShortPeriod = 7,
        emaLongPeriod = 25,
        atrPeriod = 14,
        atrRange = 0.5,
        riskPct = 1.5,
        atrPctforSL = 2.5,
        trailStartFromParams = 2,
        trailGapFromParams = 1,
        leverage = 7,
        bePrc = 1,

        coin,
        timeframe,
        balance,
        position,
        candle,

    }: IParamsForEmaConservativeFunction) => {
    if (cashe.candles.length === 0) {
        const candles = await getCandlesFromBinance(coin.name, timeframe, 500);

        if (!Array.isArray(candles)) {
            console.error("⛔ getCandlesFromBinance returned not array:", candles);
            return;
        }
        cashe.candles = candles;

    } else {
        cashe.candles.push(candle);
        cashe.candles.shift();
    }


    if (!Array.isArray(cashe.candles)) {
        console.log("⛔ cashe.candles is not array:", cashe.candles);
        return;
    }

    if (cashe.candles.length === 0) {
        console.log("⛔ cashe.candles is empty");
        return;
    }

    if (cashe.leverage !== leverage) {
        await changeLavarage(coin.index, leverage);
        cashe.leverage = leverage;


    }

    if (coin.name === "BTC") {
        cashe.tickSize = 0.1;
        cashe.qtySize = 0.001;
    } else if (coin.name === "ETH") {
        cashe.tickSize = 0.1;
        cashe.qtySize = 0.001;
    } else if (coin.name === "SOL") {
        cashe.tickSize = 0.01;
        cashe.qtySize = 0.01;
    }


    const closes = cashe.candles.map(c => parseFloat(c[4]));
    const highs = cashe.candles.map(c => parseFloat(c[2]));
    const lows = cashe.candles.map(c => parseFloat(c[3]));

    const emaShortValues = EMA.calculate({ values: closes, period: emaShortPeriod });
    const emaLongValues = EMA.calculate({ values: closes, period: emaLongPeriod });
    const atrValues = ATR.calculate({ close: closes, high: highs, low: lows, period: atrPeriod });


    const emaShort = emaShortValues[emaShortValues.length - 1];
    const emaLong = emaLongValues[emaLongValues.length - 1];

    const prevEmaShort = emaShortValues[emaShortValues.length - 2];
    const prevEmaLong = emaLongValues[emaLongValues.length - 2];

    const atr = atrValues[atrValues.length - 1];

    if (!emaShort || !emaLong || !prevEmaShort || !prevEmaLong || !atr) {
        console.log("⛔ Not enough data to calculate indicators");
        return;
    }




    // ________________________________BUY SELL FUNCTIONS_________________________________________
    // 
    // ____________________________________________________________________________________________




    const openBuyOrder = async (slPrice: number) => {
        const entryPrice: number = normalizePrice(((Number(closes[closes.length - 1]) + Number(closes[closes.length - 2])) / 2), cashe.tickSize);

        const { qty, nMargin, notional } = calculateQtyAndNMargin(balance, riskPct, entryPrice, slPrice, leverage, "long");
        if (nMargin > balance) {
            console.log(`⛔ Not enough balance to open long position. Required margin: ${nMargin}, Available balance: ${balance}`);
            const newLeverage = Math.ceil(notional / balance);

            if (newLeverage  > 20) {
                console.log('За велика позиція для данного ризик менеджменту');
                return
            }

            await changeLavarage(coin.index, newLeverage);
            cashe.leverage = newLeverage;
            const newMargin = notional / newLeverage;
            if (newMargin > balance) {
                console.log("❌ Even with new leverage margin still too high");
                return;
            }
        }


        const quantity = normalizeQty(qty, cashe.qtySize);
        await cancelAllOrdersByInstrument(coin.index, coin.name);
        await placeLimitOrder(coin.index, entryPrice, quantity, true);
        await placeStopOrTakeOrder(coin.index, slPrice, quantity, false, 'sl');
        cashe.entryPrice = entryPrice;
        cashe.slPrice = slPrice;
        console.log(`Buy ${quantity} ${coin.name} at ${entryPrice}`);

    }


    const openSellOrder = async (slPrice: number) => {
        const entryPrice: number = normalizePrice(
            (Number(closes[closes.length - 1]) +
                Number(closes[closes.length - 2])) /
            2,
            cashe.tickSize
        );

        const { qty, nMargin, notional } = calculateQtyAndNMargin(balance, riskPct, entryPrice, slPrice, leverage, "short");
        if (nMargin > balance) {
            console.log(`⛔ Not enough balance to open short position. Required margin: ${nMargin}, Available balance: ${balance}`);
            const newLeverage = Math.ceil(notional / balance);
             if (newLeverage  > 20) {
                console.log('За велика позиція для данного ризик менеджменту');
                return
            }
            await changeLavarage(coin.index, newLeverage);
            cashe.leverage = newLeverage;
            const newMargin = notional / newLeverage;
            if (newMargin > balance) {
                console.log("❌ Even with new leverage margin still too high");
                return;
            }


        }

        if (cashe.leverage > 20) {
            console.log('За велика позиція для данного ризик менеджменту');
            return

        }

        const quantity = normalizeQty(qty, cashe.qtySize);


        await cancelAllOrdersByInstrument(coin.index, coin.name);
        await placeLimitOrder(coin.index, entryPrice, quantity, false);
        await placeStopOrTakeOrder(coin.index, slPrice, quantity, true, 'sl');
        cashe.entryPrice = entryPrice;
        cashe.slPrice = slPrice;

        console.log(`Sell ${quantity} ${coin.name} at ${entryPrice}`);

    }

    // _____________________________________________________________________________________________
    // _____________________________________________________________________________________________
    // _____________________________________________________________________________________________



    // ______________________________OPEN POSITION LOGIC_________________________________________

    const openPositionLogic = async () => {

        if (position === 0) {
            cashe.trailingActive = false;
            cashe.beActive = false;
            if (emaShort > emaLong && prevEmaShort < prevEmaLong) {

                const lastFiveClothes = cashe.candles.slice(-5).map(c => parseFloat(c[4]));
                const minLastFive = Math.min(...lastFiveClothes);
                const priceChangePct = ((closes[closes.length - 1] - minLastFive) / minLastFive) * 100;
                if (priceChangePct <= atrRange) {
                    const slPrice = normalizePrice(closes[closes.length - 1] - atr * (atrPctforSL), cashe.tickSize);
                    await openBuyOrder(slPrice);
                }

            } else if (emaShort < emaLong && prevEmaShort > prevEmaLong) {
                const lastFiveClothes = cashe.candles.slice(-5).map(c => parseFloat(c[4]));
                const maxLastFive = Math.max(...lastFiveClothes);
                const priceChangePct = ((maxLastFive - closes[closes.length - 1]) / maxLastFive) * 100;
                if (priceChangePct <= atrRange) {
                    const slPrice = normalizePrice(closes[closes.length - 1] + atr * (atrPctforSL), cashe.tickSize);
                    await openSellOrder(slPrice);
                }

            } else {
                console.log('Чекаємо перетин ема')
            }
        }
    }

    openPositionLogic();



    // _____________________________________________________________________________________________

    if (position > 0) {
        // check for close long position
        if (emaShort < emaLong) {
            await cancelAllOrdersByInstrument(coin.index, coin.name);

            await closeAllPositions(coin.name, coin.index);
            position = 0;
            cashe.trailingActive = false
            await new Promise(r => setTimeout(r, 2000));
            await openPositionLogic();


            console.log(`Close long position on ${coin.name} due to EMA crossover`);


        } else if (!cashe.beActive && !cashe.trailingActive && closes[closes.length - 1] >= cashe.entryPrice * (1 + (bePrc / 100))) {
            await cancelAllOrdersByInstrument(coin.index, coin.name);
            await placeStopOrTakeOrder(coin.index, cashe.entryPrice, position.toString(), false, 'sl');
            cashe.slPrice = cashe.entryPrice;
            cashe.beActive = true
            console.log(`Активований беззбтковий стоп ${coin.name} по ціні ${cashe.entryPrice}`);
        } else if (!cashe.trailingActive && (closes[closes.length - 1] >= cashe.entryPrice * (1 + trailStartFromParams / 100))) {

            const newSlPrice = normalizePrice(cashe.slPrice * (1 + trailGapFromParams / 100), cashe.tickSize);
            cashe.slPrice = newSlPrice;
            await cancelAllOrdersByInstrument(coin.index, coin.name);
            await placeStopOrTakeOrder(coin.index, newSlPrice, position.toString(), false, 'sl');
            console.log(`Activate trailing SL for long position on ${coin.name} at ${cashe.entryPrice}`);
            cashe.trailingActive = true;
        } else if (cashe.trailingActive && (closes[closes.length - 1] >= cashe.slPrice * (1 + trailGapFromParams / 100))) {
            const newSlPrice = normalizePrice(cashe.slPrice * (1 + trailGapFromParams / 100), cashe.tickSize);
            cashe.slPrice = newSlPrice;
            await cancelAllOrdersByInstrument(coin.index, coin.name);
            await placeStopOrTakeOrder(coin.index, newSlPrice, position.toString(), false, 'sl');
            console.log(`Update SL for long position on ${coin.name} to ${newSlPrice}`);
            cashe.trailingActive = true;
        } else {
            console.log(`Відкрита Позиція ${coin.name}, розмір ${position}, трейлінг ${cashe.trailingActive ? 'активний' : 'неактивний'}. Змін по стопу нема.`);

        }
    } else if (position < 0) {
        // check for close short position
        if (emaShort > emaLong) {
            await cancelAllOrdersByInstrument(coin.index, coin.name);
            await closeAllPositions(coin.name, coin.index);
            console.log(`Close short position on ${coin.name} due to EMA crossover`);
            cashe.trailingActive = false
            position = 0;
            await new Promise(r => setTimeout(r, 2000));
            await openPositionLogic();
        } else if (!cashe.beActive && !cashe.trailingActive && (closes[closes.length - 1] <= (cashe.entryPrice * (1 - (bePrc / 100))))) {
            await cancelAllOrdersByInstrument(coin.index, coin.name);
            await placeStopOrTakeOrder(coin.index, cashe.entryPrice, Math.abs(position).toString(), true, 'sl');
            cashe.slPrice = cashe.entryPrice;
            cashe.beActive = true
            console.log(`Активований беззбтковий стоп ${coin.name} по ціні ${cashe.entryPrice}`);
        } else if (!cashe.trailingActive && (closes[closes.length - 1] <= cashe.entryPrice * (1 - trailStartFromParams / 100))) {
            await cancelAllOrdersByInstrument(coin.index, coin.name);
            await placeStopOrTakeOrder(coin.index, cashe.entryPrice, Math.abs(position).toString(), true, 'sl');
            cashe.slPrice = cashe.entryPrice;
            console.log(`Activate trailing SL for short position on ${coin.name} at ${cashe.entryPrice}`);
            cashe.trailingActive = true;
        } else if (cashe.trailingActive && (closes[closes.length - 1] <= cashe.slPrice * (1 - trailGapFromParams / 100))) {
            const newSlPrice = normalizePrice(cashe.slPrice * (1 - trailGapFromParams / 100), cashe.tickSize);
            cashe.slPrice = newSlPrice;
            await cancelAllOrdersByInstrument(coin.index, coin.name);
            await placeStopOrTakeOrder(coin.index, newSlPrice, Math.abs(position).toString(), true, 'sl');
            console.log(`Update SL for short position on ${coin.name} to ${newSlPrice}`);
            cashe.trailingActive = true;
        } else {
            console.log(`Відкрита Позиція ${coin.name}, розмір ${position}, трейлінг ${cashe.trailingActive ? 'активний' : 'неактивний'}. Змін по стопу нема.`);
        }
    }
};