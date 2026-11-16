import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { prisma } from "../src/lib/db";
import { normalizePlatform } from "../src/lib/notify";
import { buildQtyKeyboard } from "../src/lib/telegram";
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

// migrasi kolom platform harus ada di DB lama maupun baru
const order = await prisma.order.findMany({ take: 1 });
assert.ok(Array.isArray(order));

const db = new DatabaseSync("./dev.db");
const columns = db.prepare('PRAGMA table_info("Order")').all() as Array<{ name: string }>;
assert.ok(columns.some((column) => column.name === "platform"));
db.close();

console.log("selfcheck ok");
