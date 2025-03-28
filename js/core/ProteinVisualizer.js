// js/core/ProteinVisualizer.js
import * as THREE from '../vendor/three.module.js';
import { CatmullRomCurve3, TubeGeometry, BufferGeometry, Float32BufferAttribute, LineSegments, Mesh } from '../vendor/three.module.js';
import ShaderManager from './ShaderManager.js';

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
        this.shaderManager = shaderManager;
        this.chainColorMap = new Map();
    }

    /**
     * Creates a 3D representation of the protein.
     * @param {object} pdbData - Processed data from ProteinLoader.
     * @param {string} representationType - 'lines' or 'cartoon'.
     * @param {string} shaderName - Name of the shader to use.
     * @param {object} shaderParams - Parameters/uniforms for the shader.
     * @returns {Promise<THREE.Object3D | null>} The created Three.js object or null on failure.
     */
    async createRepresentation(pdbData, representationType, shaderName, shaderParams) {
        if (!pdbData) {
            console.error("Cannot create representation: Invalid PDB data.");
            return null;
        }

        console.log(`Creating ${representationType} representation with PDB data:`, {
            hasAtoms: pdbData.atoms && pdbData.atoms.length > 0,
            atomCount: pdbData.atoms ? pdbData.atoms.length : 0,
            hasGeometryAtoms: !!pdbData.geometryAtoms,
            hasGeometryBonds: !!pdbData.geometryBonds,
            geometryBondsVertices: pdbData.geometryBonds?.attributes?.position?.count || 0
        });

        let geometry = null;
        let objectType = null;

        try {
            switch (representationType.toLowerCase()) {
                case 'lines':
                    // For lines, we'll use the bonds geometry directly
                    geometry = this.createLinesRepresentation(pdbData);
                    objectType = LineSegments;
                    break;
                case 'cartoon':
                    // For cartoon, we'll use the atoms geometry
                    geometry = this.createCartoonRepresentation(pdbData);
                    objectType = Mesh;
                    break;
                default:
                    console.warn(`Unsupported representation type: ${representationType}. Defaulting to lines.`);
                    geometry = this.createLinesRepresentation(pdbData);
                    objectType = LineSegments;
            }

            if (!geometry) {
                // Create a simple fallback geometry (sphere or cube)
                console.warn("Could not create geometry. Using fallback sphere.");
                geometry = new THREE.SphereGeometry(10, 16, 16);
                objectType = Mesh;
            }

            // Ensure normals for mesh objects
            if (objectType === Mesh && !geometry.attributes.normal) {
                geometry.computeVertexNormals();
            }

            // Create the material
            const material = await this.shaderManager.createMaterial(shaderName, shaderParams, objectType === Mesh);
            if (!material) {
                throw new Error(`Material creation failed for shader: ${shaderName}`);
            }

            // Set vertex colors if available
            if (geometry.attributes.color) {
                material.vertexColors = true;
            }

            // Create the object
            const proteinObject = new objectType(geometry, material);
            proteinObject.name = `protein_${representationType}_${shaderName}`;
            proteinObject.userData.pdbData = pdbData;

            return proteinObject;
        } catch (error) {
            console.error(`Error creating ${representationType} representation:`, error);
            return null;
        }
    }

    /**
     * Creates a line representation for the protein using the geometryBonds.
     * @param {object} pdbData - The processed PDB data.
     * @returns {THREE.BufferGeometry} The line geometry.
     */
    createLinesRepresentation(pdbData) {
        // Check if we have geometryBonds from PDBLoader
        if (pdbData.geometryBonds && 
            pdbData.geometryBonds.attributes && 
            pdbData.geometryBonds.attributes.position) {
            
            const posCount = pdbData.geometryBonds.attributes.position.count;
            console.log(`Using pre-calculated bonds geometry with ${posCount} vertices`);
            
            if (posCount === 0) {
                console.warn("geometryBonds has 0 positions. Creating fallback geometry.");
                return this.createFallbackGeometry();
            }
            
            // Make a copy of the geometry
            const bondGeometry = pdbData.geometryBonds.clone();
            
            // Add color attribute if it doesn't exist
            if (!bondGeometry.attributes.color) {
                const colorArray = new Float32Array(posCount * 3);
                // Default color (white)
                for (let i = 0; i < posCount * 3; i++) {
                    colorArray[i] = 1.0; // Set all components to 1.0 (white)
                }
                bondGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
            }
            
            return bondGeometry;
        } else {
            console.warn("No geometryBonds available. Creating fallback geometry.");
            return this.createFallbackGeometry();
        }
    }

    /**
     * Creates a cartoon representation for the protein.
     * @param {object} pdbData - The processed PDB data.
     * @returns {THREE.BufferGeometry} The cartoon geometry.
     */
    createCartoonRepresentation(pdbData) {
        // Check if we have geometryAtoms from PDBLoader
        if (pdbData.geometryAtoms && 
            pdbData.geometryAtoms.attributes && 
            pdbData.geometryAtoms.attributes.position) {
            
            const posCount = pdbData.geometryAtoms.attributes.position.count;
            console.log(`Using atom geometry with ${posCount} positions for cartoon representation`);
            
            if (posCount === 0) {
                console.warn("geometryAtoms has 0 positions. Creating fallback geometry.");
                return this.createFallbackGeometry();
            }
            
            // Create a sphere representation
            return this.createSphereAtomGeometry(pdbData.geometryAtoms);
        } else if (pdbData.atoms && pdbData.atoms.length > 0) {
            console.log(`Using ${pdbData.atoms.length} processed atoms for cartoon`);
            
            return this.createSimpleCartoonFromAtoms(pdbData.atoms);
        } else {
            console.warn("No atoms data available. Creating fallback geometry.");
            return this.createFallbackGeometry();
        }
    }
    
    /**
     * Creates a simple sphere representation for atoms.
     * @param {THREE.BufferGeometry} geometryAtoms - The atom geometry from PDBLoader.
     * @returns {THREE.BufferGeometry} The merged sphere geometry.
     */
    createSphereAtomGeometry(geometryAtoms) {
        try {
            // Create a sphere template
            const sphereTemplate = new THREE.SphereGeometry(0.2, 8, 8);
            const positions = geometryAtoms.attributes.position;
            const colors = geometryAtoms.attributes.color;
            
            // Merged geometry data
            const mergedPositions = [];
            const mergedNormals = [];
            const mergedColors = [];
            
            // Create matrix for transformations
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const normal = new THREE.Vector3();
            
            // For each atom position, add a sphere
            for (let i = 0; i < positions.count; i++) {
                // Get atom position
                position.set(
                    positions.getX(i),
                    positions.getY(i),
                    positions.getZ(i)
                );
                
                // Create transformation matrix
                matrix.makeTranslation(position.x, position.y, position.z);
                
                // Get atom color
                let r = 1, g = 1, b = 1;
                if (colors) {
                    r = colors.getX(i);
                    g = colors.getY(i);
                    b = colors.getZ(i);
                }
                
                // Add transformed sphere vertices
                for (let j = 0; j < sphereTemplate.attributes.position.count; j++) {
                    position.set(
                        sphereTemplate.attributes.position.getX(j),
                        sphereTemplate.attributes.position.getY(j),
                        sphereTemplate.attributes.position.getZ(j)
                    );
                    position.applyMatrix4(matrix);
                    mergedPositions.push(position.x, position.y, position.z);
                    
                    if (sphereTemplate.attributes.normal) {
                        normal.set(
                            sphereTemplate.attributes.normal.getX(j),
                            sphereTemplate.attributes.normal.getY(j),
                            sphereTemplate.attributes.normal.getZ(j)
                        );
                        mergedNormals.push(normal.x, normal.y, normal.z);
                    }
                    
                    mergedColors.push(r, g, b);
                }
            }
            
            // Create merged geometry
            const mergedGeometry = new THREE.BufferGeometry();
            mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
            if (mergedNormals.length > 0) {
                mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(mergedNormals, 3));
            }
            mergedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(mergedColors, 3));
            
            return mergedGeometry;
        } catch (error) {
            console.error("Error creating sphere atom geometry:", error);
            return this.createFallbackGeometry();
        }
    }
    
    /**
     * Creates a simple cartoon representation from atom data.
     * @param {Array} atoms - The atom data.
     * @returns {THREE.BufferGeometry} The cartoon geometry.
     */
    createSimpleCartoonFromAtoms(atoms) {
        try {
            // Group atoms by chain
            const chains = {};
            atoms.forEach(atom => {
                const chainID = atom.chainID || 'A';
                if (!chains[chainID]) {
                    chains[chainID] = [];
                }
                chains[chainID].push(atom);
            });
            
            this.assignChainColors(Object.keys(chains));
            
            // Create merged geometry data
            const mergedPositions = [];
            const mergedColors = [];
            
            // Simple spheres for each atom
            const sphereTemplate = new THREE.SphereGeometry(0.3, 8, 8);
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            
            for (const chainID in chains) {
                const chainAtoms = chains[chainID];
                const chainColor = this.getChainColor(chainID);
                
                for (const atom of chainAtoms) {
                    // Set sphere position to atom coordinates
                    matrix.makeTranslation(atom.x, atom.y, atom.z);
                    
                    // Add transformed sphere vertices
                    for (let j = 0; j < sphereTemplate.attributes.position.count; j++) {
                        position.set(
                            sphereTemplate.attributes.position.getX(j),
                            sphereTemplate.attributes.position.getY(j),
                            sphereTemplate.attributes.position.getZ(j)
                        );
                        position.applyMatrix4(matrix);
                        mergedPositions.push(position.x, position.y, position.z);
                        mergedColors.push(chainColor.r, chainColor.g, chainColor.b);
                    }
                }
            }
            
            if (mergedPositions.length === 0) {
                console.warn("No positions generated for cartoon. Using fallback.");
                return this.createFallbackGeometry();
            }
            
            // Create merged geometry
            const mergedGeometry = new THREE.BufferGeometry();
            mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
            mergedGeometry.setAttribute('color', new THREE.Float32BufferAttribute(mergedColors, 3));
            mergedGeometry.computeVertexNormals();
            
            return mergedGeometry;
        } catch (error) {
            console.error("Error creating simple cartoon:", error);
            return this.createFallbackGeometry();
        }
    }
    
    /**
     * Creates a fallback geometry (a simple cube or sphere) for when no valid geometry can be created.
     * @returns {THREE.BufferGeometry} A simple fallback geometry.
     */
    createFallbackGeometry() {
        console.warn("Creating fallback geometry");
        
        // Create a simple sphere with a distinctive color
        const geometry = new THREE.SphereGeometry(10, 16, 16);
        const positions = geometry.attributes.position;
        const colorArray = new Float32Array(positions.count * 3);
        
        // Red color to indicate fallback
        for (let i = 0; i < positions.count; i++) {
            colorArray[i * 3] = 1.0;     // Red
            colorArray[i * 3 + 1] = 0.0; // Green
            colorArray[i * 3 + 2] = 0.0; // Blue
        }
        
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
        return geometry;
    }

    /**
     * Sets the coloring mode for the protein.
     * @param {THREE.Object3D} proteinObject - The protein object.
     * @param {string} mode - The coloring mode ('chain' or 'solid').
     * @param {object} [pdbData] - The PDB data (required for 'chain' mode).
     * @param {string|number} [solidColor] - The solid color to use (required for 'solid' mode).
     */
    setColorMode(proteinObject, mode, pdbData = null, solidColor = '#ffffff') {
        if (!proteinObject || !proteinObject.material) {
            console.warn("Cannot set color mode: Missing object or material.");
            return;
        }

        const material = proteinObject.material;

        if (mode === 'chain') {
            // Enable vertex colors
            material.vertexColors = true;
            
            // Disable solid color uniform
            if (material.uniforms && material.uniforms.uUseSolidColor) {
                material.uniforms.uUseSolidColor.value = false;
            }
            if (material.uniforms && material.uniforms.uBaseColor) {
                material.uniforms.uBaseColor.value.set(0xffffff);
            }
            
            console.log("Applied chain coloring");
        } else if (mode === 'solid') {
            // Disable vertex colors
            material.vertexColors = false;
            
            // Enable solid color
            if (material.uniforms && material.uniforms.uUseSolidColor) {
                material.uniforms.uUseSolidColor.value = true;
            }
            if (material.uniforms && material.uniforms.uBaseColor) {
                material.uniforms.uBaseColor.value.set(solidColor);
            } else if (material.color) {
                material.color.set(solidColor);
            }
            
            console.log("Applied solid color:", solidColor);
        }

        material.needsUpdate = true;
    }

    /**
     * Ensures each chain has a color assigned.
     * @param {Array} chainIDs - Array of chain IDs.
     */
    assignChainColors(chainIDs) {
        let colorIndex = 0;
        chainIDs.forEach(id => {
            if (!this.chainColorMap.has(id)) {
                const color = new THREE.Color(chainColors[colorIndex % chainColors.length]);
                this.chainColorMap.set(id, color);
                colorIndex++;
            }
        });
    }

    /**
     * Gets the color for a chain.
     * @param {string} chainID - The chain ID.
     * @returns {THREE.Color} The color for the chain.
     */
    getChainColor(chainID) {
        if (!this.chainColorMap.has(chainID)) {
            const color = new THREE.Color(chainColors[this.chainColorMap.size % chainColors.length]);
            this.chainColorMap.set(chainID, color);
            return color;
        }
        return this.chainColorMap.get(chainID);
    }

    /**
     * Disposes resources used by a protein representation.
     * @param {THREE.Object3D} proteinObject - The protein object to dispose.
     */
    disposeRepresentation(proteinObject) {
        if (!proteinObject) return;

        if (proteinObject.geometry) {
            proteinObject.geometry.dispose();
        }
        
        if (proteinObject.material) {
            if (Array.isArray(proteinObject.material)) {
                proteinObject.material.forEach(material => this.disposeMaterial(material));
            } else {
                this.disposeMaterial(proteinObject.material);
            }
        }
        
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

    /**
     * Disposes a material and its textures.
     * @param {THREE.Material} material - The material to dispose.
     */
    disposeMaterial(material) {
        material.dispose();
        
        if (material.uniforms) {
            for (const key in material.uniforms) {
                if (material.uniforms[key].value instanceof THREE.Texture) {
                    material.uniforms[key].value.dispose();
                }
            }
        }
    }
}

export default ProteinVisualizer;
