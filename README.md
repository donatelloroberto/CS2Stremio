# Cloudstream Unified Stremio Addon

This project is a **unified Stremio addon** that translates the core scraping logic from multiple Cloudstream provider repositories into a single, functional Node.js Stremio addon.

## Chosen Strategy: One Unified Addon

The strategy chosen is **Option A: One Unified Addon**.

This approach offers the **most stable and compatible result** for the following reasons:

1.  **Simplified User Experience:** Users only need to install and manage a single addon URL, reducing complexity.
2.  **Centralized Logic:** It allows for a single, shared utility layer (e.g., the `crypto.js` file for Gogoanime's AES decryption) and centralized error handling.
3.  **Stremio Compatibility:** Stremio is designed to aggregate sources. A single addon with multiple catalogs (one for each provider) integrates seamlessly into the Stremio ecosystem.

The initial version includes the **Gogoanime** provider, which requires complex AES decryption logic successfully translated from Kotlin to Node.js. This demonstrates the feasibility of integrating other providers like Bflix/Sflix (which use a different VRF encryption) in subsequent updates.

## How to Install

### 1. Self-Hosting (Recommended)

To run the addon, you need **Node.js (v18 or higher)** installed on your server (e.g., a VPS, Raspberry Pi, or local machine).

1.  **Clone the repository:**
    \`\`\`bash
    git clone https://github.com/donatelloroberto/CS2Stremio.git
    cd CS2Stremio
    \`\`\`

2.  **Install dependencies:**
    \`\`\`bash
    npm install
    \`\`\`

3.  **Start the server:**
    \`\`\`bash
    npm start
    # Or, for production use a process manager like PM2:
    # pm2 start server.js --name "cs2stremio"
    \`\`\`

4.  **Get the Manifest URL:**
    The server will start on port `7000` by default. The manifest URL will be:
    \`\`\`
    http://<YOUR_SERVER_IP_OR_DOMAIN>:7000/manifest.json
    \`\`\`

### 2. Using the Addon in Stremio

1.  Open your Stremio application.
2.  Go to the **Addons** section.
3.  Select **"Install Addon"** (or similar option, depending on your Stremio version).
4.  Paste the **Manifest URL** from the self-hosting step (e.g., `http://192.168.1.100:7000/manifest.json`) into the URL field.
5.  Click **Install**.

## How to Use Inside the Stremio App

The addon currently provides a single catalog for **Gogoanime**.

1.  **Search:** Use the main Stremio search bar. When you search for an anime title, the results from the "Gogoanime" catalog will appear.
2.  **Catalog Browsing (Future):** Once the main page logic is implemented, you will be able to browse the "Gogoanime" catalog directly from the Stremio home screen.
3.  **Streaming:** Select a series from the search results. The addon will fetch the episode list (meta route) and, when you select an episode, it will use the translated Cloudstream logic to find and provide the direct stream links (stream route).

## Project Structure

\`\`\`
CS2Stremio_Unified/
├── node_modules/
├── package.json
├── package-lock.json
├── server.js             # Main Stremio Addon server and routing logic
├── start.sh              # Simple script to start the server
├── README.md             # This file
└── src/
    ├── providers/
    │   └── GogoanimeProvider.js # Translated scraping logic for Gogoanime
    └── utils/
        └── crypto.js      # AES decryption utility for Gogoanime (translated from Kotlin)
\`\`\`

## Next Steps

The framework is now established. Future work involves:

1.  Implementing the **Bflix/Sflix** provider, which requires translating the VRF encryption logic.
2.  Implementing the **catalog browsing** (main page) logic for Gogoanime.
3.  Integrating more providers from the attached repositories.
