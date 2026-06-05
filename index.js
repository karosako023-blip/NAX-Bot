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

const TOKEN = process.env.TOKEN;

// ===== CONFIG =====
const STAFF_ROLE = "1512551951122825356";
const NAX_ROLE = "1512551876854415441";
const LOG_CHANNEL = "1512564461377163385";
const CATEGORY = "1511784868856467487";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// store tickets properly (FIXES YOUR BUG)
const tickets = new Map(); // userId -> channelId
const claims = new Map();  // channelId -> staffId

// ===== SLASH COMMANDS =====
const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Send ticket panel")
].map(c => c.toJSON());

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("Slash commands loaded");
});

// ===== PANEL =====
client.on("interactionCreate", async (i) => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === "panel") {
    const embed = new EmbedBuilder()
      .setTitle("🔥 NAX TICKETS")
      .setColor(0x87CEFA)
      .setDescription("Choose an option below to open a ticket");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("support")
        .setLabel("Support Ticket")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("tryout")
        .setLabel("Tryout Ticket")
        .setStyle(ButtonStyle.Success)
    );

    return i.reply({ embeds: [embed], components: [row] });
  }
});

// ===== BUTTONS =====
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  const guild = i.guild;

  // FIXED: proper ticket check
  if (tickets.has(i.user.id)) {
    return i.reply({ content: "❌ You already have an open ticket.", ephemeral: true });
  }

  // ===== CREATE TICKET =====
  if (i.customId === "support" || i.customId === "tryout") {

    const channel = await guild.channels.create({
      name: `${i.customId}-${i.user.username}`,
      type: ChannelType.GuildText,
      parent: CATEGORY,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
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

    tickets.set(i.user.id, channel.id);

    const embed = new EmbedBuilder()
      .setTitle("🎫 Ticket Created")
      .setColor(0x87CEFA)
      .setDescription(
        i.customId === "tryout"
          ? "Send your **Roblox username**, then upload your **Rivals stats screenshot**."
          : "Explain your issue clearly and staff will assist you."
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("claim")
        .setLabel("Claim")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      content: `<@&${STAFF_ROLE}>`,
      embeds: [embed],
      components: [row]
    });

    return i.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
  }

  // ===== CLAIM FIXED =====
  if (i.customId === "claim") {
    claims.set(i.channel.id, i.user.id);
    return i.reply(`📌 Ticket claimed by <@${i.user.id}>`);
  }

  // ===== CLOSE + TRANSCRIPT =====
  if (i.customId === "close") {
    const channel = i.channel;

    const messages = await channel.messages.fetch({ limit: 50 });

    let logText = messages
      .map(m => `${m.author.tag}: ${m.content}`)
      .reverse()
      .join("\n");

    const logChannel = guild.channels.cache.get(LOG_CHANNEL);

    if (logChannel) {
      logChannel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("📄 Ticket Closed")
            .setColor(0x87CEFA)
            .setDescription(`\`\`\`${logText.slice(0, 3000)}\`\`\``)
        ]
      });
    }

    tickets.delete(i.channel.topic);

    await i.reply("🔒 Closing ticket...");
    setTimeout(() => channel.delete(), 2000);
  }
});

// ===== MODERATION =====
client.on("messageCreate", async (m) => {
  if (!m.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  if (m.content.startsWith("!kick")) {
    const u = m.mentions.members.first();
    if (u) u.kick();
  }

  if (m.content.startsWith("!ban")) {
    const u = m.mentions.members.first();
    if (u) u.ban();
  }

  if (m.content.startsWith("!purge")) {
    const amt = parseInt(m.content.split(" ")[1]);
    if (amt) m.channel.bulkDelete(amt);
  }

  if (m.content.startsWith("!timeout")) {
    const u = m.mentions.members.first();
    if (u) u.timeout(10 * 60 * 1000);
  }
});

client.login(TOKEN);
