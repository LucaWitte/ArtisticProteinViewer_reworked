import * as THREE from 'three';

/**
 * Manages protein visualization with Three.js.
 */
export class ProteinRenderer {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);
        this.currentRepresentation = null;

        this.camera.position.z = 50;
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(0, 1, 1).normalize();
        this.scene.add(light);
        this.scene.add(new THREE.AmbientLight(0x404040));

        this.animate = this.animate.bind(this);
        this.animate();
    }

    /**
     * Renders protein in ball-and-stick representation.
     * @param {Object} proteinData - Parsed protein data.
     */
    renderBallAndStick(proteinData) {
        if (this.currentRepresentation) this.scene.remove(this.currentRepresentation);
        const group = new THREE.Group();

        const atomGeometry = new THREE.SphereGeometry(0.5, 16, 16);
        const bondGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);

        proteinData.atoms.forEach(atom => {
            const material = new THREE.MeshPhongMaterial({ color: this.getColorByElement(atom.element) });
            const sphere = new THREE.Mesh(atomGeometry, material);
            sphere.position.set(atom.x, atom.y, atom.z);
            group.add(sphere);
        });

        proteinData.bonds.forEach(([startSerial, endSerial]) => {
            const startAtom = proteinData.atoms.find(a => a.serial === startSerial);
            const endAtom = proteinData.atoms.find(a => a.serial === endSerial);
            if (!startAtom || !endAtom) return;

            const start = new THREE.Vector3(startAtom.x, startAtom.y, startAtom.z);
            const end = new THREE.Vector3(endAtom.x, endAtom.y, endAtom.z);
            const direction = end.clone().sub(start);
            const length = direction.length();

            const bond = new THREE.Mesh(bondGeometry, new THREE.MeshPhongMaterial({ color: 0xcccccc }));
            bond.position.copy(start).add(direction.multiplyScalar(0.5));
            bond.scale.z = length;
            bond.lookAt(end);
            group.add(bond);
        });

        this.scene.add(group);
        this.currentRepresentation = group;
        this.fitToView(proteinData);
    }

    /**
     * Renders protein in cartoon representation (simplified).
     * @param {Object} proteinData - Parsed protein data.
     */
    renderCartoon(proteinData) {
        if (this.currentRepresentation) this.scene.remove(this.currentRepresentation);
        const group = new THREE.Group();

        const curvePoints = proteinData.atoms.map(atom => new THREE.Vector3(atom.x, atom.y, atom.z));
        const curve = new THREE.CatmullRomCurve3(curvePoints);
        const tubeGeometry = new THREE.TubeGeometry(curve, 64, 0.5, 8, false);
        const material = new THREE.MeshPhongMaterial({ color: 0xff9900 });
        const tube = new THREE.Mesh(tubeGeometry, material);
        group.add(tube);

        this.scene.add(group);
        this.currentRepresentation = group;
        this.fitToView(proteinData);
    }

    /**
     * Renders protein in surface representation using ConvexGeometry.
     * @param {Object} proteinData - Parsed protein data.
     */
    renderSurface(proteinData) {
        if (this.currentRepresentation) this.scene.remove(this.currentRepresentation);
        const group = new THREE.Group();

        const points = proteinData.atoms.map(atom => new THREE.Vector3(atom.x, atom.y, atom.z));
        const geometry = new THREE.ConvexGeometry(points);
        const material = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.5 });
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);

        this.scene.add(group);
        this.currentRepresentation = group;
        this.fitToView(proteinData);
    }

    /**
     * Adjusts camera to fit the protein in view.
     * @param {Object} proteinData - Parsed protein data.
     */
    fitToView(proteinData) {
        const box = new THREE.Box3();
        proteinData.atoms.forEach(atom => box.expandByPoint(new THREE.Vector3(atom.x, atom.y, atom.z)));
        const size = box.getSize(new THREE.Vector3()).length();
        const center = box.getCenter(new THREE.Vector3());

        this.camera.position.copy(center);
        this.camera.position.z += size * 1.5;
        this.camera.lookAt(center);
        this.camera.far = size * 10;
        this.camera.updateProjectionMatrix();
    }

    /**
     * Returns color based on element type.
     * @param {string} element - Element symbol.
     * @returns {number} - Hex color code.
     */
    getColorByElement(element) {
        const colors = { 'C': 0x909090, 'N': 0x0000ff, 'O': 0xff0000, 'H': 0xffffff, 'S': 0xffff00 };
        return colors[element] || 0x909090;
    }

    animate() {
        requestAnimationFrame(this.animate);
        this.renderer.render(this.scene, this.camera);
    }
}
