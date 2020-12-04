var jwt = require('jwt-simple');

module.exports.checkAuth = function(req, res, next){
	if(req.headers['x-auth']){
		try{
			req.auth = jwt.decode(req.headers['x-auth'], process.env.JWT_SECRET);
			if(req.auth && req.auth.authorized && req.auth.userId){
				return next();
			} else {
				return next(new Error('User is logged in.'));
			}
		} catch(err){
			console.log('err: ' + err);
			return(err);
		}
	} else{
		return next(new Error('User is not logged in.'));
	}
};