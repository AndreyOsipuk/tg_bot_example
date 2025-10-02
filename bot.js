require("dotenv").config({ path: path.join(__dirname, ".env") });
const TelegramBot = require("node-telegram-bot-api");
// const axios = require("axios");

// ENV
const TOKEN = process.env.TELEGRAM_TOKEN;
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

console.log("▶️ Starting bot process...");
if (!TOKEN) {
  console.error("❌ TELEGRAM_TOKEN не найден в .env");
  process.exit(1);
}

console.log("🧪 Env loaded. Token length:", TOKEN.length);

// Инициализация бота: long polling
const bot = new TelegramBot(TOKEN, { polling: true });

bot.on("polling_error", (err) => {
  console.error("Polling error:", err?.response?.body || err);
});
bot.on("error", (err) => {
  console.error("Bot error:", err);
});

// --- Проверка "пинга" ---
bot.onText(/^\/ping$/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, "✅ Бот работает и слушает команды");
});

(async () => {
  try {
    console.log("🔧 Deleting webhook (if any)...");
    await bot.deleteWebHook({ drop_pending_updates: true });
    console.log("🔧 Webhook deleted (or was not set).");
  } catch (e) {
    console.warn("⚠️ Failed to delete webhook (можно игнорировать, если не был включен):", e?.message || e);
  }

  try {
    const me = await bot.getMe();
    console.log(`✅ Bot authorized as @${me.username} (id: ${me.id})`);
    console.log("⏳ Polling started. Send /ping to your bot in Telegram.");
  } catch (e) {
    console.error("❌ getMe() failed — проверь токен:", e?.message || e);
  }
})();

const SUPPORT_MESSAGES = [
  "Ты сильнее, чем думаешь.",
  "Даже самый тёмный тоннель имеет выход.",
  "Ты важен. Очень.",
  "Сегодня ты сделал выбор в пользу жизни — и это главное.",
  "Ты не один. Мы рядом.",
  "Каждый день — шанс начать заново.",
  "Дыши глубоко. Всё будет хорошо.",
  "Ты нужен этому миру.",
  "Маленький шаг — тоже движение вперёд.",
  "Твои чувства важны. Не скрывай их.",
  "Ты заслуживаешь заботы и поддержки.",
  "Иногда просто быть собой — уже геройство.",
  "Твоя жизнь — бесценна.",
  "Ты способен пройти через это.",
  "Мир ценит тебя больше, чем ты думаешь.",
  "Даже если тяжело — это не конец.",
  "С каждым вдохом ты выбираешь жизнь.",
  "Ты смелый за то, что ищешь помощь.",
  "Один день за раз. Ты справишься.",
  "Любовь и поддержка рядом — открой своё сердце."
];

// Простая “память” в рантайме (перезапускаешь процесс — всё обнуляется)
const USER_HISTORY = new Map(); // userId -> [{ text, mood }]
const MENTORS = new Map();      // userId -> mentorId/строка (пока не используется)
const REMINDERS = new Map();    // userId -> reminder data (пока не используется)

const THRESHOLD_NEGATIVE = 3;
const LOOKBACK = 5;

function analyzeEmotion(text) {
  const crisisWords = ["не хочу жить", "суицид", "умереть", "покончу"];
  const negativeWords = ["грусть", "плохо", "устал", "один", "больно", "страх", "тревога"];
  const positiveWords = ["радость", "счастье", "люблю", "надежда", "свет"];

  const low = (text || "").toLowerCase();
  if (crisisWords.some((w) => low.includes(w))) return "crisis";
  if (negativeWords.some((w) => low.includes(w))) return "negative";
  if (positiveWords.some((w) => low.includes(w))) return "positive";
  return "neutral";
}

function mainKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Ответить на вопрос «Почему?»", callback_data: "why" }],
        [{ text: "🤝 Рука помощи", callback_data: "help_hand" }],
        [{ text: "Установить напоминание", callback_data: "set_reminder" }],
        [{ text: "Задать наставника", callback_data: "set_mentor" }]
      ]
    },
    parse_mode: "Markdown"
  };
}

// /start
bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId,
    "Привет! Это бот *Почему?*.\nТы можешь сохранять свои ответы и получать поддержку.",
    mainKeyboard()
  );
});

// /help
bot.onText(/^\/help$/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId,
    "Команды:\n/start – меню\n/help – помощь"
  );
});

// Обработка callback-кнопок (inline keyboard)
bot.on("callback_query", async (query) => {
  const { data } = query;
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  // Обязательно ответить на callback (чтобы исчез «часик»)
  await bot.answerCallbackQuery(query.id).catch(() => {});

//   if (data === "help_hand") {
//     try {
//       const resp = await axios.post(`${BACKEND_URL}/sos/trigger`, { user_id: 1 });
//       if (resp.status === 200) {
//         const message = SUPPORT_MESSAGES[Math.floor(Math.random() * SUPPORT_MESSAGES.length)];
//         await bot.editMessageText(
//           `🤝 Ты протянул руку — и помощь уже рядом.\n\n${message}`,
//           { chat_id: chatId, message_id: messageId }
//         );
//       } else {
//         await bot.editMessageText(
//           "⚠️ Не удалось отправить запрос помощи.",
//           { chat_id: chatId, message_id: messageId }
//         );
//       }
//     } catch (e) {
//       await bot.editMessageText(
//         `Ошибка соединения: ${e?.message || e}`,
//         { chat_id: chatId, message_id: messageId }
//       );
//     }
//     return;
//   }

  if (data === "why") {
    await bot.sendMessage(chatId, "Попробуй сформулировать, *почему* ты так чувствуешь? Что этому предшествовало?", { parse_mode: "Markdown" });
    return;
  }

  if (data === "set_reminder") {
    await bot.sendMessage(chatId, "Ок! Пока эта функция заглушка. Напиши, во сколько напоминать, и я сохраню. 📅");
    return;
  }

  if (data === "set_mentor") {
    await bot.sendMessage(chatId, "Напиши имя или контакт наставника, я привяжу его к твоему профилю. 👤");
    return;
  }

  if (data === "mentor") {
    await bot.sendMessage(chatId, "Пока не подключено. Но ты можешь написать сюда, и я сохраню наставника.");
    return;
  }

  if (data === "support") {
    const message = SUPPORT_MESSAGES[Math.floor(Math.random() * SUPPORT_MESSAGES.length)];
    await bot.sendMessage(chatId, `Держи немного поддержки:\n\n${message}`);
    return;
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Пропустим команды (начинаются с '/')
  if (!text || text.startsWith("/")) return;

  const userId = msg.from.id;
  const mood = analyzeEmotion(text);

  const history = USER_HISTORY.get(userId) || [];
  history.push({ text, mood });

  const trimmed = history.slice(-LOOKBACK);
  USER_HISTORY.set(userId, trimmed);

  const negativeCount = trimmed.reduce((acc, m) => acc + (m.mood === "negative" || m.mood === "crisis" ? 1 : 0), 0);

  console.log(negativeCount, THRESHOLD_NEGATIVE)
  if (negativeCount >= THRESHOLD_NEGATIVE) {
    await bot.sendMessage(
      chatId,
      "Я заметил, что тебе тяжело последние дни. Хочешь, я помогу протянуть руку или просто поддержу?",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🤝 Рука помощи", callback_data: "help_hand" }],
            [{ text: "Поговорить с наставником", callback_data: "mentor" }],
            [{ text: "Просто поддержка", callback_data: "support" }]
          ]
        }
      }
    );
  }
});