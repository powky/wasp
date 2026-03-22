# NPM Publishing Guide for WaSP v0.2.0

## Pre-Publish Checklist

### ✅ Completed
- [x] Package name changed to `wasp-protocol` (available on npm)
- [x] Version bumped to `0.2.0`
- [x] Description updated to reflect production-ready status
- [x] Keywords expanded (15 keywords for better discoverability)
- [x] `files` array configured (dist, docs, examples, Docker files)
- [x] Examples created (4 example apps in `/examples`)
- [x] Docker support added (Dockerfile + docker-compose)
- [x] CHANGELOG.md created (documenting v0.1.0 → v0.2.0)
- [x] README.md streamlined (888 lines → 420 lines)
- [x] .npmignore updated
- [x] Build system works (CJS + ESM output)

### ⚠️ Known Issues
- TypeScript definitions (.d.ts files) not generated due to type errors in `src/cli.ts`
- These errors exist in the current codebase and were not introduced by this update
- Package is still functional - CJS and ESM builds succeed
- Users can still use the package with JSDoc or loose TypeScript

### 🔧 Fix Before Publishing (Optional)
If you want full TypeScript support, fix these type errors in `src/cli.ts`:

```typescript
// Replace string literals with EventType enum values
wasp.on('SESSION_CONNECTED', ...) → wasp.on(EventType.SESSION_CONNECTED, ...)

// Add authDir to type definition or remove from usage
```

Or disable type declaration generation temporarily:
```json
// package.json
"build": "tsup src/index.ts src/cli.ts --format cjs,esm --clean"
```

## Publishing Steps

### 1. Login to npm
```bash
npm login
# Enter credentials for npm account
```

### 2. Test Package Locally
```bash
# Test build
npm run build

# Test pack (see what will be published)
npm pack --dry-run

# Install locally in another project
npm pack
cd /path/to/test-project
npm install /root/wasp/wasp-protocol-0.2.0.tgz
```

### 3. Publish to npm
```bash
# Publish (first time)
npm publish

# Or if scoped package
npm publish --access public
```

### 4. Verify Published Package
```bash
# Check npm registry
npm view wasp-protocol

# Install in test project
npm install wasp-protocol
```

### 5. Tag Release on GitHub
```bash
git tag -a v0.2.0 -m "Production-ready release with Baileys provider, stores, Docker support"
git push origin v0.2.0
```

## Post-Publish

### Update Documentation
- Update GitHub README with npm install instructions
- Add shields.io badges (npm version, downloads, etc.)
- Create GitHub release with changelog

### Announce
- Twitter/X
- Reddit (r/node, r/whatsapp)
- Dev.to blog post
- Hacker News (Show HN)

### Monitor
- npm downloads: `npm view wasp-protocol`
- GitHub issues for bug reports
- npm deprecation warnings

## Package Contents

The published package will include:

```
wasp-protocol@0.2.0
├── dist/                    # Built CJS + ESM (no .d.ts yet)
│   ├── index.js            # CJS entry point
│   ├── index.mjs           # ESM entry point
│   ├── cli.js              # CLI entry point
│   └── ...                 # Chunks
├── examples/               # 4 example apps
│   ├── echo-bot.ts
│   ├── webhook-forwarder.ts
│   ├── group-monitor.ts
│   └── multi-session.ts
├── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── README.md
├── CHANGELOG.md
├── LICENSE
└── package.json
```

## Version Strategy

Follow semver:
- **Patch (0.2.x)**: Bug fixes, docs
- **Minor (0.x.0)**: New features (Whatsmeow provider, webhooks, CLI)
- **Major (x.0.0)**: Breaking changes (API redesign, remove deprecated)

## Future Releases

### v0.2.1 (patch)
- Fix TypeScript definitions
- Bug fixes from user feedback

### v0.3.0 (minor)
- Whatsmeow provider
- Built-in webhook support
- CLI improvements

### v1.0.0 (major)
- Stable API contract
- All 3 providers (Baileys, Whatsmeow, Cloud API)
- Production battle-tested

## Support Channels

After publishing, monitor:
- GitHub Issues: https://github.com/kobie3717/wasp/issues
- GitHub Discussions: https://github.com/kobie3717/wasp/discussions
- Email: kobie3717@gmail.com
