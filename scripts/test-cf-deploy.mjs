if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  console.log("Skipping deployed Cloudflare test: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are not set.");
  process.exit(0);
}

console.log("Deployed Cloudflare verification is not automated yet for this package scaffold.");
process.exit(0);
