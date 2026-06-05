require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const Database = require("better-sqlite3");
const db = new Database("nax.db");

// ===== CONFIG =====
const TOKEN = process.env.TOKEN;

const STAFF_ROLE = "1512551951122825356";
const NAX_ROLE = "1512551876854415441";
const LOG_CHANNEL = "1512564461377163385";
const CATEGORY = "1511784868856467487";

const COLOR = 0x87CEFA;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ===== DATABASE =====
db.prepare(`
CREATE TABLE IF NOT EXISTS tickets (
  userId TEXT PRIMARY KEY,
  channelId TEXT,
  type TEXT,
  data TEXT
)
`).run();

// ===== SLASH COMMAND =====
const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Open ticket panel")
].map(c => c.toJSON());

// ===== READY =====
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

  console.log("Slash commands ready");
});

// ===== PANEL =====
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === "panel") {
    const embed = new EmbedBuilder()
      .setTitle("🔥 NAX SYSTEM")
      .setColor(COLOR)
      .setDescription("Choose an option");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("support").setLabel("Support").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("tryout").setLabel("Tryout").setStyle(ButtonStyle.Success)
    );

    return i.reply({ embeds: [embed], components: [row] });
  }
});

// ===== HELPER =====
function saveTicket(userId, channelId, type, data = {}) {
  db.prepare(`
    INSERT OR REPLACE INTO tickets VALUES (?, ?, ?, ?)
  `).run(userId, channelId, type, JSON.stringify(data));
}

function getTicket(userId) {
  return db.prepare(`SELECT * FROM tickets WHERE userId = ?`).get(userId);
}

// ===== FLOW STATE (TEMP MEMORY) =====
const flow = new Map();

// ===== BUTTONS =====
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  const guild = i.guild;

  // already ticket
  if (getTicket(i.user.id)) {
    return i.reply({ content: "❌ You already have a ticket.", ephemeral: true });
  }

  // CREATE TICKET
  if (i.customId === "support" || i.customId === "tryout") {

    const ch = await guild.channels.create({
      name: `${i.customId}-${i.user.username}`,
      type: ChannelType.GuildText,
      parent: CATEGORY,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: STAFF_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    saveTicket(i.user.id, ch.id, i.customId, { step: 0 });

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle("🎫 Ticket Started");

    if (i.customId === "tryout") {
      embed.setDescription("Step 1: Send your **Roblox username**");
      flow.set(ch.id, { step: 1, user: i.user.id, data: {} });
    } else {
      embed.setDescription("Explain your issue.");
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("claim").setLabel("Claim").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("close").setLabel("Close").setStyle(ButtonStyle.Danger)
    );

    await ch.send({ content: `<@&${STAFF_ROLE}>`, embeds: [embed], components: [row] });

    return i.reply({ content: `Ticket created: ${ch}`, ephemeral: true });
  }

  // CLAIM
  if (i.customId === "claim") {
    return i.reply(`📌 Claimed by <@${i.user.id}>`);
  }

  // CLOSE + SUMMARY
  if (i.customId === "close") {
    const log = guild.channels.cache.get(LOG_CHANNEL);
    if (log) log.send(`📄 Ticket closed: ${i.channel.name}`);

    flow.delete(i.channel.id);

    await i.reply("Closing...");
    setTimeout(() => i.channel.delete(), 1500);
  }

  // ACCEPT / REJECT (STAFF)
  if (i.customId === "accept" || i.customId === "reject") {
    const member = await guild.members.fetch(i.message.mentions.users.first().id);

    if (i.customId === "accept") {
      await member.roles.add(NAX_ROLE);
      member.send("✅ You were accepted into NAX!");
      i.channel.send("Accepted ✔");
    } else {
      member.send("❌ You were rejected.");
      i.channel.send("Rejected ❌");
    }
  }
});

// ===== TRYOUT FLOW =====
client.on("messageCreate", async (m) => {
  const state = flow.get(m.channel.id);
  if (!state) return;

  if (state.step === 1) {
    state.data.username = m.content;
    state.step = 2;

    return m.channel.send("Step 2: Send your Rivals stats screenshot.");
  }

  if (state.step === 2) {
    if (!m.attachments.size) {
      return m.reply("❌ You must send a screenshot.");
    }

    state.data.image = m.attachments.first().url;

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle("📊 Application Summary")
      .addFields(
        { name: "Username", value: state.data.username },
        { name: "Image", value: "Attached below" }
      )
      .setImage(state.data.image);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("accept").setLabel("Accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("reject").setLabel("Reject").setStyle(ButtonStyle.Danger)
    );

    return m.channel.send({ embeds: [embed], components: [row] });
  }
});

client.login(TOKEN);
