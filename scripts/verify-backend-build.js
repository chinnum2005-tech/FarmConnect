const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(process.cwd(), 'apps', 'backend', 'dist', 'server.js'),
  path.join(process.cwd(), 'dist', 'server.js'),
  path.join(__dirname, '..', 'apps', 'backend', 'dist', 'server.js')
];

let foundPath = null;
for (const cand of candidates) {
  if (fs.existsSync(cand)) {
    foundPath = cand;
    break;
  }
}

if (foundPath) {
  const stat = fs.statSync(foundPath);
  console.log(`[VerifyBuild] SUCCESS: Backend entry point verified at ${foundPath} (${stat.size} bytes).`);
  process.exit(0);
}

console.error('[VerifyBuild] FATAL: apps/backend/dist/server.js was not found after compilation!');
console.error('[VerifyBuild] Current working directory:', process.cwd());

const checkDirs = [
  process.cwd(),
  path.join(process.cwd(), 'apps'),
  path.join(process.cwd(), 'apps', 'backend'),
  path.join(process.cwd(), 'apps', 'backend', 'dist'),
  path.join(process.cwd(), 'dist')
];

for (const d of checkDirs) {
  if (fs.existsSync(d)) {
    try {
      console.error(`[VerifyBuild] Contents of ${d}:`, fs.readdirSync(d));
    } catch (e) {
      console.error(`[VerifyBuild] Unable to list ${d}:`, e.message);
    }
  } else {
    console.error(`[VerifyBuild] Directory ${d} does not exist.`);
  }
}

process.exit(1);
