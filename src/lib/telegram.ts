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
  my_chat_member?: {
    chat: { id: number; type: string; title?: string; username?: string };
    new_chat_member: { status: string };
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${TELEGRAM_API}${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    const json = (await response.json()) as TelegramResponse<T>;

    if (!json.ok) {
      throw new Error(json.description || `Telegram ${method} gagal`);
    }

    return json.result as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Telegram ${method} timeout ${Math.round(timeoutMs / 1000)}s`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
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
    {
      offset,
      timeout: timeoutSec,
      allowed_updates: ["message", "callback_query", "my_chat_member"],
    },
    (timeoutSec + 10) * 1000,
  );
}

export async function getTelegramChatMember(
  chatId: number | string,
  userId: number | string,
  token?: string,
) {
  return call<{ status: string }>(
    token || (await resolveTelegramToken()),
    "getChatMember",
    { chat_id: chatId, user_id: userId },
  );
}

export async function exportTelegramInviteLink(
  chatId: number | string,
  token?: string,
) {
  return call<string>(
    token || (await resolveTelegramToken()),
    "exportChatInviteLink",
    { chat_id: chatId },
  );
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  keyboard?: InlineKeyboard,
  token?: string,
  parseMode?: "HTML",
) {
  return call<{ message_id: number }>(
    token || (await resolveTelegramToken()),
    "sendMessage",
    {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    },
  );
}

export async function sendTelegramDocument(
  chatId: number | string,
  fileName: string,
  content: string,
  caption?: string,
  token?: string,
) {
  const botToken = token || (await resolveTelegramToken());
  const form = new FormData();

  form.append("chat_id", String(chatId));
  form.append("document", new Blob([content], { type: "text/plain" }), fileName);

  if (caption) {
    form.append("caption", caption.slice(0, 1024));
  }

  const response = await fetch(`${TELEGRAM_API}${botToken}/sendDocument`, {
    method: "POST",
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  const json = (await response.json()) as TelegramResponse<{ message_id: number }>;

  if (!json.ok) {
    throw new Error(json.description || "Telegram sendDocument gagal");
  }

  return json.result as { message_id: number };
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
  parseMode?: "HTML",
) {
  return call<{ message_id: number }>(
    token || (await resolveTelegramToken()),
    "sendPhoto",
    {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      ...(parseMode ? { parse_mode: parseMode } : {}),
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

export function parseRequiredChannels(raw?: string | null) {
  return (raw || "")
    .split(/[\s,]+/)
    .map((channel) => channel.trim())
    .filter(Boolean);
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
