import { format } from "date-fns";
import type {
  AnySendableMessageBlock,
  SlackAPIClient,
} from "slack-cloudflare-workers";
import type { Reaction } from "slack-web-api-client/dist/client/generated-response/ReactionsGetResponse";
import type { Member } from "slack-web-api-client/dist/client/generated-response/UsersListResponse";
import { fetchUsers } from "~/apis/slack";
import {
  fetchWFOUsers,
  fetchLeaveUsers,
  fetchAMLeaveUsers,
  fetchAllUsers,
} from "~/apis/sheet";
import type { Env } from "~/@types/app";

// ---

export const trigger = ":ohayou:" as const;

// ---

export const toTitle = (date: Date): string => {
  return `${trigger} ${format(date, "yyyy/MM/dd (E)")}`;
};

// ---

const toUserNames = (users: Member[]): string[] => {
  return (
    users.map((user: Member): string => {
      return user.profile?.display_name || user.real_name || "unknown";
    }) ?? []
  );
};

// ---

type ReactionRecord = {
  name: string;
  users: Member[];
};

export const toReactionRecords = async (
  env: Env,
  context: ExecutionContext,
  client: SlackAPIClient,
  date: Date,
  reactions: Reaction[] = []
): Promise<ReactionRecord[]> => {
  const allUserIdSet = new Set<string>(await fetchAllUsers(env, date));

  const users = (await fetchUsers(context, client)).filter(
    ({ id }: Member): boolean => {
      return id !== undefined && allUserIdSet.has(id);
    }
  );

  const reactedUserIds = reactions.flatMap(({ users }: Reaction): string[] => {
    return users ?? [];
  });
  const reactedUserIdSet = new Set<string>(reactedUserIds);

  const wfoUserIds = (await fetchWFOUsers(env, date)).filter(
    (id: string): boolean => {
      return !reactedUserIdSet.has(id);
    }
  );
  const wfoUserIdSet = new Set<string>(wfoUserIds);

  const leaveUserIds = (await fetchLeaveUsers(env, date)).filter(
    (id: string): boolean => {
      return !reactedUserIdSet.has(id);
    }
  );
  const leaveUserIdSet = new Set<string>(leaveUserIds);

  const amLeaveUserIds = (await fetchAMLeaveUsers(env, date)).filter(
    (id: string): boolean => {
      return !reactedUserIdSet.has(id);
    }
  );
  const amLeaveUserIdSet = new Set<string>(amLeaveUserIds);

  const reactedAllUserIdSet = new Set<string>([
    ...reactedUserIds,
    ...wfoUserIds,
    ...leaveUserIds,
    ...amLeaveUserIds,
  ]);

  const noReactedUsers: Member[] = users.filter(({ id }: Member): boolean => {
    return id !== undefined && !reactedAllUserIdSet.has(id);
  });

  return [
    ...reactions.map((reaction: Reaction): ReactionRecord => {
      return {
        name: reaction.name ?? "-",
        users:
          reaction.users?.reduce((prev: Member[], id: string): Member[] => {
            const user = users.find((user: Member): boolean => {
              return id === user.id;
            });

            return user ? [...prev, user] : prev;
          }, []) ?? [],
      };
    }),
    ...(wfoUserIdSet.size > 0
      ? [
          {
            name: "zisya",
            users: users.filter(({ id }: Member): boolean => {
              return !!id && wfoUserIdSet.has(id);
            }),
          },
        ]
      : []),
    ...(leaveUserIdSet.size > 0
      ? [
          {
            name: "oyasumi",
            users: users.filter(({ id }: Member): boolean => {
              return !!id && leaveUserIdSet.has(id);
            }),
          },
        ]
      : []),
    ...(amLeaveUserIdSet.size > 0
      ? [
          {
            name: "午前半休",
            users: users.filter(({ id }: Member): boolean => {
              return !!id && amLeaveUserIdSet.has(id);
            }),
          },
        ]
      : []),
    {
      name: "no-ria",
      users: noReactedUsers,
    },
  ];
};

// ---

export const toBlocks = (
  title: string,
  reactionRecords: ReactionRecord[]
): AnySendableMessageBlock[] => {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: title,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Reactions*",
      },
    },
    {
      type: "divider",
    },
    ...reactionRecords.map<AnySendableMessageBlock>(
      (reactionRecord: ReactionRecord): AnySendableMessageBlock => {
        return {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `:${reactionRecord.name}: (${reactionRecord.users.length})` +
              (reactionRecord.users.length > 0
                ? `\n\`\`\`${toUserNames(reactionRecord.users).join(
                    ", "
                  )}\`\`\``
                : ``) +
                `\n休みや出社日の変更は[こちら](https://no4-chat.slack.com/canvas/CQYH702Q4?focus_section_id=temp:C:cUL36314564bcff4c80a892852b3)から`,
          },
        };
      }
    ),
    {
      type: "divider",
    },
  ];
};
