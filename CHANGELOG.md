# Changelog

All notable changes to WaSP (WhatsApp Session Protocol) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-03-22

### Added
- **CloudAPIProvider** - Meta WhatsApp Cloud API support
  - REST-based provider (no WebSocket, easier deployment)
  - Interactive button messages (up to 3 reply buttons)
  - List messages with sections and dropdown menus
  - Template messages (pre-approved message templates)
  - Media messages (image, video, audio, document with URLs)
  - Location messages (GPS coordinates with name/address)
  - Contact messages (vCard sharing)
  - Reaction messages (emoji reactions)
  - Webhook verification (`CloudAPIProvider.verifyWebhook()`)
  - Webhook parsing (`CloudAPIProvider.parseWebhook()`)
- **Comprehensive test suite** for CloudAPIProvider (30 tests)
  - Connection and authentication tests
  - All message type sending tests
  - Webhook verification tests
  - Webhook message parsing tests
  - Error handling tests
- **Documentation** for Cloud API provider
  - Complete usage guide (`docs/CLOUD_API_PROVIDER.md`)
  - Interactive message examples
  - Webhook setup instructions
  - Rate limit guidance
  - Hybrid setup (Baileys + Cloud API)
- **Example applications**
  - `cloud-api-buttons.ts` - All message types showcase
  - `cloud-api-webhook-server.ts` - Complete webhook server with auto-replies
  - `cloud-api-shop-bot.ts` - Full e-commerce bot with cart management
- **TypeScript exports**
  - `CloudAPIProvider` class
  - `CloudAPIProviderOptions` interface
  - `InteractiveMessage`, `InteractiveButton`, `ListSection` types
  - `TemplateMessage`, `LocationMessage`, `ContactMessage` types
  - `MediaMessage`, `ReactionMessage` types
  - `CloudAPIMessageContent` union type

### Changed
- Updated `wasp.ts` to support CLOUD_API provider type
- Enhanced `index.ts` with Cloud API exports

### Technical Details
- Cloud API uses native `fetch` (Node 18+) - no axios dependency
- Proper error mapping from Meta API errors to WaSP error types
- Phone number formatting (removes `@s.whatsapp.net` suffix)
- Message type normalization for webhook parsing
- Support for interactive button/list replies in webhooks

## [0.2.0] - 2026-03-22

### Added
- **Production-grade Baileys provider** with real WhatsApp connection logic
  - Exponential backoff reconnection (1s → 32s)
  - Bad MAC error recovery with state cleanup
  - Rate limit detection and throttle handling
  - Message normalization with JID formatting
- **Complete store implementations**
  - RedisStore with SCAN-based operations, TTL support, Date serialization
  - PostgresStore with auto-schema creation, JSONB metadata, indexed queries
  - MemoryStore with filtering and pagination
- **GitHub Actions CI** with Node.js 18/20 matrix testing
- **Comprehensive documentation**
  - 888-line README with API reference, examples, architecture diagrams
  - Comparison tables (WaSP vs Baileys vs Cloud API vs RetentionStack)
  - Complete TypeScript type definitions
- **Example applications**
  - Echo bot (simple message echo)
  - Webhook forwarder (integration example)
  - Group monitor (activity logging)
  - Multi-session manager (multi-tenant demo)
- **Docker support**
  - Production Dockerfile with optimized build
  - docker-compose.yml with Redis integration
  - docker-compose.dev.yml for development workflow

### Changed
- Upgraded to TypeScript 5.7.2
- Updated Baileys to ^7.0.0
- Updated pino to 9.5.0
- Enhanced test coverage to 36 tests across 3 stores and 4 middleware

### Fixed
- Session state persistence across reconnects
- Memory leaks in event handlers
- Type safety issues with provider abstraction

## [0.1.1] - 2026-03-19

### Added
- Basic store system (Memory, Redis, Postgres stubs)
- Middleware pipeline (logger, autoReconnect, rateLimit, errorHandler)
- Anti-ban queue with priority lanes
- Event normalization system

### Changed
- Improved TypeScript types
- Better error handling

## [0.1.0] - 2026-03-10

### Added
- Initial WaSP core implementation
- Session management abstraction
- Provider interface design
- Message queue with priority support
- Basic Baileys provider scaffold
- MIT license
- Project scaffolding (tsup, Vitest, ESLint)

### Notes
- First release - proof of concept
- Not production-ready (scaffold only)

---

## [Unreleased]

### Planned
- [ ] Whatsmeow provider implementation
- [ ] Cloud API provider implementation
- [ ] Message templates system
- [ ] Built-in webhook support with retry logic
- [ ] Group management utilities
- [ ] Metrics and monitoring dashboard
- [ ] Rate limiting per session/org
- [ ] Message queuing with Redis backend
- [ ] CLI tool for session management
- [ ] Admin dashboard UI

---

[0.2.0]: https://github.com/kobie3717/wasp/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/kobie3717/wasp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kobie3717/wasp/releases/tag/v0.1.0
