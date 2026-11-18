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
import { maskStockContent, parseStockIds } from "../src/lib/stock-mask";
import {
  buildDeliveryFileContent,
  buildDeliveryFileName,
  escapeHtml,
  formatStockBlock,
  renderDeliveryMessage,
  renderProductNote,
} from "../src/lib/delivery-format";
import {
  buildInstructionLines,
  parsePaymentInstruction,
} from "../src/lib/paymenku-instruction";
import {
  buildQtyKeyboard,
  isChannelAdminStatus,
  parseRequiredChannels,
} from "../src/lib/telegram";
import { buildCatalogKeyboard } from "../src/bot/telegram/catalog";

assert.equal(normalizePlatform("telegram"), "telegram");
assert.equal(normalizePlatform(undefined), "discord");
assert.equal(normalizePlatform("discord"), "discord");

// /setlog: hanya creator/administrator channel yang boleh mengunci channel log.
assert.equal(isChannelAdminStatus("creator"), true);
assert.equal(isChannelAdminStatus("administrator"), true);
assert.equal(isChannelAdminStatus("member"), false);
assert.equal(isChannelAdminStatus("left"), false);
assert.equal(isChannelAdminStatus("kicked"), false);

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

const qrisInfo = parsePaymentInstruction({ qr_url: "u", qr_string: "s" });
assert.equal(qrisInfo.kind, "qris");
const vaInfo = parsePaymentInstruction({ bank: "BCA", va_number: "1234567890" });
assert.equal(vaInfo.kind, "va");
assert.ok(buildInstructionLines(vaInfo).some((line) => line.includes("1234567890")));
const cstoreInfo = parsePaymentInstruction({ store: "Alfamart", payment_code: "999" });
assert.equal(cstoreInfo.kind, "cstore");
assert.ok(buildInstructionLines(cstoreInfo).some((line) => line.includes("999")));
assert.equal(parsePaymentInstruction({ checkout_url: "https://x" }).kind, "ewallet");
assert.equal(parsePaymentInstruction(null).kind, "unknown");

assert.equal(escapeHtml('a<b>&"c"'), 'a&lt;b&gt;&amp;"c"');
assert.equal(
  formatStockBlock("telegram", ["a<b", "x"]),
  "<code>a&lt;b</code>\n<code>x</code>",
);
assert.equal(formatStockBlock("discord", ["a", "b"]), "```\na\nb\n```");
assert.equal(
  renderDeliveryMessage("Data:\n{{stockLines}}", {}, "discord", ["k1"]),
  "Data:\n```\nk1\n```",
);
assert.equal(
  renderDeliveryMessage("Data:\n{{stockLines}}", {}, "telegram", ["k<1>"]),
  "Data:\n<code>k&lt;1&gt;</code>",
);
assert.equal(buildDeliveryFileName("ORDER-20261117-123"), "order-ORDER-20261117-123.txt");

assert.equal(maskStockContent("abcdefgh"), "ab••••gh");assert.equal(maskStockContent("abcd"), "••••");
assert.equal(parseStockIds("a, b\nc,, a").join(","), "a,b,c");
assert.equal(parseStockIds("   ").length, 0);

assert.equal(
  renderProductNote("Base URL: https://api.coralbricks.com/v1\nPakai <key> ini", { productName: "X" }, "telegram"),
  "Base URL: <code>https://api.coralbricks.com/v1</code>\nPakai &lt;key&gt; ini",
);
assert.equal(
  renderProductNote("Produk {{productName}} ref {{referenceId}}", { productName: "Coral", referenceId: "ORDER-1" }, "discord"),
  "Produk Coral ref ORDER-1",
);
assert.equal(renderProductNote("   ", {}, "telegram"), "");
assert.ok(
  buildDeliveryFileContent("ORDER-1", ["akun1"], "Catatan endpoint").includes("Catatan endpoint"),
);

// migrasi kolom platform harus ada di DB lama maupun baru
const order = await prisma.order.findMany({ take: 1 });
assert.ok(Array.isArray(order));

const db = new DatabaseSync("./dev.db");
const columns = db.prepare('PRAGMA table_info("Order")').all() as Array<{ name: string }>;
assert.ok(columns.some((column) => column.name === "platform"));
db.close();

console.log("selfcheck ok");
