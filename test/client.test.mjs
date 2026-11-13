// Tests against a stand-in fetch, plus live ones when APISKINS_API_KEY is set
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { ApiSkins, ApiSkinsError, highestOrder, lowestOffer } from "../dist/esm/index.js";

const redline = "AK-47 | Redline (Field-Tested)";

function stand_in(answers) {
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url: new URL(url), headers: init.headers });
        const next = answers.shift();
        const answer = typeof next === "function" ? next(new URL(url)) : next;
        return new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200, headers: answer.headers ?? {} });
    };
    return { fetch, calls };
}

test("needs a key", () => {
    assert.throws(() => new ApiSkins({ apiKey: "" }), /apiKey is required/);
});

test("offers.get sends the key, encodes the name and passes providers", async () => {
    const { fetch, calls } = stand_in([{ body: { market_hash_name: redline, offers: [{ provider: "cs_float", price: 33.1 }] }, headers: { "X-Usage-Limit": "1000", "X-Usage-Remaining": "999" } }]);
    const api = new ApiSkins({ apiKey: "k", fetch });
    const item = await api.offers.get(redline, { providers: ["cs_float", "buff_163"] });

    assert.equal(item.offers[0].price, 33.1);
    assert.equal(calls[0].headers["X-API-KEY"], "k");
    assert.equal(calls[0].url.pathname, "/v1/offers/AK-47%20%7C%20Redline%20(Field-Tested)");
    assert.equal(calls[0].url.searchParams.get("providers"), "cs_float,buff_163");
    assert.deepEqual(api.lastUsage, { limit: 1000, remaining: 999 });
});

test("get answers null on 404", async () => {
    const { fetch } = stand_in([{ status: 404, body: { error: "No such item" } }]);
    assert.equal(await new ApiSkins({ apiKey: "k", fetch }).orders.get("Nope"), null);
});

test("list splits more than 100 names and drops repeats", async () => {
    const names = Array.from({ length: 250 }, (_, i) => `Item ${i}`);
    const answer = url => ({ body: url.searchParams.getAll("market_hash_name").map(name => ({ market_hash_name: name, orders: [] })) });
    const { fetch, calls } = stand_in([answer, answer, answer]);
    const items = await new ApiSkins({ apiKey: "k", fetch }).orders.list({ marketHashNames: [...names, "Item 0"] });

    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(call => call.url.searchParams.getAll("market_hash_name").length), [100, 100, 50]);
    assert.equal(items.length, 250);
});

test("list without names asks for every item once", async () => {
    const { fetch, calls } = stand_in([{ body: [] }]);
    await new ApiSkins({ apiKey: "k", fetch }).offers.list();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.search, "");
});

test("waits out a short 429 and tries again", async () => {
    const { fetch, calls } = stand_in([{ status: 429, body: { error: "slow down" }, headers: { "Retry-After": "0" } }, { body: [] }]);
    await new ApiSkins({ apiKey: "k", fetch }).offers.list({ marketHashNames: [redline] });
    assert.equal(calls.length, 2);
});

test("throws a 429 that asks for a long wait (the 30-day limit)", async () => {
    const { fetch, calls } = stand_in([{ status: 429, body: { error: "Limit reached" }, headers: { "Retry-After": "86400" } }]);
    await assert.rejects(new ApiSkins({ apiKey: "k", fetch }).offers.list({ marketHashNames: [redline] }), error => {
        assert.ok(error instanceof ApiSkinsError);
        assert.equal(error.status, 429);
        assert.equal(error.retryAfter, 86400);
        assert.equal(error.message, "Limit reached");
        return true;
    });
    assert.equal(calls.length, 1);
});

test("throws the API's error message", async () => {
    const { fetch } = stand_in([{ status: 403, body: { error: "A paid subscription is needed" } }]);
    await assert.rejects(new ApiSkins({ apiKey: "k", fetch }).offers.get(redline, { providers: ["buff_163"] }), { name: "ApiSkinsError", status: 403, message: "A paid subscription is needed" });
});

test("lowestOffer and highestOrder", () => {
    assert.deepEqual(lowestOffer({ market_hash_name: redline, offers: [{ provider: "steam", price: 40 }, { provider: "buff_163", price: 31 }] }), { provider: "buff_163", price: 31 });
    assert.deepEqual(highestOrder({ market_hash_name: redline, orders: [{ provider: "steam", price: 30 }, { provider: "dmarket", price: 24 }] }), { provider: "steam", price: 30 });
    assert.equal(lowestOffer(null), null);
});

test("CommonJS build loads", () => {
    const { ApiSkins: Cjs } = createRequire(import.meta.url)("../dist/cjs/index.js");
    assert.equal(typeof Cjs, "function");
});

test("live: a wrong key is refused with 401", async () => {
    await assert.rejects(new ApiSkins({ apiKey: "wrong-key" }).offers.get(redline), { status: 401 });
});

test("live: Steam offers and orders", { skip: !process.env.APISKINS_API_KEY && "set APISKINS_API_KEY to run" }, async () => {
    const api = new ApiSkins({ apiKey: process.env.APISKINS_API_KEY });
    const offers = await api.offers.get(redline, { providers: ["steam"] });
    const orders = await api.orders.get(redline, { providers: ["steam"] });

    assert.equal(offers.market_hash_name, redline);
    assert.ok(offers.offers.every(offer => offer.provider === "steam" && offer.price > 0));
    assert.ok(orders.orders.every(order => order.provider === "steam" && order.price > 0));
    assert.ok(api.lastUsage.limit > 0);
});
