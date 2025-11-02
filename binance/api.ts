export const getCandlesFromBinance = async (symbol: string  = "ETH", interval: string = "1m", limit: number = 100) => {
    try {
        let fixedSymbolString
        if (symbol === 'BTC') {
            fixedSymbolString = 'BTCUSDT'
        } else if (symbol === 'ETH') {
            fixedSymbolString = 'ETHUSDT'
        } else if (symbol === 'SOL') {
            fixedSymbolString = 'SOLUSDT'
        }
        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${fixedSymbolString}&interval=${interval}&limit=${limit}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.log(error);

    }

}