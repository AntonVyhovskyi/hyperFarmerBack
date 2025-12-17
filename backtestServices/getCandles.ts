import axios from "axios";

const BASE_URL = "https://api.binance.com/api/v3/klines";
const MAX_LIMIT = 1000;
import fs from "fs";
import path from "path";

export async function fetchCandlesRange(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number
) {
  let allCandles: any[] = [];
  let currentStart = startTime;

  while (currentStart < endTime) {
    const url = `${BASE_URL}?symbol=${symbol}&interval=${interval}&limit=${MAX_LIMIT}&startTime=${currentStart}&endTime=${endTime}`;
    const { data } = await axios.get(url);

    if (data.length === 0) break;

    const candles = data.map((c: any) => ({
      openTime: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      closeTime: c[6],
    }));

    allCandles = allCandles.concat(candles);

    // Рухаємось далі — наступний запит після останньої свічки
    currentStart = candles[candles.length - 1].closeTime + 1;

    // Маленька пауза щоб не впертись у rate limit
    await new Promise((r) => setTimeout(r, 300));
    console.log(`Fetched ${allCandles.length} candles so far...`);
  }

  return allCandles;
}



export function saveCandlesToFile(
  symbol: string,
  interval: string,
  candles: any[],
  periodLabel: string
) {
  const dir = path.join(__dirname, "data", symbol);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, `${symbol}_${interval}_${periodLabel}.json`);

  fs.writeFileSync(file, JSON.stringify(candles, null, 2));
  console.log(`✅ Saved ${candles.length} candles to ${file}`);
}



// (async () => {
//   const c2023 = await fetchCandlesRange(
//     "SOLUSDT",
//     "3m",
//     Date.UTC(2023, 0, 1, 0, 0, 0),
//     Date.UTC(2023, 11, 31, 23, 59, 59)
//   );

//   saveCandlesToFile("SOLUSDT", "3m", c2023, "2023");

// })();