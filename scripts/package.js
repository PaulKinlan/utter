import { createWriteStream, existsSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { createGzip } from 'zlib';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DIST_DIR = 'dist';
const OUTPUT_FILE = 'extension.zip';

async function package_extension() {
  if (!existsSync(DIST_DIR)) {
    console.error('Error: dist/ directory not found. Run npm run build first.');
    process.exit(1);
  }

  // Use system zip command for reliable Chrome Web Store compatible archives
  try {
    await execAsync(`cd ${DIST_DIR} && zip -r ../${OUTPUT_FILE} .`);
    console.log(`Package complete: ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('Error creating zip:', err.message);
    console.error('Make sure the zip command is available on your system.');
    process.exit(1);
  }
}

package_extension();
