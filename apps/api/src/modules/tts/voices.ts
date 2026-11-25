/**
 * The voices editors can choose, and how many characters are left this month. Only US and UK voices labelled
 * male or female are offered, because those are the tags learners see ("Woman · UK"). Listing voices is free;
 * generating speech happens in the Python worker (AGENTS.md §8), never here.
 */
export type Voice = {
  id: string;
  name: string;
  gender: "male" | "female";
  accent: "us" | "uk";
  previewUrl: string | null;
};
export type Usage = { charactersUsed: number; charactersLimit: number } | null;

export type VoiceCatalog = {
  provider: string;
  voices(): Promise<Voice[]>;
  usage(): Promise<Usage>;
};

const ACCENTS: Record<string, "us" | "uk"> = { american: "us", british: "uk", us: "us", uk: "uk", english: "uk" };

type ElevenLabsVoice = { voice_id: string; name: string; preview_url?: string | null; labels?: Record<string, string> };

export function elevenLabsCatalog(apiKey: string, fetcher: typeof fetch = fetch): VoiceCatalog {
  let cached: { at: number; voices: Voice[] } | null = null;
  const get = async (path: string) => {
    const res = await fetcher(`https://api.elevenlabs.io${path}`, {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`ElevenLabs answered ${res.status}`);
    return res.json() as Promise<unknown>;
  };
  return {
    provider: "elevenlabs",
    async voices() {
      if (cached && Date.now() - cached.at < 10 * 60_000) return cached.voices;
      const body = (await get("/v1/voices")) as { voices?: ElevenLabsVoice[] };
      const voices = (body.voices ?? []).flatMap((v): Voice[] => {
        const gender = v.labels?.["gender"];
        const accent = ACCENTS[(v.labels?.["accent"] ?? "").toLowerCase()];
        if ((gender !== "male" && gender !== "female") || !accent) return [];
        return [{ id: v.voice_id, name: v.name, gender, accent, previewUrl: v.preview_url ?? null }];
      });
      cached = { at: Date.now(), voices };
      return voices;
    },
    async usage() {
      try {
        const s = (await get("/v1/user/subscription")) as { character_count?: number; character_limit?: number };
        return typeof s.character_count === "number" && typeof s.character_limit === "number"
          ? { charactersUsed: s.character_count, charactersLimit: s.character_limit }
          : null;
      } catch {
        return null; // keys limited to text-to-speech may not read the subscription: just don't show it
      }
    },
  };
}

/** Stand-in voices for tests and for running without a key: the worker's fake provider makes silent audio. */
export const fakeCatalog: VoiceCatalog = {
  provider: "fake",
  voices: async () => [
    { id: "fake-woman-uk", name: "Test voice (woman, UK)", gender: "female", accent: "uk", previewUrl: null },
    { id: "fake-man-uk", name: "Test voice (man, UK)", gender: "male", accent: "uk", previewUrl: null },
    { id: "fake-woman-us", name: "Test voice (woman, US)", gender: "female", accent: "us", previewUrl: null },
    { id: "fake-man-us", name: "Test voice (man, US)", gender: "male", accent: "us", previewUrl: null },
  ],
  usage: async () => null,
};

export const trackLabel = (gender: string, accent: string) =>
  `${gender === "female" ? "Woman" : "Man"} · ${accent.toUpperCase()}`;
