const { AdServer } = require('../ad_server');
const EnhancedFalconServer = require('../service/falcon-server-enhanced');
const testRequests = require('../mock_data/test_ad_requests.json');

async function testComplete() {
    console.log('=== Complete System Integration Test ===\n');

    // Initialize servers
    const adServer = new AdServer();
    const falconServer = new EnhancedFalconServer(adServer, {
        dbPath: ':memory:',
        cache: true
    });

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('1. Testing with sample ad requests...\n');

    let passedTests = 0;
    let totalTests = 0;

    for (const testCase of testRequests) {
        totalTests++;
        console.log(`--- Test: ${testCase.test_name} ---`);
        
        const falconRequest = {
            placementId: testCase.request.placement_id,
            userIdentifiers: testCase.request.user,
            siteId: testCase.request.context.site_id,
            pageUrl: testCase.request.context.page_url,
            userAgent: testCase.request.context.user_agent,
            ipAddress: testCase.request.context.ip_address
        };

        const [adResponse, suppressionResult] = await falconServer.serveAdWithSuppression(falconRequest);

        // Check results
        const expectedSuppression = testCase.expected_result.should_suppress;
        const actualSuppression = !adResponse.served;
        
        const testPassed = expectedSuppression === actualSuppression;
        
        console.log(`Expected suppression: ${expectedSuppression}`);
        console.log(`Actual suppression: ${actualSuppression}`);
        console.log(`Suppressed advertisers:`, Array.from(suppressionResult.suppressedAdvertisers));
        console.log(`Ad served: ${adResponse.served}`);
        console.log(`Reason: ${adResponse.reason}`);
        console.log(`Processing time: ${suppressionResult.processingTimeMs.toFixed(2)}ms`);
        console.log(`Test result: ${testPassed ? 'PASS' : 'FAIL'}\n`);

        if (testPassed) passedTests++;
    }

    // Test performance and stats
    console.log('2. Testing performance and statistics...');
    const stats = falconServer.getSuppressionStats();
    console.log('Performance Statistics:');
    console.log('  - Cache hit rate:', stats.cache_hit_rate + '%');
    console.log('  - Average lookup time:', stats.avg_lookup_time_ms + 'ms');
    console.log('  - Cache size:', stats.cache_size);
    console.log('  - Total checks:', stats.total_suppression_checks);

    // Test summary
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passedTests}/${totalTests} tests`);
    console.log(`Success rate: ${Math.round((passedTests / totalTests) * 100)}%`);

    if (passedTests === totalTests) {
        console.log('🎉 All tests passed! System is working correctly.');
    } else {
        console.log('❌ Some tests failed. Check implementation.');
    }
}

// Run the complete test suite
testComplete().catch(console.error);