// js/main.js
import App from './core/App.js';

// Ensure the DOM is fully loaded before initializing the app
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('viewer-container');
    if (!container) {
        console.error("Viewer container not found!");
        return;
    }

    const app = new App(container);
    app.init();

    // Make app accessible globally for debugging if needed
    // window.app = app;
});
