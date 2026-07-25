import { subscribePush, unsubscribePush } from "@/lib/push.functions";

const SW_PATH = "/sw.js";

function isPreviewOrDev(): boolean {
  if (typeof window === "undefined") return true;
  if (window.self !== window.top) return true;
  return !import.meta.env.PROD;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function currentPushStatus(): Promise<
  "unsupported" | "denied" | "granted" | "prompt" | "preview"
> {
  if (!pushSupported()) return "unsupported";
  if (isPreviewOrDev()) return "preview";
  const perm = Notification.permission;
  if (perm === "denied") return "denied";
  if (perm === "granted") {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "granted" : "prompt";
  }
  return "prompt";
}

export async function enablePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  if (isPreviewOrDev()) return { ok: false, reason: "preview" };
  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapid) return { ok: false, reason: "not-configured" };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: perm };

  const reg = await navigator.serviceWorker.register(SW_PATH);
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid).buffer as ArrayBuffer,
    });
  }
  const json = sub.toJSON();
  await subscribePush({
    data: {
      endpoint: sub.endpoint,
      p256dh: json.keys!.p256dh!,
      auth: json.keys!.auth!,
      userAgent: navigator.userAgent,
    },
  });
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await unsubscribePush({ data: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
}
