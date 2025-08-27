const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs').promises;
const archiver = require('archiver');
const { createWriteStream } = require('fs');
const { v4: uuidv4 } = require('uuid');

const JOB_DATA_BASE_DIR = path.join(__dirname, '..', '..', 'job_data');
const UPLOADS_TEMP_DIR = path.join(__dirname, '..', '..', 'uploads_temp');

exports.updateMetadata = async (req, res) => {
    const { imageIpfsCid, imageIpfsGatewayUrl } = req.body;
    const uploadedFile = req.file;

    // --- DEBUGGING: Log data yang diterima ---
    console.log("--- METADATA UPDATE REQUEST RECEIVED ---");
    console.log("imageIpfsCid:", imageIpfsCid);
    console.log("imageIpfsGatewayUrl:", imageIpfsGatewayUrl);
    console.log("uploadedFile:", uploadedFile ? uploadedFile.originalname : "No file");
    console.log("---------------------------------------");

    if (!imageIpfsCid || !uploadedFile || !imageIpfsGatewayUrl) {
        return res.status(400).json({ error: 'Missing required data: Image IPFS CID, Image IPFS Gateway URL, or metadata zip file.' });
    }
    if (uploadedFile.mimetype !== 'application/zip' && uploadedFile.mimetype !== 'application/x-zip-compressed') {
        await fs.unlink(uploadedFile.path).catch(err => console.error("Error deleting non-zip file:", err));
        return res.status(400).json({ error: 'Uploaded file must be a .zip archive.' });
    }

    const jobId = uuidv4();
    const jobMetadataDir = path.join(JOB_DATA_BASE_DIR, jobId, 'updated_metadata');
    const outputZipPath = path.join(JOB_DATA_BASE_DIR, jobId, `${jobId}.zip`);

    try {
        await fs.mkdir(jobMetadataDir, { recursive: true });

        const zip = new AdmZip(uploadedFile.path);
        zip.extractAllTo(jobMetadataDir, true);
        await fs.unlink(uploadedFile.path).catch(err => console.error("Error deleting uploaded zip file:", err));
        console.log(`Extracted metadata zip to ${jobMetadataDir}`);


        const metadataFiles = await fs.readdir(jobMetadataDir);
        const finalImageGatewayUrl = `${imageIpfsGatewayUrl}${imageIpfsCid}/`;
        console.log(`Final image gateway URL to use: ${finalImageGatewayUrl}`);
        
        console.log(`Found ${metadataFiles.length} files in extracted zip.`);

        for (const file of metadataFiles) {
            if (file.endsWith('.json')) {
                const filePath = path.join(jobMetadataDir, file);
                const originalMetadata = JSON.parse(await fs.readFile(filePath, 'utf8'));

                // --- DEBUGGING: Tampilkan metadata sebelum dan sesudah update ---
                console.log(`Updating file: ${file}`);
                console.log("Original metadata.image:", originalMetadata.image);

                // Perbarui field 'image'
                originalMetadata.image = `${finalImageGatewayUrl}${file.replace('.json', '.png')}`;
                
                console.log("Updated metadata.image:", originalMetadata.image);

                await fs.writeFile(filePath, JSON.stringify(originalMetadata, null, 4));
            }
        }
        console.log("All metadata files processed and updated.");

        await new Promise((resolve, reject) => {
            const output = createWriteStream(outputZipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', resolve);
            archive.on('warning', (err) => { if (err.code === 'ENOENT') console.warn(`[Archiver Warning]: ${err.message}`); else reject(err); });
            archive.on('error', reject);

            archive.pipe(output);
            archive.directory(jobMetadataDir, 'metadata');
            archive.finalize();
        });
        console.log("Metadata re-zipped successfully.");

        await fs.rm(jobMetadataDir, { recursive: true, force: true }).catch(err => console.error(`Failed to clean up metadata directory:`, err));

        res.status(200).json({
            message: 'Metadata updated successfully!',
            zipDownloadUrl: `/api/download/${jobId}/${jobId}.zip`,
            jobId: jobId
        });

    } catch (error) {
        console.error(`Error updating metadata for job ${jobId}:`, error);
        await fs.rm(jobMetadataDir, { recursive: true, force: true }).catch(() => {});
        res.status(500).json({ error: `Failed to update metadata: ${error.message}` });
    }
};