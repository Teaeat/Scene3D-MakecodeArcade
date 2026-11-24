/**
 * A character-style physics body: an upright capsule (approximated with 2-3 spheres)
 * that falls with gravity and slides against every solid Mesh3D triangle.
 * (x, y, z) is the position of the FEET.
 */
class Body3D {
    x = 0;
    y = 0;
    z = 0;
    vx = 0;
    vy = 0;
    vz = 0;
    radius: number;
    height: number;
    /** true when standing on something walkable */
    grounded = false;
    /** cos of the steepest walkable slope (0.7 = about 45 degrees) */
    slopeLimit = 0.7;
    /** this mesh is moved to the body each frame */
    model: Mesh3D = null;
    /** set to false to disable gravity for this body */
    useGravity = true;

    constructor(radius: number, height: number) {
        this.radius = radius;
        this.height = Math.max(height, radius * 2);
        Scene3D.registerBody(this);
    }

    setPosition(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.vy = 0;
        if (this.model) this.model.setPosition(x, y, z);
    }

    setModel(m: Mesh3D) {
        this.model = m;
        if (m) m.setPosition(this.x, this.y, this.z);
    }

    /** Set horizontal velocity relative to a heading (degrees).
     *  forward / strafe are -1..1 (e.g. from the d-pad); speed in units per second. */
    move(forward: number, strafe: number, speed: number, heading: number) {
        const len = Math.sqrt(forward * forward + strafe * strafe);
        if (len > 1) {
            forward /= len;
            strafe /= len;
        }
        const s = Math.sin(heading * DEG2RAD);
        const c = Math.cos(heading * DEG2RAD);
        this.vx = (forward * s + strafe * c) * speed;
        this.vz = (forward * c - strafe * s) * speed;
    }

    /** Jump if standing on the ground */
    jump(speed: number) {
        if (this.grounded) {
            this.vy = speed;
            this.grounded = false;
        }
    }

    /** Horizontal speed */
    speed(): number {
        return Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    }

    /** Smoothly turn the model towards where the body is moving. rate 0..1 */
    faceVelocity(rate: number) {
        if (!this.model) return;
        if (this.vx * this.vx + this.vz * this.vz < 0.04) return;
        const target = Math.atan2(this.vx, this.vz) / DEG2RAD;
        let diff = target - this.model.yaw;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        this.model.yaw += diff * Math.max(0, Math.min(1, rate));
    }

    destroy() {
        Scene3D.unregisterBody(this);
    }
}

/** Collision internals */
namespace Collide {
    export let gravity = 25;
    export let maxFall = 60;

    let candMesh: Mesh3D[] = [];
    let candTri: number[] = [];
    let candN = 0;
    let queryId = 0;
    let fill: number[] = [];
    let cpx = 0;
    let cpy = 0;
    let cpz = 0;

    /** Closest point on triangle abc to point p. Result in cpx,cpy,cpz. */
    function closestPointTri(px: number, py: number, pz: number,
        ax: number, ay: number, az: number,
        bx: number, by: number, bz: number,
        cx: number, cy: number, cz: number) {
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;
        const apx = px - ax, apy = py - ay, apz = pz - az;
        const d1 = abx * apx + aby * apy + abz * apz;
        const d2 = acx * apx + acy * apy + acz * apz;
        if (d1 <= 0 && d2 <= 0) { cpx = ax; cpy = ay; cpz = az; return; }
        const bpx = px - bx, bpy = py - by, bpz = pz - bz;
        const d3 = abx * bpx + aby * bpy + abz * bpz;
        const d4 = acx * bpx + acy * bpy + acz * bpz;
        if (d3 >= 0 && d4 <= d3) { cpx = bx; cpy = by; cpz = bz; return; }
        const vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) {
            const v = d1 / (d1 - d3);
            cpx = ax + abx * v; cpy = ay + aby * v; cpz = az + abz * v;
            return;
        }
        const cppx = px - cx, cppy = py - cy, cppz = pz - cz;
        const d5 = abx * cppx + aby * cppy + abz * cppz;
        const d6 = acx * cppx + acy * cppy + acz * cppz;
        if (d6 >= 0 && d5 <= d6) { cpx = cx; cpy = cy; cpz = cz; return; }
        const vb = d5 * d2 - d1 * d6;
        if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6);
            cpx = ax + acx * w; cpy = ay + acy * w; cpz = az + acz * w;
            return;
        }
        const va = d3 * d6 - d5 * d4;
        if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
            const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
            cpx = bx + (cx - bx) * w; cpy = by + (cy - by) * w; cpz = bz + (cz - bz) * w;
            return;
        }
        const denom = 1 / (va + vb + vc);
        const v2 = vb * denom;
        const w2 = vc * denom;
        cpx = ax + abx * v2 + acx * w2;
        cpy = ay + aby * v2 + acy * w2;
        cpz = az + abz * v2 + acz * w2;
    }

    function addCandidate(m: Mesh3D, t: number) {
        if (candN < candTri.length) {
            candMesh[candN] = m;
            candTri[candN] = t;
        } else {
            candMesh.push(m);
            candTri.push(t);
        }
        candN++;
    }

    /** Uniform XZ grid over a solid mesh so big levels do not test every triangle. */
    function buildGrid(m: Mesh3D) {
        m.gridVersion = m.version;
        const w = m.wv, tris = m.tris, nt = m.nt;
        let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, ext = 0;
        for (let t = 0; t < nt; t++) {
            let tminx = 1e9, tmaxx = -1e9, tminz = 1e9, tmaxz = -1e9;
            for (let k = 0; k < 3; k++) {
                const i = tris[t * 3 + k] * 3;
                const x = w[i], z = w[i + 2];
                if (x < tminx) tminx = x;
                if (x > tmaxx) tmaxx = x;
                if (z < tminz) tminz = z;
                if (z > tmaxz) tmaxz = z;
            }
            if (tminx < minx) minx = tminx;
            if (tmaxx > maxx) maxx = tmaxx;
            if (tminz < minz) minz = tminz;
            if (tmaxz > maxz) maxz = tmaxz;
            ext += Math.max(tmaxx - tminx, tmaxz - tminz);
        }
        let cs = Math.max(0.5, (ext / nt) * 1.5);
        cs = Math.max(cs, Math.max((maxx - minx) / 48, (maxz - minz) / 48));
        m.gridCell = cs;
        m.gx0 = minx;
        m.gz0 = minz;
        m.gnx = Math.floor((maxx - minx) / cs) + 1;
        m.gnz = Math.floor((maxz - minz) / cs) + 1;
        const cells = m.gnx * m.gnz;
        const start = m.cellStart;
        while (start.length < cells + 1) start.push(0);
        for (let i = 0; i <= cells; i++) start[i] = 0;
        // pass 1: count
        for (let pass = 0; pass < 2; pass++) {
            for (let t = 0; t < nt; t++) {
                let tminx = 1e9, tmaxx = -1e9, tminz = 1e9, tmaxz = -1e9;
                for (let k = 0; k < 3; k++) {
                    const i = tris[t * 3 + k] * 3;
                    const x = w[i], z = w[i + 2];
                    if (x < tminx) tminx = x;
                    if (x > tmaxx) tmaxx = x;
                    if (z < tminz) tminz = z;
                    if (z > tmaxz) tmaxz = z;
                }
                const cx0 = Math.floor((tminx - minx) / cs), cx1 = Math.floor((tmaxx - minx) / cs);
                const cz0 = Math.floor((tminz - minz) / cs), cz1 = Math.floor((tmaxz - minz) / cs);
                for (let cz = cz0; cz <= cz1; cz++) {
                    for (let cx = cx0; cx <= cx1; cx++) {
                        const c = cz * m.gnx + cx;
                        if (pass == 0) {
                            start[c + 1]++;
                        } else {
                            m.cellItems[start[c] + fill[c]] = t;
                            fill[c]++;
                        }
                    }
                }
            }
            if (pass == 0) {
                for (let i = 0; i < cells; i++) start[i + 1] += start[i];
                const total = start[cells];
                while (m.cellItems.length < total) m.cellItems.push(0);
                fill = [];
                for (let i = 0; i < cells; i++) fill.push(0);
            }
        }
        while (m.triStamp.length < nt) m.triStamp.push(-1);
        for (let i = 0; i < nt; i++) m.triStamp[i] = -1;
    }

    function testTri(m: Mesh3D, t: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
        const w = m.wv, tr = m.tris;
        const a = tr[t * 3] * 3, b = tr[t * 3 + 1] * 3, c = tr[t * 3 + 2] * 3;
        if (w[a] < x0 && w[b] < x0 && w[c] < x0) return;
        if (w[a] > x1 && w[b] > x1 && w[c] > x1) return;
        if (w[a + 1] < y0 && w[b + 1] < y0 && w[c + 1] < y0) return;
        if (w[a + 1] > y1 && w[b + 1] > y1 && w[c + 1] > y1) return;
        if (w[a + 2] < z0 && w[b + 2] < z0 && w[c + 2] < z0) return;
        if (w[a + 2] > z1 && w[b + 2] > z1 && w[c + 2] > z1) return;
        addCandidate(m, t);
    }

    function gatherMesh(m: Mesh3D, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
        // bounding sphere vs box
        const cx = Math.max(x0, Math.min(m.wcx, x1)) - m.wcx;
        const cy = Math.max(y0, Math.min(m.wcy, y1)) - m.wcy;
        const cz = Math.max(z0, Math.min(m.wcz, z1)) - m.wcz;
        if (cx * cx + cy * cy + cz * cz > m.wr * m.wr) return;
        m.ensureWorld();
        if (m.nt <= 48) {
            for (let t = 0; t < m.nt; t++) testTri(m, t, x0, y0, z0, x1, y1, z1);
            return;
        }
        if (m.gridVersion != m.version) buildGrid(m);
        const cs = m.gridCell;
        let ix0 = Math.floor((x0 - m.gx0) / cs), ix1 = Math.floor((x1 - m.gx0) / cs);
        let iz0 = Math.floor((z0 - m.gz0) / cs), iz1 = Math.floor((z1 - m.gz0) / cs);
        if (ix0 < 0) ix0 = 0;
        if (iz0 < 0) iz0 = 0;
        if (ix1 >= m.gnx) ix1 = m.gnx - 1;
        if (iz1 >= m.gnz) iz1 = m.gnz - 1;
        queryId++;
        for (let iz = iz0; iz <= iz1; iz++) {
            for (let ix = ix0; ix <= ix1; ix++) {
                const c = iz * m.gnx + ix;
                const e = m.cellStart[c + 1];
                for (let k = m.cellStart[c]; k < e; k++) {
                    const t = m.cellItems[k];
                    if (m.triStamp[t] == queryId) continue;
                    m.triStamp[t] = queryId;
                    testTri(m, t, x0, y0, z0, x1, y1, z1);
                }
            }
        }
    }

    function gather(b: Body3D, meshes: Mesh3D[], stamp: number) {
        candN = 0;
        const r = b.radius + 0.05;
        const x0 = b.x - r, x1 = b.x + r;
        const y0 = b.y - 0.05, y1 = b.y + b.height + 0.05;
        const z0 = b.z - r, z1 = b.z + r;
        for (let i = 0; i < meshes.length; i++) {
            const m = meshes[i];
            if (!m.solid || m.nt == 0) continue;
            m.updateWorld(stamp);
            gatherMesh(m, x0, y0, z0, x1, y1, z1);
        }
    }

    /** Pushes the body out of the DEEPEST overlapping triangle for one sphere. Resolving only
     *  the deepest contact avoids "ghost" edge contacts on flat surfaces made of many triangles.
     *  Returns true if anything moved. */
    function resolveSphere(b: Body3D, off: number): boolean {
        const r = b.radius;
        let best = r * r;
        let bc = -1;
        let bx = 0, by = 0, bz = 0;
        const px = b.x, py = b.y + off, pz = b.z;
        for (let c = 0; c < candN; c++) {
            const m = candMesh[c];
            const t = candTri[c];
            const w = m.wv;
            const a = m.tris[t * 3] * 3, bb = m.tris[t * 3 + 1] * 3, cc = m.tris[t * 3 + 2] * 3;
            closestPointTri(px, py, pz, w[a], w[a + 1], w[a + 2], w[bb], w[bb + 1], w[bb + 2], w[cc], w[cc + 1], w[cc + 2]);
            const dx = px - cpx, dy = py - cpy, dz = pz - cpz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < best) {
                best = d2;
                bc = c;
                bx = dx; by = dy; bz = dz;
            }
        }
        if (bc < 0) return false;
        const d = Math.sqrt(best);
        let nx = 0, ny = 1, nz = 0;
        if (d > 1e-6) {
            nx = bx / d; ny = by / d; nz = bz / d;
        } else {
            // centre exactly on the surface: use the triangle normal
            const m = candMesh[bc];
            const t = candTri[bc];
            const w = m.wv;
            const a = m.tris[t * 3] * 3, bb = m.tris[t * 3 + 1] * 3, cc = m.tris[t * 3 + 2] * 3;
            const ux = w[bb] - w[a], uy = w[bb + 1] - w[a + 1], uz = w[bb + 2] - w[a + 2];
            const vx = w[cc] - w[a], vy = w[cc + 1] - w[a + 1], vz = w[cc + 2] - w[a + 2];
            nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
            const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (l < 1e-9) return false;
            nx /= l; ny /= l; nz /= l;
        }
        const pen = r - d;
        if (ny > b.slopeLimit) {
            // walkable: push straight up so slopes do not make you creep downhill
            let up = pen / ny;
            if (up > r) up = r;
            b.y += up;
            b.grounded = true;
            if (b.vy < 0) b.vy = 0;
        } else {
            b.x += nx * pen;
            b.y += ny * pen;
            b.z += nz * pen;
            const vn = b.vx * nx + b.vy * ny + b.vz * nz;
            if (vn < 0) {
                b.vx -= vn * nx;
                b.vy -= vn * ny;
                b.vz -= vn * nz;
            }
        }
        return true;
    }

    function stepBody(b: Body3D, meshes: Mesh3D[], dt: number, stamp: number) {
        if (b.useGravity) {
            b.vy -= gravity * dt;
            if (b.vy < -maxFall) b.vy = -maxFall;
        }
        const fastest = Math.max(Math.abs(b.vx), Math.max(Math.abs(b.vy), Math.abs(b.vz))) * dt;
        let steps = Math.ceil(fastest / (b.radius * 0.8));
        if (steps < 1) steps = 1;
        if (steps > 6) steps = 6;
        const h = dt / steps;
        const lo = b.radius;
        const hi = b.height - b.radius;
        b.grounded = false;
        for (let s = 0; s < steps; s++) {
            b.x += b.vx * h;
            b.y += b.vy * h;
            b.z += b.vz * h;
            gather(b, meshes, stamp);
            if (candN == 0) continue;
            for (let iter = 0; iter < 5; iter++) {
                let moved = resolveSphere(b, lo);
                if (hi - lo > 0.01) {
                    if (hi - lo > b.radius * 1.2) moved = resolveSphere(b, (lo + hi) / 2) || moved;
                    moved = resolveSphere(b, hi) || moved;
                }
                if (!moved) break;
            }
        }
        if (b.model) b.model.setPosition(b.x, b.y, b.z);
    }

    export function stepAll(bodies: Body3D[], meshes: Mesh3D[], dt: number, stamp: number) {
        for (let i = 0; i < bodies.length; i++) stepBody(bodies[i], meshes, dt, stamp);
    }
}
