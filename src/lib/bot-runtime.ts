import { saveSettings } from "./settings";

export async function markBotStatus(state: "online" | "offline", detail = "") {
  await saveSettings({
    botReadyState: detail ? `${state}:${detail}` : state,
    botLastHeartbeatAt: new Date().toISOString(),
  });
}
