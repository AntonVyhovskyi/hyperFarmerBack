import { ICoin } from "./coinsTypes";

export interface IParams {
    coin: ICoin,
    interval: "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d",
}