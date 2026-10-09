import mongoose from 'mongoose'
const playlistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  tracks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],
  cover: String,
  isPublic: { type: Boolean, default: false }
}, { timestamps: true })
export default mongoose.models.Playlist || mongoose.model('Playlist', playlistSchema)
