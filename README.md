# cs2-price-api

The official JavaScript and TypeScript client for the [API Skins](https://apiskins.com) CS2 price API:

- **Offers**: every CS2 item's cheapest listing on 22 marketplaces (Buff163, CSFloat, Skinport, Steam, DMarket, YouPin, Market.CSGO and more)
- **Buy orders**: every item's highest buy order on DMarket, Market.CSGO and Steam

Typed, no dependencies, Node.js 18+, Bun and Deno.

```sh
npm install cs2-price-api
```

## Quick start

Sign in with Steam on [apiskins.com](https://apiskins.com) and copy your key from the [API docs page](https://apiskins.com/api-docs) (the free plan works).

```ts
import { ApiSkins, lowestOffer } from "cs2-price-api";

const api = new ApiSkins({ apiKey: process.env.APISKINS_API_KEY! });

const item = await api.offers.get("AK-47 | Redline (Field-Tested)");
// { market_hash_name: "AK-47 | Redline (Field-Tested)", offers: [{ provider: "buff_163", price: 31.42 }, ...] }

console.log(lowestOffer(item)); // { provider: "buff_163", price: 31.42 }
```

CommonJS works too: `const { ApiSkins } = require("cs2-price-api");`

Prices are in USD. Item names are Steam's `market_hash_name`.

## Offers

```ts
// one item, every marketplace (null when nothing lists it)
await api.offers.get("AWP | Asiimov (Field-Tested)");

// only some marketplaces
await api.offers.get("AWP | Asiimov (Field-Tested)", { providers: ["cs_float", "skinport"] });

// many items: 100 per request, longer lists are split for you
await api.offers.list({ marketHashNames: ["AWP | Asiimov (Field-Tested)", "★ Karambit | Doppler (Factory New)"] });

// every listed item in one answer
await api.offers.list();
```

## Buy orders

```ts
await api.orders.get("AK-47 | Redline (Field-Tested)");
// { market_hash_name: "...", orders: [{ provider: "dmarket", price: 24.51 }, { provider: "steam", price: 26.1 }] }

await api.orders.list({ marketHashNames: [...], providers: ["dmarket", "market_csgo"] });
await api.orders.list(); // every item with a buy order
```

`highestOrder(item)` picks the best one.

## Marketplaces

`OFFER_PROVIDERS` and `ORDER_PROVIDERS` list the ids: `cs_float`, `buff_163`, `youpin`, `dmarket`, `skinport`, `cs_money`, `market_csgo`, `buff_market`, `waxpeer`, `lis_skins`, `skin_baron`, `halo_skins`, `white_market`, `shadow_pay`, `skins`, `skin_swap`, `cs_deals`, `loot_farm`, `cs_trade`, `tradeit`, `steam`, `sih`.

## Plans

The **free plan answers Steam's prices and buy orders**, 100 requests per 30 days. Every other marketplace, and higher limits, need a paid plan ([pricing](https://apiskins.com/pricing)). Asking for a marketplace your plan lacks throws a 403.

Each answer carries what is left of your 30-day limit:

```ts
await api.offers.get("AK-47 | Redline (Field-Tested)");
console.log(api.lastUsage); // { limit: 100, remaining: 99 } on the free plan
```

## Errors and limits

Errors throw `ApiSkinsError` with the API's `status` and message:

```ts
import { ApiSkinsError } from "cs2-price-api";

try {
    await api.offers.list();
} catch (error) {
    if (error instanceof ApiSkinsError && error.status === 403) console.log("Upgrade needed:", error.message);
}
```

A short rate limit (429 with a `Retry-After` up to 60 seconds) and server errors are retried for you, twice by default. The 30-day limit is thrown at once.

```ts
new ApiSkins({
    apiKey: "...",
    maxRetries: 2,           // 0 turns retrying off
    maxRetryWaitSeconds: 60, // longest Retry-After worth waiting for
    timeoutMs: 120_000,
});
```

Keep the key on a server: the API does not answer browsers directly (no CORS), so your key never ends up in a web page.

## Examples

- [examples/cheapest-marketplace.mjs](examples/cheapest-marketplace.mjs): where an item is cheapest right now
- [examples/order-spread.mjs](examples/order-spread.mjs): the cheapest listing against the best buy order

## Links

- [API docs](https://apiskins.com/api-docs)
- [Price API](https://apiskins.com/price-api) and [buy order API](https://apiskins.com/buy-order-api)
- [Skin prices across marketplaces](https://apiskins.com/prices)
- [Python client](https://github.com/apiskins/cs2-price-api-python)

## License

MIT
