import dotenv from 'dotenv';
import WebSocket from "ws";
import { WebSocketTransport, SubscriptionClient } from "@nktkas/hyperliquid";
dotenv.config();

const user = process.env.USER_ADDRESS || "";
const transport = new WebSocketTransport({
  reconnect: {
    WebSocket: WebSocket as any, // ← обов’язково вказуємо реалізацію

  }
});

export const subs = new SubscriptionClient({ transport });

// subs.clearinghouseState({user},(data) => {
//     console.log("Clearinghouse State:", data);
// });