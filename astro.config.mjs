import typescript from 'astrojs-typescript'

export default {
  site: 'https://habby.vercel.app',
  integrations: [typescript()],
  security: {
    checkOrigin: false
  }
}