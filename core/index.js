const { join } = require('path')
const { platform, arch } = process

let nativeBinding = null

if (platform === 'win32' && arch === 'x64') {
  nativeBinding = require('./qhttpx-core-new.win32-x64-msvc.node')
} else {
  throw new Error(`Unsupported platform: ${platform} ${arch}`)
}

module.exports = nativeBinding
