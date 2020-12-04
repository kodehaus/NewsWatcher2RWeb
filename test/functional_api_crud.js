var assert = require('assert');
var app = require('../server.js');
app.testrun = true;
var request = require('supertest')(app);

describe('API endpoint exercising integration tests', function() {
	before(function(done) {
		setTimeout(function() {
			done();
		}, 1999);
	});

	after(function(done) {
		app.db.client.close();
		app.node2.kill();
		app.close(done);
	});
	describe('User Cycle Functions Testing', function() {
		var token;
		var userId;
		var savedDoc;
		
		it("should deny unregistered user a login attempt", function (done) {
			request.post("/api/sessions").send({
				email: 'bush@sample.com',
				password: 'abc123*'
			})
				.end(function (err, res) {
					assert.equal(res.status, 404);
					done();
				});
		});
		
		it('Test to create a new registered user', function(done) {
			request.post("/api/users").send({
				email : "bush@sample.com",
				displayName : "Bushman",
				password : 'abc1234#'
			}).end(
					function(err, res) {
						assert.equal(res.status, 200);
						assert.equal(res.body.displayName, "Bushman",
								'Name of user should be as set');
						done();
					});
		});
		it("should not create a User twice", function(done) {
			request.post("/api/users").send({
				email : 'bush@sample.com',
				displayName : 'Bushman',
				password : 'abc123*'
			}).end(
					function(err, res) {
						assert.equal(res.status, 500);
						assert.equal(res.body.message,
								"Error: Email account already registered",
								"Error should be already registered");
						done();
					});
		});

	});
});