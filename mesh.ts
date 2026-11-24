/**
 * Conventions used everywhere in this extension:
 *   +X = right, +Y = up, +Z = forward (into the screen when yaw = 0).
 *   Angles are in degrees.
 *   yaw   > 0 turns right, pitch > 0 tilts the front up, roll > 0 tips the right side down.
 *   Rotation order is roll, then pitch, then yaw.
 */
const DEG2RAD = Math.PI / 180;

/**
 * A mesh is a bag of triangles with a position, rotation and scale.
 * Meshes can be parented to each other (for animated characters).
 * Triangles are one-sided (back faces are culled) unless doubleSided is true.
 */
class Mesh3D {
    // ---- transform (local, relative to parent if there is one) ----
    x = 0;
    y = 0;
    z = 0;
    yaw = 0;
    pitch = 0;
    roll = 0;
    scale = 1;

    // ---- flags ----
    visible = true;
    /** draw both sides of every triangle */
    doubleSided = false;
    /** apply directional light shading */
    lit = true;
    /** other bodies collide with this mesh */
    solid = false;
    parent: Mesh3D = null;
    /** visible && every parent visible (maintained by updateWorld) */
    shown = true;

    // ---- geometry ----
    verts: number[]; // x,y,z per vertex
    tris: number[]; // 3 vertex indices per triangle
    colors: number[]; // palette colour per triangle
    normals: number[]; // unit local normal per triangle
    nv = 0;
    nt = 0;

    // ---- cached world transform (maintained by updateWorld) ----
    rot: number[]; // 3x3 world rotation, row-major
    wpx = 0;
    wpy = 0;
    wpz = 0;
    ws = 1;
    wcx = 0; // world bounding sphere
    wcy = 0;
    wcz = 0;
    wr = 0;
    version = 1;
    stamp = -1;
    geomDirty = true;
    private lcx = 0; // local bounding sphere
    private lcy = 0;
    private lcz = 0;
    private lr = 0;
    private lx = 0;
    private ly = 0;
    private lz = 0;
    private lyaw = 0;
    private lpitch = 0;
    private lroll = 0;
    private lscale = 0;
    private lpv = -1;
    private local: number[];

    // ---- collision caches (used by Collide) ----
    wv: number[];
    wvVersion = -1;
    gridVersion = -1;
    gridCell = 1;
    gx0 = 0;
    gz0 = 0;
    gnx = 1;
    gnz = 1;
    cellStart: number[];
    cellItems: number[];
    triStamp: number[];

    constructor() {
        this.verts = [];
        this.tris = [];
        this.colors = [];
        this.normals = [];
        this.rot = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        this.local = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        this.wv = [];
        this.cellStart = [];
        this.cellItems = [];
        this.triStamp = [];
        Scene3D.register(this);
    }

    // ------------------------------------------------------------------
    // Transform helpers
    // ------------------------------------------------------------------
    setPosition(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    setRotation(yaw: number, pitch: number, roll: number) {
        this.yaw = yaw;
        this.pitch = pitch;
        this.roll = roll;
    }

    setScale(s: number) {
        this.scale = s;
    }

    setParent(p: Mesh3D) {
        this.parent = p;
    }

    /** Recolour every triangle */
    setColor(color: number) {
        for (let i = 0; i < this.nt; i++) this.colors[i] = color;
    }

    /** Remove from the world */
    destroy() {
        Scene3D.unregister(this);
    }

    // ------------------------------------------------------------------
    // Raw geometry
    // ------------------------------------------------------------------
    /** Add a vertex, returns its index */
    addVertex(x: number, y: number, z: number): number {
        this.verts.push(x);
        this.verts.push(y);
        this.verts.push(z);
        this.geomDirty = true;
        return this.nv++;
    }

    /** Add a triangle between 3 vertex indices. The visible side is the one whose
     *  normal = (v1 - v0) x (v2 - v0) points to. Returns the triangle index (-1 if degenerate). */
    addTriangle(i0: number, i1: number, i2: number, color: number): number {
        return this.pushTri(i0, i1, i2, color, 0, 0, 0);
    }

    /** Add a free-standing triangle from 9 coordinates */
    addTriangleAt(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: number): number {
        const a = this.addVertex(x0, y0, z0);
        const b = this.addVertex(x1, y1, z1);
        const c = this.addVertex(x2, y2, z2);
        return this.pushTri(a, b, c, color, 0, 0, 0);
    }

    /** Adds a triangle and flips its winding if needed so that it faces (dx,dy,dz). */
    pushTri(i0: number, i1: number, i2: number, color: number, dx: number, dy: number, dz: number): number {
        const v = this.verts;
        const a = i0 * 3;
        const b = i1 * 3;
        const c = i2 * 3;
        const ux = v[b] - v[a];
        const uy = v[b + 1] - v[a + 1];
        const uz = v[b + 2] - v[a + 2];
        const wx = v[c] - v[a];
        const wy = v[c + 1] - v[a + 1];
        const wz = v[c + 2] - v[a + 2];
        let nx = uy * wz - uz * wy;
        let ny = uz * wx - ux * wz;
        let nz = ux * wy - uy * wx;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 1e-9) return -1;
        if (nx * dx + ny * dy + nz * dz < 0) {
            const t = i1;
            i1 = i2;
            i2 = t;
            nx = -nx;
            ny = -ny;
            nz = -nz;
        }
        this.tris.push(i0);
        this.tris.push(i1);
        this.tris.push(i2);
        this.colors.push(color);
        this.normals.push(nx / len);
        this.normals.push(ny / len);
        this.normals.push(nz / len);
        this.geomDirty = true;
        return this.nt++;
    }

    /** Adds a triangle facing away from the point (cx,cy,cz) - handy for closed solids. */
    addOutward(i0: number, i1: number, i2: number, color: number, cx: number, cy: number, cz: number) {
        const v = this.verts;
        const mx = (v[i0 * 3] + v[i1 * 3] + v[i2 * 3]) / 3 - cx;
        const my = (v[i0 * 3 + 1] + v[i1 * 3 + 1] + v[i2 * 3 + 1]) / 3 - cy;
        const mz = (v[i0 * 3 + 2] + v[i1 * 3 + 2] + v[i2 * 3 + 2]) / 3 - cz;
        this.pushTri(i0, i1, i2, color, mx, my, mz);
    }

    private quadFacing(a: number, b: number, c: number, d: number, color: number, nx: number, ny: number, nz: number) {
        this.pushTri(a, b, c, color, nx, ny, nz);
        this.pushTri(a, c, d, color, nx, ny, nz);
    }

    // ------------------------------------------------------------------
    // Shape builders (all positions are in the mesh's local space)
    // ------------------------------------------------------------------
    /** Axis aligned box centred on (cx,cy,cz). topColor < 0 means "same as color". */
    addBox(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: number, topColor: number = -1) {
        const x0 = cx - w / 2;
        const x1 = cx + w / 2;
        const y0 = cy - h / 2;
        const y1 = cy + h / 2;
        const z0 = cz - d / 2;
        const z1 = cz + d / 2;
        const b = this.nv;
        for (let zi = 0; zi < 2; zi++)
            for (let yi = 0; yi < 2; yi++)
                for (let xi = 0; xi < 2; xi++)
                    this.addVertex(xi ? x1 : x0, yi ? y1 : y0, zi ? z1 : z0);
        const tc = topColor < 0 ? color : topColor;
        this.quadFacing(b + 1, b + 3, b + 7, b + 5, color, 1, 0, 0);
        this.quadFacing(b + 0, b + 2, b + 6, b + 4, color, -1, 0, 0);
        this.quadFacing(b + 2, b + 3, b + 7, b + 6, tc, 0, 1, 0);
        this.quadFacing(b + 0, b + 1, b + 5, b + 4, color, 0, -1, 0);
        this.quadFacing(b + 4, b + 5, b + 7, b + 6, color, 0, 0, 1);
        this.quadFacing(b + 0, b + 1, b + 3, b + 2, color, 0, 0, -1);
    }

    /** A wall (thick slab) between two ground points. baseY is the bottom of the wall.
     *  The wall is built from pieces about 3 units long, which keeps depth sorting accurate. */
    addWall(x1: number, z1: number, x2: number, z2: number, baseY: number, height: number, thickness: number, color: number) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 1e-6) return;
        const ux = dx / len, uz = dz / len; // along the wall
        const nx = -uz, nz = ux; // sideways (unit)
        const hx = (nx * thickness) / 2, hz = (nz * thickness) / 2;
        const n = Math.max(1, Math.ceil(len / 3));
        const top = baseY + height;
        const b = this.nv;
        for (let k = 0; k <= n; k++) {
            const px = x1 + (dx * k) / n, pz = z1 + (dz * k) / n;
            this.addVertex(px + hx, baseY, pz + hz); // 0: +side bottom
            this.addVertex(px + hx, top, pz + hz); //   1: +side top
            this.addVertex(px - hx, baseY, pz - hz); // 2: -side bottom
            this.addVertex(px - hx, top, pz - hz); //   3: -side top
        }
        for (let k = 0; k < n; k++) {
            const p = b + k * 4, q = p + 4;
            this.quadFacing(p, q, q + 1, p + 1, color, nx, 0, nz); // +side
            this.quadFacing(p + 2, q + 2, q + 3, p + 3, color, -nx, 0, -nz); // -side
            this.quadFacing(p + 1, q + 1, q + 3, p + 3, color, 0, 1, 0); // top
            this.quadFacing(p, q, q + 2, p + 2, color, 0, -1, 0); // bottom
        }
        const e = b + n * 4;
        this.quadFacing(b, b + 2, b + 3, b + 1, color, -ux, 0, -uz); // start cap
        this.quadFacing(e, e + 2, e + 3, e + 1, color, ux, 0, uz); // end cap
    }

    /** Square-based pyramid, box-centred on (cx,cy,cz) */
    addPyramid(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: number) {
        const b = this.nv;
        const y0 = cy - h / 2;
        this.addVertex(cx - w / 2, y0, cz - d / 2);
        this.addVertex(cx + w / 2, y0, cz - d / 2);
        this.addVertex(cx + w / 2, y0, cz + d / 2);
        this.addVertex(cx - w / 2, y0, cz + d / 2);
        this.addVertex(cx, cy + h / 2, cz);
        const oy = y0 + h / 4;
        this.addOutward(b, b + 1, b + 2, color, cx, oy, cz);
        this.addOutward(b, b + 2, b + 3, color, cx, oy, cz);
        for (let k = 0; k < 4; k++) this.addOutward(b + k, b + (k + 1) % 4, b + 4, color, cx, oy, cz);
    }

    /** Wedge that rises along +Z (low edge at -Z, high edge at +Z). Centre of its bounding box is (cx,cy,cz). */
    addRamp(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: number) {
        const b = this.nv;
        const x0 = cx - w / 2;
        const x1 = cx + w / 2;
        const y0 = cy - h / 2;
        const z0 = cz - d / 2;
        const z1 = cz + d / 2;
        this.addVertex(x0, y0, z0);
        this.addVertex(x1, y0, z0);
        this.addVertex(x1, y0, z1);
        this.addVertex(x0, y0, z1);
        this.addVertex(x0, y0 + h, z1);
        this.addVertex(x1, y0 + h, z1);
        const oy = y0 + h / 3;
        this.addOutward(b, b + 1, b + 2, color, cx, oy, cz); // bottom
        this.addOutward(b, b + 2, b + 3, color, cx, oy, cz);
        this.addOutward(b + 3, b + 2, b + 5, color, cx, oy, cz); // back
        this.addOutward(b + 3, b + 5, b + 4, color, cx, oy, cz);
        this.addOutward(b, b + 3, b + 4, color, cx, oy, cz); // left
        this.addOutward(b + 1, b + 2, b + 5, color, cx, oy, cz); // right
        this.addOutward(b, b + 1, b + 5, color, cx, oy, cz); // slope
        this.addOutward(b, b + 5, b + 4, color, cx, oy, cz);
    }

    /** Vertical cylinder centred on (cx,cy,cz) */
    addCylinder(cx: number, cy: number, cz: number, radius: number, height: number, sides: number, color: number, topColor: number = -1) {
        if (sides < 3) sides = 3;
        const b = this.nv;
        const y0 = cy - height / 2;
        const y1 = cy + height / 2;
        for (let i = 0; i < sides; i++) {
            const a = (i / sides) * 2 * Math.PI;
            this.addVertex(cx + Math.cos(a) * radius, y0, cz + Math.sin(a) * radius);
        }
        for (let i = 0; i < sides; i++) {
            const a = (i / sides) * 2 * Math.PI;
            this.addVertex(cx + Math.cos(a) * radius, y1, cz + Math.sin(a) * radius);
        }
        const cb = this.addVertex(cx, y0, cz);
        const ct = this.addVertex(cx, y1, cz);
        const tc = topColor < 0 ? color : topColor;
        for (let i = 0; i < sides; i++) {
            const j = (i + 1) % sides;
            this.addOutward(b + i, b + j, b + sides + j, color, cx, cy, cz);
            this.addOutward(b + i, b + sides + j, b + sides + i, color, cx, cy, cz);
            this.addOutward(cb, b + i, b + j, color, cx, cy, cz);
            this.addOutward(ct, b + sides + i, b + sides + j, tc, cx, cy, cz);
        }
    }

    /** Low-poly UV sphere */
    addSphere(cx: number, cy: number, cz: number, radius: number, segments: number, color: number) {
        if (segments < 4) segments = 4;
        const rings = Math.max(2, Math.floor(segments / 2));
        const top = this.addVertex(cx, cy + radius, cz);
        const first = this.nv;
        for (let r = 1; r < rings; r++) {
            const phi = (r / rings) * Math.PI;
            const ry = Math.cos(phi) * radius;
            const rr = Math.sin(phi) * radius;
            for (let s = 0; s < segments; s++) {
                const th = (s / segments) * 2 * Math.PI;
                this.addVertex(cx + Math.cos(th) * rr, cy + ry, cz + Math.sin(th) * rr);
            }
        }
        const bottom = this.addVertex(cx, cy - radius, cz);
        for (let s = 0; s < segments; s++) {
            const s2 = (s + 1) % segments;
            this.addOutward(top, first + s, first + s2, color, cx, cy, cz);
            for (let r = 0; r < rings - 2; r++) {
                const a = first + r * segments + s;
                const b2 = first + r * segments + s2;
                const c = first + (r + 1) * segments + s2;
                const d = first + (r + 1) * segments + s;
                this.addOutward(a, b2, c, color, cx, cy, cz);
                this.addOutward(a, c, d, color, cx, cy, cz);
            }
            const l = first + (rings - 2) * segments;
            this.addOutward(bottom, l + s, l + s2, color, cx, cy, cz);
        }
    }

    /** Flat floor on y = 0 made of tiles in a checker pattern (tiles keep the painter's
     *  algorithm happy, so keep them smallish). Centred on the origin of the mesh. */
    addGround(sizeX: number, sizeZ: number, tile: number, color1: number, color2: number) {
        const nx = Math.max(1, Math.ceil(sizeX / tile));
        const nz = Math.max(1, Math.ceil(sizeZ / tile));
        const b = this.nv;
        for (let j = 0; j <= nz; j++)
            for (let i = 0; i <= nx; i++)
                this.addVertex(-sizeX / 2 + (sizeX * i) / nx, 0, -sizeZ / 2 + (sizeZ * j) / nz);
        const row = nx + 1;
        for (let j = 0; j < nz; j++) {
            for (let i = 0; i < nx; i++) {
                const c = (i + j) % 2 == 0 ? color1 : color2;
                const a = b + j * row + i;
                this.pushTri(a, a + 1, a + row + 1, c, 0, 1, 0);
                this.pushTri(a, a + row + 1, a + row, c, 0, 1, 0);
            }
        }
    }

    // ------------------------------------------------------------------
    // Internals used by the renderer and collision code
    // ------------------------------------------------------------------
    private computeBounds() {
        const v = this.verts;
        if (this.nv == 0) {
            this.lcx = 0; this.lcy = 0; this.lcz = 0; this.lr = 0;
            return;
        }
        let minx = v[0], maxx = v[0], miny = v[1], maxy = v[1], minz = v[2], maxz = v[2];
        for (let i = 1; i < this.nv; i++) {
            const x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
            if (x < minx) minx = x;
            if (x > maxx) maxx = x;
            if (y < miny) miny = y;
            if (y > maxy) maxy = y;
            if (z < minz) minz = z;
            if (z > maxz) maxz = z;
        }
        this.lcx = (minx + maxx) / 2;
        this.lcy = (miny + maxy) / 2;
        this.lcz = (minz + maxz) / 2;
        let r2 = 0;
        for (let i = 0; i < this.nv; i++) {
            const dx = v[i * 3] - this.lcx, dy = v[i * 3 + 1] - this.lcy, dz = v[i * 3 + 2] - this.lcz;
            const d = dx * dx + dy * dy + dz * dz;
            if (d > r2) r2 = d;
        }
        this.lr = Math.sqrt(r2);
    }

    /** Recomputes world rotation / position / bounds when something changed. */
    updateWorld(stamp: number) {
        if (this.stamp == stamp) return;
        this.stamp = stamp;
        let changed = false;
        if (this.geomDirty) {
            this.computeBounds();
            this.geomDirty = false;
            changed = true;
        }
        let pv = 0;
        const p = this.parent;
        if (p) {
            p.updateWorld(stamp);
            pv = p.version;
        }
        this.shown = this.visible && (p ? p.shown : true);
        if (changed || this.x != this.lx || this.y != this.ly || this.z != this.lz ||
            this.yaw != this.lyaw || this.pitch != this.lpitch || this.roll != this.lroll ||
            this.scale != this.lscale || pv != this.lpv) {
            this.lx = this.x; this.ly = this.y; this.lz = this.z;
            this.lyaw = this.yaw; this.lpitch = this.pitch; this.lroll = this.roll;
            this.lscale = this.scale; this.lpv = pv;
            const L = this.local;
            buildRotation(L, this.yaw, this.pitch, this.roll);
            const R = this.rot;
            if (p) {
                const P = p.rot;
                const ps = p.ws;
                for (let r = 0; r < 3; r++)
                    for (let c = 0; c < 3; c++)
                        R[r * 3 + c] = P[r * 3] * L[c] + P[r * 3 + 1] * L[3 + c] + P[r * 3 + 2] * L[6 + c];
                const sx = this.x * ps, sy = this.y * ps, sz = this.z * ps;
                this.wpx = P[0] * sx + P[1] * sy + P[2] * sz + p.wpx;
                this.wpy = P[3] * sx + P[4] * sy + P[5] * sz + p.wpy;
                this.wpz = P[6] * sx + P[7] * sy + P[8] * sz + p.wpz;
                this.ws = ps * this.scale;
            } else {
                for (let i = 0; i < 9; i++) R[i] = L[i];
                this.wpx = this.x;
                this.wpy = this.y;
                this.wpz = this.z;
                this.ws = this.scale;
            }
            const s = this.ws;
            const cx = this.lcx * s, cy = this.lcy * s, cz = this.lcz * s;
            this.wcx = this.wpx + R[0] * cx + R[1] * cy + R[2] * cz;
            this.wcy = this.wpy + R[3] * cx + R[4] * cy + R[5] * cz;
            this.wcz = this.wpz + R[6] * cx + R[7] * cy + R[8] * cz;
            this.wr = this.lr * s;
            this.version++;
        }
    }

    /** World-space copy of the vertices (for collision) */
    ensureWorld() {
        if (this.wvVersion == this.version) return;
        this.wvVersion = this.version;
        const n = this.nv * 3;
        while (this.wv.length < n) this.wv.push(0);
        const R = this.rot, s = this.ws, v = this.verts, w = this.wv;
        for (let i = 0; i < n; i += 3) {
            const x = v[i] * s, y = v[i + 1] * s, z = v[i + 2] * s;
            w[i] = R[0] * x + R[1] * y + R[2] * z + this.wpx;
            w[i + 1] = R[3] * x + R[4] * y + R[5] * z + this.wpy;
            w[i + 2] = R[6] * x + R[7] * y + R[8] * z + this.wpz;
        }
    }
}

/** out = Ry(yaw) * Rx(pitch) * Rz(roll), row-major 3x3 */
function buildRotation(out: number[], yaw: number, pitch: number, roll: number) {
    const cy = Math.cos(yaw * DEG2RAD), sy = Math.sin(yaw * DEG2RAD);
    const cp = Math.cos(pitch * DEG2RAD), sp = Math.sin(pitch * DEG2RAD);
    const cr = Math.cos(roll * DEG2RAD), sr = Math.sin(roll * DEG2RAD);
    out[0] = cy * cr + sy * sp * sr;
    out[1] = cy * sr - sy * sp * cr;
    out[2] = sy * cp;
    out[3] = -cp * sr;
    out[4] = cp * cr;
    out[5] = sp;
    out[6] = -sy * cr + cy * sp * sr;
    out[7] = -sy * sr - cy * sp * cr;
    out[8] = cy * cp;
}
