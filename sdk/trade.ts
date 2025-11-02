
import { HttpTransport, ExchangeClient } from "@nktkas/hyperliquid";
import crypto from "crypto";
import dotenv from 'dotenv';
import { getInfo, getMidPrice, getOpenOrders } from "./info";
dotenv.config();

const trade = new ExchangeClient({
    transport: new HttpTransport(),
    wallet: process.env.PRIVATE_KEY || "",
});

// 🔹 Ліміт ордер
export async function placeLimitOrder(assetIndex: number = 1, price: number, size: string, isBuy: boolean,) {


    const res = await trade.order({
        orders: [
            {
                a: assetIndex,                    // індекс активу (ETH-PERP)
                b: isBuy,                         // LONG = true, SHORT = false
                p: price,                         // ціна
                s: size,                          // кількість у ETH
                r: false,                         // reduce-only
                t: {
                    limit: { tif: "Gtc" }
                },
                c: "0x" + crypto.randomBytes(16).toString("hex") // унікальний client-id
            },
        ],
        grouping: "na",
    });

    console.log("✅ Ліміт ордер на ETH-PERP створено:", res);
}



export async function placeStopOrTakeOrder(assetIndex: number = 1, price: number, size: string, isBuy: boolean, tpsl: 'tp' | 'sl') {
    const res = await trade.order({
        orders: [
            {
                a: assetIndex,                    // індекс активу (ETH-PERP)
                b: isBuy,                         // LONG = true, SHORT = false
                p: price,                         // ціна
                s: size,                          // кількість у ETH
                r: false,                         // reduce-only
                t: {
                    trigger: { triggerPx: price, isMarket: false, tpsl }
                },
                c: "0x" + crypto.randomBytes(16).toString("hex") // унікальний client-id
            },
        ],
        grouping: "na",
    });

    console.log("✅ стоп ордер на ETH-PERP створено:", res);
}


export async function cancelAllOrdersByInstrument(numberOfInstrument: number = 1, stringOfInstrument: string = "ETH") {
    try {
        const orders = await getOpenOrders();
        const objForCancel = orders?.filter(el => el.coin === stringOfInstrument).map(el => {

            return {
                a: numberOfInstrument,
                o: el.oid.toString()
            }

        })
        if (typeof objForCancel !== 'undefined' && objForCancel.length > 0) {
            const res = await trade.cancel({ cancels: objForCancel });
            console.log("✅ Всі ордери скасовано:", res);
        }

    } catch (error) {
        console.log(error);

    }

}

export async function closeAllPositions(instrument:string="ETH", instrumentIndex:number=1) {
    try {
        const positions = await getInfo();
        const price = await getMidPrice(instrument);
        const szi = positions?.assetPositions.find(el=>el.position.coin === instrument)?.position.szi;
        console.log(szi);
        const sziWithoutMinus = szi?.replace('-','');
        if (typeof szi !== 'undefined' && sziWithoutMinus && price) {
            const neededSide = Number(szi) > 0 ? false : true;
            trade.order({
                orders:[{
                    a: instrumentIndex,
                    b: neededSide,
                    p: Number(price).toFixed(1),
                    s: sziWithoutMinus,
                    r: true,
                    t: { limit: { tif: "FrontendMarket" } },
                    c: "0x" + crypto.randomBytes(16).toString("hex")
                }]
            })
        }
        
    } catch (err) {
        console.log(err); 
        
    }
}


