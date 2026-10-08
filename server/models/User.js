import mongoose from 'mongoose'
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, sparse: true },
  passwordHash: String,
  avatar: String,
  bio: String,
  plan: { type: String, default: 'Free' },
  likedSongs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Track' }],
  followers: { type: Number, default: 0 },
  following: { type: Number, default: 0 }
}, { timestamps: true })
export default mongoose.models.User || mongoose.model('User', userSchema)
