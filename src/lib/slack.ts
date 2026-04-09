import { App, LogLevel } from "@slack/bolt";
import { registerBpActions } from "@/slack/actions/bpActions";
import { registerEmployeeActions } from "@/slack/actions/employeeActions";
import { registerGrowthActions } from "@/slack/actions/growthActions";
import { registerWebinarCommand } from "@/slack/commands/webinar";

/**
 * Minimal no-op receiver so Bolt is happy but never listens on a port.
 * All HTTP handling happens in the Next.js route handler which calls
 * `app.processEvent()` directly.
 */
const noopReceiver = {
  init: () => {},
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
};

let cached: App | null = null;

function buildApp(): App {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const token = process.env.SLACK_BOT_TOKEN;
  if (!signingSecret || !token) {
    throw new Error("SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN are required");
  }

  const app = new App({
    token,
    signingSecret,
    processBeforeResponse: false,
    receiver: noopReceiver,
    logLevel: LogLevel.INFO,
  });

  registerWebinarCommand(app);
  registerBpActions(app);
  registerEmployeeActions(app);
  registerGrowthActions(app);

  return app;
}

export async function getSlackApp(): Promise<App> {
  if (!cached) {
    cached = buildApp();
  }
  return cached;
}
