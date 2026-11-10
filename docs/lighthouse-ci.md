
# Lighthouse CI and PWA Verification

## Overview

Civic-Connect uses Lighthouse CI to monitor website performance and accessibility during continuous integration.

The CI workflow runs Lighthouse against the production preview build and verifies essential Progressive Web App (PWA) assets.

## Lighthouse CI Configuration

The configuration is maintained in `lighthouserc.json`.

- URL: `http://127.0.0.1:4174/`
- Number of Lighthouse runs: 3
- Performance minimum score: 70%
- Accessibility minimum score: 90%
- First Contentful Paint warning threshold: 4 seconds
- Largest Contentful Paint warning threshold: 4 seconds
- Cumulative Layout Shift warning threshold: 0.1

Performance and accessibility thresholds are enforced as errors. The individual paint and layout thresholds generate warnings.

## Running Lighthouse CI Locally

Install dependencies:

```bash
npm ci
```

Build the production application:

```bash
npm run build
```

Run Lighthouse CI:

```bash
npx lhci autorun
```

Check the configured assertions:

```bash
npx lhci assert
```

Lighthouse reports are saved in `.lighthouseci/`.

## PWA Asset Verification

The project includes a PWA verification script:

```bash
node scripts/verify-pwa.mjs
```

The script checks:

- Presence and validity of `dist/manifest.webmanifest`.
- Manifest name and short name.
- Start URL and application scope.
- Supported display mode.
- Presence of 192x192 and 512x512 icons.
- Presence of the Firebase messaging service worker.

## GitHub Actions Integration

The workflow is defined in `.github/workflows/ci.yml`.

It executes the following checks:

1. Install dependencies.
2. Run lint.
3. Build the application.
4. Verify PWA assets.
5. Run Lighthouse CI.

The workflow runs on pushes and pull requests targeting the `main` branch.

## Generated Reports

Lighthouse CI uses filesystem upload and stores its generated reports in `.lighthouseci/`.

These generated reports are local artifacts and should not be committed to the repository.
