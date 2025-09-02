// initialize-kv.js (Final API Version) - Fixes the "fetch is not a function" error.

const fs = require('fs');
const toml = require('toml');
// We will import fetch dynamically inside the main function.

// --- START OF CONFIGURATION ---

const DEFAULT_CONFIG = {
  primary_chinese_source: 'm3u888'
};

const DEFAULT_SOURCES = [
  { key: 'aktv', url: 'https://aktv.space/live.m3u', is_active: 1 },
  { key: 'iptv-org', url: 'https://iptv-org.github.io/iptv/index.m3u', is_active: 1 },
  { key: 'm3u888', url: 'https://m3u888.zabc.net/get.php?username=tg_1660325115&password=abaf9ae6&token=52d66cf8283a9a8f0cac98032fdd1dd891403fd5aeb5bd2afc67ac337c3241be&type=m3u', is_active: 1 },
  { key: 'epg-best', url: 'https://epg.best/live.m3u', is_active: 1 },
  { key: 'iptv-plus', url: 'https://iptv-plus.net/live.m3u', is_active: 1 }
];

const KV_BINDING_NAME = "CONFIG_KV";

// --- END OF CONFIGURATION ---

function getConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error("❌ Critical Error: Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables.");
  }

  try {
    const tomlContent = fs.readFileSync('wrangler.toml', 'utf-8');
    const config = toml.parse(tomlContent);
    const namespace = config.kv_namespaces.find(kv => kv.binding === KV_BINDING_NAME);
    if (!namespace || !namespace.id) {
      throw new Error(`Could not find a KV namespace with binding "${KV_BINDING_NAME}" in wrangler.toml`);
    }
    return { accountId, apiToken, namespaceId: namespace.id };
  } catch (error) {
    throw new Error(`❌ Error reading wrangler.toml: ${error.message}`);
  }
}

async function writeToKv(fetch, config, key, value) {
  const { accountId, apiToken, namespaceId } = config;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;
  
  console.log(`> Writing to KV key: "${key}"`);

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'text/plain'
    },
    body: JSON.stringify(value)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed for key "${key}": ${response.status} ${response.statusText} - ${errorText}`);
  }

  console.log(`  ✅ Success!`);
}

async function main() {
  // --- !! THIS IS THE FIX !! ---
  // Dynamically import the node-fetch library in a way that works in all environments.
  const fetch = (await import('node-fetch')).default;
  // --- !! END OF FIX !! ---

  try {
    console.log("Reading configuration...");
    const config = getConfig();
    console.log(`Found Account ID and KV Namespace ID: ${config.namespaceId}`);

    console.log("\nInitializing KV namespace with default data via Cloudflare API...");

    await writeToKv(fetch, config, 'config', DEFAULT_CONFIG);

    for (const source of DEFAULT_SOURCES) {
      const sourceKey = `source:${source.key}`;
      const sourceValue = {
        url: source.url,
        is_active: source.is_active
      };
      await writeToKv(fetch, config, sourceKey, sourceValue);
    }

    console.log("\n✅ KV initialization complete!");
    console.log("You can now deploy your worker by running: wrangler deploy");

  } catch (error) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }
}

main();