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
        console.log("Raw PDBLoader output:", pdbData); // Let's see what we're getting
        // console.log("Raw PDBLoader output:", pdbData); // For debugging

        if (!pdbData || !pdbData.json || !pdbData.json.atoms) {
            throw new Error("Failed to parse PDB data or no atoms found.");
        }

        // Extract necessary information
        const atoms = pdbData.json.atoms.map(atom => {
        // Skip invalid atoms
        if (!atom || atom.length < 13) {
            console.warn("Malformed atom entry:", atom);
            return null;
        }
        
        return {
            serial: atom[0] || 0,
            name: typeof atom[1] === 'string' ? atom[1].trim() : String(atom[1] || ''),
            altLoc: atom[2] || '',
            resName: atom[3] || '',
            chainID: atom[4] || '',
            resSeq: atom[5] || 0,
            iCode: atom[6] || '',
            x: atom[7] || 0,
            y: atom[8] || 0,
            z: atom[9] || 0,
            occupancy: atom[10] || 0,
            tempFactor: atom[11] || 0,
            element: typeof atom[12] === 'string' ? atom[12].trim() : String(atom[12] || '')
        };
    }).filter(atom => atom !== null); // Remove any null atoms

        // Extract HELIX and SHEET records (adjust based on PDBLoader's output structure)
        // PDBLoader puts them directly in the json object
        const helices = pdbData.json.helices || [];
        const sheets = pdbData.json.sheets || [];

        // Simple validation
        if (atoms.length === 0) {
             console.warn("PDB parsed successfully, but no atoms were found in the JSON structure.");
             // Don't throw an error yet, maybe it's an empty file or unusual format
        }


        return {
            atoms: atoms,
            helices: helices, // [ [chainId, initialResidue, initialICode, endResidue, endICode, helixClass, comment, length], ... ]
            sheets: sheets    // [ [chainId, initialResidue, initialICode, endResidue, endICode, sense], ... ]
            // Add geometryAtoms/geometryBonds if needed later:
            // geometryAtoms: pdbData.geometryAtoms,
            // geometryBonds: pdbData.geometryBonds
        };
    }
}

export default ProteinLoader;
