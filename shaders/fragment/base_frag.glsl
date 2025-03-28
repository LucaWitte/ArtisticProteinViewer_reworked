// shaders/fragment/base_frag.glsl
// Basic Fragment Shader (Lambertian + Ambient)

// Varyings received from vertex shader
varying vec3 vNormal;       // Normal in view space (interpolated)
varying vec3 vViewPosition; // Position in view space (interpolated)
varying vec3 vColor;        // Vertex color (interpolated)

// Uniforms provided by the application
uniform vec3 uBaseColor;        // Base color for the material
uniform vec3 uLightDirection;   // Direction of the directional light (in view space)
uniform vec3 uLightColor;       // Color of the directional light
uniform vec3 uAmbientLightColor;// Color and intensity of ambient light

uniform bool uUseSolidColor; // Flag to indicate if using solid color or vertex color

void main() {
    // Normalize varying vectors (important due to interpolation)
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(uLightDirection); // Assuming light direction is already in view space

    // Calculate Lambertian diffuse term
    float diffuseIntensity = max(dot(normal, lightDir), 0.0);
    vec3 diffuseColor = uLightColor * diffuseIntensity;

    // Combine ambient and diffuse lighting
    vec3 totalLight = uAmbientLightColor + diffuseColor;

    // Determine final object color
    vec3 objectColor = uUseSolidColor ? uBaseColor : vColor;

    // Final color = object color modulated by lighting
    vec4 finalColor = vec4(objectColor * totalLight, 1.0);

    gl_FragColor = finalColor;

    // Optional: Gamma correction (if renderer outputEncoding is not sRGB)
    // gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(1.0/2.2));
}
