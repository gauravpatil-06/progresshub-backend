import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import User from './models/User.js';
import Progress from './models/Progress.js';
import SharedNote from './models/SharedNote.js';
import Settings from './models/Settings.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware for logging requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

console.log('Attempting to connect to MongoDB...');
mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB at', MONGODB_URI);
        // Seed Admin User
        try {
            const adminExists = await User.findOne({ email: 'admin@gmail.com' });
            if (!adminExists) {
                const admin = new User({
                    name: 'Admin',
                    email: 'admin@gmail.com',
                    password: 'Admin@06', // Use same as hardcoded in frontend
                    role: 'admin'
                });
                await admin.save();
                console.log('⭐ Admin user seeded successfully');
            } else {
                console.log('ℹ️ Admin user already exists');
            }
        } catch (seedErr) {
            console.error('❌ Error seeding admin user:', seedErr);
        }
    })
    .catch(err => console.error('❌ MongoDB connection error:', err));

// --- Auth Routes ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'Email already exists' });

        const user = new User({ name, email, password, role: 'user' });
        await user.save();
        res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email, password }); // In prod use bcrypt
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });
        res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/auth/profile', async (req, res) => {
    try {
        const { id, name, avatar } = req.body;
        const user = await User.findByIdAndUpdate(id, { name, avatar }, { new: true });
        res.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Progress Routes ---
app.get('/api/progress/:userId', async (req, res) => {
    try {
        const progress = await Progress.find({ userId: req.params.userId });
        const progressObj = {};
        progress.forEach(p => {
            progressObj[p.lectureId] = { completedAt: p.completedAt, note: p.note, hasNotes: p.hasNotes };
        });
        res.json(progressObj);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/progress', async (req, res) => {
    try {
        const { userId, lectureId, completedAt, note, hasNotes } = req.body;
        const progress = await Progress.findOneAndUpdate(
            { userId, lectureId },
            { completedAt, note, hasNotes },
            { upsert: true, new: true }
        );
        res.json(progress);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Shared Notes Routes ---
app.get('/api/notes', async (req, res) => {
    try {
        const notes = await SharedNote.find().sort({ date: -1 });
        res.json(notes);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/notes', async (req, res) => {
    try {
        const note = new SharedNote(req.body);
        await note.save();
        res.status(201).json(note);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/notes/:id', async (req, res) => {
    try {
        await SharedNote.findByIdAndDelete(req.params.id);
        res.json({ message: 'Note deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Settings Routes ---
app.get('/api/settings', async (req, res) => {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings({ totalLectures: 200 });
            await settings.save();
        }
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const settings = await Settings.findOneAndUpdate({}, req.body, { upsert: true, new: true });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Migration Route ---
app.post('/api/migrate', async (req, res) => {
    try {
        const { users, progress, notes, settings } = req.body;

        // Reset or merge? For simplified migration, let's clear and re-insert if admin
        // Actually, let's just insert missing ones or update

        if (settings) {
            await Settings.findOneAndUpdate({}, settings, { upsert: true });
        }

        if (users && users.length > 0) {
            for (const u of users) {
                // Map old ID to new Mongo ID if needed, but here we might just use email as key
                await User.findOneAndUpdate(
                    { email: u.email },
                    { name: u.name, password: u.password, role: u.role, createdAt: u.createdAt, avatar: u.avatar },
                    { upsert: true }
                );
            }
        }

        // Mapping users for progress migration
        const dbUsers = await User.find();
        const emailToId = {};
        dbUsers.forEach(u => emailToId[u.email] = u._id);

        if (progress) {
            // progress is expected to be { oldUserId: { lectureId: { ... } } }
            // and we need to map oldUserId (from localStorage users array) to MongoId
            // The frontend will send the mappings
            for (const [oldUserId, lectures] of Object.entries(progress)) {
                const userEmail = users.find(u => u.id === oldUserId)?.email;
                const mongoId = emailToId[userEmail];
                if (mongoId) {
                    for (const [lectureId, data] of Object.entries(lectures)) {
                        await Progress.findOneAndUpdate(
                            { userId: mongoId, lectureId },
                            { completedAt: data.completedAt, note: data.note, hasNotes: data.hasNotes },
                            { upsert: true }
                        );
                    }
                }
            }
        }

        if (notes && notes.length > 0) {
            for (const n of notes) {
                await SharedNote.findOneAndUpdate(
                    { lectureNumber: n.lectureNumber, email: n.email, date: n.date },
                    n,
                    { upsert: true }
                );
            }
        }

        res.json({ success: true, message: 'Migration completed' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Admin User Management ---
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find({ role: 'user' });
        const progress = await Progress.find();

        const fullData = users.map(u => {
            const userProgress = {};
            progress.filter(p => p.userId.toString() === u._id.toString()).forEach(p => {
                userProgress[p.lectureId] = p;
            });
            return {
                id: u._id,
                name: u.name,
                email: u.email,
                role: u.role,
                avatar: u.avatar,
                createdAt: u.createdAt,
                progress: userProgress
            };
        });
        res.json(fullData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/admin/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        await Progress.deleteMany({ userId: req.params.id });
        // Notes are linked by email, so we might want to delete them too if we want a clean wipe
        const user = await User.findById(req.params.id);
        if (user) {
            await SharedNote.deleteMany({ email: user.email });
        }
        res.json({ message: 'User and their data deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
