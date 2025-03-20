# Funnelback Proxy API - Development Environment

A lightweight proxy server system that manages search functionality between Seattle University's frontend applications and Funnelback's search services. This environment serves as both a development platform for new features and an emergency backup system for the production environment.

## Overview

This API serves as an intermediary layer between client-side applications and Funnelback's search infrastructure, providing specialized endpoints for different search functionalities. The system is designed to handle CORS, manage request forwarding, and ensure proper IP handling while maintaining secure connections to Funnelback's services.

## Architecture

The proxy consists of seven specialized handlers, each serving a specific search functionality:

1. **Main Server** (`server.js`)
   - Primary entry point for search functionality
   - Handles core search requests
   - Manages default parameters and CORS
   - Base endpoint: `/proxy/funnelback`

2. **Search Handler** (`search.js`)
   - Dedicated to pure search queries
   - Optimized for search result requests
   - Enhanced with analytics integration
   - Endpoint: `/proxy/funnelback/search`

3. **Tools Handler** (`tools.js`)
   - Manages tool-specific requests
   - Handles faceted search features
   - Endpoint: `/proxy/funnelback/tools`

4. **Spelling Handler** (`spelling.js`)
   - Processes spelling suggestion requests
   - Manages partial form parameters
   - Endpoint: `/proxy/funnelback/spelling`

5. **Suggest Handler** (`suggest.js`)
   - Handles autocomplete functionality
   - Provides real-time search suggestions
   - Implements Redis caching for performance
   - Endpoint: `/proxy/funnelback/suggest`

6. **People Suggestions** (`suggestPeople.js`)
   - Specialized handler for faculty/staff searches
   - Returns detailed personnel information
   - Implements Redis caching for performance
   - Endpoint: `/proxy/suggestPeople`

7. **Program Suggestions** (`suggestPrograms.js`)
   - Dedicated to academic program searches
   - Returns program-specific metadata
   - Implements Redis caching for performance
   - Endpoint: `/proxy/suggestPrograms`

## Core Features

### Performance & Scalability

- **Redis Caching Integration**: Implements caching for suggestion endpoints to reduce latency and server load
- **Configurable TTL**: Different TTL settings for different types of data based on volatility
- **Vercel Edge Functions**: Leverages edge computing for faster response times
- **Load Distribution**: Architecture designed to handle traffic spikes with minimal degradation

### Security & Privacy

- **Multi-Layer DDoS Protection**:
  - Vercel's built-in edge protection
  - Custom middleware rate limiting with endpoint-specific thresholds
  - IP-based request throttling with configurable time windows
  
- **Privacy-First Analytics**:
  - Anonymized location data storage
  - Session-based tracking instead of persistent user identification
  - Compliant with privacy regulations
  
- **Secure Headers Management**:
  - Strict CORS policy enforcement
  - Protection against header injection attacks
  - Careful handling of forwarded client information

### Analytics & Monitoring

- **MongoDB Analytics Integration**: Captures search patterns and user behavior
- **Click-Through Tracking**: Records which results users interact with
- **Geographic Insights**: Anonymous location-based data for understanding usage patterns
- **Session-Based Attribution**: Connects related actions for better understanding of user journeys
- **Performance Metrics**: Tracks response times and cache effectiveness

## Frontend Integration

### Base Configuration

```javascript
const FUNNELBACK_BASE_URL = 'https://your-domain.com/proxy/funnelback';
```

### Endpoint Usage

1. **General Search**

```javascript
// Basic search request
const searchResults = await fetch(`${FUNNELBACK_BASE_URL}/search?query=${searchTerm}`);
```

2. **Autocomplete**

```javascript
// Real-time suggestions
const suggestions = await fetch(`${FUNNELBACK_BASE_URL}/suggest?query=${partialQuery}`);
```

3. **People Search**

```javascript
// Faculty/Staff specific search
const peopleResults = await fetch(`/proxy/suggestPeople?query=${searchTerm}`);
```

4. **Program Search**

```javascript
// Academic program search
const programResults = await fetch(`/proxy/suggestPrograms?query=${searchTerm}`);
```

## Common Features Across All Handlers

- CORS handling for Seattle University domain
- Structured JSON logging
- Comprehensive error handling
- Request/Response tracking
- IP forwarding
- Detailed header management
- Session ID tracking
- GeoIP-based location detection

## Specialized Features

### People Search

- Rich metadata including:
  - Affiliation
  - Position
  - Department
  - College
  - Profile images

### Program Search

- Program-specific data including:
  - Credential type
  - School/College
  - Credit requirements
  - Study areas
  - Program mode

## Analytics Integration

The system includes comprehensive analytics tracking:

1. **Query Analytics**
   - Tracks search terms and patterns
   - Records result counts
   - Measures response times
   - Identifies zero-result searches

2. **Click Tracking**
   - Records which results users click
   - Tracks position in results list
   - Associates clicks with original queries

3. **Session Tracking**
   - Maintains session context across requests
   - Connects related searches
   - Provides journey analysis capabilities

4. **Anonymized Geographic Data**
   - Region-level location data
   - No personally identifiable information
   - Compliant with privacy regulations

## Response Formats

### People Search Response

```javascript
[
  {
    title: "Person Name",
    affiliation: "Faculty/Staff",
    position: "Position Title",
    department: "Department Name",
    college: "College Name",
    url: "Profile URL",
    image: "Image URL"
  }
]
```

### Program Search Response

```javascript
{
  metadata: {
    totalResults: number,
    queryTime: number,
    searchTerm: string
  },
  programs: [
    {
      id: number,
      title: string,
      url: string,
      details: {
        type: string,
        school: string,
        credits: string,
        area: string,
        level: string,
        mode: string
      },
      image: string,
      description: string
    }
  ]
}
```

## Error Handling

All endpoints implement consistent error handling:

- HTTP 500 for server errors
- Detailed error messages in response
- Structured error logging
- Error tracking with request context
- Graceful degradation (e.g., falling back to non-cached responses)

## Security

- Origin restricted to `https://www.seattleu.edu/`
- Rate limiting via edge middleware
- IP forwarding for request tracking
- Sanitized query parameters
- Protected header handling
- Session-based tracking instead of IP-based

## Caching Strategy

The system uses Redis for performance optimization:

- Suggestion endpoints cached for 1 hour
- Program data cached for 24 hours
- People data cached for 12 hours
- Automatic cache invalidation
- Cache key generation based on query parameters
- Fallback to live data if cache fails

## Middleware Architecture

The system includes edge middleware that provides:

- Rate limiting with endpoint-specific thresholds
- IP address preservation
- Session ID generation and tracking
- Request header augmentation
- Early request validation

## Deployment

The API is configured for deployment on Vercel with the following route structure defined in `vercel.json`:

```json
{
    "version": 2,
    "rewrites": [
        { "source": "/proxy/funnelback", "destination": "/api/server.js" },
        { "source": "/proxy/funnelback/search", "destination": "/api/search.js" },
        { "source": "/proxy/funnelback/tools", "destination": "/api/tools.js" },
        { "source": "/proxy/funnelback/spelling", "destination": "/api/spelling.js" },
        { "source": "/proxy/funnelback/suggest", "destination": "/api/suggest.js" },
        { "source": "/proxy/suggestPeople", "destination": "/api/suggestPeople.js" },
        { "source": "/proxy/suggestPrograms", "destination": "/api/suggestPrograms.js" },
        
        { "source": "/proxy/analytics/click", "destination": "/api/analytics/click.js" },
        { "source": "/proxy/analytics/clicks-batch", "destination": "/api/analytics/clicksBatch.js" },
        { "source": "/proxy/analytics/supplement", "destination": "/api/analytics/supplement.js" },
        { "source": "/proxy/analytics", "destination": "/api/analytics/supplement.js" },
        
        { "source": "/api/queryCount", "destination": "/api/queryCount.js" },
        { "source": "/api/mongoTest", "destination": "/api/mongoTest.js" },
        { "source": "/api/testAnalytics", "destination": "/api/testAnalytics.js" }
    ],
    "headers": [
        {
            "source": "/proxy/analytics/(.*)",
            "headers": [
                { "key": "Access-Control-Allow-Credentials", "value": "true" },
                { "key": "Access-Control-Allow-Origin", "value": "https://www.seattleu.edu" },
                { "key": "Access-Control-Allow-Methods", "value": "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
                { "key": "Access-Control-Allow-Headers", "value": "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Origin" }
            ]
        }
    ]
}
```

## Dependencies

- axios: HTTP client for making requests to Funnelback
- mongoose: MongoDB client for analytics
- redis: Redis client for caching
- express: Web server framework
- dotenv: Environment variable management
- cors: CORS middleware

## Emergency Backup Capabilities

This development environment is designed to function as an emergency backup to the production system:

- Fully functional endpoints mirroring production
- Separate infrastructure to maintain availability during main system outages
- Reduced but sufficient capacity for critical services
- Continuous synchronization with production codebase

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/funnelback-proxy-dev.git

# Navigate to the project directory
cd funnelback-proxy-dev

# Install dependencies
npm install

# For production dependencies only
npm install --production
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# Funnelback Configuration
FUNNELBACK_BASE_URL=https://dxp-us-search.funnelback.squiz.cloud/s
ALLOWED_ORIGIN=https://www.seattleu.edu

# Server Configuration
NODE_ENV=development
PORT=3000

# MongoDB Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database

# Redis Configuration
REDIS_URL=redis://username:password@hostname:port

# Optional Logging Configuration
LOG_LEVEL=info
ENABLE_REQUEST_LOGGING=true
```

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Run in production mode
npm start

# Lint the code
npm run lint

# Fix linting issues
npm run lint:fix
```

## Recommended Testing

### Testing Setup

To implement testing for this API, we recommend setting up:

```bash
# Install testing dependencies
npm install --save-dev jest supertest nock

# Add to package.json scripts
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

### Suggested Test Structure

```text
tests/
├── unit/
│   ├── handlers/
│   │   ├── suggestPeople.test.js
│   │   ├── suggestPrograms.test.js
│   │   └── suggest.test.js
│   └── utils/
│       └── logEvent.test.js
├── integration/
│   └── endpoints.test.js
└── mocks/
    └── funnelbackResponses.js
```

### Key Areas to Test

1. **Handler Functions**

   ```javascript
   // Example test for suggestPeople.js
   describe('People Suggestion Handler', () => {
     test('should clean and format personnel data', () => {
       // Test cleanTitle function
     });

     test('should handle missing metadata fields', () => {
       // Test null/undefined handling
     });

     test('should properly enrich suggestions', () => {
       // Test data enrichment
     });
   });
   ```

2. **Error Handling**

   ```javascript
   // Example error handling test
   describe('Error Handling', () => {
     test('should handle Funnelback API errors gracefully', () => {
       // Mock failed API response
     });

     test('should return appropriate status codes', () => {
       // Test various error scenarios
     });
   });
   ```

3. **CORS and Headers**

   ```javascript
   // Example CORS test
   describe('CORS Handling', () => {
     test('should set correct CORS headers', () => {
       // Verify headers for seattleu.edu
     });
   });
   ```

4. **Request Validation**

   ```javascript
   // Example validation test
   describe('Request Validation', () => {
     test('should validate required parameters', () => {
       // Test parameter validation
     });
   });
   ```

5. **Caching**

   ```javascript
   // Example caching test
   describe('Redis Caching', () => {
     test('should return cached data when available', () => {
       // Test cache hit path
     });

     test('should fetch from API when cache misses', () => {
       // Test cache miss path
     });
   });
   ```

### Mocking External Services

```javascript
// Example using nock to mock Funnelback API
const nock = require('nock');

beforeAll(() => {
  nock('https://dxp-us-search.funnelback.squiz.cloud')
    .get('/s/search.json')
    .query(true)
    .reply(200, {
      // Mock response data
    });
});
```

### Performance Testing

Consider implementing load tests using Artillery or k6:

```javascript
// k6 example script
import http from 'k6/http';

export default function() {
  http.get('http://localhost:3000/proxy/suggestPeople?query=test');
}

export const options = {
  vus: 10,
  duration: '30s',
};
```

These tests will help ensure:

- Correct data transformation
- Proper error handling
- API reliability
- Performance under load
- CORS compliance
- Header management
- Cache effectiveness

## Repository Usage

This repository is a development environment for testing improvements to the production Funnelback proxy system. Changes made here can be tested thoroughly before implementation in the production environment. Additionally, this environment serves as an emergency backup in case of production system failure.

### For Collaborators

Authorized collaborators must follow these guidelines when working with the repository:

1. Clone the repository directly:

   ```bash
   git clone https://github.com/your-username/funnelback-proxy-dev.git
   ```

2. Always create a new branch for changes:

   ```bash
   git checkout -b feature/description-of-change
   ```

3. Commit standards:

   ```bash
   # Format: type(scope): description
   git commit -m "feat(suggestPeople): add new metadata field for department"
   git commit -m "fix(server): correct CORS header handling"
   ```

4. Testing changes:
   - Test all changes thoroughly in development environment
   - Verify CORS functionality with seattleu.edu domain
   - Check all error handling scenarios
   - Validate logging output
   - Test caching behavior
   - Verify analytics data capture

5. Deployment process:
   - Deployments to the development environment are managed through Vercel
   - All changes must be tested in this environment before being applied to production
   - Document all improvements and changes for future reference
   - Maintain compatibility with production for emergency backup functionality

### Security Notes

- Never commit sensitive data or credentials
- Keep your access tokens secure
- Report security concerns immediately to the repository owner
- Regular security audits are conducted on all commits
- Ensure rate limiting is properly configured for all endpoints

### Repository Access

- Read/Write access: Restricted to authorized collaborators only
- Deploy access: Restricted to development systems
- Branch protection: Recommended for main branch

For questions or access requests, contact the repository owner.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/your-username/funnelback-proxy-dev/tags).

## License

MIT License - See LICENSE file for details

## Author

Victor Chimenti
