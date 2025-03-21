import { ProteinRenderer } from './components/visualization/proteinRenderer.js';
import { ShaderManager } from './utils/shaderManager.js';
import { initControlPanel } from './components/ui/controlPanel.js';

const container = document.createElement('div');
container.style.cssText = 'width: 100vw; height: 100vh;';
document.body.appendChild(container);

const renderer = new ProteinRenderer(container);
const shaderManager = new ShaderManager(renderer.renderer);
initControlPanel(renderer, shaderManager);
