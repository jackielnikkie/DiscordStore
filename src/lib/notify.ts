import { sendDirectMessage, withDiscordClient } from "./discord";
import { getTelegramSettings } from "./settings";
import { sendTelegramMessage } from "./telegram";

export type CustomerPlatform = "discord" | "telegram";

export function normalizePlatform(value?: string | null): CustomerPlatform {
  return value === "telegram" ? "telegram" : "discord";
}

// ponytail: satu-satunya titik kirim ke buyer. Tambah platform = tambah cabang di sini.
export async function sendCustomerMessage(
  platform: string | null | undefined,
  customerId: string,
  text: string,
) {
  if (normalizePlatform(platform) === "telegram") {
    await sendTelegramMessage(customerId, text);
    return;
  }

  await withDiscordClient((client) =>
    sendDirectMessage(client, customerId, { content: text }),
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
