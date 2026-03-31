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
// Launch: 2026-Apr-01 22:24 UTC
const LAUNCH_UTC = Date.UTC(2026, 3, 1, 22, 24, 0); // Apr 1 2026 22:24 UTC

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
        desc:'Extended Earth orbit — cubesat deployments, Orion separation burn, systems checkout before TLI burn on Day 2',
        startH:5, endH:47.5,
        distS:2223, distE:2223, spdS:28000, spdE:28000,
        trajS:0, trajE:0, color:'#3F51B5', pct:8
    },
    {
        id:'tli', name:'TLI BURN',
        desc:'Trans-Lunar Injection — ICPS upper stage fires for ~8 minutes at T+47h32m, sending Orion to the Moon',
        startH:47.5, endH:48,
        distS:2223, distE:5000, spdS:28000, spdE:39400,
        trajS:0, trajE:0.02, color:'#FF9800', pct:4
    },
    {
        id:'outbound', name:'OUTBOUND COAST',
        desc:'Coasting to the Moon — trajectory correction burns on days 3, 4 & 5. Enters lunar sphere of influence at T+103h',
        startH:48, endH:121.4,
        distS:5000, distE:370000, spdS:39400, spdE:4000,
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
let mode = 'sim';          // 'sim' or 'live'
let liveData = null;       // latest Horizons response
let livePollTimer = null;
let liveAvailable = false; // true once we get a valid response
const POLL_INTERVAL = 15000; // 15 seconds
const HORIZONS_ENDPOINT = '/api/horizons?id=-1024';

// ── DOM refs ──────────────────────────────────────────────
const $phase   = document.getElementById('s-phase');
const $dist    = document.getElementById('s-dist');
const $speed   = document.getElementById('s-speed');
const $met     = document.getElementById('s-met');
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
        const res = await fetch(HORIZONS_ENDPOINT);
        const data = await res.json();
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
}

function startLivePolling() {
    pollHorizons(); // immediate first poll
    livePollTimer = setInterval(pollHorizons, POLL_INTERVAL);
}

function stopLivePolling() {
    if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; }
}

function setMode(m) {
    mode = m;
    document.querySelectorAll('.mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === m);
    });

    if (m === 'live') {
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
    if (mode === 'live' && liveAvailable) {
        $srcDot.className = 'dot dot-live';
        $srcLabel.textContent = 'LIVE — JPL HORIZONS';
        $footNote.textContent = 'Live telemetry from JPL Horizons API';
    } else if (mode === 'live' && !liveAvailable) {
        $srcDot.className = 'dot dot-waiting';
        $srcLabel.textContent = 'LIVE — WAITING FOR DATA (falling back to sim)';
        $footNote.textContent = 'Horizons data not yet available — showing simulated trajectory';
    } else {
        $srcDot.className = 'dot dot-sim';
        $srcLabel.textContent = 'SIMULATED DATA';
        $footNote.textContent = 'Simulated trajectory based on NASA Artemis II flight plan';
    }
}

// Infer mission phase from live distance + speed
function inferPhaseFromLive(distKm, spdKmH) {
    if (distKm < 200 && spdKmH < 100) return PHASES[0];  // prelaunch
    if (distKm < 200 && spdKmH > 100) return PHASES[1];  // launch
    if (distKm < 300 && spdKmH > 25000) return PHASES[2]; // orbit
    if (distKm < 5000 && spdKmH > 30000) return PHASES[3]; // TLI
    if (distKm < 350000 && distKm > 5000) {
        // outbound or return — check speed trend
        return spdKmH < 15000 ? PHASES[4] : PHASES[6]; // outbound decelerating vs return accelerating
    }
    if (distKm >= 350000) return PHASES[5]; // flyby
    if (distKm < 5000 && spdKmH > 30000) return PHASES[7]; // re-entry
    return PHASES[4]; // default outbound
}

// Get capsule canvas position from live distance
function capsulePosFromDist(distKm) {
    const pct = Math.min(distKm / 384400, 1);
    return trajPoint(pct * 0.44); // map to outbound arc as approximation
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
        pos = capsulePosFromDist(liveData.distanceKm);
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
        ctx.fillStyle = liveAvailable ? '#00FF41' : '#FF6D00';
        ctx.fillRect(W-8, 6, 5, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '5px "Press Start 2P", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(liveAvailable ? 'LIVE' : 'NO DATA', W-12, 10);
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

function updateUI() {
    const isLive = mode === 'live' && liveAvailable && liveData;

    let activePhase;
    let isCompleted;

    if (isLive) {
        activePhase = inferPhaseFromLive(liveData.distanceKm, liveData.speedKmH);
        $phase.textContent = activePhase.name;
        $dist.textContent = numFmt.format(liveData.distanceKm) + ' km';
        $speed.textContent = numFmt.format(liveData.speedKmH) + ' km/h';
        $met.textContent = formatMET(getRealMET());
        $badge.textContent = activePhase.name;
        $desc.textContent = activePhase.desc;
        isCompleted = (idx) => PHASES.indexOf(activePhase) > idx;
    } else {
        activePhase = getPhase(missionH);
        $phase.textContent = activePhase.name;
        $dist.textContent = numFmt.format(Math.round(getDistance(missionH))) + ' km';
        $speed.textContent = numFmt.format(Math.round(getSpeed(missionH))) + ' km/h';
        $met.textContent = formatMET(missionH);
        $badge.textContent = activePhase.name;
        $desc.textContent = activePhase.desc;
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
        const pos=capsulePos(missionH);
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
updateSourceIndicator();
updateUI();
requestAnimationFrame(loop);

})();
