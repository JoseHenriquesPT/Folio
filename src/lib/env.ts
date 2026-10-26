export type AppEnv = {
  supabaseUrl: string;
  supabaseKey: string;
};

export type EnvResult =
  | { ok: true; env: AppEnv }
  | { ok: false; problems: string[] };

type EnvSource = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function readEnv(source: EnvSource): EnvResult {
  const problems: string[] = [];
  const rawUrl = source.VITE_SUPABASE_URL?.trim() ?? "";
  const key = source.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

  let url: URL | null = null;

  if (!rawUrl) {
    problems.push("VITE_SUPABASE_URL is missing.");
  } else {
    try {
      const parsed = new URL(rawUrl);
      const isHttp = parsed.protocol === "http:";
      const isHttps = parsed.protocol === "https:";
      const isLocal = LOCAL_HOSTS.has(parsed.hostname);

      if (!isHttps && !(isHttp && isLocal)) {
        problems.push(
          "VITE_SUPABASE_URL must use https, except for a localhost development URL."
        );
      } else if (parsed.username || parsed.password) {
        problems.push("VITE_SUPABASE_URL must not contain credentials.");
      } else {
        url = parsed;
      }
    } catch {
      problems.push("VITE_SUPABASE_URL is not a valid URL.");
    }
  }

  if (!key) {
    problems.push("VITE_SUPABASE_PUBLISHABLE_KEY is missing.");
  } else if (key.length < 20) {
    problems.push("VITE_SUPABASE_PUBLISHABLE_KEY looks too short.");
  }

  if (problems.length > 0 || !url) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    env: { supabaseUrl: url.origin, supabaseKey: key },
  };
}
