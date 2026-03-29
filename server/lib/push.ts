/**
 * Push notifications — FCM HTTP v1 (google-auth-library) + APNs HTTP/2 (jose + native http2).
 */
import { JWT } from "google-auth-library";
import * as jose from "jose";
import http2 from "node:http2";
import { getPool } from "./postgres";
import { logger } from "./logger";

let fcmJwt: JWT | null = null;

function getFcmJwt(): JWT | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  if (fcmJwt) return fcmJwt;
  try {
    const creds = JSON.parse(raw) as { client_email: string; private_key: string };
    fcmJwt = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    return fcmJwt;
  } catch (e) {
    logger.error({ err: e }, "Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
    return null;
  }
}

export function isPushConfigured(): boolean {
  return Boolean(getFcmJwt() || (process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY && process.env.APNS_BUNDLE_ID));
}

async function sendFcm(token: string, title: string, body: string, data?: Record<string, string>): Promise<boolean> {
  const jwtClient = getFcmJwt();
  if (!jwtClient) return false;
  const projectId = process.env.FIREBASE_PROJECT_ID || (() => {
    try {
      const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}") as { project_id?: string };
      return c.project_id || "";
    } catch {
      return "";
    }
  })();
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
      client.on("error", reject);
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
      req.on("error", reject);
      req.on("end", () => {
        client.close();
        if (status >= 200 && status < 300) resolve();
        else reject(new Error(`APNs status ${status}`));
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
