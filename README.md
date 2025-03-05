# Funnelback Proxy API

A lightweight proxy server system that manages search functionality between Seattle University's frontend applications and Funnelback's search services.

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
   - Endpoint: `/proxy/funnelback/suggest`

6. **People Suggestions** (`suggestPeople.js`)
   - Specialized handler for faculty/staff searches
   - Returns detailed personnel information
   - Endpoint: `/proxy/suggestPeople`

7. **Program Suggestions** (`suggestPrograms.js`)
   - Dedicated to academic program searches
   - Returns program-specific metadata
   - Endpoint: `/proxy/suggestPrograms`

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

## Features

### Common Features Across All Handlers

- CORS handling for Seattle University domain
- Structured JSON logging
- Comprehensive error handling
- Request/Response tracking
- IP forwarding
- Detailed header management

### Specialized Features

#### People Search
- Rich metadata including:
  - Affiliation
  - Position
  - Department
  - College
  - Profile images

#### Program Search
- Program-specific data including:
  - Credential type
  - School/College
  - Credit requirements
  - Study areas
  - Program mode

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

## Security

- Origin restricted to `https://www.seattleu.edu`
- IP forwarding for request tracking
- Sanitized query parameters
- Protected header handling

## Deployment

The API is configured for deployment on Vercel with the following route structure:

```json
{
    "version": 2,
    "routes": [
        { "src": "/proxy/funnelback", "dest": "/api/server.js" },
        { "src": "/proxy/funnelback/search", "dest": "/api/search.js" },
        { "src": "/proxy/funnelback/tools", "dest": "/api/tools.js" },
        { "src": "/proxy/funnelback/spelling", "dest": "/api/spelling.js" },
        { "src": "/proxy/funnelback/suggest", "dest": "/api/suggest.js" },
        { "src": "/proxy/suggestPeople", "dest": "/api/suggestPeople.js" },
        { "src": "/proxy/suggestPrograms", "dest": "/api/suggestPrograms.js" }
    ]
}
```

## Dependencies

- axios: HTTP client for making requests to Funnelback
- os: System information for logging

## Best Practices

1. Always include error handling in frontend implementations
2. Use appropriate endpoints for specific search types
3. Implement query parameter sanitization
4. Handle response processing asynchronously
5. Implement proper loading states in UI

## Installation

```bash
# Clone the repository
git clone https://github.com/your-username/funnelback-proxy.git

# Navigate to the project directory
cd funnelback-proxy

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

```
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

## Repository Usage

This repository is connected directly to production systems. Access is restricted to authorized collaborators only.

### For Collaborators

Authorized collaborators must follow these guidelines when working with the repository:

1. Clone the repository directly:
   ```bash
   git clone https://github.com/your-username/funnelback-proxy.git
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

5. Deployment process:
   - Merges to main branch automatically deploy to production
   - All changes must be reviewed by at least one other collaborator
   - Deploy during low-traffic periods when possible

### Security Notes

- Never commit sensitive data or credentials
- Keep your access tokens secure
- Report security concerns immediately to the repository owner
- Regular security audits are conducted on all commits

### Repository Access

- Read/Write access: Restricted to authorized collaborators only
- Deploy access: Restricted to production systems
- Branch protection: Enabled on main branch

For questions or access requests, contact the repository owner.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/your-username/funnelback-proxy/tags).

## License

MIT License - See LICENSE file for details

## Author

Victor Chimenti

EOF
