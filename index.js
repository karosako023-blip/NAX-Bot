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
  PermissionsBitField
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// ===== CONFIG =====
const STAFF_ROLE = "1512551951122825356";
const NAX_ROLE = "1512551876854415441";
const LOG_CHANNEL = "1512564461377163385";
const PANEL_CHANNEL = "1512543946700488876";
const CATEGORY = "1511784868856467487";

const COLOR = 0x87CEFA; // light blue

const activeTickets = new Map();

// ===== READY =====
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== PANEL =====
client.on("messageCreate", async (message) => {
  if (message.content !== "!panel") return;

  const embed = new EmbedBuilder()
    .setTitle("NAX Ticket System")
    .setColor(COLOR)
    .setDescription("Choose an option below");

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

  message.channel.send({ embeds: [embed], components: [row] });
});

// ===== INTERACTIONS =====
client.on("interactionCreate", async (i) => {
  if (!i.isButton()) return;

  const guild = i.guild;

  // ONE TICKET PER USER
  if ([...activeTickets.values()].find(t => t.user === i.user.id)) {
    return i.reply({ content: "You already have a ticket.", ephemeral: true });
  }

  // ===== CREATE TICKET =====
  if (i.customId === "support" || i.customId === "tryout") {

    const channel = await guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText,
      parent: CATEGORY,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: i.user.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
        },
        {
          id: STAFF_ROLE,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
        }
      ]
    });

    activeTickets.set(channel.id, {
      user: i.user.id,
      type: i.customId
    });

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle("Ticket Opened")
      .setDescription(
        i.customId === "tryout"
          ? "Send your **Roblox username** first, then upload your **Rivals stats screenshot**."
          : "Explain your issue and staff will help you."
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("close")
        .setLabel("Close")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId("claim")
        .setLabel("Claim")
        .setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ content: `<@&${STAFF_ROLE}>`, embeds: [embed], components: [row] });

    return i.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
  }

  // ===== CLOSE =====
  if (i.customId === "close") {
    const ch = i.channel;
    await ch.send("Ticket closing...");
    setTimeout(() => ch.delete(), 2000);
  }

  // ===== CLAIM =====
  if (i.customId === "claim") {
    i.channel.send(`Ticket claimed by <@${i.user.id}>`);
  }

  // ===== ACCEPT / REJECT (manual staff commands later) =====
});

// ===== SIMPLE MODERATION =====
client.on("messageCreate", async (m) => {
  if (!m.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

  if (m.content.startsWith("!kick")) {
    const user = m.mentions.members.first();
    if (user) user.kick();
  }

  if (m.content.startsWith("!ban")) {
    const user = m.mentions.members.first();
    if (user) user.ban();
  }

  if (m.content.startsWith("!purge")) {
    const amount = parseInt(m.content.split(" ")[1]);
    if (!amount) return;
    m.channel.bulkDelete(amount);
  }

  if (m.content.startsWith("!timeout")) {
    const user = m.mentions.members.first();
    if (!user) return;
    user.timeout(10 * 60 * 1000);
  }
});

client.login(process.env.TOKEN);
