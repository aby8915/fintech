import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

/**
 * On-device speech-to-text (free; no audio ever leaves the phone). Resolves with the final
 * transcript. `lang`: "en-IN" for English, "hi-IN" also handles Hinglish well.
 */
export async function listenOnce(lang: "en-IN" | "hi-IN", onPartial?: (t: string) => void): Promise<string> {
  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) throw new Error("mic_denied");

  return new Promise<string>((resolve, reject) => {
    let transcript = "";
    const subs = [
      ExpoSpeechRecognitionModule.addListener("result", (e) => {
        transcript = e.results[0]?.transcript ?? transcript;
        onPartial?.(transcript);
      }),
      ExpoSpeechRecognitionModule.addListener("error", (e) => {
        cleanup();
        reject(new Error(e.error));
      }),
      ExpoSpeechRecognitionModule.addListener("end", () => {
        cleanup();
        transcript ? resolve(transcript) : reject(new Error("no_speech"));
      }),
    ];
    const cleanup = () => subs.forEach((s) => s.remove());
    ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: false });
  });
}

export const stopListening = () => ExpoSpeechRecognitionModule.stop();
