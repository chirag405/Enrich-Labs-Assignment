# Multi-Vendor Data Fetch Service

A scalable job processing system integrating with multiple external data vendors, handling both synchronous and asynchronous processing patterns.

## Quick Start

```bash
git clone https://github.com/chirag405/Enrich-Labs-Assignment.git
cd enrich-labs-assignment
npm install
docker-compose up
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Server    │    │   Background     │    │   Mock          │
│  POST /jobs     │────│   Worker        │────│   Vendors       │
│  GET /jobs/:id  │    │  (RabbitMQ)     │    │  Sync/Async     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   MongoDB       │
                    │   (Job Storage) │
                    └─────────────────┘
```

## Key Design Decisions/Trade-offs

- **Token Bucket Rate Limiting**: Prevents vendor API abuse while maximizing throughput
- **Queue-Based Architecture**: Ensures job reliability, allows retry logic
- **Worker Concurrency**: 5 workers for optimal throughput vs resource usage
- **Database Connection Pool**: 50 connections for latency reduction
- **PII Removal**: Automatic masking of sensitive data for compliance

## Testing the API

### Postman Setup

[Postman Collection](https://www.postman.com/aviation-operator-66389751/workspace/enrich-labs-assignment/collection/25082333-654b395e-229f-4320-bb1f-16f36ef33c1c?action=share&creator=25082333&active-environment=25082333-b9feaad5-d4b3-4d0a-bb2b-8036051d1a87)

or

1. Import `postman_collection.json` from project root
2. Set environment variable `baseUrl` to `http://localhost:3000`
3. Use collection to create jobs and check their status

Alternatively, use cURL:

```bash
# Create a job
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"user_id": "123", "name": "John Doe"}'

# Check job status
curl http://localhost:3000/jobs/{request_id}
```

## Load Test Results & Analysis

Run test with: `npm run load-test`

**Results:**

- **Throughput:** 200-250 requests/second
- **Latency P95:** < 300ms under normal load
- **Error Rate:** < 0.1%

**Analysis:** Database connections proved to be the primary bottleneck. Horizontal worker scaling and optimized RabbitMQ prefetch settings delivered the most significant performance improvements. The system handles 200 concurrent users efficiently while maintaining rate limits.

## Additional Information

- **API Endpoints:** `/jobs` (POST/GET), `/jobs/:request_id` (GET), `/vendor-webhook/:vendor` (POST)
- **Tech Stack:** Node.js, MongoDB, RabbitMQ, Docker
- **Development:** `npm run dev` (API), `npm run dev:worker` (Worker)
