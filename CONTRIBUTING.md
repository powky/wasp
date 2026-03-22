# Contributing to WaSP

Thank you for your interest in contributing to WaSP! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful, constructive, and professional. We're all here to build something useful.

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- Git

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/wasp.git
   cd wasp
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

### Building

```bash
# Build once
npm run build

# Build in watch mode
npm run dev
```

### Manual Testing

```bash
# Create a test file
cat > test-wasp.ts << 'EOF'
import { WaSP } from './src/index.js';

const wasp = new WaSP({ debug: true });

wasp.on('SESSION_QR', (event) => {
  console.log('QR:', event.data.qr);
});

const session = await wasp.createSession('test', 'BAILEYS');
console.log('Session created:', session.id);
EOF

# Run it
npx tsx test-wasp.ts
```

## Contribution Guidelines

### What We're Looking For

- **Bug fixes** - Always welcome
- **New providers** - Whatsmeow, Cloud API implementations
- **Store implementations** - MongoDB, DynamoDB, etc.
- **Middleware** - Useful cross-cutting concerns
- **Documentation** - Improvements, examples, tutorials
- **Performance** - Optimizations with benchmarks
- **Tests** - Increase coverage, edge cases

### What We're NOT Looking For

- Breaking changes without discussion
- Dependencies that bloat the bundle
- Features that duplicate existing functionality
- Code without tests

### Pull Request Process

1. **Write tests** for your changes
2. **Ensure all tests pass**: `npm test`
3. **Type check**: `npm run typecheck`
4. **Lint**: `npm run lint`
5. **Update documentation** if needed
6. **Write a clear PR description**:
   - What does this change?
   - Why is it needed?
   - How was it tested?
   - Any breaking changes?
7. **Link related issues** if applicable
8. **Wait for review** - maintainer will review ASAP

### Commit Messages

Use conventional commits:

```
feat: add Whatsmeow provider
fix: resolve reconnection race condition
docs: update Redis store example
test: add queue priority tests
chore: bump dependencies
```

### Code Style

- **TypeScript strict mode** - All code must type-check
- **No `any` types** - Use proper types or `unknown`
- **Async/await** - Prefer over promises chains
- **Error handling** - Always handle errors, emit error events
- **Comments** - Explain WHY, not WHAT (code should be self-documenting)
- **Naming** - Descriptive, no abbreviations unless obvious

### Testing Standards

- **Unit tests** for all business logic
- **Integration tests** for store implementations
- **Mock external dependencies** (Baileys, Redis, Postgres)
- **Test edge cases** - errors, timeouts, disconnections
- **Minimum 80% coverage** for new code

## Project Structure

```
wasp/
├── src/
│   ├── index.ts           # Public API exports
│   ├── types.ts           # Core type definitions
│   ├── wasp.ts            # Main WaSP class
│   ├── queue.ts           # Anti-ban message queue
│   ├── middleware.ts      # Built-in middleware
│   ├── providers/         # Provider implementations
│   │   └── baileys.ts     # Baileys provider
│   ├── stores/            # Storage implementations
│   │   ├── memory.ts      # In-memory store
│   │   ├── redis.ts       # Redis store
│   │   └── postgres.ts    # Postgres store
│   └── __tests__/         # Test files
│       └── wasp.test.ts
├── dist/                  # Compiled output (gitignored)
├── docs/                  # Documentation
├── package.json
├── tsconfig.json
└── README.md
```

## Adding a New Provider

1. Create `src/providers/yourprovider.ts`
2. Implement the `Provider` interface from `types.ts`
3. Handle connection lifecycle:
   - `connect()` - Establish connection
   - `disconnect()` - Clean disconnect
   - Emit `connected`, `disconnected`, `qr`, `error` events
4. Normalize messages to WaSP `Message` format
5. Add tests in `src/__tests__/yourprovider.test.ts`
6. Update `src/wasp.ts` to support new provider type
7. Document in README.md provider comparison table

## Adding a New Store

1. Create `src/stores/yourstore.ts`
2. Implement the `Store` interface from `types.ts`
3. Handle all CRUD operations:
   - `save()` - Upsert session
   - `load()` - Get session by ID
   - `delete()` - Remove session
   - `list()` - Query sessions with filter
   - `exists()` - Check existence
   - `update()` - Partial update
4. Make the underlying library an **optional peer dependency**
5. Throw helpful error if library not installed
6. Add tests with mocked client
7. Document in README.md storage options section

## Release Process

(Maintainers only)

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Commit: `git commit -m "chore: release vX.Y.Z"`
4. Tag: `git tag vX.Y.Z`
5. Push: `git push && git push --tags`
6. Publish: `npm publish`

## Questions?

- Open a [Discussion](https://github.com/kobie3717/wasp/discussions)
- Email: kobie3717@gmail.com

Thank you for contributing!
