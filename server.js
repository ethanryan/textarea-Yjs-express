console.log('hello from server.js...')

//adding below based on Heroku example: https://github.com/heroku-examples/node-socket.io/blob/master/server.js
'use strict';

const express = require('express');
const server = express();
// const socketIO = require('socket.io');
const path = require('path');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'index.html');

// we'll create our routes here

// get an instance of router
// var router = express.Router();
//
// // route middleware that will happen on every request
// router.use(function(req, res, next) {
//
//     // log each request to the console
//     console.log(req.method, req.url);
//
//     // continue doing what we were doing and go to the route
//     next();
// });
//
// // home page route (http://localhost:8080)
// // router.get('/', function(req, res) {
// //     res.send('im the home page!');
// // });
//
// // about page route (http://localhost:8080/about)
// router.get('/about', function(req, res) {
//     res.send('im the about page!');
// });
//
// // route middleware to validate :name
// router.param('name', function(req, res, next, name) {
//     // do validation on name here
//     // blah blah validation
//     if(name === "frank") {
//       console.log("fuck! it's FRANK...")
//     }
//     // log something so we know its working
//     console.log('doing name validations on ' + name);
//
//     // once validation is done save the new item in the req
//     req.name = name;
//     // go to the next thing
//     next();
// });
//
// // route with parameters (http://localhost:8080/hello/:name)
// router.get('/hello/:name', function(req, res) {
//     res.send('hello ' + req.params.name + '!');
// });
//
// server.route('/login')
//
//     // show the form (GET http://localhost:8080/login)
//     .get(function(req, res) {
//         res.send('this is the login form');
//     })
//
//     // process the form (POST http://localhost:8080/login)
//     .post(function(req, res) {
//         console.log('processing');
//         res.send('processing the login form!');
//     });

// apply the routes to our application
// server.use('/', router); //note: .use defines middleware... order is important!




// 1) first parameter is the mount point, second is the location in the file system
server.use("/public", express.static(__dirname + "/public"));

// Or 2) Express Middleware for serving static files
// server.use(express.static(path.join(__dirname, 'public')));

//const server = express() //up above...
server
  .use((req, res) => res.sendFile(INDEX) ) //want to also handle all other static files, somehow...
  .listen(PORT)
console.log(`Server is listening on port: ${ PORT }`);

// const io = socketIO(server); //note: the Socket.io server takes an HTTP server as an argument so that it can listen for socket.io-related requests
