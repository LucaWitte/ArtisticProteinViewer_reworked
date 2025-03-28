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

            if (!vertResponse.ok) throw new Error(`Failed to load vertex shader: ${vertPath} (${vertResponse.status})`);
            if (!fragResponse.ok) throw new Error(`Failed to load fragment shader: ${fragPath} (${fragResponse.status})`);

            const vertexShader = await vertResponse.text();
            const fragmentShader = await fragResponse.text();

            const shaderCode = { vertexShader, fragmentShader };
            this.shaderCache.set(shaderName, shaderCode); // Cache the loaded code
            return shaderCode;

        } catch (error) {
            console.error(`Error loading shader ${shaderName}:`, error);
            throw error; // Re-throw to be caught by the caller
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
        // Key for caching could include shaderName and relevant uniform keys/values if needed
        // const cacheKey = `${shaderName}_${JSON.stringify(userUniforms)}`; // Example complex key
        // if (this.materialCache.has(cacheKey)) { return this.materialCache.get(cacheKey); }

        try {
            const { vertexShader, fragmentShader } = await this.loadShaderCode(shaderName);

            // Define standard uniforms required by most shaders
            const standardUniforms = {
                // Matrices (provided by Three.js)
                // modelViewMatrix, projectionMatrix, normalMatrix, modelMatrix, cameraPosition

                // Lighting (provide defaults, override with userUniforms if present)
                 uLightDirection: { value: userUniforms.lightDirection || new THREE.Vector3(1, 1, 1).normalize() },
                 uLightColor: { value: userUniforms.lightColor || new THREE.Color(0xffffff) },
                 uAmbientLightColor: { value: userUniforms.ambientLightColor || new THREE.Color(0x404040) }, // Base ambient

                // Basic color handling
                 uBaseColor: { value: new THREE.Color(0xffffff) }, // Default white
                 uUseSolidColor: { value: true }, // Default to using uBaseColor

                // Specific Shader Uniforms (with defaults)
                // Toon
                uOutlineColor: { value: new THREE.Color(0x000000) },
                uOutlineThickness: { value: 0.02 }, // Relative thickness factor
                uNumSteps: { value: 4 }, // Number of color steps for toon shading
                // uStepColors: { value: [new THREE.Color(0.2, 0.2, 0.2), new THREE.Color(0.5, 0.5, 0.5), new THREE.Color(0.8, 0.8, 0.8), new THREE.Color(1.0, 1.0, 1.0)] }, // Example steps

                // Metallic
                uRoughness: { value: 0.3 },
                uMetallic: { value: 0.8 },
                uEnvMap: { value: this.envMap }, // Use the loaded or fallback env map
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
             // Note: uStepColors would need special handling if passed from UI

            const material = new THREE.ShaderMaterial({
                uniforms: finalUniforms,
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                lights: false, // Set to false if handling lighting manually in shader
                vertexColors: false, // Start with false, will be enabled by ProteinVisualizer if needed
                side: isMesh ? THREE.FrontSide : THREE.DoubleSide, // Render both sides for lines/flat geometry? FrontSide for solid meshes.
                 // blending: THREE.NormalBlending,
                 // transparent: true, // Set if shader uses transparency
                 // depthWrite: true,
            });

            // Optional: Cache the material instance
            // this.materialCache.set(cacheKey, material);

            return material;

        } catch (error) {
            console.error(`Failed to create material for shader ${shaderName}:`, error);
            // Return a fallback material?
            return new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true }); // Magenta wireframe error material
        }
    }
}

export default ShaderManager;
