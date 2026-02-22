import mongoose from 'mongoose';

const SettingsSchema = new mongoose.Schema({
    totalLectures: { type: Number, default: 200 }
});

export default mongoose.model('Settings', SettingsSchema);
