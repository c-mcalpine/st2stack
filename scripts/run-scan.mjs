import fs from 'node:fs/promises';
import path from 'node:path';
import { scanFile } from '../packages/scanner/src/index.mjs';

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath) {
    console.error('Usage: node scripts/run-scan.mjs <input.py> [output.json]');
    process.exit(1);
  }

  const result = await scanFile(inputPath);
  const serialized = `${JSON.stringify(result, null, 4)}\n`;

  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, serialized, 'utf8');
    return;
  }

  process.stdout.write(serialized);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
