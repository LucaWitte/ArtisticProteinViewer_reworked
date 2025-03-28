// shaders/vertex/toon_vert.glsl
// Vertex Shader for Toon Shading

// Varyings
varying vec3 vNormal;       // Normal in view space
varying vec3 vViewPosition; // Position in view space (vector from vertex to camera)
varying vec3 vColor;        // Vertex color

// Attributes
attribute vec3 color;

void main() {
    // Calculate view position (vector from vertex to camera)
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -viewPosition.xyz; // Vector pointing towards camera

    // Transform normal to view space
    vNormal = normalize(normalMatrix * normal);

    // Pass vertex color
    #ifdef USE_COLOR
        vColor = color;
    #else
        vColor = vec3(1.0); // Default white
    #endif

    // Final vertex position
    gl_Position = projectionMatrix * viewPosition;
}
