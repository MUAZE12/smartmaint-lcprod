// Verifies the QR scanner pipeline without a camera:
//   generate a machine QR  ->  decode with jsQR  ->  match a machine.
// Run:  node scripts\verify-qr.cjs

const QRCode = require('qrcode');
const jsQRmod = require('jsqr');
const jsQR = jsQRmod.default || jsQRmod;

// Same matcher as src/components/QRScanner.tsx
function matchMachineFromQR(text, machines) {
    const raw = (text || '').trim();
    if (!raw) return null;
    let candidate = raw;
    if (raw.includes('|')) {
        const parts = raw.split('|').map(p => p.trim());
        candidate = parts[0].toUpperCase().startsWith('SMARTMAINT') ? (parts[1] || '') : parts[0];
    }
    const c = candidate.trim().toLowerCase();
    if (!c) return null;
    return machines.find(m => m.code.toLowerCase() === c || m.id.toLowerCase() === c) || null;
}

// Render a QR string to an RGBA bitmap, exactly the kind of pixels jsQR
// gets from a camera frame.
function qrToRGBA(text) {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const data = qr.modules.data;
    const M = 10;          // pixels per module
    const Q = 4;           // quiet-zone modules
    const dim = (size + Q * 2) * M;
    const rgba = new Uint8ClampedArray(dim * dim * 4).fill(255); // white
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (!data[r * size + c]) continue;            // light module
            for (let dy = 0; dy < M; dy++) {
                for (let dx = 0; dx < M; dx++) {
                    const x = (c + Q) * M + dx, y = (r + Q) * M + dy;
                    const i = (y * dim + x) * 4;
                    rgba[i] = rgba[i + 1] = rgba[i + 2] = 0; // black
                }
            }
        }
    }
    return { rgba, dim };
}

const machines = [
    { id: 'mach-001', code: 'POM-001', name: 'Pompe de réception' },
    { id: 'mach-006', code: 'RMP-001', name: 'Remplisseuse' },
];

let pass = 0, fail = 0;
function check(label, ok, detail) {
    if (ok) { pass++; console.log('  PASS  ' + label); }
    else { fail++; console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
}

console.log('\nQR scanner pipeline verification\n');

// 1. A real machine QR (the format machines/[id]/page.tsx generates)
const payload = 'SMARTMAINT-LCPROD|POM-001|Pompe de réception|Réception';
{
    const { rgba, dim } = qrToRGBA(payload);
    const decoded = jsQR(rgba, dim, dim);
    check('machine QR decodes', !!decoded && decoded.data === payload, decoded ? decoded.data : 'no decode');
    const m = decoded ? matchMachineFromQR(decoded.data, machines) : null;
    check('decoded QR matches machine POM-001', !!m && m.code === 'POM-001', m ? m.code : 'no match');
}

// 2. A bare machine code QR
{
    const { rgba, dim } = qrToRGBA('RMP-001');
    const decoded = jsQR(rgba, dim, dim);
    const m = decoded ? matchMachineFromQR(decoded.data, machines) : null;
    check('bare code "RMP-001" matches machine', !!m && m.code === 'RMP-001', m ? m.code : 'no match');
}

// 3. A foreign QR (a website) must be rejected
{
    const { rgba, dim } = qrToRGBA('https://www.google.com');
    const decoded = jsQR(rgba, dim, dim);
    check('foreign QR decodes', !!decoded, 'decode failed');
    const m = decoded ? matchMachineFromQR(decoded.data, machines) : null;
    check('foreign QR is REJECTED (no machine)', m === null, m ? ('wrongly matched ' + m.code) : '');
}

// 4. An unknown machine code must be rejected
{
    const { rgba, dim } = qrToRGBA('SMARTMAINT-LCPROD|ZZZ-999|Fake|Nowhere');
    const decoded = jsQR(rgba, dim, dim);
    const m = decoded ? matchMachineFromQR(decoded.data, machines) : null;
    check('unknown code "ZZZ-999" is REJECTED', m === null, m ? ('wrongly matched ' + m.code) : '');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
