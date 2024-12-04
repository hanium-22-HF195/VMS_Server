const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql');
const dbInfo = require('./db_config.json');
const db = mysql.createPool(dbInfo);
const crypto = require('crypto');

const queue = [];

const upload = multer({ dest: 'uploads/' });

const app = express();
const PORT = 8080;


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

// 큐 작업 처리 함수
function verifier() {
    if (queue.length > 0) {
        const task = queue.shift();

        // 검증 로직
        const { cid, hash, signedHash } = task;
        const verifyQuery = `SELECT pub_key FROM Loggers WHERE LID = ?`;
        db.query(verifyQuery, [1], (err, results) => {
            if (err || results.length === 0) {
                console.error('Error retrieving public key:', err);
                return;
            }

            const pubKey = results[0].pub_key;

            try {
                const publicKey = crypto.createPublicKey(pubKey);
                const verifier = crypto.createVerify('sha256');
                verifier.update(hash);

                // const wronghash = "2c594292943fa982b15073f4beb5a7f843b4bf8eae76609a70232a59284e6a5e";
                // verifier.update(wronghash);
                verifier.end();

                const isVerified = verifier.verify(publicKey, signedHash, 'base64');

                const updateQuery = `
                    UPDATE Video_data_table
                    SET verify_result = ?
                    WHERE CID = ?
                `;
                db.query(updateQuery, [isVerified, cid], (err) => {
                    if (err) console.error('Error updating verification result:', err);
                    else console.log(`Verification result for CID : ${cid}, isVerified=${isVerified}`);
                });
            } catch (verificationError) {
                console.error('Error during verification:', verificationError);
            }
        });
    }
}

// 주기적으로 큐 확인 및 처리
setInterval(verifier, 10); // 0.01ms

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

            const imagePath = newPath;

            const insertDataQuery = `
                INSERT INTO Video_data_table 
                (CID, LID, hash, signed_hash, Object_Detection_result, mediaType, image_path) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            db.query(insertDataQuery, [cid, 1, hash, signedHash, objectDetectionResult, mediaType, imagePath], (err) => {
                if (err) {
                    console.error('Error inserting data into DB:', err);
                    return res.status(500).send('DB error');
                }
                console.log('Data inserted into Video_data_table');
                
                //큐에 작업 추가
                queue.push({ cid, hash, signedHash });
                console.log(`Task added to queue: CID=${cid}`);

                res.send('Image and metadata received and stored successfully');
            });
        });
    } catch (err) {
        console.error('Error handling request:', err);
        res.status(500).send('Server error');
    }
});

//object detection test code
app.post('/detect', upload.single('image'), (req, res) => { 
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }
    res.json({ message: "File uploaded successfully" });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
