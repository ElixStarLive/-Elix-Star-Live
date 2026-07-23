/**
 * Push notifications — FCM HTTP v1 (google-auth-library) + APNs HTTP/2 (jose + native http2).
 */
import { JWT } from "google-auth-library";
import * as jose from "jose";
import http2 from "node:http2";
import { getPool } from "./postgres";
import { logger } from "./logger";
import { loadServiceAccountFromEnv } from "./serviceAccountEnv";

let fcmJwt: JWT | null = null;
let fcmProjectId: string | null = null;

function getFcmJwt(): JWT | null {
  if (fcmJwt) return fcmJwt;
  const creds = loadServiceAccountFromEnv(
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "FIREBASE_SERVICE_ACCOUNT_BASE64",
  );
  if (!creds) return null;
  try {
    fcmJwt = new JWT({
      email: String(creds.client_email),
      key: String(creds.private_key),
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    fcmProjectId = typeof creds.project_id === "string" ? creds.project_id : null;
    return fcmJwt;
  } catch (e) {
    logger.error({ err: e }, "Failed to init FCM JWT from service account");
    return null;
  }
}

export function isPushConfigured(): boolean {
  return Boolean(
    getFcmJwt() ||
      (process.env.APNS_KEY_ID &&
        process.env.APNS_TEAM_ID &&
        process.env.APNS_PRIVATE_KEY &&
        process.env.APNS_BUNDLE_ID),
  );
}

async function sendFcm(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> {
  const jwtClient = getFcmJwt();
  if (!jwtClient) return false;
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    fcmProjectId ||
    "";
  if (!projectId) {
    logger.error("FCM: FIREBASE_PROJECT_ID or project_id in service account JSON required");
    return false;
  }
  try {
    const access = await jwtClient.getAccessToken();
    if (!access.token) return false;
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: data || {},
          },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      const t = await res.text();
      logger.warn({ status: res.status, t }, "FCM send failed");
      return false;
    }
    return true;
  } catch (e) {
    logger.error({ err: e }, "FCM send exception");
    return false;
  }
}

async function sendApns(deviceToken: string, title: string, body: string, data?: Record<string, string>): Promise<boolean> {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  const privateKeyPem = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!keyId || !teamId || !bundleId || !privateKeyPem) return false;

  const host = process.env.APNS_PRODUCTION === "1" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  try {
    const alg = "ES256";
    const key = await jose.importPKCS8(privateKeyPem, alg);
    const jwt = await new jose.SignJWT({})
      .setProtectedHeader({ alg, kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt()
      .setExpirationTime("20m")
      .sign(key);

    const payload = JSON.stringify({
      aps: { alert: { title, body }, sound: "default" },
      ...Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)])),
    });

    await new Promise<void>((resolve, reject) => {
      const client = http2.connect(`https://${host}`);
      let settled = false;
      // Always tear down the HTTP/2 session — previously it was only closed on
      // the success `end` path, so any error/timeout leaked the connection.
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { client.close(); } catch { /* already closed */ }
        if (err) reject(err);
        else resolve();
      };
      const timer = setTimeout(
        () => finish(new Error("APNs request timed out")),
        10_000,
      );
      client.on("error", (e) => finish(e as Error));
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        authorization: `bearer ${jwt}`,
        "content-type": "application/json",
      });
      let status = 0;
      req.on("response", (headers) => {
        status = Number(headers[":status"] || 0);
      });
      req.on("error", (e) => finish(e as Error));
      req.on("end", () => {
        if (status >= 200 && status < 300) finish();
        else finish(new Error(`APNs status ${status}`));
      });
      req.write(payload);
      req.end();
    });
    return true;
  } catch (e) {
    logger.warn({ err: e }, "APNs send failed");
    return false;
  }
}

/** Send to all stored device tokens for a user. */
export async function pushNotifyUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; failed: number }> {
  const pool = getPool();
  if (!pool) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  try {
    const r = await pool.query(
      `SELECT platform, token FROM elix_device_tokens WHERE user_id = $1`,
      [userId],
    );
    for (const row of r.rows as { platform: string; token: string }[]) {
      const p = String(row.platform).toLowerCase();
      const ok =
        p === "ios" || p === "iphone"
          ? await sendApns(row.token, title, body, data)
          : await sendFcm(row.token, title, body, data);
      if (ok) sent++;
      else failed++;
    }
  } catch (e) {
    logger.error({ err: e, userId }, "pushNotifyUser query failed");
  }
  return { sent, failed };
}
