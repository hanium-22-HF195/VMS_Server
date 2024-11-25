const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql');
const dbInfo = require('./db_config.json');
const db = mysql.createPool(dbInfo);


const app = express();
const PORT = 8080;

const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// publicKey 한 번 저장
app.post('/publicKey', (req, res) => {
    let publicKey = '';
    req.on('data', chunk => {
        publicKey += chunk;
    });

    req.on('end', () => {
        console.log("Received public key:", publicKey);

        const insertKeyQuery = `INSERT INTO Loggers (LID, pub_key) VALUES (?, ?) ON DUPLICATE KEY UPDATE pub_key = ?`;
        db.query(insertKeyQuery, [1, publicKey, publicKey], (err) => {
            if (err) {
                console.error("Error inserting public key:", err);
                return res.status(500).send('DB error');
            }
            res.send('Public key stored successfully');
        });
    });
});

// POST 요청 처리
app.post('/test/data', upload.single('imagedata'), (req, res) => {
    try {
        // JSON 파싱
        const metadata = JSON.parse(req.body.metadata);
        console.log('Received metadata:', metadata);

        // CID 및 파일 경로 생성
        const cid = metadata.CID || 'default_CID';
        const objectDetectionResult = metadata.Object_Detection_Result || null;
        const hash = metadata.hash || null;
        const signedHash = metadata.sign_hash || null;
        const mediaType = metadata.mediaType || null;

        const oldPath = req.file.path;
        const extension = path.extname(req.file.originalname);
        const newFileName = `${cid}${extension}`;
        const newPath = path.join(req.file.destination, newFileName);
        
        // 파일 이름 변경
        fs.rename(oldPath, newPath, (err) => {
            if (err) {
                console.error('Error renaming file:', err);
                return res.status(500).send('Server error');
            }
            console.log(`File saved as: ${newFileName}`);

            const insertDataQuery = `
                INSERT INTO Video_data_table 
                (CID, LID, hash, signed_hash, Object_Detection_result, mediaType) 
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            db.query(insertDataQuery, [cid, 1, hash, signedHash, objectDetectionResult, mediaType], (err) => {
                if (err) {
                    console.error('Error inserting data into DB:', err);
                    return res.status(500).send('DB error');
                }
                console.log('Data inserted into Video_data_table');
                res.send('Image and metadata received and stored successfully');
            });
        });
    } catch (err) {
        console.error('Error handling request:', err);
        res.status(500).send('Server error');
    }
});

// app.post('/detect', upload.single('image'), (req, res) => {
//     if (!req.file) {
//         return res.status(400).json({ message: 'No file uploaded' });
//     }
//     res.json({ message: "File uploaded successfully" });
// });

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
