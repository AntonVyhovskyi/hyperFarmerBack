import { ADX, ATR, EMA, rsi, RSI } from "technicalindicators";
import { getCandlesFromBinance } from "../binance/api";
import { cancelAllOrdersByInstrument, changeLavarage, placeLimitOrder, placeStopOrTakeOrder } from "../sdk/trade";
import { ICoin } from "../types/coinsTypes";
import { normalizePrice, normalizeQty } from "../utils/correctSize";



const cashe = {
    candles: [] as string[][],
    lavarage: 3,
    tickSize: 1,
    qtySize: 0.001,

}

export interface IParamsForAdaptiveFunction {
    coin: ICoin;
    balance: number;
    candle: string[];
    lavarage: number;
    timeframe: "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "8h" | "12h" | "1d";
    position: number;

    rsiPeriod: number;
    adxPeriod: number;
    emaPeriod: number;
    atrPeriod: number;
    // =========================
    // Режим ринку: TREND / RANGE
    // =========================

    adxTrendThreshold: number;      // ADX > це → активний тренд (вмикаємо трендову логіку).
    adxRangeThreshold: number;      // ADX < це → флєт (вмикаємо mean-reversion логіку).

    // =========================
    // ATR множники для SL/TP
    // =========================

    atrSlMultTrend: number;         // SL у TREND режимі = ATR * цей множник.
    atrTpMultTrend: number;         // TP у TREND режимі = ATR * цей множник.

    atrSlMultRange: number;         // SL у RANGE режимі = ATR * цей множник.
    atrTpMultRange: number;         // TP у RANGE режимі = ATR * цей множник.

    // =========================
    // Динамічні RSI зони (percentiles)
    // =========================

    rsiPercentileLookback: number;  // Кількість свічок для збору RSI (наприклад 480 = 24 години на 3m).
    rsiLowPercentile: number;       // Нижня межа (персентиль), напр. 10 → dynLow = нижні 10% RSI.
    rsiHighPercentile: number;      // Верхня межа (персентиль), напр. 90 → dynHigh = верхні 10% RSI.

}

export const rsiAdxAdaptiveFunction = async (
    { coin,
        timeframe,
        balance,
        position,
        candle,
        lavarage,
        rsiPeriod,
        adxPeriod,
        emaPeriod,
        atrPeriod,
        adxTrendThreshold,
        adxRangeThreshold,
        atrSlMultTrend,
        atrTpMultTrend,
        atrSlMultRange,
        atrTpMultRange,
        rsiPercentileLookback,
        rsiLowPercentile,
        rsiHighPercentile }: IParamsForAdaptiveFunction
) => {

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

    if (cashe.lavarage !== lavarage) {
        await changeLavarage(coin.index, lavarage);
        cashe.lavarage = lavarage;
        
        
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

    const rsiValues = RSI.calculate({ values: closes, period: rsiPeriod });
    const adxValues = ADX.calculate({ close: closes, high: highs, low: lows, period: adxPeriod });
    const emaValues = EMA.calculate({ values: closes, period: emaPeriod });
    const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: atrPeriod });

    const rsi = rsiValues[rsiValues.length - 1];
    const adx = adxValues[adxValues.length - 1].adx;
    const ema = emaValues[emaValues.length - 1];
    const atr = atrValues[atrValues.length - 1];

    const isTrend = adx > adxTrendThreshold;
    const isRange = adx < adxRangeThreshold;


    const openBuyOrder = async (slPrice: number, tpPrice: number) => {




        const entryPrice: number = normalizePrice(((Number(closes[closes.length - 1]) + Number(closes[closes.length - 2])) / 2), cashe.tickSize);

        console.log({ entryPrice, slPrice, tpPrice });

        const quantity = normalizeQty((((balance * lavarage) / entryPrice) * 0.7),  cashe.qtySize);
        await cancelAllOrdersByInstrument(coin.index, coin.name);
        await placeLimitOrder(coin.index, entryPrice, quantity, true);
        await placeStopOrTakeOrder(coin.index, slPrice, quantity, false, 'sl');
        await placeStopOrTakeOrder(coin.index, tpPrice, quantity, false, 'tp');


        console.log(`Buy ${quantity} ${coin.name} at ${entryPrice} with RSI ${rsi} ATR ${atr} ADX ${adx} EMA ${ema}`);

    }

    const openSellOrder = async (slPrice: number, tpPrice: number) => {
        const entryPrice: number = normalizePrice(
            (Number(closes[closes.length - 1]) +
                Number(closes[closes.length - 2])) /
            2,
            cashe.tickSize
        );

        const quantity = normalizeQty(
            ((balance * lavarage) / entryPrice) * 0.7,
             cashe.qtySize
        );
        await cancelAllOrdersByInstrument(coin.index, coin.name);
        await placeLimitOrder(coin.index, entryPrice, quantity, false);
        await placeStopOrTakeOrder(coin.index, slPrice, quantity, true, 'sl');
        await placeStopOrTakeOrder(coin.index, tpPrice, quantity, true, 'tp');
        console.log(`Sell ${quantity} ${coin.name} at ${entryPrice} with RSI ${rsi} ATR ${atr} ADX ${adx} EMA ${ema}`);

    }

    if (isTrend && position === 0) {
        const rsiIsGood = rsi > 35 || rsi < 65;
        if (closes[closes.length - 1] > ema && rsiIsGood) {
            const slPrice = normalizePrice(closes[closes.length - 1] - atr * atrSlMultTrend, cashe.tickSize);
            const tpPrice = normalizePrice(closes[closes.length - 1] + atr * atrTpMultTrend, cashe.tickSize);
            await openBuyOrder(slPrice, tpPrice);
        } else if (closes[closes.length - 1] < ema && rsiIsGood) {
            const slPrice = normalizePrice(closes[closes.length - 1] + atr * atrSlMultTrend, cashe.tickSize);
            const tpPrice = normalizePrice(closes[closes.length - 1] - atr * atrTpMultTrend, cashe.tickSize);
            await openSellOrder(slPrice, tpPrice);
        } else { console.log(`No action. Is trend But conditions is not good. Price is ${closes[closes.length - 1]}. Ema is ${ema}. RSI is ${rsi}. RSI must be 35 - 65`); }
    } else if (isRange && position === 0) {
        const rsiLookback = rsiValues.slice(-rsiPercentileLookback);
        const sortedRsi = [...rsiLookback].sort((a, b) => a - b);
        const dynLowIndex = Math.floor((rsiLowPercentile / 100) * sortedRsi.length);
        const dynHighIndex = Math.floor((rsiHighPercentile / 100) * sortedRsi.length);
        const dynLow = sortedRsi[dynLowIndex];
        const dynHigh = sortedRsi[dynHighIndex];
        if (rsi < dynLow) {
            const slPrice = normalizePrice(closes[closes.length - 1] - atr * atrSlMultRange, cashe.tickSize);
            const tpPrice = normalizePrice(closes[closes.length - 1] + atr * atrTpMultRange, cashe.tickSize);
            await openBuyOrder(slPrice, tpPrice);
        } else if (rsi > dynHigh) {
            const slPrice = normalizePrice(closes[closes.length - 1] + atr * atrSlMultRange, cashe.tickSize);
            const tpPrice = normalizePrice(closes[closes.length - 1] - atr * atrTpMultRange, cashe.tickSize);
            await openSellOrder(slPrice, tpPrice);
        } else { console.log(`No action. Range But conditions is not good. RSI is ${rsi}. RSI must be <${dynLow} or >${dynHigh}`); }
    } else { console.log(`No action. No trend Nor range. ADX: ${adx}. Or position is here. Position: ${position}`); }
}