// Generate test QR images on the desktop so the scanner can be tested
// without a camera — just use the scanner's "Importer une image" button.
// Run: node scripts\generate-test-qr.cjs

const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const out = path.join(process.env.USERPROFILE, 'OneDrive', 'Bureau', 'SmartMaint-test-qr');
fs.mkdirSync(out, { recursive: true });

const items = [
    { file: '01-valid-REM-001-Remplisseuse.png',
      text: 'SMARTMAINT-LCPROD|REM-001|Remplisseuse automatique|Remplissage',
      note: 'VALID — should open the Remplisseuse machine' },
    { file: '02-valid-POM-001-Pompe.png',
      text: 'SMARTMAINT-LCPROD|POM-001|Pompe de transfert huile|Réception',
      note: 'VALID — should open the Pompe' },
    { file: '03-valid-CHD-001-Chaudiere.png',
      text: 'SMARTMAINT-LCPROD|CHD-001|Chaudière industrielle|Utilités',
      note: 'VALID — should open the Chaudière' },
    { file: '04-REJECT-website.png',
      text: 'https://www.google.com',
      note: 'REJECT — a random website QR, not a machine' },
    { file: '05-REJECT-unknown-code.png',
      text: 'SMARTMAINT-LCPROD|XXX-999|Fake|Nowhere',
      note: 'REJECT — looks like our format but the code is not in the DB' },
];

(async () => {
    for (const it of items) {
        const dst = path.join(out, it.file);
        await QRCode.toFile(dst, it.text, { width: 600, margin: 4 });
        console.log(it.note + '  ->  ' + it.file);
    }
    console.log('\nAll QR images saved to:\n  ' + out);
})();
