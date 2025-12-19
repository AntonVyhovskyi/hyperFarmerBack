export function normalizeQty(qty: number, stepSize: number = 0.001) {
    if (stepSize === 0.01) return (Math.floor(qty / stepSize) * stepSize).toFixed(2);
    return (Math.floor(qty / stepSize) * stepSize).toFixed(3); // для ETH 3 знаки
}

export function normalizePrice(price: number, tickSize: number = 0.1, isShort: boolean = false): number {
    if (isShort) {
        if (tickSize === 0.01) return Number((Math.ceil(price / tickSize) * tickSize).toFixed(2));
        return Number((Math.ceil(price / tickSize) * tickSize).toFixed(1)); // для ETH 1 знак}
    }
    if (tickSize === 0.01) return Number((Math.floor(price / tickSize) * tickSize).toFixed(2));
    return Number((Math.floor(price / tickSize) * tickSize).toFixed(1)); // для ETH 1 знак}
}