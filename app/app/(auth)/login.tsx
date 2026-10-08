import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth";
import { friendly, ApiError } from "../../src/api";
import { Btn, ErrorText, Field, H1, Screen, Sub, font } from "../../src/components/ui";
import { C, GRADIENT } from "../../src/theme";

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const { login, googleLogin } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const idToken = response.params.id_token;
      setBusy(true);
      googleLogin(idToken).catch((e) => setError(friendly(e))).finally(() => setBusy(false));
    }
  }, [response]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await login(email.trim(), password);
    } catch (e) {
      if (e instanceof ApiError && e.code === "email_not_verified") router.push({ pathname: "/(auth)/verify", params: { email: email.trim(), resend: "1" } });
      else setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ alignItems: "center", marginTop: 24, marginBottom: 28 }}>
        <LinearGradient colors={GRADIENT} style={{ width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="navigate" size={32} color="#fff" />
        </LinearGradient>
        <Text style={{ color: C.text, fontSize: 30, fontFamily: font.xbold, marginTop: 16 }}>PaisaPilot</Text>
        <Sub style={{ marginTop: 4 }}>Har rupay ka hisaab, AI ke saath.</Sub>
      </View>
      <H1>Welcome back</H1>
      <View style={{ height: 18 }} />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
      <ErrorText msg={error} />
      <Btn title="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
      <Btn kind="ghost" title="Continue with Google" onPress={() => promptAsync()} disabled={!request || busy} icon={<Ionicons name="logo-google" size={18} color="#fff" />} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 18 }}>
        <Link href="/(auth)/forgot" style={{ color: C.saffron, fontFamily: font.semi }}>Forgot password?</Link>
        <Link href="/(auth)/register" style={{ color: C.saffron, fontFamily: font.semi }}>Create account</Link>
      </View>
    </Screen>
  );
}
