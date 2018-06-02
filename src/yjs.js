console.log('hello from src/yjs...')

const Y = require('yjs')

// Yjs plugins
require('y-memory')(Y)
require('y-array')(Y)
require('y-text')(Y)
//will also need a connector here... not y-ipfs-connector, but something with socket.io

Y({
  db: {
    name: 'memory'
  },
  connector: {
    // name: 'ipfs', // use the IPFS connector
    room: 'Textarea-example-dev',
    // ipfs: ipfs
  },
  share: {
    textarea: 'Text' // y.share.textarea is of type Y.Text
  }
}).then(function (y) {
  // bind the textarea to a shared text element
  y.share.textarea.bind(document.getElementById('textfield'))
})
