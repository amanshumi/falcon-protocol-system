/**
 * Falcon Server - Your Implementation Space (JavaScript/Node.js)
 * 
 * This is where you implement the suppression list logic for Part 3 of the assignment.
 * 
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

  // loadSuppressionLists() {
  //   /**
  //    * TODO: IMPLEMENT THIS METHOD
  //    * 
  //    * Load and index your suppression lists for fast lookups.
  //    * 
  //    * Consider:
  //    * - How to efficiently map user_id -> list of suppressed advertisers
  //    * - Whether to use in-memory structures, databases, etc.
  //    * - How to handle updates when new lists arrive
  //    * - Performance optimizations for millions of identifiers
  //    * 
  //    * Example structure you might want to build:
  //    * {
  //    *   "a1b2c3d4e5f6...": new Set(["adv_techcorp", "adv_luxurystore"]),
  //    *   "550e8400-e29b-41d4...": new Set(["adv_gamestudio"])
  //    * }
  //    */
  //   console.log('[FalconServer] TODO: Implement suppression list loading');
    
  //   // PLACEHOLDER - Replace with your implementation
  //   this.suppressionData = {};
    
  //   // Hint: You might want to load from:
  //   // - mock_data/sample_suppression_lists.json
  //   // - Your own storage system from Parts 1 & 2
  //   // - Database, cache, etc.
  // }

  // checkUserSuppression(userIdentifiers) {
  //   /**
  //    * TODO: IMPLEMENT THIS METHOD
  //    * 
  //    * Check if a user should be suppressed for any advertisers.
  //    * 
  //    * Args:
  //    *   userIdentifiers: Object like {"email_hash": "...", "device_id": "..."}
  //    * 
  //    * Returns:
  //    *   SuppressionCheckResult with set of suppressed advertisers
  //    * 
  //    * Consider:
  //    * - Checking multiple identifier types (email_hash, device_id)
  //    * - Performance for high-volume requests (caching, indexing)
  //    * - How to handle missing identifiers
  //    * - Temporal aspects (list submission times)
  //    */
  //   const startTime = Date.now();
    
  //   console.log(`[FalconServer] TODO: Implement suppression checking for`, userIdentifiers);
    
  //   // PLACEHOLDER - Replace with your implementation
  //   const suppressedAdvertisers = new Set();
  //   const listsChecked = 0;
  //   const details = [];
    
  //   // Your implementation should:
  //   // 1. Check each user identifier against suppression lists
  //   // 2. Collect all advertisers that want to suppress this user
  //   // 3. Return the set of suppressed advertiser IDs
    
  //   const processingTime = Date.now() - startTime;
    
  //   return new SuppressionCheckResult(
  //     suppressedAdvertisers,
  //     listsChecked,
  //     processingTime,
  //     details
  //   );
  // }

  // serveAdWithSuppression(falconRequest) {
  //   /**
  //    * Main method: serve an ad with suppression checking applied.
  //    * 
  //    * This method is already implemented and shows how suppression
  //    * integrates with ad serving. You implement the suppression logic above.
  //    */
    
  //   // Step 1: Check suppression lists
  //   const suppressionResult = this.checkUserSuppression(falconRequest.userIdentifiers);
  //   console.log(`[FalconServer] Suppression check list ${suppressionResult}`);
    
  //   // Step 2: Convert to ad server request with suppression data
  //   const adRequest = new AdRequest(
  //     falconRequest.placementId,
  //     falconRequest.userIdentifiers.email_hash || null,
  //     falconRequest.userIdentifiers.device_id || null,
  //     falconRequest.siteId,
  //     falconRequest.pageUrl,
  //     falconRequest.userAgent,
  //     falconRequest.ipAddress,
  //     {
  //       suppress_advertisers: Array.from(suppressionResult?.suppressedAdvertisers),
  //       suppression_check_time_ms: suppressionResult?.processingTimeMs
  //     }
  //   );
    
  //   // Step 3: Call ad server
  //   const adResponse = this.adServer.serveAd(adRequest);
    
  //   // Step 4: Post-process response (additional suppression if needed)
  //   if (adResponse.served && suppressionResult.suppressedAdvertisers.has(adResponse.advertiserId)) {
  //     // This advertiser should be suppressed - override the ad server response
  //     adResponse.served = false;
  //     adResponse.bannerId = null;
  //     adResponse.creativeUrl = null;
  //     adResponse.landingPage = null;
  //     adResponse.reason = `Advertiser ${adResponse.advertiserId} suppressed by Falcon`;
  //   }
    
  //   return [adResponse, suppressionResult];
  // }

  // getSuppressionStats() {
  //   /**
  //    * TODO: OPTIONALLY IMPLEMENT
  //    * 
  //    * Return statistics about suppression performance, cache hit rates, etc.
  //    * Useful for monitoring and optimization.
  //    */
  //   return {
  //     total_lists_loaded: 0,      // Implement me
  //     cache_hit_rate: 0.0,        // Implement me
  //     avg_lookup_time_ms: 0.0     // Implement me
  //   };
  // }
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