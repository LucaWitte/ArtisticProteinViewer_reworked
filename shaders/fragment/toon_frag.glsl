// shaders/fragment/toon_frag.glsl
// Fragment Shader for Toon Shading with Outline

// Varyings
varying vec3 vNormal;       // Normal in view space
varying vec3 vViewPosition; // Position in view space (vector towards camera)
varying vec3 vColor;        // Vertex color

// Uniforms
uniform vec3 uBaseColor;        // Base color (used if uUseSolidColor is true)
uniform vec3 uLightDirection;   // Directional light direction (view space)
uniform vec3 uLightColor;       // Directional light color
uniform vec3 uAmbientLightColor;// Ambient light color

uniform float uNumSteps;        // Number of color steps (e.g., 4.0)
// uniform vec3 uStepColors[4]; // Alternatively pass array of step colors

uniform vec3 uOutlineColor;     // Color of the outline
uniform float uOutlineThickness;// Thickness factor for the outline (e.g., 0.02)

uniform bool uUseSolidColor;    // Use uBaseColor or vColor

void main() {
    // Normalize interpolated vectors
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    vec3 lightDir = normalize(uLightDirection);

    // --- 1. Calculate Toon Shading ---
    float diffuseIntensity = max(dot(normal, lightDir), 0.0);

    // Quantize the intensity into steps
    float stepIntensity = floor(diffuseIntensity * uNumSteps) / uNumSteps;

    // Simple mapping to brightness based on step (can be replaced with uStepColors lookup)
    vec3 toonLightColor = uAmbientLightColor + uLightColor * stepIntensity;

    // Determine object color
    vec3 objectColor = uUseSolidColor ? uBaseColor : vColor;
    vec3 shadedColor = objectColor * toonLightColor;

    // --- 2. Calculate Outline (using Fresnel-like effect) ---
    float fresnel = dot(normal, viewDir);
    // Sharpen the fresnel effect to get a rim highlight/outline
    fresnel = pow(1.0 - abs(fresnel), 3.0 + (1.0 - uOutlineThickness) * 10.0 ); // Adjust power based on thickness
    fresnel = smoothstep(0.1, 0.5, fresnel); // Control sharpness/falloff of the outline

    // Mix shaded color with outline color based on fresnel
    vec3 finalColor = mix(shadedColor, uOutlineColor, fresnel);

    gl_FragColor = vec4(finalColor, 1.0);

     // Optional: Gamma correction
     // gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(1.0/2.2));
}
