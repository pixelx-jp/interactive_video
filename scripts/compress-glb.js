const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GENERATED_DIR = path.join(__dirname, '../public/generated');

console.log('🔍 Checking for gltf-pipeline...');

// 检查gltf-pipeline是否安装
try {
  execSync('npx gltf-pipeline --version', { stdio: 'pipe' });
  console.log('✓ gltf-pipeline found');
} catch (error) {
  console.log('Installing gltf-pipeline globally...');
  try {
    execSync('npm install -g gltf-pipeline', { stdio: 'inherit' });
  } catch (installError) {
    console.error('❌ Failed to install gltf-pipeline');
    console.error('Please install manually: npm install -g gltf-pipeline');
    process.exit(1);
  }
}

// 获取所有GLB文件（排除backup文件）
const files = fs.readdirSync(GENERATED_DIR)
  .filter(f => f.endsWith('.glb') && !f.includes('.backup'));

console.log(`\n📦 Found ${files.length} GLB files to compress\n`);

if (files.length === 0) {
  console.log('No GLB files to compress.');
  process.exit(0);
}

let compressed = 0;
let failed = 0;
let totalOriginalSize = 0;
let totalCompressedSize = 0;

for (const file of files) {
  const inputPath = path.join(GENERATED_DIR, file);
  const outputPath = path.join(GENERATED_DIR, `${file}.temp`);
  const backupPath = path.join(GENERATED_DIR, `${file}.backup`);

  try {
    const originalSize = fs.statSync(inputPath).size;
    totalOriginalSize += originalSize;

    console.log(`Compressing: ${file}`);
    console.log(`  Original: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);

    // 使用Draco压缩 (-d 参数)
    execSync(
      `npx gltf-pipeline -i "${inputPath}" -o "${outputPath}" -d`,
      { stdio: 'pipe' }
    );

    const compressedSize = fs.statSync(outputPath).size;
    totalCompressedSize += compressedSize;
    const savings = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    console.log(`  Compressed: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  ✓ Saved ${savings}% (${((originalSize - compressedSize) / 1024 / 1024).toFixed(2)} MB)\n`);

    // 备份原文件并替换
    fs.renameSync(inputPath, backupPath);
    fs.renameSync(outputPath, inputPath);

    compressed++;
  } catch (error) {
    console.error(`  ✗ Failed: ${error.message}\n`);
    failed++;

    // 清理临时文件
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 COMPRESSION SUMMARY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`✓ Compressed: ${compressed} files`);
console.log(`✗ Failed: ${failed} files`);
console.log(`📦 Original total: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`📦 Compressed total: ${(totalCompressedSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`💾 Total saved: ${((totalOriginalSize - totalCompressedSize) / 1024 / 1024).toFixed(2)} MB (${((1 - totalCompressedSize / totalOriginalSize) * 100).toFixed(1)}%)`);
console.log('\n💡 Backup files saved with .backup extension');
console.log('💡 To restore: rename .backup files back to .glb');
