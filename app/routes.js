var _ = require('underscore');

var lines = require('../data/lines');
var stops = require('../data/stops');

if (typeof Number.prototype.toRadians == 'undefined') {
    Number.prototype.toRadians = function() { return this * Math.PI / 180; };
}

function calc_distance (lat1, lat2, lon1, lon2) {
	var R = 6371; // km
	var φ1 = lat1.toRadians();
	var φ2 = lat2.toRadians();
	var Δφ = (lat2-lat1).toRadians();
	var Δλ = (lon2-lon1).toRadians();

	var a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
	        Math.cos(φ1) * Math.cos(φ2) *
	        Math.sin(Δλ/2) * Math.sin(Δλ/2);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

	var d = R * c;

	return d;
}

module.exports = function(app) {
	
	app.get('/', function(req, res) {
		res.send('Bear Transit API');
	});

	app.get('/api/v1/lines', function(req, res, next) {
		res.json(lines.lines);
	});

	app.get('/api/v1/stops', function(req, res, next) {
		var lat = Number(req.query.lat) || null;
		var lon = Number(req.query.lon) || null;

		var stops_arr = _.map(stops, function(value, key) {
			value.id = key;
			if (lat && lon) {
				value.dist = calc_distance(lat, value.lat, lon, value.lon);
			}
			return value;
		});

		if (lat && lon) {
			stops_arr.sort(function(a, b) {
				if (a.dist < b.dist) return -1;
				else return 1;
			});
		}

		res.json(stops_arr);
	});

};