import "server-only";
import OpenAI from "openai";
import { env, hasOpenAI } from "./env";
import { examples, type VoiceKind } from "./voice-examples";

/**
 * Voice layer. One job: turn a (kind, context) pair into a reply that sounds
 * like a person, not a bot. Everything taste-related lives here or in
 * voice-examples.ts.
 *
 * Tuning loop:
 *   1. Run scripts/voice-eval.ts. Read the outputs.
 *   2. For each one that's off — add the *correct* version to voice-examples.ts.
 *   3. For each phrase you see repeating that you hate — add it to FORBIDDEN.
 *   4. Re-run.
 */

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

/**
 * Phrases the bot is never allowed to use. Most "AI bot" tells live here.
 * Matched case-insensitive. If a generation contains any of these, we re-roll
 * (once) and then strip if still present.
 */
const FORBIDDEN: RegExp[] = [
  /\bhappy to\b/i,
  /\blet me know\b/i,
  /\bgreat (question|idea|choice)\b/i,
  /\bI('?m| am) (here|happy) to\b/i,
  /\bas an? (ai|assistant|language model)\b/i,
  /\bI hope\b/i,
  /\bfeel free to\b/i,
  /\bdon't hesitate\b/i,
  /\bcertainly\b/i,
  /\babsolutely\b/i,
  /\bof course\b/i,
  /^sure[,!.]/i,
  /\bI('?ve| have) (noted|recorded|saved)\b/i,
  /\bI('ll| will) (go ahead|now)\b/i,
];

const SYSTEM_PROMPT = `you are a presence inside a private group chat between two people who are dating or married. you remember what they share with each other and occasionally speak up.

voice — warm but with an edge:
- you use their names. you remember small things. you root for them.
- you have opinions and you share them. you tease lightly. you call things out.
- you are dry, observant, slightly knowing. think: their funniest mutual friend who pays attention.

never:
- never use exclamation points unless something is genuinely exciting (rare)
- never sound like a calendar reminder, a therapist, or customer support
- never say things like "happy to", "let me know", "great idea", "I hope", "feel free to", "absolutely", "of course", "I've noted"
- never refer to yourself in the third person, never call yourself a bot or assistant
- never start with "sure" or "got it" or "okay"
- never use bullet points or lists. you are texting, not writing.
- never be sappy or performative. no "aww", no hearts, no "love this for you"

form:
- lowercase by default. punctuation is loose. fragments are fine.
- 1–2 sentences. one is better than two. occasionally one word.
- emojis: rare. only when one carries real meaning. never decorative.
- write the way a sharp friend texts at 11pm — not the way a brand tweets.

when in doubt: say less. a knowing one-liner beats a thoughtful paragraph.`;

function buildPrompt(kind: VoiceKind, context: string): string {
  const shots = examples[kind];
  const shotBlock = shots
    .map((s) => `context: ${s.context}\nreply: ${s.reply}`)
    .join("\n\n");
  return `${shotBlock}\n\ncontext: ${context}\nreply:`;
}

function looksForbidden(text: string): boolean {
  return FORBIDDEN.some((re) => re.test(text));
}

/** Strip leading/trailing quotes the model sometimes wraps replies in. */
function clean(text: string): string {
  let t = text.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  // Strip a leading "reply:" if the model echoed the prompt format.
  t = t.replace(/^reply:\s*/i, "");
  return t;
}

async function generate(kind: VoiceKind, context: string): Promise<string> {
  const res = await client().chat.completions.create({
    model: "gpt-4o",
    temperature: 0.9,
    max_tokens: 80,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildPrompt(kind, context) },
    ],
  });
  return clean(res.choices[0]?.message?.content ?? "");
}

/**
 * Compose a message in voice. Returns null if no OpenAI key (caller decides
 * what to do — scheduler currently no-ops in that case).
 *
 * Re-rolls once on forbidden-phrase hit. After that, returns the cleaner of
 * the two so we never block sending.
 */
export async function compose(kind: VoiceKind, context: string): Promise<string | null> {
  if (!hasOpenAI) return null;

  const first = await generate(kind, context);
  if (!looksForbidden(first) && first.length > 0) return first;

  const second = await generate(kind, context);
  if (!looksForbidden(second) && second.length > 0) return second;

  // Both tripped the filter. Pick the shorter one — verbose AI-speak is worse
  // than terse AI-speak.
  return (first.length <= second.length ? first : second) || null;
}
