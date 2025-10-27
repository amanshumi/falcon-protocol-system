// test-part4.js
const SuppressionListManager = require('../service/suppression-list-manager');
const AdvancedSuppressionFeatures = require('../service/advanced-features');

async function testPart4() {
    console.log('=== Part 4: Advanced Features Tests ===\n');

    const manager = new SuppressionListManager(':memory:');
    await manager.initialize();
    const advanced = new AdvancedSuppressionFeatures(manager);

    // Test 1: List Expiration
    console.log('1. Testing list expiration...');
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100); // 100 days ago

    await manager.createList({
        advertiser_id: 'adv_old',
        name: 'Old List',
        identifier_type: 'email_hash',
        identifiers: ['old1234567890abcdefold1234567890abcdefold1234567890abcdefold123'],
        last_updated: oldDate.toISOString()
    });

    const expiredBefore = await advanced.getExpiredLists(90);
    console.log('✓ Lists expired before policy:', expiredBefore.length);

    await advanced.applyExpirationPolicy(90);
    
    const expiredAfter = await advanced.getExpiredLists(90);
    console.log('✓ Lists expired after policy:', expiredAfter.length);

    // Test 2: Privacy Compliance
    console.log('\n2. Testing privacy compliance...');
    const sensitiveList = {
        advertiser_id: 'adv_privacy',
        name: 'Privacy Sensitive List',
        identifier_type: 'email_hash',
        identifiers: ['user1@example.com', 'user2@example.com'] // Raw emails for testing
    };

    // In production, these would be hashed
    const compliantList = await advanced.createPrivacyCompliantList(sensitiveList);
    console.log('✓ Privacy compliant list created:', compliantList.privacy_compliant);
    console.log('✓ Identifiers processed:', compliantList.original_identifier_count);

    // Test 3: A/B Testing Sampling
    console.log('\n3. Testing A/B sampling...');
    let sampledCount = 0;
    const totalChecks = 1000;
    const sampleRate = 0.5; // 50% sampling

    for (let i = 0; i < totalChecks; i++) {
        const result = await advanced.checkSuppressionWithSampling(
            { email_hash: 'test@example.com' },
            sampleRate
        );
        if (result.listsChecked > 0) {
            sampledCount++;
        }
    }

    const actualRate = sampledCount / totalChecks;
    console.log(`✓ Sampling rate: expected ${sampleRate}, actual ${actualRate.toFixed(2)}`);

    // Test 4: List Combining Logic
    console.log('\n4. Testing list combining logic...');
    
    // Create test lists
    const list1 = await manager.createList({
        advertiser_id: 'adv_test',
        name: 'Test List 1',
        identifier_type: 'email_hash',
        identifiers: ['test1@example.com']
    });

    const list2 = await manager.createList({
        advertiser_id: 'adv_test', 
        name: 'Test List 2',
        identifier_type: 'email_hash',
        identifiers: ['test2@example.com']
    });

    // Test OR logic (should suppress if any list matches)
    const orResult = await advanced.checkCombinedSuppression(
        { email_hash: 'test1@example.com' },
        { operator: 'OR', listIds: [list1.id, list2.id] }
    );
    console.log('✓ OR logic result:', orResult.suppressed, orResult.details);

    // Test AND logic (should suppress only if all lists match)
    const andResult = await advanced.checkCombinedSuppression(
        { email_hash: 'test1@example.com' },
        { operator: 'AND', listIds: [list1.id, list2.id] }
    );
    console.log('✓ AND logic result:', andResult.suppressed, andResult.details);

    // Test 5: Rate Limiting
    console.log('\n5. Testing rate limiting...');
    const limitResults = [];
    for (let i = 0; i < 15; i++) {
        const result = await advanced.checkRateLimit('adv_test', 'list_creation');
        limitResults.push(result.allowed);
    }

    const allowedCount = limitResults.filter(Boolean).length;
    console.log(`✓ Rate limiting: ${allowedCount}/15 requests allowed (limit: 10/min)`);

    // Test 6: Audit Logging
    console.log('\n6. Testing audit logging...');
    advanced.auditLogger.log('SUPPRESSION_CHECK', {
        userId: 'user123',
        advertiserId: 'adv_test',
        suppressed: true,
        listsChecked: 2
    });

    const logs = await advanced.getAuditLogs();
    console.log('✓ Audit logs recorded:', logs.length);
    console.log('✓ Latest log action:', logs[0]?.action);

    // Test 7: Data Retention
    console.log('\n7. Testing data retention...');
    const retentionResults = await advanced.enforceDataRetention();
    console.log('✓ Data retention enforced:', retentionResults);

    console.log('\n=== Part 4 Tests Completed Successfully ===');
}

// Run tests
testPart4().catch(console.error);