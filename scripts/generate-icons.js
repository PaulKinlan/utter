import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const sizes = [16, 32, 48, 128];
const sourceIcon = join(projectRoot, 'assets/original-icon.png');
const outputDir = join(projectRoot, 'src/icons');

mkdirSync(outputDir, { recursive: true });

console.log(`Using source icon: ${sourceIcon}`);

for (const size of sizes) {
  const outputPath = join(outputDir, `icon-${size}.png`);
  await sharp(sourceIcon)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(outputPath);
  console.log(`Created icon-${size}.png`);
}

console.log('Icon generation complete!');
