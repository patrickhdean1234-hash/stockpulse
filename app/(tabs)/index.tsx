import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
} from "firebase/firestore";

type PostItem = {
  id: string;
  author?: string;
  content?: string;
  createdAt?: number;
  source?: string;
  tickers?: string[];
  metals?: string[];
  personType?: string;
};

type TriggeredAlertItem = {
  id: string;
  ticker?: string;
  author?: string;
  content?: string;
  source?: string;
  createdAt?: number;
};

const firebaseConfig = {
  apiKey: "AIzaSyBTyXp0pmfp6QfFPjrEjVcOV0FbPsoTcfA",
  authDomain: "stockpulse-app-2f306.firebaseapp.com",
  projectId: "stockpulse-app-2f306",
  storageBucket: "stockpulse-app-2f306.firebasestorage.app",
  messagingSenderId: "79219564415",
  appId: "1:79219564415:web:c57c641c45298e59e2044a",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// REPLACE THIS WITH YOUR PUBLIC BACKEND URL AFTER YOU DEPLOY
const BACKEND_URL = "https://YOUR-RENDER-URL.onrender.com";

function summarizeContent(content: string) {
  const clean = (content || "").trim();
  if (!clean) return "No summary available.";
  if (clean.length <= 140) return clean;

  const sentenceBreak =
    clean.indexOf(". ") > 60 ? clean.indexOf(". ") + 1 : -1;

  if (sentenceBreak > 0 && sentenceBreak < 180) {
    return clean.slice(0, sentenceBreak).trim();
  }

  return clean.slice(0, 140).trim() + "...";
}

async function getOrCreateUserId() {
  const existing = await AsyncStorage.getItem("stockpulseUserId");
  if (existing) return existing;

  const newId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem("stockpulseUserId", newId);
  return newId;
}

export default function HomeScreen() {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [alerts, setAlerts] = useState<TriggeredAlertItem[]>([]);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("all");
  const [tickerFilter, setTickerFilter] = useState("");
  const [alertTicker, setAlertTicker] = useState("");
  const [status, setStatus] = useState("");
  const [activeTab, setActiveTab] = useState<"feed" | "premium">("feed");
  const [isPremium, setIsPremium] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    (async () => {
      const id = await getOrCreateUserId();
      setUserId(id);
      await refreshPremiumStatus(id);
    })();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rows: PostItem[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            author: data.author || "Unknown",
            content: data.content || "(no content)",
            createdAt: data.createdAt || 0,
            source: data.source || "Unknown",
            tickers: data.tickers || [],
            metals: data.metals || [],
            personType: data.personType || "media",
          };
        });

        setPosts(rows);
      },
      (error) => {
        console.log("POSTS ERROR:", error.message);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "triggeredAlerts"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rows: TriggeredAlertItem[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ticker: data.ticker || "",
            author: data.author || "Unknown",
            content: data.content || "",
            source: data.source || "Unknown",
            createdAt: data.createdAt || 0,
          };
        });

        setAlerts(rows);
      },
      (error) => {
        console.log("ALERTS ERROR:", error.message);
      }
    );

    return unsubscribe;
  }, []);

  const refreshPremiumStatus = async (id?: string) => {
    try {
      const targetId = id || userId;
      if (!targetId) return;

      const res = await fetch(`${BACKEND_URL}/premium-status/${targetId}`);
      const data = await res.json();

      setIsPremium(!!data.isPremium);
      if (data.isPremium) {
        setStatus("Premium active");
      }
    } catch (err: any) {
      console.log("PREMIUM STATUS ERROR:", err.message);
    }
  };

  const addPost = async () => {
    if (!text.trim()) return;

    try {
      await addDoc(collection(db, "posts"), {
        author: "You",
        content: text,
        createdAt: Date.now(),
        source: "Manual",
        tickers: [],
        metals: [],
        personType: "user",
      });

      setText("");
      setStatus("Post saved");
    } catch (err: any) {
      setStatus(`Post error: ${err.message}`);
    }
  };

  const saveAlert = async () => {
    if (!alertTicker.trim()) return;

    try {
      const cleanTicker = alertTicker.trim().toUpperCase();

      await addDoc(collection(db, "alerts"), {
        ticker: cleanTicker,
        createdAt: Date.now(),
      });

      setAlertTicker("");
      setStatus(`Alert saved: ${cleanTicker}`);
    } catch (err: any) {
      setStatus(`Alert error: ${err.message}`);
    }
  };

  const openCheckout = async () => {
    try {
      setCheckoutLoading(true);

      if (!userId) {
        throw new Error("Missing userId");
      }

      const res = await fetch(`${BACKEND_URL}/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
        }),
      });

      const data = await res.json();

      if (!data?.url) {
        throw new Error(data?.error || "No checkout URL returned");
      }

      await Linking.openURL(data.url);
      setStatus("Opened Stripe checkout");
    } catch (err: any) {
      console.log("CHECKOUT ERROR:", err.message);
      Alert.alert("Checkout error", err.message);
      setStatus(`Checkout error: ${err.message}`);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const renderTag = (label: string, bgColor = "#1f2937") => (
    <View
      key={label}
      style={{
        backgroundColor: bgColor,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        marginRight: 6,
        marginTop: 8,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
        {label}
      </Text>
    </View>
  );

  const filteredPosts = useMemo(() => {
    return posts.filter((item) => {
      if (filter !== "all" && item.personType !== filter) return false;

      if (tickerFilter) {
        return (item.tickers || []).some((t) =>
          t.toLowerCase().includes(tickerFilter.toLowerCase())
        );
      }

      return true;
    });
  }, [posts, filter, tickerFilter]);

  const HeaderCard = () => (
    <View
      style={{
        backgroundColor: "#0b1220",
        borderRadius: 20,
        padding: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <Text
        style={{
          color: "#fff",
          fontSize: 30,
          fontWeight: "800",
          letterSpacing: 0.3,
        }}
      >
        StockPulse
      </Text>

      <Text
        style={{
          color: "#8b9bb7",
          marginTop: 6,
          fontSize: 14,
        }}
      >
        Track Social Signals That Move Markets
      </Text>

      <View style={{ flexDirection: "row", marginTop: 16 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: "#111827",
            borderRadius: 14,
            padding: 12,
            marginRight: 8,
          }}
        >
          <Text style={{ color: "#8b9bb7", fontSize: 12 }}>Feed</Text>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>
            {filteredPosts.length}
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            backgroundColor: "#111827",
            borderRadius: 14,
            padding: 12,
            marginRight: 8,
          }}
        >
          <Text style={{ color: "#8b9bb7", fontSize: 12 }}>Alerts</Text>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>
            {alerts.length}
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            backgroundColor: "#111827",
            borderRadius: 14,
            padding: 12,
          }}
        >
          <Text style={{ color: "#8b9bb7", fontSize: 12 }}>Plan</Text>
          <Text
            style={{
              color: isPremium ? "#facc15" : "#22c55e",
              fontSize: 18,
              fontWeight: "800",
            }}
          >
            {isPremium ? "Pro" : "Free"}
          </Text>
        </View>
      </View>
    </View>
  );

  const FeedControls = () => (
    <View
      style={{
        backgroundColor: "#0b1220",
        borderRadius: 18,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <Text style={{ color: "#94a3b8", marginBottom: 10, fontWeight: "700" }}>
        Feed Controls
      </Text>

      <View style={{ flexDirection: "row", marginBottom: 10 }}>
        {["all", "politician", "influencer"].map((type) => (
          <TouchableOpacity
            key={type}
            onPress={() => setFilter(type)}
            style={{
              backgroundColor: filter === type ? "#22c55e" : "#111827",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 10,
              marginRight: 8,
              borderWidth: 1,
              borderColor:
                filter === type
                  ? "rgba(34,197,94,0.5)"
                  : "rgba(255,255,255,0.08)",
            }}
          >
            <Text
              style={{
                color: filter === type ? "#03140a" : "#fff",
                fontWeight: "700",
              }}
            >
              {type}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        placeholder="Filter by ticker (TSLA, NVDA...)"
        placeholderTextColor="#667085"
        value={tickerFilter}
        onChangeText={setTickerFilter}
        style={{
          backgroundColor: "#111827",
          color: "#fff",
          padding: 12,
          borderRadius: 12,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        }}
      />

      <TextInput
        placeholder={isPremium ? "Set alert (ex: TSLA)" : "Free plan: save 1 alert"}
        placeholderTextColor="#667085"
        value={alertTicker}
        onChangeText={setAlertTicker}
        autoCapitalize="characters"
        style={{
          backgroundColor: "#111827",
          color: "#fff",
          padding: 12,
          borderRadius: 12,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        }}
      />

      <TouchableOpacity
        onPress={saveAlert}
        style={{
          backgroundColor: "#2563eb",
          padding: 12,
          borderRadius: 12,
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            color: "#fff",
            textAlign: "center",
            fontWeight: "800",
          }}
        >
          Save Alert
        </Text>
      </TouchableOpacity>

      <View style={{ flexDirection: "row" }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Write a market post..."
          placeholderTextColor="#667085"
          style={{
            flex: 1,
            backgroundColor: "#111827",
            color: "#fff",
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        />

        <TouchableOpacity
          onPress={addPost}
          style={{
            marginLeft: 10,
            backgroundColor: "#22c55e",
            paddingHorizontal: 16,
            borderRadius: 12,
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#04110a", fontWeight: "800" }}>Post</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const FeedTab = () => (
    <>
      {status ? (
        <View
          style={{
            backgroundColor: "#0f172a",
            borderRadius: 14,
            padding: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: "rgba(34,197,94,0.25)",
          }}
        >
          <Text style={{ color: "#22c55e", fontWeight: "700" }}>{status}</Text>
        </View>
      ) : null}

      {alerts.length > 0 && (
        <View
          style={{
            backgroundColor: "#1e293b",
            padding: 14,
            borderRadius: 16,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: "rgba(250,204,21,0.2)",
          }}
        >
          <Text
            style={{
              color: "#facc15",
              fontWeight: "800",
              marginBottom: 8,
              fontSize: 15,
            }}
          >
            🚨 Active Alerts
          </Text>

          {alerts.slice(0, 3).map((a) => (
            <View
              key={a.id}
              style={{
                backgroundColor: "#0f172a",
                borderRadius: 12,
                padding: 10,
                marginBottom: 8,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                {a.ticker} mentioned
              </Text>
              <Text style={{ color: "#cbd5e1", marginTop: 3 }}>
                {a.content}
              </Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        onPress={() => setShowControls(!showControls)}
        style={{
          backgroundColor: "#0b1220",
          borderRadius: 14,
          padding: 14,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "800", textAlign: "center" }}>
          {showControls ? "Hide Controls" : "Show Controls"}
        </Text>
      </TouchableOpacity>

      {showControls ? <FeedControls /> : null}

      <FlatList
        data={filteredPosts}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          const expanded = expandedPostId === item.id;
          const summary = summarizeContent(item.content || "");

          return (
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() =>
                setExpandedPostId(expanded ? null : item.id)
              }
              style={{
                backgroundColor: "#0b1220",
                padding: 16,
                borderRadius: 18,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: expanded
                  ? "rgba(34,197,94,0.35)"
                  : "rgba(255,255,255,0.08)",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text
                    style={{
                      color: "#fff",
                      fontWeight: "800",
                      fontSize: 15,
                    }}
                  >
                    {item.author}
                  </Text>
                </View>

                <View
                  style={{
                    backgroundColor: "#111827",
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 999,
                  }}
                >
                  <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "700" }}>
                    {item.source}
                  </Text>
                </View>
              </View>

              <Text
                style={{
                  color: "#d1d5db",
                  marginTop: 4,
                  lineHeight: 20,
                  fontSize: 14,
                }}
              >
                {item.content}
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
                {(item.tickers || []).map((t) =>
                  renderTag(`$${t}`, "#14532d")
                )}
                {(item.metals || []).map((m) =>
                  renderTag(m, "#7c2d12")
                )}
                {item.personType === "politician" &&
                  renderTag("politician", "#1d4ed8")}
                {item.personType === "influencer" &&
                  renderTag("influencer", "#6d28d9")}
              </View>

              <Text
                style={{
                  color: "#60a5fa",
                  marginTop: 10,
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                {expanded ? "Tap to collapse" : "Tap for summary"}
              </Text>

              {expanded ? (
                <View
                  style={{
                    backgroundColor: "#111827",
                    borderRadius: 14,
                    padding: 12,
                    marginTop: 10,
                  }}
                >
                  <Text
                    style={{
                      color: "#f8fafc",
                      fontWeight: "800",
                      marginBottom: 6,
                    }}
                  >
                    Quick Summary
                  </Text>
                  <Text style={{ color: "#cbd5e1", lineHeight: 20 }}>
                    {summary}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </>
  );

  const PremiumTab = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
      <View
        style={{
          backgroundColor: "#0b1220",
          borderRadius: 18,
          padding: 18,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: "rgba(250,204,21,0.22)",
        }}
      >
        <Text style={{ color: "#facc15", fontSize: 24, fontWeight: "800" }}>
          StockPulse Pro
        </Text>
        <Text style={{ color: "#cbd5e1", marginTop: 8, lineHeight: 20 }}>
          Unlock real-time signal tools, advanced alerts, and premium tracking for serious market users.
        </Text>

        <Text style={{ color: "#fff", fontSize: 30, fontWeight: "900", marginTop: 16 }}>
          $19/mo
        </Text>
        <Text style={{ color: "#8b9bb7", marginTop: 4 }}>
          Designed for active traders and market watchers
        </Text>

        <TouchableOpacity
          onPress={openCheckout}
          disabled={checkoutLoading}
          style={{
            backgroundColor: "#facc15",
            padding: 14,
            borderRadius: 14,
            marginTop: 18,
            opacity: checkoutLoading ? 0.7 : 1,
          }}
        >
          <Text
            style={{
              color: "#111827",
              textAlign: "center",
              fontWeight: "900",
              fontSize: 15,
            }}
          >
            {checkoutLoading ? "Opening checkout..." : "Start Subscription"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => refreshPremiumStatus()}
          style={{
            backgroundColor: "#111827",
            padding: 12,
            borderRadius: 12,
            marginTop: 12,
          }}
        >
          <Text
            style={{
              color: "#fff",
              textAlign: "center",
              fontWeight: "800",
            }}
          >
            Refresh Premium Status
          </Text>
        </TouchableOpacity>
      </View>

      {[
        "Unlimited ticker alerts",
        "Politician-only alert streams",
        "Influencer mention alerts",
        "Priority signal feed",
        "Advanced metals tracking",
        "Premium market dashboards",
      ].map((feature) => (
        <View
          key={feature}
          style={{
            backgroundColor: "#0b1220",
            borderRadius: 16,
            padding: 14,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>✓ {feature}</Text>
        </View>
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#050816" }}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#050816" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 18 }}>
          <HeaderCard />

          <View
            style={{
              flexDirection: "row",
              backgroundColor: "#0b1220",
              borderRadius: 16,
              padding: 6,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            {[
              { key: "feed", label: "Feed" },
              { key: "premium", label: "Premium" },
            ].map((tab) => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key as "feed" | "premium")}
                style={{
                  flex: 1,
                  backgroundColor:
                    activeTab === tab.key ? "#22c55e" : "transparent",
                  paddingVertical: 10,
                  borderRadius: 12,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: activeTab === tab.key ? "#04110a" : "#fff",
                    fontWeight: "800",
                  }}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === "feed" ? <FeedTab /> : <PremiumTab />}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}