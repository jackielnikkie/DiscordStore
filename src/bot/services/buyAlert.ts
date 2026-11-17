import type { Client } from "discord.js";

import { sendTextChannelMessage, withDiscordClient } from "../../lib/discord";
import { renderTemplate } from "../../lib/templates";
import { getAllSettings } from "../../lib/settings";
import { sendTelegramAdminAlert } from "../../lib/notify";
import { formatRupiah } from "../../lib/money";

type ReadyClient = Client<true>;

type AlertPayload = {
  platform?: string | null;
  customerId: string;
  customerName: string;
  productName: string;
  quantity: number;
  amount?: number;
};

export async function sendBuyAlert(payload: AlertPayload, client?: ReadyClient) {
  const settings = await getAllSettings();
  const content = renderTemplate(settings.text.buyAlertTemplate, {
    user:
      payload.platform === "telegram"
        ? payload.customerName || payload.customerId
        : `<@${payload.customerId}>`,
    username: payload.customerName || payload.customerId,
    productName: payload.productName,
    quantity: payload.quantity,
    // ponytail: empty string when amount absent, so template "— {{total}}" collapses to just "— ". Upgrade: strip trailing separator if the template ever needs cleaner output.
    total: payload.amount === undefined ? "" : formatRupiah(payload.amount),
  });

  const results: boolean[] = [];

  if (settings.bot.enableBuyAlert && settings.bot.buyAlertChannelId) {
    const run = async (activeClient: ReadyClient) => {
      await sendTextChannelMessage(activeClient, settings.bot.buyAlertChannelId, {
        content,
        // Username buyer tidak boleh memicu @everyone/@here.
        allowedMentions: { parse: [] },
      });
    };

    if (client) {
      await run(client).catch(() => null);
      results.push(true);
    } else if (settings.bot.discordBotToken) {
      await withDiscordClient(run, settings.bot.discordBotToken).catch(() => null);
      results.push(true);
    }
  }

  if (settings.telegram.telegramEnabled && settings.telegram.telegramAdminChannelId) {
    const sent = await sendTelegramAdminAlert(content).catch(() => false);
    results.push(sent);
  }

  return results.some(Boolean)
    ? { ok: true }
    : { ok: false, message: "Buy alert tidak aktif." };
}
