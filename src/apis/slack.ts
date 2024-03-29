import type {
  ReactionAddedEvent,
  ReactionRemovedEvent,
  SlackAPIClient,
  SlackAPIResponse,
} from "slack-cloudflare-workers";
import type { ReactionsGetResponse } from "slack-web-api-client/dist/client/generated-response/ReactionsGetResponse";
import type {
  Member,
  UsersListResponse,
} from "slack-web-api-client/dist/client/generated-response/UsersListResponse";

// ---

export const fetchUsers = async (
  context: ExecutionContext,
  kv: KVNamespace,
  client: SlackAPIClient
): Promise<Member[]> => {
  const response = await cache<UsersListResponse>(
    context,
    kv,
    `slack.users.list`,
    (): Promise<UsersListResponse> => {
      return client.users.list({ presence: true });
    },
    60
  );

  return (
    response.members?.filter((user: Member): boolean => {
      return !user.is_bot && !user.is_app_user && !user.deleted && user.id !== "USLACKBOT";
    }) ?? []
  );
};

// ---

export const fetchReactions = async (
  context: ExecutionContext,
  client: SlackAPIClient,
  { item: { channel, ts } }: ReactionAddedEvent | ReactionRemovedEvent
): Promise<ReactionsGetResponse> => {
  // return cache<ReactionsGetResponse>(
  //   context,
  //   `slack.reactions.${channel}.${ts}`,
  //   (): Promise<ReactionsGetResponse> => {
  //     return client.reactions.get({
  //       channel,
  //       timestamp: ts,
  //       full: true,
  //     });
  //   },
  //   2
  // );
  const response = await client.reactions.get({
    channel,
    timestamp: ts,
    full: true,
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response;
};

// ---

const cache = async <T extends SlackAPIResponse>(
  context: ExecutionContext,
  kv: KVNamespace,
  key: string,
  fetch: () => Promise<T>,
  ttl: number
): Promise<T> => {
  const cached = await kv.get(key, {
    cacheTtl: ttl,
  });

  if (cached) {
    console.log(`cache hit : ${key}`);
    return JSON.parse(cached) as T;
  }

  const result = await fetch();

  if (result.ok) {
    context.waitUntil(kv.put(key, JSON.stringify(result), { expirationTtl: ttl }));
  }

  return result;
};
