const db = require('../config/db');
const _ = require('lodash');
const request = require("request");
const dotenv = require('dotenv');
const Response = require('./ResponseController');
const input = require('./InputController');
dotenv.config();

const callApiGoogle = (start, stop) => {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      url: 'https://maps.googleapis.com/maps/api/distancematrix/json',
      qs:
              {
                origins: start,
                destinations: stop,
                key: process.env.GOOGLE_APP_KEY,
                mode: 'transit',
                avoid: 'highways',
                transit_mode: 'bus',
                language: 'en'
              },
      headers:
              {
                'postman-token': '5939527f-a16c-1aa6-4a6b-f46991730f2d',
                'cache-control': 'no-cache'
              }
    }

    request(options, function (error, response, body) {
      if (error)
        reject(error);
      const jsonBody = JSON.parse(body);
      resolve(jsonBody);
    });
  });
}

exports.getTrips = async (req, res, next) => {
  try {
    let data = {};
    const location_id = input.checkInputFormat('int', req.query.stop_id);
    const route_id = req.query.route_id;
    let condition = {'routes_detail.locations_id': location_id};
    if (route_id) {
      input.checkInputFormat('int', route_id);
      condition = _.assign({}, condition, {'routes_detail.routes_id': route_id});
    }

    const qPosition = await db.select('routes_detail.priority', 'locations.*', 'routes.routes_id', 'routes.routes_name', 'routes.routes_type_id', 'routes_detail.routes_detail_station_priority', 'service.service_latitude', 'service.service_longtitude', 'service.service_station_priority', 'service_id', 'service_line', 'service_number')
            .from('routes_detail').where(condition)
            .whereNot('locations.locations_type_id', 1)
            .leftJoin('locations', 'routes_detail.locations_id', 'locations.id')
            .leftJoin('routes', 'routes_detail.routes_id', 'routes.routes_id')
            .innerJoin('service', 'routes.routes_name', 'service.service_line').orderBy('routes_detail.priority', 'acs');
    if (qPosition && qPosition.length > 0) {
      //******************** Call Api ********************//
      const latLonStop = qPosition[0].latitude + ',' + qPosition[0].longitude;
      const allLatLon = _.map(qPosition, v => {
        return v.service_latitude + ',' + v.service_longtitude;
      });
      const latLonStart = _.join(allLatLon, '|');
      const _googleMap = await callApiGoogle(latLonStart, latLonStop)
      //******************** End Call Api ********************//

      data = _.map(qPosition, (v, key) => {
        let trip = {
          "id": qPosition[key].id,
          "route-id": qPosition[key].routes_id,
          "service-id": qPosition[key].service_id,
          "trip-headsign": "",
          "trip-short-name": "",
          "direction": _googleMap.rows[key].elements[0].distance.value,
        };
        let vehicle = {
          "id": qPosition[key].service_id,
          "label": qPosition[key].service_line,
          "license-plate": qPosition[key].service_number
        };
        let temp = {
          trip: trip,
          vehicle: vehicle,
          timestamp: _googleMap.rows[key].elements[0].duration.value,
          delay: 0
        };
        return temp;
      });
    }
    res.status(200).json(Response.responseWithSuccess(data));
  } catch (e) {
    console.log(e);
    const err = Response.responseWithError(e);
    res.status(err.status).send(err);
  }
};


exports.getVehicles = async (req, res, next) => {
  try {
    const vehicleId = input.checkInputFormat('int', req.params.vehicleId);
    let data = {};
    if (vehicleId) {
      const query = await db.first('*').where('service_id', vehicleId)
              .from('service');
      if (query) {
        data = {
          "trip-id": null,
          "vehicle-id": query.service_id,
          "position": {
            "lat": query.service_latitude,
            "lng": query.service_longtitude
          },
          "current-stop-sequence": null,
          "stop-id": null,
          "current-status": null,
          "timestamp": Date.parse(query.service_last_update),
          "congestion-level": null,
          "occupancy-status": null
        }
      }
    }
    res.status(200).json(Response.responseWithSuccess(data));
  } catch (e) {
    const err = Response.responseWithError(e);
    res.status(err.status).send(err);
  }

}
