// js/core/App.js
import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { PDBLoader } from '../vendor/PDBLoader.js';
import ProteinLoader from './ProteinLoader.js';
import ProteinVisualizer from './ProteinVisualizer.js';
import ShaderManager from './ShaderManager.js';
import Controls from '../ui/Controls.js';
import Exporter from '../utils/Exporter.js';

class App {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.orbitControls = null;
        this.clock = new THREE.Clock();

        this.proteinData = null;
        this.proteinObject = null; // The current THREE object representing the protein
        this.currentRepresentation = 'lines'; // Initial representation
        this.currentShaderName = 'base'; // Initial shader
        this.currentColorMode = 'chain'; // Initial coloring mode
        this.currentSolidColor = '#ffffff';

        // Core Modules
        this.shaderManager = new ShaderManager();
        this.proteinLoader = new ProteinLoader(this.shaderManager); // Pass ShaderManager if needed early
        this.proteinVisualizer = new ProteinVisualizer(this.shaderManager);
        this.exporter = new Exporter();

        // UI - Pass 'this' app instance for callbacks
        this.controls = new Controls(this);

        // Bind methods that will be used as callbacks
        this.animate = this.animate.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
        this.handlePDBLoaded = this.handlePDBLoaded.bind(this);
        this.handlePDBLoadError = this.handlePDBLoadError.bind(this);
    }

    init() {
        console.log("Initializing App...");
        this.setupScene();
        this.setupRenderer();
        this.setupCamera();
        this.setupLights();
        this.setupControls();
        this.setupEventListeners();

        // Add renderer DOM element to the container
        this.container.appendChild(this.renderer.domElement);

        // Initialize UI controls via the Controls module
        this.controls.initUI();
        this.setBackgroundColor(this.controls.params.backgroundColor); // Set initial background

        // Load default example on startup
        // this.loadPDBExample(this.controls.params.examplePDB); // Load the default selected example

        // Start the animation loop
        this.animate();
        console.log("App Initialized.");

        // Trigger loading of the default example after a short delay to ensure UI is ready
        // setTimeout(() => this.loadPDBExample(this.controls.params.examplePDB), 100);
        // Or load a specific one to start
         setTimeout(() => this.loadPDBExample('assets/pdb/example1.pdb'), 100);
    }

    setupScene() {
        this.scene = new THREE.Scene();
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true // Needed for screenshot export
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        // this.renderer.outputEncoding = THREE.sRGBEncoding; // Manage color space if needed
    }

    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        this.camera.position.z = 50; // Adjust initial camera distance
        this.scene.add(this.camera); // Add camera to scene (needed for some effects/controls)
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Soft white light
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1).normalize();
        this.scene.add(directionalLight);
        // Store lights if needed for shader uniforms
        this.lights = { ambient: ambientLight, directional: directionalLight };
    }

    setupControls() {
        this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
        this.orbitControls.enableDamping = true; // Smooth camera movement
        this.orbitControls.dampingFactor = 0.1;
        this.orbitControls.screenSpacePanning = true; // Allow panning across the screen
    }

    setupEventListeners() {
        window.addEventListener('resize', this.onWindowResize, false);
    }

    animate() {
        requestAnimationFrame(this.animate);
        const delta = this.clock.getDelta();

        // Update controls
        this.orbitControls.update(delta);

        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    showLoading(show) {
        const indicator = document.getElementById('loading-indicator');
        if (indicator) {
            indicator.style.display = show ? 'flex' : 'none';
        }
    }

    // --- PDB Loading ---
    async loadPDBFile(file) {
        if (!file) return;
        this.showLoading(true);
        try {
            const pdbData = await this.proteinLoader.loadFromFile(file);
            this.handlePDBLoaded(pdbData);
        } catch (error) {
            this.handlePDBLoadError(error);
        } finally {
            this.showLoading(false);
        }
    }

    async loadPDBExample(url) {
        if (!url) return;
        this.showLoading(true);
        console.log(`Loading example: ${url}`);
        try {
            const pdbData = await this.proteinLoader.loadExample(url);
            this.handlePDBLoaded(pdbData);
        } catch (error) {
            this.handlePDBLoadError(error);
        } finally {
            this.showLoading(false);
        }
    }

    handlePDBLoaded(pdbData) {
        console.log("PDB data loaded and processed:", pdbData);
        this.proteinData = pdbData;
        // Reset camera focus? Maybe later.
        // Trigger visualization with current settings
        this.visualizeProtein();
    }

    handlePDBLoadError(error) {
        console.error("Failed to load PDB:", error);
        alert(`Error loading PDB file: ${error.message || error}`);
        this.showLoading(false);
    }

    // --- Visualization Control ---

    disposeProteinObject() {
        if (this.proteinObject) {
            this.scene.remove(this.proteinObject);
            this.proteinVisualizer.disposeRepresentation(this.proteinObject); // Delegate disposal
            this.proteinObject = null;
        }
    }

    async visualizeProtein() {
        if (!this.proteinData) {
            console.warn("No protein data loaded to visualize.");
            return;
        }
        this.showLoading(true);
        this.disposeProteinObject(); // Clean up previous object

        try {
            console.log(`Visualizing with Rep: ${this.currentRepresentation}, Shader: ${this.currentShaderName}, Color: ${this.currentColorMode}`);

            // Prepare shader parameters based on current UI state (from Controls.params)
            const shaderParams = this.controls.getCurrentShaderParams();

            // Add light info to shader params
            shaderParams.lightDirection = this.lights.directional.position.clone();
            shaderParams.lightColor = this.lights.directional.color.clone();
            shaderParams.ambientLightColor = this.lights.ambient.color.clone().multiplyScalar(this.lights.ambient.intensity);


            // Create the new representation
            this.proteinObject = await this.proteinVisualizer.createRepresentation(
                this.proteinData,
                this.currentRepresentation,
                this.currentShaderName,
                shaderParams // Pass combined parameters
            );

            if (this.proteinObject) {
                // Apply initial coloring *after* the object is created
                if (this.currentColorMode === 'chain') {
                    this.proteinVisualizer.setColorMode(this.proteinObject, 'chain', this.proteinData);
                } else {
                    this.proteinVisualizer.setColorMode(this.proteinObject, 'solid', null, this.currentSolidColor);
                }

                this.scene.add(this.proteinObject);
                console.log("Protein visualization added to scene.");

                // Optional: Adjust camera to fit the new object
                this.focusCameraOnObject(this.proteinObject);

            } else {
                console.warn("Protein visualizer did not return an object.");
            }
        } catch (error) {
            console.error("Error during visualization:", error);
            alert(`Error creating visualization: ${error.message || error}`);
        } finally {
            this.showLoading(false);
        }
    }

    focusCameraOnObject(object) {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 1.5; // Add some padding

        this.camera.position.set(center.x, center.y, center.z + cameraZ);
        this.camera.lookAt(center);
        this.orbitControls.target.copy(center);
        this.orbitControls.update();
    }


    setRepresentation(type) {
        if (type === this.currentRepresentation) return; // No change
        console.log("Setting representation:", type);
        this.currentRepresentation = type;
        this.visualizeProtein(); // Re-visualize with the new representation
    }

    setActiveShader(shaderName) {
        if (shaderName === this.currentShaderName) return; // No change
        console.log("Setting active shader:", shaderName);
        this.currentShaderName = shaderName;
         // Re-visualize completely to ensure correct geometry/material setup if needed
         // Optimization: Could potentially just swap materials if geometry is compatible
        this.visualizeProtein();
    }

    updateShaderUniforms(uniformUpdates) {
        if (!this.proteinObject || !this.proteinObject.material || !this.proteinObject.material.uniforms) {
            // console.warn("Cannot update uniforms: No protein object or material found.");
            return;
        }

        const uniforms = this.proteinObject.material.uniforms;
        // console.log("Updating uniforms:", uniformUpdates);

        for (const key in uniformUpdates) {
            if (uniforms[key] !== undefined) {
                if (uniforms[key].value instanceof THREE.Color) {
                    // Handle THREE.Color uniforms
                    if (uniformUpdates[key] instanceof THREE.Color) {
                        uniforms[key].value.copy(uniformUpdates[key]);
                    } else {
                        // Assume hex string or number
                         try {
                             uniforms[key].value.set(uniformUpdates[key]);
                         } catch (e) {
                              console.warn(`Failed to set color uniform ${key} with value:`, uniformUpdates[key], e);
                         }
                    }
                } else if (uniforms[key].value instanceof THREE.Vector3) {
                    if (uniformUpdates[key] instanceof THREE.Vector3) {
                        uniforms[key].value.copy(uniformUpdates[key]);
                    } else {
                         console.warn(`Uniform ${key} is Vector3, but received:`, uniformUpdates[key]);
                    }
                }
                 else {
                    // Handle numeric, boolean, or other types
                    uniforms[key].value = uniformUpdates[key];
                }
            } else {
                // console.warn(`Uniform key "${key}" not found in material.`);
            }
        }
         this.proteinObject.material.needsUpdate = true; // Important for some uniform types
    }


    setColorMode(mode) {
        if (!this.proteinObject) return;
        console.log("Setting color mode:", mode);
        this.currentColorMode = mode;
        if (mode === 'chain') {
            this.proteinVisualizer.setColorMode(this.proteinObject, 'chain', this.proteinData);
        } else { // 'solid'
            this.proteinVisualizer.setColorMode(this.proteinObject, 'solid', null, this.currentSolidColor);
        }
    }

    setSolidColor(color) {
        console.log("Setting solid color:", color);
        this.currentSolidColor = color; // Store the color
        if (this.currentColorMode === 'solid') {
            if (!this.proteinObject) return;
             // Update directly if in solid mode
            this.proteinVisualizer.setColorMode(this.proteinObject, 'solid', null, this.currentSolidColor);
        }
        // If mode is 'chain', the color will be applied when switching back to 'solid'
    }


    setBackgroundColor(color) {
        console.log("Setting background color:", color);
        this.renderer.setClearColor(color);
    }

    // --- Export ---
    exportImage(multiplier = 1) {
        console.log(`Exporting image with multiplier: ${multiplier}`);
        if (!this.renderer || !this.scene || !this.camera) {
            console.error("Cannot export: Renderer, scene, or camera not ready.");
            return;
        }
        const width = this.container.clientWidth * multiplier;
        const height = this.container.clientHeight * multiplier;

        try {
            this.exporter.exportPNG(this.renderer, this.scene, this.camera, width, height);
            console.log("Export successful.");
        } catch (error) {
            console.error("Export failed:", error);
            alert(`Failed to export image: ${error.message || error}`);
        }
    }
}

export default App;
