// main.js
import { ProteinRenderer } from './components/visualization/proteinRenderer.js';
import { ShaderManager } from './utils/shaderManager.js';
import { initControlPanel } from './components/ui/controlPanel.js';

// Get the container element from the HTML
const container = document.getElementById('container');

// Initialize the renderer, shader manager, and control panel
const renderer = new ProteinRenderer(container);
const shaderManager = new ShaderManager();
initControlPanel(renderer, shaderManager);
