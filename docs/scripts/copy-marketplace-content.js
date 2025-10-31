const fs = require('fs-extra');
const path = require('path');

async function copyMarketplaceContent() {
  try {
    console.log('🚀 Copying marketplace content to main docs...');
    
    const source = path.join(__dirname, '../../marketplace/docs/content');
    const destination = path.join(__dirname, '../content/marketplace');
    
    // Check if marketplace content exists
    if (!await fs.pathExists(source)) {
      console.log('⚠️  Marketplace content not found at:', source);
      console.log('   Creating empty marketplace directory...');
      await fs.ensureDir(destination);
      return;
    }
    
    // Clean existing marketplace content
    console.log('🧹 Cleaning existing marketplace content...');
    await fs.remove(destination);
    
    // Copy marketplace content
    console.log('📁 Copying marketplace content...');
    await fs.copy(source, destination);

    // Copy marketplace public assets if they exist
    const publicSource = path.join(__dirname, '../../marketplace/docs/public');
    const publicDest = path.join(__dirname, '../public/marketplace');

    if (await fs.pathExists(publicSource)) {
      console.log('📁 Copying marketplace public assets...');
      await fs.remove(publicDest);
      await fs.copy(publicSource, publicDest);
    }

    console.log('✅ Marketplace content copied to main docs successfully!');
    
  } catch (error) {
    console.error('❌ Error copying marketplace content:', error);
    process.exit(1);
  }
}

copyMarketplaceContent();