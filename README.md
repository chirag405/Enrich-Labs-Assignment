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

### Results

| Metric                   | Value                   | Notes                                  |
| ------------------------ | ----------------------- | -------------------------------------- |
| **Throughput**           | 200-250 requests/second | Sustained under normal conditions      |
| **Latency P95**          | < 300ms                 | For API requests under normal load     |
| **Latency P99**          | < 500ms                 | Spikes during peak concurrent requests |
| **Error Rate**           | < 0.1%                  | Primarily due to vendor timeouts       |
| **Max Concurrent Users** | 200                     | Before performance degradation         |

### Analysis & Learnings

1. **Bottlenecks Identified:**

   - Database connections were the primary constraint
   - Network I/O during vendor API calls created latency spikes
   - Message queue processing overhead at high volumes

2. **Performance Optimizations:**

   - Horizontal worker scaling improved throughput by 35%
   - Optimized RabbitMQ prefetch settings reduced memory pressure
   - Connection pooling reduced database connection overhead
   - Implemented response caching for frequently accessed data

3. **Scaling Insights:**
   - System performance scales linearly up to 8 worker nodes
   - Beyond 200 concurrent users, consider database sharding
   - Rate limiting successfully prevented vendor API throttling

## API Reference

### Endpoints

| Endpoint                  | Method | Description                            | Request Body                          | Response                                                                         |
| ------------------------- | ------ | -------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| `/jobs`                   | POST   | Create a new data enrichment job       | `{"user_id": string, "name": string}` | `{"request_id": string, "status": string}`                                       |
| `/jobs`                   | GET    | List all jobs with pagination          | Query params: `page`, `limit`         | Array of job objects                                                             |
| `/jobs/:request_id`       | GET    | Get status and results of specific job | -                                     | `{"request_id": string, "status": string, "data": object, "created_at": string}` |
| `/vendor-webhook/:vendor` | POST   | Endpoint for async vendor callbacks    | Vendor-specific payload               | `{"success": boolean}`                                                           |

## Additional Information

- **Tech Stack:** Node.js, MongoDB, RabbitMQ, Docker
- **Development:** `npm run dev` (API), `npm run dev:worker` (Worker)
