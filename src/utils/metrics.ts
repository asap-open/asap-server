import client from 'prom-client';

//Collect default metrics (CPU, Memory) and prefix them with "asap_"
client.collectDefaultMetrics({
  prefix: "asap_",
})

// Total number of HTTP requests,
export const httpRequestsTotal = new client.Counter({
  name: "asap_http_requests_total",
  help: "Total number of HTTP requests by ASAP API",
  labelNames: ["method", "route", "status_code"]
})

//HTTP request duration 
export const httpRequestDuration = new client.Histogram({
  name: "asap_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
})

//Number of HTTP requests currently being processed
export const httpRequestsInProgress = new client.Gauge({
  name: "asap_http_requests_in_progress",
  help: "Number of HTTP requests currently being processed",
  labelNames: ["method", "route"]
})

//Pormetheus registry used by the /metrics endpoint
export const metricsRegistry = client.register;
