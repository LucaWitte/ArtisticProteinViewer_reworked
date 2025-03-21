/**
 * Parses a PDB file into structured data for Three.js rendering.
 * @param {string} pdbText - Raw PDB file content.
 * @returns {Object} - Parsed protein data with atoms, bonds, secondary structures, and chains.
 * @throws {Error} - If no valid atoms are found or if the PDB text is malformed.
 */
export function parsePDB(pdbText) {
    if (typeof pdbText !== 'string' || pdbText.trim() === '') {
        throw new Error('Invalid PDB text provided');
    }

    const lines = pdbText.split('\n');
    const atoms = [];
    const bonds = [];
    const secondaryStructures = { helices: [], sheets: [] };
    const chains = new Set();

    lines.forEach((line, index) => {
        try {
            if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
                const atom = {
                    serial: parseInt(line.slice(6, 11).trim()) || 0,
                    name: line.slice(12, 16).trim() || 'UNK',
                    resName: line.slice(17, 20).trim() || 'UNK',
                    chainID: line.slice(21, 22).trim() || 'A',
                    resSeq: parseInt(line.slice(22, 26).trim()) || 0,
                    x: parseFloat(line.slice(30, 38).trim()) || 0,
                    y: parseFloat(line.slice(38, 46).trim()) || 0,
                    z: parseFloat(line.slice(46, 54).trim()) || 0,
                    occupancy: parseFloat(line.slice(54, 60).trim()) || 1.0,
                    tempFactor: parseFloat(line.slice(60, 66).trim()) || 0.0,
                    element: line.slice(76, 78).trim() || line.slice(12, 16).trim()[0] || 'C'
                };
                atoms.push(atom);
                chains.add(atom.chainID);
            } else if (line.startsWith('CONECT')) {
                const connect = line.slice(6).trim().split(/\s+/).map(Number);
                if (connect.length < 2) return;
                const atomSerial = connect[0];
                connect.slice(1).forEach((targetSerial) => {
                    if (!isNaN(targetSerial)) {
                        bonds.push([atomSerial, targetSerial]);
                    }
                });
            } else if (line.startsWith('HELIX')) {
                secondaryStructures.helices.push({
                    startChain: line.slice(19, 20).trim() || 'A',
                    startRes: parseInt(line.slice(21, 25).trim()) || 0,
                    endChain: line.slice(31, 32).trim() || 'A',
                    endRes: parseInt(line.slice(33, 37).trim()) || 0
                });
            } else if (line.startsWith('SHEET')) {
                secondaryStructures.sheets.push({
                    startChain: line.slice(21, 22).trim() || 'A',
                    startRes: parseInt(line.slice(22, 26).trim()) || 0,
                    endChain: line.slice(32, 33).trim() || 'A',
                    endRes: parseInt(line.slice(33, 37).trim()) || 0
                });
            }
        } catch (e) {
            console.warn(`Error parsing line ${index + 1}: ${line}`, e);
        }
    });

    if (atoms.length === 0) {
        throw new Error('No valid atoms found in PDB file');
    }

    return { atoms, bonds, secondaryStructures, chains: Array.from(chains) };
}
