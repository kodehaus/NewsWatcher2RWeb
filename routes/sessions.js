"use strict";
var express = require('express');
var bcrypt = require('bcryptjs');
var jwt = require('jwt-simple');
var joi = require('joi');
var authHelper = require('./authHelper');

var router = express.Router();

router.post('/', function postSession(req,res, next){
	var schema = {
			email: joi.string().email().min(7).max(50).required(),
			password: joi.string().regex(/^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{7,15}$/).required()
	};

	joi.validate(req.body, schema, function(err){
		if(err)
			return next(new Error('invalid field: password 7 to 15 (one number, one special character)'));
	})
	req.db.collection.findOne({type: 'USER_TYPE', email: req.body.email},
			function(err, user){
		if(err)
			return next(err);
		if(!user)
			return next(new Error('User was not found'));
		bcrypt.compare(req.body.password, user.passwordHash,
				function comparePassword(err, match){
					if(match){
						try{
							var token = jwt.encode({
									authorized: true, sessionIP: req.ip,
									sessionUA: req.headers['user-agent'],
									userId: user._id.toHexString(),
									displayName: user.displayName },
								process.env.JWT_SECRET);
							res.status(201).json({
								displayName: user.displayName,
								userId: user._id.toHexString(),
								token: token, msg: 'Authorized'});
						} catch(err){
							return next(err);
						}
					} else {
						return next(new Error('Wrong password'));
					}
		});
	});
		
	});
	
router.delete('/:id', authHelper.checkAuth, function(req, res,next){
	if(req.params.id != req.auth.userId)
		return next(new Error('Invalid request for logout'));
	
	res.status(200).json({msg: 'Logged out'});
});
module.exports = router;