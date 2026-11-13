// Where is an item cheapest right now?
// APISKINS_API_KEY=... node examples/cheapest-marketplace.mjs "AK-47 | Redline (Field-Tested)"
import { ApiSkins, lowestOffer } from "cs2-price-api";

const api = new ApiSkins({ apiKey: process.env.APISKINS_API_KEY });
const name = process.argv[2] ?? "AK-47 | Redline (Field-Tested)";

const item = await api.offers.get(name);

if (!item) {
    console.log(`No marketplace lists ${name}`);
} else {
    for (const offer of [...item.offers].sort((a, b) => a.price - b.price)) {
        console.log(`${offer.provider.padEnd(14)} $${offer.price.toFixed(2)}`);
    }

    const cheapest = lowestOffer(item);
    console.log(`\nCheapest: ${cheapest.provider} at $${cheapest.price.toFixed(2)}`);
}
