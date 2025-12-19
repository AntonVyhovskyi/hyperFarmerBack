import fs from "fs";
import { Request, Response } from "express";
import { fetchCandlesRange } from "../backtestServices/getCandles";
import { saveCandlesToFile } from "../backtestServices/getCandles";
import { rsiAdxStrategy } from "../backtestServices/rsiAdx";
import path from 'path';
import { rsiAdxAdaptiveStrategy, type IParamsForAdaptive } from "../backtestServices/rsiAdxAdaptiveStrateg";
import { conservativeStrategyBacktesting, IParamsForConservative } from "../backtestServices/conservative";
import { conservativeV2StrategyBacktesting, IParamsForConservativeV2 } from "../backtestServices/conservativeV2";

export const getCandlesController = async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const interval = (req.query.interval as string) || "1h";
    const now = new Date();

    // === 🕐 останній рік ===
    const endYear = now.getTime();
    const startYear = new Date(now);
    startYear.setFullYear(now.getFullYear() - 1);

    const yearCandles = await fetchCandlesRange(symbol, interval, startYear.getTime(), endYear);
    saveCandlesToFile(symbol, interval, yearCandles, "lastYear");

    // === 🗓️ останній місяць ===
    const endMonth = now.getTime();
    const startMonth = new Date(now);
    startMonth.setMonth(now.getMonth() - 1);

    const monthCandles = await fetchCandlesRange(symbol, interval, startMonth.getTime(), endMonth);
    saveCandlesToFile(symbol, interval, monthCandles, "lastMonth");

    return res.json({
      symbol,
      interval,
      yearCandles: yearCandles.length,
      monthCandles: monthCandles.length,
      status: "ok",
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

export const runRsiAdxController = async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const interval = (req.query.interval as string) || "3m";
    const period = (req.query.period as string) || "lastYear";

    // параметри стратегії
    const rsiPeriod = parseInt(req.query.rsiPeriod as string) || 14;
    const adxPeriod = parseInt(req.query.adxPeriod as string) || 21;
    const rsiBuy = parseFloat(req.query.rsiBuy as string) || 25;
    const rsiSell = parseFloat(req.query.rsiSell as string) || 70;
    const adxThreshold = parseFloat(req.query.adxThreshold as string) || 30;
    const slPercent = parseFloat(req.query.sl as string) || 1.5;
    const tpPercent = parseFloat(req.query.tp as string) || 2;
    const balanceStart = parseFloat(req.query.balance as string) || 1000;

    // шлях до файлу з історичними свічками
    const file = path.join(
      __dirname,
      "../backtestServices/data",
      symbol,
      `${symbol}_${interval}_${period}.json`
    );

    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: `File not found: ${file}` });
    }

    const candles = JSON.parse(fs.readFileSync(file, "utf-8"));


    const result = rsiAdxStrategy(candles, {
      rsiPeriod,
      adxPeriod,
      rsiBuy,
      rsiSell,
      adxThreshold,
      slPercent,
      tpPercent,
      balanceStart,
    });

    return res.json({
      symbol,
      interval,
      params: { rsiPeriod, adxPeriod, rsiBuy, rsiSell, adxThreshold, slPercent, tpPercent },
      result,
    });
  } catch (err: any) {
    console.error("❌ Backtest error:", err);
    return res.status(500).json({ error: err.message });
  }
};


export const runRsiAdxAdaptiveStrateg = async (req: Request, res: Response) => {
  console.log('is reqest');
  
  try {
    const symbol = req.params.symbol.toUpperCase();
    const interval = (req.query.interval as string) || "3m";
    const period = (req.query.period as string) || "lastYear";
    let params: IParamsForAdaptive = {
      rsiPeriod: parseInt(req.query.rsiPeriod as string) || 14,
      adxPeriod: parseInt(req.query.adxPeriod as string) || 14,
      emaPeriod: parseInt(req.query.emaPeriod as string) || 50,
      atrPeriod: parseInt(req.query.atrPeriod as string) || 14,
      adxTrendThreshold: parseFloat(req.query.adxTrendThreshold as string) || 25,
      adxRangeThreshold: parseFloat(req.query.adxRangeThreshold as string) || 20,
      atrSlMultTrend: parseFloat(req.query.atrSlMultTrend as string) || 2.5,
      atrTpMultTrend: parseFloat(req.query.atrTpMultTrend as string) || 4.5,
      atrSlMultRange: parseFloat(req.query.atrSlMultRange as string) || 2.5,
      atrTpMultRange: parseFloat(req.query.atrTpMultRange as string) || 4.5,
      rsiPercentileLookback: parseInt(req.query.rsiPercentileLookback as string) || 480,
      rsiLowPercentile: parseFloat(req.query.rsiLowPercentile as string) || 1,
      rsiHighPercentile: parseFloat(req.query.rsiHighPercentile as string) || 99,
      balanceStart: parseFloat(req.query.balanceStart as string) || 1000,
    };
    const file = path.join(
      __dirname,
      "../backtestServices/data",
      symbol,
      `${symbol}_${interval}_${period}.json`
    );

    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: `File not found: ${file}` });
    }

    const candles = JSON.parse(fs.readFileSync(file, "utf-8"));

    const result = rsiAdxAdaptiveStrategy(candles, params);

    return res.json({
      symbol,
      interval,
      params,
      result,
    });


  } catch (err: any) {
    console.error("❌ Backtest error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export const runRsiAdxOptimizationController = async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const interval = (req.query.interval as string) || "3m";
    const period = (req.query.period as string) || "lastMonth";

    // шлях до файлу зі свічками
    const file = path.join(
      __dirname,
      "../backtestServices/data",
      symbol,
      `${symbol}_${interval}_${period}.json`
    );

    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: `File not found: ${file}` });
    }

    const candles = JSON.parse(fs.readFileSync(file, "utf-8"));

    // 🔧 сітка параметрів для перебору
    const rsiPeriods = [14];
    const adxPeriods = [21];
    const rsiBuys = [20, 25, 30];
    const rsiSells = [70, 75, 80];
    const adxThresholds = [20, 25, 30];
    const slPercents = [1, 1.5, 2];
    const tpPercents = [2, 3, 4];

    const results: any[] = [];

    let totalTests = 0;
    const startTime = Date.now();

    for (const rsiPeriod of rsiPeriods) {
      for (const adxPeriod of adxPeriods) {
        for (const rsiBuy of rsiBuys) {
          for (const rsiSell of rsiSells) {
            for (const adxThreshold of adxThresholds) {
              for (const slPercent of slPercents) {
                for (const tpPercent of tpPercents) {
                  totalTests++;
                  const result = rsiAdxStrategy(candles, {
                    rsiPeriod,
                    adxPeriod,
                    rsiBuy,
                    rsiSell,
                    adxThreshold,
                    slPercent,
                    tpPercent,
                    balanceStart: 1000,
                  });

                  results.push({
                    rsiPeriod,
                    adxPeriod,
                    rsiBuy,
                    rsiSell,
                    adxThreshold,
                    slPercent,
                    tpPercent,
                    profitPct: result.summary.profitPct,
                    winRate: result.summary.winRate,
                    totalTrades: result.summary.total,
                  });
                  console.log('one test');

                }
              }
            }
          }
        }
      }
    }

    // сортуємо по прибутковості
    results.sort((a, b) => b.profitPct - a.profitPct);

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    return res.json({
      symbol,
      interval,
      tested: totalTests,
      durationSec,
      best: results.slice(0, 10),
      all: results,
    });
  } catch (err: any) {
    console.error("❌ Optimization error:", err);
    return res.status(500).json({ error: err.message });
  }
};


export const runConservativeStrategyController = async (req: Request, res: Response) => {
  console.log('is reqest');
  
  try {
    const symbol = req.params.symbol.toUpperCase();
    const interval = (req.query.interval as string) || "3m";
    const period = (req.query.period as string) || "lastYear";
    let params: IParamsForConservative = {
      emaShortPeriod: parseInt(req.query.emaShortPeriod as string) || 7,
      emaLongPeriod: parseInt(req.query.emaLongPeriod as string) || 25,
      atrPeriod: parseInt(req.query.atrPeriod as string) || 14,
      balanceStart: parseFloat(req.query.balanceStart as string) || 1000,
    };
    const file = path.join(
      __dirname,
      "../backtestServices/data",
      symbol,
      `${symbol}_${interval}_${period}.json`
    );

    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: `File not found: ${file}` });
    }

    const candles = JSON.parse(fs.readFileSync(file, "utf-8"));

    const result = conservativeStrategyBacktesting(candles, params);

    return res.json({
      symbol,
      interval,
      params,
      result,
    });


  } catch (err: any) {
    console.error("❌ Backtest error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export const runConservativeV2StrategyController = async (req: Request, res: Response) => {
  console.log('is reqest');
  
  try {
    const symbol = req.params.symbol.toUpperCase();
    const interval = (req.query.interval as string) || "3m";
    const period = (req.query.period as string) || "lastYear";
    let params: IParamsForConservativeV2 = {
      emaShortPeriod: parseInt(req.query.emaShortPeriod as string) || 7,
      emaLongPeriod: parseInt(req.query.emaLongPeriod as string) || 25,
      atrPeriod: parseInt(req.query.atrPeriod as string) || 14,
      balanceStart: parseFloat(req.query.balanceStart as string) || 1000,
      atrRange: parseFloat(req.query.atrRange as string) || 0.5,
      atrPctforSL: parseFloat(req.query.atrPctforSL as string) || 2.5,
      riskPct: parseFloat(req.query.riskPct as string) || 1,
      laverageFromParams: parseFloat(req.query.laverageFromParams as string) || 7,
      trailGapFromParams: 0.5,
      trailStartFromParams: 1,
    };
    const file = path.join(
      __dirname,
      "../backtestServices/data",
      symbol,
      `${symbol}_${interval}_${period}.json`
    );

    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: `File not found: ${file}` });
    }

    const candles = JSON.parse(fs.readFileSync(file, "utf-8"));

    const result = conservativeV2StrategyBacktesting(candles, params);

    return res.json({
      symbol,
      interval,
      params,
      result,
    });


  } catch (err: any) {
    console.error("❌ Backtest error:", err);
    return res.status(500).json({ error: err.message });
  }
}