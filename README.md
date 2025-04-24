# 🧬 Lost IPFS Files of ENS

This project discovers ENS domains that point to IPFS content and checks whether that content is still accessible via public IPFS gateways.

## Features

- Crawls ENS domains via The Graph
- Extracts IPFS hashes from `contentHash`
- Checks availability across multiple IPFS gateways
- Publishes a dashboard highlighting failures (a.k.a. IPFS ghosts 👻)
- Hosted permanently via ArDrive + AR.IO

## Setup

```bash
npm install
```

## 🏃 Run

Fetch ENS names with IPFS or Arweave contentHash:

```bash
npm run fetch
```

This saves to data/ens-ipfs-index.json

Check IPFS availability:

```bash
npm run check
```

This saves to data/resolved-status.json

Launch the dashboard:

```bash
npm run serve
```

Then open http://localhost:8080/dashboard in your browser.
