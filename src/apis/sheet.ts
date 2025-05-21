import { createSign } from "node:crypto";

import { format } from "date-fns";

import { isHoliday } from "./holiday";

// ---

export type Env = {
  GOOGLE_API_KEY: string;
  GOOGLE_CLIENT_EMAIL: string;
  GOOGLE_SHEET_ID_WFO: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_TEMPLATE_SHEET_ID: string;
};

type Sheet = {
  properties: {
    sheetId: number;
    title: string;
  };
};

export const fetchAllUsers = async (env: Env, date: Date): Promise<string[]> => {
  return fetchUsers(env, date);
};

export const fetchWFOUsers = async (env: Env, date: Date): Promise<string[]> => {
  return fetchUsers(env, date, ["◎", "○"]);
};

export const fetchLeaveUsers = async (env: Env, date: Date): Promise<string[]> => {
  return fetchUsers(env, date, ["休"]);
};

export const fetchAMLeaveUsers = async (env: Env, date: Date): Promise<string[]> => {
  return fetchUsers(env, date, ["AM休"]);
};

// ---

export const isBusinessHoliday = async (env: Env, date: Date): Promise<boolean> => {
  if (await isHoliday(date)) {
    console.log("Holiday!");
    return true;
  }

  if ([0, 6].includes(date.getDay())) {
    // 土日
    console.log("Business Holiday!");
    return true;
  }

  const allUsers = await fetchAllUsers(env, date);
  const LeaveUsers = await fetchLeaveUsers(env, date);

  if (allUsers.length === LeaveUsers.length) {
    console.log(`No work users day. ${allUsers.length}`);
    return true;
  }

  return false;
};

// ---

export const updateCells = async (
  env: Env,
  accessToken: string,
  targetSheetName: string,
  range: string,
  values: (boolean | string | number)[][]
): Promise<void> => {
  const request = new Request(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      env.GOOGLE_SHEET_ID_WFO
    )}/values/${encodeURIComponent(targetSheetName)}!${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`
  );

  const response = await fetch(request, {
    method: "PUT",
    headers: {
      "x-goog-api-key": env.GOOGLE_API_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      range: targetSheetName + "!" + range,
      majorDimension: "ROWS",
      values: values,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const body = await response.text();
    const message = `failed to update cell. error(status: ${status}, body: ${body}})`;
    throw new Error(message);
  }
};

// ---

const fetchUsers = async (env: Env, date: Date, targets: string[] = []): Promise<string[]> => {
  const targetMonth = format(date, "yyyy/M");

  const targetRow = date.getDate() + 3;

  const header = await fetchSheets(env, `${targetMonth}!G2:BA2`);

  const records = await fetchSheets(env, `${targetMonth}!G${targetRow}:BA${targetRow}`);

  const users = (header?.[0] ?? []).reduce<string[]>(
    (prev: string[], userId: string, index: number): string[] => {
      const item = String((records?.[0] ?? [])[index]);

      if (userId === undefined || userId.length === 0) {
        return prev;
      }

      if (item.trim() === "-") {
        return prev;
      }

      if (targets.length > 0) {
        if (!targets.includes(item.trim())) {
          return prev;
        }
      }

      return [...prev, userId];
    },
    []
  );

  return users;
};

// ---

const fetchSheets = async (env: Env, range: string): Promise<string[][]> => {
  const request = new Request(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      env.GOOGLE_SHEET_ID_WFO
    )}/values/${encodeURIComponent(range)}`
  );
  request.headers.append("x-goog-api-key", env.GOOGLE_API_KEY);

  const { values } = await (
    await fetch(request)
  ).json<{
    range: string;
    majorDimension: "string";
    values: string[][];
  }>();

  return values;
};

// ---

export const fetchAccessToken = async (env: Env): Promise<string> => {
  // JWT
  const base64urlEncode = (str: string): string => {
    return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  };

  function keyToArrayBuffer(pem: string): ArrayBuffer {
    const base64 = pem
      .replace(/\\\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/[\r\n]+/g, "");
    const binary = atob(base64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      buffer[i] = binary.charCodeAt(i);
    }
    return buffer.buffer;
  }

  const arrayBufferToBase64Url = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return base64urlEncode(binary);
  };

  const header = { alg: "RS256", typ: "JWT" };

  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  // JWTのヘッダー・ペイロードをBase64URLエンコード
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // WEB Crypto APIで署名
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyToArrayBuffer(env.GOOGLE_PRIVATE_KEY),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = arrayBufferToBase64Url(signature);

  const jwt = `${unsignedToken}.${encodedSignature}`;

  const request = new Request("https://oauth2.googleapis.com/token");
  request.headers.append("Content-Type", "application/x-www-form-urlencoded");

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const response = await fetch(request, {
    method: "POST",
    body: body.toString(),
  });

  if (!response.ok) {
    const status = response.status;
    const body = await response.text();
    const message = `failed to fetch access token. error(status: ${status}, body: ${body}})`;
    throw new Error(message);
  }

  const data = await response.json<{
    access_token: string;
  }>();

  return data.access_token;
};

// ---

export const duplicateSheet = async (
  env: Env,
  accessToken: string,
  newSheetName: string,
  sourceSheetId: string
): Promise<void> => {
  const request = new Request(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      env.GOOGLE_SHEET_ID_WFO
    )}:batchUpdate`
  );

  const response = await fetch(request, {
    method: "POST",
    headers: {
      "x-goog-api-key": env.GOOGLE_API_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          duplicateSheet: {
            sourceSheetId: sourceSheetId,
            insertSheetIndex: 2,
            newSheetName: newSheetName,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const body = await response.text();
    const message = `failed to duplicate sheet. error(status: ${status}, body: ${body}})`;
    throw new Error(message);
  }
};

// ---

export const findSheetByTitle = async (
  env: Env,
  sheetTitle: string
): Promise<Sheet | undefined> => {
  const request = new Request(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEET_ID_WFO)}`
  );
  request.headers.append("x-goog-api-key", env.GOOGLE_API_KEY);

  const response = await fetch(request);

  if (!response.ok) {
    const status = response.status;
    const body = await response.text();
    const message = `failed to duplicate sheet. error(status: ${status}, body: ${body}})`;
    throw new Error(message);
  }

  const data = await response.json<{
    sheets: Sheet[];
  }>();

  const sheet = data.sheets.find((sheet) => sheet.properties.title === sheetTitle);

  return sheet;
};

// ---
