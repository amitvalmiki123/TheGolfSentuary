import mongoose from 'mongoose'
// MaxMusic Pro UPI payment requests (see ../prostore.js). Persisted so pending/approved
// requests survive Render free-tier restarts when MONGO_URI is configured.
const proRequestSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  userId: { type: String, index: true },
  utr: { type: String, index: true },
  amount: Number,
  ts: Number,
  status: { type: String, default: 'pending' },
  code: String,
  approvedAt: Number,
  consumedAt: Number,
  consumedBy: String
}, { timestamps: true })
export default mongoose.models.ProRequest || mongoose.model('ProRequest', proRequestSchema)
