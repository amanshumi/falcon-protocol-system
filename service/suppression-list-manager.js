// suppression-list-manager.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

class SuppressionListManager {
    constructor(dbPath = '../data/suppression_lists.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.initialized = false;
    }

    async initialize() {
        console.log('[SuppressionListManager] Initializing database at', this.dbPath);
        if (this.dbPath !== ':memory:') {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`[SuppressionListManager] Created directory: ${dir}`);
            }
        }

        try {
            this.db = await open({
                filename: this.dbPath,
                driver: sqlite3.Database
            });

            console.log('[SuppressionListManager] Setting up database schema...');

            // Create optimized schema for fast lookups
            await this.db.exec(`
            CREATE TABLE IF NOT EXISTS suppression_lists (
                id TEXT PRIMARY KEY,
                advertiser_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                identifier_type TEXT NOT NULL CHECK(identifier_type IN ('email_hash', 'device_id')),
                created_at DATETIME NOT NULL,
                submitted_at DATETIME NOT NULL,
                last_updated DATETIME NOT NULL,
                size INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS suppression_identifiers (
                identifier_hash TEXT PRIMARY KEY,
                identifier TEXT NOT NULL,
                identifier_type TEXT NOT NULL,
                list_id TEXT NOT NULL,
                advertiser_id TEXT NOT NULL,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (list_id) REFERENCES suppression_lists(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_identifier_lookup ON suppression_identifiers(identifier_hash, identifier_type);
            CREATE INDEX IF NOT EXISTS idx_advertiser_lists ON suppression_lists(advertiser_id, identifier_type);
            CREATE INDEX IF NOT EXISTS idx_list_identifiers ON suppression_identifiers(list_id);
            CREATE INDEX IF NOT EXISTS idx_identifier_type ON suppression_identifiers(identifier_type, identifier_hash);
        `);

            this.initialized = true;
            console.log('[SuppressionListManager] Database initialized with optimized indexes');
        } catch (error) {
            console.log('[SuppressionListManager] Database initialization failed:', error);
            throw error;
        }
    }

    async createList(listData) {
        if (!this.initialized) await this.initialize();

        const {
            id = crypto.randomUUID(),
            advertiser_id,
            name,
            description,
            identifier_type,
            identifiers = [],
            created_at = new Date().toISOString(),
            submitted_at = new Date().toISOString(),
            last_updated = new Date().toISOString()
        } = listData;

        // Validate identifier type
        if (!['email_hash', 'device_id'].includes(identifier_type)) {
            throw new Error(`Invalid identifier type: ${identifier_type}`);
        }

        // Validate identifiers
        this.validateIdentifiers(identifiers, identifier_type);

        // Start transaction for atomic operation
        await this.db.run('BEGIN TRANSACTION');

        try {
            // Insert list metadata
            await this.db.run(`
                INSERT INTO suppression_lists 
                (id, advertiser_id, name, description, identifier_type, created_at, submitted_at, last_updated, size)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [id, advertiser_id, name, description, identifier_type, created_at, submitted_at, last_updated, identifiers.length]);

            // Insert identifiers with efficient batch operation
            if (identifiers.length > 0) {
                const stmt = await this.db.prepare(`
                    INSERT OR IGNORE INTO suppression_identifiers 
                    (identifier_hash, identifier, identifier_type, list_id, advertiser_id)
                    VALUES (?, ?, ?, ?, ?)
                `);

                for (const identifier of identifiers) {
                    const identifierHash = this.hashIdentifier(identifier);
                    await stmt.run(identifierHash, identifier, identifier_type, id, advertiser_id);
                }
                await stmt.finalize();
            }

            await this.db.run('COMMIT');
            console.log(`[SuppressionListManager] Created list ${id} with ${identifiers.length} identifiers`);

            return await this.getList(id);
        } catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }

    async getList(listId) {
        if (!this.initialized) await this.initialize();

        const list = await this.db.get(`
            SELECT * FROM suppression_lists WHERE id = ?
        `, [listId]);

        if (!list) return null;

        const identifiers = await this.db.all(`
            SELECT identifier FROM suppression_identifiers WHERE list_id = ?
        `, [listId]);

        return {
            ...list,
            identifiers: identifiers.map(row => row.identifier)
        };
    }

    async updateList(listId, updates) {
        if (!this.initialized) await this.initialize();

        const allowedFields = ['name', 'description', 'last_updated'];
        const updateFields = [];
        const updateValues = [];

        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) {
                updateFields.push(`${key} = ?`);
                updateValues.push(updates[key]);
            }
        });

        if (updateFields.length === 0) {
            throw new Error('No valid fields to update');
        }

        updateValues.push(listId);

        await this.db.run(`
            UPDATE suppression_lists 
            SET ${updateFields.join(', ')} 
            WHERE id = ?
        `, updateValues);

        return await this.getList(listId);
    }

    async deleteList(listId) {
        if (!this.initialized) await this.initialize();

        // CASCADE delete will handle suppression_identifiers
        const result = await this.db.run('DELETE FROM suppression_lists WHERE id = ?', [listId]);
        return result.changes > 0;
    }

    async getListsByAdvertiser(advertiserId, options = {}) {
        if (!this.initialized) await this.initialize();

        const { identifier_type, active_only = true } = options;
        let query = 'SELECT * FROM suppression_lists WHERE advertiser_id = ?';
        const params = [advertiserId];

        if (active_only) {
            query += ' AND is_active = 1';
        }

        if (identifier_type) {
            query += ' AND identifier_type = ?';
            params.push(identifier_type);
        }

        query += ' ORDER BY last_updated DESC';

        const lists = await this.db.all(query, params);

        // Get identifiers for each list
        for (let list of lists) {
            const identifiers = await this.db.all(`
                SELECT identifier FROM suppression_identifiers WHERE list_id = ?
            `, [list.id]);
            list.identifiers = identifiers.map(row => row.identifier);
        }

        return lists;
    }

    // In suppression-list-manager.js - Add this method
    async findAdvertisersForIdentifiers(userIdentifiers) {
        if (!this.initialized) {
            await this.initialize();
        }

        const suppressedAdvertisers = new Set();
        let totalListsChecked = 0;
        const details = [];

        for (const [identifierType, identifier] of Object.entries(userIdentifiers)) {
            if (!identifier) continue;

            try {
                const advertisers = await this.findAdvertisersForIdentifier(identifier, identifierType);
                totalListsChecked += advertisers.listsChecked;

                if (advertisers.suppressed.size > 0) {
                    advertisers.suppressed.forEach(adv => suppressedAdvertisers.add(adv));
                    details.push(`${identifierType} matched ${advertisers.suppressed.size} advertisers`);
                }
            } catch (error) {
                console.warn(`[SuppressionListManager] Error checking ${identifierType}:`, error.message);
                details.push(`Error checking ${identifierType}: ${error.message}`);
            }
        }

        return {
            suppressed: suppressedAdvertisers,
            listsChecked: totalListsChecked,
            details
        };
    }

    async findAdvertisersForIdentifier(identifier, identifierType) {
        if (!this.isInitialized()) {
            await this.initialize();
        }

        const results = await this.db.all(`
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

    // Utility methods
    validateIdentifiers(identifiers, identifierType) {
        for (const identifier of identifiers) {
            if (identifierType === 'email_hash') {
                // Allow both raw emails (for testing) and proper hashes
                if (this.looksLikeRawEmail(identifier)) {
                    console.warn(`[SuppressionListManager] Warning: Using raw email as email_hash: ${identifier}. In production, this should be hashed.`);
                    // Allow it for testing purposes
                    continue;
                }

                // Check for proper hash format (50-70 char hex/alpha-numeric)
                if (!/^[a-f0-9]{50,70}$/i.test(identifier) && !/^[a-z0-9]{50,70}$/i.test(identifier)) {
                    throw new Error(`Invalid email_hash format: ${identifier}. Expected 50-70 character hex/alpha-numeric string or proper email address.`);
                }
            } else if (identifierType === 'device_id') {
                // Support UUID format, iosdevice-* format, and other device ID formats
                if (!/^[a-f0-9-]+$/i.test(identifier) &&
                    !/^iosdevice-[a-f0-9-]+$/i.test(identifier) &&
                    !/^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(identifier)) {
                    throw new Error(`Invalid device_id format: ${identifier}`);
                }
            }
        }

        console.log(`✅ Passed validation for ${identifiers.length} ${identifierType} identifiers`);
    }

    looksLikeRawEmail(identifier) {
        // Simple check for email format
        return /^[^@]+@[^@]+\.[^@]+$/.test(identifier);
    }

    hashIdentifier(identifier) {
        // Create a deterministic hash for efficient storage and lookup
        return crypto.createHash('sha256').update(identifier).digest('hex');
    }

    async getStats() {
        if (!this.initialized) await this.initialize();

        const stats = await this.db.get(`
            SELECT 
                COUNT(DISTINCT id) as total_lists,
                COUNT(DISTINCT advertiser_id) as total_advertisers,
                SUM(size) as total_identifiers,
                COUNT(DISTINCT identifier_type) as identifier_types
            FROM suppression_lists
            WHERE is_active = 1
        `);

        return stats;
    }
}

module.exports = SuppressionListManager;