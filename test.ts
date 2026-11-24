// Demo world: d-pad forward/back walks, left/right turns, A jumps.
Scene3D.setSkyColor(9)
Scene3D.setFog(35)

// ground + boundary walls
Scene3D.createGround(60, 60, 4, 7, 6)
Scene3D.createWall(-30, -30, 30, -30, 3, 1, 13)
Scene3D.createWall(30, -30, 30, 30, 3, 1, 13)
Scene3D.createWall(30, 30, -30, 30, 3, 1, 13)
Scene3D.createWall(-30, 30, -30, -30, 3, 1, 13)

// things to bump into and climb
Scene3D.createWall(-6, 8, 6, 8, 3, 0.6, 2)
Scene3D.createBox(10, 0.5, 4, 2, 1, 2, 4)
Scene3D.createBox(13, 1, 4, 2, 2, 2, 5)
Scene3D.createBox(16, 1.5, 4, 2, 3, 2, 10)
const ramp = Scene3D.createRamp(-10, 1, 6, 5, 2, 8, 14)
Scene3D.createCylinder(0, 2, 16, 1, 4, 10, 8)
Scene3D.createSphere(-4, 1.2, 14, 1.2, 10, 3)

// a hand-made pyramid with raw triangles
const tent = Scene3D.createMesh()
tent.addPyramid(0, 0, 0, 5, 4, 5, 3)
tent.setPosition(12, 2, 16)
tent.solid = true

// the hero
const hero = Scene3D.createHumanoid(8, 13, 12)
const body = Scene3D.createBody(0.4, 1.8)
body.setModel(hero.root)
body.setPosition(0, 1, -10)
let heading = 0

controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    body.jump(9)
})

game.onUpdate(function () {
    heading += controller.dx(1) * 2.5
    Scene3D.moveBody(body, -controller.dy(1), 0, 6, heading)
    hero.root.yaw = heading
    hero.animate(body.speed())
    Scene3D.cameraFollow(body, 7, 3, heading, 0.2)
})
