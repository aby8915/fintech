import React, { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { call, friendly } from "../../src/api";
import { DailyBars, Delta, Donut } from "../../src/components/charts";
import { Btn, Card, ErrorText, H1, Label, Screen, Sub, font } from "../../src/components/ui";
import { C, CAT_COLORS, inr, thisMonth } from "../../src/theme";

type Report = {
  month: string; total_minor: number; count: number; change_pct: number | null; avg_per_day_minor: number;
  categories: { category: string; amount_minor: number; pct: number; prev_minor: number }[];
  daily: { day: number; amount_minor: number }[];
  top_merchants: { merchant: string; amount_minor: number }[];
  biggest: { category: string; amount_minor: number; date: string } | null;
  savings: { title: string; detail: string; est_saving_minor: number }[];
  ai_tips: string[] | null;
};

const shift = (m: string, d: number) => {
  const [y, mo] = m.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1 + d, 1));
  return dt.toISOString().slice(0, 7);
};
const label = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export default function ReportScreen() {
  const [month, setMonth] = useState(thisMonth());
  const [rep, setRep] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(async (m: string, ai = false) => {
    setError("");
    try {
      setRep(await call<Report>(`/reports/monthly?month=${m}${ai ? "&ai=1" : ""}`));
    } catch (e) {
      setError(friendly(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(month); }, [load, month]));

  const totalSavings = rep?.savings.reduce((a, s) => a + s.est_saving_minor, 0) ?? 0;

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Pressable onPress={() => setMonth(shift(month, -1))} accessibilityLabel="Previous month" hitSlop={12}><Ionicons name="chevron-back" size={24} color={C.text} /></Pressable>
        <H1>{label(month)}</H1>
        <Pressable onPress={() => month < thisMonth() && setMonth(shift(month, 1))} accessibilityLabel="Next month" hitSlop={12} style={{ opacity: month < thisMonth() ? 1 : 0.3 }}><Ionicons name="chevron-forward" size={24} color={C.text} /></Pressable>
      </View>
      <View style={{ height: 16 }} />
      <ErrorText msg={error} />

      {rep && rep.count === 0 ? <Card><Sub>No expenses in this month yet.</Sub></Card> : null}

      {rep && rep.count > 0 ? (
        <>
          <Card style={{ alignItems: "center" }}>
            <Donut data={rep.categories} total={rep.total_minor} />
            <View style={{ marginTop: 12 }}><Delta pct={rep.change_pct} /></View>
            <View style={{ flexDirection: "row", marginTop: 16, width: "100%" }}>
              {[["Entries", String(rep.count)], ["Per day", inr(rep.avg_per_day_minor, true)], ["Biggest", rep.biggest ? inr(rep.biggest.amount_minor, true) : "-"]].map(([k, v]) => (
                <View key={k} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ color: C.text, fontFamily: font.xbold, fontSize: 18 }}>{v}</Text>
                  <Text style={{ color: C.dim, fontFamily: font.reg, fontSize: 12 }}>{k}</Text>
                </View>
              ))}
            </View>
          </Card>

          <Label>Where it went</Label>
          <Card>
            {rep.categories.map((c) => (
              <View key={c.category} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ color: C.text, fontFamily: font.semi }}>{c.category}</Text>
                  <Text style={{ color: C.dim, fontFamily: font.semi }}>{inr(c.amount_minor)} · {c.pct}%</Text>
                </View>
                <View style={{ height: 8, backgroundColor: C.cardHi, borderRadius: 4 }}>
                  <View style={{ width: `${Math.min(c.pct, 100)}%`, height: 8, borderRadius: 4, backgroundColor: CAT_COLORS[c.category] ?? C.dim }} />
                </View>
              </View>
            ))}
          </Card>

          <Label>Day by day</Label>
          <Card><DailyBars daily={rep.daily} /></Card>

          {rep.top_merchants.length > 0 ? (
            <>
              <Label>Top spends</Label>
              <Card>
                {rep.top_merchants.map((m) => (
                  <View key={m.merchant} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
                    <Text style={{ color: C.text, fontFamily: font.semi }}>{m.merchant}</Text>
                    <Text style={{ color: C.dim, fontFamily: font.semi }}>{inr(m.amount_minor)}</Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          <Label>Bachat avenues</Label>
          {totalSavings > 0 ? (
            <Card style={{ borderColor: C.green }}>
              <Text style={{ color: C.green, fontFamily: font.xbold, fontSize: 22 }}>Save up to {inr(totalSavings, true)}/month</Text>
              <Sub>Estimated from your own spending patterns.</Sub>
            </Card>
          ) : null}
          {rep.savings.length === 0 ? <Card><Sub>Nothing to trim yet — nicely balanced month.</Sub></Card> : null}
          {rep.savings.map((s) => (
            <Card key={s.title}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: C.text, fontFamily: font.bold, fontSize: 15, flex: 1 }}>{s.title}</Text>
                {s.est_saving_minor > 0 ? <Text style={{ color: C.green, fontFamily: font.bold }}>+{inr(s.est_saving_minor, true)}</Text> : null}
              </View>
              <Sub style={{ marginTop: 4 }}>{s.detail}</Sub>
            </Card>
          ))}

          {rep.ai_tips ? (
            <Card style={{ borderColor: C.saffron }}>
              <Text style={{ color: C.saffron, fontFamily: font.bold, marginBottom: 8 }}>✨ AI coach</Text>
              {rep.ai_tips.map((t, i) => <Text key={i} style={{ color: C.text, fontFamily: font.reg, fontSize: 14, lineHeight: 21, marginBottom: 6 }}>• {t}</Text>)}
            </Card>
          ) : (
            <Btn kind="ghost" title={aiBusy ? "Thinking…" : "Get AI savings tips"} loading={aiBusy} onPress={async () => { setAiBusy(true); await load(month, true); setAiBusy(false); }} icon={<Ionicons name="sparkles" size={16} color={C.saffron} />} />
          )}
        </>
      ) : null}
    </Screen>
  );
}
