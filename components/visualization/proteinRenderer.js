export class ProteinRenderer {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);
        this.currentRepresentation = null;

        // Add a placeholder cube
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.currentRepresentation = new THREE.Mesh(geometry, material);
        this.scene.add(this.currentRepresentation);

        this.camera.position.z = 5;

        this.animate = this.animate.bind(this);
        this.animate();
    }

    animate() {
        requestAnimationFrame(this.animate);
        this.renderer.render(this.scene, this.camera);
    }
}
