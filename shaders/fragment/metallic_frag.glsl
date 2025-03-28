// shaders/fragment/metallic_frag.glsl
// Fragment Shader for Metallic Shading (Simplified PBR-like)

// Varyings
varying vec3 vNormal;       // Normal in view space
varying vec3 vViewPosition; // Vector towards camera (view space)
varying vec3 vWorldPosition;// World space position
varying vec3 vWorldNormal;   // World space normal
varying vec3 vColor;        // Vertex color

// Uniforms
uniform vec3 uBaseColor;        // Base color / Albedo
uniform float uRoughness;       // Roughness factor (0=smooth, 1=rough)
uniform float uMetallic;        // Metallic factor (0=dielectric, 1=metal)

uniform samplerCube uEnvMap;    // Environment map (Cube map assumed here)
// If using Equirectangular: uniform sampler2D uEnvMap;

uniform vec3 cameraPosition;    // Camera position in world space

uniform vec3 uLightDirection;   // Directional light (view space)
uniform vec3 uLightColor;       // Light color
uniform vec3 uAmbientLightColor;// Ambient color

uniform bool uUseSolidColor;    // Use uBaseColor or vColor

// Helper function for equirectangular mapping if needed
// const vec2 invAtan = vec2(0.1591, 0.3183);
// vec2 SampleEquirectangular(vec3 dir) {
//     vec2 uv = vec2(atan(dir.z, dir.x), asin(dir.y));
//     uv *= invAtan;
//     uv += 0.5;
//     return uv;
// }

void main() {
    // Normalize interpolated vectors
    vec3 normalView = normalize(vNormal); // Normal in view space for lighting
    vec3 normalWorld = normalize(vWorldNormal); // Normal in world space for reflection
    vec3 viewDirWorld = normalize(cameraPosition - vWorldPosition); // View direction in world space

    // Determine base object color
    vec3 objectBaseColor = uUseSolidColor ? uBaseColor : vColor;

    // --- Calculate Reflection ---
    // Reflection vector in world space
    vec3 reflectVecWorld = reflect(-viewDirWorld, normalWorld);

    // Sample environment map
    // Add roughness effect by adjusting LOD (requires derivatives or manual LOD)
    // Simple approximation: Mix reflection with blurred version or just reduce intensity
    float roughnessFactor = uRoughness * uRoughness; // Square roughness for perceptual linearity
    // float lod = roughnessFactor * 8.0; // Max LOD level (adjust based on env map size)
    // vec4 envColor = textureCubeLodEXT(uEnvMap, reflectVecWorld, lod); // Requires GL_EXT_shader_texture_lod
    vec4 envColor = textureCube(uEnvMap, reflectVecWorld); // Basic sampling


    // --- Calculate Lighting (Diffuse only for simplicity) ---
    vec3 lightDirView = normalize(uLightDirection); // Assume light dir is in view space
    float diffuseIntensity = max(dot(normalView, lightDirView), 0.0);
    vec3 diffuseLight = uLightColor * diffuseIntensity;
    vec3 directLight = uAmbientLightColor + diffuseLight;

    // --- Combine using Metallic/Roughness ---
    // Fresnel (Schlick approximation) - determines reflection amount based on view angle
    // F0 for dielectrics (~0.04), F0 for metals is their base color
    vec3 F0 = mix(vec3(0.04), objectBaseColor, uMetallic);
    float NdotV = max(dot(normalWorld, viewDirWorld), 0.0);
    vec3 fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

    // Diffuse contribution (only for non-metallic parts)
    vec3 diffuseContrib = directLight * objectBaseColor * (1.0 - uMetallic);

    // Specular/Reflection contribution
    // Modulate envColor by fresnel. For rough surfaces, reflection is dimmer and less saturated.
    vec3 specularContrib = mix(vec3(1.0), envColor.rgb, fresnel) * envColor.rgb; // Simplified blend
    specularContrib *= (1.0 - roughnessFactor * 0.8); // Dim reflection for roughness

    // Combine diffuse and specular
    vec3 finalColor = diffuseContrib + specularContrib * uMetallic; // Blend based on metallic value
    // Alternative: Lerp between diffuse and specular based on metallic
    // vec3 finalColor = mix(diffuseContrib, specularContrib, uMetallic);


    gl_FragColor = vec4(finalColor, 1.0);

    // Optional: Gamma correction
    // gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(1.0/2.2));
}
