import app from './app.js'
import { createServer } from 'http'

const PORT = process.env.PORT || 3001

const server = createServer(app)
server.listen(PORT, () => {
  console.log(`🚀 Habby habits server running on http://localhost:${PORT}`)
  console.log(`📦 Redis via REDIS_URL env var`)
})
