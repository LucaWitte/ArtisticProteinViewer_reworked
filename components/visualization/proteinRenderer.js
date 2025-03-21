// components/visualization/proteinRenderer.js

/**
 * Manages protein visualization with Three.js.
 */
export class ProteinRenderer {
    constructor(container) {
        this.container = container;

        // Initialize Three.js scene, camera, and renderer using the global THREE object
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75, // Field of view
            container.clientWidth / container.clientHeight, // Aspect ratio
            0.1, // Near clipping plane
            1000 // Far clipping plane
        );
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);
        this.currentRepresentation = null;

        // Position the camera
        this.camera.position.z = 50;

        // Add lighting
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(0, 1, 1).normalize();
        this.scene.add(light);
        this.scene.add(new THREE.AmbientLight(0x404040));

        // Bind the animate method and start animation
        this.animate = this.animate.bind(this);
        this.animate();
    }

    animate() {
        requestAnimationFrame(this.animate);
        this.renderer.render(this.scene, this.camera);
    }

    // Placeholder for additional methods (e.g., updating visualization)
    updateRepresentation(data) {
        // Add logic to update the scene based on protein data
        console.log('Updating representation with:', data);
    }
}
