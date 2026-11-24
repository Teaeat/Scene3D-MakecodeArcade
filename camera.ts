/**
 * A free camera. Looks down +Z when yaw = pitch = 0.
 */
class Camera3D {
    x = 0;
    y = 2;
    z = -6;
    yaw = 0;
    pitch = 0;
    /** horizontal field of view in degrees */
    fov = 70;
    near = 0.1;
    far = 120;
    /** camera-to-world rotation, row-major (columns are right, up, forward) */
    m: number[];

    constructor() {
        this.m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }

    setPosition(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    setRotation(yaw: number, pitch: number) {
        this.yaw = yaw;
        this.pitch = Math.max(-89, Math.min(89, pitch));
    }

    /** Turn the camera by the given amounts */
    turn(dyaw: number, dpitch: number) {
        this.setRotation(this.yaw + dyaw, this.pitch + dpitch);
    }

    /** Move along the horizontal look direction (fly-less walking) */
    moveForward(d: number) {
        this.x += Math.sin(this.yaw * DEG2RAD) * d;
        this.z += Math.cos(this.yaw * DEG2RAD) * d;
    }

    moveRight(d: number) {
        this.x += Math.cos(this.yaw * DEG2RAD) * d;
        this.z -= Math.sin(this.yaw * DEG2RAD) * d;
    }

    moveUp(d: number) {
        this.y += d;
    }

    /** Move exactly along the view direction (free-fly) */
    moveLook(d: number) {
        const cp = Math.cos(this.pitch * DEG2RAD);
        this.x += Math.sin(this.yaw * DEG2RAD) * cp * d;
        this.y += Math.sin(this.pitch * DEG2RAD) * d;
        this.z += Math.cos(this.yaw * DEG2RAD) * cp * d;
    }

    /** Point the camera at a world position */
    lookAt(tx: number, ty: number, tz: number) {
        const dx = tx - this.x;
        const dy = ty - this.y;
        const dz = tz - this.z;
        const flat = Math.sqrt(dx * dx + dz * dz);
        if (flat < 1e-6 && Math.abs(dy) < 1e-6) return;
        this.yaw = Math.atan2(dx, dz) / DEG2RAD;
        this.pitch = Math.max(-89, Math.min(89, Math.atan2(dy, flat) / DEG2RAD));
    }

    /** Place the camera on a sphere around a target, always looking at it */
    orbit(tx: number, ty: number, tz: number, distance: number, yaw: number, pitch: number) {
        this.setRotation(yaw, pitch);
        const cp = Math.cos(this.pitch * DEG2RAD);
        this.x = tx - Math.sin(this.yaw * DEG2RAD) * cp * distance;
        this.y = ty - Math.sin(this.pitch * DEG2RAD) * distance;
        this.z = tz - Math.cos(this.yaw * DEG2RAD) * cp * distance;
    }

    /** Third-person chase camera. heading = direction the target faces (degrees),
     *  smoothing 0..1 (1 = snap instantly, 0.1 = lazy). Call every frame. */
    follow(tx: number, ty: number, tz: number, distance: number, height: number, heading: number, smoothing: number) {
        const h = heading * DEG2RAD;
        const wx = tx - Math.sin(h) * distance;
        const wy = ty + height;
        const wz = tz - Math.cos(h) * distance;
        const k = Math.max(0, Math.min(1, smoothing));
        this.x += (wx - this.x) * k;
        this.y += (wy - this.y) * k;
        this.z += (wz - this.z) * k;
        this.lookAt(tx, ty, tz);
    }

    /** Refresh the rotation matrix (done automatically while rendering) */
    updateMatrix() {
        const cy = Math.cos(this.yaw * DEG2RAD), sy = Math.sin(this.yaw * DEG2RAD);
        const cp = Math.cos(this.pitch * DEG2RAD), sp = Math.sin(this.pitch * DEG2RAD);
        const m = this.m;
        m[0] = cy; m[1] = -sy * sp; m[2] = sy * cp;
        m[3] = 0; m[4] = cp; m[5] = sp;
        m[6] = -sy; m[7] = -cy * sp; m[8] = cy * cp;
    }
}
