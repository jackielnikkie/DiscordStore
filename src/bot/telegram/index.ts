import { getTelegramSettings, saveTelegramSettings } from "../../lib/settings";
import { getTelegramMe, getTelegramUpdates } from "../../lib/telegram";
import { handleTelegramUpdate } from "./handlers";

let started = false;
let lastState = "";
let heartbeatTick = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function markTelegramStatus(state: "online" | "offline", detail = "") {
  const value = detail ? `${state}:${detail}` : state;
  const writeHeartbeat = ++heartbeatTick % 3 === 0 || value !== lastState;

  if (!writeHeartbeat) {
    return;
  }

  lastState = value;
  await saveTelegramSettings({
    telegramReadyState: value,
    ...(writeHeartbeat ? { telegramLastHeartbeatAt: new Date().toISOString() } : {}),
  }).catch(() => null);
}

export async function startTelegramWorker() {
  if (started) {
    return;
  }

  started = true;

  // Supervisor: pollLoop tidak boleh mati diam-diam walau ada error tak terduga.
  void (async () => {
    for (;;) {
      try {
        await pollLoop();
      } catch (error) {
        console.error("[telegram] loop restart", error);
        await sleep(5_000);
      }
    }
  })();
}

async function pollLoop() {
  let offset = 0;
  let consecutiveErrors = 0;

  for (;;) {
    const settings = await getTelegramSettings().catch(() => null);

    if (!settings?.telegramEnabled || !settings.telegramBotToken) {
      await markTelegramStatus("offline", "disabled");
      await sleep(15_000);
      continue;
    }

    try {
      if (!settings.telegramBotUsername) {
        const me = await getTelegramMe(settings.telegramBotToken);
        await saveTelegramSettings({ telegramBotUsername: me.username });
      }

      const updates = await getTelegramUpdates(settings.telegramBotToken, offset);

      for (const update of updates) {
        offset = update.update_id + 1;
        await handleTelegramUpdate(update).catch((error) => {
          console.error("[telegram] handler gagal", error);
        });
      }

      if (consecutiveErrors > 0) {
        console.log(`[telegram] pulih setelah ${consecutiveErrors} error`);
      }

      consecutiveErrors = 0;
      await markTelegramStatus("online");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      consecutiveErrors += 1;

      if (consecutiveErrors <= 3 || consecutiveErrors % 20 === 0) {
        console.error("[telegram] poll gagal", message);
      }

      await markTelegramStatus("offline", "poll_error");

      // 409 = ada instance lain yang long-poll; jeda pendek lalu rebut lagi.
      await sleep(/Conflict/i.test(message) ? 1_500 : 5_000);
    }
  }
}
