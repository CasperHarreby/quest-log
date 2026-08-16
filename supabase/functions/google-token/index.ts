import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Supabase Edge Functions don't add CORS headers automatically — without
// these, the browser blocks the response before our function code (and its
// own JWT check) is ever relevant, since the actual security boundary is
// the Supabase JWT check below, not CORS.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function exchangeWithGoogle(params: Record<string, string>) {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await resp.json();
  return { ok: resp.ok, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "missing authorization" }, 401);

  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "invalid session" }, 401);
  const userId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_e) {
    body = {};
  }

  // ---- One-time path: exchange an authorization code for tokens ----
  if (typeof body.code === "string" && body.code) {
    const { ok, data } = await exchangeWithGoogle({
      code: body.code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: typeof body.redirectUri === "string" ? body.redirectUri : "",
      grant_type: "authorization_code",
    });
    if (!ok) return json({ error: "google_exchange_failed", detail: data }, 400);
    if (!data.refresh_token) {
      return json({ error: "no_refresh_token", detail: data }, 400);
    }
    const { error: upsertErr } = await admin.from("google_tokens").upsert({
      user_id: userId,
      refresh_token: data.refresh_token,
      updated_at: new Date().toISOString(),
    });
    if (upsertErr) return json({ error: "storage_failed", detail: upsertErr.message }, 500);
    return json({ access_token: data.access_token, expires_in: data.expires_in });
  }

  // ---- Ordinary path: mint a fresh access token from the stored refresh token ----
  const { data: row, error: rowErr } = await admin
    .from("google_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (rowErr) return json({ error: "lookup_failed", detail: rowErr.message }, 500);
  if (!row) return json({ connected: false });

  const { ok, data } = await exchangeWithGoogle({
    refresh_token: row.refresh_token,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  if (!ok) {
    if (data.error === "invalid_grant") {
      await admin.from("google_tokens").delete().eq("user_id", userId);
      return json({ connected: false });
    }
    return json({ error: "google_refresh_failed", detail: data }, 400);
  }
  return json({ access_token: data.access_token, expires_in: data.expires_in });
});
