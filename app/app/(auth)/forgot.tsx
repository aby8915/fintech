import React, { useState } from "react";
import { useRouter } from "expo-router";
import { friendly, post } from "../../src/api";
import { Btn, ErrorText, Field, H1, Screen, Sub } from "../../src/components/ui";

export default function Forgot() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>Reset password</H1>
      {step === "email" ? (
        <>
          <Sub style={{ marginVertical: 8, marginBottom: 20 }}>Enter your email. If an account exists, we'll send a 6-digit code.</Sub>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <ErrorText msg={error} />
          <Btn title="Send code" loading={busy} disabled={!email} onPress={() => run(async () => { await post("/auth/password/forgot", { email: email.trim() }, false); setStep("reset"); })} />
        </>
      ) : (
        <>
          <Sub style={{ marginVertical: 8, marginBottom: 20 }}>Enter the code from your email and choose a new password. You'll be signed out on all devices.</Sub>
          <Field label="6-digit code" value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
          <Field label="New password (10+ characters)" value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
          <ErrorText msg={error} />
          <Btn title="Update password" loading={busy} disabled={otp.length !== 6 || pw.length < 10} onPress={() => run(async () => { await post("/auth/password/reset", { email: email.trim(), otp, new_password: pw }, false); router.replace("/(auth)/login"); })} />
        </>
      )}
    </Screen>
  );
}
