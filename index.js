require("dotenv").config();
const crypto = require("crypto");
const dns = require("dns").promises;
const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DOCKER_IMAGE = process.env.DOCKER_IMAGE;
const RAILWAY_API_URL = "https://backboard.railway.com/graphql/v2";

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN belum diisi di .env");
  process.exit(1);
}
if (!DOCKER_IMAGE) {
  console.error("DOCKER_IMAGE belum diisi di .env (lihat folder docker-image/)");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// State per user, HANYA di memori proses (bukan di disk).
const sessions = new Map();
const STEP = { ASK_TOKEN: "ASK_TOKEN", ASK_NAME: "ASK_NAME" };

// ---------- Tampilan /start ----------
const WELCOME_TEXT =
  "🖥️ *RAILWAY VPS BOT*\n" +
  "_Ubuntu • SSH • Claude Code_\n" +
  "━━━━━━━━━━━━━━━━━━━━\n\n" +
  "Bot ini bikinin kamu VPS beneran di *Railway*, lengkap dengan:\n\n" +
  "✅ Ubuntu 22.04\n" +
  "✅ Akses SSH (root)\n" +
  "✅ Claude Code CLI siap pakai\n" +
  "✅ Detail login dikirim langsung ke DM kamu\n\n" +
  "🔒 *Aman:* token Railway kamu tidak pernah disimpan — hanya dipakai sesaat lalu " +
  "langsung dihapus dari memori & dari chat.\n\n" +
  "━━━━━━━━━━━━━━━━━━━━\n" +
  "Tekan tombol di bawah buat mulai 👇";

const START_KEYBOARD = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "🚀 Buat VPS Sekarang", callback_data: "cvps_start", style: "primary"}],
      [{ text: "ℹ️ Cara Kerja", callback_data: "cvps_help", style "primary"}],
    ],
  },
  parse_mode: "Markdown",
};

const HELP_TEXT =
  "📋 *Cara kerja bot ini:*\n\n" +
  "1️⃣ Kamu kirim Railway API Token (Account Token, bukan Project Token)\n" +
  "2️⃣ Pesan token langsung bot hapus otomatis\n" +
  "3️⃣ Kamu kasih nama untuk VPS-nya\n" +
  "4️⃣ Bot bikin project + service + buka akses SSH di Railway\n" +
  "5️⃣ Host, port, user, dan password dikirim ke chat pribadi kamu\n\n" +
  "Ketik /cvps kapan pun untuk mulai, atau /cancel untuk batal di tengah jalan.";

bot.onText(/^\/start$/, (msg) => {
  bot.sendMessage(msg.chat.id, WELCOME_TEXT, START_KEYBOARD);
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;

  if (query.data === "cvps_start") {
    await bot.answerCallbackQuery(query.id);
    beginCvpsFlow(query.from.id, chatId);
  } else if (query.data === "cvps_help") {
    await bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, HELP_TEXT, { parse_mode: "Markdown" });
  }
});

function beginCvpsFlow(userId, chatId) {
  sessions.set(userId, { step: STEP.ASK_TOKEN });
  bot.sendMessage(
    chatId,
    "🔑 Kirimkan Railway API Token kamu di sini.\n\n" +
      "⚠️ Demi keamanan, pesan berisi token akan otomatis dihapus begitu diterima bot, " +
      "jadi orang lain di chat ini tidak sempat melihatnya."
  );
}

// ---------- Handler: /cvps ----------
bot.onText(/^\/cvps$/, (msg) => {
  beginCvpsFlow(msg.from.id, msg.chat.id);
});

bot.onText(/^\/cancel$/, (msg) => {
  sessions.delete(msg.from.id);
  bot.sendMessage(msg.chat.id, "Dibatalkan.");
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  const session = sessions.get(msg.from.id);
  if (!session) return;

  if (session.step === STEP.ASK_TOKEN) {
    await handleReceiveToken(msg, session);
  } else if (session.step === STEP.ASK_NAME) {
    await handleReceiveName(msg, session);
  }
});

async function handleReceiveToken(msg, session) {
  const chatId = msg.chat.id;
  session.railwayToken = msg.text.trim();
  session.step = STEP.ASK_NAME;

  try {
    await bot.deleteMessage(chatId, msg.message_id);
  } catch (e) {
    console.warn("Gagal hapus pesan token:", e.message);
    await bot.sendMessage(
      chatId,
      "⚠️ Bot gagal menghapus pesan token otomatis (mungkin bot bukan admin di grup ini). " +
        "Sebaiknya hapus manual sekarang juga."
    );
  }

  await bot.sendMessage(
    chatId,
    "✅ Token diterima & pesan sudah dihapus.\n\nSekarang, ketik nama untuk VPS kamu:"
  );
}

async function handleReceiveName(msg, session) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const vpsName = msg.text.trim();
  const token = session.railwayToken;

  if (!token) {
    sessions.delete(userId);
    await bot.sendMessage(chatId, "Sesi token sudah kadaluarsa. Mulai lagi dengan /cvps");
    return;
  }

  const statusMsg = await bot.sendMessage(
    chatId,
    `🚧 Membuat VPS *${vpsName}*...\n▱▱▱▱▱ 0/5\n\n_Estimasi 1-3 menit_`,
    { parse_mode: "Markdown" }
  );

  let result;
  try {
    result = await createVps(token, vpsName, (text) =>
      bot.editMessageText(text, { chat_id: chatId, message_id: statusMsg.message_id }).catch(() => {})
    );
  } catch (e) {
    console.error("Gagal membuat VPS:", e.message);
    await bot
      .editMessageText(`❌ Gagal membuat VPS: ${e.message}`, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      })
      .catch(() => {});
    sessions.delete(userId);
    return;
  }

  sessions.delete(userId); // token tidak dibutuhkan lagi

  const detailText =
    `🎉 *VPS '${vpsName}' SUDAH JADI!*\n` +
    "━━━━━━━━━━━━━━━━━━━━\n\n" +
    `🌐 IP      : \`${result.ip || "gagal di-resolve, pakai host di bawah"}\`\n` +
    `📡 Host    : \`${result.domain}\`\n` +
    `🔌 Port    : \`${result.proxyPort}\`\n` +
    `👤 User    : \`root\`\n` +
    `🔒 Password: \`${result.sshPassword}\`\n\n` +
    "💻 *Perintah SSH:*\n" +
    `\`ssh root@${result.ip || result.domain} -p ${result.proxyPort}\`\n\n` +
    `📊 Status deploy: *${result.deploymentStatus}*\n` +
    `🔗 [Buka di Railway](${result.projectUrl})\n\n` +
    "━━━━━━━━━━━━━━━━━━━━\n" +
    "⚠️ IP di atas bisa berubah sewaktu-waktu karena infrastruktur Railway shared/" +
    "load-balanced. Kalau IP gagal connect, pakai *Host* di atas — itu yang stabil.\n" +
    "⚠️ Simpan info ini baik-baik, pesan ini tidak dikirim ulang otomatis.";

  try {
    await bot.sendMessage(userId, detailText, { parse_mode: "Markdown" });
  } catch (e) {
    await bot
      .editMessageText(
        "⚠️ VPS berhasil dibuat, tapi bot tidak bisa mengirim DM ke kamu.\n" +
          "Pastikan kamu sudah pernah /start bot ini secara pribadi, lalu jalankan /cvps lagi.",
        { chat_id: chatId, message_id: statusMsg.message_id }
      )
      .catch(() => {});
    return;
  }

  if (msg.chat.type !== "private") {
    await bot
      .editMessageText("✅ VPS berhasil dibuat. Detail koneksi sudah bot kirim ke chat pribadimu.", {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      })
      .catch(() => {});
  } else {
    await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
  }
}

// ---------- Railway GraphQL helpers ----------
async function railwayRequest(token, query, variables) {
  const resp = await fetch(RAILWAY_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const data = await resp.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}

function generatePassword(length = 20) {
  return crypto.randomBytes(length).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, length);
}

// Railway tidak kasih IP dedicated (semua service ada di balik proxy bersama mereka),
// jadi kita resolve domain proxy-nya ke IP lewat DNS. IP ini BISA berubah sewaktu-waktu
// karena infrastrukturnya shared/load-balanced -> domain:port tetap yang paling stabil.
async function resolveIp(domain) {
  try {
    const addresses = await dns.resolve4(domain);
    return addresses[0] || null;
  } catch (e) {
    console.warn("Gagal resolve IP dari domain:", e.message);
    return null;
  }
}

const PROGRESS_STEPS = [
  "Membuat project Railway",
  "Membuat service dari image Ubuntu SSH + Claude",
  "Mengatur password SSH",
  "Membuka akses publik (TCP proxy) ke port SSH",
  "Mencari IP dari domain proxy",
  "Menunggu deployment selesai",
];

function progressBar(step) {
  const total = PROGRESS_STEPS.length;
  const filled = "▰".repeat(step);
  const empty = "▱".repeat(total - step);
  return `${filled}${empty} ${step}/${total}\n⏳ ${PROGRESS_STEPS[step - 1]}...`;
}

async function createVps(token, projectName, onProgress) {
  // 1) Buat project baru
  onProgress(progressBar(1));
  const projectData = await railwayRequest(
    token,
    `mutation ProjectCreate($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        id
        environments { edges { node { id name } } }
      }
    }`,
    { input: { name: projectName } }
  );
  const projectId = projectData.projectCreate.id;
  const environmentId = projectData.projectCreate.environments.edges[0].node.id;

  // 2) Buat service dari image Docker "Ubuntu SSH + Claude"
  onProgress(progressBar(2));
  const serviceData = await railwayRequest(
    token,
    `mutation ServiceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) {
        id
      }
    }`,
    {
      input: {
        projectId,
        environmentId,
        name: "vps",
        source: { image: DOCKER_IMAGE },
      },
    }
  );
  const serviceId = serviceData.serviceCreate.id;

  // 3) Set password SSH random lewat environment variable (ini memicu deploy)
  onProgress(progressBar(3));
  const sshPassword = generatePassword(20);
  await railwayRequest(
    token,
    `mutation VariableCollectionUpsert($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }`,
    {
      input: {
        projectId,
        environmentId,
        serviceId,
        variables: { SSH_PASSWORD: sshPassword },
      },
    }
  );

  // 4) Buka TCP proxy publik ke port 22 (SSH)
  onProgress(progressBar(4));
  const proxyData = await railwayRequest(
    token,
    `mutation TcpProxyCreate($input: TCPProxyCreateInput!) {
      tcpProxyCreate(input: $input) {
        domain
        proxyPort
      }
    }`,
    { input: { environmentId, serviceId, applicationPort: 22 } }
  );
  const { domain, proxyPort } = proxyData.tcpProxyCreate;

  // 5) Resolve domain proxy ke IP (lihat catatan di fungsi resolveIp)
  onProgress(progressBar(5));
  const ip = await resolveIp(domain);

  // 6) Tunggu sampai deployment SUCCESS (polling), maksimal ~3 menit
  onProgress(progressBar(6));
  const deploymentStatus = await pollDeploymentStatus(token, {
    projectId,
    environmentId,
    serviceId,
  });

  return {
    projectId,
    projectUrl: `https://railway.app/project/${projectId}`,
    domain,
    proxyPort,
    ip,
    sshPassword,
    deploymentStatus,
  };
}

async function pollDeploymentStatus(token, { projectId, environmentId, serviceId }, maxTries = 30, delayMs = 6000) {
  for (let i = 0; i < maxTries; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const data = await railwayRequest(
        token,
        `query Deployments($input: DeploymentListInput!) {
          deployments(first: 1, input: $input) {
            edges { node { id status } }
          }
        }`,
        { input: { projectId, environmentId, serviceId } }
      );
      const edges = data.deployments.edges;
      if (edges.length > 0) {
        const status = edges[0].node.status;
        if (["SUCCESS", "FAILED", "CRASHED", "REMOVED"].includes(status)) {
          return status;
        }
      }
    } catch (e) {
      console.warn("Polling status gagal:", e.message);
    }
  }
  return "BELUM_SELESAI (cek manual di dashboard Railway)";
}

console.log("Bot berjalan (polling)...");
