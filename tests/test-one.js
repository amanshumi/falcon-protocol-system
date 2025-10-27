// test-part1.js
const SuppressionListManager = require('../service/suppression-list-manager');
const fs = require('fs');

async function testPart1() {
    console.log('=== Part 1: Basic Suppression List Storage Tests ===\n');

    const manager = new SuppressionListManager(':memory:'); // In-memory DB for testing
    await manager.initialize();

    // Test 1: Create a suppression list
    console.log('1. Testing list creation...');
    const sampleList = {
        advertiser_id: 'adv_testcorp',
        name: 'Test Customers',
        description: 'Test customer list',
        identifier_type: 'email_hash',
        identifiers: [
            'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
            'f6e5d4c3b2a1987654321fedcba098765432109876543210fedcba0987654321'
        ]
    };

    const createdList = await manager.createList(sampleList);
    console.log('✓ List created:', createdList.id);
    console.log('✓ List size:', createdList.identifiers.length);

    // Test 2: Retrieve list
    console.log('\n2. Testing list retrieval...');
    const retrievedList = await manager.getList(createdList.id);
    console.log('✓ List retrieved:', retrievedList.name);
    console.log('✓ Identifiers preserved:', retrievedList.identifiers.length === sampleList.identifiers.length);

    // Test 3: Update list
    console.log('\n3. Testing list update...');
    const updatedList = await manager.updateList(createdList.id, {
        name: 'Updated Test Customers',
        last_updated: new Date().toISOString()
    });
    console.log('✓ List updated:', updatedList.name);

    // Test 4: Get lists by advertiser
    console.log('\n4. Testing advertiser-based retrieval...');
    const advertiserLists = await manager.getListsByAdvertiser('adv_testcorp');
    console.log('✓ Lists found for advertiser:', advertiserLists.length);

    // Test 5: Validation testing
    console.log('\n5. Testing validation...');
    try {
        await manager.createList({
            advertiser_id: 'adv_testcorp',
            name: 'Invalid List',
            identifier_type: 'email_hash',
            identifiers: ['invalid_hash_format']
        });
        console.log('✗ Validation should have failed');
    } catch (error) {
        console.log('✓ Validation correctly caught invalid identifier');
    }

    // Test 6: Load sample data
    console.log('\n6. Testing with sample data...');
    const sampleData = JSON.parse(fs.readFileSync('./mock_data/sample_suppression_lists.json', 'utf8'));
    
    let loadedCount = 0;
    for (const listData of sampleData.slice(0, 3)) { // Load first 3 for testing
        await manager.createList(listData);
        loadedCount++;
    }
    console.log(`✓ Loaded ${loadedCount} sample lists`);

    // Test 7: Statistics
    console.log('\n7. Testing statistics...');
    const stats = await manager.getStats();
    console.log('✓ Total lists:', stats.total_lists);
    console.log('✓ Total advertisers:', stats.total_advertisers);
    console.log('✓ Total identifiers:', stats.total_identifiers);

    // Test 8: Delete list
    console.log('\n8. Testing list deletion...');
    const deleteResult = await manager.deleteList(createdList.id);
    console.log('✓ List deleted:', deleteResult);

    console.log('\n=== Part 1 Tests Completed Successfully ===');
}

// Run tests
testPart1().catch(console.error);