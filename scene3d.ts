/**
 * Public entry point of the 3D engine.
 *
 * Blocks are provided for the most common things; the full API (Mesh3D, Body3D,
 * Camera3D, Humanoid3D classes) is available from JavaScript.
 */
//% weight=90 color="#2e86ab" icon="\uf1b2" block="3D"
//% groups='["World", "Models", "Character", "Camera", "Look"]'
namespace Scene3D {
    export const meshes: Mesh3D[] = [];
    export const bodies: Body3D[] = [];
    /** The one camera used to draw the world */
    export const camera = new Camera3D();

    let initialized = false;
    let stamp = 0;

    function init() {
        if (initialized) return;
        initialized = true;
        // Drawn above the background but below sprites, so normal sprites/text make a HUD.
        scene.createRenderable(-50, function (target: Image, cam: scene.Camera) {
            stamp++;
            Render3D.draw(target, camera, meshes, stamp);
        });
        game.onUpdate(function () {
            let dt = game.eventContext().deltaTime;
            if (dt > 0.05) dt = 0.05;
            if (dt <= 0) return;
            stamp++;
            Collide.stepAll(bodies, meshes, dt, stamp);
        });
    }

    export function register(m: Mesh3D) {
        init();
        meshes.push(m);
    }

    export function unregister(m: Mesh3D) {
        meshes.removeElement(m);
    }

    export function registerBody(b: Body3D) {
        init();
        bodies.push(b);
    }

    export function unregisterBody(b: Body3D) {
        bodies.removeElement(b);
    }

    // ------------------------------------------------------------------
    // World
    // ------------------------------------------------------------------
    /** Create an empty mesh you can add triangles/shapes to */
    //% blockId=s3d_mesh block="create empty mesh"
    //% blockSetVariable=mesh group="World" weight=100
    export function createMesh(): Mesh3D {
        return new Mesh3D();
    }

    /** A solid checkerboard floor centred on the origin */
    //% blockId=s3d_ground block="create ground %sizeX by %sizeZ tiles of %tile colors %color1 %color2"
    //% blockSetVariable=ground group="World" weight=95
    //% sizeX.defl=60 sizeZ.defl=60 tile.defl=4
    //% color1.shadow=colorindexpicker color1.defl=7
    //% color2.shadow=colorindexpicker color2.defl=6
    export function createGround(sizeX: number, sizeZ: number, tile: number, color1: number, color2: number): Mesh3D {
        const m = new Mesh3D();
        m.addGround(sizeX, sizeZ, tile, color1, color2);
        m.solid = true;
        return m;
    }

    /** A solid wall between two points on the ground */
    //% blockId=s3d_wall block="create wall from x %x1 z %z1 to x %x2 z %z2 height %height thickness %thickness color %color"
    //% blockSetVariable=wall group="World" weight=90
    //% height.defl=3 thickness.defl=0.5
    //% color.shadow=colorindexpicker color.defl=13
    //% inlineInputMode=inline
    export function createWall(x1: number, z1: number, x2: number, z2: number, height: number, thickness: number, color: number): Mesh3D {
        const m = new Mesh3D();
        m.addWall(x1, z1, x2, z2, 0, height, thickness, color);
        m.solid = true;
        return m;
    }

    /** A solid box sitting with its centre at (x, y, z) */
    //% blockId=s3d_box block="create box at x %x y %y z %z size %w by %h by %d color %color"
    //% blockSetVariable=box group="World" weight=85
    //% color.shadow=colorindexpicker color.defl=4
    //% inlineInputMode=inline
    export function createBox(x: number, y: number, z: number, w: number, h: number, d: number, color: number): Mesh3D {
        const m = new Mesh3D();
        m.addBox(0, 0, 0, w, h, d, color);
        m.setPosition(x, y, z);
        m.solid = true;
        return m;
    }

    /** A solid ramp that rises towards +Z (rotate it with yaw to aim it) */
    //% blockId=s3d_ramp block="create ramp at x %x y %y z %z size %w by %h by %d color %color"
    //% blockSetVariable=ramp group="World" weight=80
    //% color.shadow=colorindexpicker color.defl=14
    //% inlineInputMode=inline
    export function createRamp(x: number, y: number, z: number, w: number, h: number, d: number, color: number): Mesh3D {
        const m = new Mesh3D();
        m.addRamp(0, 0, 0, w, h, d, color);
        m.setPosition(x, y, z);
        m.solid = true;
        return m;
    }

    /** A solid cylinder (pillar, tree trunk...) */
    export function createCylinder(x: number, y: number, z: number, radius: number, height: number, sides: number, color: number): Mesh3D {
        const m = new Mesh3D();
        m.addCylinder(0, 0, 0, radius, height, sides, color);
        m.setPosition(x, y, z);
        m.solid = true;
        return m;
    }

    /** A low-poly sphere */
    export function createSphere(x: number, y: number, z: number, radius: number, segments: number, color: number): Mesh3D {
        const m = new Mesh3D();
        m.addSphere(0, 0, 0, radius, segments, color);
        m.setPosition(x, y, z);
        m.solid = true;
        return m;
    }

    /** Move a model */
    //% blockId=s3d_setpos block="set %mesh=variables_get(mesh) position to x %x y %y z %z"
    //% group="Models" weight=70
    export function setPosition(mesh: Mesh3D, x: number, y: number, z: number) {
        mesh.setPosition(x, y, z);
    }

    /** Rotate a model (degrees) */
    //% blockId=s3d_setrot block="set %mesh=variables_get(mesh) rotation yaw %yaw pitch %pitch roll %roll"
    //% group="Models" weight=65
    export function setRotation(mesh: Mesh3D, yaw: number, pitch: number, roll: number) {
        mesh.setRotation(yaw, pitch, roll);
    }

    // ------------------------------------------------------------------
    // Characters
    // ------------------------------------------------------------------
    /** A blocky humanoid model with a walk animation */
    //% blockId=s3d_humanoid block="create humanoid shirt %shirt skin %skin pants %pants"
    //% blockSetVariable=hero group="Character" weight=60
    //% shirt.shadow=colorindexpicker shirt.defl=8
    //% skin.shadow=colorindexpicker skin.defl=13
    //% pants.shadow=colorindexpicker pants.defl=12
    export function createHumanoid(shirt: number, skin: number, pants: number): Humanoid3D {
        return new Humanoid3D(shirt, skin, pants);
    }

    /** A physics body (capsule) that collides with solid meshes. (x,y,z) is at the feet. */
    //% blockId=s3d_body block="create body radius %radius height %height"
    //% blockSetVariable=body group="Character" weight=55
    //% radius.defl=0.4 height.defl=1.8
    export function createBody(radius: number, height: number): Body3D {
        return new Body3D(radius, height);
    }

    /** Walk a body relative to a heading */
    //% blockId=s3d_bodymove block="move %body=variables_get(body) forward %forward strafe %strafe speed %speed heading %heading"
    //% group="Character" weight=50 inlineInputMode=inline
    //% speed.defl=6
    export function moveBody(body: Body3D, forward: number, strafe: number, speed: number, heading: number) {
        body.move(forward, strafe, speed, heading);
    }

    /** Make a body jump (only works when it is standing on something) */
    //% blockId=s3d_bodyjump block="%body=variables_get(body) jump with power %power"
    //% group="Character" weight=45 power.defl=9
    export function jumpBody(body: Body3D, power: number) {
        body.jump(power);
    }

    /** Gravity strength in units per second squared */
    //% blockId=s3d_gravity block="set gravity %g"
    //% group="Character" weight=40 g.defl=25
    export function setGravity(g: number) {
        Collide.gravity = g;
    }

    // ------------------------------------------------------------------
    // Camera
    // ------------------------------------------------------------------
    /** Put the camera somewhere and aim it with yaw/pitch (degrees) */
    //% blockId=s3d_camset block="set camera x %x y %y z %z yaw %yaw pitch %pitch"
    //% group="Camera" weight=30 inlineInputMode=inline
    export function setCamera(x: number, y: number, z: number, yaw: number, pitch: number) {
        camera.setPosition(x, y, z);
        camera.setRotation(yaw, pitch);
    }

    /** Point the camera at a position */
    //% blockId=s3d_lookat block="camera look at x %x y %y z %z"
    //% group="Camera" weight=28
    export function cameraLookAt(x: number, y: number, z: number) {
        camera.lookAt(x, y, z);
    }

    /** Third-person camera that trails behind a body */
    //% blockId=s3d_follow block="camera follow %body=variables_get(body) distance %distance height %height heading %heading smoothing %smoothing"
    //% group="Camera" weight=26 inlineInputMode=inline
    //% distance.defl=7 height.defl=3 smoothing.defl=0.2
    export function cameraFollow(body: Body3D, distance: number, height: number, heading: number, smoothing: number) {
        camera.follow(body.x, body.y + body.height * 0.8, body.z, distance, height, heading, smoothing);
    }

    /** Field of view in degrees */
    //% blockId=s3d_fov block="set camera field of view %fov"
    //% group="Camera" weight=24 fov.defl=70
    export function setFieldOfView(fov: number) {
        camera.fov = Math.max(20, Math.min(120, fov));
    }

    /** How far the camera can see */
    //% blockId=s3d_far block="set draw distance %far"
    //% group="Camera" weight=22 far.defl=80
    export function setDrawDistance(far: number) {
        camera.far = Math.max(1, far);
    }

    // ------------------------------------------------------------------
    // Look
    // ------------------------------------------------------------------
    /** Sky colour (0 = leave the normal Arcade background showing) */
    //% blockId=s3d_sky block="set sky color %color"
    //% group="Look" weight=20 color.shadow=colorindexpicker color.defl=9
    export function setSkyColor(color: number) {
        Render3D.skyColor = color;
    }

    /** Direction the light comes FROM */
    //% blockId=s3d_light block="set light direction x %x y %y z %z"
    //% group="Look" weight=18 x.defl=0.35 y.defl=0.8 z.defl=-0.45
    export function setLightDirection(x: number, y: number, z: number) {
        Render3D.setLight(x, y, z);
    }

    /** Distant triangles get darker. 0 turns fog off. */
    //% blockId=s3d_fog block="set fog start distance %start"
    //% group="Look" weight=16 start.defl=30
    export function setFog(start: number) {
        Render3D.fogStart = Math.max(0, start);
    }

    /** Hard limit of triangles drawn per frame. Lower it if the game is slow. */
    //% blockId=s3d_maxtris block="set max triangles per frame %n"
    //% group="Look" weight=14 n.defl=600
    export function setMaxTriangles(n: number) {
        Render3D.maxTriangles = Math.max(10, n);
    }

    /** Change the three shades (lit, mid, dark) used for one palette colour. Useful with custom palettes. */
    export function setShade(color: number, mid: number, dark: number) {
        const c = (color & 15) * 3;
        Render3D.shade[c] = color & 15;
        Render3D.shade[c + 1] = mid & 15;
        Render3D.shade[c + 2] = dark & 15;
    }
}
