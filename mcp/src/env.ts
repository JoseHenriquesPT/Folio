export interface McpEnv {
  supabaseUrl: string;
  anonKey: string;
  token: string;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function readMcpEnv(
  source: NodeJS.ProcessEnv = process.env
): McpEnv {
  const rawUrl = source.FOLIO_SUPABASE_URL?.trim() ?? "";
  const anonKey = source.FOLIO_SUPABASE_ANON_KEY?.trim() ?? "";
  const token = source.FOLIO_TOKEN?.trim() ?? "";
  const problems: string[] = [];

  let url: URL | null = null;

  if (!rawUrl) {
    problems.push("FOLIO_SUPABASE_URL is missing.");
  } else {
    try {
      const parsed = new URL(rawUrl);
      const isHttps = parsed.protocol === "https:";
      const isLocalHttp =
        parsed.protocol === "http:" && LOCAL_HOSTS.has(parsed.hostname);

      if (!isHttps && !isLocalHttp) {
        problems.push(
          "FOLIO_SUPABASE_URL must use https, except for a localhost development URL."
        );
      } else if (parsed.username || parsed.password) {
        problems.push("FOLIO_SUPABASE_URL must not contain credentials.");
      } else {
        url = parsed;
      }
    } catch {
      problems.push("FOLIO_SUPABASE_URL is not a valid URL.");
    }
  }

  if (!anonKey) {
    problems.push("FOLIO_SUPABASE_ANON_KEY is missing.");
  } else if (anonKey.length < 20) {
    problems.push("FOLIO_SUPABASE_ANON_KEY looks too short.");
  }

  if (!token) {
    problems.push("FOLIO_TOKEN is missing.");
  } else if (!token.startsWith("folio_pat_")) {
    problems.push("FOLIO_TOKEN must start with folio_pat_.");
  }

  if (problems.length > 0 || !url) {
    throw new Error(`Folio MCP configuration: ${problems.join(" ")}`);
  }

  return {
    supabaseUrl: url.origin,
    anonKey,
    token,
  };
}
