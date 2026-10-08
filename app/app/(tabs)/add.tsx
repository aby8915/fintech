import React, { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ApiError, friendly, post, uploadReceipt } from "../../src/api";
import { listenOnce, stopListening } from "../../src/voice";
import { Btn, Card, Chip, ErrorText, Field, H1, Label, Screen, Sub, font } from "../../src/components/ui";
import { C, CATEGORIES, CAT_COLORS, isoDaysAgo, isoToday } from "../../src/theme";

type Source = "manual" | "voice" | "receipt";

export default function Add() {
  const router = useRouter();
  const [quick, setQuick] = useState("");
  const [lang, setLang] = useState<"en-IN" | "hi-IN">("en-IN");
  const [listening, setListening] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Other");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(isoToday());
  const [source, setSource] = useState<Source>("manual");

  const applyDraft = (d: any, src: Source) => {
    setAmount(String(d.amount_minor / 100));
    setCategory(d.category);
    setMerchant(d.merchant ?? "");
    setNote(d.note ?? "");
    setDate(d.expense_date);
    setSource(src);
  };

  const guard = async (fn: () => Promise<void>) => {
    setError("");
    setAiBusy(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e instanceof ApiError ? friendly(e) : e?.message === "mic_denied" ? "Microphone permission is needed for voice." : e?.message === "no_speech" ? "Didn't catch that. Try again." : friendly(e));
    } finally {
      setAiBusy(false);
      setListening(false);
    }
  };

  const parseText = (text: string, src: Source) => guard(async () => applyDraft(await post("/expenses/parse-text", { text }), src));

  const speak = async () => {
    if (listening) return stopListening();
    setListening(true);
    setError("");
    try {
      const text = await listenOnce(lang, setQuick);
      setQuick(text);
      await parseText(text, "voice");
    } catch (e: any) {
      setListening(false);
      setError(e?.message === "mic_denied" ? "Microphone permission is needed for voice." : "Didn't catch that. Try again.");
    }
  };

  const scan = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError("Camera permission is needed to scan receipts.");
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6, mediaTypes: ["images"] });
    if (res.canceled) return;
    await guard(async () => applyDraft(await uploadReceipt(res.assets[0].uri), "receipt"));
  };

  const save = async () => {
    const rupees = Number(amount);
    if (!(rupees > 0)) return setError("Enter an amount greater than 0.");
    setSaving(true);
    setError("");
    try {
      await post("/expenses", {
        amount_minor: Math.round(rupees * 100), category, expense_date: date,
        merchant: merchant.trim() || null, note: note.trim() || null, source,
      });
      setAmount(""); setMerchant(""); setNote(""); setQuick(""); setCategory("Other"); setDate(isoToday()); setSource("manual");
      router.navigate("/(tabs)");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <H1>Add expense</H1>
      <Sub style={{ marginTop: 6, marginBottom: 16 }}>Say it, type it, or snap the bill — AI fills the form, you confirm.</Sub>

      <Card>
        <Field label='Quick entry — "Zomato 450 kal raat"' value={quick} onChangeText={setQuick} placeholder="Chai 30, auto 120 yesterday…" maxLength={500} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Btn kind="ghost" title="Fill with AI" onPress={() => parseText(quick, "manual")} disabled={quick.trim().length < 2 || aiBusy} loading={aiBusy && !listening} icon={<Ionicons name="sparkles" size={16} color={C.saffron} />} /></View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Btn kind="ghost" title={listening ? "Stop" : "Speak"} onPress={speak} icon={<Ionicons name={listening ? "stop-circle" : "mic"} size={18} color={listening ? C.red : C.saffron} />} /></View>
          <View style={{ flex: 1 }}><Btn kind="ghost" title="Scan bill" onPress={scan} disabled={aiBusy} icon={<Ionicons name="camera" size={18} color={C.saffron} />} /></View>
        </View>
        <View style={{ flexDirection: "row", marginTop: 6 }}>
          <Chip label="English" active={lang === "en-IN"} onPress={() => setLang("en-IN")} />
          <Chip label="हिन्दी / Hinglish" active={lang === "hi-IN"} onPress={() => setLang("hi-IN")} />
        </View>
      </Card>

      <Label>Details</Label>
      <Field label="Amount (₹)" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, "").slice(0, 12))} keyboardType="decimal-pad" placeholder="0" style={{ fontSize: 26, fontFamily: font.xbold }} />
      <Label>Category</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
        {CATEGORIES.map((c) => <Chip key={c} label={c} active={category === c} color={CAT_COLORS[c]} onPress={() => setCategory(c)} />)}
      </View>
      <Field label="Merchant / paid to" value={merchant} onChangeText={setMerchant} maxLength={120} />
      <Label>Date</Label>
      <View style={{ flexDirection: "row", marginBottom: 6 }}>
        <Chip label="Today" active={date === isoToday()} onPress={() => setDate(isoToday())} />
        <Chip label="Yesterday" active={date === isoDaysAgo(1)} onPress={() => setDate(isoDaysAgo(1))} />
      </View>
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} maxLength={10} />
      <Field label="Note" value={note} onChangeText={setNote} maxLength={500} placeholder="Optional" />
      <ErrorText msg={error} />
      <Btn title="Save expense" onPress={save} loading={saving} disabled={!amount} />
      <Text style={{ color: C.dim, fontFamily: font.reg, fontSize: 12, textAlign: "center", marginTop: 8 }}>🔒 Details are encrypted before storage. Receipt photos are never saved.</Text>
    </Screen>
  );
}
