require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const generatorController = require('./controllers/generatorController');
const metadataController = require('./controllers/metadataController');
const { jobResults } = require('./utils/jobQueue');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3001;

const UPLOADS_TEMP_DIR = path.join(__dirname, '..', 'uploads_temp');
const JOB_DATA_BASE_DIR = path.join(__dirname, '..', 'job_data');

(async () => {
    try {
        await fs.mkdir(UPLOADS_TEMP_DIR, { recursive: true });
        await fs.mkdir(JOB_DATA_BASE_DIR, { recursive: true });
        console.log("Temporary upload and job data directories ensured.");
    } catch (error) {
        console.error("Failed to ensure temporary directories:", error);
        process.exit(1);
    }
})();

const upload = multer({ dest: UPLOADS_TEMP_DIR });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/download', express.static(JOB_DATA_BASE_DIR));

app.post('/api/generate', upload.single('assetsZip'), generatorController.requestGeneration);

app.post('/api/update-metadata', upload.single('metadataZip'), metadataController.updateMetadata);

app.get('/api/job-status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const result = jobResults[jobId];

    if (!result) {
        return res.json({ jobId, status: 'IN PROGRESS' });
    }
    
    return res.json(result);
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`Ensure Redis server is running for job queue!`);
});