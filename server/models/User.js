import mongoose from 'mongoose'
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, sparse: true },
  passwordHash: String,
  avatar: String,
  bio: String,
  plan: { type: String, default: 'Free' },
  likedSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],
  likedMeta: [{ type: mongoose.Schema.Types.Mixed }],   // full track JSON (saavn/youtube ids) for cross-device liked
  rawPlaylists: [{ type: mongoose.Schema.Types.Mixed }],// full playlist objects (client shape) for cloud sync
  followers: { type: Number, default: 0 },
  following: { type: Number, default: 0 }
}, { timestamps: true })
export default mongoose.models.User || mongoose.model('User', userSchema)
