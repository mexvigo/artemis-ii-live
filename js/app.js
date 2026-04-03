// ═══════════════════════════════════════════════════════════
//  ARTEMIS II LIVE — 8-bit Mission Tracker
// ═══════════════════════════════════════════════════════════
(() => {
'use strict';

// ── Canvas ────────────────────────────────────────────────
const canvas = document.getElementById('space');
const ctx = canvas.getContext('2d');
const W = 480, H = 270;

// ── Celestial bodies (canvas coords) ─────────────────────
const EARTH = { x: 65, y: 135, r: 24 };
const MOON  = { x: 415, y: 135, r: 12 };

// ── Palette ───────────────────────────────────────────────
const C = {
    space:      '#0a0a1a',
    earthDeep:  '#0D47A1',
    earthBlue:  '#1E88E5',
    earthGreen: '#2E7D32',
    earthIce:   '#B0BEC5',
    moonGrey:   '#9E9E9E',
    moonLight:  '#BDBDBD',
    moonDark:   '#616161',
    trajDot:    'rgba(255,255,255,0.12)',
    trajDone:   'rgba(0,229,255,0.25)',
    capsule:    '#FFD600',
    trail:      '#FF6D00',
    exhaust1:   '#FF3D00',
    exhaust2:   '#FFAB00',
    label:      'rgba(255,255,255,0.45)',
};

// ── Mission Phases ────────────────────────────────────────
// startH/endH in mission hours (T+0 = launch)
// Launch: 2026-Apr-01 22:24 UTC (default — updated from API if available)
let LAUNCH_UTC = Date.UTC(2026, 3, 1, 22, 24, 0); // Apr 1 2026 22:24 UTC
let launchTimeStr = 'APR 01, 2026 22:24 UTC'; // human-readable, updated from API
let launchFetched = false;

const PHASES = [
    {
        id:'prelaunch', name:'PRE-LAUNCH',
        desc:'Final countdown — crew completes systems check aboard Orion at LC-39B, Kennedy Space Center',
        startH:-2, endH:0,
        distS:0, distE:0, spdS:0, spdE:0,
        trajS:0, trajE:0, color:'#607D8B', pct:3
    },
    {
        id:'launch', name:'LAUNCH & ASCENT',
        desc:'SLS ignites with 39.1 million Newtons of thrust — Orion climbs to orbit in ~20 minutes',
        startH:0, endH:0.33,
        distS:0, distE:185, spdS:0, spdE:28000,
        trajS:0, trajE:0, color:'#FF5722', pct:3
    },
    {
        id:'orbit', name:'EARTH ORBIT',
        desc:'Parking orbit — perigee raise maneuver, apogee raise to 70,377 km, then ICPS separation at T+3h24m',
        startH:0.33, endH:5,
        distS:185, distE:2223, spdS:28000, spdE:28000,
        trajS:0, trajE:0, color:'#2196F3', pct:5
    },
    {
        id:'highorbit', name:'HIGH EARTH ORBIT',
        desc:'Highly elliptical orbit — apogee at ~61,000 km, systems checkout & Orion separation from ICPS upper stage',
        startH:5, endH:25.25,
        distS:2223, distE:8261, spdS:28000, spdE:33565,
        trajS:0, trajE:0, color:'#3F51B5', pct:8
    },
    {
        id:'tli', name:'TLI BURN',
        desc:'Trans-Lunar Injection — ICPS upper stage fires at perigee (~T+25.5h on Apr 2), accelerating Orion to ~38,350 km/h',
        startH:25.25, endH:25.75,
        distS:8261, distE:10186, spdS:33565, spdE:31492,
        trajS:0, trajE:0.02, color:'#FF9800', pct:4
    },
    {
        id:'outbound', name:'OUTBOUND COAST',
        desc:'Coasting to the Moon — trajectory correction burns expected. Enters lunar sphere of influence before flyby',
        startH:25.75, endH:121.4,
        distS:10186, distE:370000, spdS:31492, spdE:4000,
        trajS:0.02, trajE:0.44, color:'#9C27B0', pct:28,
        ease:'out'
    },
    {
        id:'flyby', name:'LUNAR FLYBY',
        desc:'Closest approach to the Moon at T+121h23m — crew views the far side. Maximum distance from Earth at T+121h26m',
        startH:121.4, endH:123.4,
        distS:370000, distE:370000, spdS:4000, spdE:4000,
        trajS:0.44, trajE:0.56, color:'#FFEB3B', pct:5,
        special:'flyby'
    },
    {
        id:'return', name:'RETURN COAST',
        desc:'Free-return trajectory — exits lunar sphere at T+139h47m. Piloting demo on day 8. Correction burns on days 9 & 10',
        startH:123.4, endH:217,
        distS:370000, distE:2000, spdS:4000, spdE:39500,
        trajS:0.56, trajE:0.98, color:'#00BCD4', pct:35,
        ease:'in'
    },
    {
        id:'reentry', name:'RE-ENTRY & SPLASHDOWN',
        desc:'Module separation at T+217h13m — entry interface at 122 km. Splashdown in the Pacific near Baja California at T+217h46m',
        startH:217, endH:218,
        distS:2000, distE:0, spdS:39500, spdE:0,
        trajS:0.98, trajE:1.0, color:'#F44336', pct:5
    }
];

const TOTAL_HOURS = PHASES[PHASES.length-1].endH - PHASES[0].startH;

// ── Stars ─────────────────────────────────────────────────
const stars = Array.from({length:180}, () => ({
    x: Math.random()*W,
    y: Math.random()*H,
    b: 0.3+Math.random()*0.7,
    s: 0.5+Math.random()*2,
    o: Math.random()*Math.PI*2
}));

// ── Capsule trail ─────────────────────────────────────────
const trail = [];
const TRAIL_LEN = 20;
let trailTick = 0;

// ── State ─────────────────────────────────────────────────
let missionH = PHASES[0].startH;
let speed = 1000;
let playing = true;
let lastTime = null;
let animTime = 0;

// ── Live data state ───────────────────────────────────────
let mode = 'live';          // 'sim' or 'live'
let liveData = null;       // latest Horizons response
let livePhase = null;      // current phase inferred from live telemetry
let livePollTimer = null;
let phaseCheckTimer = null;
let liveAvailable = false; // true once we get a valid response
let moonDistKm = null;     // live distance from Orion to Moon
const POLL_INTERVAL = 15000; // 15 seconds

// Detect if running on GitHub Pages (no server proxy available)
const IS_STATIC = location.hostname.includes('github.io') || location.protocol === 'file:';
const WORKER_BASE = 'https://artemis-horizons-proxy.acrvogt.workers.dev/horizons';

// ── Fetch launch time from JPL OBJ_DATA ──────────────────
async function fetchLaunchTime() {
    if (launchFetched) return;
    try {
        const baseUrl = IS_STATIC ? WORKER_BASE : 'https://ssd.jpl.nasa.gov/api/horizons.api';
        const url = `${baseUrl}?format=json&COMMAND='-1024'&MAKE_EPHEM=NO&OBJ_DATA=YES`;
        const res = await fetch(url);
        const json = await res.json();
        const result = json.result || '';
        // Look for pattern: "launched April 1 @ 22:24 UTC" or similar
        const match = result.match(/launched?\s+(\w+\s+\d+)\s*@\s*(\d{1,2}:\d{2})\s*UTC/i);
        if (match) {
            const dateStr = match[1]; // e.g. "April 1"
            const timeStr = match[2]; // e.g. "22:24"
            // Parse month and day
            const months = {january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11};
            const parts = dateStr.trim().split(/\s+/);
            const mon = months[parts[0].toLowerCase()];
            const day = parseInt(parts[1]);
            const [hh, mm] = timeStr.split(':').map(Number);
            if (mon !== undefined && !isNaN(day) && !isNaN(hh)) {
                // Assume current year
                const year = new Date().getUTCFullYear();
                LAUNCH_UTC = Date.UTC(year, mon, day, hh, mm, 0);
                const monNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
                launchTimeStr = `${monNames[mon]} ${String(day).padStart(2,'0')}, ${year} ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} UTC`;
            }
        }
        launchFetched = true;
    } catch (e) {
        // Silently fall back to hardcoded launch time
    }
}

// Build the JPL Horizons URL for direct client-side fetch
function buildHorizonsURL() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2,'0');
    const isoNow = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;
    const later = new Date(now.getTime() + 60000);
    const isoLater = `${later.getUTCFullYear()}-${pad(later.getUTCMonth()+1)}-${pad(later.getUTCDate())} ${pad(later.getUTCHours())}:${pad(later.getUTCMinutes())}`;
    const params = new URLSearchParams({
        format:      'json',
        COMMAND:     "'-1024'",
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
    return IS_STATIC
        ? `${WORKER_BASE}?${params}`
        : `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`;
}

// Parse Horizons JSON result into our live data format
function parseHorizonsResult(json) {
    const result = json.result || '';
    const soeMatch = result.match(/\$\$SOE([\s\S]*?)\$\$EOE/);
    if (!soeMatch) return null;
    const lines = soeMatch[1].trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) return null;
    const cols = lines[0].split(',').map(s => s.trim());
    const x = parseFloat(cols[2]), y = parseFloat(cols[3]), z = parseFloat(cols[4]);
    const vx = parseFloat(cols[5]), vy = parseFloat(cols[6]), vz = parseFloat(cols[7]);
    const distKm = Math.sqrt(x*x + y*y + z*z);
    const speedKmS = Math.sqrt(vx*vx + vy*vy + vz*vz);
    return {
        live: true,
        timestamp: cols[1],
        distanceKm: Math.round(distKm),
        speedKmH: Math.round(speedKmS * 3600),
        position: { x, y, z },
        velocity: { vx, vy, vz }
    };
}

// ── DOM refs ──────────────────────────────────────────────
const $phase   = document.getElementById('s-phase');
const $dist    = document.getElementById('s-dist');
const $speed   = document.getElementById('s-speed');
const $met     = document.getElementById('s-met');
const $next    = document.getElementById('s-next');
const $moon    = document.getElementById('s-moon');
const $progress= document.getElementById('s-progress');
const $crew    = document.getElementById('s-crew');
const $badge   = document.getElementById('phase-badge');
const $desc    = document.getElementById('phase-desc');
const $bar     = document.getElementById('timeline-bar');
const $srcDot  = document.getElementById('src-dot');
const $srcLabel= document.getElementById('src-label');
const $footNote= document.getElementById('footer-note');
const numFmt   = new Intl.NumberFormat('en-US', {maximumFractionDigits:0});

// ── Easing ────────────────────────────────────────────────
function easeIn(t)  { return t*t; }
function easeOut(t) { return t*(2-t); }
function lerp(a,b,t){ return a+(b-a)*t; }

// ── Phase helpers ─────────────────────────────────────────
function getPhase(h) {
    for (let i=PHASES.length-1; i>=0; i--) { if (h>=PHASES[i].startH) return PHASES[i]; }
    return PHASES[0];
}

function phaseProg(h) {
    const p=getPhase(h), d=p.endH-p.startH;
    return d===0?1:Math.max(0,Math.min(1,(h-p.startH)/d));
}

function getDistance(h) {
    const p=getPhase(h), t=phaseProg(h);
    if (p.special==='flyby') {
        const peak=384400;
        return t<=0.5? lerp(p.distS,peak,t*2) : lerp(peak,p.distE,(t-0.5)*2);
    }
    const et = p.ease==='out'?easeOut(t) : p.ease==='in'?easeIn(t) : t;
    return lerp(p.distS,p.distE,et);
}

function getSpeed(h) {
    const p=getPhase(h), t=phaseProg(h);
    if (p.special==='flyby') {
        const peak=8200;
        return t<=0.5? lerp(p.spdS,peak,t*2) : lerp(peak,p.spdE,(t-0.5)*2);
    }
    return lerp(p.spdS,p.spdE,t);
}

// ── Trajectory geometry ───────────────────────────────────
function qBez(p0,p1,p2,t) {
    const m=1-t;
    return { x:m*m*p0.x+2*m*t*p1.x+t*t*p2.x, y:m*m*p0.y+2*m*t*p1.y+t*t*p2.y };
}

const T_OUT_S = {x:89,  y:135};
const T_OUT_C = {x:240, y:30};
const T_OUT_E = {x:400, y:119};
const T_RET_S = {x:400, y:151};
const T_RET_C = {x:240, y:240};
const T_RET_E = {x:89,  y:135};

function trajPoint(p) {
    if (p<=0.44) return qBez(T_OUT_S, T_OUT_C, T_OUT_E, p/0.44);
    if (p<=0.56) {
        const t=(p-0.44)/0.12, angle=-2.3+t*4.6;
        return { x:MOON.x+Math.cos(angle)*22, y:MOON.y+Math.sin(angle)*22 };
    }
    return qBez(T_RET_S, T_RET_C, T_RET_E, (p-0.56)/0.44);
}

function capsulePos(h) {
    const p=getPhase(h), t=phaseProg(h);
    if (p.id==='prelaunch') return {x:EARTH.x+EARTH.r+4, y:EARTH.y};
    if (p.id==='launch')    return {x:EARTH.x+EARTH.r+4+t*3, y:EARTH.y-t*4};
    if (p.id==='orbit') {
        const a=t*Math.PI*6, r=EARTH.r+6;
        return { x:EARTH.x+Math.cos(a)*r, y:EARTH.y+Math.sin(a)*r };
    }
    if (p.id==='highorbit') {
        // Wider elliptical orbit — slowly drifts outward as apogee raises
        const baseR = EARTH.r + 10;
        const maxR  = EARTH.r + 22;
        const r = lerp(baseR, maxR, t);
        // Slow orbit: ~1.5 full rotations across the whole phase
        const a = t * Math.PI * 3;
        // Slight elliptical squash
        return { x: EARTH.x + Math.cos(a) * r, y: EARTH.y + Math.sin(a) * (r * 0.7) };
    }
    return trajPoint(lerp(p.trajS, p.trajE, t));
}

// ── Draw helpers ──────────────────────────────────────────
function drawStars(t) {
    for (const s of stars) {
        const tw=0.5+0.5*Math.sin(t*s.s+s.o);
        ctx.fillStyle=`rgba(255,255,255,${(s.b*tw).toFixed(2)})`;
        ctx.fillRect(s.x|0, s.y|0, 1, 1);
    }
}

function drawBody(body, baseColor, detailFn) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.r, 0, Math.PI*2);
    ctx.clip();
    ctx.fillStyle=baseColor;
    ctx.fillRect(body.x-body.r, body.y-body.r, body.r*2, body.r*2);
    detailFn();
    ctx.restore();
}

function drawEarth() {
    drawBody(EARTH, C.earthDeep, () => {
        // Ocean
        ctx.fillStyle=C.earthBlue;
        ctx.beginPath();
        ctx.arc(EARTH.x+3, EARTH.y-2, EARTH.r-3, 0, Math.PI*2);
        ctx.fill();
        // Continents
        ctx.fillStyle=C.earthGreen;
        const px=3;
        ctx.fillRect(EARTH.x-15, EARTH.y-12, px*2, px*3);
        ctx.fillRect(EARTH.x-12, EARTH.y-2,  px,   px*3);
        ctx.fillRect(EARTH.x+3,  EARTH.y-14, px*2, px*2);
        ctx.fillRect(EARTH.x+4,  EARTH.y-6,  px*2, px*4);
        ctx.fillRect(EARTH.x+10, EARTH.y-12, px*3, px*2);
        ctx.fillRect(EARTH.x+12, EARTH.y-6,  px*2, px*2);
        // Ice caps
        ctx.fillStyle=C.earthIce;
        ctx.fillRect(EARTH.x-10, EARTH.y-EARTH.r+1, 20, 3);
        ctx.fillRect(EARTH.x-8,  EARTH.y+EARTH.r-4, 16, 3);
    });
    // Atmosphere glow
    ctx.strokeStyle='rgba(100,181,246,0.35)';
    ctx.lineWidth=1;
    ctx.beginPath();
    ctx.arc(EARTH.x, EARTH.y, EARTH.r+2, 0, Math.PI*2);
    ctx.stroke();
}

function drawMoon() {
    drawBody(MOON, C.moonGrey, () => {
        ctx.fillStyle=C.moonLight;
        ctx.beginPath();
        ctx.arc(MOON.x-2, MOON.y-1, MOON.r-2, 0, Math.PI*2);
        ctx.fill();
        // Craters
        ctx.fillStyle=C.moonDark;
        ctx.fillRect(MOON.x-5, MOON.y-4, 3, 3);
        ctx.fillRect(MOON.x+2, MOON.y+1, 4, 3);
        ctx.fillRect(MOON.x-2, MOON.y+5, 2, 2);
        ctx.fillRect(MOON.x+4, MOON.y-6, 2, 2);
    });
}

function drawTrajectory(h) {
    // Full path as dots
    const phase=getPhase(h);
    const currentTraj=lerp(phase.trajS, phase.trajE, phaseProg(h));

    for (let i=0; i<=200; i++) {
        const p=i/200;
        const pt=trajPoint(p);
        // Travelled portion slightly brighter
        ctx.fillStyle = p<=currentTraj && phase.trajS>0 ? C.trajDone : C.trajDot;
        ctx.fillRect(pt.x|0, pt.y|0, 1, 1);
    }
}

function drawTrail() {
    for (let i=0; i<trail.length; i++) {
        const a=(i/trail.length)*0.55;
        ctx.fillStyle=`rgba(255,109,0,${a.toFixed(2)})`;
        const sz = i>trail.length*0.7 ? 2 : 1;
        ctx.fillRect(trail[i].x|0, trail[i].y|0, sz, sz);
    }
}

function drawCapsule(pos, h) {
    const phase=getPhase(h);
    const burning = phase.id==='launch' || phase.id==='tli';

    // Exhaust during burns
    if (burning) {
        for (let i=0; i<3; i++) {
            const ox=-(Math.random()*4+2), oy=(Math.random()*3-1);
            ctx.fillStyle=Math.random()>0.5?C.exhaust1:C.exhaust2;
            ctx.fillRect((pos.x+ox)|0, (pos.y+oy)|0, 1, 1);
        }
    }

    // Capsule body (3x3 bright pixel)
    ctx.fillStyle=C.capsule;
    ctx.fillRect((pos.x-1)|0, (pos.y-1)|0, 3, 3);
    // Highlight pixel
    ctx.fillStyle='#FFF';
    ctx.fillRect(pos.x|0, (pos.y-1)|0, 1, 1);
}

function drawLabels() {
    ctx.fillStyle=C.label;
    ctx.font='7px "Press Start 2P", monospace';
    ctx.textAlign='center';
    ctx.fillText('EARTH', EARTH.x, EARTH.y+EARTH.r+12);
    ctx.fillText('MOON',  MOON.x,  MOON.y+MOON.r+12);
}

function drawDistanceLine(hOrObj) {
    let d;
    if (typeof hOrObj === 'object' && hOrObj.live) {
        d = hOrObj.dist;
    } else {
        d = getDistance(hOrObj);
    }
    if (d<500) return;
    const pct=Math.min(d/384400,1);
    const startX=EARTH.x+EARTH.r+6, endX=MOON.x-MOON.r-6;
    const barX=startX+pct*(endX-startX);

    ctx.strokeStyle='rgba(0,229,255,0.15)';
    ctx.setLineDash([2,4]);
    ctx.beginPath();
    ctx.moveTo(startX, H-12);
    ctx.lineTo(endX, H-12);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle='#00E5FF';
    ctx.fillRect(barX-1, H-14, 3, 5);

    ctx.fillStyle='rgba(0,229,255,0.5)';
    ctx.font='5px "Press Start 2P", monospace';
    ctx.textAlign='center';
    const label=d>=1000? Math.round(d/1000)+'K km' : Math.round(d)+' km';
    ctx.fillText(label, (startX+barX)/2, H-4);
}

// ── Horizons API Client ───────────────────────────────────
async function pollHorizons() {
    try {
        let data;
        if (IS_STATIC) {
            // Use Cloudflare Worker CORS proxy
            const res = await fetch(buildHorizonsURL());
            const json = await res.json();
            data = parseHorizonsResult(json);
            if (!data) data = { live: false };
        } else {
            // Use our local server proxy
            const res = await fetch('/api/horizons?id=-1024');
            data = await res.json();
        }
        if (data.live) {
            liveData = data;
            liveAvailable = true;
        } else {
            liveData = null;
            liveAvailable = false;
        }
    } catch (e) {
        liveData = null;
        liveAvailable = false;
    }
    updateSourceIndicator();
    // Also fetch Moon distance in parallel
    pollMoonDistance();
}

// Fetch Moon position (Earth-centered) and compute distance from Orion
async function pollMoonDistance() {
    if (!liveData || !liveData.position) { moonDistKm = null; return; }
    try {
        const now = new Date();
        const pad = (n) => String(n).padStart(2,'0');
        const isoNow = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;
        const later = new Date(now.getTime() + 60000);
        const isoLater = `${later.getUTCFullYear()}-${pad(later.getUTCMonth()+1)}-${pad(later.getUTCDate())} ${pad(later.getUTCHours())}:${pad(later.getUTCMinutes())}`;
        const params = new URLSearchParams({
            format:     'json',
            COMMAND:    "'301'",
            OBJ_DATA:   'NO',
            MAKE_EPHEM: 'YES',
            EPHEM_TYPE: 'VECTORS',
            CENTER:     "'500@399'",
            START_TIME: `'${isoNow}'`,
            STOP_TIME:  `'${isoLater}'`,
            STEP_SIZE:  "'1'",
            VEC_TABLE:  '2',
            OUT_UNITS:  'KM-S',
            CSV_FORMAT: 'YES',
            VEC_LABELS: 'NO'
        });
        const url = IS_STATIC
            ? `${WORKER_BASE}?${params}`
            : `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`;
        const res = await fetch(url);
        const json = await res.json();
        const result = json.result || '';
        const soe = result.match(/\$\$SOE([\s\S]*?)\$\$EOE/);
        if (!soe) { moonDistKm = null; return; }
        const cols = soe[1].trim().split('\n')[0].split(',').map(s => s.trim());
        const mx = parseFloat(cols[2]), my = parseFloat(cols[3]), mz = parseFloat(cols[4]);
        // Vector from Orion to Moon
        const dx = liveData.position.x - mx;
        const dy = liveData.position.y - my;
        const dz = liveData.position.z - mz;
        moonDistKm = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
    } catch (e) {
        moonDistKm = null;
    }
}

// ── Crew sleep/wake schedule ──────────────────────────────
// Artemis II planned crew schedule (approximate, based on NASA flight plan)
// Sleep periods repeat roughly every 24h. All times in mission hours.
const CREW_SCHEDULE = [
    { startH: -8,    endH: 0,     status: 'AWAKE',  activity: 'Pre-launch prep & countdown' },
    { startH: 0,     endH: 14,    status: 'AWAKE',  activity: 'Launch, orbit ops & systems checkout' },
    { startH: 14,    endH: 22,    status: 'SLEEP',  activity: 'Sleep period 1' },
    { startH: 22,    endH: 38,    status: 'AWAKE',  activity: 'TLI burn, post-TLI checkout & outbound coast' },
    { startH: 38,    endH: 46,    status: 'SLEEP',  activity: 'Sleep period 2' },
    { startH: 46,    endH: 62,    status: 'AWAKE',  activity: 'Outbound coast ops & trajectory correction' },
    { startH: 62,    endH: 70,    status: 'SLEEP',  activity: 'Sleep period 3' },
    { startH: 70,    endH: 86,    status: 'AWAKE',  activity: 'Mid-course correction & Earth/Moon photography' },
    { startH: 86,    endH: 94,    status: 'SLEEP',  activity: 'Sleep period 4' },
    { startH: 94,    endH: 110,   status: 'AWAKE',  activity: 'Outbound coast & navigation updates' },
    { startH: 110,   endH: 118,   status: 'SLEEP',  activity: 'Sleep period 5' },
    { startH: 118,   endH: 134,   status: 'AWAKE',  activity: 'Lunar flyby & far-side observation' },
    { startH: 134,   endH: 142,   status: 'SLEEP',  activity: 'Sleep period 6' },
    { startH: 142,   endH: 158,   status: 'AWAKE',  activity: 'Return coast & piloting demo prep' },
    { startH: 158,   endH: 166,   status: 'SLEEP',  activity: 'Sleep period 7' },
    { startH: 166,   endH: 182,   status: 'AWAKE',  activity: 'Piloting demonstration & systems test' },
    { startH: 182,   endH: 190,   status: 'SLEEP',  activity: 'Sleep period 8' },
    { startH: 190,   endH: 206,   status: 'AWAKE',  activity: 'Final trajectory correction & stow' },
    { startH: 206,   endH: 213,   status: 'SLEEP',  activity: 'Sleep period 9' },
    { startH: 213,   endH: 220,   status: 'AWAKE',  activity: 'Re-entry prep, module separation & splashdown' }
];

function getCrewStatus(h) {
    for (let i = CREW_SCHEDULE.length - 1; i >= 0; i--) {
        if (h >= CREW_SCHEDULE[i].startH && h < CREW_SCHEDULE[i].endH) return CREW_SCHEDULE[i];
    }
    return { status: '\u2014', activity: '' };
}

// ── Journey progress ──────────────────────────────────────
function getJourneyProgress(distFromEarth, phase) {
    const MOON_DIST = 384400;
    if (!phase) return 0;
    if (phase.id === 'prelaunch') return 0;
    if (phase.id === 'reentry' && distFromEarth < 100) return 100;
    if (phase.id === 'return' || phase.id === 'reentry') {
        const retPct = 1 - Math.min(distFromEarth / MOON_DIST, 1);
        return Math.round(50 + retPct * 50);
    }
    if (phase.id === 'flyby') return 50;
    const outPct = Math.min(distFromEarth / MOON_DIST, 1);
    return Math.round(outPct * 50);
}

// ── Phase auto-correction (runs every 12 h) ──────────────
// Fetches the full trajectory from launch to now in 30-min steps,
// then detects actual phase transitions from the speed/distance curve.
const PHASE_CHECK_INTERVAL = 12 * 3600000; // 12 hours
let lastPhaseCheck = 0;

async function checkPhaseSchedule() {
    const now = Date.now();
    if (now - lastPhaseCheck < PHASE_CHECK_INTERVAL) return;
    lastPhaseCheck = now;

    const elapsedH = (now - LAUNCH_UTC) / 3600000;
    if (elapsedH < 1) return; // too early — nothing to check

    try {
        const pad = (n) => String(n).padStart(2, '0');
        const launch = new Date(LAUNCH_UTC);
        const startISO = `${launch.getUTCFullYear()}-${pad(launch.getUTCMonth()+1)}-${pad(launch.getUTCDate())} ${pad(launch.getUTCHours())}:${pad(launch.getUTCMinutes())}`;
        const nd = new Date(now);
        const endISO = `${nd.getUTCFullYear()}-${pad(nd.getUTCMonth()+1)}-${pad(nd.getUTCDate())} ${pad(nd.getUTCHours())}:${pad(nd.getUTCMinutes())}`;

        const params = new URLSearchParams({
            format:     'json',
            COMMAND:    "'-1024'",
            OBJ_DATA:   'NO',
            MAKE_EPHEM: 'YES',
            EPHEM_TYPE: 'VECTORS',
            CENTER:     "'500@399'",
            START_TIME: `'${startISO}'`,
            STOP_TIME:  `'${endISO}'`,
            STEP_SIZE:  "'30m'",
            VEC_TABLE:  '2',
            OUT_UNITS:  'KM-S',
            CSV_FORMAT: 'YES',
            VEC_LABELS: 'NO'
        });
        const url = IS_STATIC ? `${WORKER_BASE}?${params}` : `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`;
        const res = await fetch(url);
        const json = await res.json();
        const result = json.result || '';
        const soe = result.match(/\$\$SOE([\s\S]*?)\$\$EOE/);
        if (!soe) return;

        // Parse all data points
        const rows = soe[1].trim().split('\n').filter(l => l.trim());
        const points = rows.map(line => {
            const c = line.split(',').map(s => s.trim());
            const jd = parseFloat(c[0]);
            const x = parseFloat(c[2]), y = parseFloat(c[3]), z = parseFloat(c[4]);
            const vx = parseFloat(c[5]), vy = parseFloat(c[6]), vz = parseFloat(c[7]);
            const dist = Math.sqrt(x*x + y*y + z*z);
            const spd = Math.sqrt(vx*vx + vy*vy + vz*vz) * 3600; // km/h
            // JD to mission hours
            const msFromLaunch = (jd - 2460766.43333) * 86400000; // launch JD approx
            const mH = msFromLaunch / 3600000;
            return { h: mH, dist, spd, jd };
        });
        if (points.length < 3) return;

        // Recalculate mission hours using actual LAUNCH_UTC for precision
        const launchJD = points[0].jd;
        points.forEach(p => {
            p.h = (p.jd - launchJD) * 24;
        });

        // ── Detect TLI: find max speed point (TLI perigee burn) ──
        let maxSpd = 0, tliIdx = -1;
        for (let i = 0; i < points.length; i++) {
            if (points[i].spd > maxSpd) { maxSpd = points[i].spd; tliIdx = i; }
        }

        // TLI is valid if max speed > 30,000 km/h and distance then increases
        if (tliIdx > 0 && maxSpd > 30000) {
            const tliH = points[tliIdx].h;
            // Find where speed first exceeds 30,000 (start of burn approach)
            let burnStartH = tliH;
            for (let i = 0; i < tliIdx; i++) {
                if (points[i].spd > 25000 && points[i+1].spd > points[i].spd) {
                    burnStartH = points[i].h;
                    break;
                }
            }
            // Find where distance starts steadily increasing post-TLI
            let coastStartH = tliH;
            for (let i = tliIdx; i < points.length - 1; i++) {
                if (points[i].dist > points[tliIdx].dist && points[i+1].dist > points[i].dist) {
                    coastStartH = points[i].h;
                    break;
                }
            }

            // Update highorbit → TLI → outbound boundaries
            const hiOrbit = PHASES.find(p => p.id === 'highorbit');
            const tli = PHASES.find(p => p.id === 'tli');
            const outbound = PHASES.find(p => p.id === 'outbound');
            if (hiOrbit && tli && outbound) {
                hiOrbit.endH = burnStartH;
                hiOrbit.distE = Math.round(points[Math.max(0, tliIdx - 2)].dist);
                hiOrbit.spdE = Math.round(points[Math.max(0, tliIdx - 2)].spd);
                tli.startH = burnStartH;
                tli.endH = coastStartH;
                tli.distS = Math.round(points[Math.max(0, tliIdx - 2)].dist);
                tli.distE = Math.round(points[Math.min(points.length-1, tliIdx + 2)].dist);
                tli.spdS = Math.round(points[Math.max(0, tliIdx - 2)].spd);
                tli.spdE = Math.round(points[Math.min(points.length-1, tliIdx + 2)].spd);
                outbound.startH = coastStartH;
                outbound.distS = Math.round(points[Math.min(points.length-1, tliIdx + 2)].dist);
                outbound.spdS = Math.round(points[Math.min(points.length-1, tliIdx + 2)].spd);
                console.log(`[Phase Check] TLI detected at T+${tliH.toFixed(1)}h (burn ${burnStartH.toFixed(1)}→${coastStartH.toFixed(1)}h), max speed ${Math.round(maxSpd)} km/h`);
            }
        }

        // ── Detect lunar flyby: peak distance from Earth ──
        let maxDist = 0, flybyIdx = -1;
        for (let i = 0; i < points.length; i++) {
            if (points[i].dist > maxDist) { maxDist = points[i].dist; flybyIdx = i; }
        }
        // Flyby valid if peak > 350,000 km and distance later decreases
        if (flybyIdx > 0 && flybyIdx < points.length - 2 && maxDist > 350000) {
            const preFlyby = points[flybyIdx - 1];
            const postFlyby = points[Math.min(points.length-1, flybyIdx + 1)];
            if (postFlyby.dist < maxDist) {
                // Distance is decreasing after peak — flyby occurred
                const flybyH = points[flybyIdx].h;
                const outbound = PHASES.find(p => p.id === 'outbound');
                const flyby = PHASES.find(p => p.id === 'flyby');
                const ret = PHASES.find(p => p.id === 'return');
                if (outbound && flyby && ret) {
                    outbound.endH = flybyH - 1;
                    outbound.distE = Math.round(preFlyby.dist);
                    outbound.spdE = Math.round(preFlyby.spd);
                    flyby.startH = flybyH - 1;
                    flyby.endH = flybyH + 1;
                    ret.startH = flybyH + 1;
                    ret.distS = Math.round(postFlyby.dist);
                    ret.spdS = Math.round(postFlyby.spd);
                    console.log(`[Phase Check] Flyby detected at T+${flybyH.toFixed(1)}h, peak dist ${Math.round(maxDist)} km`);
                }
            }
        }

        // ── Detect re-entry: distance drops below 1000 km after being far ──
        if (maxDist > 100000) {
            for (let i = flybyIdx > 0 ? flybyIdx : Math.floor(points.length/2); i < points.length; i++) {
                if (points[i].dist < 1000 && points[i].spd > 25000) {
                    const ret = PHASES.find(p => p.id === 'return');
                    const reentry = PHASES.find(p => p.id === 'reentry');
                    if (ret && reentry) {
                        ret.endH = points[i].h;
                        reentry.startH = points[i].h;
                        console.log(`[Phase Check] Re-entry detected at T+${points[i].h.toFixed(1)}h`);
                    }
                    break;
                }
            }
        }

        console.log(`[Phase Check] Complete — analyzed ${points.length} data points over ${points[points.length-1].h.toFixed(1)}h`);
    } catch (e) {
        console.warn('[Phase Check] Failed:', e.message);
    }
}

function startLivePolling() {
    pollHorizons(); // immediate first poll
    livePollTimer = setInterval(pollHorizons, POLL_INTERVAL);
    // Run phase schedule check immediately, then every 12 hours
    checkPhaseSchedule();
    if (!phaseCheckTimer) {
        phaseCheckTimer = setInterval(checkPhaseSchedule, PHASE_CHECK_INTERVAL);
    }
}

function stopLivePolling() {
    if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; }
    if (phaseCheckTimer) { clearInterval(phaseCheckTimer); phaseCheckTimer = null; }
}

function setMode(m) {
    mode = m;
    document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === m);
    });

    if (m === 'live') {
        fetchLaunchTime(); // get latest launch time from JPL
        startLivePolling();
        // In live mode, also sync simulated time to real MET
        missionH = getRealMET();
        playing = false;
        // Hide sim controls
        document.getElementById('speed-group').style.display = 'none';
        document.getElementById('btn-play').style.display = 'none';
        document.getElementById('btn-pause').style.display = 'none';
        document.getElementById('btn-reset').style.display = 'none';
    } else {
        stopLivePolling();
        document.getElementById('speed-group').style.display = '';
        document.getElementById('btn-play').style.display = '';
        document.getElementById('btn-pause').style.display = '';
        document.getElementById('btn-reset').style.display = '';
    }
    updateSourceIndicator();
}

function updateSourceIndicator() {
    const realH = getRealMET();
    if (mode === 'live' && liveAvailable) {
        $srcDot.className = 'dot dot-live';
        $srcLabel.textContent = 'LIVE \u2014 JPL HORIZONS';
        $footNote.textContent = 'Live telemetry from JPL Horizons API';
    } else if (mode === 'live' && realH >= 0 && !liveAvailable) {
        $srcDot.className = 'dot dot-waiting';
        $srcLabel.textContent = 'TELEMETRY PENDING \u2014 SIMULATED POSITION';
        $footNote.textContent = 'Live data begins after ICPS separation (~T+3h24m) \u2014 showing simulated trajectory';
    } else if (mode === 'live' && realH < 0) {
        $srcDot.className = 'dot dot-waiting';
        $srcLabel.textContent = `COUNTDOWN \u2014 LAUNCH: ${launchTimeStr}`;
        $footNote.textContent = 'Awaiting launch \u2014 live telemetry will activate after ICPS separation';
    } else {
        $srcDot.className = 'dot dot-sim';
        $srcLabel.textContent = 'SIMULATED DATA';
        $footNote.textContent = 'Simulated trajectory based on NASA Artemis II flight plan';
    }
}

// Infer mission phase from elapsed time + telemetry cross-check
function inferPhaseFromLive(distKm, spdKmH) {
    const now = Date.now();
    const elapsedH = (now - LAUNCH_UTC) / 3600000;

    // Time-based phase — reads boundaries from PHASES array (auto-corrected every 12h)
    let timePhase = PHASES[0];
    for (let i = PHASES.length - 1; i >= 0; i--) {
        if (elapsedH >= PHASES[i].startH) { timePhase = PHASES[i]; break; }
    }

    // If no valid telemetry, trust the timeline
    if (!distKm || distKm <= 0) return timePhase;

    // ── Hybrid cross-checks: override when telemetry clearly contradicts ──
    // TLI not yet fired: timeline says TLI or outbound, but still close to Earth
    if ((timePhase.id === 'tli' || timePhase.id === 'outbound') && distKm < 80000 && spdKmH < 20000) {
        return PHASES.find(p => p.id === 'highorbit') || timePhase;
    }
    // Early TLI: timeline says high orbit, but distance proves departure
    if (timePhase.id === 'highorbit' && distKm > 100000) {
        return PHASES.find(p => p.id === 'outbound') || timePhase;
    }
    // Should be outbound but near Moon — already in flyby
    if (timePhase.id === 'outbound' && distKm > 350000) {
        return PHASES.find(p => p.id === 'flyby') || timePhase;
    }
    // Should be return but still near Moon
    if (timePhase.id === 'return' && distKm > 350000) {
        return PHASES.find(p => p.id === 'flyby') || timePhase;
    }

    return timePhase;
}

// Get capsule canvas position from live telemetry
function capsulePosFromLive(distKm, phase) {
    // Early phases: show orbiting Earth at appropriate radius
    if (phase && (phase.id === 'prelaunch' || phase.id === 'launch' || phase.id === 'orbit' || phase.id === 'highorbit')) {
        // Map actual distance to a visible orbit radius near Earth
        // Real high orbit goes up to ~70,000 km — scale to pixel radius
        const minR = EARTH.r + 6;
        const maxR = EARTH.r + 22;
        const orbitPct = Math.min(distKm / 75000, 1);
        const r = lerp(minR, maxR, orbitPct);
        // Animate rotation using current time
        const now = Date.now();
        const a = (now / 8000) % (Math.PI * 2);  // one rotation per ~50s
        return { x: EARTH.x + Math.cos(a) * r, y: EARTH.y + Math.sin(a) * (r * 0.7) };
    }
    // Outbound / return: map distance to trajectory curve
    const pct = Math.min(distKm / 384400, 1);
    if (phase && (phase.id === 'return' || phase.id === 'reentry')) {
        return trajPoint(0.56 + (1 - pct) * 0.44); // return leg
    }
    return trajPoint(pct * 0.44); // outbound leg
}

// ── Main render ───────────────────────────────────────────
function render(t) {
    const isLive = mode === 'live' && liveAvailable && liveData;

    // Background
    ctx.fillStyle=C.space;
    ctx.fillRect(0,0,W,H);

    drawStars(t);
    drawTrajectory(missionH);
    drawEarth();
    drawMoon();
    drawTrail();

    let pos;
    if (isLive) {
        pos = capsulePosFromLive(liveData.distanceKm, livePhase);
    } else {
        pos = capsulePos(missionH);
    }
    drawCapsule(pos, missionH);
    drawLabels();

    if (isLive) {
        drawDistanceLine({dist: liveData.distanceKm, live: true});
    } else {
        drawDistanceLine(missionH);
    }

    // Live indicator on canvas
    if (mode === 'live') {
        const realH = getRealMET();
        const isLiveData = liveAvailable;
        const isPreLaunch = realH < 0;
        const isTelemetryGap = realH >= 0 && !isLiveData;

        // Status dot + label (top-right)
        ctx.fillStyle = isLiveData ? '#00FF41' : (isTelemetryGap ? '#FFAB00' : '#FF6D00');
        ctx.fillRect(W-8, 6, 5, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '5px "Press Start 2P", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(isLiveData ? 'LIVE' : (isTelemetryGap ? 'SIMULATED' : 'NO DATA'), W-12, 10);

        if (isPreLaunch) {
            // Big countdown
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FFD600';
            ctx.font = '12px "Press Start 2P", monospace';
            ctx.fillText('T-' + formatCountdown(-realH), W/2, H/2 - 20);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '6px "Press Start 2P", monospace';
            ctx.fillText('LAUNCH: ' + launchTimeStr, W/2, H/2 - 6);
        } else if (isTelemetryGap) {
            // Telemetry pending banner (top-left)
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(255,171,0,0.6)';
            ctx.font = '5px "Press Start 2P", monospace';
            ctx.fillText('\u26A0 TELEMETRY PENDING', 6, 10);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillText('POSITION IS SIMULATED', 6, 20);
        }
    }
}

// ── UI Updates ────────────────────────────────────────────
function formatMET(h) {
    const neg=h<0, total=Math.abs(h*3600);
    const d=Math.floor(total/86400);
    const hr=Math.floor((total%86400)/3600);
    const mn=Math.floor((total%3600)/60);
    const sc=Math.floor(total%60);
    const pad=(n,w=2)=>String(n).padStart(w,'0');
    const pre=neg?'T-':'T+';
    return d>0 ? `${pre}${d}d ${pad(hr)}:${pad(mn)}:${pad(sc)}`
               : `${pre}${pad(hr)}:${pad(mn)}:${pad(sc)}`;
}

// Real MET based on actual launch time
function getRealMET() {
    const now = Date.now();
    const diffMs = now - LAUNCH_UTC;
    return diffMs / 3600000; // hours
}

// Format a countdown from hours to a readable string
function formatCountdown(hours) {
    const total = Math.abs(hours * 3600);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    const pad = (n) => String(n).padStart(2, '0');
    if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
    return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

function updateNextPhase(activePhase, currentH) {
    const idx = PHASES.indexOf(activePhase);
    if (idx < 0 || idx >= PHASES.length - 1) {
        // Last phase or unknown — no next phase
        $next.textContent = activePhase === PHASES[PHASES.length - 1] ? 'MISSION COMPLETE' : '\u2014';
        return;
    }
    const nextPhase = PHASES[idx + 1];
    const hoursLeft = nextPhase.startH - currentH;
    if (hoursLeft <= 0) {
        $next.textContent = nextPhase.name + ' \u2014 NOW';
    } else {
        $next.textContent = nextPhase.name + ' in ' + formatCountdown(hoursLeft);
    }
}

function updateExtraStats(distKm, activePhase, metH) {
    // Moon distance
    if (moonDistKm !== null) {
        $moon.textContent = numFmt.format(moonDistKm) + ' km';
    } else {
        // Estimate: Moon is ~384,400 km from Earth
        const estMoonDist = Math.max(0, Math.round(384400 - distKm));
        $moon.textContent = numFmt.format(estMoonDist) + ' km (est.)';
    }
    // Journey progress
    $progress.textContent = getJourneyProgress(distKm, activePhase) + '%';
    // Crew status
    const crew = getCrewStatus(metH);
    if (crew.status === 'AWAKE') {
        $crew.textContent = '\u2600 AWAKE \u2014 ' + crew.activity;
    } else if (crew.status === 'SLEEP') {
        $crew.textContent = '\uD83C\uDF19 SLEEP \u2014 ' + crew.activity;
    } else {
        $crew.textContent = crew.status;
    }
}

function updateUI() {
    const isLive = mode === 'live' && liveAvailable && liveData;

    let activePhase;
    let isCompleted;

    if (isLive) {
        activePhase = inferPhaseFromLive(liveData.distanceKm, liveData.speedKmH);
        livePhase = activePhase;
        $phase.textContent = activePhase.name;
        $dist.textContent = numFmt.format(liveData.distanceKm) + ' km';
        $speed.textContent = numFmt.format(liveData.speedKmH) + ' km/h';
        $met.textContent = formatMET(getRealMET());
        $badge.textContent = activePhase.name;
        $desc.textContent = activePhase.desc;
        updateNextPhase(activePhase, getRealMET());
        updateExtraStats(liveData.distanceKm, activePhase, getRealMET());
        isCompleted = (idx) => PHASES.indexOf(activePhase) > idx;
    } else if (mode === 'live') {
        // Live mode but no telemetry yet — use sim model synced to real clock
        const realH = getRealMET();
        activePhase = getPhase(realH);
        $phase.textContent = activePhase.name;
        $met.textContent = formatMET(realH);
        $badge.textContent = activePhase.name;

        if (realH < 0) {
            // Pre-launch: countdown
            $dist.textContent = '0 km';
            $speed.textContent = '0 km/h';
            $desc.textContent = `LAUNCH SCHEDULED: ${launchTimeStr} \u2014 ${formatCountdown(-realH)} remaining`;
        } else {
            // Post-launch but no telemetry yet — show simulated values
            $dist.textContent = numFmt.format(Math.round(getDistance(realH))) + ' km (est.)';
            $speed.textContent = numFmt.format(Math.round(getSpeed(realH))) + ' km/h (est.)';
            $desc.textContent = `\u26A0 TELEMETRY PENDING \u2014 simulated position shown. Live data begins after ICPS separation (~T+3h24m).`;
        }        updateNextPhase(activePhase, realH);        updateExtraStats(Math.round(getDistance(realH)), activePhase, realH);        isCompleted = (idx) => PHASES[idx].endH <= realH && PHASES[idx] !== activePhase;
    } else {
        activePhase = getPhase(missionH);
        $phase.textContent = activePhase.name;
        $dist.textContent = numFmt.format(Math.round(getDistance(missionH))) + ' km';
        $speed.textContent = numFmt.format(Math.round(getSpeed(missionH))) + ' km/h';
        $met.textContent = formatMET(missionH);
        $badge.textContent = activePhase.name;
        $desc.textContent = activePhase.desc;
        updateNextPhase(activePhase, missionH);
        updateExtraStats(Math.round(getDistance(missionH)), activePhase, missionH);
        isCompleted = (idx) => PHASES[idx].endH <= missionH && PHASES[idx] !== activePhase;
    }

    // Update all timeline views (bar segments, labels, vertical list)
    const selectors = ['.tl-seg', '.tl-label', '.tl-row'];
    selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            const idx = +el.dataset.idx;
            el.classList.toggle('active', PHASES[idx] === activePhase);
            el.classList.toggle('completed', isCompleted(idx));
        });
    });
}

// ── Timeline bar ──────────────────────────────────────────
const $labels = document.getElementById('timeline-labels');
const $list = document.getElementById('timeline-list');

// Short names that fit in small segments
const SHORT_NAMES = {
    'PRE-LAUNCH': 'PRE',
    'LAUNCH & ASCENT': 'LAUNCH',
    'EARTH ORBIT': 'ORBIT',
    'HIGH EARTH ORBIT': 'HI-ORB',
    'TLI BURN': 'TLI',
    'OUTBOUND COAST': 'OUTBOUND',
    'LUNAR FLYBY': 'FLYBY',
    'RETURN COAST': 'RETURN',
    'RE-ENTRY & SPLASHDOWN': 'SPLASH'
};

function buildTimeline() {
    $bar.innerHTML='';
    $labels.innerHTML='';
    $list.innerHTML='';
    PHASES.forEach((p,i)=>{
        // Bar segment (color block, no text)
        const seg=document.createElement('div');
        seg.className='tl-seg';
        seg.style.width=p.pct+'%';
        seg.style.background=p.color;
        seg.dataset.idx=i;
        seg.title=p.name;
        $bar.appendChild(seg);

        // Label below bar (desktop)
        const lbl=document.createElement('div');
        lbl.className='tl-label';
        lbl.style.width=p.pct+'%';
        lbl.dataset.idx=i;
        lbl.textContent=SHORT_NAMES[p.name]||p.name;
        lbl.title=p.name;
        $labels.appendChild(lbl);

        // Vertical list row (mobile)
        const row=document.createElement('div');
        row.className='tl-row';
        row.dataset.idx=i;
        const pip=document.createElement('span');
        pip.className='tl-pip';
        pip.style.background=p.color;
        row.appendChild(pip);
        const txt=document.createElement('span');
        txt.textContent=p.name;
        row.appendChild(txt);
        $list.appendChild(row);
    });
}

// ── Simulation loop ───────────────────────────────────────
function loop(ts) {
    if (!lastTime) lastTime=ts;
    const dt=(ts-lastTime)/1000; // seconds
    lastTime=ts;
    animTime=ts/1000;

    if (mode === 'live') {
        // In live mode, sync simulation clock to real MET
        missionH = getRealMET();
        // Clamp to mission window
        missionH = Math.max(PHASES[0].startH, Math.min(PHASES[PHASES.length-1].endH, missionH));
    } else if (playing) {
        missionH += (dt/3600)*speed;
        if (missionH>PHASES[PHASES.length-1].endH) {
            missionH=PHASES[PHASES.length-1].endH;
            playing=false;
        }
    }

    // Update trail
    trailTick++;
    if (trailTick%3===0) {
        const isLive = mode === 'live' && liveAvailable && liveData;
        const pos = isLive
            ? capsulePosFromLive(liveData.distanceKm, livePhase)
            : capsulePos(missionH);
        trail.push({x:pos.x, y:pos.y});
        if (trail.length>TRAIL_LEN) trail.shift();
    }

    render(animTime);
    updateUI();
    requestAnimationFrame(loop);
}

// ── Controls ──────────────────────────────────────────────
document.getElementById('btn-play').addEventListener('click', ()=>{
    if (missionH>=PHASES[PHASES.length-1].endH) {
        missionH=PHASES[0].startH;
        trail.length=0;
    }
    playing=true;
});

document.getElementById('btn-pause').addEventListener('click', ()=>{
    playing=false;
});

document.getElementById('btn-reset').addEventListener('click', ()=>{
    missionH=PHASES[0].startH;
    playing=false;
    trail.length=0;
    lastTime=null;
    updateUI();
});

document.querySelectorAll('.spd').forEach(btn=>{
    btn.addEventListener('click', ()=>{
        speed=+btn.dataset.speed;
        document.querySelectorAll('.spd').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// ── Mode toggle ───────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

// ── Init ──────────────────────────────────────────────────
buildTimeline();
setMode('live'); // default to live mode
requestAnimationFrame(loop);

})();
