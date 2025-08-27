const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip'); // Diperlukan untuk menangani file ZIP

// Fungsi pembantu untuk mendapatkan buffer gambar dari path,
// bisa dari file biasa atau dari dalam arsip ZIP.
async function getBufferFromPath(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.zip') {
        // Asumsi: kita mencari file gambar pertama yang didukung di dalam ZIP.
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();
        const imageEntry = zipEntries.find(entry => {
            const entryExt = path.extname(entry.entryName).toLowerCase();
            return ['.gif', '.png', '.jpg', '.jpeg'].includes(entryExt);
        });

        if (imageEntry) {
            console.log(`[Generator] Mengekstrak gambar dari ZIP: ${imageEntry.entryName}`);
            return imageEntry.getData(); // Mengembalikan Buffer
        } else {
            throw new Error(`Tidak ada file gambar yang didukung (.gif, .png, .jpg) ditemukan di arsip zip '${filePath}'`);
        }
    } else {
        return fs.readFile(filePath);
    }
}


async function generateCollection({
  nftCount,
  collectionName,
  collectionDescription,
  baseIpfsImageUrl = "ipfs://YOUR_IPFS_CID_PLACEHOLDER/",
  baseExternalUrl,
  outputFormat = 'png', // Tambahkan parameter format output, default 'png'
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
        // Gunakan outputFormat untuk menentukan ekstensi file
        const imageOutputPath = path.join(IMAGES_DIR, `${nftId}.${outputFormat}`);
        // Teruskan outputFormat ke fungsi generateImage
        await generateImage(selectedLayerPaths, imageOutputPath, outputFormat);
        
        const external_url = baseExternalUrl ? `${baseExternalUrl}` : undefined;

        const metadata = {
            name: `${collectionName} #${nftId}`,
            description: collectionDescription,
            // Sesuaikan juga ekstensi file di metadata
            image: `${baseIpfsImageUrl}${nftId}.${outputFormat}`,
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

async function generateImage(selectedLayerPaths, outputPath, format = 'png') {
    if (selectedLayerPaths.length === 0) {
        throw new Error("No layers selected for composition.");
    }
    
    const targetDimension = 1000;

    // Dapatkan buffer untuk gambar dasar, tangani file ZIP
    const baseImageBuffer = await getBufferFromPath(selectedLayerPaths[0].path);

    // Inisialisasi sharp untuk gambar dasar.
    // `{ animated: true }` penting untuk mempertahankan animasi jika gambar dasar adalah GIF.
    let baseSharpInstance = sharp(baseImageBuffer, { animated: true });

    // Baca dan cetak metadata jika gambar dasar adalah GIF
    const baseImageMetadata = await baseSharpInstance.metadata();
    if (baseImageMetadata.format === 'gif') {
        console.log(`[Generator] Metadata for base GIF layer:`, {
            width: baseImageMetadata.width,
            height: baseImageMetadata.height,
            pages: baseImageMetadata.pages, // Jumlah frame
            loop: baseImageMetadata.loop,   // Jumlah loop (0 = tak terbatas)
            delay: baseImageMetadata.delay  // Durasi per frame
        });
    }

    // Resize gambar dasar
    baseSharpInstance = baseSharpInstance.resize(targetDimension, targetDimension, { fit: 'cover', position: 'centre' });

    const composites = [];
    for (let i = 1; i < selectedLayerPaths.length; i++) {
        // Dapatkan buffer untuk setiap layer, tangani file ZIP
        const layerBuffer = await getBufferFromPath(selectedLayerPaths[i].path);

        // Baca dan cetak metadata jika layer adalah GIF
        const layerMetadata = await sharp(layerBuffer).metadata();
        if (layerMetadata.format === 'gif') {
            console.log(`[Generator] Metadata for overlay GIF layer '${selectedLayerPaths[i].layerName}':`, {
                pages: layerMetadata.pages
            });
            // Peringatan: sharp.composite() hanya akan menggunakan frame pertama dari overlay GIF.
            if (layerMetadata.pages > 1) {
                console.warn(`[Generator] Warning: Overlay layer '${selectedLayerPaths[i].layerName}' is an animated GIF. Only the first frame will be used in the composition.`);
            }
        }

        // Resize layer dan tambahkan ke komposisi
        const resizedLayerBuffer = await sharp(layerBuffer)
            .resize(targetDimension, targetDimension, { fit: 'cover', position: 'centre' })
            .toBuffer();
        composites.push({
            input: resizedLayerBuffer,
            blend: 'over'
        });
    }

    let composer = baseSharpInstance;
    if (composites.length > 0) {
        composer = composer.composite(composites);
    }
    
    // Pilih format output berdasarkan parameter
    if (format.toLowerCase() === 'gif') {
        console.log(`[Generator] Saving image as GIF: ${outputPath}`);
        // Jika gambar dasar adalah GIF animasi, output juga akan animasi.
        // Jika tidak, akan menjadi GIF statis.
        await composer.gif().toFile(outputPath);
    } else {
        console.log(`[Generator] Saving image as PNG: ${outputPath}`);
        await composer.png().toFile(outputPath);
    }
}

module.exports = { generateCollection };
