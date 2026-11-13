/** Every marketplace the offer routes answer for, by its id in the API. */
export const OFFER_PROVIDERS = [
    "cs_float",
    "buff_163",
    "youpin",
    "dmarket",
    "skinport",
    "cs_money",
    "market_csgo",
    "buff_market",
    "waxpeer",
    "lis_skins",
    "skin_baron",
    "halo_skins",
    "white_market",
    "shadow_pay",
    "skins",
    "skin_swap",
    "cs_deals",
    "loot_farm",
    "cs_trade",
    "tradeit",
    "steam",
    "sih",
] as const;

/** Every marketplace the order routes answer for. */
export const ORDER_PROVIDERS = ["dmarket", "market_csgo", "steam"] as const;

export type OfferProvider = (typeof OFFER_PROVIDERS)[number];
export type OrderProvider = (typeof ORDER_PROVIDERS)[number];
