import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../src/theme";

const icon = (name: any) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} size={size} color={color} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.saffron,
        tabBarInactiveTintColor: C.dim,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.line, height: 62, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: "Manrope_600SemiBold", fontSize: 11 },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home") }} />
      <Tabs.Screen name="add" options={{ title: "Add", tabBarIcon: icon("add-circle") }} />
      <Tabs.Screen name="report" options={{ title: "Report", tabBarIcon: icon("pie-chart") }} />
      <Tabs.Screen name="settings" options={{ title: "You", tabBarIcon: icon("person") }} />
    </Tabs>
  );
}
