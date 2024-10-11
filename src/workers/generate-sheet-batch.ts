import type { Env } from "~/@types/app";
import { generate } from "~/features";

const handler: ExportedHandler<Env> = {
  fetch: (request: Request, env: Env, _context: ExecutionContext): Response | Promise<Response> => {
    return generate.sheet.batch.fetch(env, request);
  },
  scheduled: (
    _controller: ScheduledController,
    env: Env,
    _context: ExecutionContext
  ): Promise<void> => {
    return generate.sheet.batch.scheduled(env);
  },
};

export default handler;
