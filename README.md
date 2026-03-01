## HyperFarm server

TypeScript/Node.js backend for crypto futures trading and strategy research.  
It connects to Binance for market data and to Hyperliquid for execution, and exposes REST APIs for **live trading** and **backtests** of several strategies.

### Main features

- **Live trading engine**
  - Simple RSI scalping strategy.
  - Adaptive RSI+ADX+ATR strategy with trend/range detection.
  - EMA-based conservative V2 strategy with trailing stops and BE-logic.
  - Uses Hyperliquid (`@nktkas/hyperliquid`) for order execution and leverage management.

- **Backtesting toolkit**
  - RSI+ADX strategy with parameter grid search.
  - Adaptive RSI+ADX+ATR backtests.
  - Conservative EMA strategies (V1/V2) and trend-following strategy.
  - Works on pre-saved candle JSON files generated from Binance data.

- **Risk management**
  - ATR-based stop placement and dynamic position sizing.
  - Trailing stop and break-even logic for conservative EMA strategy.
  - Normalized price/quantity according to tick size and step size.

- **Security**
  - Protected trading endpoints via `x-password` header.
  - Uses `PRIVATE_KEY` and `USER_ADDRESS` only from environment variables.

---

## Tech stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express 5
- **Data / math**: `technicalindicators`
- **Exchanges**
  - **Binance** futures klines via REST and WebSocket.
  - **Hyperliquid** via `@nktkas/hyperliquid` (`ExchangeClient`, `InfoClient`).
- **Dev tools**: `tsx`, `ts-node`, `nodemon`

---

## Project structure

- **`src/index.ts`**: Express app entry point, mounts routers and starts HTTP server.
- **`routers/`**
  - `tradeRouter.ts` – routes under `/trade` for live trading control.
  - `backTestRouter.ts` – routes under `/backTest` for all backtests.
- **`controllers/`**
  - `tradeController.ts` – live trading lifecycle, subscriptions to Binance candles, Hyperliquid clearinghouse WS, current params and user state.
  - `backTestController.ts` – all backtesting endpoints (RSI+ADX, adaptive, conservative, trend-following, parameter grids).
  - `backTestMultiController.ts` – multi-run/grid backtests for conservative V2.
- **`strategy/`**
  - `rsi.ts` – on-line RSI scalping strategy.
  - `rsiAdxAdaptive.ts` – adaptive RSI+ADX+ATR live strategy.
  - `emaConservative.ts` – EMA-based conservative V2 live strategy with trailing/BE.
- **`backtestServices/`**
  - `getCandles.ts` – Binance historical candles downloader and saver.
  - `rsiAdx.ts`, `rsiAdxAdaptiveStrateg.ts` – backtest implementations.
  - `conservative.ts`, `conservativeV2.ts` – EMA-based backtests.
  - `trendFollowingStrategy/` – trend-following backtest and sample data.
- **`binance/`**
  - `api.ts` – REST fetch of klines from Binance.
  - `candlesWS.ts` – WebSocket subscription for kline streams.
- **`sdk/`**
  - `info.ts` – Hyperliquid info client (clearinghouse state, open orders, mids).
  - `trade.ts` – order placement, TP/SL triggers, leverage updates, position closing helpers.
- **`middleware/`**
  - `checkPassword.ts` – middleware that checks `x-password` header against `API_PASSWORD`.
- **`types/`**
  - `paramsTypes.ts`, `coinsTypes.ts` – shared TS types for strategies.
- **`utils/`**
  - `correctSize.ts` – price and quantity normalization helpers.
- **`resultsOfBackTest/`**
  - JSON results for different strategies and parameter sets, useful for analysis.

---

## Getting started

### Requirements

- Node.js (LTS recommended, e.g. 18+)
- npm (comes with Node)

### Install dependencies

```bash
npm install
```

### Environment variables

Create a `.env` file in the project root (`server/`) and set at least:

```bash
PORT=3000                # HTTP port for Express (optional, default 3000)
API_PASSWORD=supersecret # Password for protected trading endpoints

# Hyperliquid credentials
PRIVATE_KEY=0x...        # Wallet private key used by ExchangeClient
USER_ADDRESS=0x...       # Address used for clearinghouse state and WS
```

Do **not** commit real `PRIVATE_KEY` / `USER_ADDRESS` / `API_PASSWORD` to git.

---

## Run the server

- **Development** (watch with `tsx`):

```bash
npm run dev
```

- **Production** (single run):

```bash
npm start
```

By default the server listens on `http://localhost:3000` (or `PORT` from `.env`).

---

## HTTP API

Base URL:

- **`http://localhost:<PORT>`**

### Auth for trading endpoints

All state-changing trading routes use the `checkPassword` middleware.

- **Header**: `x-password: <API_PASSWORD>`

If the header is missing or invalid you get `400`/`401` responses.

---

## Trading API (`/trade`)

Mounted in `src/index.ts` as:

- `app.use('/trade', tradeRouter)`

### Start / stop basic RSI strategy

- **POST** `/trade/start`
  - Starts live trading with the simple RSI strategy (`strategy/rsi.ts`) for the default `params` (initially SOL/USDC on 1m).
  - Protected by `x-password`.

- **POST** `/trade/stop`
  - Stops the RSI strategy for the configured coin.
  - Protected by `x-password`.

### Adaptive RSI+ADX+ATR strategy

- **POST** `/trade/startAdaptive`
  - Starts the adaptive strategy based on `rsiAdxAdaptiveFunction` from `strategy/rsiAdxAdaptive.ts`.
  - Uses preconfigured `paramsForAdaptive` (coin, timeframe, indicator params).
  - Protected by `x-password`.

- **POST** `/trade/stopAdaptive`
  - Stops the adaptive trading stream.
  - Protected by `x-password`.

### Conservative EMA V2 strategy

- **POST** `/trade/startConservativeV2`
  - Starts conservative V2 EMA-based strategy (`emaConservativeFunction`) with trailing and BE logic.
  - Uses `paramsForConservativeV2` defaults (SOL, 3m, leverage, ATR-based SL, etc.).
  - Protected by `x-password`.

- **POST** `/trade/stopConservativeV2`
  - Stops the conservative V2 strategy stream.
  - Protected by `x-password`.

### Strategy parameters and status

- **GET** `/trade/getParams`
  - Returns current RSI scalper params (`IParams` from `types/paramsTypes.ts`).

- **PUT** `/trade/changeParams`
  - Body: JSON matching `IParams`.
  - Updates live RSI scalper configuration.
  - Protected by `x-password`.

- **GET** `/trade/status`
  - Returns `{ isTrading, params }` to show if RSI loop is running.

- **GET** `/trade/userInfo`
  - Returns current `balance` and `position` as tracked from Hyperliquid clearinghouse WS.

- **GET** `/trade/checkPass`
  - Quick check for password correctness, returns `{ message: true }` when header is valid.

---

## Backtest API (`/backTest`)

Mounted in `src/index.ts` as:

- `app.use('/backTest', backTestRouter)`

Backtests work on JSON candle files saved to disk. Use the loader endpoint first to fetch and store candles from Binance, then run strategies on those files.

### Load candles from Binance

- **GET** `/backTest/loadCandles/:symbol`
  - Query:
    - `interval` – Binance kline interval (default `"1h"`).
  - Behaviour:
    - Downloads candles for the **last year** and **last month** via Binance API.
    - Uses `fetchCandlesRange` / `saveCandlesToFile` from `backtestServices/getCandles.ts`.
    - Saves JSON files like `<SYMBOL>_<INTERVAL>_lastYear.json` and `<SYMBOL>_<INTERVAL>_lastMonth.json` under the backtest data directory.

Example:

```bash
curl "http://localhost:3000/backTest/loadCandles/SOL?interval=3m"
```

### RSI+ADX backtest

- **GET** `/backTest/runRSIADX/:symbol`
  - Query (all optional, defaults are in `backTestController.ts`):
    - `interval` – e.g. `3m`.
    - `period` – `lastYear` or `lastMonth` (matches saved files).
    - `rsiPeriod`, `adxPeriod`.
    - `rsiBuy`, `rsiSell`, `adxThreshold`.
    - `sl`, `tp`, `balance`.
  - Reads candles from `backtestServices/data/<SYMBOL>/<SYMBOL>_<INTERVAL>_<PERIOD>.json` and runs `rsiAdxStrategy`.

### RSI+ADX parameter optimization

- **GET** `/backTest/runRSIADXOpt/:symbol`
  - Query:
    - `interval` (default `3m`), `period` (default `lastMonth`).
  - Internally iterates over a parameter grid (RSI/ADX periods, thresholds, SL/TP).
  - Returns:
    - `tested` – number of combinations.
    - `durationSec` – execution time.
    - `best` – top 10 parameter sets by `profitPct`.
    - `all` – full list of results.

### Adaptive RSI+ADX+ATR backtest

- **GET** `/backTest/runRsiAdxAdaptive/:symbol`
  - Query parameters mirror `IParamsForAdaptive`:
    - `rsiPeriod`, `adxPeriod`, `emaPeriod`, `atrPeriod`.
    - `adxTrendThreshold`, `adxRangeThreshold`.
    - `atrSlMultTrend`, `atrTpMultTrend`, `atrSlMultRange`, `atrTpMultRange`.
    - `rsiPercentileLookback`, `rsiLowPercentile`, `rsiHighPercentile`.
    - `balanceStart`.
  - Runs `rsiAdxAdaptiveStrategy` on historical candles.

### Conservative EMA strategies

- **GET** `/backTest/runConservative/:symbol`
  - Query:
    - `interval` (e.g. `3m`), `period` (e.g. `lastYear`).
    - `emaShortPeriod`, `emaLongPeriod`, `atrPeriod`, `balanceStart`.
  - Uses `conservativeStrategyBacktesting` for classic EMA cross with ATR.

- **GET** `/backTest/runConservativeV2/:symbol`
  - Query (subset, see controller for defaults):
    - `emaShortPeriod`, `emaLongPeriod`, `atrPeriod`.
    - `atrRange`, `atrRange2`, `atrRange3`.
    - `atrPctforSL`, `riskPct`, `riskPct2`, `riskPct3`.
    - `feeRate`, `avarageValuesOfVolumePeriod`, `avarageVolumeMultiplier`.
    - `balanceStart`, `laverageFromParams`.
  - Uses `conservativeV2StrategyBacktesting` with more advanced sizing, ATR buckets and fee model.

### Trend-following strategy backtest

- **GET** `/backTest/runTrendFollowing/:symbol`
  - Query:
    - `interval`, `period`.
    - `emaShortPeriod`, `emaLongPeriod`, `emaMostLongPeriod`.
    - `atrPeriod`, `atrRange`, `atrPctforSL`, `riskPct`, `feeRate`.
    - `trailStartFromParams`, `trailGapFromParams`, `laverageFromParams`.
  - Uses `trendFollowingStrategyBacktesting` on historical JSON candles.

### Multi-run conservative V2 grid

- **GET** `/backTest/multipleConservative/:symbol`
  - Delegates to `runConservativeV2VolumeMultiplierGridController`.
  - Runs conservative V2 backtests across a grid of volume/multiplier parameters and stores results to `resultsOfBackTest/`.

---

## Notes and tips

- **Symbols**: most logic is tuned for `SOL`, `ETH`, `BTC` with dedicated tick/qty sizes.
- **Data flow**:
  - Live trading uses Binance WS (`binance/candlesWS.ts`) for candles and Hyperliquid for execution.
  - Backtests use JSON files created by the loader endpoint or from `backtestServices/trendFollowingStrategy/candlesForTheStrategy/`.
- **Extending strategies**:
  - Add new strategy modules under `strategy/` or `backtestServices/`.
  - Expose them via new controller functions and mount in the corresponding router.

