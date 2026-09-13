// set-local-env.js
// -----------------------------------------------------------------------------
// Local development bootstrap.
// Loaded via `nodemon --require ./set-local-env.js` before the app starts.
//
// The Key Vault URL is read from the environment (.env in dev, App Service
// configuration in production) and is never hardcoded here. See
// docs/DEVELOPMENT.md for the full list of required variables.
// -----------------------------------------------------------------------------

import "dotenv/config";

const vaultUrl = process.env.AZURE_KEY_VAULT_URL;

if (!vaultUrl) {
    console.error(
        "AZURE_KEY_VAULT_URL is not set.\n" +
        "  Add it to your .env file, for example:\n" +
        "    AZURE_KEY_VAULT_URL=https://<your-key-vault>.vault.azure.net/\n" +
        "  See docs/DEVELOPMENT.md for the full list of required variables."
    );
    process.exit(1);
}

console.log(`Local dev environment set: AZURE_KEY_VAULT_URL = ${vaultUrl}`);
