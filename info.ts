import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import dotenv from "dotenv";

dotenv.config();

const transport = new HttpTransport();
export const info = new InfoClient({ transport });
export const user = process.env.USER_ADDRESS || "";

export async function getInfo() {
    try {
         const data = await info.clearinghouseState({ user });
        
         
    return data;
    } catch (error) {
        console.log(error);
        
    } 
   
}

// 🔹 Відкриті ордери
export async function getOpenOrders() {
    try {
        const data = await info.openOrders({ user });

        
        return data;
    } catch (error) {
        console.log(error);

    }

}
export async function getMidPrice(assetIndex: string = 'ETH') {
    try {
        const data = await info.allMids();
        
        return data[assetIndex];
        
   
    } catch (error) {
        console.log(error);
        
    }
}
    

