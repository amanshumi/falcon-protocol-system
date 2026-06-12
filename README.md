# Ad Suppression List System

## Quick Start Instructions

### Prerequisites
```bash
Node.js 18.0 or higher
npm 9.0 or higher
```

### Setup
```bash
# Clone and setup the project
git clone https://github.com/amanshumi/falcon-protocol-system.git
cd falcon-suppression-system

# Install dependencies
npm install
```
### Running the Application
```bash
# Start the demo application
npm start

# Or run specific components
node index.js
```

### Testing
```bash
# Run all tests
npm test

# Run specific part tests
npm run test:part1
npm run test:part2  
npm run test:part3
npm run test:part4
npm run test:integration
```

## Architecture Overview

### High-Level Design
The Falcon Suppression List System is designed as a scalable microservice that integrates with ad serving infrastructure. The system follows a three-tier architecture with clear separation between storage, business logic, and integration layers. The core components include a Suppression List Manager for data persistence, an Enhanced Falcon Server for real-time ad serving decisions, and Advanced Features for production-grade capabilities.

The system processes ad requests by checking user identifiers against advertiser-specific suppression lists in real-time, with optimizations for high-volume traffic. It supports multiple identifier types and provides comprehensive management interfaces for advertisers while maintaining sub-millisecond response times for suppression checks.

### Technology Choices
| Component | Technology | Reasoning |
|-----------|------------|-----------|
| Storage | SQLite (dev) / Redis+PostgreSQL (prod) | SQLite for simplicity in development, with migration path to distributed databases for production |
| Boilerplate Usage | Extended and Enhanced | Used provided boilerplate as foundation, enhanced with production features and proper initialization |
| Suppression Index | Optimized SQL indexes + In-memory LRU cache | SQL indexes for persistent storage, LRU cache for hot data with O(1) lookup performance |
| API Framework | Node.js with modular design | High performance for I/O-bound operations, excellent ecosystem for ad tech |
| Validation | Custom validators with lenient sample support | Ensures data integrity while accommodating real-world sample data formats |

### Data Models
**Core Entities:**
- `SuppressionLists`: Metadata about lists (id, advertiser_id, name, identifier_type, timestamps, size)
- `SuppressionIdentifiers`: Individual identifiers with efficient indexing (identifier_hash, identifier, list_id, advertiser_id)
- Relationships: One advertiser → Many suppression lists → Many identifiers

**Key Design:**
- Normalized schema for data integrity
- Hash-based indexing for fast lookups
- Timestamp tracking for temporal operations
- Active/inactive flags for list management

### Multi-Advertiser Suppression Strategy
- **Suppression Lists**: Each advertiser manages independent lists with proper isolation and access control
- **User-to-Advertiser Mapping**: Reverse index (identifier → advertiser IDs) built during list loading for O(1) lookups during ad serving
- **Temporal Handling**: Lists are versioned with creation/submission timestamps, supporting incremental updates and expiration policies based on last_updated fields

## Implementation Details

### Part 1: Basic Storage
- **Storage Mechanism**: SQLite database with optimized schema design, transaction support, and connection pooling
- **Data Structure**: Normalized relational model with separate tables for list metadata and identifiers, supporting efficient CRUD operations and complex queries
- **CRUD Operations**: Complete Create, Read, Update, Delete with atomic transactions, proper error handling, and validation
- **Key Challenges**: Ensuring data consistency during concurrent operations, optimizing index design for million-scale identifiers, handling initialization race conditions

### Part 2: List Management
- **Validation Strategy**: Multi-level validation supporting both strict production formats and lenient sample data, with regex patterns for email_hash (50-70 char hex) and device_id (UUID/iosdevice formats)
- **Import/Export**: Stream-based CSV processing with batch operations, error resilience, and progress tracking; JSON support for configuration data
- **Deduplication**: Set-based algorithm with identifier normalization (case-insensitive, format standardization) and batch processing for memory efficiency
- **Metrics**: Real-time tracking of list counts, identifier volumes, storage utilization, and operation performance with aggregation capabilities

### Part 3: Ad Server Integration
- **Boilerplate Usage**: Extended FalconServer with enhanced suppression logic while maintaining full compatibility with provided ad server; modified initialization sequence for proper component lifecycle
- **Suppression Logic Implementation**: Implemented efficient `loadSuppressionLists()` using database batch loading and `checkUserSuppression()` with multi-identifier support and proper error handling
- **Multi-Advertiser Handling**: Reverse index mapping identifiers to advertiser sets, enabling O(1) lookups and efficient aggregation of suppression decisions across multiple advertisers
- **Performance Optimizations**: LRU caching with TTL, connection pooling, prepared statements, efficient data structures (Sets), and asynchronous initialization
- **Integration Testing**: Comprehensive test suite using provided mock data, validating all sample test cases with 100% pass rate, including edge cases and error scenarios

### Part 4: Advanced Features
**Implemented Features**: 
1. **List Expiration & Data Retention**: Automated cleanup with configurable TTL policies, supporting GDPR-compliant data lifecycle management
2. **Privacy Compliance & Encryption**: One-way hashing for identifiers, AES-256 encryption for sensitive data, and audit trails for compliance reporting
3. **A/B Testing & Sampling**: Percentage-based suppression for gradual rollouts and experimentation, with configurable sampling rates
4. **Audit Logging & Rate Limiting**: Comprehensive operation tracking and API protection with sliding window algorithm

## Production Architecture

### Scalability Plan
- **Horizontal Scaling**: Stateless Falcon servers behind load balancer, Redis cluster for distributed caching, database read replicas
- **Performance Targets**: 10ms P99 for suppression checks, 1M+ identifiers per advertiser, 10K+ RPS per instance
- **Database Strategy**: Sharding by advertiser_id, connection pooling, read/write separation, with migration path from SQLite to PostgreSQL/Redis

### Reliability & Fault Tolerance
- **Circuit Breakers**: Fail-fast patterns for dependent services with exponential backoff retry
- **Graceful Degradation**: Serve ads without suppression when system is overloaded or components fail
- **Data Redundancy**: Multi-region database replication with automated failover
- **Health Monitoring**: Comprehensive health checks with auto-healing and alerting

### Security & Compliance
- **Data Protection**: AES-256 encryption at rest, TLS 1.3 in transit, secure key management
- **Privacy Features**: One-way hashing of PII, data minimization principles, right to erasure support
- **Access Control**: RBAC with advertiser isolation, API rate limiting, audit trails
- **Compliance**: GDPR/CCPA-ready with data retention policies and consent management hooks

### Monitoring & Observability
- **Key Metrics**: Suppression check latency, cache hit ratios, error rates, database performance, memory usage
- **Alerting**: P99 latency > 50ms, error rate > 1%, cache hit ratio < 80%, storage utilization > 80%
- **Logging**: Structured JSON logs with correlation IDs, log levels, and automated retention

### Development Tools
| Tool | Purpose | Why Chosen |
|------|---------|------------|
| VS Code | IDE | Excellent Node.js support, debugging capabilities, and extensions |
| Node.js | Runtime | High performance for I/O-bound operations, rich ecosystem |
| SQLite | Development database | Simple setup, easy migration path to production databases |

## Testing Strategy

### Test Cases
- **Part 1**: CRUD operations, duplicate handling, error conditions, transaction safety
- **Part 2**: CSV import/export, validation rules, deduplication, metrics collection
- **Part 3**: Real-time suppression checking, multi-identifier support, cache performance, integration with ad server
- **Part 4**: Advanced features functionality, error resilience, performance under load

## Code Quality Notes

### Design Patterns Used
- **Repository Pattern**: For data access abstraction and database independence
- **Strategy Pattern**: For different suppression logics (AND/OR, sampling, etc.)
- **Factory Pattern**: For list creation with different validation strategies
- **Observer Pattern**: For audit logging and event tracking

### Testing Approach
- **Unit Tests**: Individual components and methods with mocked dependencies
- **Integration Tests**: Component interactions and data flow validation
- **Performance Tests**: Load testing and benchmark validation
- **End-to-End Tests**: Complete system workflow from ad request to response

## File Structure
```
falcon-suppression-system/
├── README.md
├── index.js                          # Main application entry point
├── package.json                      # Dependencies and scripts
├── data/                             # SQLite database storage
│   └── suppression_lists.db
├── mock_data/                        # Sample data for testing
│   ├── sample_suppression_lists.json
│   ├── test_ad_requests.json
│   ├── bulk_import_sample.csv
│   └── ad_server_config.json
├── service/                          # Core implementation
│   ├── suppression-list-manager.js   # Parts 1-2
│   ├── suppression-list-importer.js  # Part 2
│   ├── falcon-server-enhanced.js     # Part 3
│   └── advanced-features.js          # Part 4
├── tests/                            # Test suites
│   ├── test-part1.js
│   ├── test-part2.js
│   ├── test-part3.js
│   ├── test-part4.js
│   ├── test-complete-system.js
│   └── test-integration.js
├── docs/                             # Documentation
│   └── ARCHITECTURE.md
└── boilerplate/                      # Original provided files
    ├── falcon_server.js
    └── ad_server.js
```

## Appendix

### Sample Requests/Responses
```javascript
// Sample Ad Request
const request = {
    placement_id: "pl_12345",
    user: {
        email_hash: "a1b2c3d4e5f6789abcdef123456789abcdef123456789abcdef123456789abcd",
        device_id: "550e8400-e29b-41d4-a716-446655440000"
    },
    context: {
        site_id: "site_001",
        page_url: "https://technews.com/homepage"
    }
};

// Sample Response
const response = {
    adResponse: {
        served: false,
        bannerId: null,
        advertiserId: "adv_techcorp",
        reason: "Advertiser adv_techcorp suppressed by Falcon",
        processingTimeMs: 2.45
    },
    suppressionResult: {
        suppressedAdvertisers: ["adv_techcorp", "adv_gamestudio"],
        totalListsChecked: 3,
        processingTimeMs: 1.23,
        details: ["email_hash matched 2 advertisers"]
    }
};
```

### Configuration Files
**Environment Variables:**
```bash
DB_PATH=./data/suppression_lists.db
ENABLE_CACHE=true
CACHE_SIZE=10000
CACHE_TTL=300000
RETENTION_DAYS=90
LOG_LEVEL=info
```

### Database Schema
```sql
-- Core tables
CREATE TABLE suppression_lists (
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

CREATE TABLE suppression_identifiers (
    identifier_hash TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    identifier_type TEXT NOT NULL,
    list_id TEXT NOT NULL,
    advertiser_id TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES suppression_lists(id) ON DELETE CASCADE
);

-- Performance indexes
CREATE INDEX idx_identifier_lookup ON suppression_identifiers(identifier_hash, identifier_type);
CREATE INDEX idx_advertiser_lists ON suppression_lists(advertiser_id, identifier_type);
CREATE INDEX idx_list_identifiers ON suppression_identifiers(list_id);
```
