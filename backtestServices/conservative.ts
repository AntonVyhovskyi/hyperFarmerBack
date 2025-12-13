import { ADX, ATR, ema, EMA, RSI } from "technicalindicators";
import type { Candle, Trade, BacktestResult } from "./rsiAdx"
import e from "cors";



export interface IParamsForConservative {


  emaShortPeriod?: number;
  emaLongPeriod?: number;
  atrPeriod?: number;



  balanceStart?: number;           // Стартовий баланс для бектесту.
}

function formatDE(ts: number) {
  return new Date(ts).toLocaleString("uk-UA", {
    timeZone: "Europe/Berlin",
    hour12: false,
  });
}


export function conservativeStrategyBacktesting(
  candles: Candle[],
  {
    emaShortPeriod = 7,
    emaLongPeriod = 25,

    atrPeriod = 14,


    balanceStart = 1000,
  }: IParamsForConservative = {}
): BacktestResult {
  let balance = balanceStart;
  let position: "long" | "short" | null = null;
  let slPrice = 0;
  let tpPrice = 0;
  let entryPrice = 0;
  let entryTime: number | string = 0;
  let leverage = 7;
  let marketState: "trend" | "range" | "unknown" = "unknown";
  const trades: Trade[] = [];



  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  // 📊 розрахунок RSI, ADX, EMA та ATR

  const emaShortValues = EMA.calculate({ values: closes, period: emaShortPeriod });
  const emaLongValues = EMA.calculate({ values: closes, period: emaLongPeriod });
  const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: atrPeriod });

  const offset = Math.max(emaLongPeriod, atrPeriod) + 1;

  for (let i = offset; i < candles.length; i++) {

    const emaShortIndex = emaShortValues.length - (candles.length - i);
    const emaLongtIndex = emaLongValues.length - (candles.length - i);
    const atrIndex = atrValues.length - (candles.length - i);

    const prevEmaShort = emaShortValues[emaShortIndex - 1];
    const prevEmaLong = emaLongValues[emaLongtIndex - 1];;
    const emaShort = emaShortValues[emaShortIndex];
    const emaLong = emaLongValues[emaLongtIndex];
    const atr = atrValues[atrIndex];

    if (!prevEmaShort || !prevEmaLong || !atr) {
      continue;
    }






    const candle = candles[i];
    const price = candle.close;

    if (position === 'long') {
      const profitForCorrectStopProcent = (price - entryPrice) / entryPrice * 100;
      if (price <= slPrice) {
        const profit = (slPrice - entryPrice) * leverage;
        balance += profit;
        trades.push({
          type: 'long',
          entryTime,
          exitTime: formatDE(candle.openTime),
          entryPrice,
          exitPrice: slPrice,
          result: profit > 0 ? "win" : "loss",
          profitPct: (profit / entryPrice) * 100,
          balance,
          marketState
        });
        position = null;
      } else if (emaShort < emaLong) {
        const profit = (price - entryPrice) * leverage;
        balance += profit;
        trades.push({
          type: 'long',
          entryTime,
          exitTime: formatDE(candle.openTime),
          entryPrice,
          exitPrice: price,
          result: profit > 0 ? "win" : "loss",
          profitPct: (profit / entryPrice) * 100,
          balance,
          marketState
        })
        position = null;
      } else if (profitForCorrectStopProcent >= 2) {
        const newSl = entryPrice * 1.01;
        if (newSl > slPrice) slPrice = newSl;
      } else if (profitForCorrectStopProcent >= 1) {
        const newSl = entryPrice; // BE
        if (newSl > slPrice) slPrice = newSl;
      }
    }

    if (position === 'short') {
      const profitForCorrectStopProcent = (entryPrice - price) / entryPrice * 100;
      if (price >= slPrice) {
        const profit = (entryPrice - slPrice) * leverage;
        balance += profit;
        trades.push({
          type: 'short',
          entryTime,
          exitTime: formatDE(candle.openTime),
          entryPrice,
          exitPrice: slPrice,
          result: profit > 0 ? "win" : "loss",
          profitPct: (profit / entryPrice) * 100,
          balance,
          marketState
        });
        position = null;
      } else if (emaShort > emaLong) {
        const profit = (entryPrice - price) * leverage;
        balance += profit;
        trades.push({
          type: 'short',
          entryTime,
          exitTime: formatDE(candle.openTime),
          entryPrice,
          exitPrice: price,
          result: profit > 0 ? "win" : "loss",
          profitPct: (profit / entryPrice) * 100,
          balance,
          marketState
        })
        position = null;
      } else if (profitForCorrectStopProcent >= 2) {
        // вже нормальний профіт – гарантуємо +1%
        const newSl = entryPrice * 0.99;
        if (newSl < slPrice) slPrice = newSl;
      } else if (profitForCorrectStopProcent >= 1) {
        // менший профіт – просто BE
        const newSl = entryPrice;
        if (newSl < slPrice) slPrice = newSl;
      }
    }

    if (!position) {

      if (emaShort > emaLong && prevEmaShort < prevEmaLong) {
        position = 'long';
        entryPrice = price;
        entryTime = formatDE(candle.openTime);
        slPrice = entryPrice - atr * 1.5;
        marketState = atr > entryPrice * 0.005 ? "trend" : "range";
      } else if (emaShort < emaLong && prevEmaShort > prevEmaLong) {
        position = 'short';
        entryPrice = price;
        entryTime = formatDE(candle.openTime);
        slPrice = entryPrice + atr * 1.5;
        marketState = atr > entryPrice * 0.005 ? "trend" : "range";
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