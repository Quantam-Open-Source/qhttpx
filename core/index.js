const { join } = require('path')
const { platform, arch } = process

let nativeBinding = null

if (platform === 'win32' && arch === 'x64') {
  nativeBinding = require('./qhttpx-core-new.win32-x64-msvc.node')
} else if (platform === 'linux' && arch === 'x64') {
  nativeBinding = require('./qhttpx-core-new.linux-x64-gnu.node')
} else if (platform === 'darwin') {
  if (arch === 'x64') {
    nativeBinding = require('./qhttpx-core-new.darwin-x64.node')
  } else if (arch === 'arm64') {
    nativeBinding = require('./qhttpx-core-new.darwin-arm64.node')
  }
} else {
  throw new Error(`Unsupported platform: ${platform} ${arch}`)
}

module.exports = nativeBinding
