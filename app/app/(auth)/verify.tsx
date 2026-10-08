import React, { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../../src/auth";
import { friendly, post } from "../../src/api";
import { Btn, ErrorText, Field, H1, Screen, Sub } from "../../src/components/ui";

export default function Verify() {
  const { email, resend } = useLocalSearchParams<{ email: string; resend?: string }>();
  const { verifyEmail } = useAuth();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (resend) post("/auth/resend-verification", { email }, false).catch(() => {});
  }, [resend, email]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await verifyEmail(email!, otp);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>Check your email</H1>
      <Sub style={{ marginVertical: 8, marginBottom: 20 }}>We sent a 6-digit code to {email}. It expires in 10 minutes.</Sub>
      <Field label="6-digit code" value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} />
      <ErrorText msg={error} />
      <Btn title="Verify & continue" onPress={submit} loading={busy} disabled={otp.length !== 6} />
      <Btn kind="ghost" title="Resend code" onPress={() => post("/auth/resend-verification", { email }, false).then(() => setNote("A new code is on its way."), () => setNote("Please wait a bit before retrying."))} />
      {note ? <Sub style={{ textAlign: "center", marginTop: 8 }}>{note}</Sub> : null}
    </Screen>
  );
}
