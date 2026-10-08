import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Native: Keychain / Android Keystore. Web: localStorage (protected by the strict CSP in
// deploy/nginx-paisa.conf; see README "Known limits" for the cookie-based hardening path).
export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web") return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  async del(key: string): Promise<void> {
    if (Platform.OS === "web") localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};
