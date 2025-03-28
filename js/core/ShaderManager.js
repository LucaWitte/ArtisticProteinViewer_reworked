import * as THREE from '../vendor/three.module.js';

class ShaderManager {
    constructor() {
        this.shaderCache = new Map(); // Cache for loaded GLSL code
        this.materialCache = new Map(); // Optional: Cache materials (use carefully)
        this.textureLoader = new THREE.TextureLoader();
        this.envMap = null; // Store the loaded environment map
        this.loadEnvironmentMap('assets/textures/envmap.png'); // Load default env map
    }

    /**
     * Loads vertex and fragment shader code from files.
     * @param {string} shaderName - The base name of the shader (e.g., 'base', 'toon').
     * @returns {Promise<{vertexShader: string, fragmentShader: string}>}
     */
    async loadShaderCode(shaderName) {
        if (this.shaderCache.has(shaderName)) {
            return this.shaderCache.get(shaderName);
        }

        const vertPath = `shaders/vertex/${shaderName}_vert.glsl`;
        const fragPath = `shaders/fragment/${shaderName}_frag.glsl`;

        try {
            const [vertResponse, fragResponse] = await Promise.all([
                fetch(vertPath),
                fetch(fragPath)
            ]);

            if (!vertResponse.ok) {
                console.warn(`Failed to load vertex shader: ${vertPath} (${vertResponse.status})`);
                return this.getFallbackShaderCode(shaderName);
            }
            if (!fragResponse.ok) {
                console.warn(`Failed to load fragment shader: ${fragPath} (${fragResponse.status})`);
                return this.getFallbackShaderCode(shaderName);
            }

            const vertexShader = await vertResponse.text();
            const fragmentShader = await fragResponse.text();

            // Process shaders to fix common issues
            const processedVertexShader = this.processVertexShader(vertexShader);
            const processedFragmentShader = fragmentShader;

            const shaderCode = { 
                vertexShader: processedVertexShader, 
                fragmentShader: processedFragmentShader 
            };
            this.shaderCache.set(shaderName, shaderCode); // Cache the loaded code
            return shaderCode;

        } catch (error) {
            console.error(`Error loading shader ${shaderName}:`, error);
            return this.getFallbackShaderCode(shaderName);
        }
    }

    /**
     * Process vertex shader code to fix common issues
     * @param {string} vertexShader - Original vertex shader code
     * @returns {string} - Processed shader code
     */
    processVertexShader(vertexShader) {
        // Fix duplicate color attribute declarations
        // THREE.js automatically adds 'attribute vec3 color' when vertexColors = true
        // So we need to make sure it's not redefined in our shader
        
        // Check if shader has a color attribute declaration
        if (vertexShader.includes('attribute vec3 color')) {
            console.warn('Removing duplicate color attribute from shader');
            // Remove the declaration but keep any related code
            return vertexShader.replace(/attribute\s+vec3\s+color\s*;/g, '// color attribute is auto-provided by THREE.js');
        }
        
        return vertexShader;
    }

    /**
     * Returns fallback shader code for when loading fails
     * @param {string} shaderName - The name of the shader
     * @returns {Object} - Object containing vertexShader and fragmentShader
     */
    getFallbackShaderCode(shaderName) {
        console.log(`Using fallback shader for ${shaderName}`);
        
        // Basic vertex shader without duplicate color attribute
        const baseVertexShader = `
        // Varying variables passed to fragment shader
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        varying vec3 vColor;
        
        void main() {
            // Calculate world position
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            
            // Calculate view-space position and normal
            vec4 viewPosition = viewMatrix * worldPosition;
            vViewPosition = viewPosition.xyz;
            
            // Normal handling
            #ifdef USE_NORMAL
                vNormal = normalMatrix * normal;
            #else
                // Default normal for lines
                vNormal = vec3(0.0, 0.0, 1.0);
            #endif
            
            // Vertex color handling
            #ifdef USE_COLOR
                vColor = color;
            #else
                vColor = vec3(1.0); // Default white if no vertex colors
            #endif
            
            // Set final position
            gl_Position = projectionMatrix * viewPosition;
        }`;
        
        // Basic fragment shader
        const baseFragmentShader = `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        varying vec3 vColor;
        
        uniform vec3 uBaseColor;
        uniform vec3 uLightDirection;
        uniform vec3 uLightColor;
        uniform vec3 uAmbientLightColor;
        uniform bool uUseSolidColor;
        
        void main() {
            // Base color: either use vertex colors or the uniform base color
            vec3 baseColor = uUseSolidColor ? uBaseColor : vColor;
            
            // Simple lighting
            vec3 normal = normalize(vNormal);
            vec3 lightDir = normalize(uLightDirection);
            float diffuse = max(dot(normal, lightDir), 0.0);
            
            // Combine ambient and diffuse
            vec3 ambient = baseColor * uAmbientLightColor;
            vec3 diffuseColor = baseColor * uLightColor * diffuse;
            
            // Final color
            vec3 finalColor = ambient + diffuseColor;
            gl_FragColor = vec4(finalColor, 1.0);
        }`;
        
        // For toon shader
        const toonVertexShader = baseVertexShader;
        const toonFragmentShader = `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        varying vec3 vColor;
        
        uniform vec3 uBaseColor;
        uniform vec3 uLightDirection;
        uniform vec3 uLightColor;
        uniform vec3 uAmbientLightColor;
        uniform bool uUseSolidColor;
        uniform float uNumSteps;
        uniform vec3 uOutlineColor;
        uniform float uOutlineThickness;
        
        void main() {
            // Base color: either use vertex colors or the uniform base color
            vec3 baseColor = uUseSolidColor ? uBaseColor : vColor;
            
            // Lighting calculation
            vec3 normal = normalize(vNormal);
            vec3 lightDir = normalize(uLightDirection);
            float diffuse = max(dot(normal, lightDir), 0.0);
            
            // Toon shading - discretize the diffuse value
            float steps = max(2.0, uNumSteps);
            float toonDiffuse = floor(diffuse * steps) / steps;
            
            // Edge detection based on normal vs view direction
            vec3 viewDir = normalize(-vViewPosition);
            float edge = 1.0 - max(dot(viewDir, normal), 0.0);
            edge = step(1.0 - uOutlineThickness, edge);
            
            // Combine colors
            vec3 ambient = baseColor * uAmbientLightColor;
            vec3 diffuseColor = baseColor * uLightColor * toonDiffuse;
            vec3 finalColor = mix(ambient + diffuseColor, uOutlineColor, edge);
            
            gl_FragColor = vec4(finalColor, 1.0);
        }`;
        
        // For metallic shader
        const metallicVertexShader = baseVertexShader;
        const metallicFragmentShader = `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;
        varying vec3 vColor;
        
        uniform vec3 uBaseColor;
        uniform vec3 uLightDirection;
        uniform vec3 uLightColor;
        uniform vec3 uAmbientLightColor;
        uniform bool uUseSolidColor;
        uniform float uRoughness;
        uniform float uMetallic;
        uniform sampler2D uEnvMap;
        
        // Simple environment map lookup (fake)
        vec3 getEnvColor(vec3 reflectDir) {
            // Simple approximation of an environment
            float y = 0.5 * reflectDir.y + 0.5;
            return mix(vec3(0.5, 0.7, 1.0), vec3(0.2, 0.2, 0.4), y);
        }
        
        void main() {
            // Base color selection
            vec3 baseColor = uUseSolidColor ? uBaseColor : vColor;
            
            // Lighting setup
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(-vViewPosition);
            vec3 lightDir = normalize(uLightDirection);
            
            // PBR-inspired calculations
            float diffuse = max(dot(normal, lightDir), 0.0);
            vec3 halfDir = normalize(lightDir + viewDir);
            float specular = pow(max(dot(normal, halfDir), 0.0), 16.0 / max(uRoughness, 0.01));
            
            // Reflections
            vec3 reflectDir = reflect(-viewDir, normal);
            vec3 envColor = getEnvColor(reflectDir);
            
            // Combine components
            vec3 diffuseColor = baseColor * diffuse * uLightColor * (1.0 - uMetallic);
            vec3 specularColor = mix(vec3(0.04), baseColor, uMetallic) * specular * uLightColor;
            vec3 reflectionColor = envColor * mix(vec3(0.04), baseColor, uMetallic);
            vec3 ambientColor = baseColor * uAmbientLightColor;
            
            // Final color
            vec3 finalColor = ambientColor + diffuseColor + specularColor + reflectionColor * (1.0 - uRoughness);
            
            gl_FragColor = vec4(finalColor, 1.0);
        }`;
        
        // Return appropriate shader based on requested type
        switch(shaderName) {
            case 'toon':
                return { vertexShader: toonVertexShader, fragmentShader: toonFragmentShader };
            case 'metallic':
                return { vertexShader: metallicVertexShader, fragmentShader: metallicFragmentShader };
            case 'base':
            default:
                return { vertexShader: baseVertexShader, fragmentShader: baseFragmentShader };
        }
    }

    /**
     * Loads the environment map texture.
     * @param {string} url - Path to the environment map texture.
     */
    async loadEnvironmentMap(url) {
        try {
            this.envMap = await this.textureLoader.loadAsync(url);
            this.envMap.mapping = THREE.EquirectangularReflectionMapping; // Assuming equirectangular map
            this.envMap.encoding = THREE.sRGBEncoding; // Assuming sRGB texture
            console.log("Environment map loaded successfully.");
        } catch (error) {
            console.error(`Failed to load environment map from ${url}:`, error);
            this.envMap = this.createFallbackEnvMap(); // Use a fallback
            console.log("Using fallback environment map.");
        }
    }

    createFallbackEnvMap() {
        // Create a simple 1x1 grey texture as fallback
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        context.fillStyle = '#808080'; // Grey
        context.fillRect(0, 0, 1, 1);
        const texture = new THREE.CanvasTexture(canvas);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        return texture;
    }

    /**
     * Creates a ShaderMaterial instance.
     * @param {string} shaderName - The name of the shader.
     * @param {object} userUniforms - Specific uniforms provided by the user/app state.
     * @param {boolean} isMesh - Is the geometry a Mesh (true) or Lines (false)? Affects lighting calcs.
     * @returns {Promise<THREE.ShaderMaterial>}
     */
    async createMaterial(shaderName, userUniforms = {}, isMesh = true) {
        // Try to load the shader code
        const { vertexShader, fragmentShader } = await this.loadShaderCode(shaderName);

        // Define standard uniforms required by most shaders
        const standardUniforms = {
            // Lighting (provide defaults, override with userUniforms if present)
            uLightDirection: { value: userUniforms.lightDirection || new THREE.Vector3(1, 1, 1).normalize() },
            uLightColor: { value: userUniforms.lightColor || new THREE.Color(0xffffff) },
            uAmbientLightColor: { value: userUniforms.ambientLightColor || new THREE.Color(0x404040) },

            // Basic color handling
            uBaseColor: { value: new THREE.Color(0xffffff) }, // Default white
            uUseSolidColor: { value: true }, // Default to using uBaseColor

            // Specific Shader Uniforms (with defaults)
            // Toon
            uOutlineColor: { value: new THREE.Color(0x000000) },
            uOutlineThickness: { value: 0.02 },
            uNumSteps: { value: 4 },

            // Metallic
            uRoughness: { value: 0.3 },
            uMetallic: { value: 0.8 },
            uEnvMap: { value: this.envMap },
        };

        // Merge standard and user uniforms, userUniforms override standard defaults
        const finalUniforms = THREE.UniformsUtils.merge([standardUniforms, userUniforms]);

        // Ensure specific color uniforms are THREE.Color instances
        if (finalUniforms.uBaseColor && !(finalUniforms.uBaseColor.value instanceof THREE.Color)) {
            finalUniforms.uBaseColor.value = new THREE.Color(finalUniforms.uBaseColor.value);
        }
        if (finalUniforms.uOutlineColor && !(finalUniforms.uOutlineColor.value instanceof THREE.Color)) {
            finalUniforms.uOutlineColor.value = new THREE.Color(finalUniforms.uOutlineColor.value);
        }

        try {
            // Create shader material with proper settings
            const material = new THREE.ShaderMaterial({
                uniforms: finalUniforms,
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                lights: false, // We handle lighting in our shaders
                vertexColors: true, // Important! Turn on vertex colors
                side: isMesh ? THREE.FrontSide : THREE.DoubleSide, // Both sides for lines
                transparent: userUniforms.opacity !== undefined && userUniforms.opacity < 1.0,
                opacity: userUniforms.opacity !== undefined ? userUniforms.opacity : 1.0,
                defines: {
                    USE_COLOR: '' // Enable the USE_COLOR check in our shaders
                }
            });

            // If the material isn't for a mesh (i.e., for lines), fall back to basic material if needed
            if (!isMesh) {
                console.log("Creating material for lines representation");
                // For lines representation, we might need fallback materials for certain shaders
                if (shaderName !== 'base') {
                    // Non-base shaders might be complex for lines - check if we need basic instead
                    const needsBasic = false; // Change logic as needed
                    if (needsBasic) {
                        return new THREE.LineBasicMaterial({
                            color: finalUniforms.uBaseColor.value,
                            vertexColors: true,
                            opacity: userUniforms.opacity || 1.0,
                            transparent: userUniforms.opacity !== undefined && userUniforms.opacity < 1.0
                        });
                    }
                }
            }

            return material;

        } catch (error) {
            console.error(`Failed to create material for shader ${shaderName}:`, error);
            // Return a fallback material for error cases
            if (isMesh) {
                return new THREE.MeshBasicMaterial({
                    color: 0xff00ff,
                    wireframe: true,
                    vertexColors: true
                });
            } else {
                return new THREE.LineBasicMaterial({
                    color: 0xff00ff,
                    vertexColors: true
                });
            }
        }
    }
}

export default ShaderManager;
