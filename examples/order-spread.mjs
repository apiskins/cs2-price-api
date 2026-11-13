// For a few items: the cheapest listing anywhere against the best buy order, and the gap between them
// APISKINS_API_KEY=... node examples/order-spread.mjs
import { ApiSkins, highestOrder, lowestOffer } from "cs2-price-api";

const api = new ApiSkins({ apiKey: process.env.APISKINS_API_KEY });

const names = [
    "AK-47 | Redline (Field-Tested)",
    "AWP | Asiimov (Field-Tested)",
    "M4A1-S | Printstream (Minimal Wear)",
    "Glock-18 | Fade (Factory New)",
];

const [offers, orders] = await Promise.all([api.offers.list({ marketHashNames: names }), api.orders.list({ marketHashNames: names })]);
const orders_by_name = new Map(orders.map(item => [item.market_hash_name, item]));

for (const item of offers) {
    const offer = lowestOffer(item);
    const order = highestOrder(orders_by_name.get(item.market_hash_name));

    if (!offer || !order) continue;

    const gap = ((offer.price - order.price) / offer.price) * 100;
    console.log(`${item.market_hash_name}\n  listing $${offer.price.toFixed(2)} on ${offer.provider}, order $${order.price.toFixed(2)} on ${order.provider}, gap ${gap.toFixed(1)}%`);
}

console.log(`\nRequests left this period: ${api.lastUsage?.remaining}`);
