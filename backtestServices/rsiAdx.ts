import { RSI, ADX } from "technicalindicators";

export interface Candle {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    closeTime: number;
}

export interface Trade {
    type: "long" | "short";
    entryTime: number;
    exitTime: number;
    entryPrice: number | string;
    exitPrice: number | string;
    profitPct: number;
    result: "win" | "loss";
    marketState?: "trend" | "range" | "unknown";
    balance?: number;
    leverage?: number;
}

export interface BacktestResult {
    balanceStart: number;
    balanceEnd: number;
    trades: Trade[];
    summary: {
        total: number;
        wins: number;
        losses: number;
        winRate: number;
        profitPct: number;
    };
    іsTrendWinRate?: number;
    isRangeWinRate?: number;
    
}

export interface StrategyParams {
    rsiPeriod?: number;
    adxPeriod?: number;
    rsiBuy?: number;
    rsiSell?: number;
    adxThreshold?: number;
    slPercent?: number;
    tpPercent?: number;
    balanceStart?: number;
}

export function rsiAdxStrategy(
    candles: Candle[],
    {
        rsiPeriod = 14,
        adxPeriod = 14,
        rsiBuy = 25,
        rsiSell = 75,
        adxThreshold = 20,
        slPercent = 1,
        tpPercent = 3,
        balanceStart = 1000,
    }: StrategyParams = {}
): BacktestResult {
    let balance = balanceStart;
    let position: "long" | "short" | null = null;
    let entryPrice = 0;
    let entryTime = 0;
    const trades: Trade[] = [];

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    // 📊 розрахунок RSI та ADX
    const rsiValues = RSI.calculate({ values: closes, period: rsiPeriod });
    const adxValues = ADX.calculate({ close: closes, high: highs, low: lows, period: adxPeriod });


    const validLength = Math.min(rsiValues.length, adxValues.length);
    const offset = candles.length - validLength;

    for (let i = offset; i < candles.length; i++) {
        const rsiIndex = rsiValues.length - (candles.length - i);
        const adxIndex = adxValues.length - (candles.length - i);

        const rsi = rsiValues[rsiIndex];
        const adx = adxValues[adxIndex]?.adx;

        const candle = candles[i];
        const price = candle.close;
        
        if (!rsi || !adx) continue;
        

        const longSignal = rsi < rsiBuy && adx < adxThreshold;
        const shortSignal = rsi > rsiSell && adx < adxThreshold;

        const tpLong = entryPrice * (1 + tpPercent / 100);
        const slLong = entryPrice * (1 - slPercent / 100);
        const tpShort = entryPrice * (1 - tpPercent / 100);
        const slShort = entryPrice * (1 + slPercent / 100);

        if (position === "long") {
            if (candle.high >= tpLong) {
                const profit = tpPercent;
                balance *= 1 + profit / 100;
                trades.push({
                    type: "long",
                    entryTime,
                    exitTime: candle.closeTime,
                    entryPrice,
                    exitPrice: tpLong,
                    profitPct: profit,
                    result: "win"
                });
                position = null;
            } else if (candle.low <= slLong) {
                const loss = -slPercent;
                balance *= 1 + loss / 100;
                trades.push({
                    type: "long",
                    entryTime,
                    exitTime: candle.closeTime,
                    entryPrice,
                    exitPrice: slLong,
                    profitPct: loss,
                    result: "loss"
                });
                position = null;
            } else if (shortSignal) {
                const diffPct = ((price - entryPrice) / entryPrice) * 100;
                balance *= 1 + diffPct / 100;
                trades.push({
                    type: "long",
                    entryTime,
                    exitTime: candle.closeTime,
                    entryPrice,
                    exitPrice: price,
                    profitPct: diffPct,
                    result: diffPct >= 0 ? "win" : "loss"
                });
                position = "short";
                entryPrice = price;
                entryTime = candle.openTime;
            }
        } else if (position === "short") {
            if (candle.low <= tpShort) {
                const profit = tpPercent;
                balance *= 1 + profit / 100;
                trades.push({
                    type: "short",
                    entryTime,
                    exitTime: candle.closeTime,
                    entryPrice,
                    exitPrice: tpShort,
                    profitPct: profit,
                    result: "win"
                });
                position = null;
            } else if (candle.high >= slShort) {
                const loss = -slPercent;
                balance *= 1 + loss / 100;
                trades.push({
                    type: "short",
                    entryTime,
                    exitTime: candle.closeTime,
                    entryPrice,
                    exitPrice: slShort,
                    profitPct: loss,
                    result: "loss"
                });
                position = null;
            } else if (longSignal) {
                const diffPct = ((entryPrice - price) / entryPrice) * 100;
                balance *= 1 + diffPct / 100;
                trades.push({
                    type: "short",
                    entryTime,
                    exitTime: candle.closeTime,
                    entryPrice,
                    exitPrice: price,
                    profitPct: diffPct,
                    result: diffPct >= 0 ? "win" : "loss"
                });
                position = "long";
                entryPrice = price;
                entryTime = candle.openTime;
            }
        } else {
            if (longSignal) {
                position = "long";
                entryPrice = price;
                entryTime = candle.openTime;
            } else if (shortSignal) {
                position = "short";
                entryPrice = price;
                entryTime = candle.openTime;
            }
        }
    }

    const wins = trades.filter(t => t.result === "win").length;
    const losses = trades.length - wins;
    const winRate = trades.length ? (wins / trades.length) * 100 : 0;
    const totalProfit = ((balance - balanceStart) / balanceStart) * 100;

    return {
        balanceStart,
        balanceEnd: parseFloat(balance.toFixed(2)),
        trades,
        summary: {
            total: trades.length,
            wins,
            losses,
            winRate: parseFloat(winRate.toFixed(2)),
            profitPct: parseFloat(totalProfit.toFixed(2))
        }
    };
}
