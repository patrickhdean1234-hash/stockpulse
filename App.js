import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from "react-native";

export default function App() {
  const [text, setText] = useState("");

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#000" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={{ flex: 1, padding: 20, paddingTop: 60 }}>
        <Text style={{ color: "#fff", fontSize: 28, fontWeight: "bold", marginBottom: 14 }}>
          StockPulse
        </Text>

        <Text style={{ color: "#aaa", marginBottom: 14 }}>
          First test screen
        </Text>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Tap here and type..."
          placeholderTextColor="#666"
          style={{
            backgroundColor: "#111",
            color: "#fff",
            paddingHorizontal: 12,
            paddingVertical: 12,
            borderRadius: 10,
            marginBottom: 14
          }}
        />

        <TouchableOpacity
          style={{
            backgroundColor: "#22c55e",
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: "center"
          }}
        >
          <Text style={{ color: "#000", fontWeight: "bold" }}>Button Test</Text>
        </TouchableOpacity>

        <Text style={{ color: "#888", marginTop: 20 }}>
          You typed: {text}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}