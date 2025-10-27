/**
 * Complete Ad Server Implementation (JavaScript/Node.js)
 * 
 * This is a fully functional ad server that handles:
 * - Banner selection based on weights and targeting rules
 * - Custom parameter include/exclude logic  
 * - Real ad serving decisions
 * - Performance optimizations
 * 
 * YOU SHOULD NOT MODIFY THIS FILE - it represents an external ad server.
 * 
 * Your task is to implement suppression logic in the Falcon server (falcon_server.js)
 * that calls this ad server and filters results based on advertiser-specific suppression lists.
 */

const fs = require('fs');
const path = require('path');

class AdRequest {
  constructor(placementId, userEmailHash, userDeviceId, siteId, pageUrl, userAgent = null, ipAddress = null, customParams = {}) {
    this.placementId = placementId;
    this.userEmailHash = userEmailHash;
    this.userDeviceId = userDeviceId;
    this.siteId = siteId;
    this.pageUrl = pageUrl;
    this.userAgent = userAgent;
    this.ipAddress = ipAddress;
    this.customParams = customParams;
  }
}

class Banner {
  constructor(id, advertiserId, campaignId, name, creativeUrl, landingPage, weight, includeParams, excludeParams) {
    this.id = id;
    this.advertiserId = advertiserId;
    this.campaignId = campaignId;
    this.name = name;
    this.creativeUrl = creativeUrl;
    this.landingPage = landingPage;
    this.weight = weight;
    this.includeParams = includeParams || {};
    this.excludeParams = excludeParams || {};
  }
}

class AdResponse {
  constructor(bannerId, advertiserId, creativeUrl, landingPage, served, reason, processingTimeMs) {
    this.bannerId = bannerId;
    this.advertiserId = advertiserId;
    this.creativeUrl = creativeUrl;
    this.landingPage = landingPage;
    this.served = served;
    this.reason = reason;
    this.processingTimeMs = processingTimeMs;
  }
}

class AdServer {
  constructor(configFile = 'mock_data/ad_server_config.json') {
    this.config = this.loadConfig(configFile);
    this.banners = this.indexBanners();
    this.placements = this.indexPlacements();
    
    // Performance optimization: pre-compute placement mappings
    this.placementBannerCache = this.buildPlacementCache();
    
    console.log(`[AdServer] Initialized with ${Object.keys(this.banners).length} banners and ${Object.keys(this.placements).length} placements`);
  }

  loadConfig(configFile) {
    try {
      const configPath = path.resolve(configFile);
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.warn(`[AdServer] Warning: Config file ${configFile} not found. Using empty config.`);
      return { advertisers: [], publishers: [] };
    }
  }

  indexBanners() {
    const banners = {};
    
    for (const advertiser of this.config.advertisers || []) {
      const advertiserId = advertiser.id;
      for (const campaign of advertiser.campaigns || []) {
        const campaignId = campaign.id;
        for (const bannerData of campaign.banners || []) {
          // Extract targeting rules from banner configuration
          const targetingRules = bannerData.targeting_rules || {};
          
          const banner = new Banner(
            bannerData.id,
            advertiserId,
            campaignId,
            bannerData.name,
            bannerData.creative_url,
            bannerData.landing_page,
            bannerData.weight || 100,
            targetingRules.include_params || {},
            targetingRules.exclude_params || {}
          );
          banners[banner.id] = banner;
        }
      }
    }
    
    return banners;
  }

  indexPlacements() {
    const placements = {};
    
    for (const publisher of this.config.publishers || []) {
      for (const site of publisher.sites || []) {
        for (const placement of site.placements || []) {
          placements[placement.id] = placement;
        }
      }
    }
    
    return placements;
  }

  buildPlacementCache() {
    const cache = {};
    
    for (const [placementId, placement] of Object.entries(this.placements)) {
      const allowedBannerIds = placement.allowed_banners || [];
      cache[placementId] = allowedBannerIds
        .filter(bannerId => this.banners[bannerId])
        .map(bannerId => this.banners[bannerId]);
    }
    
    return cache;
  }

  checkTargetingRules(banner, request) {
    /**
     * Check if banner's targeting rules match the request.
     * Returns [isEligible, reason]
     */
    
    // Check include parameters - ALL must match
    for (const [paramKey, requiredValue] of Object.entries(banner.includeParams)) {
      const requestValue = request.customParams[paramKey];
      if (requestValue !== requiredValue) {
        return [false, `Include rule failed: ${paramKey} = ${requestValue}, required = ${requiredValue}`];
      }
    }
    
    // Check exclude parameters - NONE must match
    for (const [paramKey, excludedValue] of Object.entries(banner.excludeParams)) {
      const requestValue = request.customParams[paramKey];
      
      // Special handling for arrays (like suppress_advertisers)
      if (Array.isArray(requestValue) && requestValue.includes(excludedValue)) {
        return [false, `Exclude rule matched: ${paramKey} contains ${excludedValue}`];
      } else if (requestValue === excludedValue) {
        return [false, `Exclude rule matched: ${paramKey} = ${requestValue}`];
      }
    }
    
    return [true, "Targeting rules passed"];
  }

  selectBannerWeighted(eligibleBanners) {
    if (eligibleBanners.length === 0) {
      return null;
    }
    
    const totalWeight = eligibleBanners.reduce((sum, banner) => sum + banner.weight, 0);
    if (totalWeight === 0) {
      return eligibleBanners[Math.floor(Math.random() * eligibleBanners.length)];
    }
    
    // Weighted random selection
    const target = Math.random() * totalWeight;
    let currentWeight = 0;
    
    for (const banner of eligibleBanners) {
      currentWeight += banner.weight;
      if (currentWeight >= target) {
        return banner;
      }
    }
    
    // Fallback
    return eligibleBanners[eligibleBanners.length - 1];
  }

  serveAd(request) {
    /**
     * Main ad serving method.
     * 
     * Process:
     * 1. Get banners eligible for placement
     * 2. Apply targeting rules (include/exclude)
     * 3. Select banner using weighted algorithm
     * 4. Return ad response
     */
    const startTime = Date.now();
    
    // Get eligible banners for this placement
    const eligibleBanners = this.placementBannerCache[request.placementId] || [];
    
    if (eligibleBanners.length === 0) {
      return new AdResponse(
        null,
        null,
        null,
        null,
        false,
        `No banners configured for placement ${request.placementId}`,
        Date.now() - startTime
      );
    }
    
    // Apply targeting rules to filter banners
    const targetedBanners = [];
    for (const banner of eligibleBanners) {
      const [isEligible, reason] = this.checkTargetingRules(banner, request);
      if (isEligible) {
        targetedBanners.push(banner);
      }
    }
    
    if (targetedBanners.length === 0) {
      return new AdResponse(
        null,
        null,
        null,
        null,
        false,
        "No banners passed targeting rules",
        Date.now() - startTime
      );
    }
    
    // Select final banner using weights
    const selectedBanner = this.selectBannerWeighted(targetedBanners);
    
    if (!selectedBanner) {
      return new AdResponse(
        null,
        null,
        null,
        null,
        false,
        "Banner selection failed",
        Date.now() - startTime
      );
    }
    
    return new AdResponse(
      selectedBanner.id,
      selectedBanner.advertiserId,
      selectedBanner.creativeUrl,
      selectedBanner.landingPage,
      true,
      "Ad served successfully",
      Date.now() - startTime
    );
  }

  getBannerInfo(bannerId) {
    return this.banners[bannerId] || null;
  }

  getPlacementInfo(placementId) {
    return this.placements[placementId] || null;
  }
}

function main() {
  // Example usage of the ad server
  const adServer = new AdServer();
  
  // Example ad request with custom parameters
  const request = new AdRequest(
    "pl_12345",
    "a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd",
    "550e8400-e29b-41d4-a716-446655440000",
    "site_001",
    "https://technews.com/homepage",
    null,
    null,
    {
      user_segment: "tech_enthusiast",
      suppress_advertisers: []  // This is where Falcon will inject suppression data
    }
  );
  
  // Serve an ad
  const response = adServer.serveAd(request);
  
  console.log("\n[AdServer] Example Ad Response:");
  console.log(`Banner ID: ${response.bannerId}`);
  console.log(`Advertiser ID: ${response.advertiserId}`);
  console.log(`Creative URL: ${response.creativeUrl}`);
  console.log(`Landing Page: ${response.landingPage}`);
  console.log(`Served: ${response.served}`);
  console.log(`Reason: ${response.reason}`);
  console.log(`Processing Time: ${response.processingTimeMs.toFixed(2)}ms`);
}

// Export for use as module
module.exports = {
  AdServer,
  AdRequest,
  Banner,
  AdResponse
};

// Run example if this file is executed directly
if (require.main === module) {
  main();
}