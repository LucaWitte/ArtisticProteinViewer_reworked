// utils/shaderManager.js

/**
 * Manages shaders for protein visualization effects.
 */
export class ShaderManager {
    constructor() {
        this.shaders = {};
        this.loadShaders();
    }

    loadShaders() {
        this.shaders['neonGlow'] = {
            uniforms: {
                glowColor: { value: new THREE.Color(0x00ffff) },
                glowIntensity: { value: 1.5 }
            },
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normal;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 glowColor;
                uniform float glowIntensity;
                varying vec3 vNormal;
                void main() {
                    float intensity = pow(0.5 - dot(vNormal, vec3(0,0,1)), 2.0);
                    gl_FragColor = vec4(glowColor * intensity * glowIntensity, 1.0);
                }
            `
        };
        // Add more shaders here as needed
    }

    applyShader(shaderName, mesh) {
        if (!this.shaders[shaderName] || !mesh) return;
        const shader = this.shaders[shaderName];
        const material = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(shader.uniforms),
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader
        });
        mesh.material = material;
    }
}
