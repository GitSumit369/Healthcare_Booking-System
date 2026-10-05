require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// ================================
// MIDDLEWARE
// ================================

app.use(cors());
app.use(express.json({ limit: '20kb' }));

// Serve frontend from public folder
app.use(express.static(path.join(__dirname, 'public')));


// ================================
// MYSQL CONNECTION
// ================================

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'customer',
    port: Number(process.env.DB_PORT) || 3306,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


// ================================
// CONSTANTS / VALIDATION
// ================================

const phoneRegex = /^[6-9]\d{9}$/;

const allowedStatuses = [
    'New',
    'Pending',
    'Contacted',
    'Assigned',
    'Completed',
    'Cancelled'
];


// Clean incoming text
function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}


// ================================
// ADMIN AUTHENTICATION
// ================================

function adminAuth(req, res, next) {

    const configuredKey = process.env.ADMIN_KEY;

    if (
        !configuredKey ||
        req.get('x-admin-key') !== configuredKey
    ) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized.'
        });
    }

    next();
}


// ================================
// DATABASE INITIALIZATION
// ================================

async function initializeDatabase() {

    const connection = await db.getConnection();

    try {

        // Requirements table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS requirements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                service_type VARCHAR(100) NOT NULL,
                mobile_number VARCHAR(15) NOT NULL,
                address TEXT NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'Pending',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);


        // Direct inquiries table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS inquiries (
                id INT AUTO_INCREMENT PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                mobile_number VARCHAR(15) NOT NULL,
                message TEXT NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'New',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const requirementColumns = [
            ['full_name', 'VARCHAR(100) NULL'],
            ['care_for', 'VARCHAR(100) NULL'],
            ['care_support', 'VARCHAR(500) NULL'],
            ['care_duration', 'VARCHAR(100) NULL'],
            ['care_timing', 'VARCHAR(100) NULL'],
            ['additional_notes', 'TEXT NULL']
        ];

        async function addColumnIfMissing(tableName, columnName, definition) {
            const [columns] = await connection.query(
                `SHOW COLUMNS FROM \`${tableName}\` LIKE ?`,
                [columnName]
            );

            if (!columns.length) {
                await connection.query(
                    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`
                );
            }
        }

        for (const [column, definition] of requirementColumns) {
            await addColumnIfMissing('requirements', column, definition);
        }

        await addColumnIfMissing('inquiries', 'category', 'VARCHAR(100) NULL');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS callback_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                full_name VARCHAR(100) NOT NULL,
                mobile_number VARCHAR(15) NOT NULL,
                preferred_time VARCHAR(100) NOT NULL,
                category VARCHAR(100) NOT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'New',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

    } finally {

        connection.release();

    }
}


// ================================
// HEALTH CHECK
// ================================

app.get('/api/health', async (req, res) => {

    try {

        await db.query('SELECT 1');

        res.json({
            success: true,
            message: 'Sahyog Caring Bureau backend and MySQL are running.'
        });

    } catch (error) {

        console.error('Database health check error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Database connection is unavailable.'
        });

    }

});


// ======================================================
// CUSTOMER REQUIREMENT
// ======================================================

app.post('/api/requirements', async (req, res) => {

    try {

        const serviceType = cleanText(req.body.serviceType);
        const mobileNumber = cleanText(req.body.mobileNumber);
        const address = cleanText(req.body.address);
        const fullName = cleanText(req.body.fullName);
        const careFor = cleanText(req.body.careFor);
        const careSupport = cleanText(req.body.careSupport);
        const careDuration = cleanText(req.body.careDuration);
        const careTiming = cleanText(req.body.careTiming);
        const additionalNotes = cleanText(req.body.additionalNotes);


        // -------------------------------
        // VALIDATION
        // -------------------------------

        if (!serviceType || !mobileNumber || !address) {

            return res.status(400).json({
                success: false,
                message:
                    'Service Type, Mobile Number and Address are required.'
            });

        }


        if (
            serviceType.length > 100 ||
            address.length > 2000 ||
            fullName.length > 100 ||
            careFor.length > 100 ||
            careSupport.length > 500 ||
            careDuration.length > 100 ||
            careTiming.length > 100 ||
            additionalNotes.length > 2000
        ) {

            return res.status(400).json({
                success: false,
                message:
                    'Please check the length of the submitted information.'
            });

        }


        if (!phoneRegex.test(mobileNumber)) {

            return res.status(400).json({
                success: false,
                message:
                    'Please enter a valid 10-digit Indian mobile number.'
            });

        }


        // -------------------------------
        // SAVE TO MYSQL
        // -------------------------------

        const [result] = await db.execute(
            `
            INSERT INTO requirements
            (
                service_type,
                mobile_number,
                address,
                full_name,
                care_for,
                care_support,
                care_duration,
                care_timing,
                additional_notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                serviceType,
                mobileNumber,
                address,
                fullName || null,
                careFor || null,
                careSupport || null,
                careDuration || null,
                careTiming || null,
                additionalNotes || null
            ]
        );


        // -------------------------------
        // GET SAVED RECORD
        // -------------------------------

        const [rows] = await db.execute(
            `
            SELECT
                id,
                service_type,
                mobile_number,
                address,
                status,
                created_at
            FROM requirements
            WHERE id = ?
            `,
            [result.insertId]
        );


        const data = rows[0];


        console.log(
            'New Requirement Registered:',
            data
        );


        // -------------------------------
        // SUCCESS RESPONSE
        // -------------------------------

        res.status(201).json({

            success: true,

            message:
                'Registration successful! You will receive a call from the Sahyog Caring Bureau team soon.',

            requirementId:
                `REQ-${String(data.id).padStart(6, '0')}`,

            data: data

        });


    } catch (error) {

        console.error(
            'Requirement submission error:',
            error.message
        );


        res.status(500).json({

            success: false,

            message:
                'Unable to submit your requirement right now. Please try again later.'

        });

    }

});


// ======================================================
// DIRECT INQUIRY
// ======================================================

app.post('/api/inquiries', async (req, res) => {

    try {

        const fullName = cleanText(req.body.fullName);
        const mobileNumber = cleanText(req.body.mobileNumber);
        const message = cleanText(req.body.message);
        const category = cleanText(req.body.category);


        // -------------------------------
        // VALIDATION
        // -------------------------------

        if (
            !fullName ||
            !mobileNumber ||
            !message
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Full Name, Mobile Number and Message are required.'

            });

        }


        if (
            fullName.length > 100 ||
            message.length > 1000 ||
            category.length > 100
        ) {

            return res.status(400).json({

                success: false,

                message:
                    'Please check the length of the submitted information.'

            });

        }


        if (!phoneRegex.test(mobileNumber)) {

            return res.status(400).json({

                success: false,

                message:
                    'Please enter a valid 10-digit Indian mobile number.'

            });

        }


        // -------------------------------
        // SAVE INQUIRY TO MYSQL
        // -------------------------------

        const [result] = await db.execute(

            `
            INSERT INTO inquiries
            (
                full_name,
                mobile_number,
                message,
                category
            )
            VALUES (?, ?, ?, ?)
            `,

            [
                fullName,
                mobileNumber,
                message,
                category || null
            ]

        );


        // -------------------------------
        // GET SAVED INQUIRY
        // -------------------------------

        const [rows] = await db.execute(

            `
            SELECT
                id,
                full_name,
                mobile_number,
                message,
                status,
                created_at
            FROM inquiries
            WHERE id = ?
            `,

            [result.insertId]

        );


        const data = rows[0];


        console.log(
            'New Direct Inquiry:',
            data
        );


        // -------------------------------
        // SUCCESS RESPONSE
        // -------------------------------

        res.status(201).json({

            success: true,

            message:
                'Message sent successfully! Our Sahyog Caring Bureau team will call you soon.',

            inquiryId:
                `INQ-${String(data.id).padStart(6, '0')}`,

            data: data

        });


    } catch (error) {

        console.error(
            'Inquiry submission error:',
            error.message
        );


        res.status(500).json({

            success: false,

            message:
                'Unable to send your inquiry right now. Please try again later.'

        });

    }

});


// ======================================================
// ADMIN - GET ALL REQUIREMENTS
// ======================================================

app.post('/api/callback-requests', async (req, res) => {

    try {

        const fullName = cleanText(req.body.fullName);
        const mobileNumber = cleanText(req.body.mobileNumber);
        const preferredTime = cleanText(req.body.preferredTime);
        const category = cleanText(req.body.category);

        if (!fullName || !mobileNumber || !preferredTime || !category) {
            return res.status(400).json({
                success: false,
                message: 'Name, mobile number, preferred callback time and reason are required.'
            });
        }

        if (
            fullName.length > 100 ||
            preferredTime.length > 100 ||
            category.length > 100
        ) {
            return res.status(400).json({
                success: false,
                message: 'Please check the submitted information.'
            });
        }

        if (!phoneRegex.test(mobileNumber)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid 10-digit Indian mobile number.'
            });
        }

        const [result] = await db.execute(
            `
            INSERT INTO callback_requests
            (full_name, mobile_number, preferred_time, category)
            VALUES (?, ?, ?, ?)
            `,
            [fullName, mobileNumber, preferredTime, category]
        );

        res.status(201).json({
            success: true,
            message: 'Your callback request has been received. The Sahyog team will contact you at the preferred time when possible.',
            callbackId: `CALL-${String(result.insertId).padStart(6, '0')}`
        });

    } catch (error) {

        console.error('Callback request error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to request a callback right now. Please try again later.'
        });

    }

});


app.get(
    '/api/admin/requirements',
    adminAuth,
    async (req, res) => {

        try {

            const [rows] = await db.execute(`

                SELECT
                    id,
                    service_type,
                    mobile_number,
                    address,
                    status,
                    created_at

                FROM requirements

                ORDER BY created_at DESC

            `);


            res.json({

                success: true,

                total: rows.length,

                data: rows

            });


        } catch (error) {

            console.error(
                'Fetch requirements error:',
                error.message
            );


            res.status(500).json({

                success: false,

                message:
                    'Unable to fetch requirements.'

            });

        }

    }
);


// ======================================================
// ADMIN - GET ALL DIRECT INQUIRIES
// ======================================================

app.get(
    '/api/admin/inquiries',
    adminAuth,
    async (req, res) => {

        try {

            const [rows] = await db.execute(`

                SELECT
                    id,
                    full_name,
                    mobile_number,
                    message,
                    status,
                    created_at

                FROM inquiries

                ORDER BY created_at DESC

            `);


            res.json({

                success: true,

                total: rows.length,

                data: rows

            });


        } catch (error) {

            console.error(
                'Fetch inquiries error:',
                error.message
            );


            res.status(500).json({

                success: false,

                message:
                    'Unable to fetch inquiries.'

            });

        }

    }
);


// ======================================================
// ADMIN - UPDATE REQUIREMENT STATUS
// ======================================================

app.patch(
    '/api/admin/requirements/:id/status',
    adminAuth,
    async (req, res) => {

        try {

            const id = Number(req.params.id);

            const status =
                cleanText(req.body.status);


            if (
                !Number.isInteger(id) ||
                id <= 0 ||
                !allowedStatuses.includes(status)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'Invalid requirement ID or status.'

                });

            }


            const [result] = await db.execute(

                `
                UPDATE requirements
                SET status = ?
                WHERE id = ?
                `,

                [
                    status,
                    id
                ]

            );


            if (!result.affectedRows) {

                return res.status(404).json({

                    success: false,

                    message:
                        'Requirement not found.'

                });

            }


            res.json({

                success: true,

                message:
                    'Requirement status updated successfully.'

            });


        } catch (error) {

            console.error(
                'Update requirement status error:',
                error.message
            );


            res.status(500).json({

                success: false,

                message:
                    'Unable to update requirement status.'

            });

        }

    }
);


// ======================================================
// ADMIN - UPDATE INQUIRY STATUS
// ======================================================

app.patch(
    '/api/admin/inquiries/:id/status',
    adminAuth,
    async (req, res) => {

        try {

            const id = Number(req.params.id);

            const status =
                cleanText(req.body.status);


            if (
                !Number.isInteger(id) ||
                id <= 0 ||
                !allowedStatuses.includes(status)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'Invalid inquiry ID or status.'

                });

            }


            const [result] = await db.execute(

                `
                UPDATE inquiries
                SET status = ?
                WHERE id = ?
                `,

                [
                    status,
                    id
                ]

            );


            if (!result.affectedRows) {

                return res.status(404).json({

                    success: false,

                    message:
                        'Inquiry not found.'

                });

            }


            res.json({

                success: true,

                message:
                    'Inquiry status updated successfully.'

            });


        } catch (error) {

            console.error(
                'Update inquiry status error:',
                error.message
            );


            res.status(500).json({

                success: false,

                message:
                    'Unable to update inquiry status.'

            });

        }

    }
);


// ======================================================
// START SERVER
// ======================================================

async function startServer() {

    try {

        // Test MySQL connection
        const connection =
            await db.getConnection();

        connection.release();


        // Create required tables if they don't exist
        await initializeDatabase();


        app.listen(
            PORT,
            () => {

                console.log('');
                console.log(
                    '=========================================='
                );

                console.log(
                    'Sahyog Caring Bureau Server Started'
                );

                console.log(
                    `Website: http://localhost:${PORT}`
                );

                console.log(
                    `Database: ${process.env.DB_NAME || 'customer'}`
                );

                console.log(
                    'MySQL: Connected'
                );

                console.log(
                    '=========================================='
                );

                console.log('');

            }
        );


    } catch (error) {

        console.error('');
        console.error(
            'Unable to start Sahyog Caring Bureau server.'
        );

        console.error(
            'MySQL connection failed:'
        );

        console.error(
            error.message
        );

        console.error('');

        console.error(
            'Check your .env file and make sure MySQL Server is running.'
        );

        process.exit(1);

    }

}


startServer();
