// falcon-server-enhanced.js - Complete rewrite with proper initialization
const { FalconServer, FalconRequest, SuppressionCheckResult } = require('../falcon_server');
const SuppressionListManager = require('./suppression-list-manager');
const { performance } = require('perf_hooks');

class EnhancedFalconServer extends FalconServer {
    constructor(adServer, options = {}) {
        super(adServer);
        
        this.config = {
            dbPath: options.dbPath || ':memory:',
            cacheEnabled: options.cache !== false,
            ...options
        };
        
        // Initialize properties first
        this.suppressionManager = null;
        this.cache = new Map();
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.stats = {
            totalRequests: 0,
            suppressionChecks: 0,
            averageLookupTime: 0
        };
        this.initialized = false;

        console.log('[EnhancedFalconServer] Initialized, setting up suppression system...');
        
        // Initialize asynchronously
        this.initializeSuppression().catch(error => {
            console.error('[EnhancedFalconServer] Failed to initialize suppression:', error);
        });
    }

    async initializeSuppression() {
        console.log('[EnhancedFalconServer] Initializing suppression system...');
        
        try {
            // Initialize suppression manager
            this.suppressionManager = new SuppressionListManager(this.config.dbPath);
            await this.suppressionManager.initialize();
            
            // Load sample data
            await this.loadSuppressionLists();
            
            this.initialized = true;
            console.log('[EnhancedFalconServer] Suppression system ready!');
        } catch (error) {
            console.error('[EnhancedFalconServer] Failed to initialize suppression system:', error);
            throw error;
        }
    }

    async loadSuppressionLists() {
        console.log('[EnhancedFalconServer] Loading suppression lists...');
        
        try {
            const sampleData = require('../mock_data/sample_suppression_lists.json');
            let loadedCount = 0;
            let errorCount = 0;
            
            for (const listData of sampleData) {
                try {
                    await this.suppressionManager.createList(listData);
                    loadedCount++;
                } catch (error) {
                    errorCount++;
                    if (error.message.includes('UNIQUE constraint failed')) {
                        console.log(`[EnhancedFalconServer] List ${listData.id} already exists`);
                    } else {
                        console.warn(`[EnhancedFalconServer] Failed to load list ${listData.id}:`, error.message);
                    }
                }
            }
            
            console.log(`[EnhancedFalconServer] Loaded ${loadedCount} lists, ${errorCount} errors`);
        } catch (error) {
            console.error('[EnhancedFalconServer] Failed to load sample data:', error);
        }
    }

    async ensureInitialized() {
        if (!this.initialized) {
            await this.initializeSuppression();
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
        if (!this.suppressionManager || !this.suppressionManager.db) {
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
            initialized: this.initialized
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