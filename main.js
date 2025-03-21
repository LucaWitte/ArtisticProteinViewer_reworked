import { ProteinRenderer } from './components/visualization/proteinRenderer.js';
import { ShaderManager } from './utils/shaderManager.js';
import { initControlPanel } from './components/ui/controlPanel.js';

const container = document.getElementById('container');
if (!container) {
    console.error('Container element not found');
} else {
    const renderer = new ProteinRenderer(container);
    const shaderManager = new ShaderManager();
    initControlPanel(renderer, shaderManager);
}
