import { createSignal } from "solid-js";

// Internal clipboard — always available as last resort
const [internalClipboard, setInternalClipboard] = createSignal("");

export async function clipboardWrite(text: string): Promise<boolean> {
  setInternalClipboard(text);

  // Try modern API first
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Not available (no user gesture, no permissions, etc.)
  }

  // Fallback: temporary textarea + execCommand
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return true;
  } catch {
    // execCommand failed
  }

  return false;
}

export async function clipboardRead(): Promise<string> {
  // Try modern API first
  try {
    const text = await navigator.clipboard.readText();
    if (text) return text;
  } catch {
    // Not available
  }

  // Fallback: temporary textarea + execCommand
  try {
    const ta = document.createElement("textarea");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    const ok = document.execCommand("paste");
    const text = ta.value;
    document.body.removeChild(ta);
    if (ok && text) return text;
  } catch {
    // execCommand failed
  }

  return internalClipboard();
}
