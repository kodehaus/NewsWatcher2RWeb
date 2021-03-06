"use string";
var bcrypt = require('bcryptjs');
var https = require('https');
var async = require ('async');
var assert = require('assert');
var ObjectId = require('mongodb').ObjectID;
var MongoClient = require('mongodb').MongoClient;


var globalNewsDoc;
const NEWYORKIMES_CATREGORIES = ["home", "world", "national", "business","technology"];

var db = {};
MongoClient.connect(process.env.MONGODB_CONNECT_URL, {useNewUrlParser: true}, function (err, client){
	assert.equal(null, err);
	db.client = client;
	db.collection = client.db('newswatcherdb').collection('newswatcher');
	console.log("Fork is connected to Mongodb server");
});

process.on('message', function(m){
	if(m.msg){
		if(m.msg == 'REFRESH_STORIES'){
			setImmediate(function (doc){
				refreshStoriesMSG(doc, null);
			}, m.doc);
		}
	} else {
		console.log('Message from master:', m);
	}
});

var count = 0 ;
newsPullBackgroundTimer = setInterval(function(){
	var date = new Date();
	console.log("app_Fork: datetime tick: " + date.toUTCString());
	async.timeSeries(NEWYORKTIMES_CATEGORIES.length, function(n, next){
		setTimeout(function(){
			console.log('Get news stories from NYT. Pass $', n);
			try {
				https.get({
					host: 'api.nytimes.com',
					path: 'svc/topstories/v2/' + NEWYORKTIMES_CATEGORIES[n] + '.json',
					headers: {'api-key': process.env.NEWYORKTIMES_API_KEY}
				}, function(res){
					var body = '';
					res.on('data', function(d){
						body += d;
					});
					res.on('end',function(){
						next(null, body);
					});
				}).on('error', function(err){
					console.log({msg: 'FORK_ERROR', Error: err.message});
					return;
				});
			}
			catch(err){
				count++;
				if(count == 3){
					consoe.log('app_FORK.js: shuting down timer:' + err);
					clearInterval(newsPullBackgroundTimer);
					clearInterval(staleStoryDeleteBackgroundTimer);
					processs.disconnect();
				} else {
					console.log('app_FORK.js error. err:' + err);
				}
			}
		}, 500);}, function(err, results){
			if(err){
				console.log('failure');
		} else {
			console.log('success');
			db.collection.findOne({
				_id: process.env.GLOBAL_STORIES_ID},
				function(err, gDoc){
					if (err){
						console.log({msg: 'FORK_ERROR', Error: 'Error with the global news doc read request: ' + JSON.stringify(err.body, null, 4)});
					} else {
						gDoc.newsStories = [];
						gDoc.homeNewsStories = [];
						var allNews = [];
						for(var i = 0; i < results.length; i++){
							try{
								var news = JSON.parse(results[i]);
							} catch(e){
								console.error(e);
								return;
							}
							for(var j = 0; j < news.results.length; j++){
								var xferNewsStory = {
										link: news.results[j].url,
										title: news.results[j].title,
										contentSnippet: news.results[j].abstract,
										source: news.results[j].section, 
										date: new Date(news.results[j].updated_date).getTime()
								};
								if(news.results[j].ultimedia.length >0){
									xferNewsStory.imageUrl = news.results[j].ultimedia[0].url;
									allNews.push(xferNewsStory);
									if(i == 0){
										gDoc.homeNewsStories.push(xfernewsStory);
									}
								}
							}
						}
						async.eachSeries(allNews, function(story, innercallback){
							bcrypt.hash(story.link, 10, function getHash(err, hash){
								if(err)
									innercallback(err);
								story.storyID = hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
								if(gDoc.newsStories.findIndex(function(o){
									if(o.storyID == story.storyID || o.title == story.title)
										return true;
									else
										return false;
									}) == -1){
									
									gDoc.newsStories.push(story);
								}
								innercallback();
								});
								}, function(err){
									if(err){
										console.log('failure on story id creation');
									} else {
										console.log('story id creation success');
										globalNewsDoc = gDoc;
										setImmediate(function(){refreshAllUserStories();
										});
									}
									});
					}
								
								});
							}
						});
						}, 240 * 60 * 1000);


function refreshAllUserStories(){
	db.collection.findOneAndUpdate({
		_id: globalNewsDoc._id},
		{$set: {newsStories: globalNewsDoc.newsStories, homeNewsStories: globalNewsDoc.homeNewsStories}},
		function (err, result){
			if(err){
				console.log('FORK_ERROR Replace of global newsStories failed:', err);
			} else if(result.ok != 1){
				console.log('Replace of global newsStories failed:', result);
			} else {
				var cursor = db.collection.find({type: 'USER_TYPE'});
				var keepProcessing = true;
				async.doWhilst(
						function (callback){
							cursor.next(function(err, doc){
								if(doc){
									refreshStories(doc, function(err){
										callback(null);
									});
								} else {
									keepProcessing = false;
									callback(null);
								}
							});
						}, function(){return keepProcessing;},
						function(err){
							console.log('Timer: Refreshed and matched. err:', err);
						});
			}
		});
	}

staleStoryDeleteBackgroundTimer = setInterval(function(){
	db.collection.find({type: 'SHAREDSTORY_TYPE'}).toArray(function(err, docs){
		if(err){
			console.log('Fork could not get shared stories. err:', err);
			return;
		}
		async.eachSeries(docs, function(story, innnercallback){
			var d1 = story.comments[0].dateTime;
			var d2 = Date.now();
			var diff = Math.floor((d2 - d1) / 3600000);
			if(diff > 72){
				db.collection.findOneAndDelete({
					type: 'SHAREDSTORY_TYPE',
					_id: story._id},
					function(err, result){
						innercallback(err);
					});
			} else {
				innercallback();
			}
		}, function (err){
			if(err){
				console.log('stale story deletion failure');
			} else {
				console.log('stale story deletion success');
			}
		});		
	});
}, 24 * 60 *1000);