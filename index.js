const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
require("dotenv").config();
const axios = require("axios");

// Set up bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Register slash command
const commands = [
  new SlashCommandBuilder()
    .setName("card")
    .setDescription("Search for a Pokémon card by format and name")
    .addStringOption((option) =>
      option
        .setName("format")
        .setDescription("Format to search (standard, expanded, etc.)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Card name to search for")
        .setRequired(true)
    ),
].map((command) => command.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });
    console.log("Slash commands registered.");
  } catch (error) {
    console.error("Failed to register commands:", error);
  }
})();

// On bot ready
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  // Handle slash command
  if (interaction.isChatInputCommand() && interaction.commandName === "card") {
    const format = interaction.options.getString("format").toLowerCase();
    const query = interaction.options
      .getString("name")
      .replace(/[^\w\s\-’:!'.]/gi, "");

    try {
      const { data } = await axios.get(`https://api.pokemontcg.io/v2/cards`, {
        params: { q: `name:${query}` },
        headers: { "X-Api-Key": "" }, // Optional if not using key
      });

      const cards = data.data
        ?.filter((card) => {
          if (format === "standard") {
            return (
              card.regulationMark && card.regulationMark.toUpperCase() >= "G"
            );
          }
          return card.legalities?.[format] === "Legal";
        })
        .slice(0, 25); // Discord allows max 25 options

      if (!cards.length) {
        return interaction.reply({
          content: `❌ No legal cards found for "${query}" in ${format}.`,
          ephemeral: true,
        });
      }

      const options = cards.map((card, index) => ({
        label: `${card.name} (${card.set?.name ?? "Unknown Set"})`,
        description: `Reg: ${card.regulationMark ?? "?"} • Rarity: ${
          card.rarity ?? "Unknown"
        }`,
        value: index.toString(),
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("card_select")
        .setPlaceholder("Choose a card")
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      client.cachedCards = cards;

      await interaction.reply({
        content: `🔍 Results for "${query}" in ${format}:`,
        components: [row],
        ephemeral: true,
      });
    } catch (err) {
      console.error(err);
      return interaction.reply({
        content: "⚠️ Error fetching card info.",
        ephemeral: true,
      });
    }
  }

  // Handle card selection from dropdown
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "card_select"
  ) {
    const selectedIndex = parseInt(interaction.values[0], 10);
    const card = client.cachedCards?.[selectedIndex];

    if (!card) {
      return interaction.reply({
        content: "❌ Could not retrieve card data.",
        ephemeral: true,
      });
    }

    await interaction.reply({
      content: `**${card.name}**\nSet: ${card.set.name}\nType: ${
        card.supertype
      } – ${card.subtypes?.join(", ") ?? "None"}\nRegulation Mark: ${
        card.regulationMark ?? "Unknown"
      }`,
      files: [card.images.large],
      ephemeral: true,
    });
  }
});

// Login
client.login(process.env.DISCORD_TOKEN);
