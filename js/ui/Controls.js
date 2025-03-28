// js/ui/Controls.js
const GUI = dat.GUI;

class Controls {
    constructor(app) {
        this.app = app; // Reference to the main application instance
        this.gui = new GUI({ autoPlace: true }); // Create GUI
        document.getElementById('ui-controls').appendChild(this.gui.domElement); // Attach GUI to our div

        // Define default parameters and state
        this.params = {
            // Loading
            pdbFile: '', // Placeholder for file input state
            examplePDB: 'assets/pdb/example1.pdb', // Default example
            loadExampleTrigger: () => this.app.loadPDBExample(this.params.examplePDB), // Function for example button
            uploadTrigger: () => document.getElementById('pdbInput').click(), // Function for upload button

            // Display
            representation: 'cartoon', // Default representation
            backgroundColor: '#282c34', // Default background

            // Shading
            shader: 'base',      // Default shader
            coloring: 'chain',   // Default coloring mode
            solidColor: '#00ff00', // Default solid color (green)

            // --- Shader Parameters (match uniforms in ShaderManager/GLSL) ---
            // Base
            base_baseColor: '#ffffff',

            // Toon
            toon_outlineColor: '#000000',
            toon_outlineThickness: 0.02, // Adjust range as needed
            toon_numSteps: 4,           // Integer steps

            // Metallic
            metallic_baseColor: '#c0c0c0', // Silver-ish default
            metallic_roughness: 0.3,    // 0 (smooth) to 1 (rough)
            metallic_metallic: 0.9,     // 0 (dielectric) to 1 (metallic)

            // Export
            exportMultiplier: 2, // Default export scale
            exportTrigger: () => this.app.exportImage(this.params.exportMultiplier), // Function for export button
        };

         // Store references to folders/controllers if dynamic updates are needed
         this.shaderParamFolders = {};
         this.solidColorController = null;
         this.representationController = null;
         this.shaderController = null;
         this.coloringController = null;
    }

    initUI() {
        // --- Loading Folder ---
        const loadFolder = this.gui.addFolder('Load Protein');
        // File Upload Button (triggers hidden input)
        loadFolder.add(this.params, 'uploadTrigger').name('Upload PDB File');
        // Example Selector
        const exampleOptions = {
            "Example 1 (1CRN)": "assets/pdb/example1.pdb", // Replace with actual filenames/descriptions
            "Example 2 (2HHB)": "assets/pdb/example2.pdb",
            "Example 3 (1BNA)": "assets/pdb/example3.pdb",
            // Add more examples here
        };
        loadFolder.add(this.params, 'examplePDB', exampleOptions).name('Load Example');
        loadFolder.add(this.params, 'loadExampleTrigger').name('Load Selected Example');
        // loadFolder.open(); // Keep open by default

        // --- Display Folder ---
        const displayFolder = this.gui.addFolder('Display Options');
        this.representationController = displayFolder.add(this.params, 'representation', ['lines', 'cartoon'])
            .name('Representation')
            .onChange(value => {
                this.app.setRepresentation(value);
                this.updateShaderParamVisibility(); // Representation might affect shader params (e.g., lines vs mesh)
            });
        displayFolder.addColor(this.params, 'backgroundColor')
            .name('Background')
            .onChange(value => this.app.setBackgroundColor(value));
        displayFolder.open();

        // --- Shading Folder ---
        const shadingFolder = this.gui.addFolder('Shading Style');
        this.shaderController = shadingFolder.add(this.params, 'shader', ['base', 'toon', 'metallic'])
            .name('Shader Style')
            .onChange(value => {
                 this.app.setActiveShader(value);
                 this.updateShaderParamVisibility(); // Show/hide correct params
            });
         this.coloringController = shadingFolder.add(this.params, 'coloring', ['chain', 'solid'])
            .name('Coloring Mode')
            .onChange(value => this.handleColoringChange(value));

         // Add solid color picker, initially hidden if default is 'chain'
         this.solidColorController = shadingFolder.addColor(this.params, 'solidColor')
             .name('Solid Color')
             .onChange(value => this.app.setSolidColor(value));

        shadingFolder.open();


        // --- Shader Parameters Folders (Initially Hidden/Shown based on default) ---
        this.shaderParamFolders.base = this.gui.addFolder('Base Shader Params');
        this.shaderParamFolders.base.addColor(this.params, 'base_baseColor').name('Color')
            .onChange(() => this.updateShaderParams('base'));

        this.shaderParamFolders.toon = this.gui.addFolder('Toon Shader Params');
        this.shaderParamFolders.toon.addColor(this.params, 'toon_outlineColor').name('Outline Color')
             .onChange(() => this.updateShaderParams('toon'));
        this.shaderParamFolders.toon.add(this.params, 'toon_outlineThickness', 0.0, 0.1, 0.005).name('Outline Thickness')
             .onChange(() => this.updateShaderParams('toon'));
        this.shaderParamFolders.toon.add(this.params, 'toon_numSteps', 2, 10, 1).name('Color Steps')
             .onChange(() => this.updateShaderParams('toon'));

        this.shaderParamFolders.metallic = this.gui.addFolder('Metallic Shader Params');
        this.shaderParamFolders.metallic.addColor(this.params, 'metallic_baseColor').name('Base Color')
             .onChange(() => this.updateShaderParams('metallic'));
        this.shaderParamFolders.metallic.add(this.params, 'metallic_roughness', 0.0, 1.0, 0.01).name('Roughness')
             .onChange(() => this.updateShaderParams('metallic'));
        this.shaderParamFolders.metallic.add(this.params, 'metallic_metallic', 0.0, 1.0, 0.01).name('Metallic')
             .onChange(() => this.updateShaderParams('metallic'));


        // --- Export Folder ---
        const exportFolder = this.gui.addFolder('Export Image');
        exportFolder.add(this.params, 'exportMultiplier', { '1x': 1, '2x': 2, '4x': 4 }).name('Resolution Scale');
        exportFolder.add(this.params, 'exportTrigger').name('Export as PNG');

        // --- Initial State ---
        this.updateShaderParamVisibility(); // Hide inactive shader folders initially
        this.handleColoringChange(this.params.coloring); // Set initial visibility of solid color picker
        this.setupFileInputListener(); // Setup listener for the actual file input

        console.log("dat.GUI initialized.");
    }

     // Add listener to the hidden file input
     setupFileInputListener() {
         const fileInput = document.getElementById('pdbInput');
         if (fileInput) {
             fileInput.addEventListener('change', (event) => {
                 const file = event.target.files[0];
                 if (file) {
                     this.app.loadPDBFile(file);
                     // Reset input value to allow loading the same file again
                     event.target.value = null;
                 }
             }, false);
         } else {
             console.error("File input element #pdbInput not found.");
         }
     }

    // Show/Hide Shader Parameter Folders
    updateShaderParamVisibility() {
        const activeShader = this.params.shader;
        for (const shaderName in this.shaderParamFolders) {
            const folder = this.shaderParamFolders[shaderName];
            if (shaderName === activeShader) {
                folder.open(); // Or just ensure it's visible: folder.domElement.style.display = '';
                folder.domElement.parentElement.style.display = '';

            } else {
                 folder.close(); // Or hide completely: folder.domElement.style.display = 'none';
                 folder.domElement.parentElement.style.display = 'none';
            }
        }
         // Also update visibility of solid color picker based on coloring mode
         this.handleColoringChange(this.params.coloring);
    }


     handleColoringChange(mode) {
         this.app.setColorMode(mode);
         // Show/hide solid color picker
         if (this.solidColorController) {
             const displayStyle = (mode === 'solid') ? '' : 'none';
             // Access the controller's list item element to hide/show
             this.solidColorController.domElement.parentElement.parentElement.style.display = displayStyle;
         }
     }

    // Collect current parameters for the active shader and send to App
    updateShaderParams(shaderPrefix) {
         // Ensure we only update if the correct shader is active
         if (this.params.shader !== shaderPrefix) return;

         const uniformUpdates = this.getCurrentShaderParams();
         this.app.updateShaderUniforms(uniformUpdates);
    }

    // Helper to gather parameters for the currently active shader
    getCurrentShaderParams() {
        const activeShader = this.params.shader;
        const paramsToUpdate = {};

        switch (activeShader) {
            case 'base':
                paramsToUpdate.uBaseColor = this.params.base_baseColor;
                break;
            case 'toon':
                paramsToUpdate.uOutlineColor = this.params.toon_outlineColor;
                paramsToUpdate.uOutlineThickness = this.params.toon_outlineThickness;
                paramsToUpdate.uNumSteps = this.params.toon_numSteps;
                // Base color might still be relevant for toon, depending on shader logic
                paramsToUpdate.uBaseColor = this.params.coloring === 'solid' ? this.params.solidColor : '#ffffff'; // Use solid color or white if chain colored
                break;
            case 'metallic':
                paramsToUpdate.uBaseColor = this.params.metallic_baseColor; // Metallic uses its own base color
                paramsToUpdate.uRoughness = this.params.metallic_roughness;
                paramsToUpdate.uMetallic = this.params.metallic_metallic;
                 // Override uBaseColor if solid coloring is active *and* metallic shader should respect it (design choice)
                 if (this.params.coloring === 'solid') {
                    // Option 1: Metallic base color always overrides solid color
                     // paramsToUpdate.uBaseColor = this.params.metallic_baseColor;
                    // Option 2: Solid color overrides metallic base color when active
                     paramsToUpdate.uBaseColor = this.params.solidColor;
                 }

                break;
        }

         // Always include coloring mode info
         paramsToUpdate.uUseSolidColor = this.params.coloring === 'solid';
         if (paramsToUpdate.uUseSolidColor) {
             // If solid color mode, ensure the correct solid color is sent,
             // potentially overriding the shader's specific base color param.
             // This depends on how shaders are written (e.g., do they all use uBaseColor?).
             paramsToUpdate.uBaseColor = this.params.solidColor;
         }


        return paramsToUpdate;
    }
}

export default Controls;
