import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
} from "discord.js";

import { formatRupiah } from "../../lib/money";
import { parsePriceTiers } from "../../lib/pricing";
import { sendOrEditTextMessage, withDiscordClient } from "../../lib/discord";
import { getAllSettings, saveBotSettings } from "../../lib/settings";
import { listProductsWithStock, type ProductWithStock } from "../../services/productService";

type ReadyClient = Client<true>;

function buildHargaValue(product: ProductWithStock): string {
  const tiers = parsePriceTiers(product.bulkPriceJson);
  const lines = [`- 1 akun: ${formatRupiah(product.price)}`];

  for (const tier of tiers) {
    lines.push(`- ≥${tier.qty} akun: ${formatRupiah(tier.price)}/akun`);
  }

  return lines.join("\n");
}

function buildFormatValue(product: ProductWithStock): string {
  const raw = product.formatLabel || product.customText;
  if (!raw) return "";
  return raw;
}

async function buildStoreEmbeds() {
  const [settings, products] = await Promise.all([
    getAllSettings(),
    listProductsWithStock(),
  ]);

  const footerText = settings.bot.ownerDiscord
    ? `${settings.text.embedFooter} • @${settings.bot.ownerDiscord}`
    : settings.text.embedFooter;

  const overview = new EmbedBuilder()
    .setTitle(settings.text.embedTitle)
    .setDescription(settings.text.embedDescription)
    .setFooter({ text: footerText });

  const productEmbeds = products.slice(0, 9).map((product: ProductWithStock) => {
    const stockLabel =
      product.type === "CUSTOM_TEXT"
        ? "**Custom text**"
        : product.availableStockCount > 0
          ? `Tersedia: **${product.availableStockCount}**`
          : "**Habis**";

    const embed = new EmbedBuilder()
      .setTitle(product.name)
      .setThumbnail(product.imageUrl ? product.imageUrl : null)
      .addFields(
        { name: "Stok", value: stockLabel, inline: true },
        { name: "Terjual", value: String(product.soldCount), inline: true },
        { name: "\u200b", value: "\u200b", inline: false },
        { name: "Harga", value: buildHargaValue(product), inline: false },
      );

    if (product.description) {
      embed.setDescription(product.description);
    }

    const formatValue = buildFormatValue(product);
    if (formatValue) {
      embed.addFields({ name: "Format Akun", value: `\`${formatValue}\``, inline: false });
    }

    return embed;
  });

  return [overview, ...productEmbeds];
}

async function buildProductButtons() {
  const products = (await listProductsWithStock()).filter(
    (product: ProductWithStock) => product.isActive,
  );
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let index = 0; index < products.length && index < 25; index += 5) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        products.slice(index, index + 5).map((product: ProductWithStock) =>
          new ButtonBuilder()
            .setCustomId(`buy:${product.id}`)
            .setLabel(`Buy ${product.name}`.slice(0, 80))
            .setStyle(ButtonStyle.Primary)
            .setDisabled(
              !product.isActive ||
                (product.type === "STOCK_LINE" && product.availableStockCount <= 0),
            ),
        ),
      ),
    );
  }

  return rows;
}

export async function syncAutoOrderEmbed(client?: ReadyClient) {
  const settings = await getAllSettings();

  if (!settings.bot.discordBotToken || !settings.bot.autoOrderChannelId) {
    return { ok: false, message: "Bot token atau channel auto-order belum diatur." };
  }

  const run = async (activeClient: ReadyClient) => {
    const [embeds, components] = await Promise.all([
      buildStoreEmbeds(),
      buildProductButtons(),
    ]);

    const message = await sendOrEditTextMessage(
      activeClient,
      settings.bot.autoOrderChannelId,
      settings.bot.autoOrderMessageId,
      {
        content: "",
        embeds,
        components,
      },
    );

    await saveBotSettings({
      autoOrderMessageId: message.id,
      embedSyncRequestedAt: "",
    });

    return { ok: true, message: "Embed auto-order berhasil disinkronkan." };
  };

  if (client) {
    return run(client);
  }

  return withDiscordClient(run, settings.bot.discordBotToken);
}
