import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'gov_' });

export const httpRequestDurationHistogram = new client.Histogram({
  name: 'gov_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
});

export const httpRequestsTotal = new client.Counter({
  name: 'gov_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const fraudFlagsCounter = new client.Counter({
  name: 'gov_fraud_flags_total',
  help: 'Total number of fraud or duplicate flags triggered',
  labelNames: ['district', 'scheme_code', 'risk_score'],
});

export const duplicatesDetectedCounter = new client.Counter({
  name: 'gov_duplicates_detected_total',
  help: 'Total duplicate applications caught before disbursement',
  labelNames: ['grant_unit', 'match_type'],
});

export const liveSavingsCounter = new client.Gauge({
  name: 'gov_live_savings_inr',
  help: 'Total estimated public money saved by intercepting duplicate/fraud grants (INR)',
});

export const slaBreachesCounter = new client.Counter({
  name: 'gov_sla_breaches_total',
  help: 'Total number of applications that breached the initial SLA window',
  labelNames: ['stage', 'district'],
});

export const activeQueueJobsGauge = new client.Gauge({
  name: 'gov_queue_depth',
  help: 'Active jobs pending in background queues',
  labelNames: ['queue_name'],
});

export const register = client.register;
