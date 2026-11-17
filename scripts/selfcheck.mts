import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { prisma } from "../src/lib/db";
import { normalizePlatform } from "../src/lib/notify";
import {
  normalizePriceTiersJson,
  parsePriceTiers,
  resolveOrderTotal,
  resolveUnitPrice,
} from "../src/lib/pricing";
import { slugify } from "../src/lib/slug";
import { buildQtyKeyboard, parseRequiredChannels } from "../src/lib/telegram";
import { buildCatalogKeyboard } from "../src/bot/telegram/catalog";

assert.equal(normalizePlatform("telegram"), "telegram");
assert.equal(normalizePlatform(undefined), "discord");
assert.equal(normalizePlatform("discord"), "discord");

assert.deepEqual(buildQtyKeyboard("pid", 6), [
  [
    { text: "1x", callback_data: "qty:pid:1" },
    { text: "2x", callback_data: "qty:pid:2" },
    { text: "3x", callback_data: "qty:pid:3" },
    { text: "5x", callback_data: "qty:pid:5" },
  ],
]);
assert.deepEqual(buildQtyKeyboard("pid", 0), [
  [{ text: "1x", callback_data: "qty:pid:1" }],
]);
assert.equal(
  buildCatalogKeyboard([
    {
      id: "pid",
      name: "Akun",
      price: 15000,
      type: "STOCK_LINE",
      availableStockCount: 3,
      isActive: true,
    } as never,
  ])[0][0].callback_data,
  "prod:pid",
);

const tiers = parsePriceTiers('[{"qty":20,"price":2000},{"qty":10,"price":3000}]');
assert.deepEqual(tiers.map((tier) => tier.qty), [10, 20]);
assert.equal(resolveUnitPrice(5000, tiers, 1), 5000);
assert.equal(resolveUnitPrice(5000, tiers, 9), 5000);
assert.equal(resolveUnitPrice(5000, tiers, 10), 3000);
assert.equal(resolveUnitPrice(5000, tiers, 12), 3000);
assert.equal(resolveUnitPrice(5000, tiers, 20), 2000);
assert.equal(resolveUnitPrice(5000, tiers, 99), 2000);
assert.deepEqual(resolveOrderTotal(5000, tiers, 12), { unitPrice: 3000, subtotal: 36000 });
assert.equal(normalizePriceTiersJson('{"10":50}'), null);
assert.equal(normalizePriceTiersJson(""), null);
assert.equal(
  normalizePriceTiersJson('[{"qty":1,"price":100},{"qty":5,"price":800}]'),
  '[{"qty":5,"price":800}]',
);
assert.equal(slugify("Akun Netflix  Premium!"), "akun-netflix-premium");
assert.equal(slugify("!!!"), "produk");

assert.deepEqual(parseRequiredChannels("@satu\n@sdua, -100123 ,,\n"), [
  "@satu",
  "@sdua",
  "-100123",
]);
assert.deepEqual(parseRequiredChannels(""), []);
assert.deepEqual(parseRequiredChannels(null), []);

// migrasi kolom platform harus ada di DB lama maupun baru
const order = await prisma.order.findMany({ take: 1 });
assert.ok(Array.isArray(order));

const db = new DatabaseSync("./dev.db");
const columns = db.prepare('PRAGMA table_info("Order")').all() as Array<{ name: string }>;
assert.ok(columns.some((column) => column.name === "platform"));
db.close();

console.log("selfcheck ok");
