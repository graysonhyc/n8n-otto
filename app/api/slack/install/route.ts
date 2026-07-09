import { NextResponse } from "next/server";

const SCOPES = ["channels:read", "groups:read", "chat:write"];

export async function GET(request: Request) {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "SLACK_CLIENT_ID not configured" }, { status: 500 });
  }
  const origin = process.env.APP_BASE_URL ?? new URL(request.url).origin;
  const redirectUri = `${origin}/api/slack/oauth`;

  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.redirect(url.toString());
}
