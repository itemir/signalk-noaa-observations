/*
 * Copyright 2022 Ilker Temir <ilker@ilkertemir.com>
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const request = require('request');
const observationsKey = 'observations.noaa';
userAgent = 'Signal K NOAA Observations Plugin';
const checkEveryNMinutes = 15;
const distanceLimit = 100;

module.exports = function(app) {
  var plugin = {};

  plugin.id = "noaa-observations";
  plugin.name = "NOAA Observations";
  plugin.description = "Publishes NOAA obversations to Signal K";

  plugin.start = function(options) {
    // Position data is not immediately available, delay it
    setTimeout( function() {
      checkAndPublishObservations();
    }, 5000);

    setInterval( function() {
      checkAndPublishObservations();
    }, checkEveryNMinutes * 60 * 1000);
  }

  plugin.stop =  function() {
  };

  plugin.schema = {
    type: 'object',
    required: [],
    properties: {
    }
  }

  function checkAndPublishObservations() {
    let position = app.getSelfPath('navigation.position');
    if (!position) {
      app.debug(JSON.stringify(position));
      return;
    }
    let lat = position.value.latitude;
    let lng = position.value.longitude;
    retrieveObservations(lat,lng);
  }

  function kilometersPerHourToMetersPerSecond (value) {
    if (value === null) {
      return null;
    } else {
      return value*0.2777777777777778;
    }
  }

  function degreesToRadians(value) {
    if (value === null) {
      return null;
    } else {
      return value*0.0174533;
    }
  }

  function celsiusToKelvin(value) {
    if (value === null) {
      return null;
    } else {
      return value + 273.15;
    }
  }

  function retrieveStationData(station) {
    let url=`${station.id}/observations/latest`;
    request.get({
      url: url,
      json: true,
      headers: {
        'User-Agent': userAgent,
      }
    }, function(error, response, data) {
      if (!error && response.statusCode == 200) {
        let timeStamp = data.properties.timestamp;
        let textDesc = data.properties.textDescription; 
        let temperature = data.properties.temperature.value;
        let windDirection = data.properties.windDirection.value;
        let windSpeed = data.properties.windSpeed.value;
        let windGust = data.properties.windGust.value;
        let pressure = data.properties.barometricPressure.value;
        let stationId = station.properties.stationIdentifier.toLowerCase();
	let values = [
	    {
	      path: `${observationsKey}.${stationId}.name`,
	      value: station.properties.name
	    },
	    {
	      path: `${observationsKey}.${stationId}.weatherText`,
	      value: textDesc
	    },
	    {
	      path: `${observationsKey}.${stationId}.date`,
	      value: timeStamp
	    },
	    {
	      path: `${observationsKey}.${stationId}.position`,
	      value: {
                longitude: data.geometry.coordinates[0],
                latitude: data.geometry.coordinates[1]
              }
	    },
	    {
	      path: `${observationsKey}.${stationId}.wind.speed`,
	      value: kilometersPerHourToMetersPerSecond(windSpeed)
	    },
	    {
	      path: `${observationsKey}.${stationId}.wind.gust`,
	      value: kilometersPerHourToMetersPerSecond(windGust)
	    },
	    {
	      path: `${observationsKey}.${stationId}.wind.direction`,
	      value: degreesToRadians(windDirection)
	    },
	    {
	      path: `${observationsKey}.${stationId}.temperature`,
	      value: celsiusToKelvin(temperature)
	    },
	    {
	      path: `${observationsKey}.${stationId}.pressure`,
	      value: pressure
	    }
	]
	app.handleMessage('signalk-noaa-observations', {
            updates: [
              {
                values: values
              }
            ]
        });
      } else {
        app.debug(`Error retrieving ${url}: ${JSON.stringify(response)}`);
      }
    });
  }

  function retrieveObservations(lat, lng) {
    let url=`https://api.weather.gov/points/${lat},${lng}/stations`;
    request.get({
      url: url,
      json: true,
      headers: {
        'User-Agent': userAgent,
      }
    }, function(error, response, data) {
      if (!error && response.statusCode == 200) {
        let stations = data.features;
        for (let i=0;i<stations.length;i++) {
          let station = stations[i];
          let stationLng = station.geometry.coordinates[0];
          let stationLat = station.geometry.coordinates[1];
          let distanceToStation = calculateDistance(lat, lng, stationLat, stationLng);
          if (distanceToStation <= distanceLimit) {
            app.debug(`Distance to ${station.properties.name} is ${distanceToStation} miles`);
            retrieveStationData(station);
          } else {
            //app.debug(`Station is ${station.properties.name} is out of configured limit`);
          }
        }
      } else {
        app.debug('Error retrieving stations ${JSON.stringify(response)}');
      }
    });
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    if ((lat1 == lat2) && (lon1 == lon2)) {
      return 0;
    }
    else {
      var radlat1 = Math.PI * lat1/180;
      var radlat2 = Math.PI * lat2/180;
      var theta = lon1-lon2;
      var radtheta = Math.PI * theta/180;
      var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
      if (dist > 1) {
          dist = 1;
      }
      dist = Math.acos(dist);
      dist = dist * 180/Math.PI;
      dist = dist * 60 * 1.1515;
      dist = dist * 0.8684; // Convert to Nautical miles
      return dist;
    }
  }

  return plugin;
}
