import { AttachmentBuilder } from "discord.js";

import { sendDirectMessage, withDiscordClient } from "./discord";
import { getTelegramSettings } from "./settings";
import { sendTelegramDocument, sendTelegramMessage } from "./telegram";

export type CustomerPlatform = "discord" | "telegram";

export type CustomerMessage = {
  text: string;
  parseMode?: "HTML";
  file?: { name: string; content: string; caption?: string };
};

export function normalizePlatform(value?: string | null): CustomerPlatform {
  return value === "telegram" ? "telegram" : "discord";
}

// ponytail: satu-satunya titik kirim ke buyer. Tambah platform = tambah cabang di sini.
export async function sendCustomerMessage(
  platform: string | null | undefined,
  customerId: string,
  message: string | CustomerMessage,
) {
  const payload = typeof message === "string" ? { text: message } : message;

  if (normalizePlatform(platform) === "telegram") {
    await sendTelegramMessage(
      customerId,
      payload.text,
      undefined,
      undefined,
      payload.parseMode,
    );

    if (payload.file) {
      await sendTelegramDocument(
        customerId,
        payload.file.name,
        payload.file.content,
        payload.file.caption,
      );
    }

    return;
  }

  await withDiscordClient((client) =>
    sendDirectMessage(client, customerId, {
      content: payload.text,
      ...(payload.file
        ? {
            files: [
              new AttachmentBuilder(Buffer.from(payload.file.content, "utf8"), {
                name: payload.file.name,
              }),
            ],
          }
        : {}),
    }),
  );
}

export async function sendTelegramAdminAlert(text: string) {
  const settings = await getTelegramSettings();

  if (!settings.telegramEnabled || !settings.telegramAdminChannelId) {
    return false;
  }

  await sendTelegramMessage(settings.telegramAdminChannelId, text);
  return true;
}
