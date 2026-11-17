import { Events, type Client as DiscordClient } from "discord.js";

import { registerInteractionHandler } from "./handlers/interactionCreate";
import { syncAutoOrderEmbed } from "./services/embedSync";
import { startTelegramWorker } from "./telegram";
import { createDiscordClient } from "../lib/discord";
import { markBotStatus } from "../lib/bot-runtime";
import { getAllSettings } from "../lib/settings";
import { prisma } from "../lib/db";
import { checkOrderPaymentStatus } from "../services/paymentService";

const client = createDiscordClient();
let booted = false;
let loopsStarted = false;
let botConnected = false;

async function start() {
  const settings = await getAllSettings();

  if (!settings.bot.discordBotToken) {
    botConnected = false;
    await markBotStatus("offline", "token_missing");
    console.warn("[bot] discord token belum diatur, worker idle.");
    setTimeout(start, 15_000);
    return;
  }

  if (!booted) {
    registerInteractionHandler(client);
    client.once(Events.ClientReady, async (readyClient) => {
      botConnected = true;
      console.log(`[bot] ready as ${readyClient.user.tag}`);
      await markBotStatus("online");
      await syncAutoOrderEmbed(readyClient).catch((error) => {
        console.error("[bot] sync embed gagal saat boot:", error);
      });
    });

    client.on(Events.ShardDisconnect, async () => {
      botConnected = false;
      await markBotStatus("offline", "shard_disconnect");
    });

    client.on(Events.ShardReconnecting, async () => {
      botConnected = false;
      await markBotStatus("offline", "reconnecting");
    });

    client.on(Events.ShardResume, async () => {
      botConnected = true;
      await markBotStatus("online");
    });

    client.on(Events.Invalidated, async () => {
      botConnected = false;
      await markBotStatus("offline", "invalidated");
    });

    client.on(Events.Error, async (error) => {
      botConnected = false;
      console.error("[bot] client error", error);
      await markBotStatus("offline", "client_error");
    });
    booted = true;
  }

  try {
    if (!client.isReady()) {
      await client.login(settings.bot.discordBotToken);
    }
  } catch (error) {
    botConnected = false;
    console.error("[bot] login gagal", error);
    await markBotStatus("offline", "login_failed");
    setTimeout(start, 15_000);
    return;
  }

  if (!loopsStarted) {
    loopsStarted = true;

    setInterval(async () => {
      await markBotStatus(botConnected ? "online" : "offline");
    }, 30_000);

    setInterval(async () => {
      if (!botConnected) {
        return;
      }

      const latest = await getAllSettings();

      if (latest.bot.embedSyncRequestedAt) {
        await syncAutoOrderEmbed(client as DiscordClient<true>).catch((error) => {
          console.error("[bot] sync embed interval gagal", error);
        });
      }
    }, 20_000);
  }
}

/** Rekonsiliasi saja (docs Paymenku: webhook sumber status resmi, jangan polling agresif). */
function startOrderPoller() {
  const tick = async () => {
    const pendingOrders = await prisma.order.findMany({
      where: {
        status: "PENDING",
      },
      take: 10,
      orderBy: { createdAt: "asc" },
    });

    for (const order of pendingOrders) {
      try {
        await checkOrderPaymentStatus(order.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[bot] cek status gagal untuk ${order.referenceId}: ${message}`);

        if (/rate limit/i.test(message)) {
          break;
        }
      }
    }
  };

  void tick();
  setInterval(() => void tick(), 180_000);
}

void start();
void startTelegramWorker();
startOrderPoller();
