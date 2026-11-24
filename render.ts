/**
 * Software triangle renderer: camera transform -> near-plane clip -> back-face cull ->
 * flat shade -> depth-bucket sort (painter's algorithm) -> scanline fill.
 */
namespace Render3D {
    const NB = 1024; // depth buckets
    export let maxTriangles = 1000;
    export let skyColor = 9;
    export let fogStart = 0; // 0 = no fog
    export let lightX = 0.35;
    export let lightY = 0.8;
    export let lightZ = -0.45;

    // palette index * 3 + level (0 = lit, 1 = mid, 2 = dark)
    export const shade: number[] = [
        0, 0, 0,
        1, 13, 11,
        2, 14, 12,
        3, 2, 14,
        4, 2, 14,
        5, 4, 14,
        6, 8, 12,
        7, 6, 8,
        8, 12, 15,
        9, 6, 8,
        10, 12, 15,
        11, 12, 15,
        12, 15, 15,
        13, 11, 14,
        14, 12, 15,
        15, 15, 15
    ];

    let pool: number[] = []; // 7 numbers per queued triangle
    let nextT: number[] = [];
    const head: number[] = [];
    let triCount = 0;
    let vx: number[] = [];
    let vy: number[] = [];
    let vz: number[] = [];
    let sw = 160;
    let sh = 120;
    let invFar = 1;
    // clip scratch
    const clx = [0, 0, 0, 0];
    const cly = [0, 0, 0, 0];
    const clz = [0, 0, 0, 0];
    const clsx = [0, 0, 0, 0];
    const clsy = [0, 0, 0, 0];

    export function setLight(x: number, y: number, z: number) {
        const l = Math.sqrt(x * x + y * y + z * z);
        if (l < 1e-6) return;
        lightX = x / l;
        lightY = y / l;
        lightZ = z / l;
    }

    function emit(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, depth: number, color: number) {
        if ((ax < 0 && bx < 0 && cx < 0) || (ax >= sw && bx >= sw && cx >= sw) ||
            (ay < 0 && by < 0 && cy < 0) || (ay >= sh && by >= sh && cy >= sh)) return;
        if (triCount >= maxTriangles) return;
        const o = triCount * 7;
        while (pool.length < o + 7) pool.push(0);
        while (nextT.length <= triCount) nextT.push(0);
        pool[o] = ax; pool[o + 1] = ay;
        pool[o + 2] = bx; pool[o + 3] = by;
        pool[o + 4] = cx; pool[o + 5] = cy;
        pool[o + 6] = color;
        let bi = Math.floor(Math.sqrt(depth * invFar) * (NB - 1));
        if (bi < 0) bi = 0;
        if (bi > NB - 1) bi = NB - 1;
        nextT[triCount] = head[bi];
        head[bi] = triCount;
        triCount++;
    }

    export function draw(target: Image, cam: Camera3D, meshes: Mesh3D[], stamp: number) {
        sw = target.width;
        sh = target.height;
        const hw = sw / 2, hh = sh / 2;
        if (skyColor > 0) target.fill(skyColor);
        if (head.length == 0) for (let i = 0; i < NB; i++) head.push(-1);
        for (let i = 0; i < NB; i++) head[i] = -1;
        triCount = 0;

        cam.updateMatrix();
        const C = cam.m;
        const th = Math.tan((cam.fov * DEG2RAD) / 2);
        const f = hw / th;
        const tv = hh / f;
        const kh = Math.sqrt(1 + th * th);
        const kv = Math.sqrt(1 + tv * tv);
        const near = cam.near, far = cam.far;
        invFar = 1 / far;

        for (let mi = 0; mi < meshes.length; mi++) {
            const m = meshes[mi];
            m.updateWorld(stamp);
            if (!m.shown || m.nt == 0) continue;

            // bounding-sphere frustum cull (camera space centre)
            const ddx = m.wcx - cam.x, ddy = m.wcy - cam.y, ddz = m.wcz - cam.z;
            const tcx = C[0] * ddx + C[3] * ddy + C[6] * ddz;
            const tcy = C[1] * ddx + C[4] * ddy + C[7] * ddz;
            const tcz = C[2] * ddx + C[5] * ddy + C[8] * ddz;
            const wr = m.wr;
            if (tcz + wr < near || tcz - wr > far) continue;
            if (tcx - th * tcz > wr * kh || -tcx - th * tcz > wr * kh) continue;
            if (tcy - tv * tcz > wr * kv || -tcy - tv * tcz > wr * kv) continue;

            // world -> camera matrix for this mesh: A = C^T * R * s, t = C^T * (p - cam)
            const R = m.rot, s = m.ws;
            const a00 = (C[0] * R[0] + C[3] * R[3] + C[6] * R[6]) * s;
            const a01 = (C[0] * R[1] + C[3] * R[4] + C[6] * R[7]) * s;
            const a02 = (C[0] * R[2] + C[3] * R[5] + C[6] * R[8]) * s;
            const a10 = (C[1] * R[0] + C[4] * R[3] + C[7] * R[6]) * s;
            const a11 = (C[1] * R[1] + C[4] * R[4] + C[7] * R[7]) * s;
            const a12 = (C[1] * R[2] + C[4] * R[5] + C[7] * R[8]) * s;
            const a20 = (C[2] * R[0] + C[5] * R[3] + C[8] * R[6]) * s;
            const a21 = (C[2] * R[1] + C[5] * R[4] + C[8] * R[7]) * s;
            const a22 = (C[2] * R[2] + C[5] * R[5] + C[8] * R[8]) * s;
            const ex = m.wpx - cam.x, ey = m.wpy - cam.y, ez = m.wpz - cam.z;
            const t0 = C[0] * ex + C[3] * ey + C[6] * ez;
            const t1 = C[1] * ex + C[4] * ey + C[7] * ez;
            const t2 = C[2] * ex + C[5] * ey + C[8] * ez;

            const nv = m.nv;
            while (vx.length < nv) { vx.push(0); vy.push(0); vz.push(0); }
            const verts = m.verts;
            for (let i = 0; i < nv; i++) {
                const x = verts[i * 3], y = verts[i * 3 + 1], z = verts[i * 3 + 2];
                vx[i] = a00 * x + a01 * y + a02 * z + t0;
                vy[i] = a10 * x + a11 * y + a12 * z + t1;
                vz[i] = a20 * x + a21 * y + a22 * z + t2;
            }

            // light direction in the mesh's local space (R^T * L)
            const llx = R[0] * lightX + R[3] * lightY + R[6] * lightZ;
            const lly = R[1] * lightX + R[4] * lightY + R[7] * lightZ;
            const llz = R[2] * lightX + R[5] * lightY + R[8] * lightZ;

            const tris = m.tris, cols = m.colors, nrm = m.normals;
            const dbl = m.doubleSided, lit = m.lit;
            for (let t = 0; t < m.nt; t++) {
                const i0 = tris[t * 3], i1 = tris[t * 3 + 1], i2 = tris[t * 3 + 2];
                const x0 = vx[i0], y0 = vy[i0], z0 = vz[i0];
                const x1 = vx[i1], y1 = vy[i1], z1 = vz[i1];
                const x2 = vx[i2], y2 = vy[i2], z2 = vz[i2];
                if (z0 < near && z1 < near && z2 < near) continue;
                if (z0 > far && z1 > far && z2 > far) continue;

                // back-face test in camera space
                const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
                const wx = x2 - x0, wy = y2 - y0, wz = z2 - z0;
                const nx = uy * wz - uz * wy;
                const ny = uz * wx - ux * wz;
                const nz = ux * wy - uy * wx;
                let back = false;
                if (nx * x0 + ny * y0 + nz * z0 >= 0) {
                    if (!dbl) continue;
                    back = true;
                }

                let lvl = 0;
                if (lit) {
                    let d = nrm[t * 3] * llx + nrm[t * 3 + 1] * lly + nrm[t * 3 + 2] * llz;
                    if (back) d = -d;
                    lvl = d > 0.35 ? 0 : d > -0.2 ? 1 : 2;
                }
                const depth = (z0 + z1 + z2) / 3;
                if (fogStart > 0 && depth > fogStart) lvl += depth > fogStart * 1.6 ? 2 : 1;
                if (lvl > 2) lvl = 2;
                const col = shade[(cols[t] & 15) * 3 + lvl];
                if (col == 0) continue;

                if (z0 >= near && z1 >= near && z2 >= near) {
                    let k = f / z0;
                    const sx0 = hw + x0 * k, sy0 = hh - y0 * k;
                    k = f / z1;
                    const sx1 = hw + x1 * k, sy1 = hh - y1 * k;
                    k = f / z2;
                    const sx2 = hw + x2 * k, sy2 = hh - y2 * k;
                    emit(sx0, sy0, sx1, sy1, sx2, sy2, depth, col);
                } else {
                    // Sutherland-Hodgman against the near plane -> 3 or 4 points
                    let n = 0;
                    for (let e = 0; e < 3; e++) {
                        const ia = e == 0 ? i0 : e == 1 ? i1 : i2;
                        const ib = e == 0 ? i1 : e == 1 ? i2 : i0;
                        const za = vz[ia], zb = vz[ib];
                        const ina = za >= near, inb = zb >= near;
                        if (ina) {
                            clx[n] = vx[ia]; cly[n] = vy[ia]; clz[n] = za;
                            n++;
                        }
                        if (ina != inb) {
                            const u = (near - za) / (zb - za);
                            clx[n] = vx[ia] + (vx[ib] - vx[ia]) * u;
                            cly[n] = vy[ia] + (vy[ib] - vy[ia]) * u;
                            clz[n] = near;
                            n++;
                        }
                    }
                    if (n < 3) continue;
                    for (let q = 0; q < n; q++) {
                        const k = f / clz[q];
                        clsx[q] = hw + clx[q] * k;
                        clsy[q] = hh - cly[q] * k;
                    }
                    emit(clsx[0], clsy[0], clsx[1], clsy[1], clsx[2], clsy[2], depth, col);
                    if (n == 4) emit(clsx[0], clsy[0], clsx[2], clsy[2], clsx[3], clsy[3], depth, col);
                }
            }
        }

        // far to near
        for (let b = NB - 1; b >= 0; b--) {
            let t = head[b];
            while (t >= 0) {
                const o = t * 7;
                fillTriangle(target, pool[o], pool[o + 1], pool[o + 2], pool[o + 3], pool[o + 4], pool[o + 5], pool[o + 6]);
                t = nextT[t];
            }
        }
    }

    function fillTriangle(img: Image, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: number) {
        let t = 0;
        if (y0 > y1) { t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; }
        if (y1 > y2) { t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; }
        if (y0 > y1) { t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; }
        const d02 = y2 - y0;
        if (d02 < 0.0001) return;
        let ys = Math.ceil(y0 - 0.5);
        let ye = Math.floor(y2 - 0.5);
        if (ys < 0) ys = 0;
        if (ye > sh - 1) ye = sh - 1;
        if (ys > ye) return;
        const d01 = y1 - y0, d12 = y2 - y1;
        const s02 = (x2 - x0) / d02;
        const s01 = d01 > 0.0001 ? (x1 - x0) / d01 : 0;
        const s12 = d12 > 0.0001 ? (x2 - x1) / d12 : 0;
        for (let y = ys; y <= ye; y++) {
            const yy = y + 0.5;
            let xa = x0 + s02 * (yy - y0);
            let xb = yy < y1 ? x0 + s01 * (yy - y0) : x1 + s12 * (yy - y1);
            if (xa > xb) { t = xa; xa = xb; xb = t; }
            let l = Math.round(xa);
            let r = Math.round(xb);
            if (l < 0) l = 0;
            if (r > sw - 1) r = sw - 1;
            if (r >= l) img.fillRect(l, y, r - l + 1, 1, c);
        }
    }
}
