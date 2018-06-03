console.log('3. hello from src/yjs...')

//notes:
//1) in package.json, compiling each .js file in public/folder and src/yjs by running `npm run compile`
//2) including script src 'public/bundle' in index.html package
//3) serving INDEX page in server.js by running `node server.js`, and all js files with 'server.use(/public)' in server.js
//4) need to run `npm run compile` each time a .js file gets updated!
//5) then restart Express server, with `node server.js`

//new note:
//the directions for y-websockets-server, via here: https://github.com/y-js/y-websockets-server#global-installation-easy
//say: "Execute binary y-websockets-server [--port port] [--db db] (defaults: port = 1234, db = memory (choose either leveldb or memory))."
//i didn't know what that meant. after some research, realized one way to run that binary is:
//run `npx y-websockets-server` in Terminal

//so to run this app locally, run:
//1) `node server.js`, and, in another Terminal tab:
//2) `npm y-websockets-server`

//update:
//1) locally installed y-websockets-server, in my-y-websockets-server, and added it to Heroku, following these directions: https://github.com/y-js/y-websockets-server#setup-with-heroku
//2) now to run app locally, simply run `node server.js`, or `npm start`, which runs `node server.js`
//3) will now add this whole app to Heroku, so the 'frontend' will be online as well.

const Y = require('yjs')

// Yjs plugins
require('y-memory')(Y)
require('y-array')(Y)
require('y-text')(Y)
require('y-websockets-client')(Y) //i imagine i need to require this too...
//will also need a connector here... not y-ipfs-connector, but something with socket.io

var io = Y['websockets-client'].io //need to get this.....


// var link = 'http://localhost:1234'
var link = 'https://my-y-websockets-server.herokuapp.com/'

// create a connection
var connection = io(link) //need to include LINK within io()...

Y({
  db: {
    name: 'memory' // use the memory db adapter
  },
  connector: {
    name: 'websockets-client', // use the websockets-client connector
    room: 'Textarea-example-dev',
    socket: connection, //passing connection above as the socket...
    url: link // the connection endpoint (see y-websockets-server)
  },
  share: {
    textarea: 'Text' // y.share.textarea is of type Y.Text
  }
}).then(function (y) {
  // bind the textarea to a shared text element
  y.share.textarea.bind(document.getElementById('textfield'))
})

// console.log('3. in yjs, Y is: ', Y)
