
import { initFileUploader } from './fileUploader.js';

export function initControlPanel(renderer, shaderManager) {
    const panel = document.createElement('div');
    panel.id = 'control-panel';
    panel.style.cssText = `
        position: absolute; top: 10px; right: 10px; width: 300px; background: rgba(0,0,0,0.7);
        color: white; padding: 10px; border-radius: 5px; font-family: Arial;
    `;
    panel.innerHTML = `
        <h2>Controls</h2>
        <div class="section">
            <h3>Representation</h3>
            <button id="ballStick">Ball & Stick</button>
            <button id="cartoon">Cartoon</button>
            <button id="surface">Surface</button>
        </div>
        <div class="section">
            <h3>Shaders</h3>
            <select id="shaderSelect"></select>
        </div>
        <div class="section">
            <h3>Camera</h3>
            <button id="resetCamera">Reset Camera</button>
        </div>
        <div class="section">
            <h3>Export</h3>
            <button id="exportImage">Export Image</button>
        </div>
    `;
    document.body.appendChild(panel);

    let proteinData = null;

    // Event listeners
    document.getElementById('ballStick').addEventListener('click', () => {
        if (proteinData) renderer.renderBallAndStick(proteinData);
    });
    document.getElementById('cartoon').addEventListener('click', () => {
        if (proteinData) renderer.renderCartoon(proteinData);
    });
    document.getElementById('surface').addEventListener('click', () => {
        if (proteinData) renderer.renderSurface(proteinData);
    });
    document.getElementById('resetCamera').addEventListener('click', () => {
        if (proteinData) renderer.fitToView(proteinData);
    });
    document.getElementById('exportImage').addEventListener('click', () => {
        renderer.renderer.domElement.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'protein_visualization.png';
            a.click();
            URL.revokeObjectURL(url);
        });
    });

    const shaderSelect = document.getElementById('shaderSelect');
    Object.keys(shaderManager.shaders).forEach(shader => {
        const option = document.createElement('option');
        option.value = shader;
        option.textContent = shader;
        shaderSelect.appendChild(option);
    });
    shaderSelect.addEventListener('change', () => {
        if (renderer.currentRepresentation && renderer.currentRepresentation.children[0]) {
            shaderManager.applyShader(shaderSelect.value, renderer.currentRepresentation.children[0]);
        }
    });

    // Tutorial
    const tutorial = document.createElement('div');
    tutorial.style.cssText = 'position: absolute; bottom: 10px; left: 10px; color: white;';
    tutorial.innerHTML = '<p>Welcome! Upload a PDB file and use the controls to explore the protein.</p>';
    document.body.appendChild(tutorial);

    // Initialize file uploader
    initFileUploader(data => {
        proteinData = data;
        renderer.renderBallAndStick(data);
    });
}
