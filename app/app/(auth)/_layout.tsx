import { Stack } from "expo-router";
import { C } from "../../src/theme";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }} />;
}
