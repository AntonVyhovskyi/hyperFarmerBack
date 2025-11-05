export function normalizeQty(qty: number, stepSize: number = 0.001) {
    return (Math.floor(qty / stepSize) * stepSize).toFixed(3); // для ETH 3 знаки
}

export function normalizePrice(price: number, tickSize: number = 0.1):number {
    return Number((Math.floor(price / tickSize) * tickSize).toFixed(1)); // для ETH 1 знак}
}