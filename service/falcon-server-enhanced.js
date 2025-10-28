const { FalconServer, FalconRequest, SuppressionCheckResult } = require('../falcon_server');
const SuppressionListManager = require('./suppression-list-manager');
const { performance } = require('perf_hooks');

class EnhancedFalconServer extends FalconServer {
    constructor(adServer, suppressionManager, options = {}) {
        super(adServer);
        
        this.config = {
            cacheEnabled: options.cache !== false,
            ...options
        };
        
        // 2. ASSIGN the manager directly. It's already initialized!
        this.suppressionManager = suppressionManager;
        this.cache = new Map();
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.stats = {
            totalRequests: 0,
            suppressionChecks: 0,
            averageLookupTime: 0
        };
    
        // 3. We are initialized BY DEFAULT now
        this.initialized = true; 

        console.log('[EnhancedFalconServer] Initialized and connected to suppression manager.');
    }

    async initialize() {        
        console.log('[EnhancedFalconServer] Starting initialization...');
        
        try {
            // STEP 1: Initialize suppression manager
            console.log('[EnhancedFalconServer] Step 1: Initializing suppression manager...');
            await this.suppressionManager.initialize();
            console.log('[EnhancedFalconServer] ✅ Suppression manager initialized');

            // STEP 2: Load sample data
            console.log('[EnhancedFalconServer] Step 2: Loading sample data...');
            await this.loadSuppressionLists();
            console.log('[EnhancedFalconServer] ✅ Sample data loaded');
            
            this.initialized = true;
            console.log('[EnhancedFalconServer] 🎉 Initialization complete!');
            
        } catch (error) {
            console.error('[EnhancedFalconServer] ❌ Initialization failed:', error);
            throw error;
        }
    }

    async loadSuppressionLists() {
        console.log('[EnhancedFalconServer] Loading suppression lists from sample data...');
        
        // CRITICAL: Check if suppressionManager exists and is initialized
        if (!this.suppressionManager) {
            console.error('[EnhancedFalconServer] ❌ suppressionManager is undefined!');
            throw new Error('suppressionManager is not initialized');
        }
        
        try {
            const sampleData = require('../mock_data/sample_suppression_lists.json');
            let loadedCount = 0;
            let errorCount = 0;
            
            console.log(`[EnhancedFalconServer] Found ${sampleData.length} lists to load`);
            
            for (const listData of sampleData) {
                try {
                    console.log(`[EnhancedFalconServer] Loading list: ${listData.id}`);
                    
                    // Double-check suppressionManager exists
                    if (!this.suppressionManager || !this.suppressionManager.createList) {
                        console.error(`[EnhancedFalconServer] suppressionManager.createList is not available for list ${listData.id}`);
                        continue;
                    }
                    
                    await this.suppressionManager.createList(listData);
                    loadedCount++;
                    console.log(`[EnhancedFalconServer] ✅ Loaded list: ${listData.id}`);
                    
                } catch (error) {
                    errorCount++;
                    if (error.message.includes('UNIQUE constraint failed')) {
                        console.log(`[EnhancedFalconServer] List ${listData.id} already exists`);
                    } else {
                        console.warn(`[EnhancedFalconServer] Failed to load list ${listData.id}:`, error.message);
                    }
                }
            }
            
            console.log(`[EnhancedFalconServer] 📊 Loaded ${loadedCount} lists, ${errorCount} errors`);
            return { loadedCount, errorCount };
            
        } catch (error) {
            console.error('[EnhancedFalconServer] Failed to load sample data:', error);
            throw error;
        }
    }

    async ensureInitialized() {
        if (!this.initialized) {
            console.log('[EnhancedFalconServer] Not initialized, initializing now...');
            await this.suppressionManager.initialize();
        }
    }

    async checkUserSuppression(userIdentifiers) {
        await this.ensureInitialized();
        const startTime = performance.now();
        const suppressedAdvertisers = new Set();
        const details = [];
        let listsChecked = 0;

        // Generate cache key
        const cacheKey = this.generateCacheKey(userIdentifiers);
        
        // Check cache first
        if (this.config.cacheEnabled && this.cache.has(cacheKey)) {
            this.cacheHits++;
            const cachedResult = this.cache.get(cacheKey);
            details.push('Result served from cache');
            return new SuppressionCheckResult(
                new Set(cachedResult.suppressedAdvertisers),
                cachedResult.listsChecked,
                performance.now() - startTime,
                [...details, ...cachedResult.details]
            );
        }
        this.cacheMisses++;

        // Check each identifier type
        for (const [identifierType, identifier] of Object.entries(userIdentifiers)) {
            if (!identifier) continue;

            try {
                const advertisers = await this.findAdvertisersForIdentifier(identifier, identifierType);
                listsChecked += advertisers.listsChecked;

                if (advertisers.suppressed.size > 0) {
                    advertisers.suppressed.forEach(adv => suppressedAdvertisers.add(adv));
                    details.push(`${identifierType} matched ${advertisers.suppressed.size} advertisers`);
                }
            } catch (error) {
                console.warn(`[EnhancedFalconServer] Error checking ${identifierType}:`, error.message);
                details.push(`Error checking ${identifierType}: ${error.message}`);
            }
        }

        const processingTime = performance.now() - startTime;

        // Update stats
        this.stats.totalRequests++;
        this.stats.suppressionChecks += listsChecked;
        this.stats.averageLookupTime = 
            (this.stats.averageLookupTime * (this.stats.totalRequests - 1) + processingTime) / this.stats.totalRequests;

        // Cache result
        if (this.config.cacheEnabled && suppressedAdvertisers.size > 0) {
            this.cache.set(cacheKey, {
                suppressedAdvertisers: Array.from(suppressedAdvertisers),
                listsChecked,
                details: [...details],
                timestamp: Date.now()
            });

            // Simple cache cleanup
            if (this.cache.size > 10000) {
                this.cleanupCache();
            }
        }

        return new SuppressionCheckResult(
            suppressedAdvertisers,
            listsChecked,
            processingTime,
            details
        );
    }

    async findAdvertisersForIdentifier(identifier, identifierType) {
        if (!this.initialized || !this.suppressionManager || !this.suppressionManager.db) {
            throw new Error('Suppression manager not initialized');
        }

        const results = await this.suppressionManager.db.all(`
            SELECT DISTINCT si.advertiser_id, sl.name as list_name
            FROM suppression_identifiers si
            JOIN suppression_lists sl ON si.list_id = sl.id
            WHERE si.identifier = ? AND si.identifier_type = ? AND sl.is_active = 1
        `, [identifier, identifierType]);

        return {
            suppressed: new Set(results.map(row => row.advertiser_id)),
            listsChecked: results.length,
            details: results.map(row => `Found in list: ${row.list_name}`)
        };
    }

    generateCacheKey(userIdentifiers) {
        const sortedEntries = Object.entries(userIdentifiers)
            .filter(([_, value]) => value)
            .sort(([a], [b]) => a.localeCompare(b));
        
        return sortedEntries.map(([key, value]) => `${key}:${value}`).join('|');
    }

    cleanupCache() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes
        
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > maxAge) {
                this.cache.delete(key);
            }
        }
    }

    getSuppressionStats() {
        const cacheHitRate = this.cacheHits + this.cacheMisses > 0 
            ? this.cacheHits / (this.cacheHits + this.cacheMisses) 
            : 0;

        return {
            total_lists_loaded: this.stats.totalRequests,
            cache_hit_rate: Math.round(cacheHitRate * 100),
            avg_lookup_time_ms: Math.round(this.stats.averageLookupTime * 100) / 100,
            cache_size: this.cache.size,
            total_suppression_checks: this.stats.suppressionChecks,
            initialized: this.initialized,
            suppression_manager_available: !!this.suppressionManager
        };
    }

    async serveAdWithSuppression(falconRequest) {
        await this.ensureInitialized();
        
        try {
            // Step 1: Check suppression lists
            const suppressionResult = await this.checkUserSuppression(falconRequest.userIdentifiers);
            
            // Step 2: Convert to ad server request with suppression data
            const AdRequest = require('../ad_server').AdRequest;
            const adRequest = new AdRequest(
                falconRequest.placementId,
                falconRequest.userIdentifiers.email_hash || null,
                falconRequest.userIdentifiers.device_id || null,
                falconRequest.siteId,
                falconRequest.pageUrl,
                falconRequest.userAgent,
                falconRequest.ipAddress,
                {
                    suppress_advertisers: Array.from(suppressionResult.suppressedAdvertisers),
                    suppression_check_time_ms: suppressionResult.processingTimeMs
                }
            );
            
            // Step 3: Call ad server
            const adResponse = this.adServer.serveAd(adRequest);
            
            // Step 4: Post-process response (additional suppression if needed)
            if (adResponse.served && suppressionResult.suppressedAdvertisers.has(adResponse.advertiserId)) {
                // This advertiser should be suppressed - override the ad server response
                adResponse.served = false;
                adResponse.bannerId = null;
                adResponse.creativeUrl = null;
                adResponse.landingPage = null;
                adResponse.reason = `Advertiser ${adResponse.advertiserId} suppressed by Falcon`;
            }
            
            return [adResponse, suppressionResult];
        } catch (error) {
            console.error('[EnhancedFalconServer] Error serving ad:', error);
            // Fallback: serve ad without suppression checking
            const AdRequest = require('../ad_server').AdRequest;
            const adRequest = new AdRequest(
                falconRequest.placementId,
                falconRequest.userIdentifiers.email_hash,
                falconRequest.userIdentifiers.device_id,
                falconRequest.siteId,
                falconRequest.pageUrl,
                falconRequest.userAgent,
                falconRequest.ipAddress,
                { suppress_advertisers: [] }
            );
            
            const adResponse = this.adServer.serveAd(adRequest);
            return [adResponse, new SuppressionCheckResult(new Set(), 0, 0, ['Fallback mode: suppression check failed'])];
        }
    }
}

module.exports = EnhancedFalconServer;