import { parsePDB } from '../../utils/pdbParser.js';

export function initFileUploader(callback) {
    const uploader = document.createElement('input');
    uploader.type = 'file';
    uploader.accept = '.pdb';
    uploader.style.cssText = 'position: absolute; top: 10px; left: 10px;';
    document.body.appendChild(uploader);

    uploader.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const proteinData = parsePDB(e.target.result);
                callback(proteinData);
            } catch (error) {
                alert(`Error parsing PDB file: ${error.message}`);
            }
        };
        reader.onerror = () => alert('Error reading file');
        reader.readAsText(file);
    });
}
