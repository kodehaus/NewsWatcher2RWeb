var dotenv = require('dotenv').config({ path: '/Users/kennethrobinson/Documents/nodePlayGround/NewsWatcher2RWeb/env/app.env' });
var express = require('express');
var path = require('path');
var logger = require('morgan');
var bodyParser = require('body-parser');
var cp = require('child_process');
var responseTime = require('response-time');
var assert = require('assert');
var helmet = require('helmet');
var RateLimit = require('express-rate-limit');
var csp = require('helmet-csp');
var stack = require('stack');


var users = require('./routes/users');
var session = require('./routes/sessions');
var sharedNews = require('./routes/sharedNews');
var homeNews = require('./routes/homeNews');

var app = express();
app.enabled('trust proxy');

//Apply limits to all requests
var limiter = new RateLimit({
	windowMs: 15 * 60 * 1000,
	max: 100,
	delayMs: 0
});
app.use(limiter);

app.use(helmet());
app.use(csp({
	directives:{
		defaultSrc: ["'self'"],
		scriptSrc: ["'self'", "'unsafe-inline'", 'ajax.googleapis.com','maxcdn.bootstrapcdn.com'],
		styleSrc: ["'self'", "'unsafe-inline'",'maxcdn.bootstrapcdn.com'],
		fontSrc: ["'self'", 'maxcdn.bootstrapcdn.com'],
		imgSrc: ['*']
	}
}));
app.use(responseTime());
app.use(logger('dev'));

app.use(bodyParser.json({limit: '100kb'}));
app.get('/', function(req, res){
	res.sendFile(path.join(__dirname, 'build', 'index.html'));	
});


app.use(express.static(path.join(__dirname, 'build')));


//var node2 = cp.fork('./worker/app_FORK.js');
//var node2 = cp.fork('./worker/app_FORK.js',[],{execArgv: ['--inspect=9229']});

var node2 = cp.fork('./worker/app_FORK.js');
node2.on('exit', function (code) {
  console.log("Worker crashed and was restarted.", code);
  node2 = undefined;
  // We  don't want to restart if this was a mocha test run.
  if (!server.testrun)
    node2 = cp.fork('./worker/app_FORK.js');
});
//node2.on('exit', function(code){
//	node2 = undefined;
//	node2 = cp.fork('./worker/app_FORK.js');
//});



//if(process.env.NODE_ENV !== 'production'){
//}

//Set up the db
var db = {};
var MongoClient = require('mongodb').MongoClient;
MongoClient.connect(process.env.MONGODB_CONNECT_URL, {useNewUrlParser: true}, 
		function(err, client){
	assert.equal(null, err);
	db.client = client;
	db.collection = client.db('newswatcherdb').collection('newswatcher');
});



//If our process is shut down, close out the database connections gracefully
process.on('SIGINT', function () {
  console.log('MongoDB connection close on app termination');
  db.client.close();
  node2.kill();
  process.exit(0);
});

process.on('SIGUSR2', function () {
  console.log('MongoDB connection close on app restart');
  db.client.close();
  node2.kill();
  process.kill(process.pid, 'SIGUSR2');
});


app.use(function (req, res, next){
	req.db = db;
	req.node2 = node2;
	next();
});


app.use('/api/users', users);
app.use('/api/sessions', session);
app.use('/api/sharednews', sharedNews);
app.use('/api/homenews', homeNews);


app.use(function(req, res, next){
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});


if(app.get('env') === 'development'){
	app.use(function(err, req, res, next){
		res.status(err.status || 500).json({message: err.toString(),
			error: err });
		console.log(err);
	});
}

//production error handler with no stacktraces exposed to users
app.use(function (err, req, res, next) { // eslint-disable-line no-unused-vars
  // if (process.env.NODE_ENV === 'production') {
  //   var segment = AWSXRay.getSegment();
  //   segment.addAnnotation("errorHandler", err.toString());
  //   segment.addMetadata("errorHandler", err.toString());
  //   // segment.addError(err);
  // }
  console.log(err);
  res.status(err.status || 500).json({ message: err.toString(), error: {} });
  // if (process.env.NODE_ENV === 'production') {
  //   AWSXRay.express.closeSegment()
  // }
});

app.set('port', process.env.PORT || 3000);

var server = app.listen(app.get('port'), function() {
	console.log('Express server listening on port: ' + 
			server.address().port);
});


server.db = db;
server.node2 = node2;
console.log(`Worker ${process.pid} started`);



//server.node2 = node2;
if (!process.env.RUN_CLUSTERED)
  module.exports = server;
//module.exports = app;