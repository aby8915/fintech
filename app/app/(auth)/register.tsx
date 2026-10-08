import React, { useState } from "react";
import { Link, useRouter } from "expo-router";
import { useAuth } from "../../src/auth";
import { friendly } from "../../src/api";
import { Btn, ErrorText, Field, H1, Screen, Sub, font } from "../../src/components/ui";
import { C } from "../../src/theme";

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await register(name.trim(), email.trim(), password);
      router.push({ pathname: "/(auth)/verify", params: { email: email.trim() } });
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>Create your account</H1>
      <Sub style={{ marginVertical: 8, marginBottom: 20 }}>Your data is encrypted before it is stored. We'll email a 6-digit code to confirm it's you.</Sub>
      <Field label="Name" value={name} onChangeText={setName} autoComplete="name" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Password (10+ characters)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <ErrorText msg={error} />
      <Btn title="Continue" onPress={submit} loading={busy} disabled={!name || !email || password.length < 10} />
      <Link href="/(auth)/login" style={{ color: C.saffron, fontFamily: font.semi, marginTop: 16, textAlign: "center" }}>I already have an account</Link>
    </Screen>
  );
}
