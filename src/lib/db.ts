import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { OrderStatus, ProductType, StockStatus } from "./db-types";

type Row = Record<string, unknown>;

declare global {
  // eslint-disable-next-line no-var
  var sqliteDbGlobal: DatabaseSync | undefined;
}

function resolveDatabasePath() {
  const value = process.env.DATABASE_URL || "file:./dev.db";

  if (value.startsWith("file:./")) {
    return path.resolve(process.cwd(), value.slice("file:./".length));
  }

  if (value.startsWith("file:")) {
    return path.resolve(process.cwd(), value.slice("file:".length));
  }

  return path.resolve(process.cwd(), value);
}

function getDatabase() {
  if (globalThis.sqliteDbGlobal) {
    return globalThis.sqliteDbGlobal;
  }

  const dbPath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(schemaSql);
  globalThis.sqliteDbGlobal = db;
  return db;
}

function nowIso() {
  return new Date().toISOString();
}

function cuid() {
  return crypto.randomBytes(12).toString("hex");
}

function normalizeBoolean(value: unknown) {
  return Boolean(value);
}

function normalizeNullableBoolean(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return Boolean(value);
}

function rowToProduct(row: Row) {
  return {
    ...row,
    isActive: normalizeBoolean(row.isActive),
    price: Number(row.price ?? 0),
    sortOrder: Number(row.sortOrder ?? 0),
    soldCount: Number(row.soldCount ?? 0),
    type: String(row.type || ProductType.STOCK_LINE),
  };
}

function rowToStock(row: Row) {
  return {
    ...row,
    status: String(row.status || StockStatus.AVAILABLE),
  };
}

function rowToOrder(row: Row) {
  return {
    ...row,
    quantity: Number(row.quantity ?? 1),
    unitPrice: Number(row.unitPrice ?? 0),
    subtotal: Number(row.subtotal ?? 0),
    paymentAmount: row.paymentAmount === null ? null : Number(row.paymentAmount ?? 0),
    totalFee: row.totalFee === null ? null : Number(row.totalFee ?? 0),
    amountReceived:
      row.amountReceived === null ? null : Number(row.amountReceived ?? 0),
    isSandbox: normalizeNullableBoolean(row.isSandbox),
    status: String(row.status || OrderStatus.PENDING),
  };
}

function rowToWebhook(row: Row) {
  return {
    ...row,
    isValid: normalizeBoolean(row.isValid),
  };
}

type SQLParam = string | number | Buffer | null;

function all(sql: string, ...params: SQLParam[]) {
  return getDatabase().prepare(sql).all(...params) as Row[];
}

function get(sql: string, ...params: SQLParam[]) {
  return (getDatabase().prepare(sql).get(...params) as Row | undefined) || null;
}

function run(sql: string, ...params: SQLParam[]) {
  return getDatabase().prepare(sql).run(...params);
}

async function transaction<T>(callback: () => T | Promise<T>) {
  const db = getDatabase();
  db.exec("BEGIN IMMEDIATE");

  try {
    const result = await callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function withProductRelations(product: any, include?: Record<string, unknown>) {
  if (!product) {
    return null;
  }

  if (include?.stocks) {
    return {
      ...product,
      stocks: all(
        "SELECT * FROM StockItem WHERE productId = ? ORDER BY createdAt DESC",
        product.id,
      ).map(rowToStock),
    };
  }

  return product;
}

function withOrderRelations(order: any, include?: Record<string, unknown>) {
  if (!order) {
    return null;
  }

  const result: Record<string, unknown> = { ...order };

  if (include?.product) {
    const product = get("SELECT * FROM Product WHERE id = ?", order.productId);
    result.product = product ? rowToProduct(product) : null;
  }

  if (include?.soldStocks) {
    result.soldStocks = all(
      "SELECT * FROM StockItem WHERE soldOrderId = ? ORDER BY createdAt ASC",
      order.id,
    ).map(rowToStock);
  }

  if (include?.reservedStocks) {
    result.reservedStocks = all(
      "SELECT * FROM StockItem WHERE reservedBy = ? ORDER BY createdAt ASC",
      order.id,
    ).map(rowToStock);
  }

  return result;
}

export const prisma: any = {
  $transaction: async (arg: any) => {
    if (typeof arg === "function") {
      return transaction(() => arg(prisma));
    }

    if (Array.isArray(arg)) {
      return transaction(async () => Promise.all(arg));
    }

    return arg;
  },
  setting: {
    findMany: async () => all("SELECT * FROM Setting ORDER BY key ASC"),
    upsert: async ({ where, create, update }: any) => {
      const existing = get("SELECT * FROM Setting WHERE key = ?", where.key);

      if (existing) {
        run(
          "UPDATE Setting SET value = ?, updatedAt = ? WHERE key = ?",
          update.value,
          nowIso(),
          where.key,
        );
      } else {
        const now = nowIso();
        run(
          "INSERT INTO Setting (key, value, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
          create.key,
          create.value,
          now,
          now,
        );
      }

      return get("SELECT * FROM Setting WHERE key = ?", where.key);
    },
  },
  adminSession: {
    findUnique: async ({ where }: any) =>
      get("SELECT * FROM AdminSession WHERE tokenHash = ?", where.tokenHash),
    delete: async ({ where }: any) => {
      const current = get("SELECT * FROM AdminSession WHERE tokenHash = ?", where.tokenHash);
      run("DELETE FROM AdminSession WHERE tokenHash = ?", where.tokenHash);
      return current;
    },
    deleteMany: async ({ where }: any) => {
      if (where?.expiresAt?.lt) {
        run("DELETE FROM AdminSession WHERE expiresAt < ?", toIso(where.expiresAt.lt));
      } else {
        run("DELETE FROM AdminSession");
      }
      return { count: 1 };
    },
    create: async ({ data }: any) => {
      const id = data.id || cuid();
      const now = nowIso();
      run(
        "INSERT INTO AdminSession (id, tokenHash, expiresAt, createdAt) VALUES (?, ?, ?, ?)",
        id,
        data.tokenHash,
        toIso(data.expiresAt),
        now,
      );
      return get("SELECT * FROM AdminSession WHERE id = ?", id);
    },
  },
  product: {
    findMany: async ({ orderBy, include, select }: any = {}) => {
      const sql = buildProductSelect(select) + buildProductOrder(orderBy);
      const rows = all(sql).map(rowToProduct);
      const mapped = rows.map((row) => withProductRelations(row, include));

      if (select) {
        return mapped.map((row) => applySelect(row, select));
      }

      return mapped;
    },
    findUnique: async ({ where, include, select }: any) => {
      const key = Object.keys(where)[0];
      const value = where[key];
      const row = get(`SELECT * FROM Product WHERE ${key} = ?`, value);

      if (!row) {
        return null;
      }

      const mapped = withProductRelations(rowToProduct(row), include);
      return select ? applySelect(mapped, select) : mapped;
    },
    create: async ({ data }: any) => {
      const now = nowIso();
      const id = data.id || cuid();
      run(
        `INSERT INTO Product (
          id, name, slug, description, imageUrl, price, bulkPriceJson, formatLabel,
          type, customText, isActive, sortOrder, soldCount, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        data.name,
        data.slug,
        data.description ?? null,
        data.imageUrl ?? null,
        Number(data.price ?? 0),
        data.bulkPriceJson ?? null,
        data.formatLabel ?? null,
        data.type ?? ProductType.STOCK_LINE,
        data.customText ?? null,
        data.isActive ? 1 : 0,
        Number(data.sortOrder ?? 0),
        Number(data.soldCount ?? 0),
        now,
        now,
      );
      return rowToProduct(get("SELECT * FROM Product WHERE id = ?", id)!);
    },
    update: async ({ where, data }: any) => {
      const current = rowToProduct(get("SELECT * FROM Product WHERE id = ?", where.id)!);
      const next: any = { ...current, updatedAt: nowIso() };

      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === "object" && "increment" in (value as Record<string, unknown>)) {
          next[key] = Number(next[key] ?? 0) + Number((value as any).increment ?? 0);
        } else {
          next[key] = value;
        }
      }

      run(
        `UPDATE Product SET
          name = ?, slug = ?, description = ?, imageUrl = ?, price = ?, bulkPriceJson = ?,
          formatLabel = ?, type = ?, customText = ?, isActive = ?, sortOrder = ?, soldCount = ?, updatedAt = ?
         WHERE id = ?`,
        next.name,
        next.slug,
        next.description ?? null,
        next.imageUrl ?? null,
        Number(next.price ?? 0),
        next.bulkPriceJson ?? null,
        next.formatLabel ?? null,
        next.type,
        next.customText ?? null,
        next.isActive ? 1 : 0,
        Number(next.sortOrder ?? 0),
        Number(next.soldCount ?? 0),
        next.updatedAt,
        where.id,
      );
      return rowToProduct(get("SELECT * FROM Product WHERE id = ?", where.id)!);
    },
    delete: async ({ where }: any) => {
      const current = get("SELECT * FROM Product WHERE id = ?", where.id);
      run("DELETE FROM Product WHERE id = ?", where.id);
      return current ? rowToProduct(current) : null;
    },
  },
  stockItem: {
    count: async ({ where }: any) => {
      const clauses: string[] = [];
      const params: SQLParam[] = [];
      appendWhere(clauses, params, where);
      const row = get(
        `SELECT COUNT(*) as count FROM StockItem${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}`,
        ...params,
      );
      return Number(row?.count ?? 0);
    },
    findMany: async ({ where, orderBy, take, select }: any = {}) => {
      const clauses: string[] = [];
      const params: SQLParam[] = [];
      appendWhere(clauses, params, where);
      const order = orderBy
        ? ` ORDER BY ${Object.keys(orderBy)[0]} ${String(Object.values(orderBy)[0]).toUpperCase()}`
        : "";
      const limit = take ? ` LIMIT ${Number(take)}` : "";
      const rows = all(
        `${buildSelect("StockItem", select)}${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}${order}${limit}`,
        ...params,
      ).map(rowToStock);

      if (select) {
        return rows.map((row) => applySelect(row, select));
      }

      return rows;
    },
    create: async ({ data }: any) => {
      const now = nowIso();
      const id = data.id || cuid();
      run(
        `INSERT INTO StockItem (
          id, productId, content, status, reservedBy, soldOrderId, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        data.productId,
        data.content,
        data.status ?? StockStatus.AVAILABLE,
        data.reservedBy ?? null,
        data.soldOrderId ?? null,
        now,
        now,
      );
      return rowToStock(get("SELECT * FROM StockItem WHERE id = ?", id)!);
    },
    createMany: async ({ data }: any) => {
      transaction(() => {
        for (const item of data) {
          const now = nowIso();
          run(
            `INSERT INTO StockItem (
              id, productId, content, status, reservedBy, soldOrderId, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            item.id || cuid(),
            item.productId,
            item.content,
            item.status ?? StockStatus.AVAILABLE,
            item.reservedBy ?? null,
            item.soldOrderId ?? null,
            now,
            now,
          );
        }
      });
      return { count: data.length };
    },
    update: async ({ where, data }: any) => {
      const current = rowToStock(get("SELECT * FROM StockItem WHERE id = ?", where.id)!);
      const next = { ...current, ...data, updatedAt: nowIso() };
      run(
        `UPDATE StockItem SET
          productId = ?, content = ?, status = ?, reservedBy = ?, soldOrderId = ?, updatedAt = ?
         WHERE id = ?`,
        next.productId,
        next.content,
        next.status,
        next.reservedBy ?? null,
        next.soldOrderId ?? null,
        next.updatedAt,
        where.id,
      );
      return rowToStock(get("SELECT * FROM StockItem WHERE id = ?", where.id)!);
    },
    updateMany: async ({ where, data }: any) => {
      const items = await prisma.stockItem.findMany({ where });
      transaction(() => {
        for (const item of items) {
          prisma.stockItem.update({ where: { id: item.id }, data });
        }
      });
      return { count: items.length };
    },
    delete: async ({ where }: any) => {
      const current = get("SELECT * FROM StockItem WHERE id = ?", where.id);
      run("DELETE FROM StockItem WHERE id = ?", where.id);
      return current ? rowToStock(current) : null;
    },
    groupBy: async ({ by, _count }: any) => {
      const key = by[0];
      return all(
        `SELECT ${key}, COUNT(*) as _count FROM StockItem GROUP BY ${key} ORDER BY ${key} ASC`,
      ).map((row) => ({
        [key]: row[key],
        _count: _count ? Number(row._count ?? 0) : row._count,
      }));
    },
  },
  order: {
    aggregate: async ({ _sum, where }: any) => {
      const field = Object.keys(_sum)[0];
      const clauses: string[] = [];
      const params: SQLParam[] = [];
      appendWhere(clauses, params, where);
      const row = get(
        `SELECT SUM(${field}) as total FROM "Order"${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}`,
        ...params,
      );
      return { _sum: { [field]: row?.total === null ? 0 : Number(row?.total ?? 0) } };
    },
    groupBy: async ({ by, _count }: any) => {
      const key = by[0];
      return all(
        `SELECT ${key}, COUNT(*) as _count FROM "Order" GROUP BY ${key} ORDER BY ${key} ASC`,
      ).map((row) => ({
        [key]: row[key],
        _count: _count ? Number(row._count ?? 0) : row._count,
      }));
    },
    findMany: async ({ where, orderBy, take, include }: any = {}) => {
      const clauses: string[] = [];
      const params: SQLParam[] = [];
      appendWhere(clauses, params, where);
      const order = buildOrderBy(orderBy);
      const limit = take ? ` LIMIT ${Number(take)}` : "";
      const rows = all(
        `SELECT * FROM "Order"${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}${order}${limit}`,
        ...params,
      ).map(rowToOrder);
      return rows.map((row) => withOrderRelations(row, include));
    },
    findUnique: async ({ where, include }: any) => {
      const key = Object.keys(where)[0];
      const value = where[key];
      const row = get(`SELECT * FROM "Order" WHERE ${key} = ?`, value);
      return row ? withOrderRelations(rowToOrder(row), include) : null;
    },
    create: async ({ data }: any) => {
      const now = nowIso();
      const id = data.id || cuid();
      run(
        `INSERT INTO "Order" (
          id, referenceId, discordUserId, discordUsername, productId, quantity, unitPrice, subtotal,
          paymentAmount, status, paymenkuTrxId, paymenkuPayUrl, paymenkuQrUrl, paymenkuQrString,
          paymenkuRawJson, paymentChannel, totalFee, amountReceived, isSandbox, expiresAt, paidAt,
          deliveredAt, deliveryError, buyAlertSentAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        data.referenceId,
        data.discordUserId,
        data.discordUsername ?? null,
        data.productId,
        Number(data.quantity ?? 1),
        Number(data.unitPrice ?? 0),
        Number(data.subtotal ?? 0),
        data.paymentAmount ?? null,
        data.status ?? OrderStatus.PENDING,
        data.paymenkuTrxId ?? null,
        data.paymenkuPayUrl ?? null,
        data.paymenkuQrUrl ?? null,
        data.paymenkuQrString ?? null,
        data.paymenkuRawJson ?? null,
        data.paymentChannel ?? "qris",
        data.totalFee ?? null,
        data.amountReceived ?? null,
        data.isSandbox === undefined ? null : data.isSandbox ? 1 : 0,
        data.expiresAt ? toIso(data.expiresAt) : null,
        data.paidAt ? toIso(data.paidAt) : null,
        data.deliveredAt ? toIso(data.deliveredAt) : null,
        data.deliveryError ?? null,
        data.buyAlertSentAt ? toIso(data.buyAlertSentAt) : null,
        now,
        now,
      );
      return rowToOrder(get('SELECT * FROM "Order" WHERE id = ?', id)!);
    },
    update: async ({ where, data, include }: any) => {
      const current = rowToOrder(get('SELECT * FROM "Order" WHERE id = ?', where.id)!);
      const next = mergeOrderUpdate(current, data);
      run(
        `UPDATE "Order" SET
          referenceId = ?, discordUserId = ?, discordUsername = ?, productId = ?, quantity = ?, unitPrice = ?, subtotal = ?,
          paymentAmount = ?, status = ?, paymenkuTrxId = ?, paymenkuPayUrl = ?, paymenkuQrUrl = ?, paymenkuQrString = ?,
          paymenkuRawJson = ?, paymentChannel = ?, totalFee = ?, amountReceived = ?, isSandbox = ?, expiresAt = ?, paidAt = ?,
          deliveredAt = ?, deliveryError = ?, buyAlertSentAt = ?, updatedAt = ?
         WHERE id = ?`,
        next.referenceId,
        next.discordUserId,
        next.discordUsername ?? null,
        next.productId,
        next.quantity,
        next.unitPrice,
        next.subtotal,
        next.paymentAmount,
        next.status,
        next.paymenkuTrxId ?? null,
        next.paymenkuPayUrl ?? null,
        next.paymenkuQrUrl ?? null,
        next.paymenkuQrString ?? null,
        next.paymenkuRawJson ?? null,
        next.paymentChannel ?? null,
        next.totalFee,
        next.amountReceived,
        next.isSandbox === null ? null : next.isSandbox ? 1 : 0,
        next.expiresAt,
        next.paidAt,
        next.deliveredAt,
        next.deliveryError ?? null,
        next.buyAlertSentAt,
        next.updatedAt,
        where.id,
      );
      return withOrderRelations(rowToOrder(get('SELECT * FROM "Order" WHERE id = ?', where.id)!), include);
    },
  },
  paymentWebhookLog: {
    create: async ({ data }: any) => {
      const now = nowIso();
      const id = data.id || cuid();
      run(
        `INSERT INTO PaymentWebhookLog (
          id, provider, event, trxId, referenceId, status, headersJson, bodyJson,
          isValid, processedAt, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        data.provider ?? "paymenku",
        data.event ?? null,
        data.trxId ?? null,
        data.referenceId ?? null,
        data.status ?? null,
        data.headersJson ?? null,
        data.bodyJson,
        data.isValid ? 1 : 0,
        data.processedAt ? toIso(data.processedAt) : null,
        now,
      );
      return rowToWebhook(get("SELECT * FROM PaymentWebhookLog WHERE id = ?", id)!);
    },
    update: async ({ where, data }: any) => {
      const current = rowToWebhook(get("SELECT * FROM PaymentWebhookLog WHERE id = ?", where.id)!);
      const next = { ...current, ...data };
      run(
        `UPDATE PaymentWebhookLog SET
          provider = ?, event = ?, trxId = ?, referenceId = ?, status = ?, headersJson = ?,
          bodyJson = ?, isValid = ?, processedAt = ?
         WHERE id = ?`,
        next.provider ?? "paymenku",
        next.event ?? null,
        next.trxId ?? null,
        next.referenceId ?? null,
        next.status ?? null,
        next.headersJson ?? null,
        next.bodyJson,
        next.isValid ? 1 : 0,
        next.processedAt ? toIso(next.processedAt) : null,
        where.id,
      );
      return rowToWebhook(get("SELECT * FROM PaymentWebhookLog WHERE id = ?", where.id)!);
    },
  },
};

function mergeOrderUpdate(current: any, data: any) {
  const next = { ...current, updatedAt: nowIso() };

  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in (value as Record<string, unknown>)) {
      next[key] = Number(next[key] ?? 0) + Number((value as any).increment ?? 0);
    } else if (value instanceof Date) {
      next[key] = value.toISOString();
    } else {
      next[key] = value;
    }
  }

  return next;
}

function applySelect(row: any, select: Record<string, unknown>) {
  const output: Record<string, unknown> = {};

  for (const key of Object.keys(select)) {
    if (select[key]) {
      output[key] = row[key];
    }
  }

  return output;
}

function buildProductSelect(select?: Record<string, unknown>) {
  return buildSelect("Product", select);
}

function buildSelect(table: string, select?: Record<string, unknown>) {
  if (!select) {
    return `SELECT * FROM ${table}`;
  }

  const keys = Object.keys(select).filter((key) => typeof select[key] !== "object");
  return `SELECT ${keys.length ? keys.join(", ") : "*"} FROM ${table}`;
}

function buildProductOrder(orderBy?: Array<Record<string, string>>) {
  if (!orderBy || !Array.isArray(orderBy) || orderBy.length === 0) {
    return "";
  }

  return ` ORDER BY ${orderBy
    .map((entry) => `${Object.keys(entry)[0]} ${String(Object.values(entry)[0]).toUpperCase()}`)
    .join(", ")}`;
}

function buildOrderBy(orderBy?: Record<string, string> | Array<Record<string, string>>) {
  if (!orderBy) {
    return "";
  }

  if (Array.isArray(orderBy)) {
    return ` ORDER BY ${orderBy
      .map((entry) => `${Object.keys(entry)[0]} ${String(Object.values(entry)[0]).toUpperCase()}`)
      .join(", ")}`;
  }

  return ` ORDER BY ${Object.keys(orderBy)[0]} ${String(Object.values(orderBy)[0]).toUpperCase()}`;
}

function appendWhere(clauses: string[], params: SQLParam[], where?: Record<string, any>) {
  if (!where) {
    return;
  }

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) {
      continue;
    }

    if (value && typeof value === "object" && "gte" in value) {
      clauses.push(`${key} >= ?`);
      params.push(toIso((value as any).gte));
      continue;
    }

    if (value && typeof value === "object" && "lte" in value) {
      clauses.push(`${key} <= ?`);
      params.push(toIso((value as any).lte));
      continue;
    }

    if (value && typeof value === "object" && "lt" in value) {
      clauses.push(`${key} < ?`);
      params.push(toIso((value as any).lt));
      continue;
    }

    if (value && typeof value === "object" && "not" in value) {
      clauses.push(`${key} IS NOT NULL`);
      continue;
    }

    clauses.push(`${key} = ?`);
    params.push(value instanceof Date ? value.toISOString() : String(value));
  }
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS Setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS Product (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  imageUrl TEXT,
  price INTEGER NOT NULL,
  bulkPriceJson TEXT,
  formatLabel TEXT,
  type TEXT NOT NULL DEFAULT '${ProductType.STOCK_LINE}',
  customText TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  soldCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "Order" (
  id TEXT PRIMARY KEY,
  referenceId TEXT NOT NULL UNIQUE,
  discordUserId TEXT NOT NULL,
  discordUsername TEXT,
  productId TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unitPrice INTEGER NOT NULL,
  subtotal INTEGER NOT NULL,
  paymentAmount INTEGER,
  status TEXT NOT NULL DEFAULT '${OrderStatus.PENDING}',
  paymenkuTrxId TEXT,
  paymenkuPayUrl TEXT,
  paymenkuQrUrl TEXT,
  paymenkuQrString TEXT,
  paymenkuRawJson TEXT,
  paymentChannel TEXT DEFAULT 'qris',
  totalFee INTEGER,
  amountReceived INTEGER,
  isSandbox INTEGER,
  expiresAt TEXT,
  paidAt TEXT,
  deliveredAt TEXT,
  deliveryError TEXT,
  buyAlertSentAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS StockItem (
  id TEXT PRIMARY KEY,
  productId TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '${StockStatus.AVAILABLE}',
  reservedBy TEXT,
  soldOrderId TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE,
  FOREIGN KEY (reservedBy) REFERENCES "Order"(id) ON DELETE SET NULL,
  FOREIGN KEY (soldOrderId) REFERENCES "Order"(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS PaymentWebhookLog (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'paymenku',
  event TEXT,
  trxId TEXT,
  referenceId TEXT,
  status TEXT,
  headersJson TEXT,
  bodyJson TEXT NOT NULL,
  isValid INTEGER NOT NULL DEFAULT 0,
  processedAt TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS AdminSession (
  id TEXT PRIMARY KEY,
  tokenHash TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_active_sort ON Product(isActive, sortOrder);
CREATE INDEX IF NOT EXISTS idx_order_status_created ON "Order"(status, createdAt);
CREATE INDEX IF NOT EXISTS idx_order_discord_user ON "Order"(discordUserId);
CREATE INDEX IF NOT EXISTS idx_stock_product_status ON StockItem(productId, status);
CREATE INDEX IF NOT EXISTS idx_stock_reserved_by ON StockItem(reservedBy);
CREATE INDEX IF NOT EXISTS idx_stock_sold_order ON StockItem(soldOrderId);
CREATE INDEX IF NOT EXISTS idx_admin_session_expires ON AdminSession(expiresAt);
`;
