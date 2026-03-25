const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

// === REPLACE THESE ===
const STRIPE_SECRET_KEY = "YOUR_STRIPE_SECRET_KEY";
const STRIPE_WEBHOOK_SECRET = "YOUR_STRIPE_WEBHOOK_SECRET";
const PRICE_ID = "YOUR_PRICE_ID";
// =====================

const stripe = new Stripe(STRIPE_SECRET_KEY);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const app = express();

app.use(cors());

// Stripe webhook MUST use raw body
app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;

    try {
      const signature = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("WEBHOOK SIGNATURE ERROR:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const userId = session.client_reference_id;

          if (userId) {
            await db.collection("premiumUsers").doc(userId).set(
              {
                isPremium: true,
                stripeCustomerId: session.customer || "",
                stripeSubscriptionId: session.subscription || "",
                updatedAt: Date.now(),
              },
              { merge: true }
            );
            console.log("PREMIUM ENABLED:", userId);
          }
          break;
        }

        case "customer.subscription.updated":
        case "customer.subscription.created": {
          const subscription = event.data.object;

          const status = subscription.status;
          const isPremium =
            status === "active" || status === "trialing" || status === "past_due";

          const snapshot = await db
            .collection("premiumUsers")
            .where("stripeSubscriptionId", "==", subscription.id)
            .limit(1)
            .get();

          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            await db.collection("premiumUsers").doc(doc.id).set(
              {
                isPremium,
                subscriptionStatus: status,
                updatedAt: Date.now(),
              },
              { merge: true }
            );
            console.log("SUB UPDATED:", doc.id, status);
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object;

          const snapshot = await db
            .collection("premiumUsers")
            .where("stripeSubscriptionId", "==", subscription.id)
            .limit(1)
            .get();

          if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            await db.collection("premiumUsers").doc(doc.id).set(
              {
                isPremium: false,
                subscriptionStatus: "canceled",
                updatedAt: Date.now(),
              },
              { merge: true }
            );
            console.log("SUB CANCELED:", doc.id);
          }
          break;
        }

        default:
          console.log("Unhandled event:", event.type);
      }

      res.json({ received: true });
    } catch (err) {
      console.error("WEBHOOK HANDLER ERROR:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// Normal JSON routes below webhook
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ ok: true, message: "StockPulse server is running" });
});

app.post("/create-checkout-session", async (req, res) => {
  try {
    const { userId } = req.body || {};

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: PRICE_ID,
          quantity: 1,
        },
      ],
      client_reference_id: userId,
      success_url: "https://gostockpulse.com/success",
      cancel_url: "https://gostockpulse.com/cancel",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("CHECKOUT ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/premium-status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const doc = await db.collection("premiumUsers").doc(userId).get();

    if (!doc.exists) {
      return res.json({ isPremium: false });
    }

    const data = doc.data() || {};
    return res.json({
      isPremium: !!data.isPremium,
      subscriptionStatus: data.subscriptionStatus || "unknown",
    });
  } catch (err) {
    console.error("STATUS ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Server running on http://0.0.0.0:3000");
});