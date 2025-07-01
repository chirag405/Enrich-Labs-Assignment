const autocannon = require("autocannon");
const axios = require("axios");

const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:3000";
const loadTestDurationSeconds = 60; // 60 seconds
const concurrentConnectionsCount = 200; // 200 concurrent users

// Sample payloads for testing
const testPayloadSamples = [
  {
    user_id: "user_001",
    name: "John Doe",
    email: "john.doe@example.com",
    phone: "555-123-4567",
    company: "Tech Corp",
    role: "Software Engineer",
  },
  {
    customer_id: "cust_002",
    business_name: "Acme Inc",
    industry: "Manufacturing",
    revenue: 5000000,
    employees: 150,
    location: "San Francisco, CA",
  },
  {
    profile_id: "prof_003",
    age: 28,
    occupation: "Data Scientist",
    interests: ["technology", "machine learning", "travel"],
    income_range: "75k-100k",
    education: "Masters Degree",
  },
  {
    order_id: "ord_004",
    items: [
      { product: "laptop", quantity: 1, price: 1200 },
      { product: "mouse", quantity: 2, price: 25 },
    ],
    total: 1250,
    payment_method: "credit_card",
    shipping_address: "123 Main St, Anytown, USA",
  },
  {
    event_data: {
      type: "page_view",
      url: "/products",
      timestamp: new Date().toISOString(),
      user_agent: "Mozilla/5.0 Test Browser",
      ip_address: "192.168.1.100",
    },
    session_id: "sess_005",
    user_context: {
      logged_in: true,
      subscription: "premium",
    },
  },
];

// Store created job IDs for GET testing
let createdJobIdentifiersList = [];

// Custom request generator for mixed POST/GET traffic
const generateHttpRequest = () => {
  // 70% POST requests, 30% GET requests
  if (Math.random() < 0.7) {
    // POST /jobs request
    const selectedPayload =
      testPayloadSamples[Math.floor(Math.random() * testPayloadSamples.length)];
    return {
      method: "POST",
      path: "/jobs",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(selectedPayload),
    };
  } else {
    // GET /jobs/:request_id request
    if (createdJobIdentifiersList.length > 0) {
      const randomJobIdentifier =
        createdJobIdentifiersList[
          Math.floor(Math.random() * createdJobIdentifiersList.length)
        ];
      return {
        method: "GET",
        path: `/jobs/${randomJobIdentifier}`,
        headers: {},
      };
    } else {
      // Fallback to health check if no job IDs yet
      return {
        method: "GET",
        path: "/health",
        headers: {},
      };
    }
  }
};

// Pre-populate some job IDs by creating initial jobs
const prepopulateJobsForTesting = async () => {
  console.log("🚀 Pre-populating jobs for GET request testing...");

  try {
    const jobCreationPromises = [];
    for (let jobIndex = 0; jobIndex < 20; jobIndex++) {
      const selectedPayload =
        testPayloadSamples[jobIndex % testPayloadSamples.length];
      jobCreationPromises.push(
        axios
          .post(`${apiBaseUrl}/jobs`, selectedPayload)
          .then((apiResponse) => apiResponse.data.request_id)
          .catch((jobCreationError) => {
            console.warn(
              `Failed to create pre-population job ${jobIndex}:`,
              jobCreationError.message
            );
            return null;
          })
      );
    }

    const createdJobIdentifiers = await Promise.all(jobCreationPromises);
    createdJobIdentifiersList = createdJobIdentifiers.filter(
      (jobId) => jobId !== null
    );

    console.log(
      `✅ Pre-populated ${createdJobIdentifiersList.length} jobs for testing`
    );

    // Wait a bit for some jobs to potentially complete
    await new Promise((resolveWait) => setTimeout(resolveWait, 3000));
  } catch (prepopulationError) {
    console.error(
      "❌ Failed to pre-populate jobs:",
      prepopulationError.message
    );
  }
};

// Custom response handler to collect job IDs
const handleLoadTestResponse = (
  autocannonClient,
  httpStatusCode,
  responseBytes,
  responseTimeMs
) => {
  if (httpStatusCode === 201) {
    // This might be a POST /jobs response with a new job ID
    // In a real implementation, you'd parse the response body
    // For now, we'll use the pre-populated IDs
  }
};

// Run load test
const executeLoadTest = async () => {
  console.log("🔥 Starting Load Test");
  console.log(`📊 Target: ${apiBaseUrl}`);
  console.log(`⏱️  Duration: ${loadTestDurationSeconds} seconds`);
  console.log(`🔗 Connections: ${concurrentConnectionsCount}`);
  console.log(`📈 Mix: 70% POST /jobs, 30% GET /jobs/:id`);
  console.log("─".repeat(50));

  await prepopulateJobsForTesting();

  const autocannonInstance = autocannon({
    url: apiBaseUrl,
    connections: concurrentConnectionsCount,
    duration: loadTestDurationSeconds,
    requests: [
      // POST /jobs requests
      {
        method: "POST",
        path: "/jobs",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testPayloadSamples[0]),
        weight: 35, // 35% of traffic
      },
      {
        method: "POST",
        path: "/jobs",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testPayloadSamples[1]),
        weight: 35, // 35% of traffic
      },
      // GET requests
      {
        method: "GET",
        path: "/health",
        weight: 10, // 10% of traffic
      },
      {
        method: "GET",
        path: "/jobs",
        weight: 10, // 10% of traffic
      },
      {
        method: "GET",
        path: `/jobs/${createdJobIdentifiersList[0] || "test-id"}`,
        weight: 10, // 10% of traffic
      },
    ],
    headers: {
      "User-Agent": "Load-Test-Client/1.0",
    },
  });

  // Handle progress updates
  autocannonInstance.on("tick", (performanceCounter) => {
    const completionPercentage = Math.round(
      (performanceCounter.duration / (loadTestDurationSeconds * 1000)) * 100
    );
    const currentRequestsPerSecond = Math.round(
      performanceCounter.requests.mean
    );
    const currentLatencyMs = Math.round(performanceCounter.latency.mean);

    console.log(
      `⏳ Progress: ${completionPercentage}% | RPS: ${currentRequestsPerSecond} | Latency: ${currentLatencyMs}ms | Total: ${performanceCounter.requests.total}`
    );
  });

  // Handle completion
  autocannonInstance.on("done", (loadTestResults) => {
    console.log("\n🎯 Load Test Results");
    console.log("─".repeat(50));
    console.log(`📊 Total Requests: ${loadTestResults.requests.total}`);
    console.log(`⚡ Requests/sec: ${loadTestResults.requests.mean.toFixed(2)}`);
    console.log(
      `⏱️  Avg Latency: ${loadTestResults.latency.mean.toFixed(2)}ms`
    );
    console.log(`📈 Max Latency: ${loadTestResults.latency.max.toFixed(2)}ms`);
    console.log(`📉 Min Latency: ${loadTestResults.latency.min.toFixed(2)}ms`);
    console.log(`📋 Percentiles:`);
    console.log(`   50th: ${loadTestResults.latency.p50.toFixed(2)}ms`);
    console.log(`   90th: ${loadTestResults.latency.p90.toFixed(2)}ms`);
    console.log(`   95th: ${loadTestResults.latency.p95.toFixed(2)}ms`);
    console.log(`   99th: ${loadTestResults.latency.p99.toFixed(2)}ms`);

    // Status code breakdown
    console.log(`\n📈 Status Codes:`);
    Object.entries(loadTestResults.statusCodeStats).forEach(
      ([statusCode, statusStats]) => {
        console.log(
          `   ${statusCode}: ${statusStats.count} (${statusStats.percentage}%)`
        );
      }
    );

    // Error rate calculation
    const errorRate =
      (loadTestResults.errors / loadTestResults.requests.total) * 100;
    console.log(`\n❌ Error Rate: ${errorRate.toFixed(2)}%`);

    if (loadTestResults.errors > 0) {
      console.log(`⚠️  Total Errors: ${loadTestResults.errors}`);
    }

    // Throughput analysis
    console.log(`\n🚀 Throughput Analysis:`);
    console.log(
      `   Data Transferred: ${(
        loadTestResults.throughput.total /
        1024 /
        1024
      ).toFixed(2)} MB`
    );
    console.log(
      `   Average Throughput: ${(
        loadTestResults.throughput.mean / 1024
      ).toFixed(2)} KB/s`
    );

    // Connection analysis
    console.log(`\n🔗 Connection Stats:`);
    console.log(`   Total Connections: ${loadTestResults.connections}`);
    console.log(
      `   Average Connection Time: ${loadTestResults.latency.mean.toFixed(2)}ms`
    );

    // Performance verdict
    console.log(`\n🎯 Performance Verdict:`);
    if (loadTestResults.requests.mean > 100) {
      console.log(
        `✅ Good performance: ${loadTestResults.requests.mean.toFixed(2)} RPS`
      );
    } else if (loadTestResults.requests.mean > 50) {
      console.log(
        `⚠️  Moderate performance: ${loadTestResults.requests.mean.toFixed(
          2
        )} RPS`
      );
    } else {
      console.log(
        `❌ Poor performance: ${loadTestResults.requests.mean.toFixed(2)} RPS`
      );
    }

    if (errorRate < 1) {
      console.log(`✅ Low error rate: ${errorRate.toFixed(2)}%`);
    } else if (errorRate < 5) {
      console.log(`⚠️  Moderate error rate: ${errorRate.toFixed(2)}%`);
    } else {
      console.log(`❌ High error rate: ${errorRate.toFixed(2)}%`);
    }

    // Save results to file
    const fileSystemModule = require("fs");
    const currentTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const resultsFileName = `load-test-results-${currentTimestamp}.json`;

    try {
      fileSystemModule.writeFileSync(
        resultsFileName,
        JSON.stringify(loadTestResults, null, 2)
      );
      console.log(`\n💾 Results saved to: ${resultsFileName}`);
    } catch (fileSaveError) {
      console.error(`❌ Failed to save results: ${fileSaveError.message}`);
    }

    console.log("\n🏁 Load test completed!");
  });

  // Start the load test
  return autocannonInstance;
};

// Check if API is available before running load test
const checkApiHealthStatus = async () => {
  try {
    const healthCheckResponse = await axios.get(`${apiBaseUrl}/health`, {
      timeout: 5000,
    });

    console.log(`✅ API Health Check: ${healthCheckResponse.data.status}`);
    return true;
  } catch (healthCheckError) {
    console.error(`❌ API Health Check Failed: ${healthCheckError.message}`);
    console.error(
      "💡 Make sure the API server is running before starting the load test"
    );
    return false;
  }
};

// Main execution function
const executeMainLoadTest = async () => {
  console.log("🧪 Load Test Setup");
  console.log("─".repeat(50));

  const apiIsHealthy = await checkApiHealthStatus();

  if (!apiIsHealthy) {
    console.error("❌ Cannot start load test - API is not available");
    process.exit(1);
  }

  console.log("🚀 Starting load test in 3 seconds...");
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 3000));

  await executeLoadTest();
};

// Run the load test
executeMainLoadTest().catch((mainExecutionError) => {
  console.error("❌ Load test failed:", mainExecutionError.message);
  process.exit(1);
});

module.exports = {
  executeLoadTest,
  checkApiHealthStatus,
};
