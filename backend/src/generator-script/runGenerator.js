const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

async function generateCollection({
  nftCount,
  collectionName,
  collectionDescription,
  baseIpfsImageUrl = "ipfs://YOUR_IPFS_CID_PLACEHOLDER/",
  baseExternalUrl,
  layersConfig,
  jobInputLayersDir,
  outputJobDir
}) {
  const IMAGES_DIR = path.join(outputJobDir, "images");
  const METADATA_DIR = path.join(outputJobDir, "metadata");

  await fs.mkdir(IMAGES_DIR, { recursive: true });
  await fs.mkdir(METADATA_DIR, { recursive: true });
  console.log(`[Generator] Output directories "${IMAGES_DIR}" and "${METADATA_DIR}" are ready.`);

  const generatedCombinations = new Set();
  let currentNftCount = 0;

  console.log(`[Generator] Starting generation of ${nftCount} NFTs...`);

  while (currentNftCount < nftCount) {
    const selectedTraits = [];
    const selectedLayerPaths = [];
    const combinationStringParts = [];

    for (const layer of layersConfig) {
        const chosenTrait = getRandomTrait(layer.traits);
        
        selectedTraits.push({
            trait_type: layer.name,
            value: chosenTrait.name
        });
        selectedLayerPaths.push({
            layerName: layer.name,
            path: path.join(jobInputLayersDir, layer.directory, chosenTrait.file)
        });
        combinationStringParts.push(`${layer.name}:${chosenTrait.name}`);
    }

    const currentCombination = combinationStringParts.sort().join(';');

    if (generatedCombinations.has(currentCombination)) {
        continue;
    }

    generatedCombinations.add(currentCombination);
    const nftId = currentNftCount;
    currentNftCount++;

    try {
        const imageOutputPath = path.join(IMAGES_DIR, `${nftId}.png`);
        await generateImage(selectedLayerPaths, imageOutputPath);
        
        const external_url = baseExternalUrl ? `${baseExternalUrl}` : undefined;

        const metadata = {
            name: `${collectionName} #${nftId}`,
            description: collectionDescription,
            image: `${baseIpfsImageUrl}${nftId}.png`,
            external_url: external_url,
            attributes: selectedTraits
        };
        const metadataPath = path.join(METADATA_DIR, `${nftId}.json`);
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 4));

        console.log(`[Generator] Successfully created NFT #${nftId} in ${outputJobDir}`);

    } catch (error) {
        console.error(`[Generator] Failed to create NFT #${nftId}:`, error);
        if (currentNftCount > 0) currentNftCount--;
    }
  }

  console.log(`[Generator] Generation complete for ${nftCount} NFTs.`);
  return {
    imagesPath: IMAGES_DIR,
    metadataPath: METADATA_DIR,
    finalNftCount: currentNftCount
  };
}

function getRandomTrait(traits) {
  const totalRarity = traits.reduce((sum, trait) => sum + trait.rarity, 0);
  let randomNumber = Math.random() * totalRarity;

  for (const trait of traits) {
      if (randomNumber < trait.rarity) {
          return trait;
      }
      randomNumber -= trait.rarity;
  }
  return traits[traits.length - 1];
}

async function generateImage(selectedLayerPaths, outputPath) {
    if (selectedLayerPaths.length === 0) {
        throw new Error("No layers selected for composition.");
    }
    
    const targetDimension = 1000;

    let baseImageBuffer = await sharp(selectedLayerPaths[0].path)
        .resize(targetDimension, targetDimension, { fit: 'cover', position: 'centre' })
        .toBuffer();

    const composites = [];
    for (let i = 1; i < selectedLayerPaths.length; i++) {
        const layerBuffer = await sharp(selectedLayerPaths[i].path)
            .resize(targetDimension, targetDimension, { fit: 'cover', position: 'centre' })
            .toBuffer();
        composites.push({
            input: layerBuffer,
            blend: 'over'
        });
    }

    let composer = sharp(baseImageBuffer);
    if (composites.length > 0) {
        composer = composer.composite(composites);
    }
    
    await composer.png().toFile(outputPath);
}

module.exports = { generateCollection };