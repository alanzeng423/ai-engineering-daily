import assert from "node:assert/strict";
import test from "node:test";

import { loadWatchlist, validateWatchlist } from "../scripts/source-watchlist.mjs";

test("the production source watchlist is valid and has meaningful channel depth", async () => {
  const watchlist = await loadWatchlist();
  assert.equal(validateWatchlist(watchlist).length, 0);
  assert.ok(watchlist.x.accounts.length >= 40);
  assert.ok(watchlist.chineseMedia.length >= 5);
  assert.ok(watchlist.recallSentinels.length >= 3);
  assert.ok(watchlist.x.accounts.some((account) => account.handle === "Kimi_Moonshot"));
});

test("watchlist validation rejects duplicate handles", async () => {
  const watchlist = structuredClone(await loadWatchlist());
  watchlist.x.accounts.push({ ...watchlist.x.accounts[0] });
  assert.ok(validateWatchlist(watchlist).some((error) => error.includes("重复")));
});
