import crypto from "node:crypto";
import querystring from "node:querystring";
import { after } from "next/server";
import { getSlackApp } from "@/lib/slack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  Signature verification (same algorithm Slack SDKs use internally) */
/* ------------------------------------------------------------------ */

function verifySlackSignature(
  signingSecret: string,
  rawBody: string,
  headers: Headers
): boolean {
  const ts = headers.get("x-slack-request-timestamp");
  const sig = headers.get("x-slack-signature");
  if (!ts || !sig) return false;

  const fiveMinAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (Number(ts) < fiveMinAgo) return false;

  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(`v0:${ts}:${rawBody}`);
  const computed = `v0=${hmac.digest("hex")}`;

  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(computed));
}

/* ------------------------------------------------------------------ */
/*  Parse Slack's request body into a JS object                       */
/* ------------------------------------------------------------------ */

function parseBody(
  raw: string,
  contentType: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  if (contentType?.includes("application/x-www-form-urlencoded")) {
    const parsed = querystring.parse(raw);
    if (typeof parsed.payload === "string") {
      return JSON.parse(parsed.payload);
    }
    return parsed as Record<string, string>;
  }
  return JSON.parse(raw);
}

/* ------------------------------------------------------------------ */
/*  Route handler                                                     */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const rawBody = await req.text();

  // --- Signature verification ---
  if (!verifySlackSignature(signingSecret, rawBody, req.headers)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const body = parseBody(rawBody, req.headers.get("content-type"));

  // --- SSL check (slash command verification ping) ---
  if (body.ssl_check) {
    return new Response("", { status: 200 });
  }

  // --- URL verification (Events API challenge) ---
  if (body.type === "url_verification") {
    return Response.json({ challenge: body.challenge });
  }

  // --- Skip Slack retries to avoid duplicate processing ---
  const retryNum = req.headers.get("x-slack-retry-num");
  if (retryNum) {
    return new Response("", { status: 200 });
  }

  // --- Dispatch to Bolt ---
  const app = await getSlackApp();

  let responseBody: string | undefined;
  let resolveAck: () => void;
  const ackReady = new Promise<void>((r) => {
    resolveAck = r;
  });

  const processing = app.processEvent({
    body,
    ack: async (response) => {
      if (response === undefined || response === null) {
        responseBody = "";
      } else if (typeof response === "string") {
        responseBody = response;
      } else {
        responseBody = JSON.stringify(response);
      }
      resolveAck!();
    },
    retryNum: Number(req.headers.get("x-slack-retry-num")) || undefined,
    retryReason: req.headers.get("x-slack-retry-reason") || undefined,
  });

  const timeout = new Promise<void>((r) => setTimeout(r, 8000));
  await Promise.race([ackReady, timeout]);

  after(async () => {
    try {
      await processing;
    } catch (e) {
      console.error("Bolt processEvent error (after):", e);
    }
  });

  if (responseBody !== undefined && responseBody !== "") {
    return new Response(responseBody, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("", { status: 200 });
}
