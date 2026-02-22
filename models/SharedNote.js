import mongoose from 'mongoose';

const SharedNoteSchema = new mongoose.Schema({
    lectureNumber: { type: Number, required: true },
    textContent: { type: String },
    fileRef: { type: String },
    fileType: { type: String },
    fileName: { type: String },
    uploadedBy: { type: String, required: true },
    email: { type: String, required: true },
    date: { type: Date, default: Date.now }
});

export default mongoose.model('SharedNote', SharedNoteSchema);
