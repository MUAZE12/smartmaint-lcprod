// Builds public/logo.png (square app logo) + public/logo.ico (.exe icon)
// from public/logo-source.png — crops to the gear mark, drops the text band.
const sharp = require('sharp');
const _ico = require('png-to-ico');
const pngToIco = typeof _ico === 'function' ? _ico : _ico.default;
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const SRC = path.join(__dirname, '..', 'logo-source.png');

// Square crop around the two gears (source is 2048x2048; text band is below ~y1770).
const crop = { left: 221, top: 100, width: 1640, height: 1640 };

(async () => {
    await sharp(SRC).extract(crop).resize(512, 512).png().toFile(path.join(pub, 'logo.png'));
    console.log('✓ logo.png (512x512)');

    const sizes = [16, 32, 48, 64, 128, 256];
    const buffers = await Promise.all(
        sizes.map(s => sharp(path.join(pub, 'logo.png')).resize(s, s).png().toBuffer())
    );
    fs.writeFileSync(path.join(pub, 'logo.ico'), await pngToIco(buffers));
    console.log('✓ logo.ico (' + sizes.join(', ') + ')');
})().catch(e => { console.error(e); process.exit(1); });
