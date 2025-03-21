import * as THREE from 'three';

export class ShaderManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.shaders = {};
        this.loadShaders();
    }

    /**
     * Loads shader definitions.
     */
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

        this.shaders['watercolor'] = {
            uniforms: {
                time: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying vec2 vUv;
                void main() {
                    vec2 p = -1.0 + 2.0 * vUv;
                    float a = atan(p.y, p.x);
                    float r = length(p);
                    vec3 color = vec3(0.5 + 0.5 * sin(a * 10.0 + time), 0.5 + 0.5 * sin(r * 10.0 + time), 0.5);
                    gl_FragColor = vec4(color, 1.0);
                }
            `
        };

        this.shaders['blueprint'] = {
            uniforms: {
                lineColor: { value: new THREE.Color(0x0000ff) }
            },
            vertexShader: `
                varying vec3 vPosition;
                void main() {
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 lineColor;
                varying vec3 vPosition;
                void main() {
                    vec3 color = vec3(1.0);
                    if (mod(vPosition.x, 1.0) < 0.05 || mod(vPosition.y, 1.0) < 0.05 || mod(vPosition.z, 1.0) < 0.05) {
                        color = lineColor;
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `
        };

        this.shaders['crystal'] = {
            uniforms: {
                refractAmount: { value: 0.5 }
            },
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normal;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float refractAmount;
                varying vec3 vNormal;
                void main() {
                    vec3 refracted = refract(vec3(0.0, 0.0, -1.0), vNormal, refractAmount);
                    gl_FragColor = vec4(refracted * 0.5 + 0.5, 1.0);
                }
            `
        };

        this.shaders['toon'] = {
            uniforms: {
                lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() }
            },
            vertexShader: `
                varying vec3 vNormal;
                void main() {
                    vNormal = normal;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 lightDirection;
                varying vec3 vNormal;
                void main() {
                    float intensity = dot(normalize(vNormal), lightDirection);
                    vec3 color;
                    if (intensity > 0.95) color = vec3(1.0, 0.5, 0.5);
                    else if (intensity > 0.5) color = vec3(0.6, 0.3, 0.3);
                    else if (intensity > 0.25) color = vec3(0.4, 0.2, 0.2);
                    else color = vec3(0.2, 0.1, 0.1);
                    gl_FragColor = vec4(color, 1.0);
                }
            `
        };
    }

    /**
     * Applies a shader to a mesh.
     * @param {string} shaderName - Name of the shader.
     * @param {THREE.Mesh} mesh - Mesh to apply the shader to.
     */
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
