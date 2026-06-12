/**
 * Falcon Server
 
 * The Falcon server acts as a proxy/gateway between external ad requests and the ad server.
 * It's responsible for:
 * 1. Receiving ad requests from publishers
 * 2. Checking suppression lists (YOUR IMPLEMENTATION HERE)  
 * 3. Calling the ad server with appropriate parameters
 * 4. Returning the final ad response
 * 
 * IMPLEMENTATION AREAS (marked with TODO):
 * - loadSuppressionLists(): Load your suppression data structure
 * - checkUserSuppression(): Core suppression checking logic
 * - Performance optimizations for high-volume requests
 */

const fs = require('fs');
const { AdServer, AdRequest } = require('./ad_server');

class FalconRequest {
  constructor(placementId, userIdentifiers, siteId, pageUrl, userAgent = null, ipAddress = null) {
    this.placementId = placementId;
    this.userIdentifiers = userIdentifiers; // {"email_hash": "...", "device_id": "..."}
    this.siteId = siteId;
    this.pageUrl = pageUrl;
    this.userAgent = userAgent;
    this.ipAddress = ipAddress;
  }
}

class SuppressionCheckResult {
  constructor(suppressedAdvertisers, totalListsChecked, processingTimeMs, details) {
    this.suppressedAdvertisers = suppressedAdvertisers; // Set of advertiser IDs
    this.totalListsChecked = totalListsChecked;
    this.processingTimeMs = processingTimeMs;
    this.details = details; // Array of debug information
  }
}

class FalconServer {
  constructor(adServer) {
    this.adServer = adServer;
    this.suppressionData = null;
    this.performanceCache = {}; // Add caching for performance
    
    // Load suppression lists on startup
    // await this.loadSuppressionLists();
    
    console.log('[FalconServer] Initialized with suppression integration');
  }
}

function createTestRequests() {
  return [
    new FalconRequest(
      "pl_12345",
      {
        email_hash: "a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd",
        device_id: "550e8400-e29b-41d4-a716-446655440000"
      },
      "site_001",
      "https://technews.com/homepage"
    ),
    new FalconRequest(
      "pl_12345",
      {
        email_hash: "vip1234567890abcdefvip1234567890abcdefvip1234567890abcdefvip123"
      },
      "site_001",
      "https://technews.com/article"
    ),
    new FalconRequest(
      "pl_54321",
      {
        device_id: "iosdevice-1111-2222-3333-444444444444"
      },
      "site_002",
      "https://gaminghub.com/mobile"
    )
  ];
}

function main() {
  console.log("=== Falcon Server Test ===");
  
  // Initialize servers
  const adServer = new AdServer();
  const falconServer = new FalconServer(adServer);
  
  // Test with sample requests
  const testRequests = createTestRequests();
  
  testRequests.forEach((request, i) => {
    console.log(`\n--- Test Request ${i + 1} ---`);
    console.log(`Placement: ${request.placementId}`);
    console.log(`User Identifiers:`, request.userIdentifiers);
    
    // Serve ad with suppression
    const [adResponse, suppressionResult] = falconServer.serveAdWithSuppression(request);
    
    console.log(`\nSuppression Result:`);
    console.log(`  Suppressed Advertisers:`, Array.from(suppressionResult.suppressedAdvertisers));
    console.log(`  Lists Checked: ${suppressionResult.totalListsChecked}`);
    console.log(`  Processing Time: ${suppressionResult.processingTimeMs.toFixed(2)}ms`);
    
    console.log(`\nAd Response:`);
    console.log(`  Banner ID: ${adResponse.bannerId}`);
    console.log(`  Advertiser ID: ${adResponse.advertiserId}`);
    console.log(`  Served: ${adResponse.served}`);
    console.log(`  Reason: ${adResponse.reason}`);
    console.log(`  Processing Time: ${adResponse.processingTimeMs.toFixed(2)}ms`);
  });
}

// Export for use as module
module.exports = {
  FalconServer,
  FalconRequest,
  SuppressionCheckResult
};

// Run example if this file is executed directly
if (require.main === module) {
  main();
}
