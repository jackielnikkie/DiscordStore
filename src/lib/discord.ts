import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  MessageCreateOptions,
  MessageEditOptions,
  Partials,
  type TextBasedChannel,
} from "discord.js";

import { getBotSettings } from "./settings";

type ReadyClient = Client<true>;

export function createDiscordClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });
}

export async function withDiscordClient<T>(
  callback: (client: ReadyClient) => Promise<T>,
  token?: string,
) {
  const settings = token ? null : await getBotSettings();
  const botToken = token || settings?.discordBotToken;

  if (!botToken) {
    throw new Error("Discord bot token belum diatur");
  }

  const client = createDiscordClient();

  try {
    await waitForReady(client, botToken);
    return await callback(client as ReadyClient);
  } finally {
    client.destroy();
  }
}

export async function sendDirectMessage(
  client: Client<true>,
  discordUserId: string,
  payload: MessageCreateOptions | string,
) {
  const user = await client.users.fetch(discordUserId);
  const dm = await user.createDM(true);

  return dm.send(payload);
}

export async function sendTextChannelMessage(
  client: Client<true>,
  channelId: string,
  payload: MessageCreateOptions | string,
) {
  const channel = await resolveTextChannel(client, channelId);
  if ("send" in channel) {
    return channel.send(payload);
  }
  throw new Error("Channel does not support sending messages");
}

export async function sendOrEditTextMessage(
  client: Client<true>,
  channelId: string,
  messageId: string,
  payload: MessageCreateOptions,
) {
  const channel = await resolveTextChannel(client, channelId);

  if (messageId) {
    const existing = await channel.messages.fetch(messageId).catch(() => null);

    if (existing) {
      return existing.edit(payload as MessageEditOptions);
    }
  }

  if ("send" in channel) {
    return channel.send(payload);
  }
  throw new Error("Channel does not support sending messages");
}

export async function testDiscordConnection(
  message = "Tes koneksi bot dari dashboard LapakLoka-MultiBotStore.",
) {
  return withDiscordClient(async (client) => {
    const settings = await getBotSettings();

    if (!settings.autoOrderChannelId) {
      return { ok: true, message: "Bot login berhasil. Channel belum diatur." };
    }

    await sendTextChannelMessage(client, settings.autoOrderChannelId, {
      content: message,
    });

    return { ok: true, message: "Bot login dan kirim pesan berhasil." };
  });
}

async function resolveTextChannel(client: ReadyClient, channelId: string) {
  const channel = await client.channels.fetch(channelId);

  if (!channel?.isTextBased()) {
    throw new Error("Channel tidak ditemukan atau bukan text channel");
  }

  if (channel.type === ChannelType.GuildVoice) {
    throw new Error("Channel voice tidak didukung");
  }

  if (channel.isDMBased() && channel.partial) {
    await channel.fetch();
  }

  return channel as Exclude<TextBasedChannel, { partial: true }>;
}

function waitForReady(client: Client, token: string) {
  return new Promise<ReadyClient>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout saat login bot Discord"));
    }, 15_000);

    client.once(Events.ClientReady, () => {
      clearTimeout(timeout);
      resolve(client as ReadyClient);
    });

    client.login(token).catch((error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
