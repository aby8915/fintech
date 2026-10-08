import React, { useState } from "react";
import { Alert, Platform, Text } from "react-native";
import { useAuth } from "../../src/auth";
import { Btn, Card, H1, Label, Screen, Sub, font } from "../../src/components/ui";
import { C } from "../../src/theme";

export default function Settings() {
  const { me, logout, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);

  const confirmDelete = () => {
    const go = async () => { setBusy(true); try { await deleteAccount(); } finally { setBusy(false); } };
    const msg = "This permanently deletes your account and every expense. It can't be undone.";
    if (Platform.OS === "web") { if (window.confirm(msg)) go(); }
    else Alert.alert("Delete account?", msg, [{ text: "Cancel", style: "cancel" }, { text: "Delete everything", style: "destructive", onPress: go }]);
  };

  return (
    <Screen>
      <H1>You</H1>
      <Card style={{ marginTop: 16 }}>
        <Text style={{ color: C.text, fontFamily: font.bold, fontSize: 18 }}>{me?.name}</Text>
        <Sub>{me?.email}</Sub>
      </Card>
      <Label>Privacy</Label>
      <Card>
        <Sub>• Your name, email, amounts, merchants and notes are encrypted (AES-256-GCM) before they reach the database.{"\n"}• Voice is converted to text on your device. Only the text is sent to AI.{"\n"}• Receipt photos are read once and discarded.{"\n"}• AI summaries use category totals only — no names or notes.</Sub>
      </Card>
      <Btn kind="ghost" title="Sign out" onPress={logout} />
      <Btn kind="danger" title="Delete my account & data" onPress={confirmDelete} loading={busy} />
    </Screen>
  );
}
