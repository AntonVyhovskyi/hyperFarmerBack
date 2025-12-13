import { ADX, ATR, EMA, RSI } from "technicalindicators";
import type { Candle, Trade, BacktestResult } from "./rsiAdx"
import e from "cors";



export interface IParamsForAdaptive {

    // =========================
    // Базові індикатори
    // =========================

    rsiPeriod?: number;              // Період RSI. Впливає на чутливість сигналів перепроданості/перекупленості.
    adxPeriod?: number;              // Період ADX. Визначає, як швидко ADX вловлює тренд.
    emaPeriod?: number;              // Період EMA для визначення напрямку тренду (ціна > EMA = ап-тренд).
    atrPeriod?: number;              // Період ATR. Використовується для адаптивних SL/TP.

    // =========================
    // Режим ринку: TREND / RANGE
    // =========================

    adxTrendThreshold?: number;      // ADX > це → активний тренд (вмикаємо трендову логіку).
    adxRangeThreshold?: number;      // ADX < це → флєт (вмикаємо mean-reversion логіку).

    // =========================
    // ATR множники для SL/TP
    // =========================

    atrSlMultTrend?: number;         // SL у TREND режимі = ATR * цей множник.
    atrTpMultTrend?: number;         // TP у TREND режимі = ATR * цей множник.

    atrSlMultRange?: number;         // SL у RANGE режимі = ATR * цей множник.
    atrTpMultRange?: number;         // TP у RANGE режимі = ATR * цей множник.

    // =========================
    // Динамічні RSI зони (percentiles)
    // =========================

    rsiPercentileLookback?: number;  // Кількість свічок для збору RSI (наприклад 480 = 24 години на 3m).
    rsiLowPercentile?: number;       // Нижня межа (персентиль), напр. 10 → dynLow = нижні 10% RSI.
    rsiHighPercentile?: number;      // Верхня межа (персентиль), напр. 90 → dynHigh = верхні 10% RSI.

    // =========================
    // Баланс
    // =========================

    balanceStart?: number;           // Стартовий баланс для бектесту.
}

function formatDE(ts: number) {
  return new Date(ts).toLocaleString("uk-UA", {
    timeZone: "Europe/Berlin",
    hour12: false,
  });
}


export function rsiAdxAdaptiveStrategy(
    candles: Candle[],
    { rsiPeriod = 14,
        adxPeriod = 14,
        emaPeriod = 50,
        atrPeriod = 14,
        adxTrendThreshold = 25,
        adxRangeThreshold = 20,
        atrSlMultTrend = 1.5,
        atrTpMultTrend = 3,
        atrSlMultRange = 1.0,
        atrTpMultRange = 2.0,
        rsiPercentileLookback = 480,
        rsiLowPercentile = 10,
        rsiHighPercentile = 90,
        balanceStart = 1000,
    }: IParamsForAdaptive = {}
): BacktestResult {
    let balance = balanceStart;
    let position: "long" | "short" | null = null;
    let slPrice = 0;
    let tpPrice = 0;
    let entryPrice = 0;
    let entryTime = 0;
    let leverage = 7;
    let marketState: "trend" | "range" | "unknown" = "unknown";
    const trades: Trade[] = [];

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    // 📊 розрахунок RSI, ADX, EMA та ATR
    const rsiValues = RSI.calculate({ values: closes, period: rsiPeriod });
    const adxValues = ADX.calculate({ close: closes, high: highs, low: lows, period: adxPeriod });
    const emaValues = EMA.calculate({ values: closes, period: emaPeriod });
    const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: atrPeriod });

    const offset = rsiPercentileLookback + rsiPeriod;

    for (let i = offset; i < candles.length; i++) {
        const rsiIndex = rsiValues.length - (candles.length - i);
        const adxIndex = adxValues.length - (candles.length - i);
        const emaIndex = emaValues.length - (candles.length - i);
        const atrIndex = atrValues.length - (candles.length - i);

        const rsi = rsiValues[rsiIndex];
        const adx = adxValues[adxIndex]?.adx;
        const ema = emaValues[emaIndex];
        const atr = atrValues[atrIndex];

        if (!rsi || !adx || !ema || !atr) continue;

        const isTrend = adx > adxTrendThreshold;
        const isRange = adx < adxRangeThreshold;

        // 📈 Визначення динамічних RSI зон на основі персентилів
        const rsiLookbackSlice = rsiValues.slice(rsiIndex - rsiPercentileLookback, rsiIndex);
        const sortedRsiSlice = [...rsiLookbackSlice].sort((a, b) => a - b);
        const dynRsiLow = sortedRsiSlice[Math.floor((rsiLowPercentile / 100) * sortedRsiSlice.length)];
        const dynRsiHigh = sortedRsiSlice[Math.floor((rsiHighPercentile / 100) * sortedRsiSlice.length)];

        const candle = candles[i];
        const price = candle.close;
        const highPrice = candle.high;
        const lowPrice = candle.low;

        if (position === 'long') {
            if (lowPrice <= slPrice) {
                const profitPct = ((slPrice - entryPrice) / entryPrice) * 100; // буде від’ємне
                balance *= (1 + (profitPct * leverage) / 100);

                trades.push({
                    type: 'long',
                    entryTime,
                    exitTime: formatDE(candle.openTime),
                    entryPrice,
                    exitPrice: slPrice,
                    result: "loss",
                    profitPct,
                    balance,
                    marketState
                });

                position = null;
            } else if (highPrice >= tpPrice) {
                const profitPct = ((tpPrice - entryPrice) / entryPrice) * 100; // додатнє
                balance *= (1 + (profitPct * leverage) / 100);

                trades.push({
                    type: 'long',
                    entryTime,
                    exitTime: formatDE(candle.openTime),
                    entryPrice,
                    exitPrice: tpPrice,
                    result: "win",
                    profitPct,
                    balance,
                    marketState
                });

                position = null;
            }
        } else if (position === 'short') {
            if (highPrice >= slPrice) {
                const profitPct = ((entryPrice - slPrice) / entryPrice) * 100; // від’ємне
                balance *= (1 + (profitPct * leverage) / 100);

                trades.push({
                    type: 'short',
                    entryTime,
                    exitTime: formatDE(candle.openTime),
                    entryPrice,
                    exitPrice: slPrice,
                    result: "loss",
                    profitPct,
                    marketState,
                    balance
                });

                position = null;
            } else if (lowPrice <= tpPrice) {
                const profitPct = ((entryPrice - tpPrice) / entryPrice) * 100; // ✅ TP для шорта
                balance *= (1 + (profitPct * leverage) / 100);

                trades.push({
                    type: 'short',
                    entryTime,
                    exitTime: formatDE(candle.openTime),
                    entryPrice,
                    exitPrice: tpPrice,
                    result: "win",
                    profitPct,
                    marketState,
                    balance
                });

                position = null;
            }
        }

        if (!position) {
            if (isRange) {
                if (rsi < dynRsiLow) {
                    position = 'long';
                    entryPrice = price;
                    entryTime = formatDE(candle.openTime);
                    slPrice = entryPrice - atr * atrSlMultRange;
                    tpPrice = entryPrice + atr * atrTpMultRange;
                    marketState = "range";
                } else if (rsi > dynRsiHigh) {
                    position = 'short';
                    entryPrice = price;
                    entryTime = formatDE(candle.openTime);
                    slPrice = entryPrice + atr * atrSlMultRange;
                    tpPrice = entryPrice - atr * atrTpMultRange;
                    marketState = "range";
                }
            } else
                 if (isTrend) {
                if (price > ema && rsi < 65 && rsi > 35) {
                    position = 'long';
                    entryPrice = price;
                    entryTime = formatDE(candle.openTime);
                    slPrice = entryPrice - atr * atrSlMultTrend;
                    tpPrice = entryPrice + atr * atrTpMultTrend;
                    marketState = "trend";
                } else if (price < ema && rsi > 35 && rsi < 65) {
                    position = 'short';
                    entryPrice = price;
                    entryTime = formatDE(candle.openTime);
                    slPrice = entryPrice + atr * atrSlMultTrend;
                    tpPrice = entryPrice - atr * atrTpMultTrend;
                    marketState = "trend";
                }
            }
        }
    }

    const isTrendWinRate = trades.filter(t => t.marketState === "trend" && t.result === "win").length / trades.filter(t => t.marketState === "trend").length * 100;
    const isRangeWinRate = trades.filter(t => t.marketState === "range" && t.result === "win").length / trades.filter(t => t.marketState === "range").length * 100;

    return {
        isTrendWinRate,
        isRangeWinRate,
        balanceStart: balanceStart,
        balanceEnd: balance,

        summary: {
            total: trades.length,
            wins: trades.filter(t => t.result === "win").length,
            losses: trades.filter(t => t.result === "loss").length,
            winRate: trades.length ? (trades.filter(t => t.result === "win").length / trades.length) * 100 : 0,
            profitPct: ((balance - balanceStart) / balanceStart) * 100
        },
        trades: trades
    };

}