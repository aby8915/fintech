import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Rect, Text as SText } from "react-native-svg";
import { C, CAT_COLORS, inr } from "../theme";
import { font } from "./ui";

export function Donut({ data, total, size = 190 }: { data: { category: string; amount_minor: number }[]; total: number; size?: number }) {
  const stroke = 26;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.cardHi} strokeWidth={stroke} fill="none" />
          {total > 0 &&
            data.map((d) => {
              const len = (d.amount_minor / total) * circ;
              const el = (
                <Circle key={d.category} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CAT_COLORS[d.category] ?? C.dim}
                  strokeWidth={stroke} strokeDasharray={`${Math.max(len - 3, 0)} ${circ}`} strokeDashoffset={-offset} strokeLinecap="butt" />
              );
              offset += len;
              return el;
            })}
        </G>
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ color: C.dim, fontSize: 12, fontFamily: font.semi }}>SPENT</Text>
        <Text style={{ color: C.text, fontSize: 22, fontFamily: font.xbold }}>{inr(total, true)}</Text>
      </View>
    </View>
  );
}

export function DailyBars({ daily, height = 110 }: { daily: { day: number; amount_minor: number }[]; height?: number }) {
  const W = 320;
  const max = Math.max(1, ...daily.map((d) => d.amount_minor));
  const bw = W / daily.length;
  return (
    <Svg width="100%" height={height + 18} viewBox={`0 0 ${W} ${height + 18}`} preserveAspectRatio="none">
      {daily.map((d, i) => {
        const h = (d.amount_minor / max) * height;
        return <Rect key={d.day} x={i * bw + 1} y={height - h} width={Math.max(bw - 2, 1)} height={Math.max(h, d.amount_minor ? 2 : 0)} rx={2} fill={d.amount_minor === max ? C.magenta : C.saffron} opacity={d.amount_minor ? 1 : 0.15} />;
      })}
      {[1, Math.ceil(daily.length / 2), daily.length].map((d) => (
        <SText key={d} x={(d - 1) * bw} y={height + 14} fontSize="9" fill={C.dim}>{d}</SText>
      ))}
    </Svg>
  );
}

export function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct > 0;
  return (
    <View style={{ backgroundColor: up ? "rgba(255,107,107,0.15)" : "rgba(45,212,160,0.15)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color: up ? C.red : C.green, fontFamily: font.bold, fontSize: 12 }}>{up ? "▲" : "▼"} {Math.abs(pct)}% vs last month</Text>
    </View>
  );
}
