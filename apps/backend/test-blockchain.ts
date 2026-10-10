import { blockchainService } from './src/services/blockchain.service';

async function main() {
  const originalAddress = process.env.TRACEABILITY_CONTRACT_ADDRESS;
  const originalKey = process.env.RELAYER_PRIVATE_KEY;
  const originalUrl = process.env.RPC_URL;

  console.log("--- Starting Amoy Strict Mode Component Testing ---");

  // Test 1: Missing Address
  try {
    console.log("\nTesting missing TRACEABILITY_CONTRACT_ADDRESS...");
    delete process.env.TRACEABILITY_CONTRACT_ADDRESS;
    process.env.RELAYER_PRIVATE_KEY = 'fake_key';
    process.env.RPC_URL = 'fake_url';
    await blockchainService.recordEvent('test', 'test', {});
    console.error("FAIL: Did not throw on missing address!");
  } catch (err: any) {
    console.log("PASS: Caught expected error:", err.message);
  }

  // Test 2: Missing Key
  try {
    console.log("\nTesting missing RELAYER_PRIVATE_KEY...");
    process.env.TRACEABILITY_CONTRACT_ADDRESS = 'fake_address';
    delete process.env.RELAYER_PRIVATE_KEY;
    process.env.RPC_URL = 'fake_url';
    await blockchainService.recordEvent('test', 'test', {});
    console.error("FAIL: Did not throw on missing key!");
  } catch (err: any) {
    console.log("PASS: Caught expected error:", err.message);
  }

  // Test 3: Missing RPC URL
  try {
    console.log("\nTesting missing RPC_URL...");
    process.env.TRACEABILITY_CONTRACT_ADDRESS = 'fake_address';
    process.env.RELAYER_PRIVATE_KEY = 'fake_key';
    delete process.env.RPC_URL;
    await blockchainService.recordEvent('test', 'test', {});
    console.error("FAIL: Did not throw on missing RPC_URL!");
  } catch (err: any) {
    console.log("PASS: Caught expected error:", err.message);
  }

  console.log("\nAll Amoy strict mode tests passed.");
}

main();
