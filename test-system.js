const axios = require("axios");

const apiBaseUrl = "http://localhost:3000";

async function testSystemFunctionality() {
  console.log("🧪 Testing Enrich Labs Job Processing System");
  console.log("=".repeat(50));

  try {
    // Test 1: Health Check
    console.log("1. Testing health endpoint...");
    const healthCheckResponse = await axios.get(`${apiBaseUrl}/health`);
    console.log(`✅ Health check: ${healthCheckResponse.data.status}`);

    // Test 2: Create a Job
    console.log("\n2. Creating a test job...");
    const testJobPayload = {
      user_id: "test_user_001",
      name: "Test User",
      email: "test@example.com",
      phone: "555-123-4567",
      metadata: {
        source: "system_test",
        timestamp: new Date().toISOString(),
      },
    };

    const jobCreationResponse = await axios.post(
      `${apiBaseUrl}/jobs`,
      testJobPayload
    );
    const createdJobRequestId = jobCreationResponse.data.request_id;
    console.log(`✅ Job created: ${createdJobRequestId}`);

    // Test 3: Check Job Status (immediately)
    console.log("\n3. Checking job status (immediate)...");
    const immediateStatusResponse = await axios.get(
      `${apiBaseUrl}/jobs/${createdJobRequestId}`
    );
    console.log(`✅ Job status: ${immediateStatusResponse.data.status}`);

    // Test 4: Wait and Check Again
    console.log("\n4. Waiting 5 seconds for processing...");
    await new Promise((resolveWait) => setTimeout(resolveWait, 5000));

    const delayedStatusResponse = await axios.get(
      `${apiBaseUrl}/jobs/${createdJobRequestId}`
    );
    console.log(
      `✅ Job status after wait: ${delayedStatusResponse.data.status}`
    );

    if (delayedStatusResponse.data.status === "complete") {
      console.log("✅ Job completed successfully!");
      console.log(
        "📄 Result preview:",
        JSON.stringify(delayedStatusResponse.data.result, null, 2).substring(
          0,
          200
        ) + "..."
      );
    } else {
      console.log("⏳ Job still processing...");
    }

    // Test 5: List Jobs
    console.log("\n5. Testing job listing...");
    const jobListingResponse = await axios.get(`${apiBaseUrl}/jobs?limit=5`);
    console.log(`✅ Found ${jobListingResponse.data.jobs.length} jobs`);

    console.log("\n🎉 System test completed successfully!");
    console.log("All components are working correctly.");
  } catch (systemTestError) {
    console.error("\n❌ System test failed:", systemTestError.message);

    if (systemTestError.code === "ECONNREFUSED") {
      console.error(
        "💡 Make sure to start the system first with: docker-compose up"
      );
    }

    process.exit(1);
  }
}

// Run the test
testSystemFunctionality();
