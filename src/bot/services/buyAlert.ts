import type { Client } from "discord.js";

import { sendTextChannelMessage, withDiscordClient } from "../../lib/discord";
import { renderTemplate } from "../../lib/templates";
import { getAllSettings } from "../../lib/settings";

type ReadyClient = Client<true>;

type AlertPayload = {
  discordUserId: string;
  discordUsername: string;
  productName: string;
  quantity: number;
};

export async function sendBuyAlert(payload: AlertPayload, client?: ReadyClient) {
  const settings = await getAllSettings();

  if (!settings.bot.enableBuyAlert || !settings.bot.buyAlertChannelId) {
    return { ok: false, message: "Buy alert tidak aktif." };
  }

  const content = renderTemplate(normalizeBuyAlertTemplate(settings.text.buyAlertTemplate), {
    user: `<@${payload.discordUserId}>`,
    username: payload.discordUsername || payload.discordUserId,
    productName: payload.productName,
    quantity: payload.quantity,
  });

  const run = async (activeClient: ReadyClient) => {
    await sendTextChannelMessage(activeClient, settings.bot.buyAlertChannelId, {
      content,
    });

    return { ok: true };
  };

  if (client) {
    return run(client);
  }

  return withDiscordClient(run, settings.bot.discordBotToken);
}

function normalizeBuyAlertTemplate(template: string) {
  return template.replace(/@\{\{\s*username\s*\}\}/g, "{{user}}");
}
