import { getTelegramSettings, saveTelegramSettings } from "../../lib/settings";
import { getTelegramMe, getTelegramUpdates } from "../../lib/telegram";
import { handleTelegramUpdate } from "./handlers";

let started = false;
let lastState = "";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function markTelegramStatus(state: "online" | "offline", detail = "") {
  const value = detail ? `${state}:${detail}` : state;

  if (value === lastState) {
    return;
  }

  lastState = value;
  await saveTelegramSettings({
    telegramReadyState: value,
    telegramLastHeartbeatAt: new Date().toISOString(),
  }).catch(() => null);
}

export async function startTelegramWorker() {
  if (started) {
    return;
  }

  started = true;
  void pollLoop();
}

async function pollLoop() {
  let offset = 0;

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

      await markTelegramStatus("online");
    } catch (error) {
      console.error(
        "[telegram] poll gagal",
        error instanceof Error ? error.message : error,
      );
      await markTelegramStatus("offline", "poll_error");
      await sleep(5_000);
    }
  }
}
