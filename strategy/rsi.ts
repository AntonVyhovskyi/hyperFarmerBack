import { RSI } from 'technicalindicators';
import { getCandlesFromBinance } from '../binance/api';
import { cancelAllOrdersByInstrument, changeLavarage, closeAllPositions, placeLimitOrder, placeStopOrTakeOrder } from '../sdk/trade';
import { ICoin } from './../types/coinsTypes';
import { normalizePrice, normalizeQty } from '../utils/correctSize';

const cashe = {
    candles: [] as string[][],
    lavarage: 3,
    tickSize: 1,

}


interface IParamsForFunction {
    coin: ICoin,
    timeframe: string,
    candle: string[],
    sl: number,
    tp: number,
    rsiPeriod: number,
    minRsi: number,
    maxRsi: number,
    lavarage: number,
    position: number,
    exitMinRsi: number,
    exitMaxRsi: number,
    balance: number
}

export const rsiStrategy = async ({ coin = { name: "ETH", index: 1 },
    timeframe = "1m",
    candle,
    sl = 1,
    tp = 1,
    rsiPeriod = 14,
    minRsi = 25,
    maxRsi = 75,
    lavarage = 3,
    position,
    exitMinRsi = 30,
    exitMaxRsi = 70,
    balance = 20
}: IParamsForFunction) => {

    if (cashe.candles.length === 0) {
        cashe.candles = await getCandlesFromBinance(coin.name, timeframe, 100);

    } else {
        cashe.candles.push(candle);
        cashe.candles.shift();
    }

    if (cashe.lavarage !== lavarage) {
        await changeLavarage(coin.index, lavarage);
        cashe.lavarage = lavarage;
    }

    if (coin.name === "BTC") {
        cashe.tickSize = 0.1;
    } else if (coin.name === "ETH") {
        cashe.tickSize = 0.1;
    }

    const closePrices = cashe.candles.map(c => parseFloat(c[4]));
    const rsiValues = RSI.calculate({ values: closePrices, period: rsiPeriod });
    const lastRsi = rsiValues[rsiValues.length - 1];

    const openBuyOrder = async () => {




        const entryPrice: number = normalizePrice(((Number(closePrices[closePrices.length - 1]) + Number(closePrices[closePrices.length - 2])) / 2), cashe.tickSize);
        // const tpPrice = normalizePrice((Number(entryPrice) + entryPrice * (tp / 100)), cashe.tickSize);
        const slPrice = normalizePrice((entryPrice - entryPrice * (sl / 100)), cashe.tickSize);
        console.log({ entryPrice, slPrice, sl, tp });

        const quantity = normalizeQty((((balance * lavarage) / entryPrice) * 0.7), 0.001);
        await cancelAllOrdersByInstrument(coin.index, coin.name);
        await placeLimitOrder(coin.index, entryPrice, quantity, true);
        await placeStopOrTakeOrder(coin.index, slPrice, quantity, false, 'sl');
        // await asterApi.openTakeProfitOrder(symbol, "SELL", quantity, tpPrice);
        // history.push({ time: Date.now(), action: "BUY", price: entryPrice, quantity, rsi: lastRsi });

        console.log(`Buy ${quantity} ${coin.name} at ${entryPrice} with RSI ${lastRsi}`);

    }

    const openSellOrder = async () => {
        const entryPrice: number = normalizePrice(
            (Number(closePrices[closePrices.length - 1]) +
                Number(closePrices[closePrices.length - 2])) /
            2,
            cashe.tickSize
        );

        const slPrice = normalizePrice(
            entryPrice + entryPrice * (sl / 100),
            cashe.tickSize
        );

        const quantity = normalizeQty(
            ((balance * lavarage) / entryPrice) * 0.7,
            0.001
        );

        await cancelAllOrdersByInstrument(coin.index, coin.name);
        await placeLimitOrder(coin.index, entryPrice, quantity, false); // false = SELL
        await placeStopOrTakeOrder(coin.index, slPrice, quantity, true, "sl"); // true = BUY (для SL у SHORT)

        console.log(
            `🔴 Sell ${quantity} ${coin.name} @ ${entryPrice} | SL ${slPrice} | RSI ${lastRsi}`
        );
    };

    if (lastRsi < minRsi && position === 0) {
        await openBuyOrder();

    }
    else if (lastRsi > maxRsi && position === 0) {
        await openSellOrder()

    }
    else if (position > 0 && lastRsi > exitMaxRsi) {
        await closeAllPositions(coin.name, coin.index);
        if (lastRsi < minRsi) {
            await openBuyOrder();

        }
        else if (lastRsi > maxRsi) {
            await openSellOrder()

        }
        else {

            // history.push({ time: Date.now(), action: "HOLD", price: closePrices[closePrices.length - 1], rsi: lastRsi });
            console.log(`No action. RSI: ${lastRsi}`);
        }
    } else if (position < 0 && lastRsi < exitMinRsi) {
        await closeAllPositions(coin.name, coin.index);
        if (lastRsi < minRsi) {
            await openBuyOrder();
        }
        else if (lastRsi > maxRsi) {
            await openSellOrder()
        }
        else {

            // history.push({ time: Date.now(), action: "HOLD", price: closePrices[closePrices.length - 1], rsi: lastRsi });
            console.log(`No action. RSI: ${lastRsi}`);
        }
    }

    else {

        // history.push({ time: Date.now(), action: "HOLD", price: closePrices[closePrices.length - 1], rsi: lastRsi });
        console.log(`No action. RSI: ${lastRsi}`);
    }

}