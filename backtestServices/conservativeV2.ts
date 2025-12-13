import { ADX, ATR, ema, EMA, RSI } from "technicalindicators";
import type { Candle, Trade, BacktestResult } from "./rsiAdx"
import e from "cors";



export interface IParamsForConservativeV2 {


  emaShortPeriod?: number;
  emaLongPeriod?: number;
  atrPeriod?: number;
  atrRange?: number;
  riskPct?: number;
  laverageFromParams?: number;
  atrPctforSL?: number;
  trailStartFromParams?: number;
  trailGapFromParams?: number;

  balanceStart?: number;           // Стартовий баланс для бектесту.
}

function formatDE(ts: number) {
  return new Date(ts).toLocaleString("uk-UA", {
    timeZone: "Europe/Berlin",
    hour12: false,
  });
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


export function conservativeV2StrategyBacktesting(
  candles: Candle[],
  {
    emaShortPeriod = 7,
    emaLongPeriod = 25,
    atrRange = 0.6,
    atrPctforSL = 3,
    atrPeriod = 14,
    riskPct = 2,
    laverageFromParams = 7,
    balanceStart = 1000,
    trailStartFromParams = 2,
    trailGapFromParams = 1,
  }: IParamsForConservativeV2 = {}
) {
  let balance = balanceStart;
  let position: "long" | "short" | null = null;
  let slPrice = 0;
  let tpPrice = 0;
  let entryPrice = 0;
  let entryTime: number | string = 0;
  let leverage = laverageFromParams;
  let marketState: "trend" | "range" | "unknown" = "unknown";
  let trailingActive = false;
  let trailStart = trailStartFromParams;  // % — коли вмикається трейл
  let trailGap = trailGapFromParams;    // % — відстань від пікової ціни
  const trades: Trade[] = [];

  let quantity = 0;

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  // 📊 розрахунок RSI, ADX, EMA та ATR

  const emaShortValues = EMA.calculate({ values: closes, period: emaShortPeriod });
  const emaLongValues = EMA.calculate({ values: closes, period: emaLongPeriod });
  const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: atrPeriod });

  const offset = Math.max(emaLongPeriod, atrPeriod) + 5;

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
        const profit = quantity * (slPrice - entryPrice);
        const balanceBeforeTrade = balance;
        balance += profit;
        trades.push({
          type: 'long',
          entryTime,
          exitTime: formatDE(candle.openTime),
          entryPrice,
          exitPrice: slPrice,
          result: profit === 0 ? "null" : profit > 0 ? "win" : "loss",
          profitPct: (profit / balanceBeforeTrade) * 100,
          balance,
          leverage,
          marketState,
          exitType: "stopLoss"
        });
        position = null;
        trailingActive = false;
      } else if (emaShort < emaLong) {
        const profit = quantity * (price - entryPrice);
        const balanceBeforeTrade = balance;
        balance += profit;
        trades.push({
          type: 'long',
          entryTime,
          exitTime: formatDE(candle.openTime),
          entryPrice,
          exitPrice: price,
          result: profit === 0 ? "null" : profit > 0 ? "win" : "loss",
          profitPct: (profit / balanceBeforeTrade) * 100,
          balance,
          leverage,
          marketState,
          exitType: "emaCross"
        })
        position = null;
        trailingActive = false;
      }
      else if (
        profitForCorrectStopProcent >= 1.5 &&
        profitForCorrectStopProcent < trailStart &&
        !trailingActive
      ) {
        // BE: переносимо SL в точку входу
        const newSl = entryPrice;
        if (newSl > slPrice) slPrice = newSl;
      } else if (profitForCorrectStopProcent >= trailStart && !trailingActive) {
        // вмикаємо трейл
        trailingActive = true;
        const newSl = price * (1 - trailGap / 100);   // <<< 1 - !!!
        if (newSl > slPrice) slPrice = newSl;
      } else if (trailingActive) {
        // оновлюємо трейл
        const newSl = price * (1 - trailGap / 100);   // <<< 1 - !!!
        if (newSl > slPrice) slPrice = newSl;
      }
    }

    if (position === 'short') {
      const profitForCorrectStopProcent = (entryPrice - price) / entryPrice * 100;
      if (price >= slPrice) {
        const profit = quantity * (entryPrice - slPrice)
        const balanceBeforeTrade = balance;
        balance += profit;
        trades.push({
          type: 'short',
          entryTime,
          exitTime: formatDE(candle.openTime),
          entryPrice,
          exitPrice: slPrice,
          result: profit === 0 ? "null" : profit > 0 ? "win" : "loss",
          profitPct: (profit / balanceBeforeTrade) * 100,
          balance,
          leverage,
          marketState,
          exitType: "stopLoss"
        });
        position = null;
        trailingActive = false;
      } else if (emaShort > emaLong) {
        const profit = quantity * (entryPrice - price)
        const balanceBeforeTrade = balance;
        balance += profit;
        trades.push({
          type: 'short',
          entryTime,
          exitTime: formatDE(candle.openTime),
          entryPrice,
          exitPrice: price,
          result: profit === 0 ? "null" : profit > 0 ? "win" : "loss",
          profitPct: (profit / balanceBeforeTrade) * 100,
          balance,
          leverage,
          marketState,
          exitType: "emaCross"
        })
        position = null;
        trailingActive = false;
      }
      else if (
        profitForCorrectStopProcent >= 1.5 &&
        profitForCorrectStopProcent < trailStart &&
        !trailingActive
      ) {
        const newSl = entryPrice;           // BE
        if (newSl < slPrice) slPrice = newSl;
      } else if (profitForCorrectStopProcent >= trailStart && !trailingActive) {
        trailingActive = true;
        const newSl = price * (1 + trailGap / 100);   // <<< 1 + !!!
        if (newSl < slPrice) slPrice = newSl;
      } else if (trailingActive) {
        const newSl = price * (1 + trailGap / 100);   // <<< 1 + !!!
        if (newSl < slPrice) slPrice = newSl;
      }
    }

    if (!position) {
      trailingActive = false;
      if (emaShort > emaLong && prevEmaShort < prevEmaLong) {
        const lastFiveClothes = candles.slice(i - 5, i).map(c => c.close);
        const minLastFive = Math.min(...lastFiveClothes);
        const priceChangePct = ((price - minLastFive) / minLastFive) * 100;

        if (priceChangePct <= atrRange) {
          continue; // ігноруємо сигнал у бічному ринку
        }
        const { qty, nMargin, notional } = calculateQtyAndNMargin(balance, riskPct, price, price - atr * atrPctforSL, leverage, "long");
        quantity = qty;
        leverage = laverageFromParams;
        if (nMargin > balance) {
          leverage = Math.ceil(notional / balance);
        }
        position = 'long';
        entryPrice = price;
        entryTime = formatDE(candle.openTime);
        slPrice = entryPrice - atr * atrPctforSL;
        marketState = atr > entryPrice * 0.005 ? "trend" : "range";
      } else if (emaShort < emaLong && prevEmaShort > prevEmaLong) {
        const lastFiveClothes = candles.slice(i - 5, i).map(c => c.close);
        const maxLastFive = Math.max(...lastFiveClothes);
        const priceChangePct = ((maxLastFive - price) / maxLastFive) * 100;
        if (priceChangePct <= atrRange) {
          continue; // ігноруємо сигнал у бічному ринку
        }
        const { qty, nMargin, notional } = calculateQtyAndNMargin(balance, riskPct, price, price + atr * atrPctforSL, leverage, "short");
        quantity = qty;
        leverage = laverageFromParams;
        if (nMargin > balance) {
          leverage = Math.ceil(notional / balance);
        }
        position = 'short';
        entryPrice = price;
        entryTime = formatDE(candle.openTime);
        slPrice = entryPrice + atr * atrPctforSL;
        marketState = atr > entryPrice * 0.005 ? "trend" : "range";
      }



    }




  }


  return {

    balanceStart: balanceStart,
    balanceEnd: balance,
    params: {
      emaShortPeriod,
      emaLongPeriod,
      atrPeriod,
      atrRange,
      atrPctforSL,
      riskPct,
      laverageFromParams,
      trailStartFromParams,
      trailGapFromParams
    },

    summary: {
      total: trades.length,
      wins: trades.filter(t => t.result === "win").length,
      nulls: trades.filter(t => t.result === "null").length,
      losses: trades.filter(t => t.result === "loss").length,
      winRate: trades.length ? (trades.filter(t => t.result === "win").length / trades.length) * 100 : 0,
      profitPct: ((balance - balanceStart) / balanceStart) * 100,
      winsWithEmaCross: trades.filter(t => t.result === "win" && t.exitType === "emaCross").length,
      winsWithStopLoss: trades.filter(t => t.result === "win" && t.exitType === "stopLoss").length,
      lossesWithEmaCross: trades.filter(t => t.result === "loss" && t.exitType === "emaCross").length,
      lossesWithStopLoss: trades.filter(t => t.result === "loss" && t.exitType === "stopLoss").length,

    },
    trades: trades
  };

}