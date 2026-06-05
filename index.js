require("dotenv").config();

const fs = require("fs");
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
  Routes,
  StringSelectMenuBuilder
} = require("discord.js");

// ===== CONFIG =====
const TOKEN = process.env.TOKEN;

const STAFF_ROLE = "1512551951122825356";
const NAX_ROLE = "1512551876854415441";
const LOG_CHANNEL = "1512564461377163385";
const CATEGORY = "1511784868856467487";

const COLOR = 0x87CEFA;

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// ===== SIMPLE JSON DB =====
const DB_FILE = "./database.json";

function loadDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ===== STATE MEMORY =====
const flow = new Map();
const claimed = new Map();

// cleanup stuck flows
setInterval(() => {
  for (const [k, v] of flow.entries()) {
    if (!v || !v.step) flow.delete(k);
  }
}, 600000);

// ===== SLASH COMMANDS =====
const commands = [
  new SlashCommandBuilder().setName("panel").setDescription("Open ticket panel"),
  new SlashCommandBuilder()
    .setName("rename")
    .setDescription("Rename ticket")
    .addStringOption(o =>
      o.setName("name").setDescription("New name").setRequired(true)
    )
].map(c => c.toJSON());

// ===== READY =====
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

  console.log("Bot ready");
});

// ===== PANEL =====
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === "panel") {
    const embed = new EmbedBuilder()
      .setTitle("🔥 NAX SYSTEM")
      .setColor(COLOR)
      .setDescription("Select a ticket type");

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_select")
      .addOptions(
        { label: "Support Ticket", value: "support" },
        { label: "Tryout Ticket", value: "tryout" }
      );

    return i.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }

  if (i.commandName === "rename") {
    await i.channel.setName(i.options.getString("name"));
    return i.reply({ content: "Renamed.", ephemeral: true });
  }
});

// ===== SELECT MENU =====
client.on("interactionCreate", async (i) => {
  if (!i.isStringSelectMenu()) return;
  if (i.customId !== "ticket_select") return;

  const db = loadDB();

  if (Object.values(db).find(t => t.userId === i.user.id)) {
    return i.reply({ content: "❌ You already have a ticket.", ephemeral: true });
  }

  const type = i.values[0];

  const channel = await i.guild.channels.create({
    name: `${type}-${i.user.username}`,
    type: ChannelType.GuildText,
    parent: CATEGORY,
    permissionOverwrites: [
      { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      {
        id: i.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.AttachFiles
        ]
      },
      {
        id: STAFF_ROLE,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages
        ]
      }
    ]
  });

  db[channel.id] = {
    userId: i.user.id,
    type,
    step: type === "tryout" ? 1 : 99,
    data: {}
  };

  saveDB(db);

  flow.set(channel.id, db[channel.id]);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle("🎫 Ticket Opened")
    .setDescription(type === "tryout"
      ? "Step 1: Send Roblox username"
      : "Explain your issue")
    .setFooter({ text: "NAX System" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("claim").setLabel("Claim").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("close").setLabel("Close").setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `<@&${STAFF_ROLE}>`,
    embeds: [embed],
    components: [row]
  });

  return i.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
});

// ===== BUTTONS =====
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  const db = loadDB();

  if (i.customId === "claim") {
    if (claimed.has(i.channel.id)) {
      return i.reply({ content: "Already claimed", ephemeral: true });
    }

    claimed.set(i.channel.id, i.user.id);
    return i.reply(`📌 Claimed by <@${i.user.id}>`);
  }

  if (i.customId === "close") {
    const log = i.guild.channels.cache.get(LOG_CHANNEL);

    const msgs = await i.channel.messages.fetch({ limit: 100 });

    const transcript = msgs
      .map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`)
      .reverse()
      .join("\n");

    if (log) {
      log.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("📄 Ticket Closed")
            .setColor(COLOR)
        ],
        files: [{
          attachment: Buffer.from(transcript, "utf8"),
          name: "transcript.txt"
        }]
      });
    }

    delete db[i.channel.id];
    saveDB(db);

    flow.delete(i.channel.id);
    claimed.delete(i.channel.id);

    await i.reply("Closing...");
    setTimeout(() => i.channel.delete(), 1500);
  }

  if (i.customId === "accept" || i.customId === "reject") {
    const member = await i.guild.members.fetch(i.message.mentions.users.first().id);

    if (i.customId === "accept") {
      await member.roles.add(NAX_ROLE);
      member.send("✅ Accepted into NAX");
      i.channel.send("Accepted ✔");
    } else {
      member.send("❌ Rejected");
      i.channel.send("Rejected ❌");
    }
  }
});

// ===== TRYOUT FLOW =====
client.on("messageCreate", async (m) => {
  const db = loadDB();
  const state = db[m.channel.id];
  if (!state) return;

  if (state.step === 1) {
    state.data.username = m.content;
    state.step = 2;

    await m.channel.setName(`tryout-${m.content}`);
    db[m.channel.id] = state;
    saveDB(db);

    return m.channel.send("Step 2: Send screenshot");
  }

  if (state.step === 2) {
    if (!m.attachments.size) return m.reply("Screenshot required");

    const img = m.attachments.first().url;
    state.data.image = img;

    const embed = new EmbedBuilder()
      .setTitle("📊 Application")
      .setColor(COLOR)
      .addFields(
        { name: "Username", value: state.data.username }
      )
      .setImage(img)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("accept").setLabel("Accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("reject").setLabel("Reject").setStyle(ButtonStyle.Danger)
    );

    saveDB(db);

    return m.channel.send({ embeds: [embed], components: [row] });
  }
});

client.login(TOKEN);
