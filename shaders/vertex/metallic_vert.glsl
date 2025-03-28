// shaders/vertex/metallic_vert.glsl
// Vertex Shader for Metallic Shading (using Environment Map)

// Varyings
varying vec3 vNormal;       // Normal in view space
varying vec3 vViewPosition; // Position in view space (vector from vertex to camera)
varying vec3 vWorldPosition; // Position in world space
varying vec3 vWorldNormal;   // Normal in world space
varying vec3 vColor;        // Vertex color

// Attributes
attribute vec3 color;

void main() {
    // World position
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    // View position (vector from vertex to camera)
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -viewPosition.xyz;

    // View normal
    vNormal = normalize(normalMatrix * normal);

    // World normal (needed for reflection calculation relative to world env map)
    // Transforming normal with modelMatrix might require inverse transpose for non-uniform scaling
    // Using normalMatrix assumes view space env map, which is complex. World space is easier.
    mat3 worldNormalMatrix = transpose(inverse(mat3(modelMatrix)));
    vWorldNormal = normalize(worldNormalMatrix * normal);


    // Vertex color
    #ifdef USE_COLOR
        vColor = color;
    #else
        vColor = vec3(1.0);
    #endif

    // Final clip space position
    gl_Position = projectionMatrix * viewPosition;
}
