import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, GRADIENT } from "../theme";

export const font = { reg: "Manrope_500Medium", semi: "Manrope_600SemiBold", bold: "Manrope_700Bold", xbold: "Manrope_800ExtraBold" };

export function Screen({ children, scroll = true, pad = true }: { children: React.ReactNode; scroll?: boolean; pad?: boolean }) {
  const insets = useSafeAreaInsets();
  const body = { paddingTop: insets.top + 12, paddingHorizontal: pad ? 20 : 0, paddingBottom: 40, maxWidth: 560, width: "100%" as const, alignSelf: "center" as const };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : (
        <View style={[body, { flex: 1 }]}>{children}</View>
      )}
    </View>
  );
}

export const H1 = ({ children }: { children: React.ReactNode }) => <Text style={{ color: C.text, fontSize: 28, fontFamily: font.xbold, letterSpacing: -0.5 }}>{children}</Text>;
export const Sub = ({ children, style }: { children: React.ReactNode; style?: any }) => <Text style={[{ color: C.dim, fontSize: 14, fontFamily: font.reg, lineHeight: 20 }, style]}>{children}</Text>;
export const Label = ({ children }: { children: React.ReactNode }) => <Text style={{ color: C.dim, fontSize: 12, fontFamily: font.semi, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>{children}</Text>;

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ backgroundColor: C.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.line, marginBottom: 14 }, style]}>{children}</View>;
}

export function Btn({ title, onPress, loading, kind = "primary", disabled, icon }: { title: string; onPress: () => void; loading?: boolean; kind?: "primary" | "ghost" | "danger"; disabled?: boolean; icon?: React.ReactNode }) {
  const off = disabled || loading;
  const inner = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 }}>
      {loading ? <ActivityIndicator color={kind === "primary" ? "#fff" : C.text} /> : icon}
      <Text style={{ color: kind === "danger" ? C.red : "#fff", fontFamily: font.bold, fontSize: 16 }}>{title}</Text>
    </View>
  );
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => ({ opacity: off ? 0.5 : pressed ? 0.85 : 1, marginVertical: 6 })}>
      {kind === "primary" ? (
        <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 16 }}>{inner}</LinearGradient>
      ) : (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: kind === "danger" ? C.red : C.line, backgroundColor: C.card }}>{inner}</View>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor="#5F6B99"
        accessibilityLabel={label}
        {...rest}
        style={[{ backgroundColor: C.card, color: C.text, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, fontFamily: font.reg }, style]}
      />
    </View>
  );
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, marginRight: 8, marginBottom: 8, backgroundColor: active ? (color ?? C.saffron) : C.card, borderWidth: 1, borderColor: active ? "transparent" : C.line }}>
      <Text style={{ color: active ? "#0B1020" : C.text, fontFamily: font.semi, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export const ErrorText = ({ msg }: { msg: string }) => (msg ? <Text accessibilityRole="alert" style={{ color: C.red, fontFamily: font.semi, marginVertical: 8 }}>{msg}</Text> : null);

export const s = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center" } });
