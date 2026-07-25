// Screenshot → card names.
// Sends a user-supplied image (data URL, downscaled client-side) to a vision
// model via OpenAI's Responses API and returns a strict list of card product
// names it sees. NEVER persists the image, NEVER logs the payload, NEVER
// returns digits.

import { createServerFn } from "@tanstack/react-start";

const MAX_BYTES = 6 * 1024 * 1024; // hard cap after client-side downscale
const CARD_NAME_MAX = 64;
const MAX_NAMES = 12;

type Input = { imageDataUrl: string };

function stripDigits(s: string): string {
  // Remove any digit sequences, mask characters (•, *, x when used as mask),
  // and typical last-4 suffixes like "•••• 4321", "•• 4321", "ending 4321".
  return s
    .replace(/[0-9]/g, "")
    .replace(/[•·●◦∗*]{2,}/g, "")
    .replace(/\bending( in)?\b/gi, "")
    .replace(/[·•●◦\-–—]+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function coerceNames(raw: unknown): string[] {
  // Accept either a JSON array or an object with a "names" key. Any other
  // shape → empty. This is the last line of defence before returning to the
  // client; combined with prompt discipline the model rarely deviates.
  let arr: unknown = raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    arr = (raw as Record<string, unknown>).names;
  }
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const cleaned = stripDigits(item).slice(0, CARD_NAME_MAX);
    if (cleaned.length < 3) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= MAX_NAMES) break;
  }
  return out;
}

const SYSTEM_PROMPT = [
  "You extract credit-card PRODUCT NAMES from a screenshot of an Apple Pay",
  "sheet, an Apple Wallet card list, or a photo of a physical card front.",
  "Return ONLY the product/marketing names visible as text.",
  'Examples of valid names: "Chase Sapphire Preferred", "Freedom Unlimited",',
  '"Amazon Prime Visa", "Apple Card", "Blue Cash Preferred".',
  "STRICT RULES:",
  "1. Never include digits, card numbers, last-4s, expirations, or CVV.",
  "2. Never include personal names, addresses, or issuer contact info.",
  "3. Never include phone numbers, ZIP codes, or dollar amounts.",
  '4. If you see a truncated name like "Chase Freedom Unli..." return it as',
  '   "Chase Freedom Unli" — do not guess the rest.',
  "5. Do not invent cards that are not visible in the image.",
  'Respond as strict JSON of the form: {"names": ["…", "…"]}',
  "No prose, no markdown, no code fences.",
].join(" ");

export const extractCardNames = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): Input => {
    const d = raw as Partial<Input> | null;
    if (!d || typeof d.imageDataUrl !== "string") throw new Error("bad_input");
    if (!d.imageDataUrl.startsWith("data:image/")) throw new Error("not_an_image");
    // Rough byte estimate from base64 payload length.
    const b64 = d.imageDataUrl.slice(d.imageDataUrl.indexOf(",") + 1);
    const approxBytes = Math.floor((b64.length * 3) / 4);
    if (approxBytes > MAX_BYTES) throw new Error("too_large");
    return { imageDataUrl: d.imageDataUrl };
  })
  .handler(async ({ data }) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY missing");

    const body = {
      model: process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini",
      store: false,
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: 'List every credit card product name visible in this image. Return only JSON: {"names":["…"]}.',
            },
            { type: "input_image", image_url: data.imageDataUrl, detail: "high" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "visible_card_names",
          strict: true,
          schema: {
            type: "object",
            properties: {
              names: {
                type: "array",
                maxItems: MAX_NAMES,
                items: { type: "string", maxLength: CARD_NAME_MAX },
              },
            },
            required: ["names"],
            additionalProperties: false,
          },
        },
      },
      max_output_tokens: 300,
    };

    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      // Deliberately vague — this is user-facing.
      return { names: [] as string[], error: "network" as const };
    }

    if (!res.ok) {
      // 429 = rate limit; other statuses are intentionally generalized.
      if (res.status === 429) return { names: [], error: "rate_limit" as const };
      return { names: [], error: "upstream" as const };
    }

    let parsed: unknown;
    try {
      const j = (await res.json()) as {
        output_text?: string;
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      };
      const content =
        j.output_text ??
        j.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")
          ?.text ??
        "";
      parsed = JSON.parse(content);
    } catch {
      return { names: [], error: "bad_response" as const };
    }

    const names = coerceNames(parsed);
    return { names, error: null as null | string };
  });
