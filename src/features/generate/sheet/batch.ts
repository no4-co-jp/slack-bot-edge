import { format } from "date-fns";

import type { Env } from "~/@types/app";
import { changeToNextMonthSheet, fetchAccessToken, duplicateSheet } from "~/apis/sheet";

export const handler = async (env: Env): Promise<void> => {
  console.info("handler");
  const date = new Date(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  console.log(date);

  try {
    const accessToken = await fetchAccessToken(env);

    // 翌月
    date.setMonth(date.getMonth() + 1);
    const newSheetName = format(date, "yyyy/M");

    const duplicatedSheet = await duplicateSheet(env, accessToken, newSheetName);

    await changeToNextMonthSheet(env, date, duplicatedSheet.properties.title, accessToken);
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
