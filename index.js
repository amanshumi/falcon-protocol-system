// index.js - UPDATED
const { AdServer } = require('./ad_server');
const EnhancedFalconServer = require('./service/falcon-server-enhanced');
const SuppressionListManager = require('./service/suppression-list-manager');

class SuppressionListSystem {
    constructor(config = {}) {
        this.config = {
            dbPath: ':memory:', // Force in-memory for reliability
            enableAdvancedFeatures: false,
            cacheEnabled: true,
            ...config
        };
        
        this.adServer = null;
        this.falconServer = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) {
            console.log('✅ System already initialized');
            return this;
        }
        
        console.log('🚀 Starting Suppression List System initialization...');
        
        try {
            // STEP 1: Initialize ad server
            console.log('Step 1: Initializing ad server...');
            this.adServer = new AdServer();
            console.log('✅ Ad server initialized');
            
            // STEP 2: Initialize falcon server
            console.log('Step 2: Initializing falcon server...');
            this.falconServer = new EnhancedFalconServer(this.adServer, new SuppressionListManager(), this.config);
            console.log('✅ Falcon server instance created');
            
            // STEP 3: Initialize falcon server components
            console.log('Step 3: Initializing falcon server components...');
            await this.falconServer.initialize();
            console.log('✅ Falcon server components initialized');
            
            this.initialized = true;
            console.log('🎉 Suppression List System ready!');
            return this;
            
        } catch (error) {
            console.error('❌ System initialization failed:', error);
            throw error;
        }
    }

    async serveAd(adRequest) {
        if (!this.initialized) {
            console.log('System not initialized, initializing now...');
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
            status: 'ready',
            initialized: this.initialized
        };
        
        return stats;
    }

    async shutdown() {
        console.log('🛑 Shutting down Suppression List System...');
        if (this.falconServer && this.falconServer.suppressionManager && this.falconServer.suppressionManager.db) {
            await this.falconServer.suppressionManager.db.close();
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
        
        // Use in-memory database
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