import type { OfferProvider, OrderProvider } from "./providers.js";

export { OFFER_PROVIDERS, ORDER_PROVIDERS } from "./providers.js";
export type { OfferProvider, OrderProvider } from "./providers.js";

/** One marketplace's cheapest listing of an item, in USD. */
export interface Offer {
    provider: OfferProvider;
    price: number;
}

/** One marketplace's highest buy order for an item, in USD. */
export interface Order {
    provider: OrderProvider;
    price: number;
}

/** An item's cheapest offer on every marketplace that lists it. */
export interface ItemOffers {
    market_hash_name: string;
    offers: Offer[];
}

/** An item's highest buy order on every marketplace that has one. */
export interface ItemOrders {
    market_hash_name: string;
    orders: Order[];
}

/** What the subscription allows per 30 days, from the last answer's headers. */
export interface Usage {
    limit: number;
    remaining: number;
}

export interface ApiSkinsOptions {
    /** Your API key, from https://apiskins.com/api-docs once signed in (sent as the X-API-KEY header). */
    apiKey: string;
    /** Defaults to https://api.apiskins.com */
    baseUrl?: string;
    /** How many times a request is tried again after a rate limit or a server error. Default 2. */
    maxRetries?: number;
    /**
     * The longest Retry-After (seconds) worth waiting for. A 429 asking for longer, such as the
     * 30-day limit being reached, is thrown at once. Default 60.
     */
    maxRetryWaitSeconds?: number;
    /** Per request. Default 120 000 (every item at once is a large answer). */
    timeoutMs?: number;
    /** A fetch to use instead of the global one. */
    fetch?: typeof fetch;
}

export interface OffersOptions {
    /** Only these marketplaces. All of them (that your plan has) when left out. */
    providers?: readonly OfferProvider[];
}

export interface OrdersOptions {
    /** Only these marketplaces. All of them (that your plan has) when left out. */
    providers?: readonly OrderProvider[];
}

/** The API answered with an error: 400, 401, 403, 404, 409, 429 or a server error. */
export class ApiSkinsError extends Error {
    readonly status: number;
    /** Seconds the API asked to wait, on a 429. */
    readonly retryAfter: number | null;

    constructor(status: number, message: string, retryAfter: number | null = null) {
        super(message);
        this.name = "ApiSkinsError";
        this.status = status;
        this.retryAfter = retryAfter;
    }
}

/** How many names one request takes; longer lists are split into several requests. */
export const BATCH_SIZE = 100;

const DEFAULT_BASE_URL = "https://api.apiskins.com";
const USER_AGENT = "cs2-price-api/1.0.0";

/**
 * The API Skins client: CS2 skin prices from 22 marketplaces.
 *
 * ```ts
 * const api = new ApiSkins({ apiKey: process.env.APISKINS_API_KEY! });
 * const redline = await api.offers.get("AK-47 | Redline (Field-Tested)");
 * ```
 */
export class ApiSkins {
    /** Usage left this 30-day period, as of the last answer. Null before the first request. */
    lastUsage: Usage | null = null;

    readonly offers: {
        /** One item's cheapest offer on every marketplace. Null when no marketplace lists it. */
        get(marketHashName: string, options?: OffersOptions): Promise<ItemOffers | null>;
        /**
         * Many items' offers. With `marketHashNames`, those items (100 per request, split for you);
         * without, every listed item in one answer.
         */
        list(options?: OffersOptions & { marketHashNames?: readonly string[] }): Promise<ItemOffers[]>;
    };

    readonly orders: {
        /** One item's highest buy order on every marketplace. Null when none has one. */
        get(marketHashName: string, options?: OrdersOptions): Promise<ItemOrders | null>;
        /**
         * Many items' buy orders. With `marketHashNames`, those items (100 per request, split for
         * you); without, every item with a buy order in one answer.
         */
        list(options?: OrdersOptions & { marketHashNames?: readonly string[] }): Promise<ItemOrders[]>;
    };

    readonly #apiKey: string;
    readonly #baseUrl: string;
    readonly #maxRetries: number;
    readonly #maxRetryWaitSeconds: number;
    readonly #timeoutMs: number;
    readonly #fetch: typeof fetch;

    constructor(options: ApiSkinsOptions) {
        if (!options?.apiKey) {
            throw new Error("apiKey is required: sign in at https://apiskins.com and copy it from https://apiskins.com/api-docs");
        }

        this.#apiKey = options.apiKey;
        this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
        this.#maxRetries = options.maxRetries ?? 2;
        this.#maxRetryWaitSeconds = options.maxRetryWaitSeconds ?? 60;
        this.#timeoutMs = options.timeoutMs ?? 120_000;
        this.#fetch = options.fetch ?? globalThis.fetch;

        if (typeof this.#fetch !== "function") {
            throw new Error("No fetch found: use Node.js 18 or newer, or pass options.fetch");
        }

        this.offers = {
            get: (name, opts) => this.#one<ItemOffers>("offers", name, opts?.providers),
            list: (opts) => this.#many<ItemOffers>("offers", opts?.marketHashNames, opts?.providers),
        };

        this.orders = {
            get: (name, opts) => this.#one<ItemOrders>("orders", name, opts?.providers),
            list: (opts) => this.#many<ItemOrders>("orders", opts?.marketHashNames, opts?.providers),
        };
    }

    async #one<T>(route: string, name: string, providers?: readonly string[]): Promise<T | null> {
        if (!name) throw new Error("marketHashName is required");

        const query = new URLSearchParams();
        if (providers?.length) query.set("providers", providers.join(","));

        try {
            return await this.#request<T>(`/v1/${route}/${encodeURIComponent(name)}`, query);
        } catch (error) {
            if (error instanceof ApiSkinsError && error.status === 404) return null;
            throw error;
        }
    }

    async #many<T>(route: string, names?: readonly string[], providers?: readonly string[]): Promise<T[]> {
        const base = new URLSearchParams();
        if (providers?.length) base.set("providers", providers.join(","));

        if (names === undefined) {
            return this.#request<T[]>(`/v1/${route}`, base);
        }

        const unique = [...new Set(names)];
        const results: T[] = [];

        for (let index = 0; index < unique.length; index += BATCH_SIZE) {
            const query = new URLSearchParams(base);
            for (const name of unique.slice(index, index + BATCH_SIZE)) query.append("market_hash_name", name);

            results.push(...(await this.#request<T[]>(`/v1/${route}`, query)));
        }

        return results;
    }

    async #request<T>(path: string, query: URLSearchParams): Promise<T> {
        const search = query.toString();
        const url = `${this.#baseUrl}${path}${search ? `?${search}` : ""}`;

        for (let attempt = 0; ; attempt++) {
            let response: Response;

            try {
                response = await this.#fetch(url, {
                    headers: { "X-API-KEY": this.#apiKey, Accept: "application/json", "User-Agent": USER_AGENT },
                    signal: AbortSignal.timeout(this.#timeoutMs),
                });
            } catch (error) {
                if (attempt < this.#maxRetries) {
                    await sleep(backoffMs(attempt));
                    continue;
                }
                throw error;
            }

            this.#readUsage(response);

            if (response.ok) return (await response.json()) as T;

            const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
            const message = await errorMessage(response);

            if (attempt < this.#maxRetries) {
                if (response.status === 429 && retryAfter !== null && retryAfter <= this.#maxRetryWaitSeconds) {
                    await sleep(retryAfter * 1000);
                    continue;
                }

                if (response.status === 502 || response.status === 503 || response.status === 504) {
                    await sleep(backoffMs(attempt));
                    continue;
                }
            }

            throw new ApiSkinsError(response.status, message, retryAfter);
        }
    }

    #readUsage(response: Response) {
        const limit = Number(response.headers.get("x-usage-limit"));
        const remaining = Number(response.headers.get("x-usage-remaining"));

        if (response.headers.has("x-usage-limit") && Number.isFinite(limit) && Number.isFinite(remaining)) {
            this.lastUsage = { limit, remaining };
        }
    }
}

/** The cheapest offer of an item across the marketplaces in the answer, or null. */
export function lowestOffer(item: ItemOffers | null | undefined): Offer | null {
    let lowest: Offer | null = null;
    for (const offer of item?.offers ?? []) if (!lowest || offer.price < lowest.price) lowest = offer;
    return lowest;
}

/** The highest buy order of an item across the marketplaces in the answer, or null. */
export function highestOrder(item: ItemOrders | null | undefined): Order | null {
    let highest: Order | null = null;
    for (const order of item?.orders ?? []) if (!highest || order.price > highest.price) highest = order;
    return highest;
}

function sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function backoffMs(attempt: number) {
    return Math.min(1000 * 2 ** attempt, 10_000);
}

function parseRetryAfter(value: string | null): number | null {
    if (value === null) return null;
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

async function errorMessage(response: Response) {
    const text = await response.text().catch(() => "");

    try {
        const body = JSON.parse(text) as { error?: unknown };
        if (typeof body.error === "string") return body.error;
    } catch {
        // not JSON
    }

    return text.slice(0, 300) || `HTTP ${response.status}`;
}
