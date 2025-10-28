const csv = require('csv-parser');
const fs = require('fs');
const { Transform } = require('stream');

class SuppressionListImporter {
    constructor(manager) {
        this.manager = manager;
    }

    async importFromCSV(filePath, options = {}) {
        const {
            batchSize = 1000,
            deduplicate = true,
            validate = true
        } = options;

        return new Promise((resolve, reject) => {
            const listsMap = new Map();
            let processedCount = 0;
            let errorCount = 0;

            console.log(`[Importer] Starting CSV import from ${filePath}`);

            fs.createReadStream(filePath)
                .pipe(csv())
                .pipe(new Transform({
                    objectMode: true,
                    transform: (row, encoding, callback) => {
                        try {
                            const {
                                advertiser_id,
                                identifier_type,
                                identifier,
                                list_name,
                                notes,
                                submitted_at
                            } = row;

                            // Group by advertiser_id + list_name + identifier_type
                            const listKey = `${advertiser_id}_${list_name}_${identifier_type}`;
                            
                            if (!listsMap.has(listKey)) {
                                listsMap.set(listKey, {
                                    advertiser_id,
                                    name: list_name,
                                    description: notes || `Imported from CSV - ${list_name}`,
                                    identifier_type,
                                    identifiers: new Set(),
                                    submitted_at: submitted_at || new Date().toISOString()
                                });
                            }

                            if (validate) {
                                this.validateIdentifier(identifier, identifier_type);
                            }

                            listsMap.get(listKey).identifiers.add(identifier);
                            processedCount++;

                            callback();
                        } catch (error) {
                            errorCount++;
                            console.warn(`[Importer] Error processing row:`, error.message);
                            callback(); // Continue processing other rows
                        }
                    },
                    flush: async (callback) => {
                        console.log(`[Importer] Processed ${processedCount} rows, ${errorCount} errors`);

                        try {
                            // Create lists from grouped data
                            for (const [listKey, listData] of listsMap) {
                                const identifiers = Array.from(listData.identifiers);
                                
                                if (deduplicate) {
                                    listData.identifiers = this.deduplicateIdentifiers(identifiers, listData.identifier_type);
                                }

                                await this.manager.createList({
                                    ...listData,
                                    identifiers
                                });
                                console.log(`[Importer] Created list: ${listData.name} with ${identifiers.length} identifiers`);
                            }

                            resolve({
                                totalProcessed: processedCount,
                                listsCreated: listsMap.size,
                                errors: errorCount
                            });
                        } catch (error) {
                            reject(error);
                        }
                        callback();
                    }
                }))
                .on('error', reject);
        });
    }

    async exportToCSV(advertiserId, outputPath) {
        const lists = await this.manager.getListsByAdvertiser(advertiserId);
        
        const csvStream = fs.createWriteStream(outputPath);
        csvStream.write('advertiser_id,identifier_type,identifier,list_name,notes,submitted_at\n');

        let exportedCount = 0;

        for (const list of lists) {
            for (const identifier of list.identifiers) {
                const row = [
                    list.advertiser_id,
                    list.identifier_type,
                    identifier,
                    list.name,
                    list.description || '',
                    list.submitted_at
                ].map(field => `"${field}"`).join(',');

                csvStream.write(row + '\n');
                exportedCount++;
            }
        }

        csvStream.end();

        return new Promise((resolve) => {
            csvStream.on('finish', () => {
                console.log(`[Importer] Exported ${exportedCount} identifiers to ${outputPath}`);
                resolve(exportedCount);
            });
        });
    }

    deduplicateIdentifiers(identifiers, identifierType) {
        const seen = new Set();
        const deduped = [];

        for (const identifier of identifiers) {
            const normalized = this.normalizeIdentifier(identifier, identifierType);
            if (!seen.has(normalized)) {
                seen.add(normalized);
                deduped.push(identifier);
            }
        }

        console.log(`[Importer] Deduplicated ${identifiers.length} -> ${deduped.length} identifiers`);
        return deduped;
    }

    normalizeIdentifier(identifier, identifierType) {
        if (identifierType === 'email_hash') {
            return identifier.toLowerCase();
        } else if (identifierType === 'device_id') {
            return identifier.toLowerCase().replace(/[^a-f0-9-]/g, '');
        }
        return identifier;
    }

    validateIdentifier(identifier, identifierType) {
        if (identifierType === 'email_hash') {
            if (!/^[a-f0-9]{64}$/i.test(identifier)) {
                throw new Error(`Invalid email_hash: ${identifier}`);
            }
        } else if (identifierType === 'device_id') {
            if (!/^[a-f0-9-]+$/i.test(identifier)) {
                throw new Error(`Invalid device_id: ${identifier}`);
            }
        }
    }

    async getImportMetrics() {
        const stats = await this.manager.getStats();
        return {
            total_lists: stats.total_lists,
            total_advertisers: stats.total_advertisers,
            total_identifiers: stats.total_identifiers,
            storage_size: await this.getDatabaseSize()
        };
    }

    async getDatabaseSize() {
        // Implementation would vary based on database
        return 'N/A'; // Placeholder for actual implementation
    }
}

module.exports = SuppressionListImporter;