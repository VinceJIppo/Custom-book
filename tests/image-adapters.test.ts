import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { GeminiImageProvider, GEMINI_ENDPOINT, extractImage } from "@/lib/providers/gemini/image";
import { OpenAIImageProvider, openAISize } from "@/lib/providers/openai/image";
import { buildIllustrationPrompt, nearestAspect, NO_TEXT_RULE } from "@/lib/providers/image/prompt";
import { PermanentProviderError } from "@/lib/providers/types";
import { getTrim, illustrationTargetPx } from "@/lib/print/geometry";
import type { IllustrationRequest } from "@/lib/providers/image/types";

const png = (w = 64, h = 64) => sharp({ create: { width: w, height: h, channels: 3, background: "#88aaff" } }).png().toBuffer();
const square = getTrim("square-8.5");

async function request(over: Partial<IllustrationRequest> = {}): Promise<IllustrationRequest> {
  return {
    characterRef: { data: await png(), mimeType: "image/png", width: 64, height: 64 },
    bible: { hair: "curly red hair", eyes: "green", skinTone: "fair", faceShape: "round", glasses: "round blue glasses", freckles: "light freckles", signatureOutfit: "yellow raincoat", otherDetails: "" },
    childName: "Teddy",
    scene: { action: "Teddy waves at a whale", characters: ["Teddy"], setting: "a boat", mood: "happy", framing: "wide" },
    style: "watercolor-storybook",
    aspect: 1,
    targetPx: illustrationTargetPx("fullBleed", square),
    textZone: "top",
    palette: ["#123456"],
    label: "Page 1",
    ...over,
  };
}

function fakeFetch(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return responder(url, init);
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("illustration prompt", () => {
  it("locks the character, leaves space for text, and forbids lettering", async () => {
    const p = buildIllustrationPrompt(await request({ note: "make him smile" }));
    expect(p).toContain(NO_TEXT_RULE);
    expect(p).toMatch(/top third/);
    expect(p).toMatch(/character sheet/);
    expect(p).toContain("round blue glasses");
    expect(p).toContain("make him smile");
  });
  it("picks the nearest supported aspect", () => {
    expect(nearestAspect(1, ["1:1", "3:2"])).toBe("1:1");
    expect(nearestAspect(1.97, ["16:9", "21:9", "3:2"])).toBe("16:9");
    expect(nearestAspect(2.3, ["16:9", "21:9", "3:2"])).toBe("21:9");
    expect(nearestAspect(0.8, ["2:3", "4:5", "1:1"])).toBe("4:5");
  });
});

describe("Gemini adapter (no network)", () => {
  it("sends store=false, the model, the reference image and response_format", async () => {
    const out = (await png(128, 128)).toString("base64");
    const { f, calls } = fakeFetch(() =>
      Response.json({
        steps: [
          { type: "thought", content: [{ type: "image", data: "dGhvdWdodA==", mime_type: "image/png" }] },
          { type: "model_output", content: [{ type: "text", text: "Here you go" }, { type: "image", data: out, mime_type: "image/png" }] },
        ],
      }),
    );
    const g = new GeminiImageProvider({ apiKey: "k", model: "gemini-nano-banana-2.1", pageSize: "auto", fetchImpl: f });
    const r = await g.generateIllustration(await request());
    expect(calls[0].url).toBe(GEMINI_ENDPOINT);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("k");
    expect(headers["Api-Revision"]).toBeTruthy();
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.store).toBe(false);
    expect(body.model).toBe("gemini-nano-banana-2.1");
    expect(body.input[0].type).toBe("text");
    expect(body.input[1]).toMatchObject({ type: "image", mime_type: "image/png" });
    expect(body.response_format).toMatchObject({ type: "image", mime_type: "image/jpeg", aspect_ratio: "1:1", image_size: "4K" });
    expect(r.value.width).toBe(128);
    expect(r.value.mimeType).toBe("image/png"); // detected from the bytes the fake returned
    // 4K output + one input image, from the pricing table.
    expect(r.usage.costUsd).toBeCloseTo(0.113 + 0.0017, 6);
  });

  it("chooses sizes from print pixels", () => {
    const g = new GeminiImageProvider({ apiKey: "k", model: "gemini-nano-banana-2.1", pageSize: "auto" });
    expect(g.sizeFor(illustrationTargetPx("fullBleed", square))).toBe("4K");
    expect(g.sizeFor(illustrationTargetPx("imageTop", square))).toBe("2K");
    expect(g.sizeFor(illustrationTargetPx("spread", square))).toBe("4K");
    expect(new GeminiImageProvider({ apiKey: "k", model: "x", pageSize: "2K" }).sizeFor(illustrationTargetPx("fullBleed", square))).toBe("2K");
  });

  it("skips thought images and uses the final output", () => {
    const img = extractImage({ steps: [{ type: "thought", content: [{ type: "image", data: "A" }] }, { type: "model_output", content: [{ type: "image", data: "B" }] }] });
    expect(img?.data).toBe("B");
  });

  it("treats 4xx as permanent, 429 and 5xx as retryable, and no-image as permanent", async () => {
    const mk = (status: number) => new GeminiImageProvider({ apiKey: "k", model: "m", pageSize: "1K", fetchImpl: fakeFetch(() => new Response("nope", { status })).f });
    await expect(mk(400).generateIllustration(await request())).rejects.toBeInstanceOf(PermanentProviderError);
    const e429 = await mk(429).generateIllustration(await request()).catch((e) => e);
    expect(e429).not.toBeInstanceOf(PermanentProviderError);
    const e503 = await mk(503).generateIllustration(await request()).catch((e) => e);
    expect(e503).not.toBeInstanceOf(PermanentProviderError);
    const empty = new GeminiImageProvider({ apiKey: "k", model: "m", pageSize: "1K", fetchImpl: fakeFetch(() => Response.json({ steps: [{ type: "model_output", content: [{ type: "text", text: "I can't" }] }] })).f });
    await expect(empty.generateIllustration(await request())).rejects.toBeInstanceOf(PermanentProviderError);
  });

  it("refuses SVG references rather than sending them", async () => {
    const g = new GeminiImageProvider({ apiKey: "k", model: "m", pageSize: "1K", fetchImpl: fakeFetch(() => Response.json({})).f });
    await expect(g.generateIllustration(await request({ characterRef: { data: Buffer.from("<svg/>"), mimeType: "image/svg+xml", width: 1, height: 1 } }))).rejects.toBeInstanceOf(PermanentProviderError);
  });
});

describe("OpenAI adapter (no network)", () => {
  it("computes valid custom sizes", () => {
    for (const aspect of [1, 1.5, 0.75, 1.97, 3, 0.2, 10]) {
      const [w, h] = openAISize(aspect).split("x").map(Number);
      expect(w % 16).toBe(0);
      expect(h % 16).toBe(0);
      expect(Math.max(w, h)).toBeLessThanOrEqual(3840);
      expect(w * h).toBeLessThanOrEqual(8_294_400);
      expect(w * h).toBeGreaterThanOrEqual(655_360);
      expect(w / h).toBeGreaterThanOrEqual(1 / 3 - 0.01);
      expect(w / h).toBeLessThanOrEqual(3 + 0.01);
    }
    expect(openAISize(1, { widthPx: 2625, heightPx: 2625 })).toBe("2624x2624");
  });

  it("uses /images/edits with image[] parts when there is a reference", async () => {
    const out = (await png(96, 96)).toString("base64");
    const { f, calls } = fakeFetch(() => Response.json({ data: [{ b64_json: out }], usage: { input_tokens: 1000, output_tokens: 4000, input_tokens_details: { text_tokens: 200, image_tokens: 800 } } }));
    const o = new OpenAIImageProvider({ apiKey: "sk", model: "gpt-image-2.6-sunburst", quality: "high", fetchImpl: f });
    const r = await o.generateIllustration(await request());
    expect(calls[0].url).toMatch(/\/images\/edits$/);
    const form = calls[0].init.body as FormData;
    expect(form.get("model")).toBe("gpt-image-2.6-sunburst");
    expect(form.getAll("image[]")).toHaveLength(1);
    expect(form.get("quality")).toBe("high");
    expect(form.get("size")).toBe("2624x2624");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk");
    // 200 text @ $5 + 800 image @ $8 + 4000 out @ $30 per million
    expect(r.usage.costUsd).toBeCloseTo((200 * 5 + 800 * 8 + 4000 * 30) / 1e6, 6);
  });

  it("uses /images/generations JSON without a reference, and maps moderation blocks to permanent", async () => {
    const { f, calls } = fakeFetch(() => Response.json({ error: { code: "moderation_blocked", message: "blocked" } }, { status: 400 }));
    const o = new OpenAIImageProvider({ apiKey: "sk", model: "gpt-image-2.6-flare", quality: "medium", fetchImpl: f });
    await expect(o.generateIllustration(await request({ characterRef: null }))).rejects.toBeInstanceOf(PermanentProviderError);
    expect(calls[0].url).toMatch(/\/images\/generations$/);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ model: "gpt-image-2.6-flare", quality: "medium", output_format: "png", n: 1 });
  });
});
