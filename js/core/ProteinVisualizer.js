// js/core/ProteinVisualizer.js
import * as THREE from '../vendor/three.module.js';
import { CatmullRomCurve3, TubeGeometry, BufferGeometry, Float32BufferAttribute, LineSegments, Mesh } from '../vendor/three.module.js';
import ShaderManager from './ShaderManager.js';

// Simple chain color palette
const chainColors = [
    0x1f77b4, 0xff7f0e, 0x2ca02c, 0xd62728, 0x9467bd,
    0x8c564b, 0xe377c2, 0x7f7f7f, 0xbcbd22, 0x17becf,
    0xaec7e8, 0xffbb78, 0x98df8a, 0xff9896, 0xc5b0d5
];

// Distance thresholds for bond detection (Angstroms)
const BOND_DISTANCE_THRESHOLD = 2.0; // Maximum distance for bond detection
const BOND_DISTANCE_SQ_THRESHOLD = BOND_DISTANCE_THRESHOLD * BOND_DISTANCE_THRESHOLD;

// Element data - covalent radii and colors
const ELEMENT_DATA = {
    'C': { radius: 0.77, color: new THREE.Color(0x808080) }, // Gray
    'N': { radius: 0.74, color: new THREE.Color(0x0000FF) }, // Blue
    'O': { radius: 0.74, color: new THREE.Color(0xFF0000) }, // Red
    'S': { radius: 1.02, color: new THREE.Color(0xFFFF00) }, // Yellow
    'P': { radius: 1.10, color: new THREE.Color(0xFFA500) }, // Orange
    'H': { radius: 0.37, color: new THREE.Color(0xFFFFFF) }, // White
    // Default for unknown elements
    'X': { radius: 0.80, color: new THREE.Color(0x00FFFF) }  // Cyan
};

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
        if (!pdbData || !pdbData.atoms || pdbData.atoms.length === 0) {
            console.error("Cannot create representation: Invalid or empty PDB data.");
            return null;
        }

        console.log(`Creating ${representationType} representation for ${pdbData.atoms.length} atoms`);
        
        let geometry = null;
        let objectType = null;

        try {
            // Determine representation type and create appropriate geometry
            switch (representationType.toLowerCase()) {
                case 'lines':
                    geometry = this.createBondsGeometry(pdbData.atoms);
                    objectType = LineSegments;
                    break;
                case 'cartoon':
                    geometry = this.createCartoonGeometry(pdbData.atoms);
                    objectType = Mesh;
                    break;
                default:
                    console.warn(`Unsupported representation type: ${representationType}. Defaulting to lines.`);
                    geometry = this.createBondsGeometry(pdbData.atoms);
                    objectType = LineSegments;
            }

            if (!geometry) {
                console.warn("Could not create geometry. Using fallback.");
                geometry = this.createFallbackGeometry();
                objectType = Mesh;
            }

            // Ensure normals for mesh objects
            if (objectType === Mesh && !geometry.attributes.normal) {
                geometry.computeVertexNormals();
            }

            // Create material
            const material = await this.shaderManager.createMaterial(
                shaderName, 
                shaderParams, 
                objectType === Mesh
            );
            
            // Create the protein object
            const proteinObject = new objectType(geometry, material);
            proteinObject.name = `protein_${representationType}_${shaderName}`;
            
            return proteinObject;
        } catch (error) {
            console.error(`Error creating ${representationType} representation:`, error);
            return null;
        }
    }

    /**
     * Creates geometry representing bonds between atoms.
     * @param {Array} atoms - Array of atom objects.
     * @returns {THREE.BufferGeometry} Geometry for line representation.
     */
    createBondsGeometry(atoms) {
        console.log(`Creating bonds geometry from ${atoms.length} atoms`);
        
        // If atoms array is empty, return fallback
        if (!atoms || atoms.length === 0) {
            return this.createFallbackGeometry();
        }
        
        const positions = [];
        const colors = [];
        
        // First, sort and process atoms
        const processedAtoms = this.preprocessAtoms(atoms);
        const { chainGroups, residueGroups } = processedAtoms;
        
        // Generate chain colors
        this.assignChainColors(Object.keys(chainGroups));
        
        // 1. Connect atoms within residues based on distance
        this.generateIntraResidueBonds(residueGroups, positions, colors);
        
        // 2. Connect backbone atoms between residues
        this.generateBackboneBonds(chainGroups, positions, colors);
        
        // Check if we created any bonds
        if (positions.length === 0) {
            console.warn("No bonds generated. Using fallback connection method.");
            // Connect nearest neighbors as a fallback
            this.generateNearestNeighborBonds(atoms, positions, colors);
        }
        
        // Final check - if still no bonds, create a fallback visualization
        if (positions.length === 0) {
            console.warn("Could not generate any bonds. Using fallback geometry.");
            return this.createFallbackGeometry();
        }
        
        // Create and return the bond geometry
        console.log(`Created bonds geometry with ${positions.length/6} bonds`);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        return geometry;
    }
    
    /**
     * Preprocesses atoms into useful groupings for visualization.
     * @param {Array} atoms - Array of atom objects.
     * @returns {Object} Object containing different atom groupings.
     */
    preprocessAtoms(atoms) {
        // Group atoms by chain
        const chainGroups = {};
        
        // Group atoms by residue (chain+resSeq)
        const residueGroups = {};
        
        // Group backbone atoms separately
        const backboneGroups = {};
        
        const backboneAtomNames = ['CA', 'C', 'N', 'O'];
        
        // Process each atom
        atoms.forEach(atom => {
            // Normalize properties
            const chainID = atom.chainID || 'A';
            const resSeq = atom.resSeq || 1;
            const resName = atom.resName || 'UNK';
            const name = atom.name || atom.element || 'X';
            const isBackbone = backboneAtomNames.includes(name);
            
            // Create residue key
            const residueKey = `${chainID}_${resSeq}_${resName}`;
            
            // Add to chain group
            if (!chainGroups[chainID]) {
                chainGroups[chainID] = [];
            }
            chainGroups[chainID].push({...atom, chainID, resSeq, resName, name, residueKey, isBackbone});
            
            // Add to residue group
            if (!residueGroups[residueKey]) {
                residueGroups[residueKey] = [];
            }
            residueGroups[residueKey].push({...atom, chainID, resSeq, resName, name, residueKey, isBackbone});
            
            // Add to backbone group if applicable
            if (isBackbone) {
                if (!backboneGroups[chainID]) {
                    backboneGroups[chainID] = [];
                }
                backboneGroups[chainID].push({...atom, chainID, resSeq, resName, name, residueKey, isBackbone});
            }
        });
        
        // Sort atoms in each chain by residue number
        for (const chainID in chainGroups) {
            chainGroups[chainID].sort((a, b) => a.resSeq - b.resSeq);
        }
        
        // Sort backbone atoms in each chain
        for (const chainID in backboneGroups) {
            backboneGroups[chainID].sort((a, b) => {
                if (a.resSeq !== b.resSeq) return a.resSeq - b.resSeq;
                // For same residue, order: N, CA, C, O
                const order = {'N': 0, 'CA': 1, 'C': 2, 'O': 3};
                return (order[a.name] || 4) - (order[b.name] || 4);
            });
        }
        
        return { chainGroups, residueGroups, backboneGroups };
    }
    
    /**
     * Generates bonds between atoms within the same residue.
     * @param {Object} residueGroups - Atoms grouped by residue.
     * @param {Array} positions - Array to store position data.
     * @param {Array} colors - Array to store color data.
     */
    generateIntraResidueBonds(residueGroups, positions, colors) {
        for (const residueKey in residueGroups) {
            const atoms = residueGroups[residueKey];
            const chainID = atoms[0].chainID;
            const chainColor = this.getChainColor(chainID);
            
            // Check each pair of atoms in the residue for possible bonds
            for (let i = 0; i < atoms.length; i++) {
                for (let j = i + 1; j < atoms.length; j++) {
                    const atom1 = atoms[i];
                    const atom2 = atoms[j];
                    
                    // Calculate distance squared
                    const dx = atom1.x - atom2.x;
                    const dy = atom1.y - atom2.y;
                    const dz = atom1.z - atom2.z;
                    const distSq = dx*dx + dy*dy + dz*dz;
                    
                    // Check if atoms are close enough to be bonded
                    if (distSq <= BOND_DISTANCE_SQ_THRESHOLD) {
                        // Add bond
                        positions.push(atom1.x, atom1.y, atom1.z);
                        positions.push(atom2.x, atom2.y, atom2.z);
                        
                        // Add colors (chain color or element color)
                        colors.push(chainColor.r, chainColor.g, chainColor.b);
                        colors.push(chainColor.r, chainColor.g, chainColor.b);
                    }
                }
            }
        }
    }
    
    /**
     * Generates bonds between backbone atoms of adjacent residues.
     * @param {Object} chainGroups - Atoms grouped by chain.
     * @param {Array} positions - Array to store position data.
     * @param {Array} colors - Array to store color data.
     */
    generateBackboneBonds(chainGroups, positions, colors) {
        for (const chainID in chainGroups) {
            const atoms = chainGroups[chainID];
            const chainColor = this.getChainColor(chainID);
            
            // Group atoms by residue
            const residueMap = new Map();
            atoms.forEach(atom => {
                if (!residueMap.has(atom.resSeq)) {
                    residueMap.set(atom.resSeq, []);
                }
                residueMap.get(atom.resSeq).push(atom);
            });
            
            // Get sorted residue numbers
            const residueNumbers = [...residueMap.keys()].sort((a, b) => a - b);
            
            // Connect adjacent residues
            for (let i = 0; i < residueNumbers.length - 1; i++) {
                const currentResNum = residueNumbers[i];
                const nextResNum = residueNumbers[i + 1];
                
                // Skip if residues are not sequential
                if (nextResNum - currentResNum > 1) continue;
                
                const currentResAtoms = residueMap.get(currentResNum);
                const nextResAtoms = residueMap.get(nextResNum);
                
                // Find C-N connection between residues (peptide bond)
                let cAtom = currentResAtoms.find(atom => atom.name === 'C');
                let nAtom = nextResAtoms.find(atom => atom.name === 'N');
                
                if (cAtom && nAtom) {
                    // Add peptide bond
                    positions.push(cAtom.x, cAtom.y, cAtom.z);
                    positions.push(nAtom.x, nAtom.y, nAtom.z);
                    colors.push(chainColor.r, chainColor.g, chainColor.b);
                    colors.push(chainColor.r, chainColor.g, chainColor.b);
                } else {
                    // Fall back to closest atoms if C-N not found
                    let minDist = Number.MAX_VALUE;
                    let closestPair = null;
                    
                    for (const atom1 of currentResAtoms) {
                        for (const atom2 of nextResAtoms) {
                            const dx = atom1.x - atom2.x;
                            const dy = atom1.y - atom2.y;
                            const dz = atom1.z - atom2.z;
                            const distSq = dx*dx + dy*dy + dz*dz;
                            
                            if (distSq < minDist && distSq < 25.0) { // 5Å max distance
                                minDist = distSq;
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
        }
    }
    
    /**
     * Fallback method to generate bonds based on simple proximity.
     * @param {Array} atoms - Array of atom objects.
     * @param {Array} positions - Array to store position data.
     * @param {Array} colors - Array to store color data.
     */
    generateNearestNeighborBonds(atoms, positions, colors) {
        console.log("Using nearest neighbor bond generation");
        
        // Group atoms by chain
        const chainGroups = {};
        atoms.forEach(atom => {
            const chainID = atom.chainID || 'A';
            if (!chainGroups[chainID]) {
                chainGroups[chainID] = [];
            }
            chainGroups[chainID].push(atom);
        });
        
        // Assign chain colors
        this.assignChainColors(Object.keys(chainGroups));
        
        // Create spatial hash grid for faster neighbor search
        const grid = this.createSpatialGrid(atoms, BOND_DISTANCE_THRESHOLD);
        
        // Track bonds to avoid duplicates
        const bondSet = new Set();
        
        // Check each atom's neighbors
        for (const atom of atoms) {
            const chainID = atom.chainID || 'A';
            const chainColor = this.getChainColor(chainID);
            
            const neighbors = this.getNeighborsFromGrid(grid, atom);
            
            for (const neighbor of neighbors) {
                if (atom === neighbor) continue; // Skip self
                
                // Create unique bond key (smaller index first)
                const bondKey = atom.serial < neighbor.serial ? 
                    `${atom.serial}-${neighbor.serial}` : 
                    `${neighbor.serial}-${atom.serial}`;
                
                // Skip if we've already processed this bond
                if (bondSet.has(bondKey)) continue;
                bondSet.add(bondKey);
                
                // Calculate distance
                const dx = atom.x - neighbor.x;
                const dy = atom.y - neighbor.y;
                const dz = atom.z - neighbor.z;
                const distSq = dx*dx + dy*dy + dz*dz;
                
                // Create bond if atoms are close enough
                if (distSq <= BOND_DISTANCE_SQ_THRESHOLD) {
                    positions.push(atom.x, atom.y, atom.z);
                    positions.push(neighbor.x, neighbor.y, neighbor.z);
                    colors.push(chainColor.r, chainColor.g, chainColor.b);
                    colors.push(chainColor.r, chainColor.g, chainColor.b);
                }
            }
        }
    }
    
    /**
     * Creates a spatial grid for efficient neighbor finding.
     * @param {Array} atoms - Array of atom objects.
     * @param {number} cellSize - Size of grid cells.
     * @returns {Object} Spatial grid object.
     */
    createSpatialGrid(atoms, cellSize) {
        const grid = {};
        
        // Add each atom to the grid
        for (const atom of atoms) {
            // Calculate grid cell indices
            const ix = Math.floor(atom.x / cellSize);
            const iy = Math.floor(atom.y / cellSize);
            const iz = Math.floor(atom.z / cellSize);
            
            // Create cell key
            const key = `${ix},${iy},${iz}`;
            
            // Add atom to cell
            if (!grid[key]) {
                grid[key] = [];
            }
            grid[key].push(atom);
        }
        
        return grid;
    }
    
    /**
     * Gets neighbors of an atom from the spatial grid.
     * @param {Object} grid - Spatial grid.
     * @param {Object} atom - Atom to find neighbors for.
     * @returns {Array} Array of neighboring atoms.
     */
    getNeighborsFromGrid(grid, atom) {
        const neighbors = [];
        const cellSize = BOND_DISTANCE_THRESHOLD;
        
        // Calculate grid cell indices
        const ix = Math.floor(atom.x / cellSize);
        const iy = Math.floor(atom.y / cellSize);
        const iz = Math.floor(atom.z / cellSize);
        
        // Check neighboring cells
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const key = `${ix + dx},${iy + dy},${iz + dz}`;
                    
                    // Add atoms from this cell if it exists
                    if (grid[key]) {
                        neighbors.push(...grid[key]);
                    }
                }
            }
        }
        
        return neighbors;
    }

    /**
     * Creates a cartoon representation of the protein structure.
     * @param {Array} atoms - Array of atom objects.
     * @returns {THREE.BufferGeometry} Geometry for cartoon representation.
     */
    createCartoonGeometry(atoms) {
        console.log(`Creating cartoon geometry from ${atoms.length} atoms`);
        
        // If atoms array is empty, return fallback
        if (!atoms || atoms.length === 0) {
            return this.createFallbackGeometry();
        }
        
        // Process atoms to extract chain and residue information
        const processedAtoms = this.preprocessAtoms(atoms);
        const { chainGroups } = processedAtoms;
        
        // Generate chain colors
        this.assignChainColors(Object.keys(chainGroups));
        
        // Create sphere geometry for individual atoms
        return this.createAtomSphereGeometry(atoms);
    }
    
    /**
     * Creates sphere representations for atoms.
     * @param {Array} atoms - Array of atom objects.
     * @returns {THREE.BufferGeometry} Combined sphere geometry.
     */
    createAtomSphereGeometry(atoms) {
        // Create template sphere
        const sphereTemplate = new THREE.SphereGeometry(0.2, 8, 6);
        
        // Arrays to store merged geometry data
        const positions = [];
        const normals = [];
        const colors = [];
        
        // Process each atom
        for (const atom of atoms) {
            const chainID = atom.chainID || 'A';
            const element = atom.element?.toUpperCase() || 'X';
            
            // Get chain color
            const chainColor = this.getChainColor(chainID);
            
            // Get element data
            const elementData = ELEMENT_DATA[element] || ELEMENT_DATA['X'];
            
            // Calculate sphere radius
            const radius = elementData.radius * 0.7; // Scale down for better visibility
            
            // Create transformation matrix
            const matrix = new THREE.Matrix4();
            matrix.makeTranslation(atom.x, atom.y, atom.z);
            matrix.scale(new THREE.Vector3(radius, radius, radius));
            
            // Add transformed sphere vertices
            const templatePositions = sphereTemplate.attributes.position.array;
            const templateNormals = sphereTemplate.attributes.normal.array;
            
            for (let i = 0; i < templatePositions.length; i += 3) {
                const vertex = new THREE.Vector3(
                    templatePositions[i],
                    templatePositions[i+1],
                    templatePositions[i+2]
                );
                vertex.applyMatrix4(matrix);
                
                // Add position
                positions.push(vertex.x, vertex.y, vertex.z);
                
                // Add normal
                const normal = new THREE.Vector3(
                    templateNormals[i],
                    templateNormals[i+1],
                    templateNormals[i+2]
                );
                normals.push(normal.x, normal.y, normal.z);
                
                // Add color
                colors.push(chainColor.r, chainColor.g, chainColor.b);
            }
        }
        
        // Create merged geometry
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        return geometry;
    }
    
    /**
     * Creates a fallback geometry (a red sphere) when other methods fail.
     * @returns {THREE.BufferGeometry} Simple fallback geometry.
     */
    createFallbackGeometry() {
        console.warn("Creating fallback sphere geometry");
        
        // Create a distinctive red sphere
        const geometry = new THREE.SphereGeometry(2, 16, 12);
        const colorArray = new Float32Array(geometry.attributes.position.count * 3);
        
        // Fill with red color
        for (let i = 0; i < colorArray.length; i += 3) {
            colorArray[i] = 1.0;     // Red
            colorArray[i + 1] = 0.0; // Green
            colorArray[i + 2] = 0.0; // Blue
        }
        
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
        return geometry;
    }

    /**
     * Applies a coloring mode to the protein object.
     * @param {THREE.Object3D} proteinObject - The protein object.
     * @param {string} mode - The coloring mode ('chain' or 'solid').
     * @param {object} [pdbData] - The PDB data.
     * @param {string|number} [solidColor] - The solid color.
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
            
            // Update uniforms if present
            if (material.uniforms) {
                if (material.uniforms.uUseSolidColor) {
                    material.uniforms.uUseSolidColor.value = false;
                }
                if (material.uniforms.uBaseColor) {
                    material.uniforms.uBaseColor.value.set(0xffffff);
                }
            }
            
            console.log("Applied chain coloring");
        } else if (mode === 'solid') {
            // Disable vertex colors
            material.vertexColors = false;
            
            // Update uniforms if present
            if (material.uniforms) {
                if (material.uniforms.uUseSolidColor) {
                    material.uniforms.uUseSolidColor.value = true;
                }
                if (material.uniforms.uBaseColor) {
                    material.uniforms.uBaseColor.value.set(solidColor);
                }
            } else if (material.color) {
                material.color.set(solidColor);
            }
            
            console.log("Applied solid color:", solidColor);
        }

        material.needsUpdate = true;
    }

    /**
     * Assigns colors to chains.
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
