import { getTelegramSettings } from "./settings";

const TELEGRAM_API = "https://api.telegram.org/bot";

export type InlineKeyboard = Array<
  Array<{ text: string; callback_data?: string; url?: string }>
>;

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string; username?: string; first_name?: string };
    from?: { id: number; username?: string; first_name?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { id: number; username?: string; first_name?: string };
    message?: { message_id: number; chat: { id: number; type: string } };
  };
};

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

async function call<T>(
  token: string,
  method: string,
  payload: Record<string, unknown>,
  timeoutMs = 20_000,
) {
  const response = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  const json = (await response.json()) as TelegramResponse<T>;

  if (!json.ok) {
    throw new Error(json.description || `Telegram ${method} gagal`);
  }

  return json.result as T;
}

export async function resolveTelegramToken() {
  const settings = await getTelegramSettings();

  if (!settings.telegramBotToken) {
    throw new Error("Telegram bot token belum diatur");
  }

  return settings.telegramBotToken;
}

export async function getTelegramMe(token: string) {
  return call<{ id: number; username: string; first_name: string }>(
    token,
    "getMe",
    {},
  );
}

export async function getTelegramUpdates(
  token: string,
  offset: number,
  timeoutSec = 25,
) {
  return call<TelegramUpdate[]>(
    token,
    "getUpdates",
    { offset, timeout: timeoutSec, allowed_updates: ["message", "callback_query"] },
    (timeoutSec + 10) * 1000,
  );
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  keyboard?: InlineKeyboard,
  token?: string,
) {
  return call<{ message_id: number }>(
    token || (await resolveTelegramToken()),
    "sendMessage",
    {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    },
  );
}

export async function editTelegramMessage(
  chatId: number | string,
  messageId: number | string,
  text: string,
  keyboard?: InlineKeyboard,
  token?: string,
) {
  return call<{ message_id: number }>(
    token || (await resolveTelegramToken()),
    "editMessageText",
    {
      chat_id: chatId,
      message_id: messageId,
      text,
      disable_web_page_preview: true,
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    },
  );
}

export async function sendTelegramPhoto(
  chatId: number | string,
  photoUrl: string,
  caption: string,
  keyboard?: InlineKeyboard,
  token?: string,
) {
  return call<{ message_id: number }>(
    token || (await resolveTelegramToken()),
    "sendPhoto",
    {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    },
  );
}

export async function answerCallbackQuery(
  callbackId: string,
  text?: string,
  token?: string,
) {
  return call<boolean>(
    token || (await resolveTelegramToken()),
    "answerCallbackQuery",
    { callback_query_id: callbackId, ...(text ? { text } : {}) },
  );
}

export function buildQtyKeyboard(productId: string, maxQty: number) {
  const quantities = [1, 2, 3, 5, 10].filter((qty) => qty <= Math.max(1, maxQty));
  const rows: InlineKeyboard = [];

  for (let index = 0; index < quantities.length; index += 5) {
    rows.push(
      quantities.slice(index, index + 5).map((qty) => ({
        text: `${qty}x`,
        callback_data: `qty:${productId}:${qty}`,
      })),
    );
  }

  return rows;
}
