import { Request, Response } from "express";
import fs from "fs";
import path from "path";

import { conservativeV2StrategyBacktesting, IParamsForConservativeV2 } from "../backtestServices/conservativeV2";

// helper: parse "1.2,1.4,1.6" -> number[]
const parseNumberList = (v: unknown): number[] | null => {
  if (!v || typeof v !== "string") return null;
  const arr = v
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n));
  return arr.length ? arr : null;
};

// helper: range generator
const buildRange = (min: number, max: number, step: number): number[] => {
  const out: number[] = [];
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0) return out;
  // normalize
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  // protect from infinite loops
  const limit = 500;
  let i = 0;

  for (let x = a; x <= b + 1e-9; x += step) {
    out.push(Number(x.toFixed(6)));
    if (++i > limit) break;
  }
  return out;
};

export const runConservativeV2VolumeMultiplierGridController = async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const interval = (req.query.interval as string) || "3m";
    const period = (req.query.period as string) || "lastYear";

    // базові параметри (все крім avarageVolumeMultiplier)
    const baseParams: IParamsForConservativeV2 = {
      emaShortPeriod: parseInt(req.query.emaShortPeriod as string) || 7,
      emaLongPeriod: parseInt(req.query.emaLongPeriod as string) || 25,
      atrPeriod: parseInt(req.query.atrPeriod as string) || 14,
      balanceStart: parseFloat(req.query.balanceStart as string) || 1000,

      atrRange: parseFloat(req.query.atrRange as string) || 0.95,
      atrRange2: parseFloat(req.query.atrRange2 as string) || 1.2,
      atrRange3: parseFloat(req.query.atrRange3 as string) || 1.9,

      atrPctforSL: parseFloat(req.query.atrPctforSL as string) || 2.1,
      riskPct: parseFloat(req.query.riskPct as string) || 1,
      riskPct2: parseFloat(req.query.riskPct2 as string) || 10,
      riskPct3: parseFloat(req.query.riskPct3 as string) || 15,

      feeRate: parseFloat(req.query.feeRate as string) || 0.00045,
      avarageValuesOfVolumePeriod: parseInt(req.query.avarageValuesOfVolumePeriod as string) || 50,
      avarageVolumeMultiplier: 2.2, 


      trailStartFromParams: 1.5,
      trailGapFromParams: 0.5,
      laverageFromParams: parseFloat(req.query.laverageFromParams as string) || 7,
    };

    // як задавати перебор:
    // 1) або list: ?multList=1.2,1.4,1.6,1.8,2,2.2
    // 2) або range: ?multMin=1.2&multMax=2.5&multStep=0.1
    const multList = parseNumberList(req.query.multList);

    const multMin = req.query.multMin ? parseFloat(req.query.multMin as string) : 0.1;
    const multMax = req.query.multMax ? parseFloat(req.query.multMax as string) : 1;
    const multStep = req.query.multStep ? parseFloat(req.query.multStep as string) : 0.1;

    const multiplers =
      multList ??
      buildRange(multMin, multMax, multStep) ??
      [0.4, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5];

    if (!multiplers.length) {
      return res.status(400).json({ error: "No multipliers to test. Provide multList or multMin/multMax/multStep." });
    }

    const file = path.join(__dirname, "../backtestServices/data", symbol, `${symbol}_${interval}_${period}.json`);
    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: `File not found: ${file}` });
    }

    const candles = JSON.parse(fs.readFileSync(file, "utf-8"));

    // прогон
    const grid = multiplers.map((multiplier) => {
      const params: IParamsForConservativeV2 = {
        ...baseParams,
        trailGapFromParams: multiplier,
      };

      const result = conservativeV2StrategyBacktesting(candles, params);

      // ⚠️ тут я навмисно повертаю і params, і result, бо ти можеш міняти shape result
      // але нижче я ще додам "score" якщо є stats
      const stats = (result as any)?.stats;

      // простий score: прибуток з штрафом за DD (якщо такі поля є)
      const netProfit = Number(stats?.netProfit ?? stats?.profit ?? 0);
      const maxDD = Number(stats?.maxDrawdownPct ?? stats?.maxDrawdown ?? 0);
      const trades = Number(stats?.trades ?? stats?.totalTrades ?? 0);

      // штраф за мало трейдів (бо інакше буде “топ” з 3 угод)
      const tradesPenalty = trades > 0 ? Math.min(1, trades / 30) : 0; // 30 трейдів ~ норм
      const score = result.balanceEnd;

      return {
        avarageVolumeMultiplier: multiplier,
        score,
        stats: stats ?? null,
        result,
      };
    });

    // сортування: score DESC
    grid.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const results = grid.map((item) => ({result: {...item.result.summary, balance: item.result.balanceEnd}, params: item.result.params}));
    const best = grid[0] ?? null;


    return res.json({
      symbol,
      interval,
      period,
      baseParams,
      testedMultipliers: multiplers,
      results
      
    });
  } catch (err: any) {
    console.error("❌ Backtest grid error:", err);
    return res.status(500).json({ error: err.message });
  }
};