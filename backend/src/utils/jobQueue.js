const { Queue, Worker } = require('bullmq');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const archiver = require('archiver');
const { createWriteStream } = require('fs');
const { generateCollection } = require('../generator-script/runGenerator');

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Main queue for NFT generation jobs
const generationQueue = new Queue('nft-generation', { connection });

// NEW: Queue for cleanup jobs
const cleanupQueue = new Queue('cleanup', { connection });

const jobResults = {};

// Helper function to apply file size compression to a single image file
async function compressImageFile(filePath) {
    const outputBuffer = await sharp(filePath)
        .toFormat(path.extname(filePath).toLowerCase() === '.png' ? 'png' : 'jpeg', {
            quality: 80,
            compressionLevel: 9
        })
        .toBuffer();
    
    await fs.writeFile(filePath, outputBuffer);
    console.log(`[Worker] Optimized file size for: ${filePath}`);
}

// Helper function to recursively apply file size compression to images within a directory
async function compressImagesInDirectory(directoryPath) {
    const dirents = await fs.readdir(directoryPath, { withFileTypes: true });
    for (const dirent of dirents) {
        const fullPath = path.join(directoryPath, dirent.name);
        if (dirent.isDirectory()) {
            await compressImagesInDirectory(fullPath);
        } else if (dirent.isFile() && (dirent.name.endsWith('.png') || dirent.name.endsWith('.jpg') || dirent.name.endsWith('.jpeg'))) {
            await compressImageFile(fullPath);
        }
    }
}


const generationWorker = new Worker('nft-generation', async (job) => {
  const { jobId, nftCount, userAddress, collectionName, collectionDescription, layersConfig, jobInputLayersDir, jobGeneratedOutputDir, compressImages, baseExternalUrl } = job.data;
  const IMAGES_LOCAL_PATH = path.join(jobGeneratedOutputDir, "images");
  const METADATA_LOCAL_PATH = path.join(jobGeneratedOutputDir, "metadata");

  console.log(`[Worker ${jobId}] Processing job for user ${userAddress}, ${nftCount} NFTs...`);

  try {
    console.log(`[Worker ${jobId}] Starting image and metadata generation.`);
    await generateCollection({
      nftCount,
      collectionName,
      collectionDescription,
      layersConfig,
      jobInputLayersDir,
      outputJobDir: jobGeneratedOutputDir,
      baseExternalUrl
    });
    console.log(`[Worker ${jobId}] Image generation complete.`);
    
    await fs.rm(jobInputLayersDir, { recursive: true, force: true }).catch(err => console.error(`[Worker ${jobId}] Failed to clean up user input assets:`, err));

    if (compressImages) {
        console.log(`[Worker ${jobId}] Optimizing file sizes of generated NFT images in ${IMAGES_LOCAL_PATH}.`);
        await compressImagesInDirectory(IMAGES_LOCAL_PATH);
        console.log(`[Worker ${jobId}] Generated image file size optimization complete.`);
    }

    const outputZipPath = path.join(jobGeneratedOutputDir, `${jobId}.zip`);
    console.log(`[Worker ${jobId}] Zipping generated files to: ${outputZipPath}`);
    
    await new Promise((resolve, reject) => {
        const output = createWriteStream(outputZipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        archive.on('warning', (err) => { if (err.code === 'ENOENT') console.warn(`[Archiver Warning]: ${err.message}`); else reject(err); });
        archive.on('error', reject);

        archive.pipe(output);
        archive.directory(IMAGES_LOCAL_PATH, 'images');
        archive.directory(METADATA_LOCAL_PATH, 'metadata');
        archive.finalize();
    });
    console.log(`[Worker ${jobId}] Zipping complete.`);
    
    await fs.rm(IMAGES_LOCAL_PATH, { recursive: true, force: true }).catch(err => console.error(`[Worker ${jobId}] Failed to clean up generated images:`, err));
    await fs.rm(METADATA_LOCAL_PATH, { recursive: true, force: true }).catch(err => console.error(`[Worker ${jobId}] Failed to clean up generated metadata:`, err));
    
    console.log(`[Worker ${jobId}] Job fully completed! Zip file ready for download.`);
    
    return {
      success: true,
      jobId: jobId,
      zipDownloadUrl: `/api/download/${jobId}/generated_output/${jobId}.zip`,
      status: 'COMPLETED_FOR_DOWNLOAD',
      // CRITICAL FIX: Return the job output directory so the event listener can access it
      jobGeneratedOutputDir: jobGeneratedOutputDir
    };

  } catch (error) {
    console.error(`[Worker ${jobId}] Error processing job:`, error);
    await fs.rm(jobInputLayersDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(jobGeneratedOutputDir, { recursive: true, force: true }).catch(() => {});
    throw new Error(`NFT generation failed for job ${jobId}: ${error.message}`);
  }
}, { connection });


// NEW: Worker for cleanup jobs
const cleanupWorker = new Worker('cleanup', async (job) => {
    const { jobId, jobDir } = job.data;
    console.log(`[Cleanup Worker] Starting cleanup for job ${jobId} at directory: ${jobDir}`);
    try {
        await fs.rm(jobDir, { recursive: true, force: true });
        console.log(`[Cleanup Worker] Successfully cleaned up directory for job ${jobId}.`);
    } catch (error) {
        console.error(`[Cleanup Worker] Failed to clean up directory for job ${jobId}:`, error);
    }
}, { connection });


// Event listener for successfully completed generation jobs
generationWorker.on('completed', (job) => {
  console.log(`Job ${job.id} finished! Result:`, job.returnvalue);
  // Store the job result in our in-memory store
  jobResults[job.id] = job.returnvalue;
  jobResults[job.id].status = 'COMPLETED_FOR_DOWNLOAD';

  // CRITICAL FIX: Get the jobGeneratedOutputDir from the job.returnvalue
  const jobIdToClean = job.returnvalue.jobId;
  const jobDirToClean = job.returnvalue.jobGeneratedOutputDir;

  // NEW: Add a cleanup job to the queue with a 2-hour delay
  const CLEANUP_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours
  
  cleanupQueue.add('cleanup-job', {
    jobId: jobIdToClean,
    jobDir: jobDirToClean // Pass the correct directory path
  }, {
      delay: CLEANUP_DELAY_MS,
      jobId: `cleanup-${jobIdToClean}`
  });
  console.log(`[Cleanup Scheduler] Scheduled cleanup for job ${jobIdToClean} in 2 hours at ${jobDirToClean}.`);
});

// Event listener for failed generation jobs
generationWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with error:`, err);
  jobResults[job.id] = { status: 'FAILED', error: err.message };
  
  // Clean up failed job files immediately to free up space
  // CRITICAL FIX: Get the jobGeneratedOutputDir from the original job data
  const jobDirToClean = job.data.jobGeneratedOutputDir;
  fs.rm(jobDirToClean, { recursive: true, force: true }).catch(err => console.error(`Failed to clean up failed job directory:`, err));
});

module.exports = {
  generationQueue,
  jobResults
};