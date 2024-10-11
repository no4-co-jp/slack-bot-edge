import { format } from "date-fns";

import { isHoliday } from "./holiday";

// ---

export type Env = {
  GOOGLE_SHEET_ID_WFO: string;
  GOOGLE_API_KEY: string;
  OAUTH_CLIENT_ID: string;
  OAUTH_CLIENT_SECRET: string;
  REFRESH_TOKEN: string;
};

type Properties = {
  sheets: {
    properties: {
      sheetId: number;
      title: string;
    };
  }[];
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

export const generateNextMonthSheet = async (env: Env, date: Date): Promise<Response> => {
  const accessToken = await fetchAccessToken(env);

  const sheetName = await duplicateSheet(env, date, accessToken);
  console.log(sheetName);

  date.setDate(1);
  const firstOfMonth = format(date, "yyyy/MM/dd");
  console.log(firstOfMonth);

  const request = new Request(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      env.GOOGLE_SHEET_ID_WFO
    )}/values/${encodeURIComponent(sheetName)}!A4?valueInputOption=USER_ENTERED`
  );

  const response = await fetch(request, {
    method: "PUT",
    headers: {
      "x-goog-api-key": env.GOOGLE_API_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      range: sheetName + "!A4",
      majorDimension: "ROWS",
      values: [[firstOfMonth]],
    }),
  });

  if (response.ok) {
    console.log("generated next month sheet");
  } else {
    const error = await response.json();
    console.error(error);
  }

  return response;
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

const fetchSheetProperties = async (env: Env): Promise<Properties> => {
  const request = new Request(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEET_ID_WFO)}`
  );
  request.headers.append("x-goog-api-key", env.GOOGLE_API_KEY);

  const response = await fetch(request);
  if (response.ok) {
    console.log(response.status);
  } else {
    console.error(console.error);
  }

  const properties = await response.json<{
    sheets: {
      properties: {
        sheetId: number;
        title: string;
      };
    }[];
  }>();

  return properties;
};

// ---

const fetchAccessToken = async (env: Env): Promise<string> => {
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
    console.log(response.status);
  } else {
    console.error(console.error);
  }

  const data = await response.json<{
    access_token: string;
  }>();

  return data.access_token;
};

// ---

const duplicateSheet = async (env: Env, date: Date, accessToken: string): Promise<string> => {
  const sheetProperties = await fetchSheetProperties(env);

  const targetSheet = format(date, "yyyy/M");

  const sheet = sheetProperties.sheets.find((data) => data.properties.title === targetSheet);
  console.log(sheet);

  const sheetName = format(date.setMonth(date.getMonth() + 1), "yyyy/M");

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
            sourceSheetId: sheet?.properties.sheetId,
            insertSheetIndex: 0,
            newSheetName: sheetName,
          },
        },
      ],
    }),
  });

  if (response.ok) {
    console.log("duplicated sheet");
  } else {
    const error = await response.json();
    console.error(error);
  }

  const data = await response.json<{
    replies: [
      {
        duplicateSheet: {
          properties: {
            title: string;
          };
        };
      },
    ];
  }>();

  return data.replies[0].duplicateSheet.properties.title;
};
