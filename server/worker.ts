import handler from "vinext/server/fetch-handler";
import { logError } from "./report";
import { handleRecordsBatch, type RecordsJobMessage } from "./queue";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handler.fetch(request, env, ctx);
    } catch (error) {
      logError("worker.fetch", error, {
        method: request.method,
        path: new URL(request.url).pathname,
      });
      throw error;
    }
  },

  async queue(batch: MessageBatch<RecordsJobMessage>, env: Env): Promise<void> {
    await handleRecordsBatch(batch, env);
  },
} satisfies ExportedHandler<Env, RecordsJobMessage>;
