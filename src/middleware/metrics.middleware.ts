import { Request, Response, NextFunction } from "express";
import {
  httpRequestsTotal,
  httpRequestDuration,
  httpRequestsInProgress,
} from "../utils/metrics.js";

export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Don't record the /metrics endpoint itself.
  if (req.path === "/metrics") {
    next();
    return;
  }

  const start = process.hrtime.bigint();

  // We don't know the Express route yet because
  // route matching happens later in the middleware chain.
  //
  // Use the request path temporarily for the in-progress metric.
  // We'll remove this temporary label when the request finishes.
  const initialRoute = req.path;

  httpRequestsInProgress.inc({
    method: req.method,
    route: initialRoute,
  });

  res.on("finish", () => {
    const duration =
      Number(process.hrtime.bigint() - start) / 1_000_000_000;

    // Express has now matched the route.
    //
    // Example:
    //   /api/sessions/123
    //
    // becomes:
    //   /:id
    //
    // when mounted under /api/sessions.
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.path;

    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
    };

    // Total requests.
    httpRequestsTotal.inc(labels);

    // Request duration.
    httpRequestDuration.observe(labels, duration);

    // Remove the request from the in-progress gauge.
    httpRequestsInProgress.dec({
      method: req.method,
      route: initialRoute,
    });
  });

  next();
};