import { z } from "zod";
import { ExplorerCapture } from "./browser.js";
import { buildTokenServer } from "./server.js";
const config = z
  .object({
    GRAPH_SCRAP_API_KEY: z.string().min(32),
    PORT: z.coerce.number().int().min(1024).max(65535).default(3101),
    HOST: z.enum(["127.0.0.1", "0.0.0.0"]).default("127.0.0.1"),
  })
  .safeParse(process.env);
if (!config.success) {
  console.error("invalid_graph_scrap_configuration");
  process.exit(1);
}
const app = buildTokenServer(
  new ExplorerCapture(),
  config.data.GRAPH_SCRAP_API_KEY,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close();
  });
try {
  await app.listen({ host: config.data.HOST, port: config.data.PORT });
  console.log("graph_scrap_ready");
} catch {
  console.error("graph_scrap_start_failed");
  process.exitCode = 1;
}
