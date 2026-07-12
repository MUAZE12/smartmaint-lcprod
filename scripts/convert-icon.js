// Converts public/logo.png to a proper PNG then to public/icon.ico
// Run: node scripts/convert-icon.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function convert() {
    const inputPath = path.join(__dirname, '..', 'public', 'logo.png');
    const cleanPngPath = path.join(__dirname, '..', 'public', 'logo-clean.png');
    const outputPath = path.join(__dirname, '..', 'public', 'icon.ico');

    // Step 1: Re-encode as proper 256x256 PNG using sharp
    console.log('[1/2] Re-encoding logo to 256x256 PNG...');
    await sharp(inputPath)
        .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(cleanPngPath);

    // Step 2: Convert clean PNG to ICO using png-to-ico
    console.log('[2/2] Converting PNG to ICO...');
    const mod = await import('png-to-ico');
    const pngToIco = mod.default || mod;
    const buf = await pngToIco(cleanPngPath);
    fs.writeFileSync(outputPath, buf);

    // Cleanup temp file
    fs.unlinkSync(cleanPngPath);

    console.log('✅ Icon converted:', outputPath);
    console.log('   Size:', (buf.length / 1024).toFixed(1), 'KB');
}

convert().catch(err => {
    console.error('❌ Failed:', err.message);
    process.exit(1);
});
