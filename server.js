const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3012;
const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

// ── Horizons API proxy ───────────────────────────────────
// Proxies requests to JPL Horizons to avoid CORS.
// Known Orion / Artemis-related IDs to try:
//   -1024 (Artemis II / Orion "Integrity")
//   -1023 (Artemis I / Orion EM-1)  — for reference
//
// The client sends:  /api/horizons?id=-1024
// We query Horizons for a VECTORS ephemeris centered on Earth (399).
function handleHorizonsProxy(req, res) {
    const parsed = url.parse(req.url, true);
    const targetId = (parsed.query.id || '-1024').replace(/[^0-9\-]/g, '');

    const now = new Date();
    const pad = (n) => String(n).padStart(2,'0');
    const isoNow = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;
    const later = new Date(now.getTime() + 60000);
    const isoLater = `${later.getUTCFullYear()}-${pad(later.getUTCMonth()+1)}-${pad(later.getUTCDate())} ${pad(later.getUTCHours())}:${pad(later.getUTCMinutes())}`;

    const params = new URLSearchParams({
        format:      'json',
        COMMAND:     `'${targetId}'`,
        OBJ_DATA:    'NO',
        MAKE_EPHEM:  'YES',
        EPHEM_TYPE:  'VECTORS',
        CENTER:      "'500@399'",
        START_TIME:  `'${isoNow}'`,
        STOP_TIME:   `'${isoLater}'`,
        STEP_SIZE:   "'1'",
        VEC_TABLE:   '2',
        OUT_UNITS:   'KM-S',
        CSV_FORMAT:  'YES',
        VEC_LABELS:  'NO'
    });

    const apiUrl = `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`;

    https.get(apiUrl, { timeout: 8000 }, (apiRes) => {
        let body = '';
        apiRes.on('data', c => body += c);
        apiRes.on('end', () => {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            try {
                const json = JSON.parse(body);
                // Extract state vector from result text
                const result = json.result || '';
                const soeMatch = result.match(/\$\$SOE([\s\S]*?)\$\$EOE/);
                if (!soeMatch) {
                    res.end(JSON.stringify({ live: false, reason: 'no_ephemeris', raw: result.substring(0, 500) }));
                    return;
                }
                // CSV row: JDTDB, Cal, X, Y, Z, VX, VY, VZ,
                const lines = soeMatch[1].trim().split('\n').filter(l => l.trim());
                if (lines.length === 0) {
                    res.end(JSON.stringify({ live: false, reason: 'empty_table' }));
                    return;
                }
                const cols = lines[0].split(',').map(s => s.trim());
                // cols: [JDTDB, CalDate, X, Y, Z, VX, VY, VZ, ...]
                const x = parseFloat(cols[2]), y = parseFloat(cols[3]), z = parseFloat(cols[4]);
                const vx = parseFloat(cols[5]), vy = parseFloat(cols[6]), vz = parseFloat(cols[7]);
                const distKm = Math.sqrt(x*x + y*y + z*z);
                const speedKmS = Math.sqrt(vx*vx + vy*vy + vz*vz);
                const speedKmH = speedKmS * 3600;

                res.end(JSON.stringify({
                    live: true,
                    timestamp: cols[1],
                    distanceKm: Math.round(distKm),
                    speedKmH: Math.round(speedKmH),
                    position: { x, y, z },
                    velocity: { vx, vy, vz }
                }));
            } catch (e) {
                res.end(JSON.stringify({ live: false, reason: 'parse_error', message: e.message }));
            }
        });
    }).on('error', (e) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ live: false, reason: 'network_error', message: e.message }));
    }).on('timeout', function() {
        this.destroy();
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ live: false, reason: 'timeout' }));
    });
}

// ── Server ────────────────────────────────────────────────
http.createServer((req, res) => {
    const pathname = url.parse(req.url).pathname;

    // API route
    if (pathname === '/api/horizons') {
        return handleHorizonsProxy(req, res);
    }

    // Static files
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    filePath = path.normalize(filePath);
    if (!filePath.startsWith(__dirname)) { res.writeHead(403); return res.end(); }
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
    });
}).listen(PORT, () => console.log(`Artemis II Live running at http://localhost:${PORT}`));
