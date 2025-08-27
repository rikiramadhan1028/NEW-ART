const { generationQueue } = require('../utils/jobQueue');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
const { ethers } = require('ethers');

const UPLOADS_TEMP_DIR = path.join(__dirname, '..', '..', 'uploads_temp');
const JOB_DATA_BASE_DIR = path.join(__dirname, '..', '..', 'job_data');

const WHITELIST_MANAGER_CONTRACT_ADDRESS = '0xAdDC5958Cb111A424e2ef1Ddcc2B4D0e132a8BdD';
const WHITELIST_MANAGER_ABI = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"OwnableInvalidOwner","type":"error"},{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"OwnableUnauthorizedAccount","type":"error"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_address","type":"address"}],"name":"AddressRemovedFromWhitelist","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_address","type":"address"}],"name":"AddressWhitelisted","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"inputs":[{"internalType":"address","name":"_address","type":"address"}],"name":"addAddressToWhitelist","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_address","type":"address"}],"name":"isWhitelisted","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_address","type":"address"}],"name":"removeAddressFromWhitelist","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}]

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const whitelistContract = new ethers.Contract(
  WHITELIST_MANAGER_CONTRACT_ADDRESS,
  WHITELIST_MANAGER_ABI,
  provider
);


exports.requestGeneration = async (req, res) => {
  const { nftCount, collectionName, collectionDescription, baseIpfsImageUrl, baseExternalUrl, userAddress, compressImages, outputFormat } = req.body;
  const uploadedFile = req.file;

  const shouldOptimizeFileSize = (compressImages === 'true'); 

  if (!nftCount || !collectionName || !collectionDescription || !uploadedFile || !userAddress) {
    return res.status(400).json({ error: 'Missing required data: NFT count, collection name/description, asset zip file, or user address.' });
  }

  try {
    const isWhitelisted = await whitelistContract.isWhitelisted(userAddress);
    if (!isWhitelisted) {
      console.warn(`[Backend Security] Unauthorized generation attempt by non-whitelisted address: ${userAddress}`);
      return res.status(403).json({ error: 'Your wallet is not whitelisted to generate NFTs. Please contact the owner.' });
    }
    console.log(`[Backend Security] Whitelist check passed for ${userAddress}.`);
  } catch (error) {
    console.error(`[Backend Security] Error checking whitelist status for ${userAddress}:`, error);
    return res.status(500).json({ error: 'Failed to verify whitelist status. Please try again later.' });
  }


  if (uploadedFile.mimetype !== 'application/zip' && uploadedFile.mimetype !== 'application/x-zip-compressed') {
    await fs.unlink(uploadedFile.path).catch(err => console.error("Error deleting non-zip file:", err));
    return res.status(400).json({ error: 'Uploaded file must be a .zip archive.' });
  }

  const jobId = `gen-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const jobInputLayersDir = path.join(JOB_DATA_BASE_DIR, jobId, 'input_layers');
  const jobGeneratedOutputDir = path.join(JOB_DATA_BASE_DIR, jobId, 'generated_output');


  try {
    await fs.mkdir(jobInputLayersDir, { recursive: true });
    await fs.mkdir(jobGeneratedOutputDir, { recursive: true });

    const zip = new AdmZip(uploadedFile.path);
    zip.extractAllTo(jobInputLayersDir, true);
    
    await fs.unlink(uploadedFile.path).catch(err => console.error("Error deleting uploaded zip file:", err));

    const layersConfig = await buildLayersConfig(jobInputLayersDir); 
    if (layersConfig.length === 0) {
      throw new Error("No valid image files (PNG/JPG/JPEG/GIF) found in the uploaded zip file.");
    }
    
    await generationQueue.add('generate-nft-job', {
      jobId,
      nftCount: parseInt(nftCount),
      userAddress: userAddress,
      collectionName,
      collectionDescription,
      baseIpfsImageUrl: baseIpfsImageUrl,
      baseExternalUrl: baseExternalUrl,
      layersConfig,
      jobInputLayersDir: jobInputLayersDir,
      jobGeneratedOutputDir: jobGeneratedOutputDir,
      compressImages: shouldOptimizeFileSize,
      outputFormat: outputFormat || 'png',
    }, { jobId: jobId });

    res.status(202).json({
      message: 'NFT generation request accepted. Processing.',
      jobId: jobId
    });

  } catch (error) {
    console.error(`Error processing job ${jobId}:`, error);
    await fs.rm(jobInputLayersDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(jobGeneratedOutputDir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({ error: `Failed to process generation request: ${error.message}` });
  }
};

async function buildLayersConfig(assetsPath) {
    const layersConfig = [];
    const layerFolders = await fs.readdir(assetsPath, { withFileTypes: true });
    
    for (const dirent of layerFolders) {
        if (dirent.isDirectory()) {
            const layerName = dirent.name;
            const layerDirPath = path.join(assetsPath, layerName);
            const traitFiles = await fs.readdir(layerDirPath);
            
            const traits = [];
            for (const file of traitFiles) {
                if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg') || file.endsWith('.gif')) {
                    const filePath = path.join(layerDirPath, file);
                    try {
                        await sharp(filePath).metadata(); 
                        traits.push({
                            name: path.parse(file).name,
                            file: file,
                            rarity: 1
                        });
                    } catch (imageError) {
                        throw new Error(`Invalid image file ${file} in layer ${layerName}: ${imageError.message}`);
                    }
                }
            }
            
            if (traits.length > 0) {
                layersConfig.push({
                    name: layerName,
                    directory: layerName,
                    traits: traits
                });
            }
        }
    }
    return layersConfig;
}