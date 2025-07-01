class RateLimiter {
  constructor(requestsPerSecond = 10, maximumBurstSize = 20) {
    this.requestsPerSecond = requestsPerSecond;
    this.maximumBurstSize = maximumBurstSize;
    this.availableTokens = maximumBurstSize;
    this.lastTokenRefillTime = Date.now();
    this.requestQueue = [];
    this.isProcessingQueue = false;
  }

  async acquire() {
    return new Promise((resolveRequest) => {
      this.requestQueue.push(resolveRequest);
      this.processQueue();
    });
  }

  processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    this.refillTokens();

    if (this.availableTokens > 0) {
      this.availableTokens--;
      const nextRequestResolver = this.requestQueue.shift();
      nextRequestResolver();
      this.isProcessingQueue = false;

      // Process next item if available
      if (this.requestQueue.length > 0) {
        setImmediate(() => this.processQueue());
      }
    } else {
      // Calculate delay until next token is available
      const delayUntilNextToken = Math.ceil(1000 / this.requestsPerSecond);
      setTimeout(() => {
        this.isProcessingQueue = false;
        this.processQueue();
      }, delayUntilNextToken);
    }
  }

  refillTokens() {
    const currentTime = Date.now();
    const timeElapsedSinceLastRefill = currentTime - this.lastTokenRefillTime;
    const tokensToRefill = Math.floor(
      (timeElapsedSinceLastRefill / 1000) * this.requestsPerSecond
    );

    if (tokensToRefill > 0) {
      this.availableTokens = Math.min(
        this.maximumBurstSize,
        this.availableTokens + tokensToRefill
      );
      this.lastTokenRefillTime = currentTime;
    }
  }

  getStatus() {
    this.refillTokens();
    return {
      availableTokens: this.availableTokens,
      queueLength: this.requestQueue.length,
      requestsPerSecond: this.requestsPerSecond,
      maximumBurstSize: this.maximumBurstSize,
    };
  }
}

// Global rate limiters for different vendors
const synchronousVendorLimiter = new RateLimiter(
  parseInt(process.env.VENDOR_RATE_LIMIT_PER_SECOND) || 10,
  parseInt(process.env.VENDOR_RATE_LIMIT_BURST) || 20
);

const asynchronousVendorLimiter = new RateLimiter(
  parseInt(process.env.VENDOR_RATE_LIMIT_PER_SECOND) || 10,
  parseInt(process.env.VENDOR_RATE_LIMIT_BURST) || 20
);

module.exports = {
  RateLimiter,
  syncVendorLimiter: synchronousVendorLimiter,
  asyncVendorLimiter: asynchronousVendorLimiter,
};
