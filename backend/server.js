const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const twilio = require("twilio");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const xss = require('xss');
const jwt = require('jsonwebtoken');
dotenv.config();

const app = express();
app.use(express.json());
const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
// Vercel gives each deployment a project-specific HTTPS URL. Allow only this
// project's production and deployment URLs so preview builds can call the API.
const isBinzVercelDeployment = (origin) =>
    /^https:\/\/project-binz(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);
// Flutter web uses a localhost port in development. This allows local testing
// without opening production API access to arbitrary third-party sites.
const isLocalFlutterWebOrigin = (origin) =>
    /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/i.test(origin);
app.use(cors({
    origin(origin, callback) {
        if (!origin || process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin) || isBinzVercelDeployment(origin) || isLocalFlutterWebOrigin(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Origin is not allowed by CORS.'));
    },
    credentials: true,
}));
app.use(bodyParser.json());

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const SESSION_COOKIE_NAME = 'binz_session';
const cookieSameSite = process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax');
const sessionCookieOptions = {
    httpOnly: true,
    // Separate frontend and API domains need SameSite=None; HTTPS is required by browsers for that setting.
    secure: process.env.NODE_ENV === 'production' || cookieSameSite === 'none',
    sameSite: cookieSameSite,
    maxAge: SESSION_DURATION_MS,
};
const clearSessionCookieOptions = {
    httpOnly: sessionCookieOptions.httpOnly,
    secure: sessionCookieOptions.secure,
    sameSite: sessionCookieOptions.sameSite,
};

function getJwtSecret() {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production.');
    }
    return 'binz-development-session-secret';
}

const ADMIN_EMAIL = 'aman.bhutani2007@gmail.com';

function isAdminEmail(email) {
    return typeof email === 'string' && email.trim().toLowerCase() === ADMIN_EMAIL;
}

async function enforceAdminRole(user) {
    const admin = isAdminEmail(user.email);
    if (user.admin !== admin) {
        user.admin = admin;
        await user.save();
    }
    return user;
}

function publicAccount(user) {
    return {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        state: user.state,
        phoneNumber: user.phoneNumber,
        coins: user.coins || 0,
        admin: user.admin === true,
    };
}

function startSession(res, user) {
    const token = jwt.sign(
        { sub: user._id.toString(), email: user.email, admin: user.admin === true },
        getJwtSecret(),
        { expiresIn: '24h' },
    );
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
    return token;
}

function requireSession(req, res, next) {
    const bearerToken = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice('Bearer '.length)
        : null;
    const cookieToken = req.headers.cookie
        ?.split(';')
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
        ?.slice(`${SESSION_COOKIE_NAME}=`.length);
    const token = bearerToken || cookieToken;

    if (!token) return res.status(401).json({ message: 'Authentication required.' });

    try {
        req.session = jwt.verify(token, getJwtSecret());
        next();
    } catch {
        res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions);
        return res.status(401).json({ message: 'Session expired or invalid.' });
    }
}

const accountSid = process.env.twilioAccountSid;
const authToken = process.env.twilioAuthToken;
const twilioNumber = '+16814484190';
const client = twilio(accountSid, authToken);

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/binzDB", {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ MongoDB Connected");
    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error);
        process.exit(1);
    }
};
connectDB();

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

const registrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        message: "Too many registration attempts. Please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const validateEmail = (email) => {
    return validator.isEmail(email);
};

const validatePassword = (password) => {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
};

const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return xss(input.trim());
};

const UserSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: { type: String, unique: true },
    password: { type: String, required: true },
    state: String,
    phoneNumber: String,
    coins: { type: Number, default: 0 },
    // This is server-owned. The app never accepts an admin value from a request.
    admin: { type: Boolean, default: false },
});
const User = mongoose.model("User", UserSchema);

const PRICE_CATEGORIES = [
    { id: "iron", name: "Iron", nameHindi: "लोहा", unit: "kg" },
    { id: "steel", name: "Steel", nameHindi: "स्टील", unit: "kg" },
    { id: "aluminium", name: "Aluminium", nameHindi: "एल्युमिनियम", unit: "kg" },
    { id: "copper", name: "Copper", nameHindi: "तांबा", unit: "kg" },
    { id: "brass", name: "Brass", nameHindi: "पीतल", unit: "kg" },
    { id: "newspaper", name: "Newspaper", nameHindi: "रद्दी", unit: "kg" },
    { id: "cardboard", name: "Cardboard", nameHindi: "गत्ता", unit: "kg" },
    { id: "plastic", name: "Plastic", nameHindi: "प्लास्टिक", unit: "kg" },
    { id: "pet-bottles", name: "PET Bottles", nameHindi: "प्लास्टिक बोतल", unit: "kg" },
    { id: "ewaste", name: "E-waste", nameHindi: "ई-कचरा", unit: "kg" },
    { id: "mixed-scrap", name: "Mixed Scrap", nameHindi: "मिक्स कबाड़", unit: "kg" },
    { id: "other", name: "Other", nameHindi: "अन्य", unit: "kg" },
];

const priceSchema = new mongoose.Schema({
    categoryId: { type: String, required: true, index: true },
    categoryName: { type: String, required: true },
    categoryNameHindi: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, default: "kg" },
    location: {
        city: { type: String, required: true, trim: true },
        state: { type: String, required: true, trim: true },
        pincode: { type: String, trim: true },
    },
    source: { type: String, required: true, trim: true },
    recordedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

priceSchema.index({ categoryId: 1, "location.city": 1, "location.state": 1, recordedAt: -1 });
priceSchema.index({ "location.city": 1, "location.state": 1, recordedAt: -1 });
const Price = mongoose.model("Price", priceSchema);

const DEMO_PRICE_RECORDS = [
    ["Iron", 30, "2026-09-01"], ["Iron", 31, "2026-09-07"], ["Iron", 30, "2026-09-14"], ["Iron", 32, "2026-09-20"],
    ["Steel", 40, "2026-09-01"], ["Steel", 42, "2026-09-10"], ["Steel", 45, "2026-09-20"],
    ["Aluminium", 105, "2026-09-01"], ["Aluminium", 112, "2026-09-10"], ["Aluminium", 120, "2026-09-20"],
    ["Copper", 620, "2026-09-01"], ["Copper", 640, "2026-09-10"], ["Copper", 650, "2026-09-20"],
    ["Newspaper", 17, "2026-09-01"], ["Newspaper", 17, "2026-09-10"], ["Newspaper", 18, "2026-09-20"],
    ["Cardboard", 7, "2026-09-01"], ["Cardboard", 8, "2026-09-10"], ["Cardboard", 8, "2026-09-20"],
    ["Plastic", 22, "2026-09-01"], ["Plastic", 24, "2026-09-10"], ["Plastic", 25, "2026-09-20"],
].map(([category, price, date]) => ({ category, price, city: "Greater Noida", state: "Uttar Pradesh", source: "DEMO DATA - local market sample", recordedAt: new Date(`${date}T10:30:00.000Z`) }));

function findPriceCategory(value) {
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    return PRICE_CATEGORIES.find((category) => category.id === normalized || category.name.toLowerCase() === normalized || category.nameHindi === value.trim()) || null;
}

function priceLocationFilter(query) {
    const filter = {};
    if (query.city) filter["location.city"] = sanitizeInput(query.city);
    if (query.state) filter["location.state"] = sanitizeInput(query.state);
    return filter;
}

function serializePrice(price, previous) {
    const change = previous ? price.price - previous.price : null;
    const changePercent = previous && previous.price !== 0 ? (change / previous.price) * 100 : null;
    return {
        category: price.categoryName,
        categoryHindi: price.categoryNameHindi,
        currentPrice: price.price,
        previousPrice: previous?.price ?? null,
        unit: price.unit,
        change,
        changePercent: changePercent === null ? null : Number(changePercent.toFixed(2)),
        direction: change === null ? "unknown" : change > 0 ? "up" : change < 0 ? "down" : "stable",
        source: price.source,
        updatedAt: price.recordedAt,
        location: price.location,
    };
}

async function getLatestPrices(filter) {
    const records = await Price.find(filter).sort({ recordedAt: -1, createdAt: -1 }).lean();
    const latestByCategory = new Map();
    const previousByCategory = new Map();
    records.forEach((record) => {
        if (!latestByCategory.has(record.categoryId)) latestByCategory.set(record.categoryId, record);
        else if (!previousByCategory.has(record.categoryId)) previousByCategory.set(record.categoryId, record);
    });
    return [...latestByCategory.values()]
        .sort((a, b) => a.categoryName.localeCompare(b.categoryName))
        .map((record) => serializePrice(record, previousByCategory.get(record.categoryId)));
}

app.get("/prices/categories", (req, res) => res.status(200).json({ categories: PRICE_CATEGORIES }));

app.get("/prices/location", async (req, res) => {
    try {
        const latitude = Number(req.query.latitude);
        const longitude = Number(req.query.longitude);
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            return res.status(400).json({ success: false, message: "Valid latitude and longitude are required." });
        }

        const params = new URLSearchParams({ format: "jsonv2", addressdetails: "1", zoom: "10", lat: String(latitude), lon: String(longitude) });
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
            headers: { "User-Agent": process.env.GEOCODING_USER_AGENT || "BinZ-price-discovery/1.0" },
        });
        if (!response.ok) return res.status(502).json({ success: false, message: "Unable to identify your location." });
        const result = await response.json();
        const address = result.address || {};
        const city = address.city || address.town || address.municipality || address.village || address.county;
        if (!city || !address.state) return res.status(404).json({ success: false, message: "A city could not be identified from your location." });
        res.status(200).json({ city, state: address.state, pincode: address.postcode || "" });
    } catch (error) {
        console.error("Reverse geocoding error:", error);
        res.status(502).json({ success: false, message: "Unable to identify your location." });
    }
});

app.get("/prices/locations", async (req, res) => {
    try {
        const locations = await Price.aggregate([
            { $group: { _id: { city: "$location.city", state: "$location.state" } } },
            { $sort: { "_id.city": 1 } },
            { $project: { _id: 0, city: "$_id.city", state: "$_id.state" } },
        ]);
        res.status(200).json({ locations });
    } catch (error) {
        console.error("Price locations error:", error);
        res.status(500).json({ success: false, message: "Unable to load price locations." });
    }
});

app.get("/prices/current", async (req, res) => {
    try {
        const category = req.query.category ? findPriceCategory(req.query.category) : null;
        if (req.query.category && !category) return res.status(400).json({ success: false, message: "Unknown price category." });
        const filter = priceLocationFilter(req.query);
        if (category) filter.categoryId = category.id;
        const prices = await getLatestPrices(filter);
        const location = { city: req.query.city || prices[0]?.location?.city || null, state: req.query.state || prices[0]?.location?.state || null };
        res.status(200).json({ location, prices });
    } catch (error) {
        console.error("Current prices error:", error);
        res.status(500).json({ success: false, message: "Unable to load current prices." });
    }
});

app.get("/prices/history", async (req, res) => {
    try {
        const category = findPriceCategory(req.query.category);
        if (!category) return res.status(400).json({ success: false, message: "A valid category is required." });
        const filter = { ...priceLocationFilter(req.query), categoryId: category.id };
        if (req.query.startDate || req.query.endDate) {
            filter.recordedAt = {};
            if (req.query.startDate) filter.recordedAt.$gte = new Date(req.query.startDate);
            if (req.query.endDate) filter.recordedAt.$lte = new Date(req.query.endDate);
            if (Object.values(filter.recordedAt).some((date) => Number.isNaN(date.getTime()))) return res.status(400).json({ success: false, message: "Invalid history date." });
        }
        const records = await Price.find(filter).sort({ recordedAt: 1 }).lean();
        res.status(200).json({ category: category.name, location: req.query.city || null, history: records.map((record) => ({ date: record.recordedAt.toISOString().slice(0, 10), price: record.price, unit: record.unit, source: record.source })) });
    } catch (error) {
        console.error("Price history error:", error);
        res.status(500).json({ success: false, message: "Unable to load price history." });
    }
});

app.get("/prices/trend", async (req, res) => {
    try {
        const category = findPriceCategory(req.query.category);
        const range = ["7d", "30d", "90d"].includes(req.query.range) ? req.query.range : "30d";
        if (!category) return res.status(400).json({ success: false, message: "A valid category is required." });
        const days = Number.parseInt(range, 10);
        const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const filter = { ...priceLocationFilter(req.query), categoryId: category.id, recordedAt: { $gte: start } };
        const records = await Price.find(filter).sort({ recordedAt: 1 }).lean();
        const first = records[0]?.price;
        const latest = records.at(-1)?.price;
        const change = first === undefined || latest === undefined ? null : latest - first;
        const percentageChange = first ? (change / first) * 100 : null;
        const trend = change === null ? "unknown" : Math.abs(percentageChange) < 2 ? "stable" : change > 0 ? "rising" : "falling";
        res.status(200).json({ category: category.name, categoryHindi: category.nameHindi, location: req.query.city || null, range, trend, change, percentageChange: percentageChange === null ? null : Number(percentageChange.toFixed(2)), data: records.map((record) => ({ date: record.recordedAt.toISOString().slice(0, 10), price: record.price })) });
    } catch (error) {
        console.error("Price trend error:", error);
        res.status(500).json({ success: false, message: "Unable to load price trend." });
    }
});

app.post("/prices", requireAdmin, async (req, res) => {
    try {
        const category = findPriceCategory(req.body.category);
        const price = Number(req.body.price);
        const city = sanitizeInput(req.body.city || "");
        const state = sanitizeInput(req.body.state || "");
        const source = sanitizeInput(req.body.source || "");
        if (!category) return res.status(400).json({ success: false, message: "A valid price category is required." });
        if (!Number.isFinite(price) || price < 0) return res.status(400).json({ success: false, message: "Price must be a valid positive number." });
        if (!city || !state || !source) return res.status(400).json({ success: false, message: "City, state and source are required." });
        const recordedAt = req.body.recordedAt ? new Date(req.body.recordedAt) : new Date();
        if (Number.isNaN(recordedAt.getTime())) return res.status(400).json({ success: false, message: "Recorded date is invalid." });
        const record = await Price.create({ categoryId: category.id, categoryName: category.name, categoryNameHindi: category.nameHindi, price, unit: req.body.unit || category.unit, location: { city, state, pincode: sanitizeInput(req.body.pincode || "") }, source, recordedAt });
        res.status(201).json({ success: true, price: record });
    } catch (error) {
        console.error("Create price error:", error);
        res.status(500).json({ success: false, message: "Unable to save price." });
    }
});

const LeaderboardEntry = mongoose.model("LeaderboardEntry", new mongoose.Schema({
    name: { type: String, required: true },
    coins: { type: Number, required: true },
}));

const leaderboardNames = [
    "Aarav Mehta", "Diya Kapoor", "Kabir Shah", "Meera Nair",
    "Rohan Verma", "Ishita Rao", "Vivaan Singh", "Anaya Joshi",
];
const EWASTE_TRACKING_STATUSES = [
    "Ticket Created",
    "Pickup Scheduled",
    "Picked Up",
    "At Facility",
    "Processing",
    "Material Recovery",
    "Final Disposal",
    "Recycled",
    "Cancelled",
];

const DEFAULT_TRACKING_STEPS = [
    { status: "Picked Up", label: "Picked Up", fallbackTime: "Pending" },
    { status: "At Facility", label: "At Facility", fallbackTime: "Pending" },
    { status: "Processing", label: "Processing", fallbackTime: "Pending" },
    { status: "Material Recovery", label: "Material Recovery", fallbackTime: "Pending" },
    { status: "Final Disposal", label: "Final Disposal", fallbackTime: "Pending" },
];

function normalizeTicketStatus(status) {
    if (typeof status !== "string") return null;
    const cleaned = sanitizeInput(status);
    return EWASTE_TRACKING_STATUSES.find((item) => item.toLowerCase() === cleaned.toLowerCase()) || null;
}

function buildTrackingSteps(currentStatus, history = []) {
    const activeIndex = DEFAULT_TRACKING_STEPS.findIndex((step) => step.status === currentStatus);
    const historyByStatus = new Map(
        history
            .filter((item) => item.status)
            .map((item) => [item.status, item]),
    );

    return DEFAULT_TRACKING_STEPS.map((step, index) => {
        const historyItem = historyByStatus.get(step.status);
        let state = "pending";

        if (currentStatus === "Cancelled") state = historyItem ? "done" : "cancelled";
        else if (currentStatus === "Ticket Created" || currentStatus === "Pickup Scheduled") state = "pending";
        else if (index < activeIndex) state = "done";
        else if (index === activeIndex) state = currentStatus === "Final Disposal" ? "done" : "active";

        return {
            status: step.status,
            label: step.label,
            state,
            time: historyItem?.changedAt || step.fallbackTime,
            note: historyItem?.note || "",
            facility: historyItem?.facility || "",
        };
    });
}

function buildReportDownloadUrl(ticket) {
    return `/track-ewaste/${encodeURIComponent(ticket.ticketID)}/report`;
}

function buildTrackingReport(ticket) {
    const productName = ticket.productName || ticket.eWasteType;
    const productCategory = ticket.productCategory || ticket.eWasteType;
    const lines = [
        "BinZ E-Waste Recycling Report",
        "",
        `Tracking ID: ${ticket.ticketID}`,
        `Product ID: ${ticket.productId || ticket.ticketID}`,
        `Product Name: ${productName}`,
        `Category: ${productCategory}`,
        `Current Status: ${ticket.status}`,
        `Status Note: ${ticket.statusNote || ""}`,
        `Facility: ${ticket.facility || ""}`,
        `Created At: ${ticket.createdAt || ticket.date || ""}`,
        `Updated At: ${ticket.updatedAt || ""}`,
        "",
        "Checkpoint History:",
    ];

    (ticket.statusHistory || []).forEach((item) => {
        lines.push(`- ${item.status}: ${item.note || "No note"} (${item.changedAt || "time pending"})`);
    });

    return `${lines.join("\n")}\n`;
}

function buildTrackingResponse(ticket, options = {}) {
    const productName = ticket.productName || ticket.eWasteType;
    const productCategory = ticket.productCategory || ticket.eWasteType;
    const response = {
        ticketID: ticket.ticketID,
        trackingID: ticket.ticketID,
        product: {
            id: ticket.productId || ticket.ticketID,
            name: productName,
            category: productCategory,
            type: ticket.eWasteType,
            imageUrl: ticket.productImageUrl,
            imageAlt: `${productName} product image`,
        },
        eWasteType: ticket.eWasteType,
        productId: ticket.productId || ticket.ticketID,
        productName,
        productCategory,
        productImageUrl: ticket.productImageUrl,
        description: ticket.description,
        status: ticket.status,
        statusNote: ticket.statusNote,
        facility: ticket.facility,
        scheduledPickupAt: ticket.scheduledPickupAt,
        estimatedCompletionAt: ticket.estimatedCompletionAt,
        recyclingReportUrl: ticket.recyclingReportUrl,
        reportDownloadUrl: buildReportDownloadUrl(ticket),
        report: {
            available: true,
            downloadUrl: buildReportDownloadUrl(ticket),
            externalUrl: ticket.recyclingReportUrl || null,
        },
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        trackingSteps: buildTrackingSteps(ticket.status, ticket.statusHistory || []),
        history: ticket.statusHistory,
    };

    if (options.includeCustomer) {
        response.customer = {
            name: ticket.name,
            email: ticket.email,
            pickupAddress: ticket.pickupAddress,
        };
        response.name = ticket.name;
        response.email = ticket.email;
        response.pickupAddress = ticket.pickupAddress;
    }

    return response;
}

async function requireAdmin(req, res, next) {
    requireSession(req, res, async () => {
        try {
            const user = await User.findById(req.session.sub);
            if (!user) return res.status(401).json({ message: "Authentication required." });

            await enforceAdminRole(user);
            if (user.admin !== true) {
                return res.status(403).json({ message: "Administrator access required." });
            }

            req.admin = user;
            next();
        } catch (error) {
            console.error("Admin authorization error:", error);
            return res.status(500).json({ message: "Unable to verify administrator access." });
        }
    });
}

app.post("/register", registrationLimiter, async (req, res) => {
    try {
        const { firstName, lastName, email, password, state } = req.body;
        console.log("📥 Received data:", req.body);

        if (!firstName || !lastName || !email || !password || !state) {
            return res.status(400).json({ message: "First name, last name, email, password and state are required!" });
        }

        const sanitizedFirstName = sanitizeInput(firstName);
        const sanitizedLastName = sanitizeInput(lastName);
        const sanitizedEmail = sanitizeInput(email);
        const sanitizedState = sanitizeInput(state);

        if (!validateEmail(sanitizedEmail)) {
            return res.status(400).json({ message: "Please enter a valid email address!" });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({
                message: "Password must be at least 8 characters with uppercase, lowercase, number, and special character!"
            });
        }
        const hashedPassword = await bcrypt.hash(password, 12);

        const existingUser = await User.findOne({ email: sanitizedEmail.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists!" });
        }

        const newUser = new User({
            firstName: sanitizedFirstName,
            lastName: sanitizedLastName,
            email: sanitizedEmail.toLowerCase(),
            password: hashedPassword,
            state: sanitizedState,
            coins: 5,
            admin: isAdminEmail(sanitizedEmail),
        });
        const savedUser = await newUser.save();
        const sessionToken = startSession(res, savedUser);
        const account = publicAccount(savedUser);
        res.status(201).json({
            message: "✅ Registration successful! 5 bonus coins added!",
            User: account,
            // Returned only for Flutter clients; browsers continue using the HTTP-only cookie.
            ...(req.get('X-Client-Platform') === 'flutter' ? { sessionToken } : {}),
        });

    } catch (error) {
        console.error("❌ Error during registration:", error);
        if (error.code === 11000) {
            return res.status(400).json({ message: "User already exists!" });
        }
        res.status(500).json({ message: "❌ Server error" });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email) {
            return res.status(400).json({ message: "❌ Email is required!" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ message: "❌ Invalid credentials!" });
        }

        if (!password || !user.password || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "❌ Invalid credentials!" });
        }

        await enforceAdminRole(user);
        const sessionToken = startSession(res, user);
        res.status(200).json({
            message: "✅ Login successful!",
            ...publicAccount(user),
            ...(req.get('X-Client-Platform') === 'flutter' ? { sessionToken } : {}),
        });
    } catch (error) {
        console.error("❌ Login error:", error);
        res.status(500).json({ message: "❌ Server error" });
    }
});

app.get('/session', requireSession, async (req, res) => {
    try {
        const user = await User.findById(req.session.sub);
        if (!user) {
            res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions);
            return res.status(401).json({ message: 'Session user no longer exists.' });
        }

        await enforceAdminRole(user);
        res.status(200).json(publicAccount(user));
    } catch (error) {
        console.error('❌ Session lookup error:', error);
        res.status(500).json({ message: '❌ Server error' });
    }
});

app.post('/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions);
    res.status(204).end();
});

app.post("/sendSMS", async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber || phoneNumber.length !== 10) {
            return res.status(400).json({ message: "⚠️ Invalid phone number!" });
        }
        const fullPhoneNumber = `+91${phoneNumber}`;
        const message = await client.messages.create({
            body: "Your slot is booked successfully! A Rider will be assigned soon. Thanks For Contacting Us!",
            from: twilioNumber,
            to: fullPhoneNumber,
        });
        console.log("✅ Message sent! SID:", message.sid);
        res.status(200).json({ message: "📩 SMS sent successfully!" });
    } catch (error) {
        console.error("❌ Error sending SMS:", error);
        res.status(500).json({ message: "❌ Failed to send SMS!" });
    }
});

app.post("/storePhoneNumber", async (req, res) => {
    try {
        const { email, phoneNumber } = req.body;
        if (!email || !phoneNumber) {
            return res.status(400).json({ message: "⚠️ Email and Phone Number are required!" });
        }
        const updatedUser = await User.findOneAndUpdate({ email: email.toLowerCase() }, { $set: { phoneNumber } }, { new: true });
        if (!updatedUser) {
            return res.status(404).json({ message: "❌ User not found!" });
        }
        res.status(200).json({ message: "✅ Phone number stored successfully!" });
    } catch (error) {
        console.error("❌ Error storing phone number:", error);
        res.status(500).json({ message: "❌ Server error!" });
    }
});

app.get("/leaderboard", async (req, res) => {
    try {
        let entries = await User.find({})
            .sort({ coins: -1 })
            .limit(8)
            .select("firstName lastName coins _id");

        entries = entries.map((user) => ({
            _id: user._id,
            name: `${user.firstName} ${user.lastName}`.trim(),
            coins: user.coins || 0,
        }));

        if (entries.length === 0) {
            entries = await LeaderboardEntry.find({})
                .sort({ coins: -1 })
                .limit(8)
                .select("name coins _id");

            if (entries.length === 0) {
                const seedEntries = leaderboardNames.map((name) => ({
                    name,
                    coins: Math.floor(Math.random() * 901) + 100,
                }));
                await LeaderboardEntry.insertMany(seedEntries);
                entries = await LeaderboardEntry.find({})
                    .sort({ coins: -1 })
                    .limit(8)
                    .select("name coins _id");
            }
        }

        res.status(200).json({ leaderboard: entries });
    } catch (error) {
        console.error("❌ Leaderboard Fetch Error:", error);
        res.status(500).json({ message: "❌ Server error" });
    }
});

app.get("/getCoins/:email", async (req, res) => {
    try {
        const { email } = req.params;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ message: "❌ User not found!" });
        }
        res.status(200).json({ coins: user.coins });
    } catch (error) {
        console.error("❌ Error fetching coins:", error);
        res.status(500).json({ message: "❌ Server error!" });
    }
});

// ✅ Reward coins endpoint
app.post("/rewardCoins", async (req, res) => {
    try {
        const { email, coins } = req.body;
        if (!email || typeof coins !== 'number') {
            return res.status(400).json({ message: "⚠️ Email and coins are required!" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ message: "❌ User not found!" });
        }

        user.coins += coins;
        await user.save();

        res.status(200).json({ message: `✅ ${coins} coins added!`, coins: user.coins });
    } catch (error) {
        console.error("❌ Error updating coins:", error);
        res.status(500).json({ message: "❌ Server error while rewarding coins" });
    }
});

app.get("/register", (req, res) => res.send("✅ Registration Route is Working!"));
app.get("/login", (req, res) => res.send("✅ Login Route is Working!"));

if (!fs.existsSync(path.join(__dirname, "uploads"))) {
    fs.mkdirSync(path.join(__dirname, "uploads"));
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Simulated "processing" — waits 5s, then awards a random coin count (5-10).
// Swap the setTimeout body for a real detector call later without touching the route contract.
app.post("/uploadVideo", upload.single("video"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No video file received." });
        }
        const email = req.body.email;
        if (!email) {
            return res.status(400).json({ message: "Email is required." });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        setTimeout(async () => {
            try {
                const reward = Math.floor(Math.random() * 6) + 5; // random 5-10
                user.coins += reward;
                await user.save();
                res.json({ message: `Cleanup verified! You earned ${reward} coins!`, coins: user.coins });
            } catch (saveError) {
                console.error("❌ Error awarding coins after processing buffer:", saveError);
                res.status(500).json({ message: "Error processing video." });
            }
        }, 5000);
    } catch (error) {
        console.error("❌ Upload error:", error);
        res.status(500).json({ message: "❌ Server error while processing upload." });
    }
});

// E-waste ticket and tracking system
const ticketSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    eWasteType: { type: String, required: true },
    productName: String,
    productCategory: String,
    productId: { type: String, unique: true, sparse: true, index: true },
    productImageUrl: String,
    description: String,
    pickupAddress: String,
    ticketID: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: EWASTE_TRACKING_STATUSES, default: "Ticket Created" },
    statusNote: { type: String, default: "Your e-waste ticket has been created." },
    facility: { type: String, default: "Greater Noida, UP" },
    scheduledPickupAt: Date,
    estimatedCompletionAt: Date,
    recyclingReportUrl: String,
    statusHistory: [
        {
            status: { type: String, enum: EWASTE_TRACKING_STATUSES },
            note: String,
            facility: String,
            changedBy: String,
            changedAt: { type: Date, default: Date.now },
        },
    ],
}, { timestamps: true });

const Ticket = mongoose.model("Ticket", ticketSchema);

async function createUniqueTicketID() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const ticketID = "EW-" + Math.floor(100000 + Math.random() * 900000);
        const existingTicket = await Ticket.exists({ ticketID });
        if (!existingTicket) return ticketID;
    }

    return `EW-${Date.now()}`;
}

async function createUniqueProductId() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const productId = "BINZ-" + Math.floor(10000 + Math.random() * 90000);
        const existingProduct = await Ticket.exists({ productId });
        if (!existingProduct) return productId;
    }

    return `BINZ-${Date.now()}`;
}

app.post("/submit-ticket", async (req, res) => {
    try {
        const { name, email, eWasteType, productName, productCategory, productImageUrl, description, pickupAddress, scheduledPickupAt } = req.body;
        if (!name || !email || !eWasteType) {
            return res.status(400).json({ message: "Name, email and e-waste type are required." });
        }

        const sanitizedEmail = sanitizeInput(email).toLowerCase();
        if (!validateEmail(sanitizedEmail)) {
            return res.status(400).json({ message: "Please enter a valid email address." });
        }

        const ticketID = await createUniqueTicketID();
        const productId = await createUniqueProductId();
        const sanitizedProductName = sanitizeInput(productName || eWasteType);
        const sanitizedProductCategory = sanitizeInput(productCategory || eWasteType);
        const initialStatus = "Ticket Created";
        const initialNote = "Your e-waste ticket has been created.";
        const newTicket = new Ticket({
            name: sanitizeInput(name),
            email: sanitizedEmail,
            eWasteType: sanitizeInput(eWasteType),
            productName: sanitizedProductName,
            productCategory: sanitizedProductCategory,
            productId,
            productImageUrl: sanitizeInput(productImageUrl || ""),
            description: sanitizeInput(description || ""),
            pickupAddress: sanitizeInput(pickupAddress || ""),
            scheduledPickupAt: scheduledPickupAt ? new Date(scheduledPickupAt) : undefined,
            ticketID,
            status: initialStatus,
            statusNote: initialNote,
            statusHistory: [
                {
                    status: initialStatus,
                    note: initialNote,
                    changedBy: "system",
                },
            ],
        });
        await newTicket.save();

        try {
            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: sanitizedEmail,
                subject: "E-Waste Ticket Confirmation",
                text: `Hello ${newTicket.name}\n\nYour ticket has been created successfully.\nTicket ID: ${ticketID}\nTrack it at: /track-ewaste/${ticketID}\n\nWe will contact you soon!\n\nThank you!`
            };

            await transporter.sendMail(mailOptions);
        } catch (mailError) {
            console.error("⚠️ Ticket email failed (ticket still created):", mailError.message);
        }

        res.status(201).json({
            message: "Ticket created successfully!",
            ticketID,
            trackingID: ticketID,
            tracking: buildTrackingResponse(newTicket, { includeCustomer: true }),
        });

    } catch (error) {
        console.error("Error submitting ticket:", error);
        res.status(500).json({ message: "Error submitting ticket" });
    }
});

app.get("/track-ewaste/:ticketID", async (req, res) => {
    try {
        const ticket = await Ticket.findOne({ ticketID: sanitizeInput(req.params.ticketID) });
        if (!ticket) {
            return res.status(404).json({ message: "Tracking ID not found." });
        }

        res.status(200).json({ tracking: buildTrackingResponse(ticket) });
    } catch (error) {
        console.error("Error fetching e-waste tracking:", error);
        res.status(500).json({ message: "Error fetching e-waste tracking" });
    }
});

app.get("/track-ewaste/:ticketID/report", async (req, res) => {
    try {
        const ticket = await Ticket.findOne({ ticketID: sanitizeInput(req.params.ticketID) });
        if (!ticket) {
            return res.status(404).json({ message: "Tracking ID not found." });
        }

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="binz-ewaste-report-${ticket.ticketID}.txt"`);
        res.status(200).send(buildTrackingReport(ticket));
    } catch (error) {
        console.error("Error downloading e-waste report:", error);
        res.status(500).json({ message: "Error downloading e-waste report" });
    }
});
app.get("/admin/ewaste-tickets", requireAdmin, async (req, res) => {
    try {
        const { status, email } = req.query;
        const filter = {};

        const normalizedStatus = status ? normalizeTicketStatus(status) : null;
        if (status && !normalizedStatus) {
            return res.status(400).json({ message: "Invalid status value." });
        }
        if (normalizedStatus) filter.status = normalizedStatus;
        if (email) filter.email = sanitizeInput(email).toLowerCase();

        const tickets = await Ticket.find(filter).sort({ createdAt: -1 }).limit(100);
        res.status(200).json({ tickets: tickets.map((ticket) => buildTrackingResponse(ticket, { includeCustomer: true })) });
    } catch (error) {
        console.error("Error fetching admin e-waste tickets:", error);
        res.status(500).json({ message: "Error fetching e-waste tickets" });
    }
});

app.get("/admin/ewaste-tickets/:ticketID", requireAdmin, async (req, res) => {
    try {
        const ticket = await Ticket.findOne({ ticketID: sanitizeInput(req.params.ticketID) });
        if (!ticket) {
            return res.status(404).json({ message: "Ticket not found." });
        }

        res.status(200).json({ ticket: buildTrackingResponse(ticket, { includeCustomer: true }) });
    } catch (error) {
        console.error("Error fetching admin e-waste ticket:", error);
        res.status(500).json({ message: "Error fetching e-waste ticket" });
    }
});

app.patch("/admin/ewaste-tickets/:ticketID/status", requireAdmin, async (req, res) => {
    try {
        const status = normalizeTicketStatus(req.body.status);
        if (!status) {
            return res.status(400).json({
                message: "Invalid status value.",
                allowedStatuses: EWASTE_TRACKING_STATUSES,
            });
        }

        const ticket = await Ticket.findOne({ ticketID: sanitizeInput(req.params.ticketID) });
        if (!ticket) {
            return res.status(404).json({ message: "Ticket not found." });
        }

        const statusNote = sanitizeInput(req.body.statusNote || req.body.note || "");
        const facility = sanitizeInput(req.body.facility || ticket.facility || "");
        const changedBy = sanitizeInput(req.body.changedBy || "admin");

        ticket.status = status;
        ticket.statusNote = statusNote || ticket.statusNote;
        ticket.facility = facility;
        if (req.body.scheduledPickupAt) ticket.scheduledPickupAt = new Date(req.body.scheduledPickupAt);
        if (req.body.estimatedCompletionAt) ticket.estimatedCompletionAt = new Date(req.body.estimatedCompletionAt);
        if (req.body.recyclingReportUrl) ticket.recyclingReportUrl = sanitizeInput(req.body.recyclingReportUrl);
        if (req.body.productName) ticket.productName = sanitizeInput(req.body.productName);
        if (req.body.productCategory) ticket.productCategory = sanitizeInput(req.body.productCategory);
        if (req.body.productImageUrl) ticket.productImageUrl = sanitizeInput(req.body.productImageUrl);
        ticket.statusHistory.push({
            status,
            note: ticket.statusNote,
            facility: ticket.facility,
            changedBy,
        });

        await ticket.save();
        res.status(200).json({
            message: "Ticket status updated successfully.",
            ticket: buildTrackingResponse(ticket, { includeCustomer: true }),
        });
    } catch (error) {
        console.error("Error updating e-waste ticket status:", error);
        res.status(500).json({ message: "Error updating e-waste ticket status" });
    }
});

// ✅ Unified Server Start
const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
