import { format } from "date-fns";

import { isHoliday } from "./holiday";

// ---

export type Env = {
  GOOGLE_SHEET_ID_WFO: string;
  GOOGLE_API_KEY: string;
  OAUTH_CLIENT_ID: string;
  OAUTH_CLIENT_SECRET: string;
  REFRESH_TOKEN: string;
  TEMPLATE_SHEET_ID: number;
};

type SheetProperties = {
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

export const changeToNextMonthSheet = async (
  env: Env,
  date: Date,
  targetSheet: string,
  accessToken: string
): Promise<void> => {
  // 1日
  date.setDate(1);
  const firstOfMonth = format(date, "yyyy/MM/dd");
  console.log(firstOfMonth);

  const request = new Request(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      env.GOOGLE_SHEET_ID_WFO
    )}/values/${encodeURIComponent(targetSheet)}!A4?valueInputOption=USER_ENTERED`
  );

  const response = await fetch(request, {
    method: "PUT",
    headers: {
      "x-goog-api-key": env.GOOGLE_API_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      range: targetSheet + "!A4",
      majorDimension: "ROWS",
      values: [[firstOfMonth]],
    }),
  });

  if (response.ok) {
    console.log("generated next month sheet");
  } else {
    throw new Error("generate next month sheet failed");
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
  const request = new Request("https://oauth2.googleapis.com/token");
  request.headers.append("Content-Type", "application/x-www-form-urlencoded");

  const body = new URLSearchParams({
    client_id: env.OAUTH_CLIENT_ID,
    client_secret: env.OAUTH_CLIENT_SECRET,
    refresh_token: env.REFRESH_TOKEN,
    grant_type: "refresh_token",
  });

  const response = await fetch(request, {
    method: "POST",
    body: body.toString(),
  });

  if (response.ok) {
    console.log("fetch access token");
  } else {
    throw new Error("fetch access token failed");
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
  newSheetName: string
): Promise<SheetProperties> => {
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
            sourceSheetId: env.TEMPLATE_SHEET_ID,
            insertSheetIndex: 1,
            newSheetName: newSheetName,
          },
        },
      ],
    }),
  });

  if (response.ok) {
    console.log("duplicated sheet");
  } else {
    throw new Error("duplicate sheet failed");
  }

  const data = await response.json<{
    replies: [
      {
        duplicateSheet: SheetProperties;
      },
    ];
  }>();

  return data.replies[0].duplicateSheet;
};

// ---

// const fetchSheetProperties = async (env: Env): Promise<SheetProperties[]> => {
//   const request = new Request(
//     `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEET_ID_WFO)}`
//   );
//   request.headers.append("x-goog-api-key", env.GOOGLE_API_KEY);

//   const response = await fetch(request);
//   if (response.ok) {
//     console.log("fetch sheet properties");
//   } else {
//     throw new Error("fetch sheet properties failed");
//   }

//   const data = await response.json<{
//     sheets: Sheetproperties[];
//   }>();

//   return data.sheets;
// };

// ---
