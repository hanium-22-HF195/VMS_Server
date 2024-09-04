const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8080;

const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/publicKey', (req, res) => {
    let publicKey = '';
    req.on('data', chunk => {
        publicKey += chunk;
    });

    req.on('end', () => {
        console.log("Received public key:", publicKey);
        res.send('Public key received');
    });
});

app.post('/test/data', upload.single('imagedata'), (req, res) => {
    try {
        const metadata = JSON.parse(req.body.metadata);
        console.log('Received metadata:', metadata);

        const cid = metadata.CID || 'default_CID';
        const oldPath = req.file.path;
        const extension = path.extname(req.file.originalname);
        const newPath = path.join(req.file.destination, `${cid}${extension}`);

        // 파일 이름을 CID로 변경
        fs.rename(oldPath, newPath, (err) => {
            if (err) {
                console.error('Error renaming file:', err);
                return res.status(500).send('Server error');
            }
            console.log(`File renamed to: ${newPath}`);
            res.send('Image and metadata received successfully');
        });

    } catch (err) {
        console.error("Error handling request:", err);
        res.status(500).send('Server error');
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
