// backend/src/services/ipfsService.js
const lighthouse = require('@lighthouse-web3/sdk');
const path = require('path');
const fs = require('fs').promises;
const archiver = require('archiver');
const { createWriteStream, createReadStream } = require('fs');

const LIGHTHOUSE_API_KEY = process.env.LIGHTHOUSE_API_KEY;

async function uploadFolderToIpfs(folderPath) {
    if (!LIGHTHOUSE_API_KEY) {
        throw new Error("LIGHTHOUSE_API_KEY is not set in environment variables.");
    }

    const zipFileName = `${path.basename(folderPath)}.zip`;
    const zipFilePath = path.join(path.dirname(folderPath), zipFileName);

    try {
        const stats = await fs.stat(folderPath);
        if (!stats.isDirectory()) {
            throw new Error(`Path ${folderPath} is not a directory.`);
        }

        console.log(`[IPFS Service - Lighthouse] Zipping folder: ${folderPath} to ${zipFilePath}`);
        await new Promise((resolve, reject) => {
            const output = createWriteStream(zipFilePath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            output.on('close', resolve);
            archive.on('warning', (err) => { if (err.code === 'ENOENT') console.warn(`[Archiver Warning]: ${err.message}`); else reject(err); });
            archive.on('error', reject);
            archive.pipe(output);
            archive.directory(folderPath, false);
            archive.finalize();
        });
        console.log(`[IPFS Service - Lighthouse] Zipping complete: ${zipFilePath}`);

        console.log(`[IPFS Service - Lighthouse] Attempting to pin ZIP file: ${zipFilePath}`);

        let uploadResponse;
        try {
            uploadResponse = await lighthouse.upload(zipFilePath, LIGHTHOUSE_API_KEY, {});
            console.log(`[IPFS Service - Lighthouse] Raw successful upload response from Lighthouse:`, uploadResponse);
            const cid = uploadResponse && uploadResponse.data ? uploadResponse.data.Hash : undefined;
            if (!cid) {
                console.error(`[IPFS Service - Lighthouse] Lighthouse upload returned unexpected structure or missing CID:`, uploadResponse);
                throw new Error("Lighthouse upload did not return a valid CID or response was malformed.");
            }
            return cid;
        } catch (uploadError) {
            // This catch block will specifically log the error details from the Lighthouse SDK
            console.error(`[IPFS Service - Lighthouse] Error from lighthouse.upload SDK call:`);
            console.error("  Error object:", uploadError);
            // If the error object has a 'response' property (common in HTTP clients like Axios, which SDKs might use)
            if (uploadError.response) { 
                console.error("  HTTP Response Status:", uploadError.response.status);
                console.error("  HTTP Response Data (this is crucial!):", uploadError.response.data); 
            } else if (typeof uploadError === 'string') {
                console.error("  Error is a string:", uploadError);
            }
            // Re-throw the error to be handled by the job worker
            throw new Error(`Lighthouse SDK upload failed: ${uploadError.message || uploadError.toString()}`);
        }

    } catch (error) {
        console.error(`[IPFS Service - Lighthouse] Overall error in uploadFolderToIpfs:`, error);
        // Attempt to clean up temporary zip file in case of error
        await fs.unlink(zipFilePath).catch(err => console.error(`Failed to delete temporary zip file ${zipFilePath} during error:`, err));
        throw new Error(`Failed to upload to IPFS via Lighthouse: ${error.message}`);
    } finally {
        // Ensure temporary zip file is always cleaned up, even if there's an error
        await fs.unlink(zipFilePath).catch(err => console.error(`Failed to delete temporary zip file ${zipFilePath} in finally block:`, err));
    }
}

module.exports = {
    uploadFolderToIpfs
};