var _ = require('underscore');
var moment = require('moment-timezone');
var request = require('request');

var lines = require('../data/lines');
var stops = require('../data/stops');

if (typeof Number.prototype.toRadians == 'undefined') {
    Number.prototype.toRadians = function() { return this * Math.PI / 180; };
}

function calc_distance (lat1, lat2, lon1, lon2) {
	var R = 3959; // miles
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

function increment_time (time, inc) {
	var hours = Math.floor(time / 100);
	var minutes = time % 100 + inc;
	if (minutes >= 60) {
		hours += Math.floor(minutes / 60);
		minutes %= 60;
	}
	return hours * 100 + minutes;
}

function calc_upcoming_times (m_date, inc, segment) {
	var all_times = _.clone(segment.fixed) || [];

	if (segment.intervals) {
		_.each(segment.intervals, function(interval) {
			var curr = interval[0];
			var counter = 0;
			if (interval[1] < interval[0]) {
				interval[1] += 2400
			}
			do {
				all_times.push(curr);
				if(Number.isInteger(inc)) {
					curr = increment_time(curr, inc);
				} else {
					curr = increment_time(curr, inc[counter]);
					counter++
				}

			} while (curr <= interval[1]);
		});
	}
	var curr_time_formatted = m_date.hour() * 100 + m_date.minute();

	var future_times = _.filter(all_times, function(time) {
		return time >= curr_time_formatted;
	});

	return _.sortBy(future_times, function(i) { return i; });
}

module.exports = function(app) {

	app.get('/', function(req, res) {
		res.render('index');
	});

	app.get('/api-terms', function(req, res) {
		res.render('api-terms');
	});

	app.get('/api/v1/live', function(req, res, next) {
		request.get({url: 'http://bearwalk.berkeley.edu/bustracking/api/v1/positions'}, function(err, httpRes, body) {
			if (err) next(err);
			var data = JSON.parse(body);
			data = _.filter(data, function(x) { return x.vehicle; });
			data = _.map(data, function(x) { return _.pick(x, 'id', 'latitude', 'longitude'); });
			data = _.map(data, function(x) { return {
				'van_id': x.id,
				'x': x.latitude,
				'y': x.longitude
			};});
			res.json(data);
		});
	});

	app.get('/api/v1/lines', function(req, res, next) {
		res.json(lines);
	});

	/*
	Required: id
	*/
	app.get('/api/v1/line/:id', function(req, res, next) {
		if (_.has(lines, req.params.id)) {
			res.json(lines[req.params.id]);
		} else {
			next(new Error(404));
		}
	});

	/*
	Optional: lat, lon
	*/
	app.get('/api/v1/stops', function(req, res, next) {
		var lat = req.query.lat ? Number(req.query.lat) : null;
		var lon = req.query.lon ? Number(req.query.lon) : null;

		var stops_arr = _.map(stops, function(value, key) {
			var stop_obj = _.clone(value);
			stop_obj.id = key;
			if (lat && lon) {
				stop_obj.dist = calc_distance(lat, value.lat, lon, value.lon);
			}
			return stop_obj;
		});

		if (lat && lon) {
			stops_arr.sort(function(a, b) {
				return a.dist - b.dist;
			});
		}

		res.json(stops_arr);
	});

	/*
	Required: id
	Optional: time
	*/
	app.get('/api/v1/stop/:id', function(req, res, next) {
		if (_.has(stops, req.params.id)) {
			var stop = _.clone(stops[req.params.id]);

			if (req.query.time) {
				var next_bus = [];

				var m_date = moment(Number(req.query.time));
				m_date.tz('America/Los_Angeles');
				var day_of_week = m_date.isoWeekday();

				_.each(lines, function(line) {
					// Weekend check
					if (_.contains(line.days, day_of_week)) {
						_.each(line.schedule, function(segment) {
							if (segment.from == req.params.id) {
								var times = calc_upcoming_times(m_date, line.inc, segment);
								if (times.length > 0) {
									next_bus.push({
										"line": line.name,
										"line_note": stops[segment.to].name,
										"times": times
									});
								}
							}
						});
					}
				});

				stop.next = next_bus;

				if (stop.next.length === 0) {
					var ua = req.headers["user-agent"];
					if (ua.indexOf("com.daylenyang.Bear-Transit") !== -1) {
						// Request comes from Bear Transit iPhone app
						var build = Number(ua.substring(ua.indexOf("(") + 1, ua.indexOf(";")));
						if (build >= 3) {
							stop.message = "Day shuttles are not running. Tap the Map tab to see the night shuttle map.";
						} else {
							stop.message = "Day shuttles are not running. Update this app to see the new night shuttle map.";
						}

					} else {
						// Request comes from web
						stop.message = "Day shuttles are not running. For night shuttle status, download the Bear Transit app.";
					}
				}
			}

			res.json(stop);
		} else {
			next(new Error(404));
		}
	});

};