// js/core/ProteinLoader.js
import * as THREE from '../vendor/three.module.js';
import { PDBLoader } from '../vendor/PDBLoader.js';

class ProteinLoader {
    constructor() {
        this.pdbLoader = new PDBLoader();
    }

    /**
     * Loads a PDB file from a File object (from input element).
     * @param {File} file - The File object to load.
     * @returns {Promise<object>} A promise that resolves with the processed PDB data.
     */
    loadFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const pdbText = event.target.result;
                    const processedData = this.parsePDB(pdbText);
                    resolve(processedData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = (event) => {
                reject(new Error(`File reading error: ${event.target.error}`));
            };
            reader.readAsText(file);
        });
    }

    /**
     * Loads a PDB file from a URL (for examples).
     * @param {string} url - The URL of the PDB file.
     * @returns {Promise<object>} A promise that resolves with the processed PDB data.
     */
    loadExample(url) {
        return new Promise(async (resolve, reject) => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status} for ${url}`);
                }
                const pdbText = await response.text();
                const processedData = this.parsePDB(pdbText);
                resolve(processedData);
            } catch (error) {
                console.error(`Failed to fetch or parse example PDB from ${url}:`, error);
                reject(error);
            }
        });
    }

    /**
     * Parses PDB text content using THREE.PDBLoader and extracts relevant information.
     * @param {string} pdbText - The PDB file content as a string.
     * @returns {object} Processed data including atoms, helices, and sheets.
     */
    parsePDB(pdbText) {
        const pdbData = this.pdbLoader.parse(pdbText);
        
        console.log("Raw PDBLoader output structure:", {
            hasGeometryAtoms: !!pdbData.geometryAtoms,
            hasGeometryBonds: !!pdbData.geometryBonds,
            hasJson: !!pdbData.json,
            atomsCount: pdbData.json?.atoms?.length || 0
        });

        // Handle the case where direct access to atoms is needed
        // PDBLoader stores atoms in json.atoms as [x, y, z, color, element]
        const processedAtoms = [];
        
        if (pdbData.json && pdbData.json.atoms && pdbData.json.atoms.length > 0) {
            // Convert atom data from PDBLoader format to our required format
            for (let i = 0; i < pdbData.json.atoms.length; i++) {
                const atom = pdbData.json.atoms[i];
                
                // Skip if atom is not in expected format
                if (!atom || atom.length < 5) {
                    console.warn("Skipping invalid atom:", atom);
                    continue;
                }

                const x = atom[0];
                const y = atom[1];
                const z = atom[2];
                const element = atom[4]; // Element symbol

                processedAtoms.push({
                    serial: i + 1,
                    name: element,
                    altLoc: '',
                    resName: 'UNK', // Unknown residue name as default
                    chainID: 'A',   // Default chain ID
                    resSeq: i + 1,
                    iCode: '',
                    x: x,
                    y: y,
                    z: z,
                    occupancy: 1.0,
                    tempFactor: 0.0,
                    element: element
                });
            }
        } else {
            // Alternative approach using the geometry data
            if (pdbData.geometryAtoms) {
                const positions = pdbData.geometryAtoms.getAttribute('position');
                const colors = pdbData.geometryAtoms.getAttribute('color');
                
                if (positions && positions.count > 0) {
                    for (let i = 0; i < positions.count; i++) {
                        const x = positions.getX(i);
                        const y = positions.getY(i);
                        const z = positions.getZ(i);
                        
                        // We don't have element info from geometry, use position index
                        const element = 'X'; // Default element when unknown
                        
                        processedAtoms.push({
                            serial: i + 1,
                            name: element,
                            altLoc: '',
                            resName: 'UNK',
                            chainID: 'A',
                            resSeq: i + 1,
                            iCode: '',
                            x: x,
                            y: y,
                            z: z,
                            occupancy: 1.0,
                            tempFactor: 0.0,
                            element: element
                        });
                    }
                }
            }
        }

        // Handle no atoms case
        if (processedAtoms.length === 0) {
            console.warn("No atoms could be processed from the PDB data");
        } else {
            console.log(`Successfully processed ${processedAtoms.length} atoms`);
        }

        return {
            atoms: processedAtoms,
            helices: pdbData.json?.helices || [],
            sheets: pdbData.json?.sheets || [],
            // Include the original geometry data for visualization if needed later
            geometryAtoms: pdbData.geometryAtoms,
            geometryBonds: pdbData.geometryBonds
        };
    }
}

export default ProteinLoader;
