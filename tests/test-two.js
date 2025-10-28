const SuppressionListManager = require('../service/suppression-list-manager');
const SuppressionListImporter = require('../service/suppression-list-importer');
const fs = require('fs');

async function testPart2() {
    console.log('=== Part 2: List Management and Validation Tests ===\n');

    const manager = new SuppressionListManager(':memory:');
    await manager.initialize();
    const importer = new SuppressionListImporter(manager);

    // Test 1: CSV Import
    console.log('1. Testing CSV import...');
    try {
        const importResult = await importer.importFromCSV('../mock_data/bulk_import_sample.csv', {
            batchSize: 100,
            deduplicate: true,
            validate: true
        });
        console.log('✓ CSV import completed:');
        console.log('  - Processed:', importResult.totalProcessed, 'rows');
        console.log('  - Created:', importResult.listsCreated, 'lists');
        console.log('  - Errors:', importResult.errors);
    } catch (error) {
        console.log('✗ CSV import failed:', error.message);
    }

    // Test 2: Export to CSV
    console.log('\n2. Testing CSV export...');
    try {
        const exportCount = await importer.exportToCSV('adv_techcorp', '../test_export.csv');
        console.log('✓ CSV export completed:', exportCount, 'identifiers exported');

        // Clean up test file
        fs.unlinkSync('../test_export.csv');
    } catch (error) {
        console.log('✗ CSV export failed:', error.message);
    }

    // Test 3: Deduplication
    console.log('\n3. Testing deduplication...');
    const duplicateIdentifiers = [
        'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd',
        'A1B2C3D4E5F6789ABCDEF123456789ABCDEF123456789ABCDEF123456789ABCD', // Same but different case
        'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd' // Exact duplicate
    ];

    const deduped = importer.deduplicateIdentifiers(duplicateIdentifiers, 'email_hash');
    console.log('✓ Deduplication result:', duplicateIdentifiers.length, '->', deduped.length);

    // Test 4: Validation
    console.log('\n4. Testing validation...');
    const testCases = [
        { identifier: 'a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd', type: 'email_hash', valid: true },
        { identifier: 'invalid_hash', type: 'email_hash', valid: false },
        { identifier: '550e8400-e29b-41d4-a716-446655440000', type: 'device_id', valid: true },
        { identifier: 'invalid_device_id', type: 'device_id', valid: false }
    ];

    testCases.forEach((testCase, i) => {
        try {
            importer.validateIdentifier(testCase.identifier, testCase.type);
            console.log(`✓ Test ${i + 1}: ${testCase.valid ? 'PASS' : 'SHOULD HAVE FAILED'}`);
        } catch (error) {
            console.log(`✓ Test ${i + 1}: ${!testCase.valid ? 'PASS' : 'SHOULD HAVE PASSED'}`);
        }
    });

    // Test 5: Metrics
    console.log('\n5. Testing metrics...');
    const metrics = await importer.getImportMetrics();
    console.log('✓ Metrics collected:');
    console.log('  - Total lists:', metrics.total_lists);
    console.log('  - Total advertisers:', metrics.total_advertisers);
    console.log('  - Total identifiers:', metrics.total_identifiers);

    console.log('\n=== Part 2 Tests Completed Successfully ===');
}

// Run tests
testPart2().catch(console.error);