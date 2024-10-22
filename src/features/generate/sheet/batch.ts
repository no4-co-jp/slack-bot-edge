import { format } from "date-fns";

import type { Env } from "~/@types/app";
import { generateNextMonthSheet, fetchAccessToken, duplicateSheet } from "~/apis/sheet";

export const handler = async (env: Env): Promise<void> => {
  console.info("handler");
  const date = new Date(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  console.log(date);

  const accessToken = await fetchAccessToken(env);

  // 翌月
  date.setMonth(date.getMonth() + 1);
  const newSheetName = format(date, "yyyy/M");

  const targetSheet = "テンプレート";
  const duplicatedSheet = await duplicateSheet(env, accessToken, targetSheet, newSheetName);

  await generateNextMonthSheet(env, date, duplicatedSheet.properties.title, accessToken);
};

export const fetch = async (env: Env, request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return new Response("It's works");
  }

  await handler(env);
  return new Response("success");
};

export const scheduled = handler;
