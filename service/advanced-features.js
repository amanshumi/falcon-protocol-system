// advanced-features.js
const crypto = require('crypto');

class AdvancedSuppressionFeatures {
    constructor(manager) {
        this.manager = manager;
        this.auditLogger = new AuditLogger();
        this.rateLimiter = new RateLimiter();
        this.encryptionService = new EncryptionService();
    }

    // Feature 1: List Expiration with TTL
    async applyExpirationPolicy(retentionDays = 90) {
        console.log(`[Advanced] Applying expiration policy: ${retentionDays} days retention`);
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const result = await this.manager.db.run(`
            UPDATE suppression_lists 
            SET is_active = 0 
            WHERE last_updated < ? AND is_active = 1
        `, [cutoffDate.toISOString()]);

        console.log(`[Advanced] Expired ${result.changes} lists older than ${retentionDays} days`);
        return result.changes;
    }

    async getExpiredLists(retentionDays = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        return await this.manager.db.all(`
            SELECT id, name, advertiser_id, last_updated 
            FROM suppression_lists 
            WHERE last_updated < ? AND is_active = 1
        `, [cutoffDate.toISOString()]);
    }

    // Feature 2: Privacy Compliance - Hash incoming identifiers
    async createPrivacyCompliantList(listData) {
        // Ensure all identifiers are hashed before storage
        const hashedIdentifiers = listData.identifiers.map(identifier => 
            this.encryptionService.hashIdentifier(identifier)
        );

        const compliantList = {
            ...listData,
            identifiers: hashedIdentifiers,
            privacy_compliant: true,
            original_identifier_count: listData.identifiers.length
        };

        this.auditLogger.log('LIST_CREATED', {
            listId: compliantList.id,
            advertiserId: compliantList.advertiser_id,
            identifierCount: compliantList.identifiers.length,
            privacyCompliant: true
        });

        return await this.manager.createList(compliantList);
    }

    // Feature 3: A/B Testing - Percentage-based suppression
    async checkSuppressionWithSampling(userIdentifiers, sampleRate = 1.0) {
        if (sampleRate >= 1.0) {
            // Full suppression - normal behavior
            return await this.manager.findAdvertisersForIdentifiers(userIdentifiers);
        }

        if (Math.random() > sampleRate) {
            // Not sampled - no suppression
            return { suppressed: new Set(), listsChecked: 0 };
        }

        // Sampled - apply normal suppression
        return await this.manager.findAdvertisersForIdentifiers(userIdentifiers);
    }

    // Feature 4: List Combining with AND/OR logic
    async checkCombinedSuppression(userIdentifiers, logicConfig) {
        const { operator = 'OR', listIds = [] } = logicConfig;
        
        if (listIds.length === 0) {
            return { suppressed: false, details: [] };
        }

        const listResults = await Promise.all(
            listIds.map(listId => this.checkListSuppression(userIdentifiers, listId))
        );

        let shouldSuppress = false;
        const details = [];

        if (operator === 'OR') {
            // Suppress if ANY list matches
            shouldSuppress = listResults.some(result => result.suppressed);
            details.push(`OR logic: ${listResults.filter(r => r.suppressed).length}/${listIds.length} lists matched`);
        } else if (operator === 'AND') {
            // Suppress only if ALL lists match
            shouldSuppress = listResults.every(result => result.suppressed);
            details.push(`AND logic: ${listResults.filter(r => r.suppressed).length}/${listIds.length} lists matched`);
        }

        return { suppressed: shouldSuppress, details };
    }

    async checkListSuppression(userIdentifiers, listId) {
        const list = await this.manager.getList(listId);
        if (!list) return { suppressed: false, reason: 'List not found' };

        for (const [identifierType, identifier] of Object.entries(userIdentifiers)) {
            if (!identifier || identifierType !== list.identifier_type) continue;

            if (list.identifiers.includes(identifier)) {
                return { 
                    suppressed: true, 
                    reason: `Found in list: ${list.name}`,
                    advertiserId: list.advertiser_id
                };
            }
        }

        return { suppressed: false, reason: 'Not found in list' };
    }

    // Feature 5: Audit Logging
    async getAuditLogs(options = {}) {
        return await this.auditLogger.query({
            startDate: options.startDate,
            endDate: options.endDate,
            action: options.action,
            advertiserId: options.advertiserId
        });
    }

    async getImportMetrics() {
        const stats = await this.manager.getStats();
        return {
            total_lists: stats.total_lists,
            total_advertisers: stats.total_advertisers,
            total_identifiers: stats.total_identifiers,
            storage_size: 'N/A', // In production, this would calculate actual file size
            audit_logs_count: this.auditLogger.logs.length,
            rate_limits_active: this.rateLimiter.limits.size
        };
    }

    // Feature 6: Rate Limiting
    async checkRateLimit(advertiserId, operation) {
        return await this.rateLimiter.check(advertiserId, operation);
    }

    // Feature 7: Data Retention Compliance
    async enforceDataRetention() {
        const retentionConfig = {
            user_identifiers: 90, // days
            audit_logs: 365,
            suppression_lists: 180
        };

        const results = {};

        // Remove old user identifiers
        results.identifiersRemoved = await this.removeOldIdentifiers(retentionConfig.user_identifiers);
        
        // Archive old audit logs
        results.auditLogsArchived = await this.archiveOldAuditLogs(retentionConfig.audit_logs);

        // Remove expired suppression lists
        results.listsExpired = await this.applyExpirationPolicy(retentionConfig.suppression_lists);

        return results;
    }

    async removeOldIdentifiers(retentionDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const result = await this.manager.db.run(`
            DELETE FROM suppression_identifiers 
            WHERE added_at < ?
        `, [cutoffDate.toISOString()]);

        return result.changes;
    }

    async archiveOldAuditLogs(retentionDays) {
        // Implementation would move logs to cold storage
        console.log(`[Advanced] Archiving audit logs older than ${retentionDays} days`);
        return 0; // Placeholder
    }
}

// Supporting classes for advanced features
class AuditLogger {
    constructor() {
        this.logs = []; // In production, this would be a database table
    }

    log(action, data) {
        const logEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            action,
            data: JSON.stringify(data),
            ipAddress: data.ipAddress || null,
            userAgent: data.userAgent || null
        };

        this.logs.push(logEntry);
        console.log(`[Audit] ${action}:`, data);
    }

    async query(options = {}) {
        let filteredLogs = this.logs;

        if (options.startDate) {
            filteredLogs = filteredLogs.filter(log => log.timestamp >= options.startDate);
        }

        if (options.endDate) {
            filteredLogs = filteredLogs.filter(log => log.timestamp <= options.endDate);
        }

        if (options.action) {
            filteredLogs = filteredLogs.filter(log => log.action === options.action);
        }

        return filteredLogs.slice(-100); // Return recent 100 logs
    }
}

class RateLimiter {
    constructor() {
        this.limits = new Map();
        this.setDefaultLimits();
    }

    setDefaultLimits() {
        // Default rate limits (requests per minute)
        this.limits.set('list_creation', 10);
        this.limits.set('suppression_check', 1000);
        this.limits.set('bulk_import', 5);
    }

    async check(advertiserId, operation) {
        const key = `${advertiserId}_${operation}_${this.getCurrentMinute()}`;
        const limit = this.limits.get(operation) || 10;

        // In production, this would use Redis with atomic operations
        const currentCount = this.getCurrentCount(key);
        
        if (currentCount >= limit) {
            return {
                allowed: false,
                remaining: 0,
                resetTime: this.getNextMinute()
            };
        }

        this.incrementCount(key);
        return {
            allowed: true,
            remaining: limit - currentCount - 1,
            resetTime: this.getNextMinute()
        };
    }

    getCurrentMinute() {
        return Math.floor(Date.now() / 60000);
    }

    getNextMinute() {
        return (this.getCurrentMinute() + 1) * 60000;
    }

    getCurrentCount(key) {
        // In production, use Redis
        return parseInt(localStorage.getItem(key) || '0');
    }

    incrementCount(key) {
        // In production, use Redis INCR
        const current = this.getCurrentCount(key);
        localStorage.setItem(key, (current + 1).toString());
    }
}

class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        // In production, use proper key management
        this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-for-development-only';
    }

    hashIdentifier(identifier) {
        // One-way hash for privacy compliance
        return crypto.createHash('sha256').update(identifier).digest('hex');
    }

    encryptIdentifier(identifier) {
        // Two-way encryption for when you need to retrieve original values
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
        cipher.setAAD(Buffer.from('suppression-list'));
        
        let encrypted = cipher.update(identifier, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            iv: iv.toString('hex'),
            data: encrypted,
            authTag: authTag.toString('hex')
        };
    }

    decryptIdentifier(encryptedData) {
        try {
            const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
            decipher.setAAD(Buffer.from('suppression-list'));
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            
            let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error('Failed to decrypt identifier');
        }
    }
}

module.exports = AdvancedSuppressionFeatures;