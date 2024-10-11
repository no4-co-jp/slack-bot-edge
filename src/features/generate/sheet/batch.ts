import type { Env } from "~/@types/app";
import { generateNextMonthSheet } from "~/apis/sheet";

export const handler = async (env: Env): Promise<void> => {
  console.info(handler);
  const date = new Date(new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  console.log(date);

  const response = await generateNextMonthSheet(env, date);

  if (!response.ok) {
    console.error(console.error);
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
