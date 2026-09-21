import { consumeProbe } from "../../src/lib/deployment-probe";

export default {
  async queue(batch, env) {
    for (const message of batch.messages) {
      await consumeProbe(batch.queue, message, env.PDF_BUCKET);
    }
  },
} satisfies ExportedHandler<PdfConsumerEnv>;
