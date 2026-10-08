import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/auth";
import { call } from "../../src/api";
import { useMonthExpenses } from "../../src/useExpenses";
import { Card, H1, Label, Screen, Sub, font } from "../../src/components/ui";
import { C, CAT_COLORS, CAT_ICON, GRADIENT, inr, thisMonth } from "../../src/theme";

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? "Suprabhat" : h < 17 ? "Namaste" : "Shubh sandhya";
};

export default function Home() {
  const { me } = useAuth();
  const router = useRouter();
  const month = thisMonth();
  const { items, error, reload } = useMonthExpenses(month);

  const { total, top } = useMemo(() => {
    const by: Record<string, number> = {};
    let t = 0;
    (items ?? []).forEach((e) => { t += e.amount_minor; by[e.category] = (by[e.category] ?? 0) + e.amount_minor; });
    return { total: t, top: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3) };
  }, [items]);

  const remove = async (id: string) => { await call(`/expenses/${id}`, { method: "DELETE" }); reload(); };

  return (
    <Screen>
      <Sub>{greet()},</Sub>
      <H1>{me?.name?.split(" ")[0] ?? "there"} 👋</H1>
      <View style={{ height: 18 }} />
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontFamily: font.semi, fontSize: 13 }}>This month's kharcha</Text>
        <Text style={{ color: "#fff", fontFamily: font.xbold, fontSize: 38, marginTop: 4, letterSpacing: -1 }}>{items ? inr(total) : "…"}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {top.map(([c, a]) => (
            <View key={c} style={{ backgroundColor: "rgba(11,16,32,0.35)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
              <Text style={{ color: "#fff", fontFamily: font.semi, fontSize: 12 }}>{c} · {inr(a, true)}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <Label>Recent</Label>
      {error ? <Sub>Couldn't load. Pull to retry by switching tabs.</Sub> : null}
      {items && items.length === 0 ? (
        <Card><Sub>No expenses yet this month. Tap Add to log your first one — type it, say it, or snap the bill.</Sub></Card>
      ) : null}
      {(items ?? []).slice(0, 12).map((e) => (
        <Card key={e.id} style={{ flexDirection: "row", alignItems: "center", padding: 12, marginBottom: 10 }}>
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: (CAT_COLORS[e.category] ?? C.dim) + "33", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
            <Ionicons name={(CAT_ICON[e.category] ?? "ellipsis-horizontal") as any} size={20} color={CAT_COLORS[e.category]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: C.text, fontFamily: font.bold, fontSize: 15 }}>{e.merchant || e.category}</Text>
            <Text style={{ color: C.dim, fontFamily: font.reg, fontSize: 12 }}>{e.category} · {e.expense_date}{e.source !== "manual" ? ` · ${e.source}` : ""}</Text>
          </View>
          <Text style={{ color: C.text, fontFamily: font.bold, fontSize: 15, marginRight: 10 }}>{inr(e.amount_minor)}</Text>
          <Pressable onPress={() => remove(e.id)} accessibilityLabel="Delete expense" hitSlop={10}>
            <Ionicons name="trash-outline" size={18} color={C.dim} />
          </Pressable>
        </Card>
      ))}
      <Pressable onPress={() => router.push("/(tabs)/add")} accessibilityRole="button" style={{ alignSelf: "center", marginTop: 8 }}>
        <Text style={{ color: C.saffron, fontFamily: font.bold }}>+ Add expense</Text>
      </Pressable>
    </Screen>
  );
}
