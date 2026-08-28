import { Router } from "express";
import { metricsRegistry } from "../utils/metrics.js";

const router = Router();

router.get("/", async (req, res) => {
  res.set("Content-Type", metricsRegistry.contentType);

  res.end(await metricsRegistry.metrics());
});

export default router;