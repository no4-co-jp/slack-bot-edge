import type { AnySendableMessageBlock } from "slack-cloudflare-workers";
import { format } from "date-fns";

// ---

const trigger = ":otsukaresama:" as const;

// ---

export const toTitle = (date: Date): string => {
  return `${trigger} ${format(date, "yyyy/MM/dd (E)")}`;
};

// ---

export const toBlocks = (date: Date): AnySendableMessageBlock[] => {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: toTitle(date),
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          "在宅ワークの皆さん、お疲れ様です。",
          format(date, "H:00") +
            "を過ぎました。そろそろ皆さん終了の時間かと思います。",
          "本日も1日、お疲れ様でした。:chatwork_ありがとう:",
        ].join("\n"),
      },
    },
  ];
};
