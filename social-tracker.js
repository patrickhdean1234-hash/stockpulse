const admin = require("firebase-admin");
const axios = require("axios");

const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const TRACKED_POLITICIANS = [
  "Donald Trump",
  "Nancy Pelosi",
  "Jerome Powell",
  "Elizabeth Warren",
];

const TRACKED_INFLUENCERS = [
  "Elon Musk",
  "Cathie Wood",
  "Jim Cramer",
  "Warren Buffett",
  "Chamath Palihapitiya",
];

const TRACKED_TICKERS = [
  "TSLA", "NVDA", "AAPL", "MSFT", "AMZN", "META", "GOOGL",
  "SPY", "GLD", "SLV", "XOM", "CVX", "NEM", "FCX"
];

const TRACKED_METALS = [
  "gold", "silver", "copper", "platinum", "palladium", "uranium", "lithium"
];

function detectMentions(content = "") {
  const upper = content.toUpperCase();
  const lower = content.toLowerCase();

  const tickers = TRACKED_TICKERS.filter(
    (t) =>
      upper.includes(`$${t}`) ||
      upper.includes(` ${t} `) ||
      upper.startsWith(`${t} `) ||
      upper.endsWith(` ${t}`) ||
      upper.includes(`(${t})`) ||
      upper.includes(t)
  );

  const metals = TRACKED_METALS.filter((m) => lower.includes(m));

  return { tickers, metals };
}

function detectPersonType(author = "", content = "") {
  const full = `${author} ${content}`.toLowerCase();

  if (TRACKED_POLITICIANS.some((p) => full.includes(p.toLowerCase()))) {
    return "politician";
  }

  if (TRACKED_INFLUENCERS.some((p) => full.includes(p.toLowerCase()))) {
    return "influencer";
  }

  return "media";
}

async function getSavedAlerts() {
  const snapshot = await db.collection("alerts").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ticker: (data.ticker || "").toUpperCase(),
    };
  });
}

async function saveTriggeredAlert(ticker, post) {
  await db.collection("triggeredAlerts").add({
    ticker,
    author: post.author || "Unknown",
    content: post.content || "",
    source: post.source || "News",
    createdAt: Date.now(),
  });
}

async function runTracker() {
  try {
    console.log("Starting tracker...");

    const alerts = await getSavedAlerts();
    const alertTickers = alerts.map((a) => a.ticker);
    console.log("Saved alerts:", alertTickers);

    const res = await axios.get(
      "https://api.marketaux.com/v1/news/all?countries=us&language=en&filter_entities=true&api_token=uv3OSx3UrW7f1e6ZODoa8JtqFGNtsGimwZqAjf2E"
    );

    const items = Array.isArray(res.data?.data) ? res.data.data : [];
    console.log("Articles found:", items.length);

    for (const item of items.slice(0, 15)) {
      const title = item?.title || "";
      const description = item?.description || "";
      const fullText = `${title} ${description}`.trim();

      const mentions = detectMentions(fullText);
      if (mentions.tickers.length === 0 && mentions.metals.length === 0) {
        continue;
      }

      const author = item?.source || "Market News";
      const personType = detectPersonType(author, fullText);

      const post = {
        author,
        content: title || fullText,
        createdAt: Date.now(),
        tickers: mentions.tickers,
        metals: mentions.metals,
        source: "News",
        personType,
      };

      await db.collection("posts").add(post);

      const triggered = mentions.tickers.filter((t) => alertTickers.includes(t));

      for (const ticker of triggered) {
        console.log(`ALERT TRIGGERED: ${ticker}`);
        await saveTriggeredAlert(ticker, post);
      }
    }

    console.log("Done writing market posts");
  } catch (err) {
    console.error("TRACKER ERROR:", err.message);
  }
}

runTracker();