// test-part3.js - Part 3: Ad Server Integration Tests
const { AdServer } = require('../ad_server');
const EnhancedFalconServer = require('../service/falcon-server-enhanced');

async function testPart3() {
    console.log('=== Part 3: Ad Server Integration Tests ===\n');

    // Initialize servers
    const adServer = new AdServer();
    const falconServer = new EnhancedFalconServer(adServer, {
        dbPath: ':memory:', // Use in-memory database for tests
        cache: true
    });

    // Wait for initialization to complete (including loading sample data)
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('1. Testing suppression list loading...');
    const stats = falconServer.getSuppressionStats();
    console.log('✓ Suppression lists loaded:', stats.total_lists_loaded > 0);
    console.log('✓ Cache hit rate:', stats.cache_hit_rate + '%');

    console.log('\n2. Testing suppression checking...');
    const testCases = [
        {
            description: 'User suppressed by email_hash',
            userIdentifiers: {
                email_hash: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
                device_id: 'test-device-123'
            },
            expectedSuppressed: ['adv_techcorp']
        },
        {
            description: 'User suppressed by device_id',
            userIdentifiers: {
                email_hash: 'not_suppressed@example.com',
                device_id: '550e8400-e29b-41d4-a716-446655440000'
            },
            expectedSuppressed: ['adv_gamestudio']
        },
        {
            description: 'User not suppressed',
            userIdentifiers: {
                email_hash: 'not_in_any_list@example.com',
                device_id: 'not-in-any-list-device'
            },
            expectedSuppressed: []
        }
    ];

    for (const testCase of testCases) {
        console.log(`\n--- ${testCase.description} ---`);
        const result = await falconServer.checkUserSuppression(testCase.userIdentifiers);
        
        console.log('✓ Suppressed advertisers:', Array.from(result.suppressedAdvertisers));
        console.log('✓ Expected advertisers:', testCase.expectedSuppressed);
        
        const passed = arraysEqual(Array.from(result.suppressedAdvertisers), testCase.expectedSuppressed);
        console.log('✓ Test result:', passed ? 'PASS' : 'FAIL');
    }

    console.log('\n3. Testing full ad serving integration...');
    const falconRequest = {
        placementId: 'pl_12345',
        userIdentifiers: {
            email_hash: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
            device_id: '550e8400-e29b-41d4-a716-446655440000'
        },
        siteId: 'site_001',
        pageUrl: 'https://example.com'
    };

    const [adResponse, suppressionResult] = await falconServer.serveAdWithSuppression(falconRequest);
    
    console.log('✓ Suppression result:', Array.from(suppressionResult.suppressedAdvertisers));
    console.log('✓ Ad served:', adResponse.served);
    console.log('✓ Advertiser ID:', adResponse.advertiserId);
    console.log('✓ Reason:', adResponse.reason);

    // The user is suppressed for adv_techcorp and adv_gamestudio, so if the ad server tries to serve from either, it should be blocked.
    // But note: the ad server might serve an ad from a different advertiser that is not suppressed.
    // So we can't assume the ad is not served, but we can check that if the ad is from a suppressed advertiser, it is blocked.

    if (adResponse.served) {
        // Check that the advertiser is not in the suppressed set
        const isAdvertiserSuppressed = suppressionResult.suppressedAdvertisers.has(adResponse.advertiserId);
        console.log('✓ Advertiser suppression check:', !isAdvertiserSuppressed ? 'PASS' : 'FAIL');
    } else {
        console.log('✓ Ad not served due to suppression or other reasons');
    }

    console.log('\n4. Testing performance...');
    const startTime = Date.now();
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
        await falconServer.checkUserSuppression({
            email_hash: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
            device_id: '550e8400-e29b-41d4-a716-446655440000'
        });
    }
    const endTime = Date.now();
    const avgTime = (endTime - startTime) / iterations;
    console.log(`✓ Average suppression check time: ${avgTime.toFixed(2)}ms`);

    console.log('\n=== Part 3 Tests Completed ===');
}

// Helper function to compare arrays
function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

// Run tests
testPart3().catch(console.error);