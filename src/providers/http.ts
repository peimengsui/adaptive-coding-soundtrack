export async function expectOk(response: Response, provider: string): Promise<Response> {
  if (response.ok) return response;
  throw new Error(`${provider} request failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""}).`);
}

export async function readJson(response: Response, provider: string): Promise<unknown> {
  await expectOk(response, provider);
  try {
    return await response.json();
  } catch {
    throw new Error(`${provider} returned an invalid JSON response.`);
  }
}

export async function readMp3(response: Response, provider: string): Promise<Uint8Array> {
  await expectOk(response, provider);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!looksLikeMp3(bytes)) throw new Error(`${provider} returned invalid or empty MP3 audio.`);
  return bytes;
}

export function looksLikeMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 32) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  const searchLength = Math.min(bytes.length - 1, 4_096);
  for (let index = 0; index < searchLength; index += 1) {
    if (bytes[index] === 0xff && (bytes[index + 1] & 0xe0) === 0xe0) return true;
  }
  return false;
}

export function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

export function abortError(): Error {
  const error = new Error("The music request was cancelled.");
  error.name = "AbortError";
  return error;
}
