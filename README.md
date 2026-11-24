# Scene3D-MakecodeArcade
A simple 3D engine I shamefully made . . . 

A real triangle-mesh 3D engine (not raycasting, not Mode 7). Build a world out of triangles, walk a character around it, and collide with every triangle.

* **Meshes** - any pile of triangles, with position / rotation / scale and parenting
* **Shapes** - ground, walls, boxes, ramps, cylinders, spheres, pyramids, or raw triangles
* **Characters** - a ready-made animated `Humanoid3D`, or build your own from child meshes
* **Cameras** - free camera, look-at, orbit, third-person follow
* **Collision** - capsule body vs. triangle meshes: walls, slopes, steps, jumping, gravity
* **Rendering** - near-plane clipping, back-face culling, flat directional shading, fog, depth sorting

Conventions: **+X right, +Y up, +Z forward**. Angles are in degrees. `yaw > 0` turns right,
`pitch > 0` looks/tilts up. Drawing happens behind sprites, so normal sprites and text work as a HUD.

## Quick start (JavaScript)

```ts
Scene3D.createGround(60, 60, 4, 7, 6)              // size, tile size, 2 checker colours
Scene3D.createWall(-10, 10, 10, 10, 3, 0.6, 2)     // x1 z1 x2 z2 height thickness colour
Scene3D.createBox(6, 0.5, 4, 2, 1, 2, 4)           // x y z  w h d  colour
Scene3D.createRamp(-8, 1, 6, 5, 2, 8, 14)

const hero = Scene3D.createHumanoid(8, 13, 12)     // shirt, skin, pants
const body = Scene3D.createBody(0.4, 1.8)          // collision capsule (x,y,z = feet)
body.setModel(hero.root)
body.setPosition(0, 1, -10)
let heading = 0

controller.A.onEvent(ControllerButtonEvent.Pressed, () => body.jump(9))
game.onUpdate(function () {
    heading += controller.dx(1) * 2.5
    body.move(-controller.dy(1), 0, 6, heading)    // forward, strafe, speed, heading
    hero.root.yaw = heading
    hero.animate(body.speed())
    Scene3D.cameraFollow(body, 7, 3, heading, 0.2)
})
```

`test.ts` contains a fuller demo (only runs when editing this extension itself).

## Making your own models

```ts
const tree = Scene3D.createMesh()
tree.addCylinder(0, 1, 0, 0.3, 2, 6, 14)        // trunk
tree.addPyramid(0, 3, 0, 2, 2.5, 2, 7)          // leaves
tree.setPosition(5, 0, 5)
tree.solid = true                               // bodies collide with it

// raw triangles - the visible side is the one (v1-v0) x (v2-v0) points to
const t = Scene3D.createMesh()
t.addTriangleAt(0,0,0,  1,0,0,  0,1,0, 5)
t.doubleSided = true                            // draw both sides if you prefer
```

Parenting (for animation): `child.setParent(parent)` - the child's position/rotation/scale are
then relative to the parent. See `humanoid.ts` for a full example.

## API summary

**Scene3D** - `createMesh, createGround, createWall, createBox, createRamp, createCylinder,
createSphere, createHumanoid, createBody, setGravity, setSkyColor, setLightDirection, setFog,
setDrawDistance, setFieldOfView, setMaxTriangles, setShade`, and `Scene3D.camera`.

**Mesh3D** - `x y z yaw pitch roll scale visible doubleSided lit solid parent`,
`setPosition, setRotation, setScale, setParent, setColor, destroy`,
`addVertex, addTriangle, addTriangleAt, addBox, addWall, addPyramid, addRamp, addCylinder,
addSphere, addGround`.

**Body3D** - `x y z vx vy vz radius height grounded slopeLimit useGravity model`,
`setPosition, setModel, move, jump, speed, faceVelocity, destroy`.

**Camera3D** - `x y z yaw pitch fov near far`,
`setPosition, setRotation, turn, moveForward, moveRight, moveUp, moveLook, lookAt, orbit, follow`.

**Humanoid3D** - `root head torso armL armR legL legR`, `animate(speed), setScale, destroy`.

Blocks exist for the common functions (create ground/wall/box/ramp/humanoid/body, move/jump,
camera, sky, light, fog). The complete API is in JavaScript.

## How collision works

A `Body3D` is an upright capsule (2-3 spheres). Each frame it falls, moves in small sub-steps, and
is pushed out of the deepest overlapping triangle of every `solid` mesh. Contacts on surfaces flatter
than `slopeLimit` (default ~45 degrees) count as ground and can be walked on; steeper ones act as
walls and are slid along. Large solid meshes get an automatic XZ grid, so a 400-triangle level only
tests nearby triangles. Static solid meshes are cheapest - moving a *big* solid mesh every frame rebuilds its grid.

## Limits and performance tips

* Numbers are floats and everything is software-rendered at 160x120. It is fast in the simulator;
  **real hardware is much slower** - start with a few hundred triangles and tune with
  `Scene3D.setMaxTriangles` and `Scene3D.setDrawDistance`.
* Depth sorting is per-triangle (painter's algorithm), not a z-buffer. Very large triangles can
  sort wrongly against things next to them, so prefer many small pieces: ground tiles around 2-4
  units, and `addWall` already splits long walls into 3-unit pieces.
* Triangles are flat-shaded with 3 brightness levels taken from the palette. Change them with
  `Scene3D.setShade(color, mid, dark)` if you use a custom palette.
* No textures and no transparency. Triangles are one-sided unless `doubleSided` is true.
* Call `Scene3D` functions after the game scene exists (i.e. normal `on start` code).
