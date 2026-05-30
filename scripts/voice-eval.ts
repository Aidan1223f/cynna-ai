/**
 * Voice eval. Generate a batch of bot messages across kinds and print them.
 *
 * Usage:
 *   pnpm tsx scripts/voice-eval.ts
 *   pnpm tsx scripts/voice-eval.ts daily_recall   # one kind only
 *   pnpm tsx scripts/voice-eval.ts --n 5          # 5 samples per scenario
 *
 * This is the most important file in the voice loop. Read every output. For
 * any that's off, write the version that *would* have been right and add it
 * to src/lib/voice-examples.ts. Re-run. Repeat until you can't tell it's a bot.
 */

import "dotenv/config";
import { compose } from "../src/lib/voice";
import type { VoiceKind } from "../src/lib/voice-examples";

type Scenario = { kind: VoiceKind; label: string; context: string };

const SCENARIOS: Scenario[] = [
  {
    kind: "daily_recall",
    label: "old link, never followed up",
    context:
      "Couple: maya & jordan. Save from 14 days ago: jordan sent a link to a wine bar in hayes valley. neither has mentioned it since.",
  },
  {
    kind: "daily_recall",
    label: "voice note about a trip",
    context:
      "Couple: alex & sam. Save from 5 weeks ago: alex's voice note saying 'we should go to portland sometime'. nothing since.",
  },
  {
    kind: "daily_recall",
    label: "recent recipe",
    context:
      "Couple: priya & dev. Save from 4 days ago: priya sent a tiktok of a one-pot pasta recipe. dev hasn't reacted.",
  },
  {
    kind: "weekly_date_idea",
    label: "mixed bag of saves",
    context:
      "Couple: maya & jordan. Recent saves:\n- maya: pottery class in the mission, sundays 2pm\n- jordan: new italian place in north beach\n- maya: hike in marin headlands\n- jordan: jazz set saturday night",
  },
  {
    kind: "weekly_date_idea",
    label: "thin set of saves",
    context:
      "Couple: alex & sam. Recent saves:\n- sam: new thai place\n- alex: bookstore reading saturday 6pm",
  },
  {
    kind: "nudge",
    label: "ignored concert link",
    context:
      "Couple: priya & dev. Priya sent dev a link to a concert 2 days ago. Dev hasn't reacted or responded.",
  },
  {
    kind: "nudge",
    label: "thoughtful save the other should see",
    context:
      "Couple: maya & jordan. Jordan saved a recipe maya mentioned wanting to try last week. Maya hasn't seen it surface.",
  },
  {
    kind: "save_ack",
    label: "fourth ramen place",
    context:
      "Couple: alex & sam. Sam just saved a fourth ramen place this month.",
  },
  {
    kind: "save_ack",
    label: "converging on marin",
    context:
      "Couple: maya & jordan. Maya just saved a hike in marin. Jordan saved a different marin trail last week.",
  },
];

function parseArgs(): { only?: VoiceKind; n: number } {
  const args = process.argv.slice(2);
  let only: VoiceKind | undefined;
  let n = 3;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--n") {
      n = parseInt(args[++i] ?? "3", 10) || 3;
    } else if (
      a === "daily_recall" ||
      a === "weekly_date_idea" ||
      a === "nudge" ||
      a === "save_ack"
    ) {
      only = a;
    }
  }
  return { only, n };
}

async function main() {
  const { only, n } = parseArgs();
  const list = only ? SCENARIOS.filter((s) => s.kind === only) : SCENARIOS;
  if (list.length === 0) {
    console.error("no matching scenarios");
    process.exit(1);
  }

  for (const s of list) {
    console.log("\n―――――――――――――――――――――――――――――――――――――――――――――");
    console.log(`[${s.kind}] ${s.label}`);
    console.log(`context: ${s.context}`);
    console.log("");
    for (let i = 0; i < n; i++) {
      const reply = await compose(s.kind, s.context);
      console.log(`  ${i + 1}. ${reply ?? "(no key — null)"}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
