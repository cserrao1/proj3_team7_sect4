// Talks to a locally running GLM-OCR (0.9B) through the Vite dev server's /ocr proxy
// (see vite.config.js), so there are no CORS problems and any API key stays server-side.
//
//   VITE_OCR_MODE=ollama (default)  ->  Ollama's native  POST /api/generate
//   VITE_OCR_MODE=openai            ->  vLLM / SGLang    POST /v1/chat/completions
//
// GLM-OCR is driven by fixed prompts, not free-form chat.

const MODE = (import.meta.env.VITE_OCR_MODE || "ollama").toLowerCase();
const MODEL = import.meta.env.VITE_OCR_MODEL || (MODE === "ollama" ? "glm-ocr:latest" : "glm-ocr");

export const ocrInfo = { mode: MODE, model: MODEL };

const PROMPTS = {
  tables: "Table Recognition:",
  text: "Text Recognition:",
};

const PAGE_TIMEOUT_MS = 5 * 60 * 1000; // CPU-only machines can be slow

export class OcrError extends Error {
  // fatal = "don't bother trying the remaining pages" (server down, model missing)
  constructor(message, fatal = false) {
    super(message);
    this.fatal = fatal;
  }
}

const UNREACHABLE =
  "Can't reach the OCR server. Start Ollama (or your vLLM server) and check OCR_URL in .env, then restart npm run dev.";

async function errorMessage(res) {
  const body = await res.text().catch(() => "");
  try {
    const j = JSON.parse(body);
    return String(j.error?.message ?? j.error ?? j.detail ?? "").slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
}

async function failFromResponse(res) {
  const msg = await errorMessage(res);
  // The dev proxy answers with an empty 5xx when the target isn't listening.
  if (!msg && res.status >= 500) throw new OcrError(UNREACHABLE, true);
  if (res.status === 404 || /not found/i.test(msg)) {
    throw new OcrError(
      MODE === "ollama"
        ? `The model "${MODEL}" isn't installed. Run: ollama pull glm-ocr`
        : `The OCR server doesn't know a model called "${MODEL}" (${msg || res.status}).`,
      true
    );
  }
  throw new OcrError(`OCR server error ${res.status}${msg ? `: ${msg}` : ""}`);
}

async function post(path, body) {
  let res;
  try {
    res = await fetch(`/ocr${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
  } catch (e) {
    if (e?.name === "TimeoutError") throw new OcrError("This page took longer than 5 minutes and was skipped.");
    throw new OcrError(UNREACHABLE, true);
  }
  if (!res.ok) await failFromResponse(res);
  return res.json();
}

// dataUrl: "data:image/jpeg;base64,...."   scan: "tables" | "text"
export async function recognise(dataUrl, scan = "tables") {
  const prompt = PROMPTS[scan] || PROMPTS.tables;

  if (MODE === "ollama") {
    const data = await post("/api/generate", {
      model: MODEL,
      prompt,
      images: [dataUrl.slice(dataUrl.indexOf(",") + 1)],
      stream: false,
      options: { num_ctx: 16384, temperature: 0 },
    });
    return String(data.response ?? "");
  }

  const data = await post("/v1/chat/completions", {
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          { type: "text", text: prompt },
        ],
      },
    ],
    max_tokens: 8192,
    temperature: 0,
  });
  return String(data.choices?.[0]?.message?.content ?? "");
}

// Quick "is it up and is the model there" check for the status chip.
export async function checkOcr() {
  try {
    const res = await fetch(MODE === "ollama" ? "/ocr/api/tags" : "/ocr/v1/models", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const msg = await errorMessage(res);
      return { ok: false, message: !msg && res.status >= 500 ? UNREACHABLE : `OCR server answered ${res.status}. ${msg}`.trim() };
    }
    const data = await res.json();
    if (MODE === "ollama") {
      const names = (data.models || []).map((m) => m.name || m.model || "");
      const hit = names.find((n) => n.toLowerCase().startsWith("glm-ocr"));
      return hit
        ? { ok: true, message: `GLM-OCR ready (${hit})` }
        : { ok: false, message: "Ollama is running, but GLM-OCR isn't installed. Run: ollama pull glm-ocr" };
    }
    const ids = (data.data || []).map((m) => m.id);
    return ids.length
      ? { ok: true, message: `OCR server ready (${ids[0]})` }
      : { ok: false, message: "The OCR server is up but reports no models." };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}
