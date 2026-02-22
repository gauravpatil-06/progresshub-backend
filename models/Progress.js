import mongoose from 'mongoose';

const ProgressSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lectureId: { type: Number, required: true },
    completedAt: { type: Date },
    note: { type: String, default: '' },
    hasNotes: { type: Boolean, default: false }
});

// Compound index to ensure one progress entry per user per lecture
ProgressSchema.index({ userId: 1, lectureId: 1 }, { unique: true });

export default mongoose.model('Progress', ProgressSchema);
