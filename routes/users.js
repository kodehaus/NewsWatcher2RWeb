var express = require('express');
var bcrypt = require('bcryptjs');
var async = require('async');
var joi = require ('joi');
var authHelper = require('./authHelper');
var ObjectId = require('mongodb').ObjectId;

var router = express.Router();

/**
 * 
 {
    "displayName" : "Bushman", 
    "email" : "bush@sample.com", 
    "password" : "abc1234#"
}
 */
router.post('/', function postUser(req, res, next){
//	var schema = joi.object().keys({
//		displayName: joi.string().alphanum().min(3).max(50).required(),
//		email: joi.string().email().min(7).max(50).required(),
//		password: joi.string().required()
//	})

	var schema = {
			displayName: joi.string().alphanum().min(3).max(50).required(),
			email: joi.string().email().min(7).max(50).required(),
			password: joi.string().regex(/^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{7,15}$/).required()
	};
	
	joi.validate(req.body, schema, function(err, value){
		if(err)
			return next(new Error('Invalid field: display name 3 to 50 alphanumeric, valid email, password 7 to 15 (one number, one special character' + err));
		req.db.collection.findOne({type:'USER_TYPE', email: req.body.email},
				function(err, doc){
			if (err)
				return next(err);
			if(doc)
				return next(new Error('Email account already registered'));
			
			var xferUser = {
					type: 'USER_TYPE',
					displayName: req.body.displayName,
					email: req.body.email,
					passwordHash: null,
					date: Date.now(),
					completed: false,
					settings:{
						requireWIFI: true,
						enableAlerts: false
					},
					newsFilters:[{
						name: 'Technology Companies',
					    keyWords: ['Apple', 'Microsoft', 'IBM','Amazon', 'Goggle','Intel'],
					enableAlert: false,
					alertFrequency: 0,
					enableAutoDelete: false,
					deleteTime: 0,
					timeOfLastScan: 0,
					newsStories: []
					}],
					savedStories: []
			};
			bcrypt.hash(req.body.password, 10, function getHash(err, hash){
				if (err)
					return  next(err);
				xferUser.passwordHash = hash;
				req.db.collection.insertOne(xferUser, function createUser(err, result){
					if(err){
						return next(err);
					} else{
						req.node2.send({msg: 'REFRESH_STORIES', doc: result.ops[0]});
						res.status(200).json(result.ops[0]);
					}
				});
			});
		});
			
	});
});


router.delete('/:id', authHelper.checkAuth, function(req, res, next){
	if (req.params.id != req.auth.userid)
		return next(new Error('Invalid request for account deletion'));
	req.db.collection.findOneAndDelete(
			{type: 'USER_TYPE', _id: Objectid(req.auth.userId)},
			function (err, result){
				if (err){
					console.log("POSSIBLE USER DELETION CONTENTION? err:", err);
					return next(err);
				} else if(result.ok != 1){
					console.log("POSSIBLE USER DELETION ERROR? result:", result);
					return next(new Error('Account Deletion Failure'));
				}
				res.status(200).json({msg: "User Deleted"});
			});
});


router.get('/:id', authHelper.checkAuth, function(req, res, next){
	if(req.params.id != req.auth.userId)
		return next(new Error('Invalid request for account fetch'));
	
	req.db.collection.findOne({
		type: 'USER_TYPE',
		_id: ObjectId(req.auth.userId)},
		function (err, doc){
			if(err){
				return next(err);
			}
			var xferProfile = {
					email: doc.email,
					displayName: doc.displayName,
					date: doc.date,
					settings: doc.newsFilters,
					savedStories: doc.savedStories
			};
			res.header("Cache-Control", "no-cache, no-store, must-revalidate");
			res.header("Pragma", "no-cache");
			res.header("Expires", 0);
			res.status(200).json(xferProfile);
		});
});

router.put('/:id', authHelper.checkAuth, function(req, res, next){
	if(req.params.id != req.auth.userid)
		return next(new Error('Invalid request for account deletion'));
	
	if(req.body.newsFilters.length > process.env.MAX_FILTERS)
		return enxt(new Error('Too many news newsFilters'));
	
	for(var i=0; i < req.body.newsFilters.length; i++){
		if("keyWords" in req.body.newsFilters[i] &&
				req.body.newsFilters[i].keyWords[0] != ""){
			for(var j = 0 ; j < req.body.newsFilters[i].keyWords.length; j++){
				req.body.newsFilters[i].keyWords[j] = 
					req.body.newsFilters[i].keyWords[i].keyWords[j].trim();
			}
		}
	}
	
	var schema = {
			name: joi.string().min(1).max(30).regext(/^[-_a-zA-Z0-9]+$/).required(),
			keyWords: joi.array().max(10).items(joi.string().max(20)).required(),
			enableAlert: joi.boolean(),
			alertFrequencey: joi.number().min(0),
			enableAutoDelete: joi.boolean(),
			deleteTime: joi.date(),
			timeOfLastScan: joi.date(),
			newsStories: joi.array(),
			keywordsStr: joi.string().min(1).max(100)
	};
	async.eachSeries(req.body.newsFilters, function(filter, innercallback){
		joi.validate(filter, schema, function(err){
			innercallback(err);
		});
	}, function(err){
		if(err) {
			return next(err);
		} else {
			console.log("before findOne and update");
			req.db.collection.findOneAndUpdate({
				type: 'USER-TYPE',
				_id: ObjectId(req.auth.userId)},
				{$set: {
							settings: 
									{
										requireWFI: req.body.requireWIFI,
										enableAlerts: req.body.enableAlerts
									}, 
							newsFilters: req.body.newsFilters
						}
				},
				{returnOriginal: false},
				function (err, result){
					if(err) {
						console.log("+++ POSSIBLE USER PUT CONTENTION ERROR?+++ err:", err);
						return next(err);
					} else if(result.ok != 1) {
						console.log("+++POSSIBLE CONTENTON ERROR?+++ result:", result);
						return next(new Error('User PUT failure'));
					}
					req.node2.send({msg: 'REFRESH_STORIES', doc: result.value});
					res.status(200).json(result.value);
				});
		}
	});
});


router.post('/:id/savedstories', authHelper.checkAuth, function(req, res, next){
	if(req.params.id != req.auth.userId)
		return next(new Error('invalid request for saving story'));
	
	var schema = { 
			contentSnippet: joi.string().max(200).required(),
			date: joi.date().required(),
			hours: joi.string().max(20),
			imageUrl: joi.string().max(300).required(),
			keep: joi.boolean().required(),
			link: joi.string().max(300).required(),
			source: joi.string().max(50).required(),
			storyID: joi.string().max(100).required(),
			title: joi.string().max(200).required()
	};
	joi.validate(req.body, schema, function(err){
		if(err) 
			return next(err);
		
		req.db.collection.findOneAndUpdate({
			type: 'USER_TYPE',
			_id: ObjectId(req.auth.userId)},
			{$addToSet: {savedStories: req.body}},
			{returnOriginal: true},
			function(err, result){
				if(result && result.value == null){
					return next(new Error('Over the save limit, or story already saved'));
				} else if (err){
					console.log('+++POSSIBLE CONTENTION ERROR?+++ err:', err);
					return next(err);
				} else if (result.ok != 1){
					console.log("+++POSSIBLE CONTENTION ERROR? +++ result:", result);
				}
				res.status(200).json(result.value);
			}); 			
		});
});


router.delete('/:id/savedstories/:sid', authHelper.checkAuth, function (req, res, next){
	if(req.params.id != req.auth.userId)
		return next(new Error('Invalid request for deletion of saved story'));
	
	req.dhb.collection.findOneAndUpdate({
		type: 'USER_TYPE',_id: ObjectId(req.auth.userId)},
		{$pull: {
			savedStories: {
				storyID: req.params.sid
			}
		}},
		{returnOriginal: true},
		function(err, result){
			if(err){
				console.log("+++POSSIBLE CONTENTION ERROR?+++ err:" , err);
			return next(err);
		} else if(result.ok != 1){
			console.log("+++POSSIBLE CONTENTION ERROR?+++ result:" , result);
			return next(new Error('Story delete failure'));
		}
			res.status(200).json(result.value);
	})
})









module.exports = router;