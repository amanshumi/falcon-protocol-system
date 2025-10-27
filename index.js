// index.js - Updated with proper async handling
const { AdServer } = require('./ad_server');
const EnhancedFalconServer = require('./service/falcon-server-enhanced');
const SuppressionListManager = require('./service/suppression-list-manager');
const path = require('path');

class SuppressionListSystem {
    constructor(config = {}) {
        this.config = {
            dbPath: path.join(__dirname, 'db', 'suppression_lists.db'),
            enableAdvancedFeatures: false, // Disable for now to avoid errors
            cacheEnabled: true,
            ...config
        };
        
        this.manager = null;
        this.adServer = null;
        this.falconServer = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return this;
        
        console.log('🚀 Initializing Suppression List System...');
        
        try {
            // Ensure data directory exists
            const fs = require('fs');
            const dataDir = path.dirname(this.config.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
                console.log('✅ Created data directory:', dataDir);
            }
            
            // Initialize components in order
            this.manager = new SuppressionListManager(this.config.dbPath);
            await this.manager.initialize();
            
            this.adServer = new AdServer();
            this.falconServer = new EnhancedFalconServer(this.adServer, this.config);
            
            // Wait for falcon server to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Load sample data for demonstration
            await this.loadSampleData();
            
            this.initialized = true;
            console.log('✅ Suppression List System ready!');
            return this;
            
        } catch (error) {
            console.error('❌ System initialization failed:', error);
            throw error;
        }
    }

    async loadSampleData() {
        try {
            const sampleData = require('./mock_data/sample_suppression_lists.json');
            let loadedCount = 0;
            let skippedCount = 0;
            
            for (const listData of sampleData) {
                try {
                    await this.manager.createList(listData);
                    loadedCount++;
                } catch (error) {
                    if (error.message.includes('UNIQUE constraint failed')) {
                        skippedCount++;
                    } else {
                        console.warn(`Failed to load list ${listData.id}:`, error.message);
                    }
                }
            }
            
            console.log(`📊 Loaded ${loadedCount} sample lists (${skippedCount} already existed)`);
        } catch (error) {
            console.warn('⚠️ Could not load sample data:', error.message);
        }
    }

    async serveAd(adRequest) {
        if (!this.initialized) {
            await this.initialize();
        }

        // Handle both test case format and regular format
        const requestData = adRequest.request || adRequest;
        
        const falconRequest = {
            placementId: requestData.placement_id || requestData.placementId,
            userIdentifiers: requestData.user || requestData.userIdentifiers || {},
            siteId: requestData.context?.site_id || requestData.siteId || 'site_001',
            pageUrl: requestData.context?.page_url || requestData.pageUrl || 'https://example.com',
            userAgent: requestData.context?.user_agent || requestData.userAgent,
            ipAddress: requestData.context?.ip_address || requestData.ipAddress
        };

        // Ensure we have required fields
        if (!falconRequest.placementId) {
            throw new Error('Missing placementId in ad request');
        }

        return await this.falconServer.serveAdWithSuppression(falconRequest);
    }

    async getStats() {
        if (!this.initialized) {
            await this.initialize();
        }

        const stats = {
            system: this.falconServer ? this.falconServer.getSuppressionStats() : {},
            storage: this.manager ? await this.manager.getStats() : {},
            status: 'ready'
        };
        
        return stats;
    }

    async shutdown() {
        console.log('🛑 Shutting down Suppression List System...');
        if (this.manager && this.manager.db) {
            await this.manager.db.close();
        }
        this.initialized = false;
        console.log('✅ System shutdown complete');
    }
}

module.exports = SuppressionListSystem;

// Run demo if this file is executed directly
if (require.main === module) {
    async function main() {
        console.log('🎯 Suppression List System Demo\n');
        
        // Use in-memory database to avoid file system issues
        const system = new SuppressionListSystem({ dbPath: ':memory:' });
        
        try {
            await system.initialize();
            
            // Demo: Show system stats
            const stats = await system.getStats();
            console.log('\n📈 System Statistics:');
            console.log(JSON.stringify(stats, null, 2));
            
            // Demo: Run simple test requests
            console.log('\n🎯 Running Simple Demo:\n');
            
            const demoRequests = [
                {
                    placement_id: "pl_12345",
                    user: {
                        email_hash: "a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd",
                        device_id: "550e8400-e29b-41d4-a716-446655440000"
                    },
                    context: {
                        site_id: "site_001",
                        page_url: "https://technews.com/homepage"
                    }
                },
                {
                    placement_id: "pl_12345", 
                    user: {
                        email_hash: "new_user_hash_not_in_any_list_1234567890abcdef1234567890abcdef",
                        device_id: "new-device-aaaa-bbbb-cccc-dddddddddddd"
                    },
                    context: {
                        site_id: "site_001",
                        page_url: "https://technews.com/article/123"
                    }
                }
            ];
            
            for (const request of demoRequests) {
                const userEmail = request.user.email_hash.substring(0, 20) + '...';
                console.log(`--- Testing User: ${userEmail} ---`);
                
                const [adResponse, suppressionResult] = await system.serveAd(request);
                
                console.log('Suppression Check:');
                console.log('  Suppressed Advertisers:', Array.from(suppressionResult.suppressedAdvertisers));
                console.log('  Processing Time:', suppressionResult.processingTimeMs.toFixed(2) + 'ms');
                
                console.log('Ad Decision:');
                console.log('  Served:', adResponse.served);
                console.log('  Banner:', adResponse.bannerId);
                console.log('  Advertiser:', adResponse.advertiserId);
                console.log('  Reason:', adResponse.reason);
                console.log();
            }
            
        } catch (error) {
            console.error('❌ Demo failed:', error);
            process.exit(1);
        } finally {
            await system.shutdown();
        }
    }

    main().catch(console.error);
}