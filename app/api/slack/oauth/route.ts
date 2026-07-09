import { NextResponse } from "next/server";
import { WebClient } from "@slack/web-api";
import { setSlackInstall } from "@/lib/backoffice/store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!code || !clientId || !clientSecret) {
    return NextResponse.json({ error: "Missing code or Slack app credentials" }, { status: 400 });
  }

  const origin = process.env.APP_BASE_URL ?? url.origin;
  const redirectUri = `${origin}/api/slack/oauth`;

  try {
    const res = await new WebClient().oauth.v2.access({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const botToken = res.access_token;
    const teamId = res.team?.id;
    const botUserId = res.bot_user_id;
    if (!botToken || !teamId || !botUserId) {
      throw new Error("Incomplete OAuth response");
    }
    await setSlackInstall({ teamId, botToken, botUserId });
    return NextResponse.redirect(`${origin}/registry?slack=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/registry?slack=error`);
  }
}
