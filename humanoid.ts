/**
 * A ready-made blocky character (about 1.8 units tall, facing +Z) built from child meshes,
 * with a walk animation. Pair it with a Body3D:   body.setModel(hero.root)
 */
class Humanoid3D {
    root: Mesh3D;
    head: Mesh3D;
    torso: Mesh3D;
    armL: Mesh3D;
    armR: Mesh3D;
    legL: Mesh3D;
    legR: Mesh3D;
    private phase = 0;
    private amp = 0;

    constructor(shirt: number, skin: number, pants: number, hair: number = 14) {
        this.root = new Mesh3D();
        this.torso = this.part(0, 0, 0, shirt);
        this.torso.addBox(0, 1.1, 0, 0.7, 0.6, 0.36, shirt);
        this.head = this.part(0, 1.4, 0, skin);
        this.head.addBox(0, 0.2, 0, 0.4, 0.4, 0.4, skin, hair);
        this.head.addBox(0, 0.24, 0.2, 0.3, 0.07, 0.04, 15); // eyes: shows which way it faces
        this.armL = this.part(-0.46, 1.4, 0, shirt);
        this.armL.addBox(0, -0.3, 0, 0.2, 0.6, 0.2, skin);
        this.armR = this.part(0.46, 1.4, 0, shirt);
        this.armR.addBox(0, -0.3, 0, 0.2, 0.6, 0.2, skin);
        this.legL = this.part(-0.17, 0.8, 0, pants);
        this.legL.addBox(0, -0.4, 0, 0.3, 0.8, 0.3, pants);
        this.legR = this.part(0.17, 0.8, 0, pants);
        this.legR.addBox(0, -0.4, 0, 0.3, 0.8, 0.3, pants);
    }

    private part(x: number, y: number, z: number, color: number): Mesh3D {
        const m = new Mesh3D();
        m.setPosition(x, y, z);
        m.parent = this.root;
        return m;
    }

    /** Call every frame with the horizontal speed (e.g. body.speed()) to swing the limbs */
    animate(speed: number) {
        const dt = game.eventContext().deltaTime;
        const target = speed > 0.3 ? Math.min(1, speed / 6) * 45 : 0;
        this.amp += (target - this.amp) * Math.min(1, 12 * dt);
        if (speed > 0.3) this.phase += dt * (3 + speed * 1.2);
        const sw = Math.sin(this.phase) * this.amp;
        this.legL.pitch = sw;
        this.legR.pitch = -sw;
        this.armL.pitch = -sw;
        this.armR.pitch = sw;
    }

    setPosition(x: number, y: number, z: number) {
        this.root.setPosition(x, y, z);
    }

    /** Resize the whole character (1 = 1.8 units tall) */
    setScale(s: number) {
        this.root.scale = s;
    }

    destroy() {
        this.root.destroy();
        this.head.destroy();
        this.torso.destroy();
        this.armL.destroy();
        this.armR.destroy();
        this.legL.destroy();
        this.legR.destroy();
    }
}
