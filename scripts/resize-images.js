const sharp = require('sharp');
const fs = require('fs');

const input = 'static/image/contours.webp';

// Create 1x version: smaller resolution
sharp(input)
  .resize(1280, 720, {
    fit: 'cover',
    position: 'center'
  })
  .webp({ quality: 50 })
  .toFile('static/image/contours-1x.webp')
  .then(() => {
    console.log('✓ contours-1x.webp created');
    const stats1x = fs.statSync('static/image/contours-1x.webp');
    console.log(`  Size: ${(stats1x.size / 1024 / 1024).toFixed(2)}MB`);
  })
  .catch(err => console.error('Error creating 1x:', err));

// Create 2x version: full resolution, high quality
sharp(input)
  .webp({ quality: 85 })
  .toFile('static/image/contours-2x.webp')
  .then(() => {
    console.log('✓ contours-2x.webp created');
    const stats2x = fs.statSync('static/image/contours-2x.webp');
    console.log(`  Size: ${(stats2x.size / 1024 / 1024).toFixed(2)}MB`);
  })
  .catch(err => console.error('Error creating 2x:', err));
