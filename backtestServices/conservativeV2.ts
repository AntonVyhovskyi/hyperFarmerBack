import { ATR, EMA, SMA, } from "technicalindicators";
import type { Candle, Trade, BacktestResult } from "./rsiAdx"
import e from "cors";



export interface IParamsForConservativeV2 {


  emaShortPeriod?: number;
  emaLongPeriod?: number;
  atrPeriod?: number;
  atrRange?: number;
  atrRange2?: number;
  atrRange3?: number;
  riskPct?: number;
  riskPct2?: number;
  riskPct3?: number;
  laverageFromParams?: number;
  atrPctforSL?: number;
  trailStartFromParams?: number;
  trailGapFromParams?: number;
  feeRate?: number;
  avarageValuesOfVolumePeriod?: number;
  avarageVolumeMultiplier?: number;
  
  balanceStart?: number;           // Стартовий баланс для бектесту.
}

function formatDE(ts: number) {
  return new Date(ts).toLocaleString("uk-UA", {
    timeZone: "Europe/Berlin",
    hour12: false,
  });
}

function calculateQtyAndNMargin(balance: number, riskPct: number, entryPrice: number, slPrice: number, leverage: number, feeRate: number = 0.0004, side: "long" | "short") {
  let dPrice
  if (side === "long") {
    dPrice = entryPrice - slPrice;
  } else {
    dPrice = slPrice - entryPrice;
  }

  const maxLoss = (balance * (riskPct / 100))
  const qty = maxLoss / (dPrice + feeRate * (entryPrice + slPrice));
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
    atrRange2 = 1.2,
    atrRange3 = 2,
    atrPctforSL = 3,
    atrPeriod = 14,
    riskPct = 1,
    riskPct2 = 6,
    riskPct3 = 10,
    laverageFromParams = 7,
    balanceStart = 1000,
    trailStartFromParams = 2,
    trailGapFromParams = 1,
    feeRate = 0.0004,
    avarageValuesOfVolumePeriod = 50,
    avarageVolumeMultiplier = 1.8,

  }: IParamsForConservativeV2 = {}
) {
  let balance = balanceStart;
  let position: "long" | "short" | null = null;
  let feeEntry = 0;
  let feeExit = 0;
  let slPrice = 0;
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
  const volumes = candles.map(c => c.volume);

  // 📊 розрахунок RSI, ADX, EMA та ATR

  const emaShortValues = EMA.calculate({ values: closes, period: emaShortPeriod });
  const emaLongValues = EMA.calculate({ values: closes, period: emaLongPeriod });
  const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: atrPeriod });
  const avarageValuesOfVolume = SMA.calculate({ values: volumes, period: avarageValuesOfVolumePeriod });

  const offset = Math.max(emaLongPeriod, atrPeriod, avarageValuesOfVolumePeriod) + 5;

  for (let i = offset; i < candles.length; i++) {

    const emaShortIndex = emaShortValues.length - (candles.length - i);
    const emaLongtIndex = emaLongValues.length - (candles.length - i);
    const atrIndex = atrValues.length - (candles.length - i);
    const AVVIndex = avarageValuesOfVolume.length - (candles.length - i);



    const prevEmaShort = emaShortValues[emaShortIndex - 1];
    const prevEmaLong = emaLongValues[emaLongtIndex - 1];;
    const emaShort = emaShortValues[emaShortIndex];
    const emaLong = emaLongValues[emaLongtIndex];
    const atr = atrValues[atrIndex];
    const avarageVolume = avarageValuesOfVolume[AVVIndex];




    if (!prevEmaShort || !prevEmaLong || !atr) {
      continue;
    }






    const candle = candles[i];
    const price = candle.close;
    const low = candle.low
    const hight = candle.high
    const volume = candle.volume;
    const prevVolume = candles[i - 1].volume;


    if (position === 'long') {
      const profitForCorrectStopProcent = (price - entryPrice) / entryPrice * 100;
      if (low <= slPrice) {
        const profit = quantity * (slPrice - entryPrice);
        feeExit = (slPrice * quantity) * feeRate;
        const balanceBeforeTrade = balance;
        const netProfit = profit - (feeEntry + feeExit);
        balance += netProfit;
        trades.push({
          type: 'long',
          entryTime,
          exitTime: formatDE(candle.openTime),
          entryPrice,
          exitPrice: slPrice,
          result: netProfit === 0 ? "null" : netProfit > 0 ? "win" : "loss",
          profitPct: (netProfit / balanceBeforeTrade) * 100,
          balance,
          fee: feeEntry + feeExit,
          leverage,
          marketState,
          quantity,
          exitType: "stopLoss",

        });
        position = null;
        trailingActive = false;
        feeEntry = 0;
        feeExit = 0;
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
      if (hight >= slPrice) {
        const profit = quantity * (entryPrice - slPrice)
        feeExit = (slPrice * quantity) * feeRate;
        const balanceBeforeTrade = balance;
        const netProfit = profit - (feeEntry + feeExit);
        balance += netProfit;
        trades.push({
          type: 'short',
          entryTime,
          exitTime: formatDE(candle.openTime),
          entryPrice,
          exitPrice: slPrice,
          result: netProfit === 0 ? "null" : netProfit > 0 ? "win" : "loss",
          profitPct: (netProfit / balanceBeforeTrade) * 100,
          balance,
          fee: feeEntry + feeExit,
          leverage,
          marketState,
          quantity,
          exitType: "stopLoss",

        });
        position = null;
        trailingActive = false;
        feeEntry = 0;
        feeExit = 0;
      } else if (
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
      if (emaShort > emaLong && prevEmaShort < prevEmaLong && (volume > avarageVolume * avarageVolumeMultiplier || prevVolume > avarageVolume * avarageVolumeMultiplier)) {
        const lastFiveClothes = candles.slice(i - 5, i).map(c => c.close);
        const minLastFive = Math.min(...lastFiveClothes);
        const priceChangePct = ((price - minLastFive) / minLastFive) * 100;
        

        if (priceChangePct <= atrRange) {
          continue; // ігноруємо сигнал у бічному ринку
        }
        const shouldUseRiskPct = priceChangePct > atrRange2 ? (priceChangePct > atrRange3 ? riskPct3 : riskPct2) : riskPct;
        const { qty, nMargin, notional } = calculateQtyAndNMargin(balance, shouldUseRiskPct, price, price - atr * atrPctforSL, leverage, feeRate, "long");
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
        feeEntry = (entryPrice * quantity) * feeRate;
      } else if (emaShort < emaLong && prevEmaShort > prevEmaLong && (volume > avarageVolume * avarageVolumeMultiplier || prevVolume > avarageVolume * avarageVolumeMultiplier)) {
        const lastFiveClothes = candles.slice(i - 5, i).map(c => c.close);
        const maxLastFive = Math.max(...lastFiveClothes);
        const priceChangePct = ((maxLastFive - price) / maxLastFive) * 100;
        if (priceChangePct <= atrRange) {
          continue; // ігноруємо сигнал у бічному ринку
        }
        const shouldUseRiskPct = priceChangePct > atrRange2 ? (priceChangePct > atrRange3 ? riskPct3 : riskPct2) : riskPct;
        const { qty, nMargin, notional } = calculateQtyAndNMargin(balance, shouldUseRiskPct, price, price + atr * atrPctforSL, leverage, feeRate, "short");
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
        feeEntry = (entryPrice * quantity) * feeRate;
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
      atrRange2,
      atrRange3,
      atrPctforSL,
      riskPct,
      riskPct2,
      riskPct3,
      laverageFromParams,
      trailStartFromParams,
      trailGapFromParams,
      avarageValuesOfVolumePeriod,
      avarageVolumeMultiplier
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