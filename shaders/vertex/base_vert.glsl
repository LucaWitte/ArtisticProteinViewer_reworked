// shaders/vertex/base_vert.glsl
// Basic Vertex Shader

// Varyings to pass to fragment shader
varying vec3 vNormal;       // Normal in view space
varying vec3 vViewPosition; // Position in view space
varying vec3 vWorldPosition; // Position in world space
varying vec3 vColor;        // Vertex color (if available)

// Attributes from geometry
attribute vec3 color; // Receive vertex color attribute

void main() {
    // Calculate world position
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    // Calculate view position (vector from vertex to camera)
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -viewPosition.xyz; // Vector pointing towards camera

    // Transform normal to view space
    vNormal = normalize(normalMatrix * normal);

    // Pass vertex color if it exists
    #ifdef USE_COLOR
        vColor = color;
    #else
        vColor = vec3(1.0, 1.0, 1.0); // Default to white if no color attribute
    #endif

    // Final vertex position in clip space
    gl_Position = projectionMatrix * viewPosition;
}
