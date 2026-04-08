import { WebClient } from "@slack/web-api";

let client: WebClient | null = null;

export function getSlackWeb(): WebClient {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is not set");
  }
  if (!client) {
    client = new WebClient(token);
  }
  return client;
}
