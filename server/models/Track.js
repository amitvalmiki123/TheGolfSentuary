import mongoose from 'mongoose'
const trackSchema = new mongoose.Schema({
  title: { type: String, required: true, index: true },
  artist: { type: String, required: true, index: true },
  album: String,
  cover: String,
  audioUrl: { type: String, required: true },
  duration: Number,
  durationLabel: String,
  category: [{ type: String, index: true }], // e.g. ["Punjabi","Love"]
  source: { type: String, default: 'Saavn • Full' },
  plays: String,
  color: String,
  isPreview: { type: Boolean, default: false }
}, { timestamps: true })
trackSchema.index({ title: 'text', artist: 'text', album: 'text' })
export default mongoose.models.Track || mongoose.model('Track', trackSchema)
