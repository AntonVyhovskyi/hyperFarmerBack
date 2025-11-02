import { getCandlesFromBinance } from '../binance/api';
import { ICoin } from './../types/coinsTypes';

const cashe = {
    candles: [] as number[][],
    lavarage: 1,
    tickSize: 1,

}


interface IParamsForFunction {
    coin: ICoin,
    timeframe: string,
    candle: number[],
    sl: number,
    tp: number,
    rsiPeriod: number,
    minRsi: number,
    maxRsi: number,
    lavarage: number,
    position: number,
    exitMinRsi: number,
    exitMaxRsi: number,
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
    exitMaxRsi = 70 }: IParamsForFunction) => {

    if (cashe.candles.length === 0) {
        cashe.candles = await getCandlesFromBinance(coin.name, timeframe, 100);
        
    } else {
        cashe.candles.push(candle);
        cashe.candles.shift();
    }
  
    

}