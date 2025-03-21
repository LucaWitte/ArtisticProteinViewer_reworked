export function initControlPanel(renderer, shaderManager) {
    const button = document.createElement('button');
    button.textContent = 'Apply Neon Glow';
    button.style.position = 'absolute';
    button.style.top = '10px';
    button.style.left = '10px';
    document.body.appendChild(button);

    button.addEventListener('click', () => {
        if (renderer.currentRepresentation) {
            shaderManager.applyShader('neonGlow', renderer.currentRepresentation);
        } else {
            console.log('No representation to apply shader to.');
        }
    });
}
