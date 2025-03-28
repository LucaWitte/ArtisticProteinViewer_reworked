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
        console.log("Raw PDBLoader output:", pdbData);

        if (!pdbData || !pdbData.json || !pdbData.json.atoms) {
            throw new Error("Failed to parse PDB data or no atoms found.");
        }

        // Convert atom data from PDBLoader format to our required format
        const processedAtoms = [];
        const pdbAtoms = pdbData.json.atoms;
        
        console.log(`Found ${pdbAtoms.length} atoms in the PDB file`);
        
        // PDBLoader format: [x, y, z, colorArray, elementSymbol]
        for (let i = 0; i < pdbAtoms.length; i++) {
            const atom = pdbAtoms[i];
            
            // Extract data from PDBLoader format
            const x = atom[0];
            const y = atom[1];
            const z = atom[2];
            // atom[3] is the color array
            const element = atom[4];
            
            // Create object in our required format
            processedAtoms.push({
                serial: i + 1,
                name: element || 'X',
                altLoc: '',
                resName: 'UNK', // Placeholder for unknown residue
                chainID: 'A',   // Default chain ID
                resSeq: Math.floor(i / 10) + 1, // Group atoms into "residues" for visualization
                iCode: '',
                x: x,
                y: y,
                z: z,
                occupancy: 1.0,
                tempFactor: 0.0,
                element: element || 'X'
            });
        }
        
        console.log(`Successfully processed ${processedAtoms.length} atoms`);

        const helices = pdbData.json.helices || [];
        const sheets = pdbData.json.sheets || [];

        return {
            atoms: processedAtoms,
            helices: helices,
            sheets: sheets,
            geometryAtoms: pdbData.geometryAtoms,
            geometryBonds: pdbData.geometryBonds
        };
    }
}

export default ProteinLoader;
