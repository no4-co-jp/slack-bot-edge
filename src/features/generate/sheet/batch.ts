import { format, setDate, addMonths } from "date-fns";

import type { Env } from "~/@types/app";
import { fetchAccessToken, duplicateSheet, updateCells, findSheetByTitle } from "~/apis/sheet";

export const handler = async (env: Env): Promise<void> => {
  console.info("handler");
  const date = new Date(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  console.log(date);

  try {
    const accessToken = await fetchAccessToken(env);

    // 翌月の1日目
    const firstDayOfNextMonth = addMonths(setDate(date, 1), 1);

    const nextMonthSheetName = format(firstDayOfNextMonth, "yyyy/M");

    const nextMonthSheet = await findSheetByTitle(env, nextMonthSheetName);

    if (!nextMonthSheet) {
      const sourceSheetId = env.GOOGLE_TEMPLATE_SHEET_ID;
      await duplicateSheet(env, accessToken, nextMonthSheetName, sourceSheetId);

      await updateCells(env, accessToken, nextMonthSheetName, "A4", [
        [format(firstDayOfNextMonth, "yyyy/MM/dd")],
      ]);
    }
  } catch (e) {
    console.error(e);
  }
};

export const fetch = async (env: Env, request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return new Response("It's works");
  }

  await handler(env);
  return new Response("success");
};

export const scheduled = handler;
