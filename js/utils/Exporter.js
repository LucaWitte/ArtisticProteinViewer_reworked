// js/utils/Exporter.js
import { saveAs } from '../vendor/FileSaver.js'; // Assuming FileSaver.js exports 'saveAs'

class Exporter {
    /**
     * Exports the current renderer view as a PNG image.
     * @param {THREE.WebGLRenderer} renderer - The Three.js renderer instance.
     * @param {THREE.Scene} scene - The scene to render.
     * @param {THREE.Camera} camera - The camera to use.
     * @param {number} width - The desired width of the output image.
     * @param {number} height - The desired height of the output image.
     * @param {string} [filename='protein_render.png'] - The desired filename.
     */
    exportPNG(renderer, scene, camera, width, height, filename = 'protein_render.png') {
        // --- Input validation ---
        if (!renderer || !scene || !camera) {
            throw new Error("Renderer, Scene, or Camera is missing for export.");
        }
        if (width <= 0 || height <= 0) {
             throw new Error(`Invalid export dimensions: ${width}x${height}`);
        }

        // --- Store original state ---
        const originalSize = new THREE.Vector2();
        renderer.getSize(originalSize);
        const originalAspect = camera.aspect;
        // Note: We might not need to store/restore pixel ratio if we set it to 1 for export
        // const originalPixelRatio = renderer.getPixelRatio();

        // --- Prepare for high-resolution rendering ---
        try {
            // Update camera aspect ratio for the target dimensions
            camera.aspect = width / height;
            camera.updateProjectionMatrix();

            // Resize renderer (temporarily sets canvas size)
            // Set pixel ratio to 1 to ensure canvas buffer matches requested width/height exactly
            renderer.setPixelRatio(1);
            renderer.setSize(width, height, false); // false = don't update style

            // --- Render the scene ---
            // It might be necessary to render twice if artifacts appear, or manage render targets.
            // For simplicity, render directly to the canvas buffer.
            renderer.render(scene, camera);

            // --- Get image data ---
            const dataURL = renderer.domElement.toDataURL('image/png');

            // --- Trigger download using FileSaver.js ---
            if (typeof saveAs === 'function') {
                saveAs(dataURL, filename);
            } else {
                 // Fallback if FileSaver isn't available (e.g., open in new tab)
                 console.warn("FileSaver.js not found. Opening image in new tab as fallback.");
                 const img = new Image();
                 img.src = dataURL;
                 const newWindow = window.open("");
                 if (newWindow) {
                     newWindow.document.write(img.outerHTML);
                 } else {
                     throw new Error("Could not trigger download or open image in new window.");
                 }
            }

        } catch (error) {
             console.error("Error during PNG export process:", error);
             // Re-throw the error to be caught by the caller (App.js)
             throw error;
        } finally {
            // --- Restore original state ---
            // Restore renderer size and pixel ratio (important!)
            renderer.setPixelRatio(window.devicePixelRatio); // Restore device pixel ratio
            renderer.setSize(originalSize.width, originalSize.height, false);

            // Restore camera aspect ratio
            camera.aspect = originalAspect;
            camera.updateProjectionMatrix();

            console.log("Renderer and camera restored to original state after export.");
        }
    }
}

export default Exporter;
