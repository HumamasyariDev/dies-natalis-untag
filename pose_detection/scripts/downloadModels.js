/**
 * Script to download MediaPipe Pose Landmarker models
 * Run with: npm run download-models
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modelsDir = path.join(__dirname, '..', 'models');

const MODELS = [
  {
    name: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
  },
  {
    name: 'pose_landmarker_full.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
  },
  {
    name: 'pose_landmarker_heavy.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task'
  }
];

/**
 * Download a file from a URL
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
        process.stdout.write(`\r  Progress: ${percent}%`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(' - Complete');
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/**
 * Main function to download all models
 */
async function main() {
  console.log('MediaPipe Pose Landmarker Model Downloader');
  console.log('==========================================\n');

  // Ensure models directory exists
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
    console.log(`Created models directory: ${modelsDir}\n`);
  }

  for (const model of MODELS) {
    const destPath = path.join(modelsDir, model.name);

    // Check if model already exists
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      console.log(`[SKIP] ${model.name} already exists (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      continue;
    }

    console.log(`[DOWNLOAD] ${model.name}`);
    console.log(`  URL: ${model.url}`);

    try {
      await downloadFile(model.url, destPath);
      const stats = fs.statSync(destPath);
      console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`);
    } catch (error) {
      console.error(`  Error: ${error.message}\n`);
      process.exit(1);
    }
  }

  console.log('\nAll models downloaded successfully!');
  console.log(`Models location: ${modelsDir}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
