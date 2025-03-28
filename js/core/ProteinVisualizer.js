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

// Elements that should be shown in visualizations (filters out solvent, non-standard atoms)
const BACKBONE_ELEMENTS = ['C', 'N', 'O', 'S', 'P'];

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

        console.log(`Creating ${representationType} representation with ${pdbData.atoms.length} atoms`);

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
     * Creates a simple LineSegments representation connecting all atoms.
     * @param {object} pdbData - Processed PDB data.
     * @returns {THREE.BufferGeometry | null}
     */
    createLinesRepresentation(pdbData) {
        const atoms = pdbData.atoms;
        const positions = [];
        const colors = [];
        const chains = {}; // Group atoms by chain
        
        console.log("Creating lines representation from", atoms.length, "atoms");

        // First, check if we have any geometryBonds we can use directly
        if (pdbData.geometryBonds && pdbData.geometryBonds.attributes && 
            pdbData.geometryBonds.attributes.position && 
            pdbData.geometryBonds.attributes.position.count > 0) {
            
            console.log("Using pre-calculated bonds from geometryBonds");
            
            // Create a copy of the geometry to avoid modifying the original
            const geometry = pdbData.geometryBonds.clone();
            
            // If we need to add colors (assuming bonds don't have colors)
            if (!geometry.attributes.color) {
                const posCount = geometry.attributes.position.count;
                const colorArray = new Float32Array(posCount * 3);
                
                // Default color (white)
                const defaultColor = new THREE.Color(0xFFFFFF);
                
                for (let i = 0; i < posCount; i++) {
                    colorArray[i * 3] = defaultColor.r;
                    colorArray[i * 3 + 1] = defaultColor.g;
                    colorArray[i * 3 + 2] = defaultColor.b;
                }
                
                geometry.setAttribute('color', new Float32BufferAttribute(colorArray, 3));
            }
            
            return geometry;
        }
        
        // If no bonds geometry, create our own by connecting atoms
        
        // Filter atoms to use (only backbone elements or all if no filtering needed)
        const filteredAtoms = atoms.filter(atom => 
            BACKBONE_ELEMENTS.includes(atom.element) || 
            BACKBONE_ELEMENTS.some(el => atom.element.toUpperCase().includes(el))
        );
        
        console.log(`Filtered atoms for visualization: ${filteredAtoms.length}`);
        
        // Group atoms by chain ID
        filteredAtoms.forEach(atom => {
            const chainID = atom.chainID || 'A'; // Default to chain A if not specified
            if (!chains[chainID]) {
                chains[chainID] = [];
            }
            // Store atom with its sequence number
            chains[chainID].push({ 
                ...atom, 
                resSeq: typeof atom.resSeq === 'number' ? atom.resSeq : parseInt(atom.resSeq || '1', 10) 
            });
        });

        // Generate chain colors if not already assigned
        this.assignChainColors(Object.keys(chains));

        // Get all unique residue numbers to use for connecting atoms
        const getResidueKey = (atom) => `${atom.chainID || 'A'}_${atom.resSeq || 1}`;
        const residues = new Map(); // Map of residue key to array of atoms in that residue
        
        // Group atoms by residue
        filteredAtoms.forEach(atom => {
            const key = getResidueKey(atom);
            if (!residues.has(key)) {
                residues.set(key, []);
            }
            residues.get(key).push(atom);
        });
        
        console.log(`Found ${residues.size} residues`);

        // Connect atoms within residues
        residues.forEach((atomsInResidue, residueKey) => {
            const chainID = residueKey.split('_')[0];
            const chainColor = this.getChainColor(chainID);
            
            // Connect all atoms in the residue to each other
            for (let i = 0; i < atomsInResidue.length; i++) {
                for (let j = i + 1; j < atomsInResidue.length; j++) {
                    const atom1 = atomsInResidue[i];
                    const atom2 = atomsInResidue[j];
                    
                    // Skip if atoms are too far apart (basic distance check)
                    const dx = atom1.x - atom2.x;
                    const dy = atom1.y - atom2.y;
                    const dz = atom1.z - atom2.z;
                    const distSq = dx*dx + dy*dy + dz*dz;
                    
                    // Typical covalent bond length is < 2 Angstroms
                    if (distSq < 4.0) {
                        positions.push(atom1.x, atom1.y, atom1.z);
                        positions.push(atom2.x, atom2.y, atom2.z);
                        
                        colors.push(chainColor.r, chainColor.g, chainColor.b);
                        colors.push(chainColor.r, chainColor.g, chainColor.b);
                    }
                }
            }
        });
        
        // Connect backbone atoms between consecutive residues in each chain
        for (const chainID in chains) {
            const chainAtoms = chains[chainID];
            const chainColor = this.getChainColor(chainID);
            
            // Sort atoms by residue sequence number
            chainAtoms.sort((a, b) => a.resSeq - b.resSeq);
            
            // Group atoms by residue for this chain
            const residueGroups = new Map();
            chainAtoms.forEach(atom => {
                const resSeq = atom.resSeq;
                if (!residueGroups.has(resSeq)) {
                    residueGroups.set(resSeq, []);
                }
                residueGroups.get(resSeq).push(atom);
            });
            
            // Get sorted residue numbers
            const residueNumbers = Array.from(residueGroups.keys()).sort((a, b) => a - b);
            
            // Connect atoms between consecutive residues
            for (let i = 0; i < residueNumbers.length - 1; i++) {
                const resNum1 = residueNumbers[i];
                const resNum2 = residueNumbers[i + 1];
                
                const atomsInRes1 = residueGroups.get(resNum1);
                const atomsInRes2 = residueGroups.get(resNum2);
                
                if (!atomsInRes1 || !atomsInRes2) continue;
                
                // Find the closest pair of atoms between the two residues
                let minDistSq = Infinity;
                let closestPair = null;
                
                for (const atom1 of atomsInRes1) {
                    for (const atom2 of atomsInRes2) {
                        const dx = atom1.x - atom2.x;
                        const dy = atom1.y - atom2.y;
                        const dz = atom1.z - atom2.z;
                        const distSq = dx*dx + dy*dy + dz*dz;
                        
                        if (distSq < minDistSq && distSq < 25.0) { // Maximum of ~5 Angstroms
                            minDistSq = distSq;
                            closestPair = [atom1, atom2];
                        }
                    }
                }
                
                if (closestPair) {
                    const [atom1, atom2] = closestPair;
                    positions.push(atom1.x, atom1.y, atom1.z);
                    positions.push(atom2.x, atom2.y, atom2.z);
                    
                    colors.push(chainColor.r, chainColor.g, chainColor.b);
                    colors.push(chainColor.r, chainColor.g, chainColor.b);
                }
            }
        }

        // FALLBACK: If no bonds were created, create a simple connecting line through all atoms
        if (positions.length === 0 && filteredAtoms.length > 0) {
            console.log("Using fallback simple line representation");
            
            // Sort atoms by chain, then by residue number
            const sortedAtoms = [...filteredAtoms].sort((a, b) => {
                if (a.chainID !== b.chainID) return a.chainID.localeCompare(b.chainID);
                return a.resSeq - b.resSeq;
            });
            
            // Connect sequential atoms with lines
            for (let i = 0; i < sortedAtoms.length - 1; i++) {
                const atom1 = sortedAtoms[i];
                const atom2 = sortedAtoms[i + 1];
                
                // Only connect atoms in the same chain
                if (atom1.chainID === atom2.chainID) {
                    const chainColor = this.getChainColor(atom1.chainID || 'A');
                    
                    positions.push(atom1.x, atom1.y, atom1.z);
                    positions.push(atom2.x, atom2.y, atom2.z);
                    
                    colors.push(chainColor.r, chainColor.g, chainColor.b);
                    colors.push(chainColor.r, chainColor.g, chainColor.b);
                }
            }
        }

        if (positions.length === 0) {
            console.warn("No line segments generated for Lines representation.");
            
            // Last resort - just create a small box as a placeholder
            const cube = new THREE.BoxGeometry(1, 1, 1);
            const pos = cube.attributes.position.array;
            
            // Use a default color (red for error)
            const color = new THREE.Color(0xff0000);
            const colorArray = new Float32Array(pos.length);
            
            for (let i = 0; i < pos.length / 3; i++) {
                colorArray[i * 3] = color.r;
                colorArray[i * 3 + 1] = color.g;
                colorArray[i * 3 + 2] = color.b;
            }
            
            cube.setAttribute('color', new Float32BufferAttribute(colorArray, 3));
            console.warn("Created fallback cube geometry as placeholder");
            
            return cube;
        }

        console.log(`Created lines representation with ${positions.length / 6} line segments`);
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

        // If geometryAtoms is available and has positions, use that instead
        if (pdbData.geometryAtoms && pdbData.geometryAtoms.attributes && 
            pdbData.geometryAtoms.attributes.position) {
            
            console.log("Using geometryAtoms for cartoon representation");
            
            // Simple sphere representation as fallback
            const geometry = new THREE.SphereGeometry(0.2, 16, 16);
            const positions = pdbData.geometryAtoms.attributes.position;
            const colors = pdbData.geometryAtoms.attributes.color;
            
            // Create a merged geometry for all atoms
            const mergedGeometry = new BufferGeometry();
            const totalVertices = positions.count * geometry.attributes.position.count;
            
            const mergedPositions = new Float32Array(totalVertices * 3);
            const mergedNormals = new Float32Array(totalVertices * 3);
            const mergedColors = new Float32Array(totalVertices * 3);
            
            const tempPosition = new THREE.Vector3();
            const tempMatrix = new THREE.Matrix4();
            let offset = 0;
            
            for (let i = 0; i < positions.count; i++) {
                // Get atom position
                tempPosition.set(
                    positions.getX(i),
                    positions.getY(i),
                    positions.getZ(i)
                );
                
                // Set matrix to position the sphere at the atom
                tempMatrix.makeTranslation(tempPosition.x, tempPosition.y, tempPosition.z);
                
                // Copy vertices transformed by matrix
                for (let j = 0; j < geometry.attributes.position.count; j++) {
                    const x = geometry.attributes.position.getX(j);
                    const y = geometry.attributes.position.getY(j);
                    const z = geometry.attributes.position.getZ(j);
                    
                    // Apply matrix to position
                    tempPosition.set(x, y, z).applyMatrix4(tempMatrix);
                    
                    // Write to merged arrays
                    const index = offset + j;
                    mergedPositions[index * 3] = tempPosition.x;
                    mergedPositions[index * 3 + 1] = tempPosition.y;
                    mergedPositions[index * 3 + 2] = tempPosition.z;
                    
                    // Copy normals (assuming spheres have normals)
                    if (geometry.attributes.normal) {
                        const nx = geometry.attributes.normal.getX(j);
                        const ny = geometry.attributes.normal.getY(j);
                        const nz = geometry.attributes.normal.getZ(j);
                        mergedNormals[index * 3] = nx;
                        mergedNormals[index * 3 + 1] = ny;
                        mergedNormals[index * 3 + 2] = nz;
                    }
                    
                    // Copy colors from geometryAtoms
                    if (colors) {
                        const r = colors.getX(i);
                        const g = colors.getY(i);
                        const b = colors.getZ(i);
                        mergedColors[index * 3] = r;
                        mergedColors[index * 3 + 1] = g;
                        mergedColors[index * 3 + 2] = b;
                    } else {
                        // Default to white
                        mergedColors[index * 3] = 1.0;
                        mergedColors[index * 3 + 1] = 1.0;
                        mergedColors[index * 3 + 2] = 1.0;
                    }
                }
                
                offset += geometry.attributes.position.count;
            }
            
            mergedGeometry.setAttribute('position', new Float32BufferAttribute(mergedPositions, 3));
            mergedGeometry.setAttribute('normal', new Float32BufferAttribute(mergedNormals, 3));
            mergedGeometry.setAttribute('color', new Float32BufferAttribute(mergedColors, 3));
            
            console.log(`Created cartoon representation with ${positions.count} atoms`);
            return mergedGeometry;
        }

        // 1. Group C-alpha atoms by chain and sort
        // For simplified data, just use all atoms and sort them by chain/sequence
        const chains = {};
        
        // Filter atoms (similar to lines representation)
        const filteredAtoms = atoms.filter(atom => 
            BACKBONE_ELEMENTS.includes(atom.element) || 
            BACKBONE_ELEMENTS.some(el => atom.element.toUpperCase().includes(el))
        );
        
        // Group by chain
        filteredAtoms.forEach(atom => {
            const chainID = atom.chainID || 'A';
            if (!chains[chainID]) {
                chains[chainID] = [];
            }
            chains[chainID].push({ 
                ...atom, 
                resSeq: typeof atom.resSeq === 'number' ? atom.resSeq : parseInt(atom.resSeq || '1', 10) 
            });
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

            // Create curve and tube geometry
            const curve = new CatmullRomCurve3(points, false, 'catmullrom', 0.5);
            const curveLength = curve.getLength();
            const tubularSegments = Math.max(8, Math.floor(curveLength * 3));
            const radius = 0.3;
            const radialSegments = 8;

            const tubeGeometry = new TubeGeometry(curve, tubularSegments, radius, radialSegments, false);

            // Add colors
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

        // If no geometries created (possibly because atoms weren't grouped well), create fallback
        if (geometries.length === 0) {
            console.warn("No tube geometries generated for Cartoon representation. Creating fallback.");
            
            if (filteredAtoms.length > 0) {
                // Create a single tube through all atoms
                const allPoints = filteredAtoms
                    .sort((a, b) => {
                        if (a.chainID !== b.chainID) return a.chainID.localeCompare(b.chainID);
                        return a.resSeq - b.resSeq;
                    })
                    .map(a => new THREE.Vector3(a.x, a.y, a.z));
                
                if (allPoints.length >= 2) {
                    const curve = new CatmullRomCurve3(allPoints, false, 'catmullrom', 0.5);
                    const tubeGeometry = new TubeGeometry(curve, 
                        Math.max(8, Math.floor(allPoints.length / 2)), 0.3, 8, false);
                    
                    // Add color (default to first chain's color)
                    const chainID = filteredAtoms[0].chainID || 'A';
                    const chainColor = this.getChainColor(chainID);
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
            }
        }

        // Final fallback - create a sphere if still no geometries
        if (geometries.length === 0) {
            console.warn("Creating fallback sphere for cartoon representation");
            const sphereGeometry = new THREE.SphereGeometry(1, 16, 16);
            const numVertices = sphereGeometry.attributes.position.count;
            const colors = new Float32Array(numVertices * 3);
            
            // Red for error
            const color = new THREE.Color(0xff0000);
            for (let i = 0; i < numVertices; i++) {
                colors[i * 3 + 0] = color.r;
                colors[i * 3 + 1] = color.g;
                colors[i * 3 + 2] = color.b;
            }
            
            sphereGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
            return sphereGeometry;
        }

        try {
            // Merge geometries
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
