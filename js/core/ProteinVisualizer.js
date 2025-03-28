// js/core/ProteinVisualizer.js
import * as THREE from '../vendor/three.module.js';
import { CatmullRomCurve3, TubeGeometry, BufferGeometry, Float32BufferAttribute, LineSegments, Mesh } from '../vendor/three.module.js';
import ShaderManager from './ShaderManager.js'; // Only needed if accessing methods directly

// Simple chain color palette (expandable)
const chainColors = [
    0x1f77b4, 0xff7f0e, 0x2ca02c, 0xd62728, 0x9467bd,
    0x8c564b, 0xe377c2, 0x7f7f7f, 0xbcbd22, 0x17becf,
    // Add more colors if needed
    0xaec7e8, 0xffbb78, 0x98df8a, 0xff9896, 0xc5b0d5,
    0xc49c94, 0xf7b6d2, 0xc7c7c7, 0xdbdb8d, 0x9edae5
];

class ProteinVisualizer {
    constructor(shaderManager) {
        this.shaderManager = shaderManager; // Used to create materials
        this.chainColorMap = new Map(); // To assign consistent colors to chains
    }

    /**
     * Creates a 3D representation of the protein.
     * @param {object} pdbData - Processed data from ProteinLoader.
     * @param {string} representationType - 'lines' or 'cartoon'.
     * @param {string} shaderName - Name of the shader to use ('base', 'toon', 'metallic').
     * @param {object} shaderParams - Parameters/uniforms for the shader.
     * @returns {Promise<THREE.Object3D | null>} The created Three.js object or null on failure.
     */
    async createRepresentation(pdbData, representationType, shaderName, shaderParams) {
        if (!pdbData || !pdbData.atoms || pdbData.atoms.length === 0) {
            console.error("Cannot create representation: Invalid or empty PDB data.");
            return null;
        }

        let geometry = null;
        let objectType = Mesh; // Default to Mesh for cartoon

        try {
            switch (representationType.toLowerCase()) {
                case 'lines':
                    geometry = this.createLinesRepresentation(pdbData);
                    objectType = LineSegments; // Lines use LineSegments
                    break;
                case 'cartoon':
                    geometry = this.createCartoonRepresentation(pdbData);
                    objectType = Mesh;
                    break;
                default:
                    console.warn(`Unsupported representation type: ${representationType}. Defaulting to lines.`);
                    geometry = this.createLinesRepresentation(pdbData);
                    objectType = LineSegments;
            }

            if (!geometry) {
                throw new Error(`Geometry creation failed for type: ${representationType}`);
            }

             // Ensure normals are computed if it's a mesh (needed for lighting)
            if (objectType === Mesh) {
                // Check if geometry lacks normals attribute before computing
                 if (!geometry.attributes.normal) {
                    console.log("Computing vertex normals for cartoon geometry.");
                    geometry.computeVertexNormals();
                 }
            } else if (objectType === LineSegments) {
                // Lines don't typically use normals in the same way, but ensure shader compatibility
                // Add dummy normals if shader requires them? Or adjust shader.
                // For simplicity, base/toon/metallic shaders might look odd on lines without mesh geometry.
            }


            // Create the material using ShaderManager
            // Ensure default uniforms are included/handled by ShaderManager or App
            const material = await this.shaderManager.createMaterial(shaderName, shaderParams, objectType === Mesh);

            if (!material) {
                throw new Error(`Material creation failed for shader: ${shaderName}`);
            }

             // Set vertex colors flag if geometry has color attribute
             if (geometry.attributes.color) {
                material.vertexColors = true;
             }


            // Create the final Three.js object
            const proteinObject = new objectType(geometry, material);
            proteinObject.name = `protein_${representationType}_${shaderName}`; // For debugging

             // Store pdbData reference for coloring later if needed
             proteinObject.userData.pdbData = pdbData;


            return proteinObject;

        } catch (error) {
            console.error(`Error creating ${representationType} representation:`, error);
            // Clean up partially created geometry if necessary
            if (geometry) geometry.dispose();
            return null;
        }
    }

    /**
     * Creates a simple LineSegments representation (C-alpha trace).
     * @param {object} pdbData - Processed PDB data.
     * @returns {THREE.BufferGeometry | null}
     */
    createLinesRepresentation(pdbData) {
        const atoms = pdbData.atoms;
        const positions = [];
        const colors = [];
        const chains = {}; // Group CA atoms by chain

        // Group C-alpha atoms by chain ID
        atoms.forEach(atom => {
            if (atom.name === 'CA') { // Filter for Alpha Carbon atoms
                if (!chains[atom.chainID]) {
                    chains[atom.chainID] = [];
                }
                // Store atom with its sequence number for sorting
                chains[atom.chainID].push({ ...atom, resSeq: parseInt(atom.resSeq, 10) });
            }
        });

        // Generate chain colors if not already assigned
        this.assignChainColors(Object.keys(chains));

        // Process each chain
        for (const chainID in chains) {
            const chainAtoms = chains[chainID];
            // Sort atoms by residue sequence number
            chainAtoms.sort((a, b) => a.resSeq - b.resSeq);

            const chainColor = this.getChainColor(chainID);

            // Create line segments between consecutive C-alpha atoms within the chain
            for (let i = 0; i < chainAtoms.length - 1; i++) {
                const atom1 = chainAtoms[i];
                const atom2 = chainAtoms[i+1];

                 // Basic check for proximity - skip large gaps (might indicate breaks)
                 const dx = atom1.x - atom2.x;
                 const dy = atom1.y - atom2.y;
                 const dz = atom1.z - atom2.z;
                 const distSq = dx*dx + dy*dy + dz*dz;

                 // Heuristic: typical C-alpha distance is ~3.8 Angstroms. Skip if > ~5^2 = 25
                 if (distSq < 25.0) {
                    positions.push(atom1.x, atom1.y, atom1.z);
                    positions.push(atom2.x, atom2.y, atom2.z);

                    colors.push(chainColor.r, chainColor.g, chainColor.b);
                    colors.push(chainColor.r, chainColor.g, chainColor.b);
                 } else {
                     console.warn(`Skipping line segment in chain ${chainID} between res ${atom1.resSeq} and ${atom2.resSeq} due to large distance (${Math.sqrt(distSq).toFixed(2)} Å)`);
                 }
            }
        }

        if (positions.length === 0) {
            console.warn("No line segments generated for Lines representation.");
            return null;
        }

        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3)); // Add vertex colors

        return geometry;
    }

    /**
     * Creates a basic Cartoon representation (Tubes for loops/helices/sheets based on C-alpha).
     * This is a simplified MVP version.
     * @param {object} pdbData - Processed PDB data.
     * @returns {THREE.BufferGeometry | null}
     */
    createCartoonRepresentation(pdbData) {
        const atoms = pdbData.atoms;
        const helices = pdbData.helices;
        const sheets = pdbData.sheets;
        const combinedGeometry = new BufferGeometry(); // Will merge into this
        const geometries = []; // Array to hold individual tube geometries

        // 1. Group C-alpha atoms by chain and sort
        const chains = {};
        atoms.forEach(atom => {
            if (atom.name === 'CA') {
                if (!chains[atom.chainID]) {
                    chains[atom.chainID] = [];
                }
                chains[atom.chainID].push({ ...atom, resSeq: parseInt(atom.resSeq, 10) });
            }
        });
        // Generate chain colors
        this.assignChainColors(Object.keys(chains));


        // 2. Process each chain
        for (const chainID in chains) {
            const chainAtoms = chains[chainID];
            chainAtoms.sort((a, b) => a.resSeq - b.resSeq);
            if (chainAtoms.length < 2) continue; // Need at least 2 points for a path

            const chainColor = this.getChainColor(chainID);
            const points = chainAtoms.map(a => new THREE.Vector3(a.x, a.y, a.z));

            // 3. Define segments (Loop, Helix, Sheet) - Simplified approach
            // We'll create one continuous tube and rely on coloring/shader later if needed
            // More advanced: break path based on HELIX/SHEET records and use different Tube radii/shapes

            const curve = new CatmullRomCurve3(points, false, 'catmullrom', 0.5); // Smoothed curve

            // Determine number of segments based on curve length (heuristic)
            const curveLength = curve.getLength();
            const tubularSegments = Math.max(8, Math.floor(curveLength * 3)); // More segments for longer curves
            const radius = 0.3; // Default radius for tubes
            const radialSegments = 8; // Complexity of the tube cross-section

            const tubeGeometry = new TubeGeometry(curve, tubularSegments, radius, radialSegments, false);

            // Add color attribute based on chain
             const numVertices = tubeGeometry.attributes.position.count;
             const colors = new Float32Array(numVertices * 3);
             for (let i = 0; i < numVertices; i++) {
                 colors[i * 3 + 0] = chainColor.r;
                 colors[i * 3 + 1] = chainColor.g;
                 colors[i * 3 + 2] = chainColor.b;
             }
             tubeGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3));

            geometries.push(tubeGeometry);
        }

        if (geometries.length === 0) {
             console.warn("No geometries generated for Cartoon representation.");
             return null;
         }

        // 4. Merge geometries (if using BufferGeometryUtils, import it)
        // Manual merge for simplicity here (less efficient for many chains)
         try {
             // If BufferGeometryUtils is available (needs to be added to vendor)
             // import { BufferGeometryUtils } from '../vendor/BufferGeometryUtils.js'; // Adjust path
             // const mergedGeometry = BufferGeometryUtils.mergeBufferGeometries(geometries, true); // Use groups = true
             // return mergedGeometry;

             // Basic manual merge (less optimal, no groups):
             const positionArrays = [];
             const normalArrays = [];
             const colorArrays = [];
             let totalVertices = 0;

             geometries.forEach(geom => {
                 if (geom.attributes.position) positionArrays.push(geom.attributes.position.array);
                 if (geom.attributes.normal) normalArrays.push(geom.attributes.normal.array);
                 if (geom.attributes.color) colorArrays.push(geom.attributes.color.array);
                 totalVertices += geom.attributes.position.count;
                 geom.dispose(); // Dispose individual geometries after extracting data
             });

             const mergedPositions = new Float32Array(totalVertices * 3);
             const mergedNormals = new Float32Array(totalVertices * 3);
             const mergedColors = new Float32Array(totalVertices * 3);

             let offset = 0;
             for (let i = 0; i < positionArrays.length; i++) {
                 mergedPositions.set(positionArrays[i], offset * 3);
                 if (normalArrays[i]) mergedNormals.set(normalArrays[i], offset * 3);
                 if (colorArrays[i]) mergedColors.set(colorArrays[i], offset * 3);
                 offset += positionArrays[i].length / 3;
             }

             combinedGeometry.setAttribute('position', new Float32BufferAttribute(mergedPositions, 3));
             if (normalArrays.length > 0 && normalArrays.length === geometries.length) {
                combinedGeometry.setAttribute('normal', new Float32BufferAttribute(mergedNormals, 3));
             } else {
                 // If normals are missing from some parts, compute for the whole thing
                 combinedGeometry.computeVertexNormals();
             }
             if (colorArrays.length > 0 && colorArrays.length === geometries.length) {
                combinedGeometry.setAttribute('color', new Float32BufferAttribute(mergedColors, 3));
             }

             return combinedGeometry;

         } catch (e) {
             console.error("Error merging geometries:", e);
             // Cleanup intermediate geometries
             geometries.forEach(geom => geom.dispose());
             return null;
         }
    }


     /**
     * Applies coloring mode to the protein object.
     * @param {THREE.Object3D} proteinObject - The object to color.
     * @param {string} mode - 'chain' or 'solid'.
     * @param {object} [pdbData] - Required if mode is 'chain'.
     * @param {string|number} [solidColor] - Required if mode is 'solid'.
     */
     setColorMode(proteinObject, mode, pdbData = null, solidColor = '#ffffff') {
        if (!proteinObject || !proteinObject.geometry || !proteinObject.material) {
            console.warn("Cannot set color mode: Missing object, geometry, or material.");
            return;
        }

        const geometry = proteinObject.geometry;
        const material = proteinObject.material;

        if (mode === 'chain') {
            if (!pdbData || !pdbData.atoms) {
                console.warn("Cannot color by chain: Missing PDB data.");
                return;
            }
             if (!geometry.attributes.color) {
                console.warn("Cannot color by chain: Geometry is missing color attribute. Recreate representation with color.");
                 // Attempt to generate colors if missing (might be slow/complex depending on geometry type)
                 // This is difficult to do generically after merging/tubing. Best to generate during creation.
                 return;
             }

             // If colors were generated during creation, they should already be correct.
             // Ensure the material is using them.
             material.vertexColors = true;
             // Disable any solid color uniform that might interfere
             if (material.uniforms && material.uniforms.uUseSolidColor) {
                 material.uniforms.uUseSolidColor.value = false;
             }
             if (material.uniforms && material.uniforms.uBaseColor) {
                 // Set base color to white if using vertex colors, so vertex colors aren't tinted unexpectedly
                 material.uniforms.uBaseColor.value.set(0xffffff);
             }

             console.log("Applied chain coloring (using existing vertex colors).");

        } else if (mode === 'solid') {
             material.vertexColors = false; // Disable vertex colors

             // Enable solid color uniform if the shader supports it
             if (material.uniforms && material.uniforms.uUseSolidColor) {
                 material.uniforms.uUseSolidColor.value = true;
             }
             // Update the primary color uniform (assuming it's 'uBaseColor' or similar)
             if (material.uniforms && material.uniforms.uBaseColor) {
                 material.uniforms.uBaseColor.value.set(solidColor);
             } else {
                 console.warn("Solid color mode selected, but material has no 'uBaseColor' uniform.");
                 // Fallback: try setting material.color (only works for non-ShaderMaterials)
                 if (material.color) {
                     material.color.set(solidColor);
                 }
             }
             console.log("Applied solid color:", solidColor);
        }

        material.needsUpdate = true; // Important!
    }


    // --- Color Helpers ---

    assignChainColors(chainIDs) {
        // Ensure all unique chain IDs have a color assigned
        let colorIndex = 0;
        chainIDs.forEach(id => {
            if (!this.chainColorMap.has(id)) {
                const color = new THREE.Color(chainColors[colorIndex % chainColors.length]);
                this.chainColorMap.set(id, color);
                colorIndex++;
            }
        });
    }

    getChainColor(chainID) {
        // Return the THREE.Color object for a chain ID
        if (!this.chainColorMap.has(chainID)) {
            // Assign a new color if somehow missed (shouldn't happen with assignChainColors)
            console.warn(`Assigning new color on the fly for chain ${chainID}`);
            const color = new THREE.Color(chainColors[this.chainColorMap.size % chainColors.length]);
            this.chainColorMap.set(chainID, color);
            return color;
        }
        return this.chainColorMap.get(chainID);
    }


    /**
     * Disposes geometry and material of a given protein object.
     * @param {THREE.Object3D} proteinObject
     */
    disposeRepresentation(proteinObject) {
        if (!proteinObject) return;

        if (proteinObject.geometry) {
            proteinObject.geometry.dispose();
            // console.log("Disposed geometry");
        }
        if (proteinObject.material) {
            // If material is an array (MultiMaterial), dispose each
            if (Array.isArray(proteinObject.material)) {
                proteinObject.material.forEach(material => this.disposeMaterial(material));
            } else {
                this.disposeMaterial(proteinObject.material);
            }
            // console.log("Disposed material(s)");
        }
         // Recursively dispose children if any (though unlikely for lines/mesh)
         proteinObject.traverse(child => {
            if (child.geometry) child.geometry.dispose();
             if (child.material) {
                 if (Array.isArray(child.material)) {
                     child.material.forEach(m => this.disposeMaterial(m));
                 } else {
                     this.disposeMaterial(child.material);
                 }
             }
        });
    }

    disposeMaterial(material) {
         material.dispose();
         // Dispose textures used by the material
         for (const key in material.uniforms) {
            if (material.uniforms[key].value instanceof THREE.Texture) {
                material.uniforms[key].value.dispose();
                 // console.log(`Disposed texture in uniform ${key}`);
            }
        }
    }
}

export default ProteinVisualizer;
